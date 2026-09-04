import time

from app.services.ratelimit import RateLimiter
from tests.conftest import login

PW = "Demo1234!Demo"


def _login(client, email, pw=PW):
    return client.post("/api/auth/login", json={"email": email, "password": pw})


def test_login_returns_token_pair(client):
    r = _login(client, "staff2@demo.firm")
    assert r.status_code == 200
    body = r.json()
    assert body["access_token"] and body["refresh_token"] and body["expires_in"] > 0
    assert body["user"]["email"] == "staff2@demo.firm"


def test_refresh_rotates_and_detects_reuse(client):
    first = _login(client, "staff2@demo.firm").json()
    r = client.post("/api/auth/refresh", json={"refresh_token": first["refresh_token"]})
    assert r.status_code == 200
    second = r.json()
    assert second["refresh_token"] != first["refresh_token"]
    # New refresh token works; old one is revoked
    assert client.post("/api/auth/refresh", json={"refresh_token": first["refresh_token"]}).status_code == 401
    # Reuse of the rotated token revoked the whole family, so the new token is now dead too
    assert client.post("/api/auth/refresh", json={"refresh_token": second["refresh_token"]}).status_code == 401
    # Access tokens are bound to the session family: once the family is revoked they die immediately
    assert client.get("/api/auth/me", headers={"Authorization": f"Bearer {second['access_token']}"}).status_code == 401


def test_logout_revokes_refresh(client):
    t = _login(client, "staff2@demo.firm").json()
    h = {"Authorization": f"Bearer {t['access_token']}"}
    assert client.post("/api/auth/logout", json={"refresh_token": t["refresh_token"]}, headers=h).status_code == 204
    assert client.post("/api/auth/refresh", json={"refresh_token": t["refresh_token"]}).status_code == 401
    assert client.get("/api/auth/me", headers=h).status_code == 401  # signed out immediately, not after token expiry


def test_sessions_list_and_revoke(client):
    laptop = _login(client, "staff2@demo.firm").json()
    phone = _login(client, "staff2@demo.firm").json()
    h = {"Authorization": f"Bearer {laptop['access_token']}"}
    ph = {"Authorization": f"Bearer {phone['access_token']}"}
    sessions = client.get("/api/auth/sessions", headers=h).json()
    assert len(sessions) >= 2
    # Revoke the phone's session from the laptop: the phone is signed out on its very next request
    phone_sid = sessions[0]["id"]  # newest first
    assert client.delete(f"/api/auth/sessions/{phone_sid}", headers=h).status_code == 204
    assert client.get("/api/auth/me", headers=ph).status_code == 401
    assert client.get("/api/auth/me", headers=h).status_code == 200
    # Cannot revoke someone else's session
    other = _login(client, "marketing@demo.firm").json()
    oh = {"Authorization": f"Bearer {other['access_token']}"}
    other_sid = client.get("/api/auth/sessions", headers=oh).json()[0]["id"]
    assert client.delete(f"/api/auth/sessions/{other_sid}", headers=h).status_code == 404


def test_lockout_after_failed_attempts(client, admin):
    # Create a throwaway user so we do not lock demo accounts used elsewhere
    r = client.post("/api/users", json={"email": "lockme@demo.firm", "full_name": "Lock Me", "password": "Str0ngPassw0rd!", "role": "staff"}, headers=admin)
    assert r.status_code == 201, r.text
    for _ in range(5):
        assert _login(client, "lockme@demo.firm", "wrong-password-1").status_code == 401
    r = _login(client, "lockme@demo.firm", "Str0ngPassw0rd!")
    assert r.status_code == 423 and r.json()["code"] == "locked"
    audit = client.get("/api/admin/audit?entity_type=user&limit=500", headers=admin).json()["items"]
    assert any(a["action"] == "auth.locked" for a in audit)


def test_password_policy_enforced_on_user_create(client, admin):
    r = client.post("/api/users", json={"email": "weak@demo.firm", "full_name": "Weak", "password": "short1aa", "role": "staff"}, headers=admin)
    assert r.status_code == 400 and r.json()["code"] == "weak_password"
    r = client.post("/api/users", json={"email": "weak@demo.firm", "full_name": "Weak", "password": "onlylettersxyzabc", "role": "staff"}, headers=admin)
    assert r.status_code == 400


