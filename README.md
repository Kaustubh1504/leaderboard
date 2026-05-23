# AI War Room

Real-time multi-agent simulation. Four LLM "hacker" agents collaborate on
engineering tasks under pressure while a fifth Chaos Agent injects disasters.
State is broadcast live to a dark-mode dashboard.

See [CLAUDE.md](./CLAUDE.md) for the architecture, contracts, and ground rules.

## Run

```bash
# backend
python -m venv .venv && source .venv/bin/activate
pip install -r backend/requirements.txt
export GEMINI_API_KEY=...      # optional; seed.json fallback runs without it
uvicorn backend.main:app --reload --port 8000

# frontend (separate terminal)
cd frontend
npm install
npm run dev
# open http://localhost:3000
```

## Layout

- `backend/` — FastAPI engine, Gemini agents, 3s tick loop, WebSocket broadcast
- `frontend/` — Next.js dashboard (graph + leaderboard + telemetry stream)
- `prompts/` — persona prompts and the chaos agent prompt
- `data/seed.json` — 20 fallback events. **Load-bearing — do not remove.**
