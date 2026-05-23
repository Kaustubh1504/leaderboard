"""Tests for the Operator-supplied chaos prompt path (POST /api/chaos/inject).

Covers the agents-layer extension (call_chaos with user_prompt) and the
seed fallback's name-override behavior. The HTTP endpoint itself is thin
glue and gets exercised end-to-end in the live smoke harness.
"""

from __future__ import annotations

import pytest

from backend import agents
from backend.schemas import ChaosEvent, CorpId


@pytest.fixture(autouse=True)
def _force_seed_only(monkeypatch):
    """All cases here run against the seed fallback path — Gemini stubbed out."""
    monkeypatch.setattr(agents, "_client", None, raising=False)
    monkeypatch.setattr(agents, "_client_ready", True, raising=False)
    yield


class TestChaosPromptBuilder:
    """The framing line is what steers Gemini — verify it goes in/comes out."""

    def test_no_user_prompt_omits_framing_block(self):
        out = agents._chaos_prompt({"leaderboard": {}})
        assert "Operator has injected" not in out

    def test_user_prompt_is_quoted_into_the_framing_block(self):
        out = agents._chaos_prompt(
            {"leaderboard": {}},
            user_prompt="China bans GPU exports to US firms",
        )
        assert "Operator has injected" in out
        assert ">>> China bans GPU exports to US firms <<<" in out

    def test_user_prompt_is_stripped_of_outer_whitespace(self):
        out = agents._chaos_prompt(
            {"leaderboard": {}},
            user_prompt="  EU passes new AI Act  \n",
        )
        # Strip should leave the inner content intact, just trimmed.
        assert ">>> EU passes new AI Act <<<" in out


class TestCallChaosWithFraming:
    """call_chaos(user_prompt=...) in seed-only mode overrides the event name."""

    async def test_user_prompt_becomes_event_name(self):
        ev = await agents.call_chaos(
            {"leaderboard": {}},
            user_prompt="EU passes emergency AI moratorium",
        )
        assert isinstance(ev, ChaosEvent)
        assert ev.name == "EU passes emergency AI moratorium"

    async def test_metric_impact_still_comes_from_a_real_seed_event(self):
        """The Operator only controls framing — the actual impacts have to be
        schema-valid, which is guaranteed by reusing a real seed event."""
        ev = await agents.call_chaos(
            {"leaderboard": {}},
            user_prompt="Sovereign default in Brazil",
        )
        assert ev.target in {CorpId.NEXUSCORP, CorpId.VERTEXAI, CorpId.SHADOWSCALE}
        assert len(ev.metric_impact) >= 1, "seed events always carry at least one impact"

    async def test_none_user_prompt_uses_seed_event_name_unchanged(self):
        ev = await agents.call_chaos({"leaderboard": {}}, user_prompt=None)
        # The seed event's name is whatever was in the pool — just confirm
        # it's a non-empty string and NOT some sentinel from the override path.
        assert isinstance(ev.name, str) and ev.name.strip()

    async def test_empty_string_user_prompt_is_treated_as_no_framing(self):
        """Falsy prompt strings should not override the seed event's name."""
        ev = await agents.call_chaos({"leaderboard": {}}, user_prompt="")
        # Same shape as the no-prompt case: seed's own name kept.
        assert isinstance(ev.name, str) and ev.name.strip()

    async def test_long_user_prompt_truncates_to_schema_cap(self):
        """ChaosEvent.name caps at 120 chars — the override must respect that."""
        long_prompt = "X" * 300
        ev = await agents.call_chaos({"leaderboard": {}}, user_prompt=long_prompt)
        assert len(ev.name) == 120
        assert ev.name == "X" * 120


class TestSeedChaosWithFraming:
    """Direct helper test — covers the override regardless of the call path."""

    def test_no_framing_returns_unmodified_seed_event(self):
        ev = agents._seed_chaos_with_framing(None)
        assert isinstance(ev, ChaosEvent)
        # Just sanity: it's one of the real seed events.
        assert ev.metric_impact

    def test_framing_replaces_name(self):
        ev = agents._seed_chaos_with_framing("TSMC announces 5-year supply moratorium")
        assert ev.name == "TSMC announces 5-year supply moratorium"

    def test_framing_trims_whitespace_then_truncates(self):
        ev = agents._seed_chaos_with_framing("   " + "Y" * 200 + "   ")
        assert ev.name == "Y" * 120
