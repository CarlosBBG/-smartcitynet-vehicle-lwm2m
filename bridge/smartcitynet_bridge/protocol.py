"""Codec binario compacto entre la Heltec y el Bridge.

No es CoAP serializado. Es una capa de adaptacion diseñada para el limite de
payload y la comunicacion diferida de LoRaWAN Clase A. El Bridge traduce estos
mensajes al modelo administrativo LwM2M.
"""

from __future__ import annotations

from dataclasses import asdict, dataclass
import struct
from typing import Union


VERSION = 0x01
MSG_TELEMETRY = 0x01
MSG_COMMAND_ACK = 0x02
MSG_VEHICLE_TELEMETRY = 0x03
CMD_SET_TRANSMISSION_INTERVAL = 0x10
CMD_SET_REMOTE_ALERT = 0x11
CMD_SET_VEHICLE_LIGHT = 0x12

UPLINK_PORT = 10
DOWNLINK_PORT = 11
MIN_INTERVAL_SECONDS = 15
MAX_INTERVAL_SECONDS = 86_400

LIGHT_IDS = {
    "front": 0,
    "rear": 1,
    "parking": 2,
}

COMMAND_STATUS = {
    0: "applied",
    1: "invalid_format",
    2: "unsupported_command",
    3: "out_of_range",
}

MOVEMENT_NAMES = {
    0: "stopped",
    1: "forward",
    2: "backward",
    3: "left",
    4: "right",
    5: "forward_right",
    6: "backward_right",
    7: "forward_left",
    8: "backward_left",
}

EVENT_NAMES = {
    0: "collision",
    1: "obstacle",
    2: "rollover",
    3: "right_curve",
    4: "left_curve",
    5: "uphill",
    6: "downhill",
    7: "remote_alert",
}


class ProtocolError(ValueError):
    """El payload no pertenece al protocolo SmartCityNet o esta incompleto."""


@dataclass(frozen=True)
class Telemetry:
    flags: int
    last_transaction_id: int
    last_command_status: int
    uplink_counter: int
    transmission_interval_seconds: int
    battery_mv: int

    @property
    def command_status_name(self) -> str:
        return COMMAND_STATUS.get(self.last_command_status, "unknown")

    @property
    def battery_percent(self) -> int:
        # Aproximacion inicial para LiPo 1S; se calibrara con mediciones reales.
        return max(0, min(100, round((self.battery_mv - 3300) * 100 / 900)))

    def to_dict(self) -> dict:
        result = asdict(self)
        result["command_status_name"] = self.command_status_name
        result["battery_percent"] = self.battery_percent
        result["lorawan_session_active"] = bool(self.flags & 0x01)
        return result


@dataclass(frozen=True)
class CommandAck:
    transaction_id: int
    status: int
    transmission_interval_seconds: int

    @property
    def status_name(self) -> str:
        return COMMAND_STATUS.get(self.status, "unknown")

    def to_dict(self) -> dict:
        result = asdict(self)
        result["status_name"] = self.status_name
        return result


@dataclass(frozen=True)
class VehicleTelemetry:
    flags: int
    last_transaction_id: int
    last_command_status: int
    movement: int
    speed_percent: int
    front_distance_cm: int
    rear_distance_cm: int
    pitch_degrees: float
    roll_degrees: float
    temperature_c: float
    actuator_flags: int
    event_flags: int
    uplink_counter: int
    transmission_interval_seconds: int
    battery_mv: int

    @property
    def command_status_name(self) -> str:
        return COMMAND_STATUS.get(self.last_command_status, "unknown")

    @property
    def movement_name(self) -> str:
        return MOVEMENT_NAMES.get(self.movement, "unknown")

    @property
    def events(self) -> list[str]:
        return [name for bit, name in EVENT_NAMES.items() if self.event_flags & (1 << bit)]

    @property
    def event_summary(self) -> str:
        priority = (
            "remote_alert",
            "collision",
            "rollover",
            "obstacle",
            "right_curve",
            "left_curve",
            "uphill",
            "downhill",
        )
        active = set(self.events)
        return next((name for name in priority if name in active), "normal")

    @property
    def battery_percent(self) -> int:
        return max(0, min(100, round((self.battery_mv - 3300) * 100 / 900)))

    @property
    def remote_alert_active(self) -> bool:
        return bool(self.flags & 0x02)

    @property
    def mpu_available(self) -> bool:
        return bool(self.flags & 0x04)

    @property
    def front_light_on(self) -> bool:
        return bool(self.actuator_flags & (1 << 0))

    @property
    def parking_lights_on(self) -> bool:
        return bool(self.actuator_flags & (1 << 3))

    @property
    def rear_light_on(self) -> bool:
        return bool(self.actuator_flags & (1 << 4))

    def to_dict(self) -> dict:
        result = asdict(self)
        result.update(
            {
                "command_status_name": self.command_status_name,
                "movement_name": self.movement_name,
                "events": self.events,
                "event_summary": self.event_summary,
                "battery_percent": self.battery_percent,
                "lorawan_session_active": bool(self.flags & 0x01),
                "remote_alert_active": self.remote_alert_active,
                "mpu_available": self.mpu_available,
                "front_light_on": self.front_light_on,
                "rear_light_on": self.rear_light_on,
                "parking_lights_on": self.parking_lights_on,
            }
        )
        return result


