# CLAUDE.md

Guidance for Claude Code when working in this repository.

## Project Overview

**NEXUS-OS** — an autonomous multi-agent market simulation built for the Google I/O Hackathon 2026. Three AI corporations (`NexusCorp`, `VertexAI`, `ShadowScale`) compete in a live market: trading, sabotaging, forming alliances, and reacting to macroeconomic shocks. Each corporation runs a Strategy Executive Agent that dynamically provisions sub-agents (Marketing, R&D, Competitive Intelligence). A separate Chaos Operator injects regulatory and supply-chain disasters. State is broadcast live to a dark-mode War Room dashboard.

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
1. Hacker 3's async loop picks the next corporation to act and pulls the current market state matrix.
2. Hacker 2 sends the matrix + Hacker 4's system instructions to Gemini, gets a structured JSON decision back.
3. Hacker 3 applies the decision's `metric_impact` to the leaderboard, clamps values to `[0, 100]` (or appropriate bounds), and broadcasts the new state via WebSocket.
4. Hacker 1's frontend animates the affected node, updates charts, and streams the raw JSON.
5. A judge clicking **Inject Regulatory Shock** (or any chaos button) jumps a chaos event to the front of the queue.

## Repo Layout

```
/frontend          # Next.js app (Hacker 1)
  /components
  /pages
  /lib/ws.ts       # WebSocket client + state listener
/backend           # FastAPI server (Hackers 2 + 3)
  main.py          # FastAPI app entrypoint
  agents.py        # Gemini agent instantiation (3 corp executives + Chaos Operator)
  state.py         # in-memory state store
  tick.py          # 3-second async game loop
  ws.py            # /ws/telemetry WebSocket route
  schemas.py       # Pydantic models
/prompts           # Hacker 4
  corps/           # one .md per corporation persona (NexusCorp, VertexAI, ShadowScale)
  chaos_operator.md
/data
  seed.json        # 20 fallback events — DO NOT REMOVE
```

## Key Dependencies

**Frontend:** `reactflow`, `recharts`, `lucide-react`, Next.js
**Backend:** `fastapi`, `uvicorn`, `google-genai`, `pydantic`

## API Contracts

These are stable. Frontend and backend agreed on them up front so each side can mock independently.

### REST

- `POST /api/chaos/trigger` — fires the Chaos Operator, returns a catastrophe payload (e.g. regulatory shock, supply chain collapse, flash crash), mutates global state.
- `POST /api/agent/{corp_id}/query` — forces the named corporation to evaluate state and emit a strategic decision payload immediately (out-of-band from the tick loop). `corp_id` is one of `nexuscorp`, `vertexai`, `shadowscale`.

### WebSocket

`/ws/telemetry` — broadcasts the full state package on every tick to all connected clients.

### State Payload Schema

```json
{
  "tick": 14,
  "active_agent": "VertexAI",
  "leaderboard": {
    "NexusCorp":   {"stock_value": 142, "cash_reserves": 88, "public_sentiment": 71, "market_share": 34},
    "VertexAI":    {"stock_value":  96, "cash_reserves": 62, "public_sentiment": 55, "market_share": 28},
    "ShadowScale": {"stock_value":  78, "cash_reserves": 41, "public_sentiment": 33, "market_share": 22}
  },
  "graph_edges": [
    {"source": "VertexAI", "target": "NexusCorp", "animated": true}
  ],
  "last_telemetry": {
    "sender": "VertexAI",
    "action": "predatory_pricing",
    "target": "NexusCorp",
    "reason": "hardware_supply_chain_collapse_detected",
    "confidence_score": 0.94,
    "parameters": {"margin_reduction": 0.15, "duration_ticks": 4}
  }
}
```

Metric bounds:
- `stock_value`, `cash_reserves`, `market_share`: integers `[0, 200]` (stock can spike past 100)
- `public_sentiment`: integer `[0, 100]`

If you change a bound, update both `schemas.py` and the frontend chart axes.

