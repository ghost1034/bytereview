#!/usr/bin/env sh
set -eu

echo "=== EntryPoint(Worker): starting ==="
echo "Date: $(date -u)"
echo "PORT: ${PORT:-8000}"
echo "WORKER_TYPE: ${WORKER_TYPE:-extract}"

# 1) Start HTTP health server in background on $PORT
#    (so Cloud Run startup/readiness probes can connect)
python - <<'PY' &
import os
from uvicorn import run
from health_server import app
run(app, host="0.0.0.0", port=int(os.environ.get("PORT", "8000")))
PY
HEALTH_PID=$!
echo "Health server PID: $HEALTH_PID"

# Give health server a moment to start
sleep 2

# 2) Start ARQ worker in foreground so container exits if worker exits
echo "Starting ARQ worker..."
python workers/run_workers.py "${WORKER_TYPE:-extract}"
WORKER_RC=$?

echo "Worker exited with code ${WORKER_RC}, stopping health server..."
kill ${HEALTH_PID} 2>/dev/null || true
wait ${HEALTH_PID} 2>/dev/null || true
exit ${WORKER_RC}