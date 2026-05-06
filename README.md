# Darcie AI Workspace

<img width="1908" height="947" alt="image" src="https://github.com/user-attachments/assets/d8ddb012-433e-43bb-8192-162691f7d084" />


A production-grade AI platform that combines web search, deep research, image generation, presentation creation, and persistent memory — all from a single chat interface.

Built by assembling the best open-source AI tools and wiring them together with a central orchestration engine.

---

## Architecture

```
User → core-engine (Next.js 16, port 3000)
         ├── Planner      → Groq Llama 3.3 70B  (intent → task plan)
         ├── Agents x6    → parallel execution   (Promise.allSettled)
         ├── Synthesizer  → Groq Llama 3.3 70B  (combine results)
         └── Memory       → Supabase pgvector    (Cohere embed-v3)

Agents call:
  :8001  crawler-api   → crawl4ai        (web search + scraping)
  :8002  ppt-api       → ppt-master      (PPTX generation)
  :8003  graphrag-api  → Microsoft GraphRAG (knowledge graph research)
  :8005  presenton-api → Presenton FastAPI (styled presentations)presenton_report failed: Error: Presenton API 503: {"detail":"Presenton is not running at http://127.0.0.1:7860. Start it: cd presenton/servers/fastapi && python server.py --port 7860"}
  
      at PresentonAgent.execute (src/lib/agents/presenton_agent.ts:30:13)
  
      at async Object.start (src/app/api/orchestrator/route.ts:191:25)
  
    28 |     if (!res.ok) {
  
    29 |       const err = await res.text()
  
  > 30 |       throw new Error(`Presenton API ${res.status}: ${err}`)
  
       |             ^
  
    31 |     }
  
    32 |
  
    33 |     const data = await res
  :8006  image-api     → ComfyUI          (image generation)
  :3001  searach       → Perplexica fork  (deep web research)

Database: Supabase PostgreSQL (single pooler URL, 25 tables)
  - users, sessions, conversations, messages, memories (pgvector)
  - assets, api_usage, searach_*, presenton_*, mem0_*
```

---

## Quick Start

### Local (recommended for development)

```bash
# 1. Clone and enter
git clone <repo> && cd Sparkle

# 2. Copy env and fill in your keys
cp .env.example core-engine/.env.local
# Edit core-engine/.env.local — DATABASE_URL and LLM keys are required

# 3. Install Node deps
cd core-engine && npm install

# 4. Install Python deps
python3 -m venv venv-darcie
source venv-darcie/bin/activate
pip install -r python-services/requirements.txt

# 5. Start everything
bash run.sh
```

Open http://localhost:3000

### Docker (recommended for production)

```bash
cp .env.example core-engine/.env.local
# Fill in core-engine/.env.local

docker compose up --build
```

---

## Services

| Service | Port | Technology | Role |
|---|---|---|---|
| core-engine | 3000 | Next.js 16, TypeScript | Orchestrator + UI |
| crawler-api | 8001 | FastAPI + crawl4ai | Web search & scraping |
| ppt-api | 8002 | FastAPI + ppt-master | PPTX generation |
| graphrag-api | 8003 | FastAPI + Microsoft GraphRAG | Knowledge graph research |
| presenton-bridge | 8005 | FastAPI proxy | Styled presentations |
| image-api | 8006 | FastAPI + ComfyUI | Image generation |
| presenton | 7860 | FastAPI (SQLModel) | Presentation engine |
| searach | 3001 | Next.js (Perplexica fork) | Deep web research |
| searxng | 8080 | Docker (searxng/searxng) | Meta search engine |
| ComfyUI | 8188 | Python (GPU required) | Image/video generation |

---

## Environment Variables

Copy `.env.example` to `core-engine/.env.local`. Required keys:

