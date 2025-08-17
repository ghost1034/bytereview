#!/usr/bin/env python3
"""
Single-file worker entrypoint for Cloud Run:
- Starts a lightweight FastAPI health server on $PORT
- Runs ARQ worker: python -m workers.run_workers <WORKER_TYPE>
- Graceful shutdown on SIGTERM/SIGINT
"""

import os
import sys
import time
import signal
import logging
import threading
import subprocess

from fastapi import FastAPI
import uvicorn

# ---------------- Logging ----------------
logging.basicConfig(
    level=os.getenv("LOG_LEVEL", "INFO"),
    format="%(asctime)s %(levelname)s [entrypoint] %(message)s",
)
log = logging.getLogger("entrypoint")

# ---------------- Config ----------------
PORT = int(os.environ.get("PORT", "8000"))
WORKER_TYPE = os.environ.get("WORKER_TYPE", "extract")  # extract | io | maint | automation | etc.

# ---------------- Health app ----------------
app = FastAPI()

@app.get("/health")
def health():
    return {"status": "ok"}

@app.get("/")
def root():
    return {"message": "Worker health server", "status": "running", "workerType": WORKER_TYPE}

class HealthServerThread(threading.Thread):
    def __init__(self, host: str = "0.0.0.0", port: int = 8000):
        super().__init__(daemon=True)
        self.host = host
        self.port = port
        self._server = None

    def run(self):
        config = uvicorn.Config(
            app,
            host=self.host,
            port=self.port,
            log_level=os.getenv("UVICORN_LOG_LEVEL", "info"),
            access_log=False,
        )
        self._server = uvicorn.Server(config)
        log.info("Starting health server on %s:%s", self.host, self.port)
        self._server.run()

    def shutdown(self):
        if self._server:
            log.info("Stopping health server...")
            self._server.should_exit = True

def main():
    log.info("=== Worker EntryPoint starting ===")
    log.info("PORT=%s WORKER_TYPE=%s", PORT, WORKER_TYPE)

    # 1) Start health server first so Cloud Run startup probe passes
    health_thread = HealthServerThread(port=PORT)
    health_thread.start()
    time.sleep(1.0)  # small cushion so probes don't race

    # 2) Start ARQ worker (foreground)
    worker_cmd = [sys.executable, "-m", "workers.run_workers", WORKER_TYPE]
    log.info("Launching ARQ worker: %s", " ".join(worker_cmd))
    worker_proc = subprocess.Popen(worker_cmd)

    # 3) Graceful shutdown handling
    shutdown_called = {"flag": False}

    def _shutdown(signum, _frame):
        if shutdown_called["flag"]:
            return
        shutdown_called["flag"] = True
        log.info("Received signal %s, shutting down...", signum)
        try:
            if worker_proc.poll() is None:
                log.info("Terminating worker process pid=%s", worker_proc.pid)
                worker_proc.terminate()
        except Exception:
            pass
        try:
            health_thread.shutdown()
        except Exception:
            pass

    signal.signal(signal.SIGTERM, _shutdown)
    signal.signal(signal.SIGINT, _shutdown)

    # 4) Wait for worker to finish
    try:
        rc = worker_proc.wait()
        log.info("Worker process exited with code %s", rc)
    except KeyboardInterrupt:
        _shutdown(signal.SIGINT, None)
        rc = 130
    finally:
        try:
            health_thread.shutdown()
        except Exception:
            pass
        health_thread.join(timeout=5.0)

    log.info("EntryPoint exiting with code %s", rc)
    sys.exit(rc)

if __name__ == "__main__":
    main()