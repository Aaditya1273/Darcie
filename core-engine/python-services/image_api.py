"""
Darcie Image API — Bridge to ComfyUI
Port: 8006

ComfyUI must be running separately on port 8188 (default).
Start it: cd ComfyUI && python main.py --port 8188

This bridge:
  1. Builds a Flux/SD workflow JSON
  2. POSTs it to ComfyUI /prompt
  3. Polls /history/{prompt_id} until done
  4. Returns the image URL served by ComfyUI

Endpoints:
  POST /generate-image  { prompt, negative_prompt?, width?, height?, steps? }
  GET  /health
"""

import os
import sys
import time
import uuid
import asyncio
import httpx
from pathlib import Path
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional

# ── Load env ──────────────────────────────────────────────────────
load_dotenv(Path(__file__).parent / ".env")

COMFYUI_URL = os.environ.get("COMFYUI_URL", "http://127.0.0.1:8188")
CLIENT_ID = str(uuid.uuid4())  # unique client id for this bridge instance

# ── App ───────────────────────────────────────────────────────────
app = FastAPI(title="Darcie Image API", version="1.0.0")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

# ── Models ────────────────────────────────────────────────────────
class ImageRequest(BaseModel):
    prompt: str
    negative_prompt: str = "blurry, low quality, watermark, text"
    width: int = 512
    height: int = 512
    steps: int = 20
    cfg_scale: float = 7.0
    seed: int = -1  # -1 = random

class ImageResponse(BaseModel):
    image_url: str
    prompt_id: str
    width: int
    height: int

# ── Workflow builder ──────────────────────────────────────────────
def _build_sd_workflow(
    prompt: str,
    negative_prompt: str,
    width: int,
    height: int,
    steps: int,
    cfg: float,
    seed: int,
) -> dict:
    """
    Builds a standard ComfyUI API workflow JSON for SD1.5/SDXL.
    Uses the default checkpoint loaded in ComfyUI.
    This is the minimal workflow: KSampler → VAEDecode → SaveImage
    """
    import random
    actual_seed = seed if seed >= 0 else random.randint(0, 2**32 - 1)

    return {
        "3": {
            "class_type": "KSampler",
            "inputs": {
                "cfg": cfg,
                "denoise": 1,
                "latent_image": ["5", 0],
                "model": ["4", 0],
                "negative": ["7", 0],
                "positive": ["6", 0],
                "sampler_name": "euler",
                "scheduler": "normal",
                "seed": actual_seed,
                "steps": steps,
            },
        },
        "4": {
            "class_type": "CheckpointLoaderSimple",
            "inputs": {"ckpt_name": "v1-5-pruned-emaonly.ckpt"},
        },
        "5": {
            "class_type": "EmptyLatentImage",
            "inputs": {"batch_size": 1, "height": height, "width": width},
        },
        "6": {
            "class_type": "CLIPTextEncode",
            "inputs": {"clip": ["4", 1], "text": prompt},
        },
        "7": {
            "class_type": "CLIPTextEncode",
            "inputs": {"clip": ["4", 1], "text": negative_prompt},
        },
        "8": {
            "class_type": "VAEDecode",
            "inputs": {"samples": ["3", 0], "vae": ["4", 2]},
        },
        "9": {
            "class_type": "SaveImage",
            "inputs": {"filename_prefix": "darcie_", "images": ["8", 0]},
        },
    }


async def _check_comfyui_alive(client: httpx.AsyncClient) -> bool:
    try:
        r = await client.get(f"{COMFYUI_URL}/system_stats", timeout=3.0)
        return r.status_code == 200
    except Exception:
        return False


async def _queue_prompt(client: httpx.AsyncClient, workflow: dict) -> str:
    payload = {"prompt": workflow, "client_id": CLIENT_ID}
    r = await client.post(f"{COMFYUI_URL}/prompt", json=payload, timeout=30.0)
    if r.status_code != 200:
        raise RuntimeError(f"ComfyUI /prompt returned {r.status_code}: {r.text}")
    data = r.json()
    return data["prompt_id"]


async def _poll_until_done(client: httpx.AsyncClient, prompt_id: str, timeout: int = 120) -> dict:
    """Poll /history/{prompt_id} until the job is complete."""
    deadline = time.time() + timeout
    while time.time() < deadline:
        r = await client.get(f"{COMFYUI_URL}/history/{prompt_id}", timeout=10.0)
        if r.status_code == 200:
            history = r.json()
            if prompt_id in history:
                job = history[prompt_id]
                if job.get("status", {}).get("completed", False):
                    return job
        await asyncio.sleep(1.5)
    raise TimeoutError(f"ComfyUI job {prompt_id} did not complete within {timeout}s")


def _extract_image_url(job: dict, prompt_id: str) -> str:
    """Extract the first output image URL from a completed ComfyUI job."""
    outputs = job.get("outputs", {})
    for node_id, node_output in outputs.items():
        images = node_output.get("images", [])
        if images:
            img = images[0]
            filename = img["filename"]
            subfolder = img.get("subfolder", "")
            img_type = img.get("type", "output")
            # Build the ComfyUI view URL
            params = f"filename={filename}&type={img_type}"
            if subfolder:
                params += f"&subfolder={subfolder}"
            return f"{COMFYUI_URL}/view?{params}"
    raise RuntimeError("No output images found in ComfyUI job result")


# ── Routes ────────────────────────────────────────────────────────
@app.get("/health")
async def health():
    async with httpx.AsyncClient() as client:
        alive = await _check_comfyui_alive(client)
    return {
        "status": "ok",
        "comfyui_url": COMFYUI_URL,
        "comfyui_alive": alive,
    }


@app.post("/generate-image", response_model=ImageResponse)
async def generate_image(req: ImageRequest):
    async with httpx.AsyncClient() as client:
        # 1. Check ComfyUI is running
        if not await _check_comfyui_alive(client):
            raise HTTPException(
                503,
                f"ComfyUI is not running at {COMFYUI_URL}. "
                "Start it: cd ComfyUI && python main.py"
            )

        # 2. Build workflow
        workflow = _build_sd_workflow(
            prompt=req.prompt,
            negative_prompt=req.negative_prompt,
            width=req.width,
            height=req.height,
            steps=req.steps,
            cfg=req.cfg_scale,
            seed=req.seed,
        )

        # 3. Queue the prompt
        try:
            prompt_id = await _queue_prompt(client, workflow)
        except RuntimeError as e:
            raise HTTPException(500, f"Failed to queue ComfyUI job: {e}")

        # 4. Poll until done
        try:
            job = await _poll_until_done(client, prompt_id, timeout=180)
        except TimeoutError as e:
            raise HTTPException(504, str(e))

        # 5. Extract image URL
        try:
            image_url = _extract_image_url(job, prompt_id)
        except RuntimeError as e:
            raise HTTPException(500, str(e))

    return ImageResponse(
        image_url=image_url,
        prompt_id=prompt_id,
        width=req.width,
        height=req.height,
    )


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8006, log_level="info")