| Variable | Where to get it | Required |
|---|---|---|
| `DATABASE_URL` | Supabase → Settings → Database → URI | ✅ |
| `NEXTAUTH_SECRET` | Any 32+ char random string | ✅ |
| `GROQ_API_KEY` | groq.com (free) | ✅ |
| `GOOGLE_GENERATIVE_AI_API_KEY` | aistudio.google.com (free) | ✅ |
| `COHERE_API_KEY` | cohere.com (free, for memory embeddings) | ✅ |
| `NVIDIA_API_KEY` | build.nvidia.com (free tier) | optional |
| `LLM7_API_KEY` | llm7.io (free, LLM fallback) | optional |
| `COMPOSIO_API_KEY` | app.composio.dev (Google Sheets/Docs) | optional |

---

## Database Setup

Run `core-engine/supabase_schema.sql` once in your Supabase SQL editor.

The schema creates:
- `users` + `sessions` — auth
- `conversations` + `messages` — chat history
- `memories` — pgvector memory (1024-dim Cohere embeddings)
- `assets` — generated files (images, PPTs, reports)
- `api_usage` — rate limiting
- `searach_*` — searach chat history
- `presentations` + `slides` + related — Presenton data
- `mem0_*` — Mem0 server auth tables

---

## API Endpoints

| Endpoint | Method | Description |
|---|---|---|
| `/api/orchestrator` | POST | Main chat — streams SSE events |
| `/api/auth/signup` | POST | Create account |
| `/api/auth/signin` | POST | Sign in |
| `/api/auth/signout` | POST | Sign out |
| `/api/auth/me` | GET | Current user |
| `/api/workspace` | POST | SuperAgent (Google Sheets/Docs + slides) |
| `/api/health` | GET | All service health status |
| `/api/graphrag/seed` | POST | Index documents for GraphRAG |

---

## Features

- **Web Search** — crawl4ai scrapes top results via SearXNG, returns clean markdown
- **Deep Research** — searach (Perplexica fork) does multi-step web research with citations
- **Knowledge Graph** — GraphRAG builds a graph from your documents and answers queries
- **PPT Generation** — ppt-master generates real PPTX files with LLM-written content
- **Presentations** — Presenton creates styled AI presentations with slide streaming
- **Image Generation** — ComfyUI runs Stable Diffusion workflows (GPU required)
- **Workspace** — SuperAgent with Google Sheets/Docs integration via Composio
- **Memory** — Supabase pgvector stores conversation context, retrieved per-user
- **Auth** — JWT sessions, PBKDF2 password hashing, no external auth service
- **Rate Limiting** — 60 req/hr logged-in, 10 req/hr guest
- **Streaming** — SSE real-time task progress and response streaming

---

## One-Time Setup Steps

After first run, these make the full feature set work:

**GraphRAG** (knowledge graph research):
```bash
curl -X POST http://localhost:8003/index/init \
  -H "Content-Type: application/json" \
  -d '{"documents": ["Your document text here..."]}'
# Or via the API (auth required):
curl -X POST http://localhost:3000/api/graphrag/seed \
  -H "Content-Type: application/json" \
  -d '{"urls": ["https://example.com/doc1", "https://example.com/doc2"]}'
```

**ComfyUI** (image generation):
```bash
# Download a checkpoint model into ComfyUI/models/checkpoints/
# Recommended: v1-5-pruned-emaonly.ckpt (SD 1.5, ~4GB)
# Then start: cd ComfyUI && python main.py --port 8188
```

**searach** (deep research):
```bash
# Start searach, open http://localhost:3001/settings
# Add a Groq provider with your GROQ_API_KEY
# The provider ID must match SEARACH_PROVIDER_ID in .env.local
```

---

## Tech Stack

**Frontend:** Next.js 16, React 19, TypeScript 5  
**Backend:** Python 3.11, FastAPI, Node.js  
**Database:** Supabase PostgreSQL + pgvector  
**LLMs:** Groq (Llama 3.3 70B), Google Gemini 1.5 Flash, NVIDIA (Llama 3.1 70B), LLM7  
**Embeddings:** Cohere embed-english-v3.0 (1024 dims)  
**ML:** PyTorch, ComfyUI, Microsoft GraphRAG, Transformers  
**Scraping:** crawl4ai, Playwright, SearXNG  
**Auth:** Web Crypto API (PBKDF2 + HMAC-SHA256), JWT, httpOnly cookies  
