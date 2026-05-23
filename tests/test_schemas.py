"""Tests for backend.schemas — the locked contract between Gemini, tick, and frontend."""

from __future__ import annotations

import json

import pytest
from pydantic import ValidationError

from backend.schemas import (
    Action,
    AgentDecision,
    ChaosEvent,
    ChaosMultiplier,
    CorpId,
    CorpStats,
    GraphEdge,
    MetricImpact,
    StatePayload,
    Telemetry,
)


class TestEnums:
    def test_action_values_match_spec(self):
        assert {a.value for a in Action} == {
            "predatory_pricing",
            "acquire_competitor",
            "narrative_campaign",
            "defensive_pivot",
            "rd_investment",
            "espionage",
        }

    def test_corp_ids_match_spec(self):
        assert {c.value for c in CorpId} == {
            "NexusCorp",
            "VertexAI",
            "ShadowScale",
            "Chaos_Operator",
        }


class TestMetricImpact:
    def test_defaults_are_zero(self):
        imp = MetricImpact(target=CorpId.NEXUSCORP)
        assert (imp.stock_value, imp.cash_reserves, imp.public_sentiment, imp.market_share) == (0, 0, 0, 0)

    def test_accepts_deltas_within_bounds(self):
        MetricImpact(target=CorpId.NEXUSCORP, stock_value=80, cash_reserves=-80)
        MetricImpact(target=CorpId.NEXUSCORP, public_sentiment=0)

    def test_rejects_positive_delta_above_80(self):
        with pytest.raises(ValidationError):
            MetricImpact(target=CorpId.NEXUSCORP, stock_value=81)

    def test_rejects_negative_delta_below_minus_80(self):
        with pytest.raises(ValidationError):
            MetricImpact(target=CorpId.NEXUSCORP, market_share=-81)

    def test_target_must_be_corpid(self):
        with pytest.raises(ValidationError):
            MetricImpact(target="Oracle")


class TestAgentDecision:
    def _valid(self, **overrides):
        base = dict(
            sender=CorpId.NEXUSCORP,
            action=Action.DEFENSIVE_PIVOT,
            target=CorpId.NEXUSCORP,
            reason="protect_q3_guidance",
            confidence_score=0.8,
            parameters={"foo": "bar"},
            metric_impact=[MetricImpact(target=CorpId.NEXUSCORP, stock_value=5)],
        )
        base.update(overrides)
        return AgentDecision(**base)

    def test_round_trips_through_json(self):
        d = self._valid()
        replayed = AgentDecision.model_validate_json(d.model_dump_json())
        assert replayed.sender == d.sender
        assert replayed.action == d.action
        assert replayed.parameters == {"foo": "bar"}

    def test_rejects_unknown_action(self):
        with pytest.raises(ValidationError):
            AgentDecision.model_validate({
                "sender": "NexusCorp", "action": "fire_ceo", "target": "VertexAI",
                "reason": "x", "confidence_score": 0.5, "parameters": {}, "metric_impact": [],
            })

    def test_rejects_confidence_below_zero(self):
        with pytest.raises(ValidationError):
            self._valid(confidence_score=-0.01)

    def test_rejects_confidence_above_one(self):
        with pytest.raises(ValidationError):
            self._valid(confidence_score=1.01)

    def test_accepts_confidence_at_bounds(self):
        self._valid(confidence_score=0.0)
        self._valid(confidence_score=1.0)

    def test_rejects_reason_over_240_chars(self):
        with pytest.raises(ValidationError):
            self._valid(reason="x" * 241)

    def test_parameters_defaults_to_empty_dict(self):
        d = AgentDecision(
            sender=CorpId.NEXUSCORP, action=Action.DEFENSIVE_PIVOT, target=CorpId.NEXUSCORP,
            reason="x", confidence_score=0.5,
            metric_impact=[MetricImpact(target=CorpId.NEXUSCORP)],
        )
        assert d.parameters == {}


class TestChaosEvent:
    def test_round_trips_through_json(self):
        ev = ChaosEvent(
            name="EU AI Act Amendment",
            description="Brussels publishes emergency rules.",
            target=CorpId.NEXUSCORP,
            metric_impact=[MetricImpact(target=CorpId.NEXUSCORP, stock_value=-40)],
        )
        replayed = ChaosEvent.model_validate_json(ev.model_dump_json())
        assert replayed.name == ev.name
        assert replayed.target == ev.target

    def test_rejects_name_over_120_chars(self):
        with pytest.raises(ValidationError):
            ChaosEvent(name="x" * 121, description="d", target=CorpId.NEXUSCORP, metric_impact=[])

    def test_rejects_description_over_500_chars(self):
        with pytest.raises(ValidationError):
            ChaosEvent(name="n", description="x" * 501, target=CorpId.NEXUSCORP, metric_impact=[])


