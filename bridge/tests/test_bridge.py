import base64
import json
from pathlib import Path
import sqlite3
import tempfile
import unittest

from smartcitynet_bridge.app import Bridge, Config, PendingOperationError


class PublishResult:
    rc = 0


class FakeMqtt:
    def __init__(self):
        self.calls = []

    def publish(self, topic, payload, qos):
        self.calls.append((topic, json.loads(payload), qos))
        return PublishResult()


class BridgeTests(unittest.TestCase):
    def setUp(self):
        self.tempdir = tempfile.TemporaryDirectory()
        config = Config(
            mqtt_host="example.invalid",
            mqtt_port=8883,
            mqtt_username="smartcitynet@ttn",
            mqtt_password="secret",
            database_path=str(Path(self.tempdir.name) / "bridge.db"),
            http_host="127.0.0.1",
            http_port=8081,
        )
        self.bridge = Bridge(config)
        self.bridge.mqtt = FakeMqtt()

    def tearDown(self):
        self.tempdir.cleanup()

    def test_uplink_creates_device_twin_and_downlink_operation(self):
        binary = bytes.fromhex("01 01 01 00 00 0000002A 0000001E 0E74")
        event = {
            "end_device_ids": {
                "device_id": "vehiculo01",
                "dev_eui": "70B3D57ED0078C1F",
            },
            "received_at": "2026-08-19T12:00:00Z",
            "uplink_message": {
                "f_port": 10,
                "frm_payload": base64.b64encode(binary).decode(),
                "rx_metadata": [{"rssi": -88, "snr": 6.25}],
            },
        }
        self.bridge.handle_uplink(json.dumps(event).encode())

        device = self.bridge.store.get_device("vehiculo01")
        self.assertEqual(device["endpoint"], "smartcitynet-vehiculo01")
        self.assertEqual(device["state"]["transmission_interval_seconds"], 30)

        operation = self.bridge.set_transmission_interval("vehiculo01", 60)
        self.assertEqual(operation["status"], "published")
        topic, message, qos = self.bridge.mqtt.calls[0]
        self.assertEqual(topic, "v3/smartcitynet@ttn/devices/vehiculo01/down/replace")
        self.assertEqual(message["downlinks"][0]["f_port"], 11)
        self.assertEqual(qos, 0)

        event = {
            "end_device_ids": {"device_id": "vehiculo01"},
            "correlation_ids": ["smartcitynet:vehiculo01:1"],
        }
        self.bridge.handle_downlink_event(
            "v3/smartcitynet@ttn/devices/vehiculo01/down/queued",
            json.dumps(event).encode(),
        )
        self.assertEqual(self.bridge.store.list_operations()[0]["status"], "ttn_queued")

    def test_remote_alert_downlink(self):
        binary = bytes.fromhex("01 01 01 00 00 00000001 0000001E 0E74")
        event = {
            "end_device_ids": {"device_id": "vehiculo01", "dev_eui": "70B3"},
            "received_at": "2026-08-19T12:00:00Z",
            "uplink_message": {
                "f_port": 10,
                "frm_payload": base64.b64encode(binary).decode(),
                "rx_metadata": [],
            },
        }
        self.bridge.handle_uplink(json.dumps(event).encode())
        operation = self.bridge.set_remote_alert("vehiculo01", True)

        self.assertEqual(operation["resource_path"], "/32769/0/11")
        topic, message, _ = self.bridge.mqtt.calls[0]
        self.assertTrue(topic.endswith("/devices/vehiculo01/down/replace"))
        self.assertEqual(
            base64.b64decode(message["downlinks"][0]["frm_payload"]),
            bytes.fromhex("01 11 01 01"),
        )

        ack = bytes.fromhex("01 02 01 00 0000001E")
        event["uplink_message"]["frm_payload"] = base64.b64encode(ack).decode()
        self.bridge.handle_uplink(json.dumps(event).encode())
        device = self.bridge.store.get_device("vehiculo01")
        self.assertTrue(device["state"]["remote_alert_active"])
        self.assertEqual(self.bridge.store.list_operations()[0]["status"], "acknowledged")

    def test_vehicle_light_downlink(self):
        binary = bytes.fromhex("01 01 01 00 00 00000001 0000001E 0E74")
        event = {
            "end_device_ids": {"device_id": "vehiculo01", "dev_eui": "70B3"},
            "received_at": "2026-08-19T12:00:00Z",
            "uplink_message": {
                "f_port": 10,
                "frm_payload": base64.b64encode(binary).decode(),
                "rx_metadata": [],
            },
        }
        self.bridge.handle_uplink(json.dumps(event).encode())
        operation = self.bridge.set_vehicle_light("vehiculo01", "parking", True)

        self.assertEqual(operation["resource_path"], "/32769/0/25")
        _, message, _ = self.bridge.mqtt.calls[0]
        self.assertEqual(
            base64.b64decode(message["downlinks"][0]["frm_payload"]),
            bytes.fromhex("01 12 01 02 01"),
        )

        ack = bytes.fromhex("01 02 01 00 0000001E")
        event["uplink_message"]["frm_payload"] = base64.b64encode(ack).decode()
        self.bridge.handle_uplink(json.dumps(event).encode())
        device = self.bridge.store.get_device("vehiculo01")
        self.assertTrue(device["state"]["parking_lights_on"])
        self.assertEqual(self.bridge.store.list_operations()[0]["status"], "acknowledged")

    def test_rejects_a_second_command_while_latest_is_pending(self):
        binary = bytes.fromhex("01 01 01 00 00 00000001 0000001E 0E74")
        event = {
            "end_device_ids": {"device_id": "vehiculo01", "dev_eui": "70B3"},
            "received_at": "2026-08-19T12:00:00Z",
            "uplink_message": {
                "f_port": 10,
                "frm_payload": base64.b64encode(binary).decode(),
                "rx_metadata": [],
            },
        }
        self.bridge.handle_uplink(json.dumps(event).encode())
        first = self.bridge.set_vehicle_light("vehiculo01", "front", True)

        with self.assertRaises(PendingOperationError) as context:
            self.bridge.set_remote_alert("vehiculo01", True)

        self.assertEqual(context.exception.operation["transaction_id"], first["transaction_id"])
        self.assertEqual(len(self.bridge.mqtt.calls), 1)

        ack = bytes.fromhex("01 02 01 00 0000001E")
        event["uplink_message"]["frm_payload"] = base64.b64encode(ack).decode()
        self.bridge.handle_uplink(json.dumps(event).encode())
        second = self.bridge.set_remote_alert("vehiculo01", True)
        self.assertEqual(second["transaction_id"], 2)
        self.assertEqual(len(self.bridge.mqtt.calls), 2)

    def test_stale_pending_command_times_out_and_releases_next_command(self):
        binary = bytes.fromhex("01 01 01 00 00 00000001 0000001E 0E74")
        event = {
            "end_device_ids": {"device_id": "vehiculo01", "dev_eui": "70B3"},
            "received_at": "2026-08-19T12:00:00Z",
            "uplink_message": {
                "f_port": 10,
                "frm_payload": base64.b64encode(binary).decode(),
                "rx_metadata": [],
            },
        }
        self.bridge.handle_uplink(json.dumps(event).encode())
        first = self.bridge.set_vehicle_light("vehiculo01", "rear", True)
        with sqlite3.connect(self.bridge.config.database_path) as connection:
            connection.execute(
                """
                UPDATE operations
                SET updated_at = datetime('now', '-181 seconds')
                WHERE device_id = ? AND transaction_id = ?
                """,
                ("vehiculo01", first["transaction_id"]),
            )

        second = self.bridge.set_remote_alert("vehiculo01", True)

        self.assertEqual(second["transaction_id"], 2)
        self.assertEqual(
            self.bridge.store.get_operation("vehiculo01", first["transaction_id"])["status"],
            "timed_out",
        )


if __name__ == "__main__":
    unittest.main()
