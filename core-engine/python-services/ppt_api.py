"""
Darcie PPT API — Bridge to ppt-master
Port: 8002

ppt-master is an AI-driven PPTX generation system.
Pipeline: topic → LLM outline → SVG slides → PPTX export

This bridge runs the full pipeline using ppt-master's scripts:
  1. project_manager.py init       — create project folder
  2. LLM generates slide markdown  — via Groq (fast, free)
  3. total_md_split.py             — split markdown into per-slide files
  4. finalize_svg.py               — render SVGs
  5. svg_to_pptx.py                — export to PPTX

Endpoints:
  POST /generate-ppt  { topic, slide_count?, style? }  → { file_path, download_url }
  GET  /health
"""

import os
import sys
import json
import asyncio
import subprocess
import tempfile
import shutil
from pathlib import Path
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional

# ── Load env ──────────────────────────────────────────────────────
load_dotenv(Path(__file__).parent / ".env")

# ── Resolve ppt-master path ───────────────────────────────────────
_repo_root = Path(__file__).parent.parent.parent
PPT_MASTER_DIR_ENV = os.environ.get("PPT_MASTER_DIR")
if PPT_MASTER_DIR_ENV:
    PPT_SKILL_DIR = (Path(__file__).parent / PPT_MASTER_DIR_ENV).resolve()
else:
    PPT_SKILL_DIR = _repo_root / "ppt-master" / "skills" / "ppt-master"

SCRIPTS_DIR = PPT_SKILL_DIR / "scripts"
PROJECTS_DIR = PPT_SKILL_DIR / "projects"
PROJECTS_DIR.mkdir(parents=True, exist_ok=True)

# ── App ───────────────────────────────────────────────────────────
app = FastAPI(title="Darcie PPT API", version="1.0.0")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

# ── Models ────────────────────────────────────────────────────────
class PPTRequest(BaseModel):
    topic: str
    slide_count: int = 8
    style: str = "professional"
    context: str = ""  # optional pre-researched content to use

class PPTResponse(BaseModel):
    file_path: str
    download_url: str
    project_name: str
    slide_count: int

# ── Helpers ───────────────────────────────────────────────────────
async def _run_script(script: Path, *args, cwd: Path = None) -> tuple[str, str]:
    """Run a ppt-master script asynchronously, return (stdout, stderr)."""
    cmd = [sys.executable, str(script)] + list(args)
    env = os.environ.copy()
    # Forward LLM keys
    for key in ("GROQ_API_KEY", "OPENAI_API_KEY", "GOOGLE_API_KEY", "GOOGLE_GENERATIVE_AI_API_KEY"):
        val = os.environ.get(key)
        if val:
            env[key] = val

    proc = await asyncio.create_subprocess_exec(
        *cmd,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
        env=env,
        cwd=str(cwd or SCRIPTS_DIR),
    )
    stdout, stderr = await proc.communicate()
    if proc.returncode != 0:
        raise RuntimeError(
            f"Script {script.name} failed (code {proc.returncode}):\n{stderr.decode()}"
        )
    return stdout.decode(), stderr.decode()


async def _generate_slide_markdown(topic: str, slide_count: int, context: str) -> str:
    """
    Use Groq Llama 3.3 70B to generate structured slide markdown.
    Returns a single markdown string with slide separators.
    """
    import httpx

    groq_key = os.environ.get("GROQ_API_KEY")
    if not groq_key:
        raise RuntimeError("GROQ_API_KEY not set. Cannot generate slide content.")

    system_prompt = (
        "You are an expert presentation designer. "
        "Generate structured slide content in markdown format. "
        f"Create exactly {slide_count} slides separated by '---'. "
        "Each slide should have: # Title, bullet points or short paragraphs. "
        "Be concise, professional, and visually structured."
    )

    user_prompt = f"Create a {slide_count}-slide presentation about: {topic}"
    if context:
        user_prompt += f"\n\nUse this research context:\n{context[:3000]}"

    payload = {
        "model": "llama-3.3-70b-versatile",
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
        "temperature": 0.7,
        "max_tokens": 4000,
    }

    async with httpx.AsyncClient(timeout=60.0) as client:
        r = await client.post(
            "https://api.groq.com/openai/v1/chat/completions",
            headers={"Authorization": f"Bearer {groq_key}", "Content-Type": "application/json"},
            json=payload,
        )
        if r.status_code != 200:
            raise RuntimeError(f"Groq API error {r.status_code}: {r.text}")
        data = r.json()
        return data["choices"][0]["message"]["content"]