class TestCorpStats:
    def test_defaults_within_per_metric_bounds(self):
        s = CorpStats()
        assert 0 <= s.stock_value <= 200
        assert 0 <= s.cash_reserves <= 200
        assert 0 <= s.public_sentiment <= 100
        assert 0 <= s.market_share <= 200

    def test_stock_value_accepts_up_to_200(self):
        CorpStats(stock_value=200)

    def test_stock_value_rejects_above_200(self):
        with pytest.raises(ValidationError):
            CorpStats(stock_value=201)

    def test_public_sentiment_rejects_above_100(self):
        with pytest.raises(ValidationError):
            CorpStats(public_sentiment=101)

    def test_all_metrics_reject_below_zero(self):
        for field in ("stock_value", "cash_reserves", "public_sentiment", "market_share"):
            with pytest.raises(ValidationError):
                CorpStats(**{field: -1})


class TestChaosMultiplier:
    def _ok(self, **overrides):
        base = dict(target=CorpId.NEXUSCORP, factor=0.5, ticks_remaining=4, source="Test Chaos")
        base.update(overrides)
        return ChaosMultiplier(**base)

    def test_round_trip(self):
        m = self._ok()
        replayed = ChaosMultiplier.model_validate_json(m.model_dump_json())
        assert replayed.factor == 0.5

    def test_factor_must_be_above_zero(self):
        with pytest.raises(ValidationError):
            self._ok(factor=0.0)

    def test_factor_must_be_at_most_one(self):
        with pytest.raises(ValidationError):
            self._ok(factor=1.01)

    def test_ticks_remaining_rejects_negative(self):
        with pytest.raises(ValidationError):
            self._ok(ticks_remaining=-1)


class TestStatePayload:
    def test_round_trips_through_json_with_defaults(self):
        sp = StatePayload(
            tick=7,
            active_agent=CorpId.NEXUSCORP,
            leaderboard={"NexusCorp": CorpStats()},
            graph_edges=[GraphEdge(source=CorpId.VERTEXAI, target=CorpId.NEXUSCORP, animated=True)],
        )
        wire = sp.model_dump_json()
        replayed = StatePayload.model_validate_json(wire)
        assert replayed.tick == 7
        assert replayed.last_telemetry is None
        assert replayed.chaos_multipliers == []

    def test_includes_telemetry_and_multipliers(self):
        sp = StatePayload(
            tick=1,
            active_agent=CorpId.SHADOWSCALE,
            leaderboard={"ShadowScale": CorpStats()},
            graph_edges=[],
            last_telemetry=Telemetry(
                sender=CorpId.SHADOWSCALE,
                action=Action.NARRATIVE_CAMPAIGN,
                target=CorpId.NEXUSCORP,
                reason="nexus_offshore_labelers_leak",
                confidence_score=0.77,
                parameters={"venue": "reddit"},
            ),
            chaos_multipliers=[
                ChaosMultiplier(target=CorpId.NEXUSCORP, factor=0.5, ticks_remaining=3, source="Antitrust Suit")
            ],
        )
        wire = json.loads(sp.model_dump_json())
        assert wire["last_telemetry"]["action"] == "narrative_campaign"
        assert wire["chaos_multipliers"][0]["source"] == "Antitrust Suit"

    def test_telemetry_action_accepts_chaos_literal(self):
        t = Telemetry(
            sender=CorpId.CHAOS,
            action="CHAOS",
            target=CorpId.NEXUSCORP,
            reason="DOJ Antitrust Suit",
            confidence_score=1.0,
        )
        assert t.action == "CHAOS"


class TestSeedConformance:
    """Every entry in data/seed.json must validate against the locked schema."""

    def test_all_seed_decisions_validate(self):
        import json as _json
        from pathlib import Path
        seed = _json.loads((Path(__file__).resolve().parent.parent / "data" / "seed.json").read_text())
        for d in seed["decisions"]:
            AgentDecision.model_validate(d)

    def test_all_seed_chaos_events_validate(self):
        import json as _json
        from pathlib import Path
        seed = _json.loads((Path(__file__).resolve().parent.parent / "data" / "seed.json").read_text())
        for e in seed["chaos_events"]:
            ChaosEvent.model_validate(e)
