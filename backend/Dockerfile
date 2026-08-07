# Multi-stage Dockerfile for CPAAutomation backend
FROM python:3.11-slim AS base

# Minimal, predictable runtime
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PYTHONPATH=/app \
    HOME=/tmp

# The API converts E-Signature Word uploads to canonical PDFs synchronously.
# PBC uploads fail closed, so the image must contain a usable ClamAV signature
# database as well as the scanner binary. Debian installs freshclam but does not
# populate /var/lib/clamav during a non-interactive image build.
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc g++ libpq-dev libreoffice-writer libreoffice-core libreoffice-common clamav \
 && freshclam --stdout \
 && test -s /var/lib/clamav/main.cvd \
 && test -s /var/lib/clamav/daily.cvd \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Dependencies first for layer caching
COPY backend/requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

# App code
COPY backend/ .

# Non-root user
RUN useradd --create-home --shell /bin/bash app && chown -R app:app /app
USER app

EXPOSE 8000

# Default command for API service
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "1"]
