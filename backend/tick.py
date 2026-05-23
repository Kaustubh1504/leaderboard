"""3-second async game loop. Hacker 3.

Fire-and-forget Gemini pattern: each tick uses seed for the fast path, while
a background task asks Gemini for the next decision per agent. Whichever
Gemini result is ready by the agent's next turn gets applied; the simulation
never blocks on a slow LLM call, and no API calls are wasted timing out.
"""

from __future__ import annotations

import asyncio
import logging
from typing import Dict

from . import state, ws
from .agents import call_agent, is_live, seed_decision
from .schemas import AgentDecision, AgentId, ChaosEvent, Telemetry

log = logging.getLogger("tick")

TICK_SECONDS = 3
# Background Gemini calls get a generous budget; the tick loop never awaits
# them directly so the 3-second cadence is decoupled from LLM latency.
BG_BUDGET_S = 15.0
CHAOS_QUEUE: asyncio.Queue[ChaosEvent] = asyncio.Queue()

# At most one in-flight Gemini call per agent. Result is consumed on the
# agent's next turn and a fresh call kicked off.
_inflight: Dict[AgentId, "asyncio.Task[AgentDecision]"] = {}


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
    decision = _consume_inflight(agent) or seed_decision(agent)
    _kick_inflight(agent, panic)

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


def _consume_inflight(agent: AgentId):
    """Return a completed Gemini decision if one is ready, else None."""
    task = _inflight.get(agent)
    if not task or not task.done():
        return None
    _inflight.pop(agent, None)
    try:
        return task.result()
    except Exception as e:
        log.warning("inflight gemini failed for %s: %s", agent.value, e)
        return None


def _kick_inflight(agent: AgentId, panic: bool) -> None:
    """Start a fresh background Gemini call if none in flight and live."""
    if agent in _inflight or not is_live():
        return
    _inflight[agent] = asyncio.create_task(
        call_agent(agent, state.STATE, panic=panic, timeout=BG_BUDGET_S)
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
