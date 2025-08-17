# Multi-stage Dockerfile for CPAAutomation backend
FROM python:3.11-slim AS base

# Minimal, predictable runtime
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PYTHONPATH=/app

# System deps
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc g++ libpq-dev \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Dependencies first for layer caching
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# App code
COPY . .

# Worker entrypoint
COPY entrypoint_worker.sh /entrypoint_worker.sh
RUN chmod +x /entrypoint_worker.sh

# Non-root user
RUN useradd --create-home --shell /bin/bash app && chown -R app:app /app /entrypoint_worker.sh
USER app

EXPOSE 8000

# Default command for API service
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "1"]