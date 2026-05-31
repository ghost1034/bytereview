import os
import sys

import requests
from dotenv import load_dotenv
from sqlalchemy import create_engine, text

load_dotenv()

database_url = os.environ["DATABASE_URL"]
engine = create_engine(database_url)
with engine.connect() as conn:
    version = conn.execute(text("SELECT version_num FROM alembic_version")).scalar()
    table = conn.execute(text("SELECT to_regclass('public.firm_invite_codes')")).scalar()
    print(f"alembic_version={version}")
    print(f"firm_invite_codes_table={table}")

token = os.environ.get("DEV_AUTH_TOKEN", "dev-local-bypass")
url = "http://localhost:8000/api/analytics/firm/invite-code"
try:
    resp = requests.post(url, headers={"Authorization": f"Bearer {token}"}, timeout=5)
    print(f"POST {url} -> {resp.status_code}")
    print(resp.text[:500])
except Exception as exc:
    print(f"POST failed: {exc}", file=sys.stderr)
