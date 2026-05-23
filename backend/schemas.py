"""Pydantic models — the contract between Gemini, the tick loop, and the frontend.

Every Gemini call uses structured output config bound to AgentDecision.
Anything not matching this shape is rejected and the seed fallback fires instead.
"""

from __future__ import annotations

from enum import Enum
from typing import Literal, Optional, Union

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
# Signed deltas bounded so one hallucinated Gemini call can't wreck the board.
DeltaInt = conint(ge=-50, le=50)


# --- Core models ---------------------------------------------------------- #

class MetricImpact(BaseModel):
    """Delta to apply to a target agent's leaderboard row. Values are signed."""
    target: AgentId
    velocity: DeltaInt = 0
    efficiency: DeltaInt = 0
    stability: DeltaInt = 0
    stress: DeltaInt = 0


class AgentDecision(BaseModel):
    """Structured output from a single Gemini call."""
    sender: AgentId
    intent: Intent
    target: AgentId
    # 500 chars: live Gemini occasionally overshoots 240, which throws away
    # the whole response. The frontend telemetry pane doesn't render reasoning
    # anyway, so the extra slack is free.
    reasoning: str = Field(..., max_length=500)
    patch_size_kb: int = Field(..., ge=0, le=2048)
    metric_impact: list[MetricImpact]


class ChaosEvent(BaseModel):
    """A catastrophe injected by the Chaos Agent."""
    name: str
    description: str = Field(..., max_length=500)
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
    intent: Union[Intent, Literal["CHAOS"]]
    target: AgentId
    patch_size_kb: int


class StatePayload(BaseModel):
    """The full state broadcast over /ws/telemetry on every tick."""
    tick: int
    active_agent: AgentId
    leaderboard: dict[str, HackerStats]
    graph_edges: list[GraphEdge]
    last_telemetry: Optional[Telemetry] = None
