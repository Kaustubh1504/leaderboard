"""WebSocket broadcast — /ws/telemetry. Fire-and-forget to all clients."""

from __future__ import annotations

import asyncio
import logging
from typing import Set

from fastapi import WebSocket, WebSocketDisconnect

from .schemas import StatePayload

log = logging.getLogger("ws")

CLIENTS: Set[WebSocket] = set()


async def register(ws: WebSocket) -> None:
    await ws.accept()
    CLIENTS.add(ws)
    # Local import avoids a state <-> ws module cycle at load time.
    from . import state
    await ws.send_text(state.snapshot().model_dump_json())


def unregister(ws: WebSocket) -> None:
    CLIENTS.discard(ws)


async def broadcast(payload: StatePayload) -> None:
    if not CLIENTS:
        return
    msg = payload.model_dump_json()
    clients = list(CLIENTS)
    results = await asyncio.gather(
        *(c.send_text(msg) for c in clients),
        return_exceptions=True,
    )
    for client, result in zip(clients, results):
        if isinstance(result, Exception):
            CLIENTS.discard(client)


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
