import os

os.environ.setdefault("DATABASE_URL", os.environ.get("TEST_DATABASE_URL", "sqlite:///./test_crm.db"))
os.environ["APP_ENV"] = "test"
os.environ.setdefault("LOGIN_RATE_LIMIT_PER_MINUTE", "100000")  # rate limiting is unit-tested separately
os.environ.setdefault("BCRYPT_ROUNDS", "4")

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from app.main import app  # noqa: E402
from app.seed import reset, seed_demo  # noqa: E402


@pytest.fixture(scope="session")
def client():
    reset()
    seed_demo()
    with TestClient(app) as c:
        yield c


def login(client, email="admin@demo.firm"):
    r = client.post("/api/auth/login", json={"email": email, "password": "Demo1234!Demo"})
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


@pytest.fixture(scope="session")
def admin(client):
    return login(client)
