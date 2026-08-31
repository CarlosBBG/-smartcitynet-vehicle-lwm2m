"""Transformaciones puras para eventos MQTT de The Things Stack."""

from __future__ import annotations

import base64
from dataclasses import dataclass
import json
from typing import Any


class TtnMessageError(ValueError):
    pass


@dataclass(frozen=True)
class UplinkEvent:
    device_id: str
    dev_eui: str | None
    f_port: int
    payload: bytes
    received_at: str | None
    rssi: int | None
    snr: float | None


def parse_uplink_event(raw: bytes | str | dict[str, Any]) -> UplinkEvent:
    try:
        message = json.loads(raw) if isinstance(raw, (bytes, str)) else raw
        ids = message["end_device_ids"]
        uplink = message["uplink_message"]
        metadata = uplink.get("rx_metadata") or []
        best = max(metadata, key=lambda item: item.get("rssi", -999), default={})
        return UplinkEvent(
            device_id=ids["device_id"],
            dev_eui=ids.get("dev_eui"),
            f_port=int(uplink["f_port"]),
            payload=base64.b64decode(uplink["frm_payload"], validate=True),
            received_at=message.get("received_at"),
            rssi=best.get("rssi"),
            snr=best.get("snr"),
        )
    except (KeyError, TypeError, ValueError, json.JSONDecodeError) as error:
        raise TtnMessageError(f"evento uplink TTN invalido: {error}") from error


def downlink_topic(ttn_username: str, device_id: str) -> str:
    # Una solicitud administrativa nueva sustituye a la anterior para no
    # acumular comandos obsoletos en un dispositivo Clase A.
    return f"v3/{ttn_username}/devices/{device_id}/down/replace"


def build_downlink_message(payload: bytes, f_port: int, correlation_id: str) -> str:
    if not 1 <= f_port <= 233:
        raise TtnMessageError("TTN exige un FPort entre 1 y 233")
    message = {
        "downlinks": [
            {
                "f_port": f_port,
                "frm_payload": base64.b64encode(payload).decode("ascii"),
                "priority": "NORMAL",
                # La confirmacion definitiva es el ACK de aplicacion que
                # contiene txId, estado e intervalo aplicado. Evitamos el ACK
                # MAC para que TTN no monopolice RX1/RX2 con ocho reintentos.
                "confirmed": False,
                "correlation_ids": [correlation_id],
            }
        ]
    }
    return json.dumps(message, separators=(",", ":"))
