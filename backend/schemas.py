"""Pydantic models — the contract between Gemini, the tick loop, and the frontend.

Every Gemini call uses structured output config bound to AgentDecision.
Anything not matching this shape is rejected and the seed fallback fires instead.
"""

from __future__ import annotations

from enum import Enum
from typing import Literal

from pydantic import BaseModel, Field, conint


# --- Enums ---------------------------------------------------------------- #

class Intent(str, Enum):
    OPTIMIZE_CODE = "OPTIMIZE_CODE"
    REDUCE_SCOPE = "REDUCE_SCOPE"
    SUPPORT_TEAMMATE = "SUPPORT_TEAMMATE"


class AgentId(str, Enum):
    HACKER_1 = "Hacker_1"
    HACKER_2 = "Hacker_2"
    HACKER_3 = "Hacker_3"
    HACKER_4 = "Hacker_4"
    CHAOS = "Chaos_Agent"


Metric = Literal["velocity", "efficiency", "stability", "stress"]
ClampedInt = conint(ge=0, le=100)


# --- Core models ---------------------------------------------------------- #

class MetricImpact(BaseModel):
    """Delta to apply to a target agent's leaderboard row. Values are signed."""
    target: AgentId
    velocity: int = 0
    efficiency: int = 0
    stability: int = 0
    stress: int = 0


class AgentDecision(BaseModel):
    """Structured output from a single Gemini call."""
    sender: AgentId
    intent: Intent
    target: AgentId
    reasoning: str = Field(..., max_length=240)
    patch_size_kb: int = Field(..., ge=0, le=2048)
    metric_impact: list[MetricImpact]


class ChaosEvent(BaseModel):
    """A catastrophe injected by the Chaos Agent."""
    name: str
    description: str = Field(..., max_length=240)
    target: AgentId
    metric_impact: list[MetricImpact]


# --- Leaderboard / state payload ----------------------------------------- #

class HackerStats(BaseModel):
    velocity: ClampedInt = 50
    efficiency: ClampedInt = 50
    stability: ClampedInt = 50
    stress: ClampedInt = 50


class GraphEdge(BaseModel):
    source: AgentId
    target: AgentId
    animated: bool = False


class Telemetry(BaseModel):
    sender: AgentId
    intent: Intent | Literal["CHAOS"]
    target: AgentId
    patch_size_kb: int


class StatePayload(BaseModel):
    """The full state broadcast over /ws/telemetry on every tick."""
    tick: int
    active_agent: AgentId
    leaderboard: dict[str, HackerStats]
    graph_edges: list[GraphEdge]
    last_telemetry: Telemetry | None = None
