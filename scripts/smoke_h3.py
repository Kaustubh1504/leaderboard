"""Smoke test for the H3 spec-gap changes.

Drives backend.state, backend.tick, backend.ws against fake WebSocket clients —
no uvicorn, no network. Verifies:

  1. apply_decay() drifts every corp each tick (cash_reserves / public_sentiment /
     market_share down by 1, stock_value untouched).
  2. ws.register() pushes an initial snapshot immediately on connect.
  3. ws.broadcast() uses gather() and prunes clients whose send_text raises.
  4. The tick loop runs end-to-end against the seed fallback without exceptions.

Run from repo root:
    .venv/Scripts/python -m scripts.smoke_h3
"""

from __future__ import annotations

import asyncio
import json
import sys

from backend import state, tick, ws
from backend.schemas import ChaosEvent, CorpId, MetricImpact


class FakeWS:
    """Stands in for a starlette WebSocket. Records what we'd send to a real client."""

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


def assert_eq(label: str, got, want) -> None:
    if got != want:
        print(f"FAIL {label}: got {got!r}, want {want!r}")
        sys.exit(1)
    print(f"  ok {label}: {got!r}")


def assert_true(label: str, cond: bool, detail: str = "") -> None:
    if not cond:
        print(f"FAIL {label}: {detail}")
        sys.exit(1)
    print(f"  ok {label}{(' ' + detail) if detail else ''}")


def _reset_leaderboard(value: int = 50) -> None:
    for row in state.STATE["leaderboard"].values():
        row.stock_value = value
        row.cash_reserves = value
        row.public_sentiment = value
        row.market_share = value
    state.STATE["chaos_multipliers"] = {}


async def test_decay() -> None:
    print("\n[1] apply_decay drifts every corp")
    _reset_leaderboard(50)

    state.apply_decay()
    for name, row in state.STATE["leaderboard"].items():
        assert_eq(f"{name}.cash_reserves", row.cash_reserves, 49)
        assert_eq(f"{name}.public_sentiment", row.public_sentiment, 49)
        assert_eq(f"{name}.market_share", row.market_share, 49)
        assert_eq(f"{name}.stock_value (untouched)", row.stock_value, 50)


async def test_decay_clamps() -> None:
    print("\n[2] apply_decay clamps decremented metrics at 0")
    nexus = state.STATE["leaderboard"]["NexusCorp"]
    nexus.cash_reserves = 0
    nexus.public_sentiment = 0
    nexus.market_share = 0
    state.apply_decay()
    assert_eq("cash_reserves clamped at 0", nexus.cash_reserves, 0)
    assert_eq("public_sentiment clamped at 0", nexus.public_sentiment, 0)
    assert_eq("market_share clamped at 0", nexus.market_share, 0)


async def test_ws_register_pushes_snapshot() -> None:
    print("\n[3] ws.register pushes initial snapshot")
    ws.CLIENTS.clear()
    client = FakeWS()
    await ws.register(client)

    assert_true("accept() called", client.accepted)
    assert_eq("CLIENTS contains client", client in ws.CLIENTS, True)
    assert_eq("exactly one frame sent on connect", len(client.sent), 1)

    payload = json.loads(client.sent[0])
    assert_true(
        "frame has expected keys",
        {"tick", "active_agent", "leaderboard", "graph_edges"} <= payload.keys(),
        f"keys={sorted(payload.keys())}",
    )


async def test_broadcast_gather_prunes_dead() -> None:
    print("\n[4] broadcast uses gather and prunes dead clients")
    ws.CLIENTS.clear()
    alive_a, alive_b = FakeWS(), FakeWS()
    dead = FakeWS(fail_on_send=True)
    for c in (alive_a, alive_b, dead):
        await c.accept()
        ws.CLIENTS.add(c)

    snap = state.snapshot()
    await ws.broadcast(snap)

    assert_eq("alive_a got frame", len(alive_a.sent), 1)
    assert_eq("alive_b got frame", len(alive_b.sent), 1)
    assert_eq("dead client dropped from pool", dead in ws.CLIENTS, False)
    assert_eq("alive clients still in pool", {alive_a, alive_b} <= ws.CLIENTS, True)


async def test_tick_loop_end_to_end() -> None:
    print("\n[5] tick loop runs end-to-end against seed fallback")
    _reset_leaderboard(50)
    ws.CLIENTS.clear()
    client = FakeWS()
    await ws.register(client)
    initial_frames = len(client.sent)

    # Patch the 3s sleep to 0 so we can rip through 5 ticks fast.
    original_sleep = asyncio.sleep

    async def fast_sleep(_seconds):
        await original_sleep(0)

    tick.asyncio.sleep = fast_sleep  # type: ignore[assignment]
    try:
        loop_task = asyncio.create_task(tick.loop())
        for _ in range(20):
            await original_sleep(0)
        loop_task.cancel()
        try:
            await loop_task
        except asyncio.CancelledError:
            pass
    finally:
        tick.asyncio.sleep = original_sleep  # type: ignore[assignment]

    new_frames = len(client.sent) - initial_frames
    assert_true(
        "client received multiple tick frames",
        new_frames >= 3,
        f"new_frames={new_frames}",
    )
    assert_true("tick counter advanced", state.STATE["tick"] >= 3, f"tick={state.STATE['tick']}")
    last = json.loads(client.sent[-1])
    assert_true(
        "last frame has last_telemetry populated",
        last["last_telemetry"] is not None,
        f"last_telemetry={last['last_telemetry']!r}",
    )


async def test_chaos_queue_path() -> None:
    print("\n[6] chaos queue path applies impacts on next tick")
    _reset_leaderboard(50)
    ws.CLIENTS.clear()
    client = FakeWS()
    await ws.register(client)

    # Snapshot a baseline metric for ShadowScale.
    target_before = state.STATE["leaderboard"]["ShadowScale"].public_sentiment

    event = ChaosEvent(
        name="Test Catastrophe",
        description="smoke-test injection",
        target=CorpId.SHADOWSCALE,
        metric_impact=[
            MetricImpact(target=CorpId.SHADOWSCALE, public_sentiment=-20),
        ],
    )
    await tick.queue_chaos(event)

    # Manually drive one tick iteration's worth of work (decay + chaos consumption).
    state.apply_decay()
    consumed = await tick.CHAOS_QUEUE.get()
    await tick._apply_chaos(consumed)
    state.bump_tick()
    await ws.broadcast(state.snapshot())

    target_after = state.STATE["leaderboard"]["ShadowScale"].public_sentiment
    # -1 decay, -20 chaos = -21 net (clamped at 0).
    expected = max(0, target_before - 21)
    assert_eq("ShadowScale.public_sentiment after chaos", target_after, expected)
    last = json.loads(client.sent[-1])
    assert_eq("last_telemetry.sender is Chaos_Operator", last["last_telemetry"]["sender"], "Chaos_Operator")
    assert_eq("active_agent moved to target", last["active_agent"], "ShadowScale")


async def main() -> None:
    print("=== H3 spec-gap smoke test ===")
    await test_decay()
    await test_decay_clamps()
    await test_ws_register_pushes_snapshot()
    await test_broadcast_gather_prunes_dead()
    await test_tick_loop_end_to_end()
    await test_chaos_queue_path()
    print("\nALL CHECKS PASSED")


if __name__ == "__main__":
    asyncio.run(main())
