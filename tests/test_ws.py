"""Tests for backend.ws — initial snapshot on register + gather-based broadcast."""

from __future__ import annotations

import json

import pytest

from backend import state, ws

from tests._helpers import FakeWS


@pytest.fixture(autouse=True)
def _reset_ws_pool():
    ws.CLIENTS.clear()
    yield
    ws.CLIENTS.clear()


class TestRegister:
    async def test_accepts_the_socket(self):
        client = FakeWS()
        await ws.register(client)
        assert client.accepted

    async def test_adds_client_to_pool(self):
        client = FakeWS()
        await ws.register(client)
        assert client in ws.CLIENTS

    async def test_pushes_exactly_one_initial_frame(self):
        client = FakeWS()
        await ws.register(client)
        assert len(client.sent) == 1

    async def test_initial_frame_is_a_valid_state_payload(self):
        client = FakeWS()
        await ws.register(client)
        payload = json.loads(client.sent[0])
        assert {"tick", "active_agent", "leaderboard", "graph_edges"} <= payload.keys()
        assert isinstance(payload["leaderboard"], dict)

    async def test_initial_frame_reflects_current_state(self):
        state.STATE["tick"] = 7
        client = FakeWS()
        await ws.register(client)
        payload = json.loads(client.sent[0])
        assert payload["tick"] == 7


class TestBroadcast:
    async def test_no_clients_is_a_noop(self):
        # Should not raise with empty pool.
        await ws.broadcast(state.snapshot())

    async def test_sends_to_every_client_in_pool(self):
        a, b = FakeWS(), FakeWS()
        ws.CLIENTS.update({a, b})
        await ws.broadcast(state.snapshot())
        assert len(a.sent) == 1
        assert len(b.sent) == 1

    async def test_drops_only_the_dead_client(self):
        alive = FakeWS()
        dead = FakeWS(fail_on_send=True)
        ws.CLIENTS.update({alive, dead})
        await ws.broadcast(state.snapshot())
        assert alive in ws.CLIENTS
        assert dead not in ws.CLIENTS

    async def test_alive_client_still_gets_frame_when_other_fails(self):
        alive = FakeWS()
        dead = FakeWS(fail_on_send=True)
        ws.CLIENTS.update({alive, dead})
        await ws.broadcast(state.snapshot())
        assert len(alive.sent) == 1

    async def test_all_clients_failing_clears_the_pool(self):
        a = FakeWS(fail_on_send=True)
        b = FakeWS(fail_on_send=True)
        ws.CLIENTS.update({a, b})
        await ws.broadcast(state.snapshot())
        assert ws.CLIENTS == set()

    async def test_broadcast_payload_matches_input(self):
        client = FakeWS()
        ws.CLIENTS.add(client)
        snap = state.snapshot()
        await ws.broadcast(snap)
        assert json.loads(client.sent[0]) == json.loads(snap.model_dump_json())
