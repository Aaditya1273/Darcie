"""
Darcie GraphRAG API — Bridge to Microsoft GraphRAG
Port: 8003

GraphRAG requires a pre-built index. This API wraps the graphrag CLI
to run global/local search queries against an existing index.

Setup (one-time):
  cd graphrag && pip install -e .
  python -m graphrag init --root ./ragindex
  python -m graphrag index --root ./ragindex   # builds the knowledge graph

Endpoints:
  POST /query         { query, method? }  → { answer, context }
  POST /index/init    { documents: [...] } → starts indexing job
  GET  /health                            → { status, index_ready }
"""

import os
import sys
import json
import subprocess
import asyncio
from pathlib import Path
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional, Literal, List

# ── Load env ──────────────────────────────────────────────────────
load_dotenv(Path(__file__).parent / ".env")

# ── Resolve graphrag repo path ────────────────────────────────────
_repo_root = Path(__file__).parent.parent.parent
GRAPHRAG_DIR = os.environ.get("GRAPHRAG_DIR")
_graphrag_path = (Path(__file__).parent / GRAPHRAG_DIR).resolve() if GRAPHRAG_DIR else _repo_root / "graphrag"

# The index lives inside the graphrag repo under ragindex/
RAGINDEX_DIR = str(_graphrag_path / "ragindex")

if str(_graphrag_path) not in sys.path:
    sys.path.insert(0, str(_graphrag_path))

# Check if graphrag package is importable
try:
    import graphrag  # noqa: F401
    GRAPHRAG_AVAILABLE = True
except ImportError:
    GRAPHRAG_AVAILABLE = False
    print("[GraphRAGAPI] WARNING: graphrag package not importable. Run: cd graphrag && pip install -e .")

# ── App ───────────────────────────────────────────────────────────
app = FastAPI(title="Darcie GraphRAG API", version="1.0.0")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

# ── Models ────────────────────────────────────────────────────────
class QueryRequest(BaseModel):
    query: str
    method: Literal["global", "local"] = "global"

class IndexRequest(BaseModel):
    documents: List[str]  # list of text content to index
    reset: bool = False

class QueryResponse(BaseModel):
    answer: str
    method: str
    context: Optional[str] = None

# ── Helpers ───────────────────────────────────────────────────────
def _index_is_ready() -> bool:
    """Check if a GraphRAG index exists and has been built."""
    output_dir = Path(RAGINDEX_DIR) / "output"
    if not output_dir.exists():
        return False
    # Look for parquet files that indicate a completed index
    parquet_files = list(output_dir.rglob("*.parquet"))
    return len(parquet_files) > 0


async def _run_graphrag_query(query: str, method: str) -> str:
    """Run graphrag query CLI and return the response text."""
    cmd = [
        sys.executable, "-m", "graphrag", "query",
        "--root", RAGINDEX_DIR,
        "--method", method,
        "--query", query,
    ]
    env = os.environ.copy()
    # Pass LLM keys to the subprocess
    for key in ("GROQ_API_KEY", "OPENAI_API_KEY", "GOOGLE_API_KEY"):
        val = os.environ.get(key)
        if val:
            env[key] = val

    proc = await asyncio.create_subprocess_exec(
        *cmd,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
        env=env,
        cwd=str(_graphrag_path),
    )
    stdout, stderr = await proc.communicate()

    if proc.returncode != 0:
        err = stderr.decode().strip()
        raise RuntimeError(f"GraphRAG CLI error (code {proc.returncode}): {err}")

    output = stdout.decode().strip()
    # GraphRAG CLI outputs "SUCCESS: ..." prefix — strip it
    if output.startswith("SUCCESS:"):
        output = output[len("SUCCESS:"):].strip()
    return output


# ── Routes ────────────────────────────────────────────────────────
@app.get("/health")
async def health():
    return {
        "status": "ok",
        "graphrag_available": GRAPHRAG_AVAILABLE,
        "index_ready": _index_is_ready(),
        "index_dir": RAGINDEX_DIR,
    }


@app.post("/query", response_model=QueryResponse)
async def graph_query(req: QueryRequest):
    if not GRAPHRAG_AVAILABLE:
        raise HTTPException(503, "graphrag package not available. Run: cd graphrag && pip install -e .")

    if not _index_is_ready():
        raise HTTPException(
            503,
            "GraphRAG index not built yet. POST /index/init with documents first, "
            "or run: python -m graphrag index --root ragindex"
        )

    try:
        answer = await _run_graphrag_query(req.query, req.method)
        return QueryResponse(answer=answer, method=req.method)
    except RuntimeError as e:
        raise HTTPException(500, str(e))
    except Exception as e:
        raise HTTPException(500, f"Query failed: {str(e)}")


@app.post("/index/init")
async def init_index(req: IndexRequest, background_tasks: BackgroundTasks):
    """
    Write documents to the ragindex input folder and kick off indexing.
    Indexing runs in the background — poll /health to check index_ready.
    """
    if not GRAPHRAG_AVAILABLE:
        raise HTTPException(503, "graphrag not available.")

    input_dir = Path(RAGINDEX_DIR) / "input"
    input_dir.mkdir(parents=True, exist_ok=True)

    if req.reset:
        import shutil
        output_dir = Path(RAGINDEX_DIR) / "output"
        if output_dir.exists():
            shutil.rmtree(output_dir)

    # Write each document as a .txt file
    for i, doc in enumerate(req.documents):
        (input_dir / f"doc_{i:04d}.txt").write_text(doc, encoding="utf-8")

    # Kick off indexing in background
    async def _run_index():
        cmd = [sys.executable, "-m", "graphrag", "index", "--root", RAGINDEX_DIR]
        proc = await asyncio.create_subprocess_exec(
            *cmd, cwd=str(_graphrag_path),
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        stdout, stderr = await proc.communicate()
        if proc.returncode != 0:
            print(f"[GraphRAG Index] FAILED: {stderr.decode()}")
        else:
            print(f"[GraphRAG Index] Complete. {len(req.documents)} documents indexed.")

    background_tasks.add_task(_run_index)

    return {
        "status": "indexing_started",
        "documents": len(req.documents),
        "message": "Indexing running in background. Poll GET /health for index_ready=true.",
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8003, log_level="info")
