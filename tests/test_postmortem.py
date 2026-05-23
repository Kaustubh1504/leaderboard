"""Tests for the post-mortem feature — decision history + analyst summary."""

from __future__ import annotations

import pytest

from backend import agents, history
from backend.schemas import (
    Action,
    AgentDecision,
    ChaosEvent,
    CorpId,
    CorpStrategySummary,
    MetricImpact,
    PostmortemSummary,
)


def _decision(corp: CorpId, action: Action, target: CorpId, **overrides) -> AgentDecision:
    base = dict(
        sender=corp,
        action=action,
        target=target,
        reason=f"{corp.value}_test_move",
        confidence_score=0.75,
        parameters={},
        metric_impact=[MetricImpact(target=target, stock_value=5)],
    )
    base.update(overrides)
    return AgentDecision(**base)


def _chaos(name: str, target: CorpId) -> ChaosEvent:
    return ChaosEvent(
        name=name,
        description="test chaos event",
        target=target,
        metric_impact=[MetricImpact(target=target, stock_value=-25)],
    )


@pytest.fixture(autouse=True)
def _reset_history_and_force_seed(monkeypatch):
    """Clean ledger + Gemini stubbed out for every case."""
    history.reset()
    monkeypatch.setattr(agents, "_client", None, raising=False)
    monkeypatch.setattr(agents, "_client_ready", True, raising=False)
    yield
    history.reset()


class TestHistory:
    def test_record_decision_appends(self):
        history.record_decision(_decision(CorpId.NEXUSCORP, Action.DEFENSIVE_PIVOT, CorpId.NEXUSCORP))
        assert len(history.DECISIONS) == 1
        assert history.DECISIONS[0].sender == CorpId.NEXUSCORP

    def test_record_chaos_appends(self):
        history.record_chaos(_chaos("Test Shock", CorpId.VERTEXAI))
        assert len(history.CHAOS_EVENTS) == 1

    def test_snapshot_returns_independent_lists(self):
        history.record_decision(_decision(CorpId.NEXUSCORP, Action.RD_INVESTMENT, CorpId.NEXUSCORP))
        snap = history.snapshot()
        assert isinstance(snap["decisions"], list)
        # mutating the snapshot must not affect the underlying deque
        snap["decisions"].append("garbage")
        assert len(history.DECISIONS) == 1

    def test_ring_buffer_caps_at_max_history(self):
        for i in range(history.MAX_HISTORY + 50):
            history.record_decision(_decision(CorpId.NEXUSCORP, Action.RD_INVESTMENT, CorpId.NEXUSCORP))
        assert len(history.DECISIONS) == history.MAX_HISTORY

    def test_reset_clears_both_series(self):
        history.record_decision(_decision(CorpId.NEXUSCORP, Action.RD_INVESTMENT, CorpId.NEXUSCORP))
        history.record_chaos(_chaos("X", CorpId.VERTEXAI))
        history.reset()
        assert history.snapshot() == {"decisions": [], "chaos_events": []}


class TestAgentsRecordingHooks:
    """Every decision-generation path should record to history."""

    def test_seed_decision_records(self):
        agents.seed_decision(CorpId.NEXUSCORP)
        assert len(history.DECISIONS) == 1

    def test_seed_chaos_records(self):
        agents.seed_chaos()
        assert len(history.CHAOS_EVENTS) == 1

    async def test_call_agent_seed_fallback_records(self):
        await agents.call_agent(CorpId.NEXUSCORP, {"leaderboard": {}})
        assert len(history.DECISIONS) == 1

    async def test_call_chaos_seed_fallback_records(self):
        await agents.call_chaos({"leaderboard": {}})
        assert len(history.CHAOS_EVENTS) == 1

    async def test_call_chaos_with_framing_records_with_overridden_name(self):
        await agents.call_chaos({"leaderboard": {}}, user_prompt="Quarterly tax shock")
        assert len(history.CHAOS_EVENTS) == 1
        assert history.CHAOS_EVENTS[0].name == "Quarterly tax shock"


