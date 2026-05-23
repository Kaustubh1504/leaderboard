"""In-memory state store. Single global dict — the demo is short-lived."""

from __future__ import annotations

from .schemas import (
    ChaosMultiplier,
    CorpId,
    CorpStats,
    GraphEdge,
    MetricImpact,
    StatePayload,
    Telemetry,
)

CORP_IDS = [CorpId.NEXUSCORP, CorpId.VERTEXAI, CorpId.SHADOWSCALE]

# Per-metric upper bounds. Lower bound is always 0.
METRIC_MAX = {
    "stock_value": 200,
    "cash_reserves": 200,
    "public_sentiment": 100,
    "market_share": 200,
}

# Insolvency-loop trigger — see CLAUDE.md.
INSOLVENCY_THRESHOLD = 15

# Chaos debuff defaults: half-strength deltas for the next 4 ticks (~12s).
DEFAULT_MULTIPLIER_FACTOR = 0.5
DEFAULT_MULTIPLIER_TICKS = 4


def _initial_leaderboard() -> dict[str, CorpStats]:
    return {c.value: CorpStats() for c in CORP_IDS}


# Mutable global — explicitly the single source of truth for the demo.
STATE: dict = {
    "tick": 0,
    "active_agent": CorpId.NEXUSCORP,
    "leaderboard": _initial_leaderboard(),
    "graph_edges": [],
    "last_telemetry": None,
    # Keyed by target.value so re-targeting the same corp refreshes the entry
    # rather than stacking — keeps the debuff bounded and easy to render.
    "chaos_multipliers": {},  # dict[str, ChaosMultiplier]
}


def snapshot() -> StatePayload:
    """Return a Pydantic-validated copy of the current state for broadcast."""
    return StatePayload(
        tick=STATE["tick"],
        active_agent=STATE["active_agent"],
        leaderboard=STATE["leaderboard"],
        graph_edges=STATE["graph_edges"],
        last_telemetry=STATE["last_telemetry"],
        chaos_multipliers=list(STATE["chaos_multipliers"].values()),
    )


def apply_impacts(impacts: list[MetricImpact], scaled: bool = True) -> None:
    """Apply signed metric deltas, clamping per-metric bounds.

    When scaled (the default), an active chaos multiplier on the target
    dampens the delta — corps recover slowly from debuffs. Chaos events
    themselves call with scaled=False so the damage always lands at full
    force, regardless of any existing multiplier.
    """
    for imp in impacts:
        row = STATE["leaderboard"].get(imp.target.value)
        if row is None:
            continue
        factor = _factor_for(imp.target) if scaled else 1.0
        row.stock_value = _clamp(row.stock_value + _scale(imp.stock_value, factor), "stock_value")
        row.cash_reserves = _clamp(row.cash_reserves + _scale(imp.cash_reserves, factor), "cash_reserves")
        row.public_sentiment = _clamp(row.public_sentiment + _scale(imp.public_sentiment, factor), "public_sentiment")
        row.market_share = _clamp(row.market_share + _scale(imp.market_share, factor), "market_share")


def set_active(corp: CorpId, source: CorpId | None = None) -> None:
    """Mark a corp active and draw the animated edge from its source."""
    STATE["active_agent"] = corp
    if source is not None:
        STATE["graph_edges"] = [
            GraphEdge(source=source, target=corp, animated=True)
        ]


def set_telemetry(t: Telemetry) -> None:
    STATE["last_telemetry"] = t


def bump_tick() -> int:
    STATE["tick"] += 1
    return STATE["tick"]


def insolvency_targets() -> list[CorpId]:
    """Any corp whose cash_reserves fell below the insolvency threshold."""
    return [
        CorpId(name)
        for name, row in STATE["leaderboard"].items()
        if row.cash_reserves < INSOLVENCY_THRESHOLD
    ]


def add_multiplier(
    target: CorpId,
    source: str,
    factor: float = DEFAULT_MULTIPLIER_FACTOR,
    ticks: int = DEFAULT_MULTIPLIER_TICKS,
) -> None:
    """Install or refresh a chaos debuff on the given target."""
    STATE["chaos_multipliers"][target.value] = ChaosMultiplier(
        target=target, factor=factor, ticks_remaining=ticks, source=source,
    )


def tick_multipliers() -> None:
    """Decrement every active multiplier; drop the ones that hit zero."""
    expired = []
    for key, mult in STATE["chaos_multipliers"].items():
        mult.ticks_remaining -= 1
        if mult.ticks_remaining <= 0:
            expired.append(key)
    for key in expired:
        STATE["chaos_multipliers"].pop(key, None)


def _factor_for(target: CorpId) -> float:
    mult = STATE["chaos_multipliers"].get(target.value)
    return mult.factor if mult else 1.0


def _scale(delta: int, factor: float) -> int:
    if factor == 1.0 or delta == 0:
        return delta
    return int(round(delta * factor))


def _clamp(v: int, metric: str) -> int:
    upper = METRIC_MAX.get(metric, 100)
    if v < 0:
        return 0
    if v > upper:
        return upper
    return v
