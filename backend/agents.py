"""Gemini agent layer (Hacker 2).

Owns: client init, structured-output config, persona injection, seed fallback.
The tick loop calls call_agent() and call_chaos() — both always return a valid
object. On any failure (no key, timeout, validation error) we drop to seed.json.
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
import random
from pathlib import Path
from typing import Optional

from pydantic import ValidationError

from . import history
from .schemas import AgentDecision, ChaosEvent, CorpId, PostmortemSummary

log = logging.getLogger("agents")

PROMPTS_DIR = Path(__file__).resolve().parent.parent / "prompts"
SEED_PATH = Path(__file__).resolve().parent.parent / "data" / "seed.json"

MODEL = os.getenv("GEMINI_MODEL", "gemini-2.5-flash")
# Default budget is generous — for the REST endpoints that exist to surface a
# real Gemini decision on demand. The tick loop runs Gemini calls in the
# background (see tick._kick_inflight) so its cadence is independent of latency.
TIMEOUT_S = float(os.getenv("GEMINI_TIMEOUT_S", "8.0"))

# Lazy client — None means seed-only mode (no API key, or import failed).
_client = None
_client_ready = False


def _get_client():
    global _client, _client_ready
    if _client_ready:
        return _client
    _client_ready = True

    key = os.getenv("GEMINI_API_KEY")
    if not key:
        log.warning("GEMINI_API_KEY unset — running in seed-only mode")
        return None
    try:
        from google import genai  # type: ignore
        _client = genai.Client(api_key=key)
    except Exception as e:
        log.warning("google-genai unavailable (%s) — seed-only mode", e)
        _client = None
    return _client


# --- Persona loading ----------------------------------------------------- #

def load_persona(corp: CorpId) -> str:
    path = PROMPTS_DIR / "corps" / f"{corp.value.lower()}.md"
    return path.read_text() if path.exists() else ""


def load_chaos_persona() -> str:
    path = PROMPTS_DIR / "chaos_operator.md"
    return path.read_text() if path.exists() else ""


def load_postmortem_persona() -> str:
    path = PROMPTS_DIR / "postmortem_analyst.md"
    return path.read_text() if path.exists() else ""


# --- Prompt builders ----------------------------------------------------- #

def _leaderboard_repr(state_snapshot: dict) -> str:
    lb = state_snapshot.get("leaderboard", {})
    flat = {
        name: (row.model_dump() if hasattr(row, "model_dump") else row)
        for name, row in lb.items()
    }
    return json.dumps(flat, indent=2)


def _agent_prompt(corp: CorpId, state_snapshot: dict, insolvency: bool) -> str:
    insolvency_line = (
        "\n!! INSOLVENCY ALERT: your cash_reserves < 15. Pick a survival action "
        "(defensive_pivot or a high-confidence acquire / narrative move). !!\n"
        if insolvency
        else ""
    )
    return (
        f"You are {corp.value}. Current tick: {state_snapshot.get('tick', 0)}.\n"
        f"Market leaderboard:\n{_leaderboard_repr(state_snapshot)}\n"
        f"{insolvency_line}"
        "Emit exactly one AgentDecision JSON object describing your next move."
    )


def _chaos_prompt(state_snapshot: dict, user_prompt: Optional[str] = None) -> str:
    framing = (
        "The Operator has injected a custom shock framing — your generated "
        f"ChaosEvent must match this framing:\n  >>> {user_prompt.strip()} <<<\n"
        if user_prompt
        else ""
    )
    return (
        f"{framing}"
        "Generate one fresh macroeconomic / regulatory / supply-chain shock. "
        "Pick whichever corporation on the current board makes the most dramatic "
        "target (typically the one leading on stock_value or market_share).\n"
        f"Market leaderboard:\n{_leaderboard_repr(state_snapshot)}\n"
        "Emit exactly one ChaosEvent JSON object."
    )


# --- Public API ---------------------------------------------------------- #

async def call_agent(
    corp: CorpId,
    state_snapshot: dict,
    insolvency: bool = False,
    timeout: Optional[float] = None,
) -> AgentDecision:
    client = _get_client()
    if client is None:
        return seed_decision(corp)

    try:
        from google.genai import types  # type: ignore

        response = await asyncio.wait_for(
            client.aio.models.generate_content(
                model=MODEL,
                contents=_agent_prompt(corp, state_snapshot, insolvency),
                config=types.GenerateContentConfig(
                    system_instruction=load_persona(corp),
                    response_mime_type="application/json",
                    response_schema=AgentDecision,
                    temperature=0.9,
                ),
            ),
            timeout=timeout if timeout is not None else TIMEOUT_S,
        )
        decision = _parse_decision(response)
        # Anti-spoof: Gemini occasionally signs decisions as the wrong corp.
        decision.sender = corp
        history.record_decision(decision)
        return decision
    except (asyncio.TimeoutError, ValidationError) as e:
        log.warning("call_agent fallback for %s: %s", corp.value, e)
    except Exception as e:
        log.warning("call_agent error for %s: %s", corp.value, e)
    return seed_decision(corp)


async def call_chaos(
    state_snapshot: Optional[dict] = None,
    user_prompt: Optional[str] = None,
    timeout: Optional[float] = None,
) -> ChaosEvent:
    """Generate a chaos event.

    user_prompt (≤ 240 chars) lets the Operator steer the framing — Gemini
    still binds output to the ChaosEvent schema, so the prompt can change
    *what kind of disaster* fires but never the shape. When Gemini isn't
    available, the seed fallback uses user_prompt as the event name so the
    demo still surfaces the Operator's framing.
    """
    client = _get_client()
    if client is None:
        return _seed_chaos_with_framing(user_prompt)

    try:
        from google.genai import types  # type: ignore

        response = await asyncio.wait_for(
            client.aio.models.generate_content(
                model=MODEL,
                contents=_chaos_prompt(state_snapshot or {}, user_prompt=user_prompt),
                config=types.GenerateContentConfig(
                    system_instruction=load_chaos_persona(),
                    response_mime_type="application/json",
                    response_schema=ChaosEvent,
                    temperature=1.0,
                ),
            ),
            timeout=timeout if timeout is not None else TIMEOUT_S,
        )
        event = _parse_chaos(response)
        history.record_chaos(event)
        return event
    except (asyncio.TimeoutError, ValidationError) as e:
        log.warning("call_chaos fallback: %s", e)
    except Exception as e:
        log.warning("call_chaos error: %s", e)
    return _seed_chaos_with_framing(user_prompt)


def _seed_chaos_with_framing(user_prompt: Optional[str]) -> ChaosEvent:
    """Pull a seed chaos event; if the Operator provided a framing, use it
    as the event name so the dashboard still reflects their intent."""
    event = _seed_chaos()
    if user_prompt:
        # ChaosEvent.name caps at 120; truncate defensively.
        event.name = user_prompt.strip()[:120]
    history.record_chaos(event)
    return event


# --- Response parsing ---------------------------------------------------- #

def _parse_decision(response) -> AgentDecision:
    parsed = getattr(response, "parsed", None)
    if isinstance(parsed, AgentDecision):
        return parsed
    return AgentDecision.model_validate_json(response.text)


def _parse_chaos(response) -> ChaosEvent:
    parsed = getattr(response, "parsed", None)
    if isinstance(parsed, ChaosEvent):
        return parsed
    return ChaosEvent.model_validate_json(response.text)


def _parse_summary(response) -> PostmortemSummary:
    parsed = getattr(response, "parsed", None)
    if isinstance(parsed, PostmortemSummary):
        return parsed
    return PostmortemSummary.model_validate_json(response.text)


# --- Post-mortem narrative ----------------------------------------------- #

def _summary_prompt(history_snap: dict, state_snapshot: dict) -> str:
    """Compact, schema-light dump of the run for the analyst to read."""
    decisions = history_snap.get("decisions", [])
    chaos = history_snap.get("chaos_events", [])

    def _d_repr(d):
        # Keep tokens lean — strip the parameters dict, just the verb arc
        return {
            "sender": d.sender.value if hasattr(d.sender, "value") else d.sender,
            "action": d.action.value if hasattr(d.action, "value") else d.action,
            "target": d.target.value if hasattr(d.target, "value") else d.target,
            "reason": d.reason,
            "confidence": d.confidence_score,
        }

    def _c_repr(e):
        return {"name": e.name, "target": e.target.value if hasattr(e.target, "value") else e.target}

    payload = {
        "decisions": [_d_repr(d) for d in decisions],
        "chaos_events": [_c_repr(e) for e in chaos],
        "final_leaderboard": _leaderboard_repr(state_snapshot),
        "tick": state_snapshot.get("tick", 0),
    }
    return (
        f"Decision history (chronological):\n{json.dumps(payload['decisions'], indent=2)}\n\n"
        f"Chaos events (chronological):\n{json.dumps(payload['chaos_events'], indent=2)}\n\n"
        f"Final leaderboard:\n{payload['final_leaderboard']}\n\n"
        f"Total ticks: {payload['tick']}\n\n"
        "Emit one PostmortemSummary JSON object."
    )


async def call_summary(
    state_snapshot: dict,
    timeout: Optional[float] = None,
) -> PostmortemSummary:
    """Generate the post-mortem narrative from the recorded history.

    Schema-bound — Gemini cannot return prose outside PostmortemSummary.
    Falls back to a templated summary built from the same history when
    Gemini is unavailable.
    """
    history_snap = history.snapshot()
    client = _get_client()
    if client is None:
        return _seed_summary(history_snap, state_snapshot)

    try:
        from google.genai import types  # type: ignore

        response = await asyncio.wait_for(
            client.aio.models.generate_content(
                model=MODEL,
                contents=_summary_prompt(history_snap, state_snapshot),
                config=types.GenerateContentConfig(
                    system_instruction=load_postmortem_persona(),
                    response_mime_type="application/json",
                    response_schema=PostmortemSummary,
                    temperature=0.7,
                ),
            ),
            timeout=timeout if timeout is not None else TIMEOUT_S,
        )
        return _parse_summary(response)
    except (asyncio.TimeoutError, ValidationError) as e:
        log.warning("call_summary fallback: %s", e)
    except Exception as e:
        log.warning("call_summary error: %s", e)
    return _seed_summary(history_snap, state_snapshot)


def _seed_summary(history_snap: dict, state_snapshot: dict) -> PostmortemSummary:
    """Templated post-mortem built from the history alone — no Gemini needed.

    Used when no API key is configured or every Gemini attempt fails. The
    output is uglier than the real analyst voice but every field is
    schema-valid so the dashboard renders the same shape either way.
    """
    from collections import Counter
    from .schemas import Action, CorpStrategySummary

    decisions = history_snap.get("decisions", [])
    chaos = history_snap.get("chaos_events", [])
    leaderboard = state_snapshot.get("leaderboard", {})

    # Build per-corp summary in standing order (highest stock_value first).
    def _stock(corp_name: str) -> int:
        row = leaderboard.get(corp_name)
        if row is None:
            return 0
        return row.stock_value if hasattr(row, "stock_value") else int(row.get("stock_value", 0))

    corps = []
    for corp in (CorpId.NEXUSCORP, CorpId.VERTEXAI, CorpId.SHADOWSCALE):
        corp_decisions = [d for d in decisions if d.sender == corp]
        if not corp_decisions:
            continue
        counts = Counter(d.action.value for d in corp_decisions)
        dominant = counts.most_common(1)[0][0]
        recent = corp_decisions[-3:]
        moves = [f"{d.action.value} → {d.target.value}" for d in recent]
        stock = _stock(corp.value)
        standing = (
            "ascendant" if stock >= 130
            else "stable" if stock >= 80
            else "declining" if stock >= 40
            else "collapsing"
        )
        corps.append(CorpStrategySummary(
            corp=corp,
            headline=f"{corp.value} ran a {dominant.replace('_', ' ')} playbook ({len(corp_decisions)} moves).",
            dominant_action=Action(dominant),
            key_moves=moves,
            standing=standing,
        ))

    corps.sort(key=lambda c: -_stock(c.corp.value))

    leader = corps[0].corp.value if corps else "no corp"
    return PostmortemSummary(
        headline=f"{leader} leads after {len(decisions)} decisions and {len(chaos)} chaos events.",
        summary=(
            f"The simulation ran for {state_snapshot.get('tick', 0)} ticks. "
            f"{len(chaos)} chaos events fired. "
            f"{leader} ended on top of the board. "
            "(Templated summary — Gemini analyst was unavailable.)"
        )[:800],
        corps=corps,
        chaos_count=len(chaos),
        most_dramatic_chaos=chaos[-1].name if chaos else None,
        total_ticks_analyzed=state_snapshot.get("tick", 0),
    )


# --- Liveness check (used by tick loop fire-and-forget pattern) ---------- #

def is_live() -> bool:
    """True if a real Gemini client is ready. False = seed-only mode."""
    return _get_client() is not None


# --- Seed fallback (load-bearing — see CLAUDE.md) ------------------------ #

def _load_seed() -> dict:
    with SEED_PATH.open() as f:
        return json.load(f)


def seed_decision(corp: CorpId) -> AgentDecision:
    """Public alias — the tick loop uses this every tick as the fast path."""
    decision = _seed_decision(corp)
    history.record_decision(decision)
    return decision


def seed_chaos() -> ChaosEvent:
    """Public alias — fallback for when Gemini chaos generation fails."""
    event = _seed_chaos()
    history.record_chaos(event)
    return event


def _seed_decision(corp: CorpId) -> AgentDecision:
    seed = _load_seed()
    pool = [d for d in seed["decisions"] if d["sender"] == corp.value] or seed["decisions"]
    return AgentDecision.model_validate(random.choice(pool))


def _seed_chaos() -> ChaosEvent:
    seed = _load_seed()
    return ChaosEvent.model_validate(random.choice(seed["chaos_events"]))