Uplink = Union[Telemetry, VehicleTelemetry, CommandAck]


def decode_uplink(payload: bytes) -> Uplink:
    if len(payload) < 2:
        raise ProtocolError("payload demasiado corto")
    if payload[0] != VERSION:
        raise ProtocolError(f"version no soportada: {payload[0]}")

    message_type = payload[1]
    if message_type == MSG_TELEMETRY:
        if len(payload) != 15:
            raise ProtocolError("telemetria debe contener 15 bytes")
        _, _, flags, tx_id, status, counter, interval, battery_mv = struct.unpack(
            ">BBBBBIIH", payload
        )
        return Telemetry(flags, tx_id, status, counter, interval, battery_mv)

    if message_type == MSG_COMMAND_ACK:
        if len(payload) != 8:
            raise ProtocolError("ACK debe contener 8 bytes")
        _, _, tx_id, status, interval = struct.unpack(">BBBBI", payload)
        return CommandAck(tx_id, status, interval)

    if message_type == MSG_VEHICLE_TELEMETRY:
        if len(payload) != 27:
            raise ProtocolError("telemetria vehicular debe contener 27 bytes")
        checksum = 0
        for value in payload[5:20]:
            checksum ^= value
        if checksum != payload[20]:
            raise ProtocolError(
                f"checksum vehicular invalido: recibido 0x{payload[20]:02x}, calculado 0x{checksum:02x}"
            )
        (
            _,
            _,
            flags,
            tx_id,
            status,
            movement,
            speed,
            front_distance,
            rear_distance,
            pitch_tenths,
            roll_tenths,
            temperature_tenths,
            actuator_flags,
            event_flags,
            counter,
            _,
            interval,
            battery_mv,
        ) = struct.unpack(">BBBBBBBHHhhhBBBBIH", payload)
        return VehicleTelemetry(
            flags=flags,
            last_transaction_id=tx_id,
            last_command_status=status,
            movement=movement,
            speed_percent=speed,
            front_distance_cm=front_distance,
            rear_distance_cm=rear_distance,
            pitch_degrees=pitch_tenths / 10.0,
            roll_degrees=roll_tenths / 10.0,
            temperature_c=temperature_tenths / 10.0,
            actuator_flags=actuator_flags,
            event_flags=event_flags,
            uplink_counter=counter,
            transmission_interval_seconds=interval,
            battery_mv=battery_mv,
        )

    raise ProtocolError(f"tipo de uplink no soportado: 0x{message_type:02x}")


def encode_interval_command(transaction_id: int, interval_seconds: int) -> bytes:
    if not 0 <= transaction_id <= 255:
        raise ProtocolError("transaction_id debe estar entre 0 y 255")
    if not MIN_INTERVAL_SECONDS <= interval_seconds <= MAX_INTERVAL_SECONDS:
        raise ProtocolError(
            f"intervalo fuera de rango: {MIN_INTERVAL_SECONDS}..{MAX_INTERVAL_SECONDS} s"
        )
    return struct.pack(
        ">BBBI", VERSION, CMD_SET_TRANSMISSION_INTERVAL, transaction_id, interval_seconds
    )


def encode_alert_command(transaction_id: int, active: bool) -> bytes:
    if not 0 <= transaction_id <= 255:
        raise ProtocolError("transaction_id debe estar entre 0 y 255")
    return struct.pack(
        ">BBBB", VERSION, CMD_SET_REMOTE_ALERT, transaction_id, int(active)
    )


def encode_light_command(transaction_id: int, light_id: int, active: bool) -> bytes:
    if not 0 <= transaction_id <= 255:
        raise ProtocolError("transaction_id debe estar entre 0 y 255")
    if light_id not in LIGHT_IDS.values():
        raise ProtocolError("light_id debe ser 0 (frontal), 1 (trasera) o 2 (parqueo)")
    return struct.pack(
        ">BBBBB", VERSION, CMD_SET_VEHICLE_LIGHT, transaction_id, light_id, int(active)
    )
