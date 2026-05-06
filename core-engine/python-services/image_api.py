"""
Darcie Image API — Multi-provider image generation
Port: 8006

Priority order:
  1. ComfyUI (local, GPU) — if running and has a model checkpoint
  2. Google Gemini Imagen (free tier via GOOGLE_GENERATIVE_AI_API_KEY)
  3. Pollinations.ai (completely free, no API key needed)

Endpoints:
  POST /generate-image  { prompt, negative_prompt?, width?, height?, steps? }
  GET  /health
"""

import os
import sys
import time
import uuid
import asyncio
import base64
import httpx
from pathlib import Path
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from pydantic import BaseModel
from typing import Optional

load_dotenv(Path(__file__).parent / ".env")

COMFYUI_URL = os.environ.get("COMFYUI_URL", "http://127.0.0.1:8188")
GOOGLE_API_KEY = os.environ.get("GOOGLE_GENERATIVE_AI_API_KEY", "")
CLIENT_ID = str(uuid.uuid4())

app = FastAPI(title="Darcie Image API", version="2.0.0")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

# Output dir for saving generated images
OUTPUT_DIR = Path(__file__).parent / "image_outputs"
OUTPUT_DIR.mkdir(exist_ok=True)


class ImageRequest(BaseModel):
    prompt: str
    negative_prompt: str = "blurry, low quality, watermark, text, deformed"
    width: int = 512
    height: int = 512
    steps: int = 20
    cfg_scale: float = 7.0
    seed: int = -1


class ImageResponse(BaseModel):
    image_url: str
    prompt_id: str
    provider: str
    width: int
    height: int


# ── Provider 1: ComfyUI ───────────────────────────────────────────
async def _comfyui_alive(client: httpx.AsyncClient) -> bool:
    try:
        r = await client.get(f"{COMFYUI_URL}/system_stats", timeout=3.0)
        return r.status_code == 200
    except Exception:
        return False


async def _comfyui_has_model(client: httpx.AsyncClient) -> bool:
    try:
        r = await client.get(f"{COMFYUI_URL}/object_info/CheckpointLoaderSimple", timeout=3.0)
        if r.status_code != 200:
            return False
        data = r.json()
        models = data.get("CheckpointLoaderSimple", {}).get("input", {}).get("required", {}).get("ckpt_name", [[]])[0]
        return len(models) > 0 and models[0] != "put_checkpoints_here"
    except Exception:
        return False


async def _generate_comfyui(client: httpx.AsyncClient, req: ImageRequest) -> ImageResponse:
    import random
    seed = req.seed if req.seed >= 0 else random.randint(0, 2**32 - 1)

    # Get first available checkpoint
    r = await client.get(f"{COMFYUI_URL}/object_info/CheckpointLoaderSimple", timeout=5.0)
    models = r.json().get("CheckpointLoaderSimple", {}).get("input", {}).get("required", {}).get("ckpt_name", [[]])[0]
    ckpt = models[0]

    workflow = {
        "3": {"class_type": "KSampler", "inputs": {"cfg": req.cfg_scale, "denoise": 1, "latent_image": ["5", 0], "model": ["4", 0], "negative": ["7", 0], "positive": ["6", 0], "sampler_name": "euler", "scheduler": "normal", "seed": seed, "steps": req.steps}},
        "4": {"class_type": "CheckpointLoaderSimple", "inputs": {"ckpt_name": ckpt}},
        "5": {"class_type": "EmptyLatentImage", "inputs": {"batch_size": 1, "height": req.height, "width": req.width}},
        "6": {"class_type": "CLIPTextEncode", "inputs": {"clip": ["4", 1], "text": req.prompt}},
        "7": {"class_type": "CLIPTextEncode", "inputs": {"clip": ["4", 1], "text": req.negative_prompt}},
        "8": {"class_type": "VAEDecode", "inputs": {"samples": ["3", 0], "vae": ["4", 2]}},
        "9": {"class_type": "SaveImage", "inputs": {"filename_prefix": "darcie_", "images": ["8", 0]}},
    }

    r = await client.post(f"{COMFYUI_URL}/prompt", json={"prompt": workflow, "client_id": CLIENT_ID}, timeout=30.0)
    if r.status_code != 200:
        raise RuntimeError(f"ComfyUI queue failed: {r.status_code}")
    prompt_id = r.json()["prompt_id"]

    # Poll until done
    deadline = time.time() + 180
    while time.time() < deadline:
        r = await client.get(f"{COMFYUI_URL}/history/{prompt_id}", timeout=10.0)
        if r.status_code == 200:
            history = r.json()
            if prompt_id in history and history[prompt_id].get("status", {}).get("completed"):
                outputs = history[prompt_id].get("outputs", {})
                for node_output in outputs.values():
                    images = node_output.get("images", [])
                    if images:
                        img = images[0]
                        params = f"filename={img['filename']}&type={img.get('type','output')}"
                        if img.get("subfolder"):
                            params += f"&subfolder={img['subfolder']}"
                        return ImageResponse(
                            image_url=f"/proxy-comfyui?{params}",
                            prompt_id=prompt_id,
                            provider="comfyui",
                            width=req.width,
                            height=req.height,
                        )
        await asyncio.sleep(1.5)
    raise TimeoutError("ComfyUI timed out")