def test_forced_password_change_gate_and_session_invalidation(client, admin):
    client.post("/api/users", json={"email": "newbie@demo.firm", "full_name": "New Hire", "password": "Temp0raryPass99", "role": "staff"}, headers=admin)
    t = _login(client, "newbie@demo.firm", "Temp0raryPass99").json()
    h = {"Authorization": f"Bearer {t['access_token']}"}
    assert t["user"]["must_change_password"] is True
    # Gate: ordinary endpoints blocked until password changed
    r = client.get("/api/accounts", headers=h)
    assert r.status_code == 403 and r.json()["code"] == "password_change_required"
    assert client.get("/api/auth/me", headers=h).status_code == 200
    # Wrong current password
    r = client.post("/api/auth/change-password", json={"current_password": "nope-nope-nope", "new_password": "Br4ndNewPassword"}, headers=h)
    assert r.status_code == 400 and r.json()["code"] == "invalid_current_password"  # a form error, never a session expiry
    # Same as current is rejected
    assert client.post("/api/auth/change-password", json={"current_password": "Temp0raryPass99", "new_password": "Temp0raryPass99"}, headers=h).status_code == 400
    time.sleep(1.1)  # pwc claim has second resolution
    r = client.post("/api/auth/change-password", json={"current_password": "Temp0raryPass99", "new_password": "Br4ndNewPassword"}, headers=h)
    assert r.status_code == 200, r.text
    fresh = r.json()
    # Old access token is invalidated by the password change; new one works and the gate is lifted
    assert client.get("/api/auth/me", headers=h).status_code == 401
    h2 = {"Authorization": f"Bearer {fresh['access_token']}"}
    assert client.get("/api/accounts", headers=h2).status_code == 200
    # Old refresh token revoked
    assert client.post("/api/auth/refresh", json={"refresh_token": t["refresh_token"]}).status_code == 401
    assert _login(client, "newbie@demo.firm", "Br4ndNewPassword").status_code == 200


def test_deactivated_user_loses_access(client, admin):
    client.post("/api/users", json={"email": "leaver@demo.firm", "full_name": "Leaver", "password": "Str0ngPassw0rd!!", "role": "staff"}, headers=admin)
    t = _login(client, "leaver@demo.firm", "Str0ngPassw0rd!!").json()
    uid = t["user"]["id"]
    assert client.patch(f"/api/users/{uid}", json={"is_active": False}, headers=admin).status_code == 200
    assert client.get("/api/auth/me", headers={"Authorization": f"Bearer {t['access_token']}"}).status_code == 401
    assert client.post("/api/auth/refresh", json={"refresh_token": t["refresh_token"]}).status_code == 401
    assert _login(client, "leaver@demo.firm", "Str0ngPassw0rd!!").status_code == 401


def test_rate_limiter_unit():
    rl = RateLimiter(limit=3, window_seconds=60)
    assert all(rl.allow("1.2.3.4") for _ in range(3))
    assert rl.allow("1.2.3.4") is False
    assert rl.allow("5.6.7.8") is True
    rl.reset("1.2.3.4")
    assert rl.allow("1.2.3.4") is True


def test_refresh_token_is_not_an_access_token(client):
    t = _login(client, "staff2@demo.firm").json()
    assert client.get("/api/auth/me", headers={"Authorization": f"Bearer {t['refresh_token']}"}).status_code == 401


def test_admin_password_reset_forces_change(client, admin):
    users = client.get("/api/users", headers=admin).json()
    u = next(x for x in users if x["email"] == "staff2@demo.firm")
    assert client.patch(f"/api/users/{u['id']}", json={"password": "ResetByAdmin2026"}, headers=admin).status_code == 200
    t = _login(client, "staff2@demo.firm", "ResetByAdmin2026").json()
    assert t["user"]["must_change_password"] is True
    # restore for other tests
    h = {"Authorization": f"Bearer {t['access_token']}"}
    time.sleep(1.1)
    assert client.post("/api/auth/change-password", json={"current_password": "ResetByAdmin2026", "new_password": PW}, headers=h).status_code == 200
    _ = login(client, "staff2@demo.firm")
