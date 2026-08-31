"""Persistencia local del device twin y de operaciones administrativas."""

from __future__ import annotations

import json
import sqlite3
from pathlib import Path
from typing import Any


PENDING_OPERATION_STATUSES = (
    "requested",
    "published",
    "ttn_queued",
    "ttn_sent",
    "lorawan_acknowledged",
)


SCHEMA = """
CREATE TABLE IF NOT EXISTS devices (
    device_id TEXT PRIMARY KEY,
    endpoint TEXT NOT NULL UNIQUE,
    dev_eui TEXT,
    last_seen TEXT NOT NULL,
    state_json TEXT NOT NULL,
    rssi INTEGER,
    snr REAL
);
CREATE TABLE IF NOT EXISTS operations (
    device_id TEXT NOT NULL,
    transaction_id INTEGER NOT NULL,
    resource_path TEXT NOT NULL,
    requested_value INTEGER NOT NULL,
    status TEXT NOT NULL,
    command_status INTEGER,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (device_id, transaction_id)
);
"""


class Store:
    def __init__(self, path: str | Path):
        self.path = str(path)
        with self._connect() as connection:
            connection.executescript(SCHEMA)

    def _connect(self) -> sqlite3.Connection:
        connection = sqlite3.connect(self.path, timeout=10)
        connection.row_factory = sqlite3.Row
        return connection

    def upsert_device(
        self,
        device_id: str,
        dev_eui: str | None,
        last_seen: str,
        state: dict[str, Any],
        rssi: int | None,
        snr: float | None,
    ) -> None:
        endpoint = f"smartcitynet-{device_id}"
        with self._connect() as connection:
            connection.execute(
                """
                INSERT INTO devices
                    (device_id, endpoint, dev_eui, last_seen, state_json, rssi, snr)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(device_id) DO UPDATE SET
                    endpoint=excluded.endpoint,
                    dev_eui=excluded.dev_eui,
                    last_seen=excluded.last_seen,
                    state_json=excluded.state_json,
                    rssi=excluded.rssi,
                    snr=excluded.snr
                """,
                (device_id, endpoint, dev_eui, last_seen, json.dumps(state), rssi, snr),
            )

    def list_devices(self) -> list[dict[str, Any]]:
        with self._connect() as connection:
            rows = connection.execute("SELECT * FROM devices ORDER BY device_id").fetchall()
        return [self._device_row(row) for row in rows]

    def get_device(self, device_id: str) -> dict[str, Any] | None:
        with self._connect() as connection:
            row = connection.execute(
                "SELECT * FROM devices WHERE device_id = ?", (device_id,)
            ).fetchone()
        return self._device_row(row) if row else None

    @staticmethod
    def _device_row(row: sqlite3.Row) -> dict[str, Any]:
        result = dict(row)
        result["state"] = json.loads(result.pop("state_json"))
        return result

    def next_transaction_id(self, device_id: str) -> int:
        with self._connect() as connection:
            row = connection.execute(
                "SELECT COALESCE(MAX(transaction_id), 0) AS value FROM operations WHERE device_id = ?",
                (device_id,),
            ).fetchone()
        return (int(row["value"]) % 255) + 1

    def create_operation(
        self, device_id: str, transaction_id: int, resource_path: str, value: int
    ) -> None:
        with self._connect() as connection:
            connection.execute(
                """
                INSERT OR REPLACE INTO operations
                    (device_id, transaction_id, resource_path, requested_value, status)
                VALUES (?, ?, ?, ?, 'requested')
                """,
                (device_id, transaction_id, resource_path, value),
            )

    def set_operation_status(
        self, device_id: str, transaction_id: int, status: str, command_status: int | None = None
    ) -> None:
        with self._connect() as connection:
            connection.execute(
                """
                UPDATE operations
                SET status = ?, command_status = ?, updated_at = CURRENT_TIMESTAMP
                WHERE device_id = ? AND transaction_id = ?
                """,
                (status, command_status, device_id, transaction_id),
            )

    def list_operations(self) -> list[dict[str, Any]]:
        with self._connect() as connection:
            rows = connection.execute(
                "SELECT * FROM operations ORDER BY created_at DESC, transaction_id DESC"
            ).fetchall()
        return [dict(row) for row in rows]

    def get_operation(self, device_id: str, transaction_id: int) -> dict[str, Any] | None:
        with self._connect() as connection:
            row = connection.execute(
                "SELECT * FROM operations WHERE device_id = ? AND transaction_id = ?",
                (device_id, transaction_id),
            ).fetchone()
        return dict(row) if row else None

    def get_latest_operation(self, device_id: str) -> dict[str, Any] | None:
        with self._connect() as connection:
            row = connection.execute(
                """
                SELECT * FROM operations
                WHERE device_id = ?
                ORDER BY created_at DESC, transaction_id DESC
                LIMIT 1
                """,
                (device_id,),
            ).fetchone()
        return dict(row) if row else None

    def expire_stale_operations(self, device_id: str, timeout_seconds: int) -> None:
        placeholders = ", ".join("?" for _ in PENDING_OPERATION_STATUSES)
        with self._connect() as connection:
            connection.execute(
                f"""
                UPDATE operations
                SET status = 'timed_out', updated_at = CURRENT_TIMESTAMP
                WHERE device_id = ?
                  AND status IN ({placeholders})
                  AND updated_at <= datetime('now', ?)
                """,
                (
                    device_id,
                    *PENDING_OPERATION_STATUSES,
                    f"-{int(timeout_seconds)} seconds",
                ),
            )
