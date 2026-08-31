import unittest

from smartcitynet_bridge.protocol import (
    CommandAck,
    ProtocolError,
    Telemetry,
    VehicleTelemetry,
    decode_uplink,
    encode_alert_command,
    encode_interval_command,
    encode_light_command,
)


class ProtocolTests(unittest.TestCase):
    def test_decode_telemetry(self):
        payload = bytes.fromhex("01 01 01 07 00 0000002A 0000003C 0E74")
        message = decode_uplink(payload)
        self.assertIsInstance(message, Telemetry)
        self.assertEqual(message.uplink_counter, 42)
        self.assertEqual(message.transmission_interval_seconds, 60)
        self.assertEqual(message.battery_mv, 3700)
        self.assertEqual(message.last_transaction_id, 7)

    def test_decode_ack(self):
        message = decode_uplink(bytes.fromhex("01 02 07 00 0000003C"))
        self.assertIsInstance(message, CommandAck)
        self.assertEqual(message.transaction_id, 7)
        self.assertEqual(message.status_name, "applied")

    def test_encode_interval_command(self):
        self.assertEqual(
            encode_interval_command(7, 60),
            bytes.fromhex("01 10 07 0000003C"),
        )

    def test_reject_out_of_range_interval(self):
        with self.assertRaises(ProtocolError):
            encode_interval_command(1, 14)

    def test_decode_vehicle_telemetry(self):
        payload = bytes.fromhex(
            "01 03 07 09 00 01 32 002A 0037 007B FFCE 00F5 01 82 05 17 0000001E 0F78"
        )
        message = decode_uplink(payload)
        self.assertIsInstance(message, VehicleTelemetry)
        self.assertEqual(message.movement_name, "forward")
        self.assertEqual(message.front_distance_cm, 42)
        self.assertEqual(message.pitch_degrees, 12.3)
        self.assertTrue(message.remote_alert_active)
        self.assertEqual(message.event_summary, "remote_alert")
        self.assertTrue(message.front_light_on)
        self.assertFalse(message.rear_light_on)
        self.assertFalse(message.parking_lights_on)

    def test_reject_vehicle_bad_checksum(self):
        payload = bytes.fromhex(
            "01 03 07 09 00 01 32 002A 0037 007B FFCE 00F5 01 82 05 00 0000001E 0F78"
        )
        with self.assertRaises(ProtocolError):
            decode_uplink(payload)

    def test_encode_alert_command(self):
        self.assertEqual(encode_alert_command(9, True), bytes.fromhex("01 11 09 01"))

    def test_encode_light_command(self):
        self.assertEqual(
            encode_light_command(10, 2, True),
            bytes.fromhex("01 12 0A 02 01"),
        )

    def test_reject_unknown_light(self):
        with self.assertRaises(ProtocolError):
            encode_light_command(10, 3, True)


if __name__ == "__main__":
    unittest.main()
