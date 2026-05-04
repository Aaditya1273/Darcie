"""
Darcie Crawler API — Bridge to crawl4ai
Port: 8001

Falls back to httpx + BeautifulSoup when crawl4ai is unavailable,
so search always works even without a full crawl4ai install.

Endpoints:
  POST /crawl        { url }           → { markdown, title, links }
  POST /crawl/batch  { urls: [...] }   → [{ url, markdown, title }]
  GET  /health                         → { status }
"""

import os
import sys
import asyncio
import re
from pathlib import Path
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
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
    print("[CrawlerAPI] crawl4ai loaded successfully")
except ImportError as e:
    CRAWL4AI_AVAILABLE = False
    print(f"[CrawlerAPI] crawl4ai not available ({e}) — using httpx fallback")

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

# ── Browser config (only when crawl4ai available) ─────────────────
_browser_config = BrowserConfig(headless=True, verbose=False) if CRAWL4AI_AVAILABLE else None

# ── httpx fallback crawler ────────────────────────────────────────
async def _fetch_with_httpx(url: str) -> CrawlResult:
    """
    Lightweight fallback: fetch page with httpx, extract text with
    basic HTML stripping. No JavaScript rendering.
    """
    import httpx

    headers = {
        "User-Agent": (
            "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
            "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        ),
        "Accept": "text/html,application/xhtml+xml,*/*;q=0.9",
        "Accept-Language": "en-US,en;q=0.9",
    }

    async with httpx.AsyncClient(
        follow_redirects=True,
        timeout=20.0,
        headers=headers,
    ) as client:
        resp = await client.get(url)
        resp.raise_for_status()
        html = resp.text

    # Extract title
    title_match = re.search(r"<title[^>]*>(.*?)</title>", html, re.IGNORECASE | re.DOTALL)
    title = title_match.group(1).strip() if title_match else None

    # Strip scripts, styles, nav, footer
    html = re.sub(r"<(script|style|nav|footer|header|aside)[^>]*>.*?</\1>", " ", html,
                  flags=re.IGNORECASE | re.DOTALL)
    # Strip all remaining tags
    text = re.sub(r"<[^>]+>", " ", html)
    # Collapse whitespace
    text = re.sub(r"\s{2,}", "\n", text).strip()
    # Limit size
    markdown = text[:8000]

    return CrawlResult(url=url, markdown=markdown, title=title, success=True)


async def _crawl_one(url: str, bypass_cache: bool = False) -> CrawlResult:
    """Crawl a single URL — use crawl4ai if available, else httpx."""
    if CRAWL4AI_AVAILABLE:
        try:
            run_config = CrawlerRunConfig(
                cache_mode=CacheMode.BYPASS if bypass_cache else CacheMode.ENABLED,
                word_count_threshold=10,
            )
            async with AsyncWebCrawler(config=_browser_config) as crawler:
                result = await crawler.arun(url=url, config=run_config)
            if result.success:
                return CrawlResult(
                    url=url,
                    markdown=str(result.markdown) if result.markdown else "",
                    title=result.metadata.get("title") if result.metadata else None,
                    success=True,
                )
        except Exception as e:
            print(f"[CrawlerAPI] crawl4ai failed for {url}: {e} — falling back to httpx")

    # httpx fallback
    try:
        return await _fetch_with_httpx(url)
    except Exception as e:
        return CrawlResult(url=url, markdown="", success=False, error=str(e))


# ── Routes ────────────────────────────────────────────────────────
@app.get("/health")
async def health():
    return {
        "status": "ok",
        "crawl4ai_available": CRAWL4AI_AVAILABLE,
        "fallback": "httpx+regex",
    }


@app.post("/crawl", response_model=CrawlResult)
async def crawl(req: CrawlRequest):
    result = await _crawl_one(req.url, req.bypass_cache)
    if not result.success:
        raise HTTPException(500, f"Crawl failed: {result.error}")
    return result


@app.post("/crawl/batch", response_model=List[CrawlResult])
async def crawl_batch(req: BatchCrawlRequest):
    if len(req.urls) > 10:
        raise HTTPException(400, "Max 10 URLs per batch request.")
    tasks = [_crawl_one(url, req.bypass_cache) for url in req.urls]
    return await asyncio.gather(*tasks)


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8001, log_level="info")
