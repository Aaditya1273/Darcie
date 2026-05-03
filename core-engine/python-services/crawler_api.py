"""
Darcie Crawler API — Bridge to crawl4ai
Port: 8001

Endpoints:
  POST /crawl        { url }           → { markdown, title, links }
  POST /crawl/batch  { urls: [...] }   → [{ url, markdown, title }]
  GET  /health                         → { status }
"""

import os
import sys
import asyncio
from pathlib import Path
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, HttpUrl
from typing import List, Optional

# ── Load env ──────────────────────────────────────────────────────
load_dotenv(Path(__file__).parent / ".env")

# ── Resolve crawl4ai repo path ────────────────────────────────────
_repo_root = Path(__file__).parent.parent.parent  # Sparkle/
CRAWL4AI_DIR = os.environ.get("CRAWL4AI_DIR")
if CRAWL4AI_DIR:
    _crawl4ai_path = (Path(__file__).parent / CRAWL4AI_DIR).resolve()
else:
    _crawl4ai_path = _repo_root / "crawl4ai"

if str(_crawl4ai_path) not in sys.path:
    sys.path.insert(0, str(_crawl4ai_path))

try:
    from crawl4ai import AsyncWebCrawler, BrowserConfig, CrawlerRunConfig, CacheMode
    CRAWL4AI_AVAILABLE = True
except ImportError:
    CRAWL4AI_AVAILABLE = False
    print("[CrawlerAPI] WARNING: crawl4ai not importable. Install deps in crawl4ai/")

# ── App ───────────────────────────────────────────────────────────
app = FastAPI(title="Darcie Crawler API", version="1.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Models ────────────────────────────────────────────────────────
class CrawlRequest(BaseModel):
    url: str
    bypass_cache: bool = False
    extract_links: bool = False

class BatchCrawlRequest(BaseModel):
    urls: List[str]
    bypass_cache: bool = False

class CrawlResult(BaseModel):
    url: str
    markdown: str
    title: Optional[str] = None
    links: Optional[List[str]] = None
    success: bool = True
    error: Optional[str] = None

# ── Browser config (shared, headless) ────────────────────────────
_browser_config = BrowserConfig(headless=True, verbose=False) if CRAWL4AI_AVAILABLE else None

# ── Routes ────────────────────────────────────────────────────────
@app.get("/health")
async def health():
    return {"status": "ok", "crawl4ai_available": CRAWL4AI_AVAILABLE}


@app.post("/crawl", response_model=CrawlResult)
async def crawl(req: CrawlRequest):
    if not CRAWL4AI_AVAILABLE:
        raise HTTPException(503, "crawl4ai not available. Check installation.")
    try:
        run_config = CrawlerRunConfig(
            cache_mode=CacheMode.BYPASS if req.bypass_cache else CacheMode.ENABLED,
            word_count_threshold=10,
        )
        async with AsyncWebCrawler(config=_browser_config) as crawler:
            result = await crawler.arun(url=req.url, config=run_config)

        if not result.success:
            raise HTTPException(500, f"Crawl failed: {result.error_message}")

        links = None
        if req.extract_links and result.links:
            links = [lnk.get("href", "") for lnk in result.links.get("internal", [])[:20]]

        return CrawlResult(
            url=req.url,
            markdown=result.markdown or "",
            title=result.metadata.get("title") if result.metadata else None,
            links=links,
            success=True,
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, f"Crawler error: {str(e)}")


@app.post("/crawl/batch", response_model=List[CrawlResult])
async def crawl_batch(req: BatchCrawlRequest):
    if not CRAWL4AI_AVAILABLE:
        raise HTTPException(503, "crawl4ai not available.")
    if len(req.urls) > 10:
        raise HTTPException(400, "Max 10 URLs per batch request.")

    run_config = CrawlerRunConfig(
        cache_mode=CacheMode.BYPASS if req.bypass_cache else CacheMode.ENABLED,
        word_count_threshold=10,
    )

    results = []
    async with AsyncWebCrawler(config=_browser_config) as crawler:
        tasks = [crawler.arun(url=url, config=run_config) for url in req.urls]
        raw_results = await asyncio.gather(*tasks, return_exceptions=True)

    for url, raw in zip(req.urls, raw_results):
        if isinstance(raw, Exception):
            results.append(CrawlResult(url=url, markdown="", success=False, error=str(raw)))
        elif not raw.success:
            results.append(CrawlResult(url=url, markdown="", success=False, error=raw.error_message))
        else:
            results.append(CrawlResult(
                url=url,
                markdown=raw.markdown or "",
                title=raw.metadata.get("title") if raw.metadata else None,
                success=True,
            ))
    return results


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8001, log_level="info")
