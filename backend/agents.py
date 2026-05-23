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

from .schemas import AgentDecision, AgentId, ChaosEvent

log = logging.getLogger("agents")

PROMPTS_DIR = Path(__file__).resolve().parent.parent / "prompts"
SEED_PATH = Path(__file__).resolve().parent.parent / "data" / "seed.json"

MODEL = os.getenv("GEMINI_MODEL", "gemini-2.5-flash")
# Default budget is generous — for the REST endpoints that exist to surface a
# real Gemini decision on demand. The tick loop passes its own tighter budget
# so the 3s cadence stays intact (see tick.TICK_BUDGET_S).
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

def load_persona(agent: AgentId) -> str:
    path = PROMPTS_DIR / "hackers" / f"{agent.value.lower()}.md"
    return path.read_text() if path.exists() else ""


def load_chaos_persona() -> str:
    path = PROMPTS_DIR / "chaos_agent.md"
    return path.read_text() if path.exists() else ""


# --- Prompt builders ----------------------------------------------------- #

def _leaderboard_repr(state_snapshot: dict) -> str:
    lb = state_snapshot.get("leaderboard", {})
    flat = {
        name: (row.model_dump() if hasattr(row, "model_dump") else row)
        for name, row in lb.items()
    }
    return json.dumps(flat, indent=2)


def _agent_prompt(agent: AgentId, state_snapshot: dict, panic: bool) -> str:
    panic_line = (
        "\n!! EMERGENCY: your stability < 20. Choose a recovery action. !!\n"
        if panic
        else ""
    )
    return (
        f"You are {agent.value}. Current tick: {state_snapshot.get('tick', 0)}.\n"
        f"Leaderboard:\n{_leaderboard_repr(state_snapshot)}\n"
        f"{panic_line}"
        "Emit exactly one AgentDecision JSON object describing your next move."
    )


def _chaos_prompt(state_snapshot: dict) -> str:
    return (
        "Invent a fresh engineering disaster. Pick whichever hacker on the "
        f"current board makes the most dramatic target.\nLeaderboard:\n"
        f"{_leaderboard_repr(state_snapshot)}\n"
        "Emit exactly one ChaosEvent JSON object."
    )


# --- Public API ---------------------------------------------------------- #

async def call_agent(
    agent: AgentId,
    state_snapshot: dict,
    panic: bool = False,
    timeout: Optional[float] = None,
) -> AgentDecision:
    client = _get_client()
    if client is None:
        return _seed_decision(agent)

    try:
        from google.genai import types  # type: ignore

        response = await asyncio.wait_for(
            client.aio.models.generate_content(
                model=MODEL,
                contents=_agent_prompt(agent, state_snapshot, panic),
                config=types.GenerateContentConfig(
                    system_instruction=load_persona(agent),
                    response_mime_type="application/json",
                    response_schema=AgentDecision,
                    temperature=0.9,
                ),
            ),
            timeout=timeout if timeout is not None else TIMEOUT_S,
        )
        decision = _parse_decision(response)
        # Anti-spoof: Gemini occasionally signs decisions as the wrong agent.
        decision.sender = agent
        return decision
    except (asyncio.TimeoutError, ValidationError) as e:
        log.warning("call_agent fallback for %s: %s", agent.value, e)
    except Exception as e:
        log.warning("call_agent error for %s: %s", agent.value, e)
    return _seed_decision(agent)


async def call_chaos(
    state_snapshot: Optional[dict] = None,
    timeout: Optional[float] = None,
) -> ChaosEvent:
    client = _get_client()
    if client is None:
        return _seed_chaos()

    try:
        from google.genai import types  # type: ignore

        response = await asyncio.wait_for(
            client.aio.models.generate_content(
                model=MODEL,
                contents=_chaos_prompt(state_snapshot or {}),
                config=types.GenerateContentConfig(
                    system_instruction=load_chaos_persona(),
                    response_mime_type="application/json",
                    response_schema=ChaosEvent,
                    temperature=1.0,
                ),
            ),
            timeout=timeout if timeout is not None else TIMEOUT_S,
        )
        return _parse_chaos(response)
    except (asyncio.TimeoutError, ValidationError) as e:
        log.warning("call_chaos fallback: %s", e)
    except Exception as e:
        log.warning("call_chaos error: %s", e)
    return _seed_chaos()


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


# --- Liveness check (used by tick loop fire-and-forget pattern) ---------- #

def is_live() -> bool:
    """True if a real Gemini client is ready. False = seed-only mode."""
    return _get_client() is not None


# --- Seed fallback (load-bearing — see CLAUDE.md) ------------------------ #

def _load_seed() -> dict:
    with SEED_PATH.open() as f:
        return json.load(f)


def seed_decision(agent: AgentId) -> AgentDecision:
    """Public alias — the tick loop uses this every tick as the fast path."""
    return _seed_decision(agent)


def seed_chaos() -> ChaosEvent:
    """Public alias — fallback for when Gemini chaos generation fails."""
    return _seed_chaos()


def _seed_decision(agent: AgentId) -> AgentDecision:
    seed = _load_seed()
    pool = [d for d in seed["decisions"] if d["sender"] == agent.value] or seed["decisions"]
    return AgentDecision.model_validate(random.choice(pool))


def _seed_chaos() -> ChaosEvent:
    seed = _load_seed()
    return ChaosEvent.model_validate(random.choice(seed["chaos_events"]))
