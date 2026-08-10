# Repository Guidelines

## Project Structure & Module Organization

The Next.js 15 frontend uses the App Router under `app/`. Reusable components live in `components/`, utilities in `lib/`, hooks in `hooks/`, and static assets in `public/`. The FastAPI application is under `backend/`, with routers, services, models, migrations, and tests in their corresponding subdirectories. Background workers live in `backend/task_services/`; deployment tooling is in `scripts/` and `infra/`. Keep generated OpenAPI types in `lib/api-types.ts` synchronized with backend contracts.

## Build, Test, and Development Commands

- `npm install` — install frontend and tooling dependencies.
- `npm run dev` — bootstrap the Python virtual environment and local PostgreSQL, apply migrations, and start the frontend, API, and local workers.
- `npm run dev:frontend` / `npm run backend` — run one application tier independently.
- `npm run lint` — run Next.js and TypeScript ESLint checks.
- `npm run build` — create the production Next.js build and sitemap.
- `npm run test:unit` — run Vitest tests once.
- `backend/.venv/bin/python -m pytest backend/tests -q` — run the Python suite from the repository root.
- `npm run generate-types` — regenerate API types after FastAPI contract changes; `npm run check:openapi` detects stale output.

## Coding Style & Naming Conventions

Use strict TypeScript, React function components, and the `@/` import alias. Follow two-space indentation, single quotes, and patterns such as `ComponentName.tsx`, `useFeature.ts`, and `feature.test.ts`. ESLint requires semantic design tokens instead of raw Tailwind palette classes in core UI. Python uses four spaces, `snake_case` modules/functions, `PascalCase` classes, type hints, Pydantic models, and dependency-injected SQLAlchemy sessions. Keep route handlers thin and reusable behavior in services.

## Testing Guidelines

Backend tests use pytest and follow `backend/tests/test_<feature>.py`; frontend tests use Vitest and end in `.test.ts` or `.test.tsx`. Add focused regression tests beside the affected domain and run those first, then the relevant full suite. No repository-wide coverage threshold is configured. Schema changes require an Alembic migration; API changes require regenerated types.

## Commit & Pull Request Guidelines

Recent commits use concise, imperative subjects prefixed by the product or area, for example `PBC: Add request validation` or `Deployment: Fix worker startup`. Keep each commit scoped. Pull requests should explain user-visible behavior, implementation risks, configuration or migration steps, and verification performed; link related issues and include screenshots for UI changes. Update `.env.example` and documentation when adding configuration, and never commit credentials or production data.
