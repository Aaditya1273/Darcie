#!/bin/bash

# Darcie Core Engine - Unified Boot Script
echo "======================================"
echo "🧠 Booting Darcie Core Engine..."
echo "======================================"

# Ensure script stops on first error
set -e

# Directory setup
BASE_DIR="$(pwd)"
PYTHON_SERVICES_DIR="$BASE_DIR/python-services"

# Function to cleanly kill all background processes on exit
cleanup() {
    echo ""
    echo "🛑 Shutting down Darcie services..."
    kill $(jobs -p) 2>/dev/null
    exit
}

trap cleanup EXIT INT TERM

# 0. Activate Darcie Production Environment (Python Venv)
if [ -d "$BASE_DIR/venv-darcie" ]; then
    echo "📦 Activating Darcie Production Environment..."
    source "$BASE_DIR/venv-darcie/bin/activate"
else
    echo "⚠️ Warning: Production Environment not found. Falling back to global system python."
fi

# 1. Boot Python Bridge APIs (FastAPI)
echo "🚀 Starting Python Microservices..."
cd "$PYTHON_SERVICES_DIR"

# Note: In production, these should be run in their respective virtual environments
# if the master repos require different dependency trees. For now, we boot them using the global uvicorn.

echo " -> Booting Crawler API (Port 8001)"
uvicorn crawler_api:app --host 127.0.0.1 --port 8001 &
sleep 1

echo " -> Booting PPT API (Port 8002)"
uvicorn ppt_api:app --host 127.0.0.1 --port 8002 &
sleep 1

echo " -> Booting GraphRAG API (Port 8003)"
uvicorn graphrag_api:app --host 127.0.0.1 --port 8003 &
sleep 1

echo " -> Booting Presenton API (Port 8005)"
uvicorn presenton_api:app --host 127.0.0.1 --port 8005 &
sleep 1

echo " -> Booting Image API (Port 8006)"
uvicorn image_api:app --host 127.0.0.1 --port 8006 &
sleep 1

# 2. Boot TS Orchestrator & Frontend (Next.js)
echo "🚀 Starting Next.js Orchestrator (Port 3000)..."
cd "$BASE_DIR"
npm run dev &

echo "======================================"
echo "✅ Darcie is LIVE."
echo "Frontend: http://localhost:3000"
echo "API Bridges: 8001 (Crawler), 8002 (PPT), 8003 (GraphRAG), 8005 (Presenton), 8006 (Image)"
echo "Note: Perplexica is assumed to be running on Port 3001"
echo "Press Ctrl+C to safely shutdown all services."
echo "======================================"

# Wait indefinitely to keep background processes running
wait
