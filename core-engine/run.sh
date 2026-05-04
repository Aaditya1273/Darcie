#!/bin/bash
# ══════════════════════════════════════════════════════════════════
# Darcie — Unified Boot Script
# Usage: cd core-engine && bash run.sh
# ══════════════════════════════════════════════════════════════════

set -e

BASE_DIR="$(cd "$(dirname "$0")" && pwd)"
PY_SERVICES="$BASE_DIR/python-services"
REPO_ROOT="$(dirname "$BASE_DIR")"

# ── Colors ────────────────────────────────────────────────────────
GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; NC='\033[0m'
info()  { echo -e "${GREEN}[Darcie]${NC} $1"; }
warn()  { echo -e "${YELLOW}[Darcie]${NC} $1"; }
error() { echo -e "${RED}[Darcie]${NC} $1"; }

# ── Cleanup on exit ───────────────────────────────────────────────
cleanup() {
  echo ""
  warn "Shutting down all Darcie services..."
  kill $(jobs -p) 2>/dev/null || true
  exit 0
}
trap cleanup EXIT INT TERM

echo ""
echo "══════════════════════════════════════════════"
echo "  🧠 Darcie AI Workspace — Starting Up"
echo "══════════════════════════════════════════════"
echo ""

# ── Kill any existing processes on our ports ──────────────────────
info "Clearing ports 8001-8006..."
for PORT in 8001 8002 8003 8005 8006; do
  PID=$(lsof -ti tcp:$PORT 2>/dev/null || true)
  if [ -n "$PID" ]; then
    kill -9 $PID 2>/dev/null || true
    info "  Killed existing process on port $PORT (PID $PID)"
  fi
done
sleep 0.5

# ── Python venv ───────────────────────────────────────────────────
if [ -d "$BASE_DIR/venv-darcie" ]; then
  info "Activating Python venv..."
  source "$BASE_DIR/venv-darcie/bin/activate"
else
  warn "No venv-darcie found. Using system Python."
  warn "To create: python3 -m venv venv-darcie && source venv-darcie/bin/activate"
  warn "Then: pip install -r python-services/requirements.txt"
fi

# ── Check Python deps ─────────────────────────────────────────────
if ! python3 -c "import fastapi, uvicorn, httpx" 2>/dev/null; then
  warn "Python deps missing. Installing..."
  pip install -r "$PY_SERVICES/requirements.txt" -q
fi

# ── Boot Python bridge services ───────────────────────────────────
info "Starting Python bridge services..."
cd "$PY_SERVICES"

info "  → Crawler API        (port 8001) — crawl4ai"
uvicorn crawler_api:app --host 127.0.0.1 --port 8001 --log-level warning &
sleep 0.5

info "  → PPT API            (port 8002) — ppt-master"
uvicorn ppt_api:app --host 127.0.0.1 --port 8002 --log-level warning &
sleep 0.5

info "  → GraphRAG API       (port 8003) — Microsoft GraphRAG"
uvicorn graphrag_api:app --host 127.0.0.1 --port 8003 --log-level warning &
sleep 0.5

info "  → Presenton Bridge   (port 8005) — Presenton FastAPI"
uvicorn presenton_api:app --host 127.0.0.1 --port 8005 --log-level warning &
sleep 0.5

info "  → Image API          (port 8006) — ComfyUI bridge"
uvicorn image_api:app --host 127.0.0.1 --port 8006 --log-level warning &
sleep 0.5

# ── External services (must be started separately) ────────────────
echo ""
warn "External services (start these manually if not running):"
warn "  ComfyUI:   cd $REPO_ROOT/ComfyUI && python main.py --port 8188"
warn "  Presenton: cd $REPO_ROOT/presenton/servers/fastapi && python server.py --port 7860"
warn "  searach:   cd $REPO_ROOT/searach && npm run dev -- --port 3001"
warn "  SearXNG:   docker run -p 8080:8080 searxng/searxng"
echo ""

# ── Boot Next.js orchestrator ─────────────────────────────────────
info "Starting Next.js Orchestrator (port 3000)..."
cd "$BASE_DIR"
npm run dev &

echo ""
echo "══════════════════════════════════════════════"
echo -e "  ${GREEN}✅ Darcie is LIVE${NC}"
echo ""
echo "  Frontend:    http://localhost:3000"
echo "  Crawler:     http://localhost:8001/health"
echo "  PPT:         http://localhost:8002/health"
echo "  GraphRAG:    http://localhost:8003/health"
echo "  Presenton:   http://localhost:8005/health"
echo "  Image:       http://localhost:8006/health"
echo ""
echo "  Press Ctrl+C to stop all services."
echo "══════════════════════════════════════════════"
echo ""

wait
