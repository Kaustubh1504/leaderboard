"""Decision + chaos history — feeds the post-mortem analyst.

Every successful call_agent / call_chaos and every seed fallback records
into the in-memory ring buffer here. The post-mortem endpoint reads the
buffer to produce the emergent-strategy narrative.

Caps at MAX_HISTORY items per series so a long-running server doesn't
unbounded-grow; the demo only needs the last few minutes of activity.
"""

from __future__ import annotations

from collections import deque
from typing import Deque, Dict, List

from .schemas import AgentDecision, ChaosEvent

MAX_HISTORY = 200

DECISIONS: Deque[AgentDecision] = deque(maxlen=MAX_HISTORY)
CHAOS_EVENTS: Deque[ChaosEvent] = deque(maxlen=MAX_HISTORY)


def record_decision(decision: AgentDecision) -> None:
    DECISIONS.append(decision)


def record_chaos(event: ChaosEvent) -> None:
    CHAOS_EVENTS.append(event)


def snapshot() -> Dict[str, List]:
    """Frozen view of the history. Returns plain lists, not the deques,
    so the caller can iterate safely while the loop continues mutating."""
    return {
        "decisions": list(DECISIONS),
        "chaos_events": list(CHAOS_EVENTS),
    }


def reset() -> None:
    """Test hook — clears the ring buffers between cases."""
    DECISIONS.clear()
    CHAOS_EVENTS.clear()
