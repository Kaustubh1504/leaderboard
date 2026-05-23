"""Tests for backend.agents — seed fallback, persona loading, liveness check."""

from __future__ import annotations

import pytest

from backend import agents
from backend.schemas import Action, AgentDecision, ChaosEvent, CorpId


@pytest.fixture(autouse=True)
def _force_seed_only(monkeypatch):
    """Force seed-only mode by stubbing out the Gemini client."""
    monkeypatch.setattr(agents, "_client", None, raising=False)
    monkeypatch.setattr(agents, "_client_ready", True, raising=False)
    yield


class TestSeedDecision:
    @pytest.mark.parametrize("corp", [CorpId.NEXUSCORP, CorpId.VERTEXAI, CorpId.SHADOWSCALE])
    def test_returns_valid_decision_for_each_corp(self, corp):
        d = agents.seed_decision(corp)
        assert isinstance(d, AgentDecision)
        assert isinstance(d.action, Action)
        assert isinstance(d.target, CorpId)

    @pytest.mark.parametrize("corp", [CorpId.NEXUSCORP, CorpId.VERTEXAI, CorpId.SHADOWSCALE])
    def test_pool_filtered_by_persona_for_named_corp(self, corp):
        """seed.json should give back a decision authored by this corp when available."""
        # Run 20 draws — pool is non-trivial, so we should see this corp as sender.
        senders = {agents.seed_decision(corp).sender for _ in range(20)}
        assert corp in senders

    def test_falls_back_to_full_pool_for_unknown_corp(self):
        """Chaos_Operator has no decisions in the pool; should still return something valid."""
        d = agents.seed_decision(CorpId.CHAOS)
        assert isinstance(d, AgentDecision)


class TestSeedChaos:
    def test_returns_valid_chaos_event(self):
        ev = agents.seed_chaos()
        assert isinstance(ev, ChaosEvent)
        assert ev.target in {CorpId.NEXUSCORP, CorpId.VERTEXAI, CorpId.SHADOWSCALE}
        assert ev.metric_impact, "chaos events must have at least one metric impact"

    def test_event_names_are_non_empty(self):
        names = {agents.seed_chaos().name for _ in range(15)}
        assert all(n.strip() for n in names)


class TestLiveness:
    def test_is_live_returns_false_when_client_is_none(self):
        assert agents.is_live() is False

    def test_is_live_returns_true_when_client_present(self, monkeypatch):
        sentinel = object()
        monkeypatch.setattr(agents, "_client", sentinel, raising=False)
        monkeypatch.setattr(agents, "_client_ready", True, raising=False)
        assert agents.is_live() is True


class TestCallFallbacks:
    """When the Gemini client is None, both public entry points must fall back to seed."""

    async def test_call_agent_falls_back_to_seed(self):
        d = await agents.call_agent(CorpId.NEXUSCORP, {"leaderboard": {}}, insolvency=False)
        assert isinstance(d, AgentDecision)
        assert d.sender == CorpId.NEXUSCORP  # anti-spoof preserved on the fallback path

    async def test_call_agent_fallback_honors_insolvency_without_raising(self):
        """The insolvency flag is only consumed by Gemini prompting; seed path ignores it."""
        d = await agents.call_agent(CorpId.NEXUSCORP, {"leaderboard": {}}, insolvency=True)
        assert isinstance(d, AgentDecision)

    async def test_call_chaos_falls_back_to_seed(self):
        ev = await agents.call_chaos({"leaderboard": {}})
        assert isinstance(ev, ChaosEvent)

    async def test_call_chaos_with_no_state_snapshot(self):
        ev = await agents.call_chaos()
        assert isinstance(ev, ChaosEvent)


class TestPersonaLoading:
    @pytest.mark.parametrize("corp", [CorpId.NEXUSCORP, CorpId.VERTEXAI, CorpId.SHADOWSCALE])
    def test_load_persona_returns_non_empty_for_known_corp(self, corp):
        text = agents.load_persona(corp)
        assert text.strip(), f"missing persona file for {corp.value}"

    def test_load_persona_returns_empty_for_unknown_corp(self):
        """Chaos_Operator has its own loader, not a corp persona file."""
        assert agents.load_persona(CorpId.CHAOS) == ""

    def test_load_chaos_persona_returns_non_empty(self):
        assert agents.load_chaos_persona().strip()