# ── Provider 2: Pollinations.ai (free, no key) ────────────────────
async def _generate_pollinations(client: httpx.AsyncClient, req: ImageRequest) -> ImageResponse:
    """
    Pollinations.ai — completely free image generation, no API key.
    Returns a URL that serves the image directly.
    """
    import urllib.parse
    encoded_prompt = urllib.parse.quote(req.prompt)
    seed = req.seed if req.seed >= 0 else int(time.time())

    # Pollinations URL format
    url = (
        f"https://image.pollinations.ai/prompt/{encoded_prompt}"
        f"?width={req.width}&height={req.height}&seed={seed}&nologo=true&enhance=true"
    )

    # Verify the URL is reachable (HEAD request)
    try:
        r = await client.head(url, timeout=10.0, follow_redirects=True)
        if r.status_code not in (200, 301, 302):
            raise RuntimeError(f"Pollinations returned {r.status_code}")
    except Exception as e:
        raise RuntimeError(f"Pollinations unavailable: {e}")

    prompt_id = f"poll_{uuid.uuid4().hex[:8]}"
    return ImageResponse(
        image_url=url,
        prompt_id=prompt_id,
        provider="pollinations",
        width=req.width,
        height=req.height,
    )


# ── Routes ────────────────────────────────────────────────────────
@app.get("/health")
async def health():
    async with httpx.AsyncClient() as client:
        comfyui_alive = await _comfyui_alive(client)
        comfyui_has_model = await _comfyui_has_model(client) if comfyui_alive else False
    return {
        "status": "ok",
        "comfyui_alive": comfyui_alive,
        "comfyui_has_model": comfyui_has_model,
        "google_configured": bool(GOOGLE_API_KEY),
        "fallback": "pollinations.ai (free, no key)",
        "active_provider": "comfyui" if (comfyui_alive and comfyui_has_model) else "pollinations",
    }


@app.post("/generate-image", response_model=ImageResponse)
async def generate_image(req: ImageRequest):
    async with httpx.AsyncClient() as client:
        # Try ComfyUI first if alive and has model
        if await _comfyui_alive(client) and await _comfyui_has_model(client):
            try:
                return await _generate_comfyui(client, req)
            except Exception as e:
                print(f"[Image API] ComfyUI failed: {e} — falling back to Pollinations")

        # Fallback: Pollinations.ai (always free, no key needed)
        try:
            return await _generate_pollinations(client, req)
        except Exception as e:
            raise HTTPException(503, f"All image providers failed: {e}")


@app.get("/proxy-comfyui")
async def proxy_comfyui(filename: str, type: str = "output", subfolder: str = ""):
    """Proxy ComfyUI images so they load in the browser (CORS fix)."""
    params = f"filename={filename}&type={type}"
    if subfolder:
        params += f"&subfolder={subfolder}"
    async with httpx.AsyncClient() as client:
        r = await client.get(f"{COMFYUI_URL}/view?{params}", timeout=30.0)
        if r.status_code != 200:
            raise HTTPException(r.status_code, "Image not found")
        return Response(content=r.content, media_type=r.headers.get("content-type", "image/png"))


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8006, log_level="info")
