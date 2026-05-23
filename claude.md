# CLAUDE.md

Guidance for Claude Code when working in this repository.

## Project Overview

**AI War Room** — a real-time multi-agent simulation built for a hackathon. Four "hacker" LLM agents collaborate on engineering tasks under pressure while a fifth Chaos Agent injects engineering disasters. State is broadcast live to a dark-mode dashboard.

The system is a hackathon demo, not a production product. Optimize for: visual impact, demo reliability, and live-stage robustness. The seed-data fallback is load-bearing — never remove it.

## Architecture

Four roles, one repo:

```
[ FRONTEND UI (Hacker 1) ]
        │              ▲
        │ REST POST    │ WebSocket stream
        ▼              │
[ FASTAPI ENGINE / STATE MACHINE (Hacker 3) ]
        │              ▲
        │ queries      │ structured JSON
        ▼              │
[ GEMINI AGENTS LAYER (Hacker 2) ] ◄── [ Prompts / seed.json (Hacker 4) ]
```

**Tick loop (every 3 seconds):**
1. Hacker 3's async loop picks the next active hacker agent and pulls the current state matrix.
2. Hacker 2 sends the matrix + Hacker 4's system instructions to Gemini, gets a structured JSON decision back.
3. Hacker 3 applies the decision's `metric_impact` to the leaderboard, clamps values to `[0, 100]`, and broadcasts the new state via WebSocket.
4. Hacker 1's frontend animates the affected node, updates charts, and streams the raw JSON.
5. A judge clicking **Launch Chaos Injection** jumps a chaos event to the front of the queue.

## Repo Layout

```
/frontend          # Next.js app (Hacker 1)
  /components
  /pages
  /lib/ws.ts       # WebSocket client + state listener
/backend           # FastAPI server (Hackers 2 + 3)
  main.py          # FastAPI app entrypoint
  agents.py        # Gemini agent instantiation
  state.py         # in-memory state store
  tick.py          # 3-second async game loop
  ws.py            # /ws/telemetry WebSocket route
  schemas.py       # Pydantic models
/prompts           # Hacker 4
  hackers/         # one .md per hacker persona
  chaos_agent.md
/data
  seed.json        # 20 fallback events — DO NOT REMOVE
```

## Key Dependencies

**Frontend:** `reactflow`, `recharts`, `lucide-react`, Next.js
**Backend:** `fastapi`, `uvicorn`, `google-genai`, `pydantic`

## API Contracts

These are stable. Frontend and backend agreed on them up front so each side can mock independently.

### REST

- `POST /api/chaos/trigger` — fires the Chaos Agent, returns a catastrophe payload, mutates global state.
- `POST /api/agent/{agent_id}/query` — forces the named agent to evaluate state and emit a decision payload immediately (out-of-band from the tick loop).

### WebSocket

`/ws/telemetry` — broadcasts the full state package on every tick to all connected clients.

### State Payload Schema

```json
{
  "tick": 14,
  "active_agent": "Agent_Hacker_2",
  "leaderboard": {
    "Hacker_1": {"velocity": 85, "efficiency": 92, "stability": 88, "stress": 12},
    "Hacker_2": {"velocity": 40, "efficiency": 75, "stability": 60, "stress": 65}
  },
  "graph_edges": [
    {"source": "Chaos_Agent", "target": "Agent_Hacker_2", "animated": true}
  ],
  "last_telemetry": {
    "sender": "Agent_Hacker_2",
    "intent": "REFACTOR_BACKEND_PAYLOAD",
    "target": "Agent_Hacker_3",
    "patch_size_kb": 124
  }
}
```

All four metrics (`velocity`, `efficiency`, `stability`, `stress`) are integers clamped to `[0, 100]`.

## Agent Behavior Rules

- Every agent output **must** conform to the Pydantic schema in `backend/schemas.py`. Gemini calls use structured-output config — never accept freeform text.
- Valid intents: `OPTIMIZE_CODE`, `REDUCE_SCOPE`, `SUPPORT_TEAMMATE`. Add new ones in `schemas.py` first, then update prompts.
- If any agent's `stability < 20`, the tick loop injects an emergency "panic" context on the next call to force a recovery action. This is intentional — don't suppress it.
- The four hacker agents have distinct personas (UI, Backend, Stream, Prompt). Persona prompts live in `/prompts/hackers/` and should stay consistent in tone/role across edits.

## Frontend Conventions

- **Single screen, unscrollable.** Three columns + a header. If a feature doesn't fit, redesign — don't add scroll.
- Dark mode only. High-density layout.
- React Flow graph is **static layout** (5 nodes, fixed positions) — only edge animation and node border colors change on state updates.
- Active agent → node border switches to neon green/blue, connecting edge gets `animated: true`.
- Chaos event → central node glows red.
- Telemetry stream auto-scrolls to bottom on every new message.
- Build against the mock state schema above before the backend is wired up.

## Backend Conventions

- State is **in-memory only** (a global dict). No database. The demo is short-lived.
- Tick loop uses `asyncio.sleep(3)`. Don't change the tick rate without updating the spec — the 3-second cadence is what gives the UI room to breathe.
- WebSocket broadcast is fire-and-forget to all clients in the pool. Drop disconnected clients silently.
- Never block the tick loop on a Gemini call. If a call exceeds a reasonable timeout, fall back to `seed.json` and continue.

## Seed Data Fallback

`/data/seed.json` contains 20 pre-written realistic agent decisions and chaos events. This is the **stage safety net** — if Gemini rate-limits or the network drops mid-demo, the system pulls from here. Treat it as production-critical for the demo.

When editing seed events, keep them schema-compliant — they're injected through the same code path as live Gemini outputs.

## What Not to Do

- Don't add a database, auth, or user accounts. This is a single-session demo.
- Don't make the UI scrollable.
- Don't accept freeform LLM output anywhere — always structured JSON.
- Don't remove the seed.json fallback or the panic-loop trigger.
- Don't change the tick rate, the WebSocket path, or the state payload shape without updating both sides.

## Working Guidelines

These bias toward caution over speed. For trivial edits, use judgment — but for anything non-obvious, follow them.

### 1. Think Before Coding

Don't assume. Don't hide confusion. Surface tradeoffs.

- State assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them — don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

### 2. Simplicity First

Minimum code that solves the problem. Nothing speculative.

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask: "Would a senior engineer say this is overcomplicated?" If yes, simplify. This is doubly true here — it's a hackathon demo, not a framework.

### 3. Surgical Changes

Touch only what you must. Clean up only your own mess.

When editing existing code:
- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it — don't delete it.

When your changes create orphans:
- Remove imports/variables/functions that *your* changes made unused.
- Don't remove pre-existing dead code unless asked.

The test: every changed line should trace directly to the request.

### 4. Goal-Driven Execution

Define success criteria. Loop until verified.

Transform tasks into verifiable goals:
- "Add validation" → "Write tests for invalid inputs, then make them pass."
- "Fix the bug" → "Write a test that reproduces it, then make it pass."
- "Refactor X" → "Ensure tests pass before and after."

For multi-step tasks, state a brief plan:

```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]
```

Strong success criteria let you loop independently. Weak criteria ("make it work") force constant clarification.

## Demo-Day Checklist

- Seed fallback verified by simulating a Gemini outage.
- All four agents produce visibly distinct outputs (persona test).
- Chaos button produces a dramatic visible effect within one tick.
- WebSocket reconnects cleanly if the browser tab is refreshed.
- No console errors on the dashboard during a 5-minute idle run.