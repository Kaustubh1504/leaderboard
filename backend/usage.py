"""Token usage ledger — tracks Gemini spend since server start.

agents.py records into this after every successful Gemini call.
main.py exposes the snapshot via GET /api/usage for the post-mortem panel.
Failed calls / seed fallbacks are not recorded (we only pay for successful
roundtrips).
"""

from __future__ import annotations

import time
from typing import Dict

from .schemas import TokenUsage, UsageLedger

# Keyed by source name (corp string or "Chaos_Operator").
LEDGER: Dict[str, TokenUsage] = {}


def record(source: str, input_tokens: int, output_tokens: int) -> None:
    """Add one successful Gemini call to the ledger.

    Both token counts are accepted as plain ints — we don't trust the SDK's
    optional fields and let the caller default missing values to 0.
    """
    entry = LEDGER.get(source)
    if entry is None:
        entry = TokenUsage(source=source)
        LEDGER[source] = entry
    entry.calls += 1
    entry.input_tokens += int(input_tokens or 0)
    entry.output_tokens += int(output_tokens or 0)
    entry.last_call_at = time.time()


def snapshot(model: str) -> UsageLedger:
    """Return the current ledger state, sorted with biggest spender first."""
    by_source = sorted(
        LEDGER.values(),
        key=lambda e: e.input_tokens + e.output_tokens,
        reverse=True,
    )
    return UsageLedger(
        model=model,
        total_calls=sum(e.calls for e in by_source),
        total_input_tokens=sum(e.input_tokens for e in by_source),
        total_output_tokens=sum(e.output_tokens for e in by_source),
        by_source=by_source,
    )


def reset() -> None:
    """Test hook — clears the ledger between cases."""
    LEDGER.clear()


def extract_usage(response) -> tuple[int, int]:
    """Pull (input_tokens, output_tokens) out of a google-genai response.

    The SDK exposes these on response.usage_metadata as
    prompt_token_count / candidates_token_count, but the field can be
    absent on error responses or older SDK versions — default to (0, 0)
    rather than raising so a successful call always records.
    """
    meta = getattr(response, "usage_metadata", None)
    if meta is None:
        return (0, 0)
    return (
        int(getattr(meta, "prompt_token_count", 0) or 0),
        int(getattr(meta, "candidates_token_count", 0) or 0),
    )
