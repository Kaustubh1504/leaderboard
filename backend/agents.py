"""Gemini agent layer (Hacker 2). Stub — wire up google-genai here."""

from __future__ import annotations

import json
import os
import random
from pathlib import Path

from .schemas import AgentDecision, AgentId, ChaosEvent

PROMPTS_DIR = Path(__file__).resolve().parent.parent / "prompts"
SEED_PATH = Path(__file__).resolve().parent.parent / "data" / "seed.json"

# TODO(hacker-2): replace stub with google-genai client + structured-output config.
# from google import genai
# client = genai.Client(api_key=os.environ["GEMINI_API_KEY"])


def _load_seed() -> dict:
    with SEED_PATH.open() as f:
        return json.load(f)


def load_persona(agent: AgentId) -> str:
    """Read the persona prompt for one of the four hacker agents."""
    path = PROMPTS_DIR / "hackers" / f"{agent.value.lower()}.md"
    if not path.exists():
        return ""
    return path.read_text()


async def call_agent(agent: AgentId, state_snapshot: dict, panic: bool = False) -> AgentDecision:
    """Ask Gemini for a structured decision; fall back to seed.json on failure.

    The seed fallback is load-bearing — see CLAUDE.md.
    """
    try:
        # TODO(hacker-2): real Gemini call with structured output config.
        raise NotImplementedError
    except Exception:
        return _seed_decision(agent)


async def call_chaos() -> ChaosEvent:
    try:
        # TODO(hacker-2): chaos prompt → Gemini → ChaosEvent.
        raise NotImplementedError
    except Exception:
        return _seed_chaos()


# --- Seed fallback -------------------------------------------------------- #

def _seed_decision(agent: AgentId) -> AgentDecision:
    seed = _load_seed()
    pool = [d for d in seed["decisions"] if d["sender"] == agent.value] or seed["decisions"]
    return AgentDecision.model_validate(random.choice(pool))


def _seed_chaos() -> ChaosEvent:
    seed = _load_seed()
    return ChaosEvent.model_validate(random.choice(seed["chaos_events"]))
