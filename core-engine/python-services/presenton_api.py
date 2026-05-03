"""
Darcie Presenton API — Bridge to Presenton FastAPI server
Port: 8005

Presenton is a full presentation generation system with its own FastAPI backend.
This bridge proxies requests to Presenton's API and returns results.

Presenton must be running separately:
  cd presenton/servers/fastapi && python server.py --port 7860

Endpoints:
  POST /generate-report  { topic, context?, n_slides?, template? }
  POST /generate-ppt     { topic, context?, n_slides? }   (alias)
  GET  /presentations    → list all generated presentations
  GET  /health
"""

import os
import asyncio
import httpx
from pathlib import Path
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional, List

# ── Load env ──────────────────────────────────────────────────────
load_dotenv(Path(__file__).parent / ".env")

PRESENTON_URL = os.environ.get("PRESENTON_URL", "http://127.0.0.1:7860")

# ── App ───────────────────────────────────────────────────────────
app = FastAPI(title="Darcie Presenton Bridge API", version="1.0.0")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

# ── Models ────────────────────────────────────────────────────────
class ReportRequest(BaseModel):
    topic: str
    context: str = ""
    n_slides: int = 8
    template: str = "default"
    language: str = "English"
    tone: str = "professional"
    web_search: bool = False

class ReportResponse(BaseModel):
    presentation_id: str
    title: str
    file_path: Optional[str] = None
    view_url: str
    slide_count: int

# ── Helpers ───────────────────────────────────────────────────────
async def _check_presenton_alive(client: httpx.AsyncClient) -> bool:
    try:
        r = await client.get(f"{PRESENTON_URL}/api/v1/ppt/presentation/all", timeout=3.0)
        return r.status_code in (200, 404)
    except Exception:
        return False


async def _create_presentation(client: httpx.AsyncClient, req: ReportRequest) -> dict:
    """Step 1: Create a presentation record in Presenton."""
    content = req.topic
    if req.context:
        content += f"\n\n{req.context[:3000]}"

    payload = {
        "content": content,
        "n_slides": req.n_slides,
        "language": req.language,
        "tone": req.tone,
        "web_search": req.web_search,
        "include_title_slide": True,
        "include_table_of_contents": req.n_slides >= 5,
    }

    r = await client.post(
        f"{PRESENTON_URL}/api/v1/ppt/presentation/create",
        json=payload,
        timeout=30.0,
    )
    if r.status_code != 200:
        raise RuntimeError(f"Presenton create failed ({r.status_code}): {r.text}")
    return r.json()


async def _stream_outlines(client: httpx.AsyncClient, presentation_id: str) -> dict:
    """Step 2: Stream outline generation, collect final presentation state."""
    final_presentation = None
    async with client.stream(
        "GET",
        f"{PRESENTON_URL}/api/v1/ppt/outlines/stream/{presentation_id}",
        timeout=120.0,
    ) as response:
        if response.status_code != 200:
            raise RuntimeError(f"Presenton outline stream failed ({response.status_code})")
        async for line in response.aiter_lines():
            line = line.strip()
            if not line or not line.startswith("data:"):
                continue
            import json
            try:
                data = json.loads(line[5:].strip())
                if data.get("type") == "complete" and "presentation" in data:
                    final_presentation = data["presentation"]
            except Exception:
                pass
    return final_presentation


async def _prepare_and_stream(
    client: httpx.AsyncClient,
    presentation_id: str,
    presentation_data: dict,
) -> dict:
    """Step 3: Prepare with default layout, then stream slide generation."""
    import json

    # Use the first available layout
    layout_r = await client.get(f"{PRESENTON_URL}/api/v1/ppt/presentation/{presentation_id}", timeout=10.0)
    if layout_r.status_code != 200:
        raise RuntimeError("Could not fetch presentation for preparation")

    pres = layout_r.json()
    outlines = pres.get("outlines", {}).get("slides", [])

    # Prepare with default layout
    prepare_payload = {
        "presentation_id": presentation_id,
        "outlines": outlines,
        "layout": {"name": "default", "slides": [], "ordered": False},
    }
    prep_r = await client.post(
        f"{PRESENTON_URL}/api/v1/ppt/presentation/prepare",
        json=prepare_payload,
        timeout=30.0,
    )
    if prep_r.status_code != 200:
        raise RuntimeError(f"Presenton prepare failed ({prep_r.status_code}): {prep_r.text}")

    # Stream slide generation
    final_presentation = None
    async with client.stream(
        "GET",
        f"{PRESENTON_URL}/api/v1/ppt/presentation/stream/{presentation_id}",
        timeout=300.0,
    ) as response:
        async for line in response.aiter_lines():
            line = line.strip()
            if not line or not line.startswith("data:"):
                continue
            try:
                data = json.loads(line[5:].strip())
                if data.get("type") == "complete" and "presentation" in data:
                    final_presentation = data["presentation"]
            except Exception:
                pass

    return final_presentation or pres


# ── Routes ────────────────────────────────────────────────────────
@app.get("/health")
async def health():
    async with httpx.AsyncClient() as client:
        alive = await _check_presenton_alive(client)
    return {
        "status": "ok",
        "presenton_url": PRESENTON_URL,
        "presenton_alive": alive,
    }


@app.post("/generate-report", response_model=ReportResponse)
@app.post("/generate-ppt", response_model=ReportResponse)
async def generate_report(req: ReportRequest):
    async with httpx.AsyncClient() as client:
        # 1. Check Presenton is running
        if not await _check_presenton_alive(client):
            raise HTTPException(
                503,
                f"Presenton is not running at {PRESENTON_URL}. "
                "Start it: cd presenton/servers/fastapi && python server.py --port 7860"
            )

        # 2. Create presentation
        try:
            pres = await _create_presentation(client, req)
            presentation_id = str(pres["id"])
        except RuntimeError as e:
            raise HTTPException(500, f"Failed to create presentation: {e}")

        # 3. Generate outlines
        try:
            await _stream_outlines(client, presentation_id)
        except RuntimeError as e:
            raise HTTPException(500, f"Failed to generate outlines: {e}")

        # 4. Prepare + stream slides
        try:
            final = await _prepare_and_stream(client, presentation_id, pres)
        except RuntimeError as e:
            raise HTTPException(500, f"Failed to generate slides: {e}")

        title = (final or pres).get("title", req.topic)
        slide_count = len((final or pres).get("slides", [])) or req.n_slides
        view_url = f"{PRESENTON_URL}/presentation/{presentation_id}"

        return ReportResponse(
            presentation_id=presentation_id,
            title=title,
            view_url=view_url,
            slide_count=slide_count,
        )


@app.get("/presentations")
async def list_presentations():
    async with httpx.AsyncClient() as client:
        r = await client.get(f"{PRESENTON_URL}/api/v1/ppt/presentation/all", timeout=10.0)
        if r.status_code != 200:
            raise HTTPException(503, "Presenton not available")
        return r.json()


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8005, log_level="info")
