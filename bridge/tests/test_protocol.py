import struct
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
        self.assertFalse(message.gps_available)
        self.assertIsNone(message.latitude)
        self.assertFalse(message.dht_available)
        self.assertIsNone(message.ambient_temperature_c)
        self.assertIsNone(message.ambient_humidity_percent)

    def test_decode_vehicle_telemetry_with_gps(self):
        legacy = bytes.fromhex(
            "01 03 0F 09 00 01 32 002A 0037 007B FFCE 00F5 01 82 05 17 0000001E 0F78"
        )
        coordinates = struct.pack(">ii", round(-0.1806532 * 10_000_000), round(-78.467834 * 10_000_000))
        gps_checksum = 0
        for value in coordinates:
            gps_checksum ^= value

        message = decode_uplink(legacy + coordinates + bytes([gps_checksum]))

        self.assertTrue(message.gps_available)
        self.assertAlmostEqual(message.latitude, -0.1806532, places=7)
        self.assertAlmostEqual(message.longitude, -78.467834, places=7)

    def test_decode_vehicle_telemetry_with_environment(self):
        legacy = bytes.fromhex(
            "01 03 1F 09 00 01 32 002A 0037 007B FFCE 00F5 01 82 05 17 0000001E 0F78"
        )
        coordinates = struct.pack(">ii", -1_806_532, -784_678_340)
        gps_checksum = 0
        for value in coordinates:
            gps_checksum ^= value
        environment = struct.pack(">hH", 234, 617)
        dht_checksum = 0
        for value in environment:
            dht_checksum ^= value

        message = decode_uplink(
            legacy
            + coordinates
            + bytes([gps_checksum])
            + environment
            + bytes([dht_checksum, 74])
        )

        self.assertTrue(message.dht_available)
        self.assertAlmostEqual(message.ambient_temperature_c, 23.4)
        self.assertAlmostEqual(message.ambient_humidity_percent, 61.7)
        self.assertEqual(message.battery_percent, 74)

    def test_decode_vehicle_telemetry_without_reported_battery_percent(self):
        payload = bytes.fromhex(
            "01 03 07 09 00 01 32 002A 0037 007B FFCE 00F5 01 82 05 17 0000001E 2E8C"
        )

        message = decode_uplink(payload)

        self.assertEqual(message.battery_mv, 11916)
        self.assertEqual(message.battery_percent, 76)

    def test_decode_vehicle_directional_indicators(self):
        payload = bytearray.fromhex(
            "01 03 07 09 00 01 32 002A 0037 007B FFCE 00F5 01 82 05 17 0000001E 0F78"
        )
        payload[17] = 0xC0
        payload[20] = 0
        for value in payload[5:20]:
            payload[20] ^= value

        message = decode_uplink(bytes(payload))

        self.assertTrue(message.left_indicator_on)
        self.assertTrue(message.right_indicator_on)

    def test_decode_vehicle_local_panic(self):
        payload = bytearray.fromhex(
            "01 03 07 09 00 01 32 002A 0037 007B FFCE 00F5 01 82 05 17 0000001E 0F78"
        )
        payload[2] |= 0x20

        message = decode_uplink(bytes(payload))

        self.assertTrue(message.local_panic_active)
        self.assertIn("local_panic", message.events)
        self.assertEqual(message.event_summary, "local_panic")
        self.assertTrue(message.to_dict()["local_panic_active"])

    def test_reject_vehicle_bad_gps_checksum(self):
        legacy = bytes.fromhex(
            "01 03 0F 09 00 01 32 002A 0037 007B FFCE 00F5 01 82 05 17 0000001E 0F78"
        )
        coordinates = struct.pack(">ii", -1_806_532, -784_678_340)
        with self.assertRaises(ProtocolError):
            decode_uplink(legacy + coordinates + b"\x00")

    def test_reject_vehicle_bad_dht_checksum(self):
        legacy = bytes.fromhex(
            "01 03 1F 09 00 01 32 002A 0037 007B FFCE 00F5 01 82 05 17 0000001E 0F78"
        )
        coordinates = struct.pack(">ii", -1_806_532, -784_678_340)
        gps_checksum = 0
        for value in coordinates:
            gps_checksum ^= value
        environment = struct.pack(">hH", 234, 617)

        with self.assertRaises(ProtocolError):
            decode_uplink(legacy + coordinates + bytes([gps_checksum]) + environment + b"\x00")

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
        self.assertEqual(
            encode_light_command(11, 3, True),
            bytes.fromhex("01 12 0B 03 01"),
        )
        self.assertEqual(
            encode_light_command(12, 4, False),
            bytes.fromhex("01 12 0C 04 00"),
        )

    def test_reject_unknown_light(self):
        with self.assertRaises(ProtocolError):
            encode_light_command(10, 5, True)


if __name__ == "__main__":
    unittest.main()
