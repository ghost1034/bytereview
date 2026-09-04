.PHONY: setup backend frontend seed test lint typecheck build migrate revision migrate-check up down logs ps seed-docker backup e2e ci

setup:            ## install backend + frontend deps
	cd backend && uv venv --python 3.12 && uv pip install -e ".[dev]"
	cd frontend && npm install

backend:          ## migrate, then run API with reload on :8010 (SQLite by default; see backend/.env.example)
	cd backend && .venv/bin/alembic upgrade head && .venv/bin/uvicorn app.main:app --reload --port 8010

migrate:          ## apply migrations
	cd backend && .venv/bin/alembic upgrade head

revision:         ## autogenerate a migration: make revision m="add foo"
	cd backend && .venv/bin/alembic revision --autogenerate -m "$(m)"

migrate-check:    ## fail if models and migrations have drifted
	cd backend && .venv/bin/alembic check

frontend:         ## run Vite dev server on :5180 (override: VITE_PORT=5186 make frontend); proxies /api -> :8010
	cd frontend && VITE_PORT=$${VITE_PORT:-5180} npm run dev

seed:             ## reset and load demo data
	cd backend && .venv/bin/python -m app.seed --demo --reset

test:             ## backend test suite
	cd backend && .venv/bin/pytest -q

lint:
	cd backend && .venv/bin/ruff check app tests
	cd frontend && npm run lint

typecheck:
	cd frontend && npm run typecheck

build:
	cd frontend && npm run build

up:               ## build + start postgres/api/web on :8080 (needs .env; see .env.production.example)
	docker compose up --build -d

down:
	docker compose down

logs:
	docker compose logs -f --tail=200

ps:
	docker compose ps

seed-docker:      ## load demo data into the compose database (dev only)
	docker compose --profile seed run --rm seed

backup:           ## pg_dump the compose database to ./backups
	docker compose --profile ops run --rm backup

e2e:              ## black-box tests against a running stack (default http://localhost:8080; override E2E_BASE_URL)
	cd backend && E2E_BASE_URL=$${E2E_BASE_URL:-http://localhost:8080} .venv/bin/pytest tests_e2e --no-cov -q -p no:cacheprovider

ci:               ## same gates as .github/workflows/ci.yml, for hosts without Actions: lint, migration drift, tests, frontend gates, build
	cd backend && .venv/bin/ruff check app tests tests_e2e
	cd backend && DATABASE_URL=sqlite:///./ci.db .venv/bin/alembic upgrade head >/dev/null && DATABASE_URL=sqlite:///./ci.db .venv/bin/alembic check && rm -f ci.db ci.db-*
	cd backend && DATABASE_URL=sqlite:///./test_ci.db .venv/bin/pytest -p no:cacheprovider && rm -f test_ci.db test_ci.db-*
	cd frontend && npm run lint && npm run typecheck && npm run build
	@echo "ci: all gates passed (run 'make up && make e2e' for the compose smoke)"
