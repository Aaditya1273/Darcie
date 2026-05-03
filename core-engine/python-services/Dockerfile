FROM python:3.11-slim

WORKDIR /app/python-services

# System deps for crawl4ai (playwright) and psycopg2
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl build-essential libpq-dev \
    && rm -rf /var/lib/apt/lists/*

# Install Python bridge deps
COPY core-engine/python-services/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy bridge API files
COPY core-engine/python-services/*.py .
COPY core-engine/python-services/.env .

# Install crawl4ai (from cloned repo)
COPY crawl4ai /app/crawl4ai
RUN pip install --no-cache-dir -e /app/crawl4ai[all] && \
    playwright install chromium --with-deps

# Install graphrag (from cloned repo)
COPY graphrag /app/graphrag
RUN pip install --no-cache-dir -e /app/graphrag

# Install ppt-master deps
COPY ppt-master /app/ppt-master
RUN if [ -f /app/ppt-master/requirements.txt ]; then \
    pip install --no-cache-dir -r /app/ppt-master/requirements.txt; fi

ENV CRAWL4AI_DIR=/app/crawl4ai
ENV GRAPHRAG_DIR=/app/graphrag
ENV PPT_MASTER_DIR=/app/ppt-master/skills/ppt-master

EXPOSE 8001 8002 8003 8005 8006
