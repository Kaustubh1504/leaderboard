"""Tests for backend.usage — token ledger for the post-mortem panel."""

from __future__ import annotations

import time
from types import SimpleNamespace

import pytest

from backend import usage
from backend.schemas import TokenUsage, UsageLedger


@pytest.fixture(autouse=True)
def _reset_ledger():
    """Each test starts with an empty ledger."""
    usage.reset()
    yield
    usage.reset()


class TestRecord:
    def test_first_call_creates_entry(self):
        usage.record("NexusCorp", 120, 45)
        snap = usage.snapshot(model="gemini-2.5-flash")
        assert snap.total_calls == 1
        assert snap.total_input_tokens == 120
        assert snap.total_output_tokens == 45
        assert len(snap.by_source) == 1
        assert snap.by_source[0].source == "NexusCorp"

    def test_repeated_calls_accumulate(self):
        usage.record("NexusCorp", 100, 30)
        usage.record("NexusCorp", 80, 20)
        snap = usage.snapshot(model="gemini-2.5-flash")
        row = next(s for s in snap.by_source if s.source == "NexusCorp")
        assert row.calls == 2
        assert row.input_tokens == 180
        assert row.output_tokens == 50

    def test_multiple_sources_track_independently(self):
        usage.record("NexusCorp", 100, 30)
        usage.record("VertexAI", 200, 60)
        usage.record("Chaos_Operator", 50, 10)
        snap = usage.snapshot(model="gemini-2.5-flash")
        sources = {s.source for s in snap.by_source}
        assert sources == {"NexusCorp", "VertexAI", "Chaos_Operator"}
        assert snap.total_calls == 3
        assert snap.total_input_tokens == 350
        assert snap.total_output_tokens == 100

    def test_none_or_zero_token_counts_are_safe(self):
        """Defensive: SDK may return None for missing fields."""
        usage.record("NexusCorp", None, None)  # type: ignore[arg-type]
        usage.record("NexusCorp", 0, 0)
        snap = usage.snapshot(model="gemini-2.5-flash")
        row = snap.by_source[0]
        assert row.calls == 2
        assert row.input_tokens == 0
        assert row.output_tokens == 0

    def test_last_call_at_advances(self):
        usage.record("NexusCorp", 10, 5)
        first = usage.LEDGER["NexusCorp"].last_call_at
        assert first is not None
        time.sleep(0.01)
        usage.record("NexusCorp", 10, 5)
        second = usage.LEDGER["NexusCorp"].last_call_at
        assert second is not None and second > first


class TestSnapshot:
    def test_empty_ledger_returns_zeroed_payload(self):
        snap = usage.snapshot(model="gemini-2.5-flash")
        assert isinstance(snap, UsageLedger)
        assert snap.model == "gemini-2.5-flash"
        assert snap.total_calls == 0
        assert snap.by_source == []

    def test_sources_sorted_by_total_tokens_desc(self):
        usage.record("NexusCorp", 50, 10)            # 60 total
        usage.record("VertexAI", 500, 100)           # 600 total — biggest
        usage.record("ShadowScale", 200, 50)         # 250 total
        snap = usage.snapshot(model="gemini-2.5-flash")
        assert [s.source for s in snap.by_source] == ["VertexAI", "ShadowScale", "NexusCorp"]

    def test_round_trips_through_json(self):
        usage.record("NexusCorp", 120, 45)
        snap = usage.snapshot(model="gemini-2.5-flash")
        replayed = UsageLedger.model_validate_json(snap.model_dump_json())
        assert replayed.total_input_tokens == 120
        assert replayed.by_source[0].source == "NexusCorp"


class TestExtractUsage:
    def test_returns_zeros_when_metadata_missing(self):
        fake_response = SimpleNamespace(text="{}")
        assert usage.extract_usage(fake_response) == (0, 0)

    def test_pulls_prompt_and_candidate_counts(self):
        fake_meta = SimpleNamespace(prompt_token_count=300, candidates_token_count=85)
        fake_response = SimpleNamespace(usage_metadata=fake_meta)
        assert usage.extract_usage(fake_response) == (300, 85)

    def test_handles_none_fields_on_metadata(self):
        fake_meta = SimpleNamespace(prompt_token_count=None, candidates_token_count=None)
        fake_response = SimpleNamespace(usage_metadata=fake_meta)
        assert usage.extract_usage(fake_response) == (0, 0)


class TestReset:
    def test_clears_all_entries(self):
        usage.record("NexusCorp", 50, 10)
        usage.record("VertexAI", 100, 20)
        usage.reset()
        snap = usage.snapshot(model="gemini-2.5-flash")
        assert snap.total_calls == 0
        assert snap.by_source == []
