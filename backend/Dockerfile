FROM python:3.12-slim

# Build context is ./backend (docker-compose). Layout in image:
#   /app/backend/  ← package root (supports `from backend.X` absolute imports)
WORKDIR /app

# Install system deps for some packages (magic, etc.)
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libmagic1 \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt /tmp/requirements.txt
RUN pip install --no-cache-dir -r /tmp/requirements.txt && rm /tmp/requirements.txt

# Place sources under /app/backend so absolute package imports work
COPY . /app/backend/

ENV PYTHONUNBUFFERED=1
ENV PYTHONPATH=/app
EXPOSE 8001

# Image-level HEALTHCHECK (compose may override). Canonical path: /api/health
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=5 \
  CMD python -c "import sys,urllib.request; r=urllib.request.urlopen('http://127.0.0.1:8001/api/health',timeout=5); sys.exit(0 if 200<=r.status<300 else 1)"

# Canonical entrypoint (P0): package-style import path
CMD ["uvicorn", "backend.server:app", "--host", "0.0.0.0", "--port", "8001", "--workers", "1"]
