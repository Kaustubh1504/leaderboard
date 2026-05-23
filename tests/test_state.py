"""Tests for backend.state.apply_decay — the H3 passive metric drift."""

from __future__ import annotations

import pytest

from backend import state


@pytest.fixture(autouse=True)
def _reset_leaderboard():
    """Pin every leaderboard row to mid-range values before each test."""
    for row in state.STATE["leaderboard"].values():
        row.stock_value = 50
        row.cash_reserves = 50
        row.public_sentiment = 50
        row.market_share = 50
    state.STATE["chaos_multipliers"] = {}
    yield


class TestApplyDecay:
    def test_cash_reserves_drifts_down_by_one_on_every_corp(self):
        state.apply_decay()
        for row in state.STATE["leaderboard"].values():
            assert row.cash_reserves == 49

    def test_public_sentiment_drifts_down_by_one_on_every_corp(self):
        state.apply_decay()
        for row in state.STATE["leaderboard"].values():
            assert row.public_sentiment == 49

    def test_market_share_drifts_down_by_one_on_every_corp(self):
        state.apply_decay()
        for row in state.STATE["leaderboard"].values():
            assert row.market_share == 49

    def test_stock_value_is_not_touched(self):
        """Stock value is market-driven by actions/chaos — no passive drift."""
        state.apply_decay()
        for row in state.STATE["leaderboard"].values():
            assert row.stock_value == 50

    def test_cash_reserves_clamps_at_0(self):
        for row in state.STATE["leaderboard"].values():
            row.cash_reserves = 0
        state.apply_decay()
        for row in state.STATE["leaderboard"].values():
            assert row.cash_reserves == 0

    def test_public_sentiment_clamps_at_0(self):
        for row in state.STATE["leaderboard"].values():
            row.public_sentiment = 0
        state.apply_decay()
        for row in state.STATE["leaderboard"].values():
            assert row.public_sentiment == 0

    def test_market_share_clamps_at_0(self):
        for row in state.STATE["leaderboard"].values():
            row.market_share = 0
        state.apply_decay()
        for row in state.STATE["leaderboard"].values():
            assert row.market_share == 0

    def test_decay_compounds_across_repeated_calls(self):
        for _ in range(5):
            state.apply_decay()
        nexus = state.STATE["leaderboard"]["Google"]
        assert nexus.cash_reserves == 45
        assert nexus.public_sentiment == 45
        assert nexus.market_share == 45
        assert nexus.stock_value == 50

    def test_decay_touches_all_three_corps(self):
        state.apply_decay()
        assert set(state.STATE["leaderboard"].keys()) == {
            "Google",
            "OpenAI",
            "Anthropic",
        }