## Agent Behavior Rules

- Every agent output **must** conform to the Pydantic schema in `backend/schemas.py`. Gemini calls use structured-output config — never accept freeform text.
- Valid actions: `predatory_pricing`, `acquire_competitor`, `narrative_campaign`, `defensive_pivot`, `rd_investment`, `espionage`. Add new ones in `schemas.py` first, then update prompts.
- If any corporation's `cash_reserves < 15`, the tick loop injects an emergency "insolvency" context on the next call to force a survival action. This is intentional — don't suppress it.
- The three corporations have distinct personas (NexusCorp = market leader / risk-averse, VertexAI = aggressive challenger, ShadowScale = guerilla / narrative-driven). Persona prompts live in `/prompts/corps/` and should stay consistent in tone/role across edits.
- The Chaos Operator is **not** a competitor — it does not have leaderboard metrics. It only emits macroeconomic events that affect all three corporations.

## Frontend Conventions

- **Single screen, unscrollable.** Three columns + a header. If a feature doesn't fit, redesign — don't add scroll.
- Dark mode only. High-density War Room layout.
- React Flow graph is **static layout** — 1 central Chaos Operator node + 3 corporation nodes around it. Only edge animation and node border colors change on state updates.
- Active corporation → node border switches to neon green/blue, connecting edge gets `animated: true`.
- Chaos event → central node glows red, all three corp nodes briefly pulse red.
- Telemetry stream (right column) auto-scrolls to bottom on every new message.
- Market charts (left column): one Recharts line per corp tracking `stock_value` over ticks. Add `public_sentiment` as a secondary series if time allows.
- Build against the mock state schema above before the backend is wired up.

## Backend Conventions

- State is **in-memory only** (a global dict). No database. The demo is short-lived.
- Tick loop uses `asyncio.sleep(3)`. Don't change the tick rate without updating the spec — the 3-second cadence is what gives the UI room to breathe.
- WebSocket broadcast is fire-and-forget to all clients in the pool. Drop disconnected clients silently.
- Never block the tick loop on a Gemini call. If a call exceeds a reasonable timeout, fall back to `seed.json` and continue.

## Seed Data Fallback

`/data/seed.json` contains 20 pre-written realistic corporate decisions and chaos events. This is the **stage safety net** — if Gemini rate-limits or the network drops mid-demo, the system pulls from here. Treat it as production-critical for the demo.

When editing seed events, keep them schema-compliant — they're injected through the same code path as live Gemini outputs.

## Demo Run-Loop (3 minutes)

The live demo is scripted to a tight timeline. The backend tick loop should support an optional "demo mode" that aligns chaos injections to these beats:

- **0:00 – 0:45** — Baseline. Three corps spin up, execute standard trades, telemetry streams cleanly.
- **0:45 – 1:15** — Operator presses the big red button. Regulatory shock fires. Left column flashes red.
- **1:15 – 2:30** — Agentic panic. Corps spin up sub-agents, attempt acquisitions, launch narrative campaigns. Charts spike and plunge.
- **2:30 – 3:00** — Freeze. Show post-mortem panel: token cost ledger, emergent strategies summary.

## What Not to Do

- Don't add a database, auth, or user accounts. This is a single-session demo.
- Don't make the UI scrollable.
- Don't accept freeform LLM output anywhere — always structured JSON.
- Don't remove the seed.json fallback or the insolvency-loop trigger.
- Don't change the tick rate, the WebSocket path, or the state payload shape without updating both sides.
- Don't add talking-head avatars or lip-sync. The whole point of this UI is to show the *system*, not faces.

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
- All three corporations produce visibly distinct outputs (persona test).
- Chaos button produces a dramatic visible effect within one tick.
- WebSocket reconnects cleanly if the browser tab is refreshed.
- No console errors on the dashboard during a 5-minute idle run.
- Demo mode plays the 3-minute scripted timeline cleanly end-to-end.