# ── Routes ────────────────────────────────────────────────────────
@app.get("/health")
async def health():
    scripts_exist = SCRIPTS_DIR.exists()
    return {
        "status": "ok",
        "ppt_skill_dir": str(PPT_SKILL_DIR),
        "scripts_available": scripts_exist,
    }


@app.post("/generate-ppt", response_model=PPTResponse)
async def generate_ppt(req: PPTRequest):
    # Sanitize project name
    project_name = req.topic.replace(" ", "_").replace("/", "_")[:30]
    project_path = PROJECTS_DIR / project_name

    try:
        # ── Step 1: Init project ──────────────────────────────────
        init_script = SCRIPTS_DIR / "project_manager.py"
        if not init_script.exists():
            raise HTTPException(503, f"ppt-master scripts not found at {SCRIPTS_DIR}")

        await _run_script(init_script, "init", project_name, "--format", "ppt169")
        print(f"[PPT API] Project initialized: {project_name}")

        # ── Step 2: Generate slide markdown via LLM ───────────────
        slide_markdown = await _generate_slide_markdown(
            topic=req.topic,
            slide_count=req.slide_count,
            context=req.context,
        )
        print(f"[PPT API] Slide markdown generated ({len(slide_markdown)} chars)")

        # Write the markdown to the project's source file
        source_dir = project_path / "sources"
        source_dir.mkdir(parents=True, exist_ok=True)
        (source_dir / "content.md").write_text(slide_markdown, encoding="utf-8")

        # ── Step 3: Split markdown into per-slide files ───────────
        split_script = SCRIPTS_DIR / "total_md_split.py"
        if split_script.exists():
            await _run_script(split_script, str(project_path))
            print(f"[PPT API] Markdown split complete")

        # ── Step 4: Finalize SVGs ─────────────────────────────────
        finalize_script = SCRIPTS_DIR / "finalize_svg.py"
        if finalize_script.exists():
            await _run_script(finalize_script, str(project_path))
            print(f"[PPT API] SVG finalization complete")

        # ── Step 5: Export to PPTX ────────────────────────────────
        export_script = SCRIPTS_DIR / "svg_to_pptx.py"
        if not export_script.exists():
            raise HTTPException(503, "svg_to_pptx.py not found in ppt-master scripts")

        await _run_script(export_script, str(project_path), "-s", "final")
        print(f"[PPT API] PPTX export complete")

        # ── Find the output file ──────────────────────────────────
        export_dir = project_path / "export"
        pptx_files = list(export_dir.glob("*.pptx")) if export_dir.exists() else []

        if not pptx_files:
            # Fallback: search entire project dir
            pptx_files = list(project_path.rglob("*.pptx"))

        if not pptx_files:
            raise HTTPException(500, "PPTX file not found after export. Check ppt-master logs.")

        pptx_path = str(pptx_files[0])
        download_url = f"/download-ppt/{project_name}"

        return PPTResponse(
            file_path=pptx_path,
            download_url=download_url,
            project_name=project_name,
            slide_count=req.slide_count,
        )

    except HTTPException:
        raise
    except RuntimeError as e:
        raise HTTPException(500, f"PPT pipeline error: {str(e)}")
    except Exception as e:
        raise HTTPException(500, f"Unexpected error: {str(e)}")


@app.get("/download-ppt/{project_name}")
async def download_ppt(project_name: str):
    """Serve the generated PPTX file for download."""
    project_path = PROJECTS_DIR / project_name
    pptx_files = list(project_path.rglob("*.pptx"))
    if not pptx_files:
        raise HTTPException(404, f"No PPTX found for project: {project_name}")
    return FileResponse(
        path=str(pptx_files[0]),
        media_type="application/vnd.openxmlformats-officedocument.presentationml.presentation",
        filename=f"{project_name}.pptx",
    )


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8002, log_level="info")
