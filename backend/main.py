"""FastAPI entrypoint. Run with: uvicorn backend.main:app --reload"""

from __future__ import annotations

import asyncio
import logging

from fastapi import FastAPI, HTTPException, WebSocket
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from . import state, tick, ws
from .agents import call_agent, call_chaos, call_summary
from .schemas import CorpId


class ChaosInjectRequest(BaseModel):
    """Body for POST /api/chaos/inject — Operator-supplied chaos framing."""
    prompt: str = Field(..., min_length=1, max_length=240)

logging.basicConfig(level=logging.INFO)

app = FastAPI(title="NEXUS-OS")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Lowercase URL slug → canonical CorpId enum. Per CLAUDE.md the public REST
# contract uses lowercase ("google", "openai", "anthropic") while the
# internal enum / state keys preserve the canonical brand casing ("Google" etc.).
_CORP_BY_SLUG = {c.value.lower(): c for c in CorpId if c is not CorpId.CHAOS}


@app.on_event("startup")
async def _start_loop() -> None:
    asyncio.create_task(tick.loop())


@app.get("/api/state")
async def get_state():
    return state.snapshot().model_dump()


@app.post("/api/chaos/trigger")
async def trigger_chaos():
    event = await call_chaos(state.STATE)
    await tick.queue_chaos(event)
    return event.model_dump()


@app.post("/api/chaos/inject")
async def inject_chaos(req: ChaosInjectRequest):
    """Operator-supplied chaos. Gemini still produces a valid ChaosEvent;
    the user's prompt steers the framing. When Gemini is unavailable, the
    seed fallback uses the prompt as the event name so the dashboard still
    reflects the Operator's intent."""
    event = await call_chaos(state.STATE, user_prompt=req.prompt)
    await tick.queue_chaos(event)
    return event.model_dump()


@app.get("/api/postmortem/summary")
async def get_postmortem_summary():
    """Emergent-strategy narrative for the post-mortem panel.

    Bigger Gemini budget (20s) than other endpoints — the analyst prompt
    carries the full decision history, so the round-trip is slower.
    """
    summary = await call_summary(state.STATE, timeout=20.0)
    return summary.model_dump()


@app.post("/api/agent/{corp_id}/query")
async def force_corp(corp_id: str):
    corp = _CORP_BY_SLUG.get(corp_id.lower())
    if corp is None:
        raise HTTPException(404, f"unknown corp: {corp_id}")
    decision = await call_agent(corp, state.STATE)
    state.apply_impacts(decision.metric_impact)
    state.set_active(corp, source=corp)
    await ws.broadcast(state.snapshot())
    return decision.model_dump()


@app.websocket("/ws/telemetry")
async def telemetry(socket: WebSocket):
    await ws.serve(socket)
