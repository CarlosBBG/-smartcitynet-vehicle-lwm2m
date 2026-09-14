"""Servicio MQTT/HTTP que adapta TTN al modelo administrativo SmartCityNet."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
import logging
import os
from pathlib import Path
from threading import Thread
from urllib.parse import urlparse

from .protocol import (
    CommandAck,
    DOWNLINK_PORT,
    ProtocolError,
    Telemetry,
    VehicleTelemetry,
    UPLINK_PORT,
    LIGHT_IDS,
    decode_uplink,
    encode_alert_command,
    encode_interval_command,
    encode_light_command,
)
from .storage import PENDING_OPERATION_STATUSES, Store
from .ttn import build_downlink_message, downlink_topic, parse_uplink_event


LOG = logging.getLogger("smartcitynet.bridge")
RESOURCE_TRANSMISSION_INTERVAL = "/32769/0/0"
RESOURCE_REMOTE_ALERT = "/32769/0/11"
LIGHT_RESOURCE_PATHS = {
    "front": "/32769/0/23",
    "rear": "/32769/0/24",
    "parking": "/32769/0/25",
    "left": "/32769/0/32",
    "right": "/32769/0/33",
}
LIGHT_STATE_KEYS = {
    "/32769/0/23": "front_light_on",
    "/32769/0/24": "rear_light_on",
    "/32769/0/25": "parking_lights_on",
    "/32769/0/32": "left_indicator_on",
    "/32769/0/33": "right_indicator_on",
}
COMMAND_TIMEOUT_SECONDS = 60


class PendingOperationError(RuntimeError):
    def __init__(self, operation: dict):
        super().__init__(
            "ya existe una operacion pendiente "
            f"(txId={operation['transaction_id']}, estado={operation['status']})"
        )
        self.operation = operation


@dataclass(frozen=True)
class Config:
    mqtt_host: str
    mqtt_port: int
    mqtt_username: str
    mqtt_password: str
    database_path: str
    http_host: str
    http_port: int

    @classmethod
    def from_env(cls) -> "Config":
        required = {
            "TTN_MQTT_HOST": os.getenv("TTN_MQTT_HOST"),
            "TTN_MQTT_USERNAME": os.getenv("TTN_MQTT_USERNAME"),
            "TTN_MQTT_PASSWORD": os.getenv("TTN_MQTT_PASSWORD"),
        }
        missing = [name for name, value in required.items() if not value]
        if missing:
            raise RuntimeError(f"faltan variables requeridas: {', '.join(missing)}")
        return cls(
            mqtt_host=required["TTN_MQTT_HOST"],  # type: ignore[arg-type]
            mqtt_port=int(os.getenv("TTN_MQTT_PORT", "8883")),
            mqtt_username=required["TTN_MQTT_USERNAME"],  # type: ignore[arg-type]
            mqtt_password=required["TTN_MQTT_PASSWORD"],  # type: ignore[arg-type]
            database_path=os.getenv("BRIDGE_DATABASE", "smartcitynet.db"),
            http_host=os.getenv("BRIDGE_HTTP_HOST", "127.0.0.1"),
            http_port=int(os.getenv("BRIDGE_HTTP_PORT", "8081")),
        )


class Bridge:
    def __init__(self, config: Config):
        self.config = config
        self.store = Store(config.database_path)
        self.mqtt = None

    def handle_uplink(self, raw_payload: bytes) -> None:
        event = parse_uplink_event(raw_payload)
        if event.f_port != UPLINK_PORT:
            LOG.debug("uplink de %s ignorado: FPort %s", event.device_id, event.f_port)
            return

        message = decode_uplink(event.payload)
        received_at = event.received_at or datetime.now(timezone.utc).isoformat()

        if isinstance(message, (Telemetry, VehicleTelemetry)):
            state = message.to_dict()
            if message.last_transaction_id:
                operation_status = (
                    "acknowledged" if message.last_command_status == 0 else "rejected"
                )
                self.store.set_operation_status(
                    event.device_id,
                    message.last_transaction_id,
                    operation_status,
                    message.last_command_status,
                )
            self.store.upsert_device(
                event.device_id,
                event.dev_eui,
                received_at,
                state,
                event.rssi,
                event.snr,
            )
            LOG.info(
                "telemetria %s: intervalo=%ss bateria=%smV",
                event.device_id,
                message.transmission_interval_seconds,
                message.battery_mv,
            )
            return

        if isinstance(message, CommandAck):
            status = "acknowledged" if message.status == 0 else "rejected"
            self.store.set_operation_status(
                event.device_id, message.transaction_id, status, message.status
            )
            current = self.store.get_device(event.device_id)
            state = current["state"] if current else {}
            operation = self.store.get_operation(event.device_id, message.transaction_id)
            state.update(
                {
                    "last_transaction_id": message.transaction_id,
                    "last_command_status": message.status,
                    "command_status_name": message.status_name,
                    "transmission_interval_seconds": message.transmission_interval_seconds,
                }
            )
            if operation and message.status == 0:
                if operation["resource_path"] == RESOURCE_REMOTE_ALERT:
                    state["remote_alert_active"] = bool(operation["requested_value"])
                light_state_key = LIGHT_STATE_KEYS.get(operation["resource_path"])
                if light_state_key:
                    requested = bool(operation["requested_value"])
                    state[light_state_key] = requested
                    if requested and operation["resource_path"] == "/32769/0/25":
                        state["left_indicator_on"] = False
                        state["right_indicator_on"] = False
                    elif requested and operation["resource_path"] == "/32769/0/32":
                        state["parking_lights_on"] = False
                        state["right_indicator_on"] = False
                    elif requested and operation["resource_path"] == "/32769/0/33":
                        state["parking_lights_on"] = False
                        state["left_indicator_on"] = False
            self.store.upsert_device(
                event.device_id,
                event.dev_eui,
                received_at,
                state,
                event.rssi,
                event.snr,
            )
            LOG.info("ACK %s txId=%s: %s", event.device_id, message.transaction_id, status)
            return


    def handle_downlink_event(self, topic: str, raw_payload: bytes) -> None:
        """Actualiza el estado intermedio informado por TTN.

        El ACK LoRaWAN solo confirma recepción de radio. La operación no se
        considera aplicada hasta recibir su ACK de aplicación desde la Heltec.
        """
        event_name = topic.rsplit("/", 1)[-1]
        status_by_event = {
            "queued": "ttn_queued",
            "sent": "ttn_sent",
            "ack": "lorawan_acknowledged",
            "nack": "lorawan_not_acknowledged",
            "failed": "ttn_failed",
        }
        if event_name not in status_by_event:
            return

        message = json.loads(raw_payload)
        device_id = message.get("end_device_ids", {}).get("device_id")
        correlation_ids = list(message.get("correlation_ids") or [])
        for key, value in message.items():
            if key.startswith("downlink_") and isinstance(value, dict):
                correlation_ids.extend(value.get("correlation_ids") or [])

        prefix = f"smartcitynet:{device_id}:"
        for correlation_id in correlation_ids:
            if device_id and correlation_id.startswith(prefix):
                transaction_id = int(correlation_id.removeprefix(prefix))
                self.store.set_operation_status(
                    device_id, transaction_id, status_by_event[event_name]
                )
                LOG.info(
                    "evento TTN %s txId=%s: %s",
                    device_id,
                    transaction_id,
                    status_by_event[event_name],
                )
                return

    def ensure_command_slot(self, device_id: str) -> None:
        self.store.expire_stale_operations(device_id, COMMAND_TIMEOUT_SECONDS)
        operation = self.store.get_latest_operation(device_id)
        if operation and operation["status"] in PENDING_OPERATION_STATUSES:
            raise PendingOperationError(operation)

    def set_transmission_interval(self, device_id: str, seconds: int) -> dict:
        if self.store.get_device(device_id) is None:
            raise KeyError(device_id)
        self.ensure_command_slot(device_id)
        transaction_id = self.store.next_transaction_id(device_id)
        payload = encode_interval_command(transaction_id, seconds)
        correlation_id = f"smartcitynet:{device_id}:{transaction_id}"
        topic = downlink_topic(self.config.mqtt_username, device_id)
        message = build_downlink_message(payload, DOWNLINK_PORT, correlation_id)

        self.store.create_operation(
            device_id, transaction_id, RESOURCE_TRANSMISSION_INTERVAL, seconds
        )
        result = self.mqtt.publish(topic, message, qos=0)
        if result.rc != 0:
            self.store.set_operation_status(device_id, transaction_id, "publish_failed")
            raise RuntimeError(f"MQTT publish fallo con codigo {result.rc}")
        self.store.set_operation_status(device_id, transaction_id, "published")
        return {
            "device_id": device_id,
            "transaction_id": transaction_id,
            "resource_path": RESOURCE_TRANSMISSION_INTERVAL,
            "requested_value": seconds,
            "status": "published",
        }

    def set_remote_alert(self, device_id: str, active: bool) -> dict:
        if self.store.get_device(device_id) is None:
            raise KeyError(device_id)
        self.ensure_command_slot(device_id)
        transaction_id = self.store.next_transaction_id(device_id)
        payload = encode_alert_command(transaction_id, active)
        correlation_id = f"smartcitynet:{device_id}:{transaction_id}"
        topic = downlink_topic(self.config.mqtt_username, device_id)
        message = build_downlink_message(payload, DOWNLINK_PORT, correlation_id)

        self.store.create_operation(
            device_id, transaction_id, RESOURCE_REMOTE_ALERT, int(active)
        )
        result = self.mqtt.publish(topic, message, qos=0)
        if result.rc != 0:
            self.store.set_operation_status(device_id, transaction_id, "publish_failed")
            raise RuntimeError(f"MQTT publish fallo con codigo {result.rc}")
        self.store.set_operation_status(device_id, transaction_id, "published")
        return {
            "device_id": device_id,
            "transaction_id": transaction_id,
            "resource_path": RESOURCE_REMOTE_ALERT,
            "requested_value": active,
            "status": "published",
        }

    def set_vehicle_light(self, device_id: str, light: str, active: bool) -> dict:
        if self.store.get_device(device_id) is None:
            raise KeyError(device_id)
        if light not in LIGHT_IDS:
            raise ValueError(f"luz no soportada: {light}")
        self.ensure_command_slot(device_id)
        transaction_id = self.store.next_transaction_id(device_id)
        payload = encode_light_command(transaction_id, LIGHT_IDS[light], active)
        correlation_id = f"smartcitynet:{device_id}:{transaction_id}"
        topic = downlink_topic(self.config.mqtt_username, device_id)
        message = build_downlink_message(payload, DOWNLINK_PORT, correlation_id)
        resource_path = LIGHT_RESOURCE_PATHS[light]

        self.store.create_operation(device_id, transaction_id, resource_path, int(active))
        result = self.mqtt.publish(topic, message, qos=0)
        if result.rc != 0:
            self.store.set_operation_status(device_id, transaction_id, "publish_failed")
            raise RuntimeError(f"MQTT publish fallo con codigo {result.rc}")
        self.store.set_operation_status(device_id, transaction_id, "published")
        return {
            "device_id": device_id,
            "transaction_id": transaction_id,
            "resource_path": resource_path,
            "requested_value": active,
            "status": "published",
        }

    def run(self) -> None:
        try:
            import paho.mqtt.client as mqtt
        except ImportError as error:
            raise RuntimeError("instale dependencias con: pip install -e .") from error

        self.mqtt = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2)
        self.mqtt.username_pw_set(
            self.config.mqtt_username, self.config.mqtt_password
        )
        self.mqtt.tls_set()

        def on_connect(client, userdata, flags, reason_code, properties):
            if reason_code != 0:
                LOG.error("conexion MQTT rechazada: %s", reason_code)
                return
            topic = f"v3/{self.config.mqtt_username}/devices/+/up"
            client.subscribe(topic, qos=0)
            LOG.info("suscrito a %s", topic)
            downlink_events = f"v3/{self.config.mqtt_username}/devices/+/down/#"
            client.subscribe(downlink_events, qos=0)
            LOG.info("suscrito a %s", downlink_events)

        def on_message(client, userdata, message):
            try:
                if message.topic.endswith("/up"):
                    self.handle_uplink(message.payload)
                elif "/down/" in message.topic:
                    self.handle_downlink_event(message.topic, message.payload)
            except Exception:
                LOG.exception("no se pudo procesar %s", message.topic)

        self.mqtt.on_connect = on_connect
        self.mqtt.on_message = on_message
        self.mqtt.connect(self.config.mqtt_host, self.config.mqtt_port, keepalive=60)

        api = ThreadingHTTPServer(
            (self.config.http_host, self.config.http_port),
            make_handler(self),
        )
        Thread(target=api.serve_forever, daemon=True).start()
        LOG.info("API local en http://%s:%s", self.config.http_host, self.config.http_port)
        self.mqtt.loop_forever()


def make_handler(bridge: Bridge):
    class Handler(BaseHTTPRequestHandler):
        def _json(self, status: HTTPStatus, data: object) -> None:
            body = json.dumps(data, ensure_ascii=False).encode("utf-8")
            self.send_response(status)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def do_GET(self):
            path = urlparse(self.path).path
            if path == "/health":
                self._json(HTTPStatus.OK, {"status": "ok"})
                return
            if path == "/devices":
                self._json(HTTPStatus.OK, bridge.store.list_devices())
                return
            if path == "/operations":
                for device in bridge.store.list_devices():
                    bridge.store.expire_stale_operations(
                        device["device_id"], COMMAND_TIMEOUT_SECONDS
                    )
                self._json(HTTPStatus.OK, bridge.store.list_operations())
                return
            if path.startswith("/devices/"):
                device_id = path.removeprefix("/devices/")
                device = bridge.store.get_device(device_id)
                self._json(HTTPStatus.OK, device) if device else self._json(
                    HTTPStatus.NOT_FOUND, {"error": "device_not_found"}
                )
                return
            self._json(HTTPStatus.NOT_FOUND, {"error": "not_found"})

        def do_POST(self):
            path = urlparse(self.path).path
            parts = path.strip("/").split("/")
            if len(parts) == 4 and parts[0] == "devices" and parts[2] == "lights":
                try:
                    length = int(self.headers.get("Content-Length", "0"))
                    data = json.loads(self.rfile.read(length) or b"{}")
                    if not isinstance(data.get("value"), bool):
                        raise ValueError("lights requiere un booleano true o false")
                    operation = bridge.set_vehicle_light(parts[1], parts[3], data["value"])
                    self._json(HTTPStatus.ACCEPTED, operation)
                except KeyError:
                    self._json(HTTPStatus.NOT_FOUND, {"error": "device_not_found"})
                except PendingOperationError as error:
                    self._json(
                        HTTPStatus.CONFLICT,
                        {"error": str(error), "operation": error.operation},
                    )
                except (ValueError, ProtocolError) as error:
                    self._json(HTTPStatus.BAD_REQUEST, {"error": str(error)})
                except Exception as error:
                    LOG.exception("fallo programando luz")
                    self._json(HTTPStatus.BAD_GATEWAY, {"error": str(error)})
                return
            if len(parts) != 3 or parts[0] != "devices" or parts[2] not in {
                "transmission-interval",
                "alert",
            }:
                self._json(HTTPStatus.NOT_FOUND, {"error": "not_found"})
                return
            try:
                length = int(self.headers.get("Content-Length", "0"))
                data = json.loads(self.rfile.read(length) or b"{}")
                if "value" not in data:
                    raise ValueError("falta el campo value")
                if parts[2] == "transmission-interval":
                    operation = bridge.set_transmission_interval(parts[1], int(data["value"]))
                else:
                    if not isinstance(data["value"], bool):
                        raise ValueError("alert requiere un booleano true o false")
                    operation = bridge.set_remote_alert(parts[1], data["value"])
                self._json(HTTPStatus.ACCEPTED, operation)
            except KeyError:
                self._json(HTTPStatus.NOT_FOUND, {"error": "device_not_found"})
            except PendingOperationError as error:
                self._json(
                    HTTPStatus.CONFLICT,
                    {"error": str(error), "operation": error.operation},
                )
            except (ValueError, ProtocolError) as error:
                self._json(HTTPStatus.BAD_REQUEST, {"error": str(error)})
            except Exception as error:
                LOG.exception("fallo programando downlink")
                self._json(HTTPStatus.BAD_GATEWAY, {"error": str(error)})

        def log_message(self, fmt, *args):
            LOG.debug("HTTP " + fmt, *args)

    return Handler


def main() -> None:
    logging.basicConfig(
        level=os.getenv("LOG_LEVEL", "INFO"),
        format="%(asctime)s %(levelname)s %(name)s %(message)s",
    )
    config = Config.from_env()
    Path(config.database_path).parent.mkdir(parents=True, exist_ok=True)
    Bridge(config).run()
