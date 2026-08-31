import base64
import json
import unittest

from smartcitynet_bridge.ttn import build_downlink_message, parse_uplink_event


class TtnTests(unittest.TestCase):
    def test_parse_uplink(self):
        payload = bytes.fromhex("01 02 07 00 0000003C")
        event = parse_uplink_event(
            {
                "end_device_ids": {"device_id": "vehiculo01", "dev_eui": "70B3"},
                "received_at": "2026-08-19T12:00:00Z",
                "uplink_message": {
                    "f_port": 10,
                    "frm_payload": base64.b64encode(payload).decode(),
                    "rx_metadata": [{"rssi": -90, "snr": 7.5}],
                },
            }
        )
        self.assertEqual(event.device_id, "vehiculo01")
        self.assertEqual(event.payload, payload)
        self.assertEqual(event.rssi, -90)

    def test_build_downlink(self):
        raw = build_downlink_message(bytes.fromhex("0110070000003C"), 11, "tx-7")
        message = json.loads(raw)
        downlink = message["downlinks"][0]
        self.assertEqual(downlink["f_port"], 11)
        self.assertFalse(downlink["confirmed"])
        self.assertEqual(base64.b64decode(downlink["frm_payload"]), bytes.fromhex("0110070000003C"))


if __name__ == "__main__":
    unittest.main()
