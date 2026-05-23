"""Integration tests for backend.tick — the H3 game loop.

These tests monkeypatch asyncio.sleep to zero so we can rip through many
ticks deterministically, then cancel the loop task.
"""

from __future__ import annotations

import asyncio
import json

import pytest

from backend import state, tick, ws
from backend.schemas import ChaosEvent, CorpId, MetricImpact

from tests._helpers import FakeWS


@pytest.fixture(autouse=True)
def _reset_everything():
    for row in state.STATE["leaderboard"].values():
        row.stock_value = 50
        row.cash_reserves = 50
        row.public_sentiment = 50
        row.market_share = 50
    state.STATE["tick"] = 0
    state.STATE["graph_edges"] = []
    state.STATE["last_telemetry"] = None
    state.STATE["chaos_multipliers"] = {}
    ws.CLIENTS.clear()
    while not tick.CHAOS_QUEUE.empty():
        tick.CHAOS_QUEUE.get_nowait()
    tick._inflight.clear()
    yield
    ws.CLIENTS.clear()
    tick._inflight.clear()


async def _run_loop(target_ticks: int) -> None:
    """Run tick.loop with zero-second sleeps for ~target_ticks iterations.

    Yields generously (10x target_ticks) so each tick has slack for its
    apply -> bump -> broadcast cycle to complete before cancellation.
    """
    original_sleep = asyncio.sleep

    async def fast_sleep(_seconds):
        await original_sleep(0)

    tick.asyncio.sleep = fast_sleep  # type: ignore[assignment]
    try:
        task = asyncio.create_task(tick.loop())
        for _ in range(target_ticks * 10):
            await original_sleep(0)
        task.cancel()
        try:
            await task
        except asyncio.CancelledError:
            pass
    finally:
        tick.asyncio.sleep = original_sleep  # type: ignore[assignment]


class TestTickLoop:
    async def test_tick_counter_advances(self):
        await _run_loop(3)
        assert state.STATE["tick"] >= 3

    async def test_broadcasts_to_subscribed_clients(self):
        client = FakeWS()
        await ws.register(client)
        sent_before_loop = len(client.sent)
        await _run_loop(4)
        # +N ticks broadcast on top of the initial register snapshot.
        assert len(client.sent) - sent_before_loop >= 3

    async def test_decay_is_invoked_every_tick(self, monkeypatch):
        calls = []
        original_decay = state.apply_decay

        def counting_decay():
            calls.append(1)
            original_decay()

        monkeypatch.setattr(state, "apply_decay", counting_decay)
        await _run_loop(4)
        # Loop calls apply_decay() exactly once per iteration.
        assert len(calls) >= 4

    async def test_chaos_event_jumps_the_queue(self):
        client = FakeWS()
        await ws.register(client)
        await tick.queue_chaos(
            ChaosEvent(
                name="Test Catastrophe",
                description="integration-test injection",
                target=CorpId.SHADOWSCALE,
                metric_impact=[
                    MetricImpact(target=CorpId.SHADOWSCALE, public_sentiment=-20)
                ],
            )
        )
        await _run_loop(1)
        # The chaos frame may be followed by normal-corp frames before the loop
        # is cancelled. Assert exactly one broadcast carried chaos telemetry.
        chaos_frames = [
            f for f in (json.loads(s) for s in client.sent)
            if f["last_telemetry"] and f["last_telemetry"]["sender"] == "Chaos_Operator"
        ]
        assert len(chaos_frames) == 1
        assert chaos_frames[0]["active_agent"] == "ShadowScale"

    async def test_loop_survives_internal_exceptions(self, monkeypatch):
        """A failing decision path must be logged, not crash the loop.

        The new tick loop pulls its synchronous-path decision from
        `tick.seed_decision` (the fire-and-forget Gemini result is consumed
        when ready, otherwise we fall back to seed). Patching seed_decision
        to raise puts the failure inside the loop's try block — the loop
        must catch it and keep iterating.
        """
        call_count = 0

        def boom(*_a, **_kw):
            nonlocal call_count
            call_count += 1
            raise RuntimeError("simulated decision failure")

        monkeypatch.setattr(tick, "seed_decision", boom)
        await _run_loop(3)
        # If the except clause weren't catching, call_count would be 1 and the
        # task would be dead. Multiple invocations proves the loop survived.
        assert call_count >= 2
