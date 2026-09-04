# FirmCRM Runbook

Operational procedures for running FirmCRM in production. Audience: the engineer on call.

## 1. Topology

```
Browser ──TLS──▶ Load balancer / ingress ──▶ web (nginx, SPA + /api proxy) ──▶ api (uvicorn, N workers) ──▶ Postgres 16
```

- `web` serves the static bundle and proxies `/api/*` to `api:8000`, forwarding `X-Forwarded-For`, `X-Forwarded-Proto`, `X-Request-ID`.
- `api` runs Alembic migrations on start (`RUN_MIGRATIONS=true`, default) and refuses to serve if the schema is not at head in production.
- TLS terminates at the load balancer. The API emits HSTS when `APP_ENV=production`; ensure the LB only accepts HTTPS.

## 2. Configuration (environment)

| Variable | Required | Notes |
|---|---|---|
| `APP_ENV` | yes | `production` enables strict guards (no SQLite, no localhost CORS, non-default `SECRET_KEY`). |
| `DATABASE_URL` | yes | `postgresql+psycopg://user:pass@host:5432/db`. |
| `SECRET_KEY` | yes | ≥ 32 random chars. Rotating it invalidates all access tokens immediately (refresh tokens still work). |
| `CORS_ORIGINS` | yes | Comma-separated browser origins. |
| `TRUST_PROXY_HEADERS` | behind a proxy | `true` to read client IP from `X-Forwarded-For` (rate limiting, audit). |
| `ACCESS_TOKEN_MINUTES` / `REFRESH_TOKEN_DAYS` | no | Defaults 15 / 14. |
| `LOGIN_MAX_FAILURES` / `LOCKOUT_MINUTES` | no | Defaults 5 / 15. |
| `LOGIN_RATE_LIMIT_PER_MINUTE` | no | Default 10 per client IP. Shared across workers/replicas when `REDIS_URL` is set. |
| `REDIS_URL` | recommended | e.g. `redis://redis:6379/0`. Rate-limit store; fails open (logged) if Redis is down. Reported by `/api/ready`. |
| `ADMIN_BYPASSES_WALLS` | no | Default `true`. Set `false` so admins are also subject to ethical walls. |
| `PASSWORD_MIN_LENGTH` | no | Default 12. |
| `LOG_FORMAT` / `LOG_LEVEL` | no | `json` in production by default. |
| `SENTRY_DSN` | no | Enables Sentry if `sentry-sdk` is installed (`pip install -e ".[observability]"`). |
| `WEB_CONCURRENCY` | no | uvicorn workers (default 2). |
| `MAX_REQUEST_BYTES` | no | Default 10 MB (nginx `client_max_body_size` is also 10m). |

Generate a secret: `python -c "import secrets; print(secrets.token_urlsafe(48))"`.

## 3. Deploy

```bash
cp .env.production.example .env   # fill SECRET_KEY, POSTGRES_PASSWORD, CORS_ORIGINS
docker compose up --build -d
curl -fsS https://<host>/api/ready   # {"status":"ready","checks":{"database":true,"migrations_at_head":true}}
```

Zero-downtime upgrade with a single API replica is not possible (migrations run on start). For rolling upgrades:
1. `docker compose run --rm api migrate` (applies migrations while the old version serves — migrations are additive by policy, see §5).
2. `docker compose up -d --no-deps api web`.

Roll back: `git checkout <previous-tag> && docker compose up -d --build api web`. If a migration must be reverted: `docker compose run --rm api alembic downgrade -1` **after** stopping the new API.

## 4. Probes

| Endpoint | Meaning | Use for |
|---|---|---|
| `GET /api/health` | process alive | liveness |
| `GET /api/ready` | DB reachable **and** schema at head | readiness / LB target health |
| `GET /healthz` (web) | nginx alive | liveness |

## 5. Database & migrations

- Schema is owned by Alembic (`backend/alembic/versions`). Never run `create_all`.
- `make revision m="describe change"` autogenerates; review the file; `make migrate-check` must print “No new upgrade operations detected.” CI enforces this on SQLite and Postgres.
- Policy: migrations are **additive and backward compatible** for one release (add column nullable → backfill → tighten next release) so the previous API version keeps working during a rollout.
- Circular FKs (`accounts.referral_contact_id`, `leads.converted_opportunity_id`) are named explicitly; keep names if you touch them.

## 6. Backup & restore

Backup (compose): `make backup` → `./backups/crm-<timestamp>.dump` (`pg_dump -Fc`). Schedule nightly; retain 30 daily + 12 monthly; copy off-host (object storage with versioning).

Restore to a fresh database:
```bash
docker compose stop api
docker compose exec -T db pg_restore -U crm -d crm --clean --if-exists < backups/crm-<ts>.dump
docker compose start api && curl -fsS localhost:8080/api/ready
```
Test a restore quarterly into a scratch database and run `alembic check` against it.

## 7. Secrets rotation

| Secret | Procedure | Effect |
|---|---|---|
| `SECRET_KEY` | set new value, restart api | all access tokens invalid; users refresh silently on their next request |
| `POSTGRES_PASSWORD` | `ALTER USER crm PASSWORD '...'`, update `.env`, restart api | none for users |
| Admin password | Admin → Users → set password | target must change on next login; their sessions are revoked |

## 8. Scaling notes

- Login/refresh rate limiting uses Redis when `REDIS_URL` is set (compose includes a `redis` service), so the limit holds across workers and replicas. Without Redis the limiter is per-process and the effective limit is N× the configured value.
- Conflict search loads candidate names in memory per request; fine to ~100k accounts/contacts. Beyond that, move to a trigram index (`pg_trgm`) — the service boundary is `app/services/conflicts.search`.
- CSV export streams in pages of 500; imports are capped at 10k rows / 5 MB per file.

## 8a. Running the e2e suite against a stack

`make e2e` (default `http://localhost:8080`; override `E2E_BASE_URL`). The suite logs in many times from one IP; with Redis-backed limiting the default 10 logins/min **will** trip (429) on a second run within a minute. For test stacks set `LOGIN_RATE_LIMIT_PER_MINUTE=1000` in `.env` (CI does this); never in production.

## 9. User lifecycle

- **Onboard**: Admin → Users → Add (temporary password; user is forced to change it at first login).
- **Offboard**: Admin → Users → set inactive. This revokes all sessions; the user's next request is rejected. Reassign their open opportunities/tasks (Opportunities → filter by owner).
- **Lockout**: after 5 failures the account locks for 15 minutes automatically. An admin can unlock early by resetting the password.

## 10. Ethical walls

Raise from an account or opportunity page (partner/admin): reason + team. Non-members get 404 on the record and do not see it in lists/exports; conflict searches show it as a restricted matter. Lift from the same panel. All actions are in the audit log under `ethical_wall`. Admin → Ethical walls lists active and lifted walls.

## 11. Incident checklist

1. `GET /api/ready` — if `migrations_at_head=false`, a deploy is half-applied: run `api migrate`.
2. `docker compose logs api --since 15m | grep '"level": "ERROR"'` — every line carries `request_id`; correlate with the `x-request-id` the user sees.
3. Audit trail (Admin → Audit log) answers “who changed what”: every create/update/archive/stage change/clearance decision/auth event is recorded with before/after images.
4. Suspected credential compromise: set the user inactive (kills sessions), check `auth.refresh_reuse_detected` and `auth.login_failed` audit rows for their IPs, rotate `SECRET_KEY` if tokens may have leaked.

## 12. Local development

```bash
make setup && make seed && make backend   # :8010
make frontend                             # :5180
make test                                 # pytest with coverage floor 85%
```
