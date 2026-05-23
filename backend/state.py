"""In-memory state store. Single global dict — the demo is short-lived."""

from __future__ import annotations

from .schemas import (
    AgentId,
    ChaosMultiplier,
    GraphEdge,
    HackerStats,
    MetricImpact,
    StatePayload,
    Telemetry,
)

HACKER_IDS = [AgentId.HACKER_1, AgentId.HACKER_2, AgentId.HACKER_3, AgentId.HACKER_4]

# Chaos debuff defaults: half-strength deltas for the next 4 ticks (~12s).
DEFAULT_MULTIPLIER_FACTOR = 0.5
DEFAULT_MULTIPLIER_TICKS = 4


def _initial_leaderboard() -> dict[str, HackerStats]:
    return {h.value: HackerStats() for h in HACKER_IDS}


# Mutable global — explicitly the single source of truth for the demo.
STATE: dict = {
    "tick": 0,
    "active_agent": AgentId.HACKER_1,
    "leaderboard": _initial_leaderboard(),
    "graph_edges": [],
    "last_telemetry": None,
    # Keyed by target.value so re-targeting the same agent refreshes the entry
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
    """Apply signed metric deltas, clamping to [0, 100].

    When scaled (the default), an active chaos multiplier on the target
    dampens the delta — agents recover slowly from debuffs. Chaos events
    themselves call with scaled=False so the damage always lands at full
    force, regardless of any existing multiplier.
    """
    for imp in impacts:
        row = STATE["leaderboard"].get(imp.target.value)
        if row is None:
            continue
        factor = _factor_for(imp.target) if scaled else 1.0
        row.velocity = _clamp(row.velocity + _scale(imp.velocity, factor))
        row.efficiency = _clamp(row.efficiency + _scale(imp.efficiency, factor))
        row.stability = _clamp(row.stability + _scale(imp.stability, factor))
        row.stress = _clamp(row.stress + _scale(imp.stress, factor))


def add_multiplier(
    target: AgentId,
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


def _factor_for(target: AgentId) -> float:
    mult = STATE["chaos_multipliers"].get(target.value)
    return mult.factor if mult else 1.0


def _scale(delta: int, factor: float) -> int:
    if factor == 1.0 or delta == 0:
        return delta
    return int(round(delta * factor))


def set_active(agent: AgentId, source: AgentId | None = None) -> None:
    """Mark an agent active and draw the animated edge from its source."""
    STATE["active_agent"] = agent
    if source is not None:
        STATE["graph_edges"] = [
            GraphEdge(source=source, target=agent, animated=True)
        ]


def set_telemetry(t: Telemetry) -> None:
    STATE["last_telemetry"] = t


def bump_tick() -> int:
    STATE["tick"] += 1
    return STATE["tick"]


def panic_targets() -> list[AgentId]:
    """Any agent whose stability dropped below the panic threshold."""
    return [
        AgentId(name)
        for name, row in STATE["leaderboard"].items()
        if row.stability < 20
    ]


def _clamp(v: int) -> int:
    if v < 0:
        return 0
    if v > 100:
        return 100
    return v
