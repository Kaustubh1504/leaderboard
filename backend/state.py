"""In-memory state store. Single global dict — the demo is short-lived."""

from __future__ import annotations

from .schemas import (
    AgentId,
    GraphEdge,
    HackerStats,
    MetricImpact,
    StatePayload,
    Telemetry,
)

HACKER_IDS = [AgentId.HACKER_1, AgentId.HACKER_2, AgentId.HACKER_3, AgentId.HACKER_4]


def _initial_leaderboard() -> dict[str, HackerStats]:
    return {h.value: HackerStats() for h in HACKER_IDS}


# Mutable global — explicitly the single source of truth for the demo.
STATE: dict = {
    "tick": 0,
    "active_agent": AgentId.HACKER_1,
    "leaderboard": _initial_leaderboard(),
    "graph_edges": [],
    "last_telemetry": None,
}


def snapshot() -> StatePayload:
    """Return a Pydantic-validated copy of the current state for broadcast."""
    return StatePayload(
        tick=STATE["tick"],
        active_agent=STATE["active_agent"],
        leaderboard=STATE["leaderboard"],
        graph_edges=STATE["graph_edges"],
        last_telemetry=STATE["last_telemetry"],
    )


def apply_impacts(impacts: list[MetricImpact]) -> None:
    """Apply signed metric deltas to the leaderboard, clamping to [0, 100]."""
    for imp in impacts:
        row = STATE["leaderboard"].get(imp.target.value)
        if row is None:
            continue
        row.velocity = _clamp(row.velocity + imp.velocity)
        row.efficiency = _clamp(row.efficiency + imp.efficiency)
        row.stability = _clamp(row.stability + imp.stability)
        row.stress = _clamp(row.stress + imp.stress)


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
