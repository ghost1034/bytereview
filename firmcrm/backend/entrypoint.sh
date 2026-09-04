#!/usr/bin/env sh
# Container entrypoint.
#   serve    -> run migrations (unless RUN_MIGRATIONS=false), then start uvicorn
#   migrate  -> run migrations and exit
#   seed     -> reset + demo seed (never use in production)
#   <other>  -> exec as given
set -eu

wait_for_db() {
  python - <<'PY'
import os, sys, time
from sqlalchemy import create_engine, text
url = os.environ.get("DATABASE_URL", "")
if not url or url.startswith("sqlite"):
    sys.exit(0)
for i in range(60):
    try:
        with create_engine(url, pool_pre_ping=True).connect() as c:
            c.execute(text("SELECT 1"))
        sys.exit(0)
    except Exception as e:  # noqa: BLE001
        print(f"waiting for database ({type(e).__name__})...", flush=True)
        time.sleep(2)
print("database not reachable", file=sys.stderr)
sys.exit(1)
PY
}

case "${1:-serve}" in
  serve)
    wait_for_db
    if [ "${RUN_MIGRATIONS:-true}" = "true" ]; then alembic upgrade head; fi
    exec uvicorn app.main:app --host 0.0.0.0 --port "${PORT:-8000}" --workers "${WEB_CONCURRENCY:-2}" \
      --proxy-headers --forwarded-allow-ips="${FORWARDED_ALLOW_IPS:-*}" --no-access-log --timeout-keep-alive 15
    ;;
  migrate)
    wait_for_db
    exec alembic upgrade head
    ;;
  seed)
    wait_for_db
    exec python -m app.seed --demo --reset
    ;;
  *)
    exec "$@"
    ;;
esac
