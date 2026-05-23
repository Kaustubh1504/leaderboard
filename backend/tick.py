"""3-second async game loop. Hacker 3."""

from __future__ import annotations

import asyncio
import logging

from . import state, ws
from .agents import call_agent, call_chaos
from .schemas import AgentDecision, AgentId, ChaosEvent, Intent, Telemetry

log = logging.getLogger("tick")

TICK_SECONDS = 3
# Tick-loop Gemini budget. Anything longer falls back to seed.json so the
# 3-second broadcast cadence stays intact. REST endpoints use the longer
# default in agents.TIMEOUT_S since they exist to surface a live decision.
TICK_BUDGET_S = 2.4
CHAOS_QUEUE: asyncio.Queue[ChaosEvent] = asyncio.Queue()


async def queue_chaos(event: ChaosEvent) -> None:
    await CHAOS_QUEUE.put(event)


async def loop() -> None:
    """Main tick loop. Picks next agent, applies decision, broadcasts state."""
    rotation = [AgentId.HACKER_1, AgentId.HACKER_2, AgentId.HACKER_3, AgentId.HACKER_4]
    idx = 0

    loop_clock = asyncio.get_event_loop()
    while True:
        tick_start = loop_clock.time()
        try:
            if not CHAOS_QUEUE.empty():
                event = await CHAOS_QUEUE.get()
                await _apply_chaos(event)
            else:
                agent = rotation[idx % len(rotation)]
                idx += 1
                await _apply_agent(agent)

            state.bump_tick()
            await ws.broadcast(state.snapshot())
        except Exception:
            log.exception("tick loop error")

        # Keep cadence at exactly TICK_SECONDS even when a Gemini call eats
        # most of the budget — never let one slow tick drift the next one.
        elapsed = loop_clock.time() - tick_start
        await asyncio.sleep(max(0.0, TICK_SECONDS - elapsed))


async def _apply_agent(agent: AgentId) -> None:
    panic = agent in state.panic_targets()
    decision: AgentDecision = await call_agent(
        agent, state.STATE, panic=panic, timeout=TICK_BUDGET_S,
    )
    state.apply_impacts(decision.metric_impact)
    state.set_active(agent, source=agent)
    state.set_telemetry(
        Telemetry(
            sender=decision.sender,
            intent=decision.intent,
            target=decision.target,
            patch_size_kb=decision.patch_size_kb,
        )
    )


async def _apply_chaos(event: ChaosEvent) -> None:
    state.apply_impacts(event.metric_impact)
    state.set_active(event.target, source=AgentId.CHAOS)
    state.set_telemetry(
        Telemetry(
            sender=AgentId.CHAOS,
            intent="CHAOS",
            target=event.target,
            patch_size_kb=0,
        )
    )