class TestSeedSummary:
    """The templated summary used when Gemini is unavailable."""

    def _state(self, nexus=120, vertex=80, shadow=40):
        from backend.schemas import CorpStats
        return {
            "tick": 50,
            "leaderboard": {
                "NexusCorp":   CorpStats(stock_value=nexus,  cash_reserves=80, public_sentiment=60, market_share=40),
                "VertexAI":    CorpStats(stock_value=vertex, cash_reserves=70, public_sentiment=55, market_share=35),
                "ShadowScale": CorpStats(stock_value=shadow, cash_reserves=30, public_sentiment=45, market_share=20),
            },
        }

    def test_empty_history_returns_valid_payload_with_no_corps(self):
        summary = agents._seed_summary({"decisions": [], "chaos_events": []}, self._state())
        assert isinstance(summary, PostmortemSummary)
        assert summary.corps == []
        assert summary.chaos_count == 0

    def test_corps_sorted_by_stock_value_desc(self):
        # Each corp gets one decision so it shows up
        for corp in (CorpId.NEXUSCORP, CorpId.VERTEXAI, CorpId.SHADOWSCALE):
            history.record_decision(_decision(corp, Action.DEFENSIVE_PIVOT, corp))
        summary = agents._seed_summary(history.snapshot(), self._state(nexus=140, vertex=100, shadow=60))
        assert [c.corp for c in summary.corps] == [CorpId.NEXUSCORP, CorpId.VERTEXAI, CorpId.SHADOWSCALE]

    def test_standing_buckets_by_stock_value(self):
        for corp in (CorpId.NEXUSCORP, CorpId.VERTEXAI, CorpId.SHADOWSCALE):
            history.record_decision(_decision(corp, Action.RD_INVESTMENT, corp))
        # Nexus ascendant (≥130), Vertex stable (≥80), Shadow declining (≥40)
        summary = agents._seed_summary(history.snapshot(), self._state(nexus=160, vertex=90, shadow=50))
        standings = {c.corp: c.standing for c in summary.corps}
        assert standings[CorpId.NEXUSCORP] == "ascendant"
        assert standings[CorpId.VERTEXAI] == "stable"
        assert standings[CorpId.SHADOWSCALE] == "declining"

    def test_collapsing_when_stock_under_40(self):
        history.record_decision(_decision(CorpId.SHADOWSCALE, Action.DEFENSIVE_PIVOT, CorpId.SHADOWSCALE))
        summary = agents._seed_summary(history.snapshot(), self._state(nexus=160, vertex=90, shadow=15))
        shadow_entry = next(c for c in summary.corps if c.corp == CorpId.SHADOWSCALE)
        assert shadow_entry.standing == "collapsing"

    def test_dominant_action_picks_the_most_common(self):
        # Three predatory, one defensive — predatory should dominate.
        for _ in range(3):
            history.record_decision(_decision(CorpId.VERTEXAI, Action.PREDATORY_PRICING, CorpId.NEXUSCORP))
        history.record_decision(_decision(CorpId.VERTEXAI, Action.DEFENSIVE_PIVOT, CorpId.VERTEXAI))
        summary = agents._seed_summary(history.snapshot(), self._state())
        vertex_entry = next(c for c in summary.corps if c.corp == CorpId.VERTEXAI)
        assert vertex_entry.dominant_action == Action.PREDATORY_PRICING

    def test_most_dramatic_chaos_is_latest_when_present(self):
        history.record_decision(_decision(CorpId.NEXUSCORP, Action.RD_INVESTMENT, CorpId.NEXUSCORP))
        history.record_chaos(_chaos("First Shock", CorpId.NEXUSCORP))
        history.record_chaos(_chaos("Second Shock", CorpId.VERTEXAI))
        summary = agents._seed_summary(history.snapshot(), self._state())
        assert summary.chaos_count == 2
        assert summary.most_dramatic_chaos == "Second Shock"

    def test_round_trips_through_json(self):
        history.record_decision(_decision(CorpId.NEXUSCORP, Action.RD_INVESTMENT, CorpId.NEXUSCORP))
        history.record_chaos(_chaos("Shock", CorpId.NEXUSCORP))
        summary = agents._seed_summary(history.snapshot(), self._state())
        replayed = PostmortemSummary.model_validate_json(summary.model_dump_json())
        assert replayed.headline == summary.headline


class TestCallSummary:
    """call_summary should hit the seed path when Gemini is stubbed out."""

    async def test_falls_back_to_seed_summary(self):
        history.record_decision(_decision(CorpId.NEXUSCORP, Action.RD_INVESTMENT, CorpId.NEXUSCORP))
        summary = await agents.call_summary({"tick": 1, "leaderboard": {}})
        assert isinstance(summary, PostmortemSummary)
        assert summary.total_ticks_analyzed == 1
