"""3-second async game loop. Hacker 3.

Fire-and-forget Gemini pattern: each tick uses seed for the fast path, while
a background task asks Gemini for the next decision per corp. Whichever
Gemini result is ready by the corp's next turn gets applied; the simulation
never blocks on a slow LLM call, and no API calls are wasted timing out.

Demo mode (DEMO_MODE=1): the loop schedules chaos injections to the live
demo timeline (see CLAUDE.md "Demo Run-Loop").
"""

from __future__ import annotations

import asyncio
import logging
import os
from typing import Dict

from . import state, ws
from .agents import call_agent, call_chaos, is_live, seed_decision
from .schemas import AgentDecision, ChaosEvent, CorpId, Telemetry

log = logging.getLogger("tick")

TICK_SECONDS = 3
# Background Gemini calls get a generous budget; the tick loop never awaits
# them directly so the 3-second cadence is decoupled from LLM latency.
BG_BUDGET_S = 15.0
CHAOS_QUEUE: asyncio.Queue[ChaosEvent] = asyncio.Queue()

# At most one in-flight Gemini call per corp. Result is consumed on the
# corp's next turn and a fresh call kicked off.
_inflight: Dict[CorpId, "asyncio.Task[AgentDecision]"] = {}

# Demo timeline — seconds from server start when chaos should auto-fire.
# Matches CLAUDE.md "Demo Run-Loop": baseline 0:00-0:45, shock at 0:45, panic
# escalates at 1:15, freeze begins at 2:30.
DEMO_MODE = os.getenv("DEMO_MODE", "").lower() in ("1", "true", "yes")
DEMO_CHAOS_AT_S = [45, 75, 150]


async def queue_chaos(event: ChaosEvent) -> None:
    await CHAOS_QUEUE.put(event)


async def loop() -> None:
    """Main tick loop. Picks next corp, applies decision, broadcasts state."""
    rotation = [CorpId.GOOGLE, CorpId.OPENAI, CorpId.ANTHROPIC]
    idx = 0

    if DEMO_MODE:
        asyncio.create_task(_demo_chaos_scheduler())

    loop_clock = asyncio.get_event_loop()
    while True:
        tick_start = loop_clock.time()
        try:
            # Age out any chaos debuffs first so this tick's decision is
            # scaled against the freshly-decremented multiplier set, then
            # apply passive drift so the corp's metric_impact visibly
            # counteracts it on the dashboard.
            state.tick_multipliers()
            state.apply_decay()

            if not CHAOS_QUEUE.empty():
                event = await CHAOS_QUEUE.get()
                await _apply_chaos(event)
            else:
                corp = rotation[idx % len(rotation)]
                idx += 1
                await _apply_corp(corp)

            state.bump_tick()
            await ws.broadcast(state.snapshot())
        except Exception:
            log.exception("tick loop error")

        # Keep cadence at exactly TICK_SECONDS even when state work runs long
        # — never let one slow tick drift the next one.
        elapsed = loop_clock.time() - tick_start
        await asyncio.sleep(max(0.0, TICK_SECONDS - elapsed))


async def _apply_corp(corp: CorpId) -> None:
    insolvency = corp in state.insolvency_targets()
    decision = _consume_inflight(corp) or seed_decision(corp)
    _kick_inflight(corp, insolvency)

    state.apply_impacts(decision.metric_impact)
    state.set_active(corp, source=corp)
    state.set_telemetry(
        Telemetry(
            sender=decision.sender,
            action=decision.action,
            target=decision.target,
            reason=decision.reason,
            confidence_score=decision.confidence_score,
            parameters=decision.parameters,
            radio_blurb=decision.radio_blurb,
        )
    )


def _consume_inflight(corp: CorpId):
    """Return a completed Gemini decision if one is ready, else None."""
    task = _inflight.get(corp)
    if not task or not task.done():
        return None
    _inflight.pop(corp, None)
    try:
        return task.result()
    except Exception as e:
        log.warning("inflight gemini failed for %s: %s", corp.value, e)
        return None


def _kick_inflight(corp: CorpId, insolvency: bool) -> None:
    """Start a fresh background Gemini call if none in flight and live."""
    if corp in _inflight or not is_live():
        return
    _inflight[corp] = asyncio.create_task(
        call_agent(corp, state.STATE, insolvency=insolvency, timeout=BG_BUDGET_S)
    )


async def _apply_chaos(event: ChaosEvent) -> None:
    # Chaos always lands at full force, regardless of any existing multiplier
    # on the target — the multiplier only dampens subsequent corp decisions.
    state.apply_impacts(event.metric_impact, scaled=False)
    state.add_multiplier(event.target, source=event.name)
    state.set_active(event.target, source=CorpId.CHAOS)
    state.set_telemetry(
        Telemetry(
            sender=CorpId.CHAOS,
            action="CHAOS",
            target=event.target,
            reason=event.name,
            confidence_score=1.0,
            parameters={"description": event.description},
            radio_blurb=event.radio_blurb,
        )
    )


async def _demo_chaos_scheduler() -> None:
    """Auto-fire chaos at the scripted demo timeline seconds."""
    start = asyncio.get_event_loop().time()
    for fire_at in DEMO_CHAOS_AT_S:
        delay = fire_at - (asyncio.get_event_loop().time() - start)
        if delay > 0:
            await asyncio.sleep(delay)
        try:
            event = await call_chaos(state.STATE)
            await queue_chaos(event)
            log.info("demo: queued chaos %r at +%ds", event.name, fire_at)
        except Exception:
            log.exception("demo chaos scheduler error at +%ds", fire_at)
