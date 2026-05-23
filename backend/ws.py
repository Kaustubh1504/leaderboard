"""WebSocket broadcast — /ws/telemetry. Fire-and-forget to all clients."""

from __future__ import annotations

import logging
from typing import Set

from fastapi import WebSocket, WebSocketDisconnect

from .schemas import StatePayload

log = logging.getLogger("ws")

CLIENTS: Set[WebSocket] = set()


async def register(ws: WebSocket) -> None:
    await ws.accept()
    CLIENTS.add(ws)


def unregister(ws: WebSocket) -> None:
    CLIENTS.discard(ws)


async def broadcast(payload: StatePayload) -> None:
    if not CLIENTS:
        return
    msg = payload.model_dump_json()
    dead: list[WebSocket] = []
    for client in CLIENTS:
        try:
            await client.send_text(msg)
        except Exception:
            dead.append(client)
    for d in dead:
        CLIENTS.discard(d)


async def serve(ws: WebSocket) -> None:
    await register(ws)
    try:
        while True:
            # Receive loop keeps the socket alive; client never sends payloads.
            await ws.receive_text()
    except WebSocketDisconnect:
        pass
    finally:
        unregister(ws)
