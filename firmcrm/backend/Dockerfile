# syntax=docker/dockerfile:1.7
FROM python:3.12-slim AS base
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 PIP_NO_CACHE_DIR=1 PIP_DISABLE_PIP_VERSION_CHECK=1
RUN apt-get update && apt-get install -y --no-install-recommends curl && rm -rf /var/lib/apt/lists/*
WORKDIR /app

FROM base AS deps
COPY pyproject.toml ./
# Install dependencies only (no project sources yet) so this layer caches across code changes.
RUN pip install --upgrade pip && pip install tomli 2>/dev/null; python - <<'PY'
import tomllib, subprocess, sys
deps = tomllib.load(open("pyproject.toml", "rb"))["project"]["dependencies"]
subprocess.check_call([sys.executable, "-m", "pip", "install", *deps])
PY

FROM deps AS runtime
RUN groupadd -r app && useradd -r -g app -d /app -s /sbin/nologin app
COPY --chown=app:app app ./app
COPY --chown=app:app alembic ./alembic
COPY --chown=app:app alembic.ini entrypoint.sh ./
RUN pip install --no-deps . && chmod +x entrypoint.sh
USER app
EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 CMD curl -fsS http://127.0.0.1:8000/api/ready || exit 1
ENTRYPOINT ["./entrypoint.sh"]
CMD ["serve"]
