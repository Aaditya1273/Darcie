# Darcie Core Engine

The central orchestration hub for the Darcie AI Workspace.

## What it does

Takes a user query → plans tasks with Groq Llama 3.3 70B → runs 6 agents in parallel → synthesizes results → streams back via SSE.

## Start

```bash
# Development
npm install
npm run dev

# Production (all services)
bash run.sh

# Docker
docker compose up --build   # from repo root
```

## Structure

```
src/
  app/
    page.tsx              — Main chat UI
    workspace/page.tsx    — SuperAgent (Google Sheets/Docs)
    api/
      orchestrator/       — Main chat API (SSE streaming)
      auth/               — signup, signin, signout, me
      workspace/          — SuperAgent API
      health/             — Service health check
      graphrag/seed/      — Index documents for GraphRAG
  lib/
    agents/               — 6 agent clients (search, ppt, graphrag, etc.)
    auth/session.ts       — JWT auth, PBKDF2 password hashing
    db/supabase.ts        — postgres.js connection (DATABASE_URL only)
    memory/chat_memory.ts — pgvector memory via Cohere embeddings
    orchestrator/         — Planner + Synthesizer
python-services/
  crawler_api.py          — crawl4ai bridge (port 8001)
  ppt_api.py              — ppt-master bridge (port 8002)
  graphrag_api.py         — GraphRAG CLI bridge (port 8003)
  presenton_api.py        — Presenton FastAPI proxy (port 8005)
  image_api.py            — ComfyUI HTTP bridge (port 8006)
```

## Environment

Copy `.env.example` from repo root to `.env.local` here. Required:

```env
DATABASE_URL=postgresql://...   # Supabase pooler URL
NEXTAUTH_SECRET=...             # 32+ char random string
GROQ_API_KEY=...
GOOGLE_GENERATIVE_AI_API_KEY=...
COHERE_API_KEY=...
```

## API

| Route | Description |
|---|---|
| `POST /api/orchestrator` | Main chat — SSE stream of events |
| `POST /api/auth/signup` | Create account |
| `POST /api/auth/signin` | Sign in, sets httpOnly cookie |
| `POST /api/auth/signout` | Clear session |
| `GET  /api/auth/me` | Current user from cookie |
| `POST /api/workspace` | SuperAgent (Composio + slides) |
| `GET  /api/health` | All service statuses |
| `POST /api/graphrag/seed` | Index documents (auth required) |

## SSE Event Types

The orchestrator streams these events:

```
status      → { message: string }           — progress text
plan        → { intent, tasks[] }           — execution plan
task_start  → { type, query }               — agent started
task_done   → { type }                      — agent finished
response    → { text, conversationId, plan } — final answer
error       → { message }                   — something failed
done        → { conversationId }            — stream complete
```
