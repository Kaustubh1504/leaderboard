"""Shared test helpers — kept out of conftest so they import cleanly."""

from __future__ import annotations


class FakeWS:
    """Stand-in for starlette.WebSocket. Records what we'd send to a real client."""

    def __init__(self, *, fail_on_send: bool = False) -> None:
        self.accepted = False
        self.sent: list[str] = []
        self.fail_on_send = fail_on_send

    async def accept(self) -> None:
        self.accepted = True

    async def send_text(self, msg: str) -> None:
        if self.fail_on_send:
            raise RuntimeError("simulated dead client")
        self.sent.append(msg)
