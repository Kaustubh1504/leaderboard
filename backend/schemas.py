"""Pydantic models — the contract between Gemini, the tick loop, and the frontend.

Every Gemini call uses structured output config bound to AgentDecision.
Anything not matching this shape is rejected and the seed fallback fires instead.
"""

from __future__ import annotations

from enum import Enum
from typing import Any, Dict, Literal, Optional, Union

from pydantic import BaseModel, Field, conint


# --- Enums ---------------------------------------------------------------- #

class Action(str, Enum):
    PREDATORY_PRICING = "predatory_pricing"
    ACQUIRE_COMPETITOR = "acquire_competitor"
    NARRATIVE_CAMPAIGN = "narrative_campaign"
    DEFENSIVE_PIVOT = "defensive_pivot"
    RD_INVESTMENT = "rd_investment"
    ESPIONAGE = "espionage"


class CorpId(str, Enum):
    NEXUSCORP = "NexusCorp"
    VERTEXAI = "VertexAI"
    SHADOWSCALE = "ShadowScale"
    CHAOS = "Chaos_Operator"


Metric = Literal["stock_value", "cash_reserves", "public_sentiment", "market_share"]
# Signed deltas bounded so one hallucinated Gemini call can't wreck the board.
DeltaInt = conint(ge=-80, le=80)


# --- Core models ---------------------------------------------------------- #

class MetricImpact(BaseModel):
    """Delta to apply to a target corporation's leaderboard row. Values are signed."""
    target: CorpId
    stock_value: DeltaInt = 0
    cash_reserves: DeltaInt = 0
    public_sentiment: DeltaInt = 0
    market_share: DeltaInt = 0


class AgentDecision(BaseModel):
    """Structured output from a single Gemini call (a corporation's strategic move)."""
    sender: CorpId
    action: Action
    target: CorpId
    # Short snake_case identifier or terse phrase; rides the WS payload as `reason`.
    reason: str = Field(..., max_length=240)
    confidence_score: float = Field(..., ge=0.0, le=1.0)
    # Free-form action parameters (e.g. {"margin_reduction": 0.15, "duration_ticks": 4}).
    parameters: Dict[str, Any] = Field(default_factory=dict)
    metric_impact: list[MetricImpact]


class ChaosEvent(BaseModel):
    """A macroeconomic catastrophe emitted by the Chaos Operator."""
    name: str = Field(..., max_length=120)
    description: str = Field(..., max_length=500)
    target: CorpId  # the corp that takes the brunt; ripples land via metric_impact
    metric_impact: list[MetricImpact]


# --- Leaderboard / state payload ----------------------------------------- #

class CorpStats(BaseModel):
    """One row of the leaderboard.

    Bounds:
      stock_value, cash_reserves, market_share: [0, 200]
      public_sentiment: [0, 100]
    """
    stock_value: int = Field(default=100, ge=0, le=200)
    cash_reserves: int = Field(default=100, ge=0, le=200)
    public_sentiment: int = Field(default=50, ge=0, le=100)
    market_share: int = Field(default=33, ge=0, le=200)


class GraphEdge(BaseModel):
    source: CorpId
    target: CorpId
    animated: bool = False


class Telemetry(BaseModel):
    """The compact per-tick event the frontend renders in the telemetry stream."""
    sender: CorpId
    action: Union[Action, Literal["CHAOS"]]
    target: CorpId
    reason: str = Field(..., max_length=240)
    confidence_score: float = Field(..., ge=0.0, le=1.0)
    parameters: Dict[str, Any] = Field(default_factory=dict)


class ChaosMultiplier(BaseModel):
    """Persistent debuff applied to a target after a chaos event.

    factor scales every metric_impact delta on this target. ticks_remaining
    decrements on each tick and the entry is dropped when it hits 0.
    """
    target: CorpId
    factor: float = Field(..., gt=0.0, le=1.0)
    ticks_remaining: int = Field(..., ge=0)
    source: str = Field(..., max_length=120)


class StatePayload(BaseModel):
    """The full state broadcast over /ws/telemetry on every tick."""
    tick: int
    active_agent: CorpId
    leaderboard: dict[str, CorpStats]
    graph_edges: list[GraphEdge]
    last_telemetry: Optional[Telemetry] = None
    chaos_multipliers: list[ChaosMultiplier] = Field(default_factory=list)
