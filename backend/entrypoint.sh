#!/usr/bin/env sh
set -eu

echo "=== EntryPoint: starting CPAAutomation backend ==="
echo "Date: $(date -u)  TZ=UTC"
echo "User: $(id)"
echo "PWD : $(pwd)"
echo "PORT: ${PORT:-8000}"
echo "PYTHONPATH: ${PYTHONPATH:-<unset>}"
echo "UVICORN_APP: ${UVICORN_APP:-main:app}"
echo "UVICORN_WORKERS: ${UVICORN_WORKERS:-1}"
echo "ENVIRONMENT: ${ENVIRONMENT:-<unset>}"
echo "LOG_LEVEL: ${LOG_LEVEL:-info}"
echo "INIT_DB_AT_STARTUP: ${INIT_DB_AT_STARTUP:-false}"

# Show app files
echo "Contents of /app:"
ls -la /app || true
echo

# Verify python, uvicorn, and module importability
echo "Python version:"
python -V || true
echo

echo "Uvicorn path:"
command -v uvicorn || echo "uvicorn NOT FOUND"
echo

echo "Trying to import main module..."
python - <<'PY'
import sys, importlib, os
print("sys.path:", sys.path)
print("CWD:", os.getcwd())
try:
    m = importlib.import_module("main")
    print("Imported main OK. app attr:", hasattr(m, "app"))
except Exception as e:
    print("ERROR importing main:", repr(e))
    raise
PY
echo

echo "Launching uvicorn..."
exec uvicorn "${UVICORN_APP}" \
  --host 0.0.0.0 \
  --port "${PORT:-8000}" \
  --workers "${UVICORN_WORKERS:-1}" \
  --log-level "${UVICORN_LOG_LEVEL:-info}" \
  --access-log