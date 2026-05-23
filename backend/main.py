"""FastAPI entrypoint. Run with: uvicorn backend.main:app --reload"""

from __future__ import annotations

import asyncio
import logging

from fastapi import FastAPI, HTTPException, WebSocket
from fastapi.middleware.cors import CORSMiddleware

from . import state, tick, ws
from .agents import call_agent, call_chaos
from .schemas import AgentId

logging.basicConfig(level=logging.INFO)

app = FastAPI(title="AI War Room")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


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


@app.post("/api/agent/{agent_id}/query")
async def force_agent(agent_id: str):
    try:
        agent = AgentId(agent_id)
    except ValueError:
        raise HTTPException(404, f"unknown agent: {agent_id}")
    decision = await call_agent(agent, state.STATE)
    state.apply_impacts(decision.metric_impact)
    state.set_active(agent, source=agent)
    await ws.broadcast(state.snapshot())
    return decision.model_dump()


@app.websocket("/ws/telemetry")
async def telemetry(socket: WebSocket):
    await ws.serve(socket)
