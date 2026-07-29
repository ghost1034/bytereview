#!/usr/bin/env node

import { existsSync, readFileSync } from 'node:fs'
import { spawn, spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const backendDir = path.join(repoRoot, 'backend')
const venvDir = path.join(backendDir, '.venv')
const python = path.join(venvDir, 'bin', 'python')
const pip = path.join(venvDir, 'bin', 'pip')
const localOverridesPaths = [
  path.join(repoRoot, '.env.local'),
  path.join(repoRoot, '.env'),
]

function loadLocalOverrides(filePath) {
  if (!existsSync(filePath)) return

  for (const line of readFileSync(filePath, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*(?:export\s+)?(CPAA_LOCAL_[A-Z0-9_]+)\s*=\s*(.*)\s*$/)
    if (!match) continue

    const [, key, rawValue] = match
    if (Object.hasOwn(process.env, key)) continue

    const quote = rawValue[0]
    const value = (quote === '"' || quote === "'") && rawValue.at(-1) === quote
      ? rawValue.slice(1, -1)
      : rawValue
    process.env[key] = value
  }

  console.log(`Loaded local cloud overrides from ${path.relative(repoRoot, filePath)}`)
}

for (const localOverridesPath of localOverridesPaths) {
  loadLocalOverrides(localOverridesPath)
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    env: process.env,
    stdio: 'inherit',
    ...options,
  })
  if (result.error || result.status !== 0) {
    process.exit(result.status || 1)
  }
}

function findBootstrapPython() {
  for (const candidate of ['python3.13', 'python3.12', 'python3.11', 'python3']) {
    const check = spawnSync(candidate, ['--version'], { stdio: 'ignore' })
    if (check.status === 0) return candidate
  }
  console.error('Python 3.11+ is required for local development.')
  process.exit(1)
}

console.log('Starting CPAAutomation local development environment')
const dockerCheck = spawnSync('docker', ['info'], { stdio: 'ignore' })
if (dockerCheck.status !== 0) {
  console.error('Docker Desktop is not running. Start it, then run `npm run dev` again.')
  process.exit(1)
}

const legacyPostgresName = 'bytereview-postgres-dev'
const legacyPostgresCheck = spawnSync(
  'docker',
  ['container', 'inspect', legacyPostgresName],
  { stdio: 'ignore' },
)
if (legacyPostgresCheck.status === 0) {
  console.log(`Reusing legacy PostgreSQL container ${legacyPostgresName} ...`)
  run('docker', ['start', legacyPostgresName])
  let postgresReady = false
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const readiness = spawnSync(
      'docker',
      ['exec', legacyPostgresName, 'pg_isready', '-U', 'bytereview', '-d', 'bytereview_dev'],
      { stdio: 'ignore' },
    )
    if (readiness.status === 0) {
      postgresReady = true
      break
    }
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 1000)
  }
  if (!postgresReady) {
    console.error(`Legacy PostgreSQL container ${legacyPostgresName} did not become ready.`)
    process.exit(1)
  }
} else {
  run('docker', ['compose', 'up', '-d', '--wait', 'postgres'])
}

if (!existsSync(python)) {
  console.log('Creating backend/.venv ...')
  run(findBootstrapPython(), ['-m', 'venv', venvDir])
}

const dependencyCheck = spawnSync(
  python,
  ['-c', 'import fastapi, sqlalchemy, alembic, uvicorn, stripe, firebase_admin, google.cloud.storage'],
  { cwd: backendDir, stdio: 'ignore' },
)
if (dependencyCheck.status !== 0) {
  console.log('Installing backend dependencies (first run only) ...')
  run(pip, ['install', '-r', 'requirements-dev.txt'], { cwd: backendDir })
}

const localEnv = {
  ...process.env,
  ENVIRONMENT: 'local',
  DATABASE_URL: 'postgresql://bytereview:bytereview@127.0.0.1:5432/bytereview_dev',
  STORAGE_BACKEND: 'local',
  LOCAL_STORAGE_PATH: path.join(repoRoot, '.local', 'storage'),
  LOCAL_STORAGE_SIGNING_KEY: 'cpaautomation-local-storage-only',
  LOCAL_API_BASE_URL: 'http://127.0.0.1:8000',
  GCS_BUCKET_NAME: 'cpaautomation-local',
  INKWISE_DERIVED_BUCKET: 'cpaautomation-local',
  TASK_BACKEND: 'local',
  TASK_EXTRACT_URL: 'http://127.0.0.1:8001',
  TASK_IO_URL: 'http://127.0.0.1:8002',
  TASK_AUTOMATION_URL: 'http://127.0.0.1:8003',
  TASK_MAINTENANCE_URL: 'http://127.0.0.1:8004',
  LOCAL_AUTH_BYPASS: 'true',
  LOCAL_AUTH_EMAIL: 'local.developer@example.com',
  LOCAL_AUTH_NAME: 'Local Developer',
  ENCRYPTION_KEY: 'R2zgMBcOeo7qodyuBE9vXfpuRygeZacutB68EVBFmTE=',
  APP_BASE_URL: 'http://localhost:3000',
  PUBLIC_API_BASE_URL: 'http://127.0.0.1:8000',
  BACKEND_API_URL: 'http://127.0.0.1:8000',
  NEXT_PUBLIC_APP_ENV: 'local',
  NEXT_PUBLIC_FIREBASE_API_KEY: 'local-api-key',
  NEXT_PUBLIC_FIREBASE_PROJECT_ID: 'cpaautomation-local',
  NEXT_PUBLIC_FIREBASE_APP_ID: 'local-app-id',
  NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: 'localhost',
  NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID: '',
  NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: '',
  NEXT_PUBLIC_TASKLYTIC_BACKEND: '1',
  NEXT_PUBLIC_FILE_STORAGE_ADAPTER: 'object_store',
  STRIPE_SECRET_KEY: '',
  STRIPE_WEBHOOK_SECRET: '',
  OPENCONNECTOR_URL: process.env.CPAA_LOCAL_OPENCONNECTOR_URL || '',
  OPENCONNECTOR_RUNTIME_TOKEN: process.env.CPAA_LOCAL_OPENCONNECTOR_RUNTIME_TOKEN || '',
  OPENCONNECTOR_ADMIN_TOKEN: process.env.CPAA_LOCAL_OPENCONNECTOR_ADMIN_TOKEN || '',
  GOOGLE_CLOUD_PROJECT_ID: process.env.CPAA_LOCAL_GOOGLE_CLOUD_PROJECT_ID || '',
  GOOGLE_APPLICATION_CREDENTIALS: process.env.CPAA_LOCAL_GOOGLE_APPLICATION_CREDENTIALS || '',
  GOOGLE_CLIENT_ID: process.env.CPAA_LOCAL_GOOGLE_CLIENT_ID || '',
  GOOGLE_CLIENT_SECRET: process.env.CPAA_LOCAL_GOOGLE_CLIENT_SECRET || '',
  GOOGLE_REDIRECT_URI: 'http://localhost:3000/integrations/google/callback',
  INKWISE_REFERENCE_METADATA_AUTOFILL_ENABLED: 'false',
  INIT_DB_AT_STARTUP: 'false',
  CLAW_UDA_MCP_ENABLED: 'false',
}

console.log('Applying database migrations and local seed data ...')
run(python, ['-m', 'alembic', 'upgrade', 'head'], { cwd: backendDir, env: localEnv })
run(python, ['scripts/seed_initial_data.py'], { cwd: backendDir, env: localEnv })

const services = [
  ['api', ['-m', 'uvicorn', 'main:app', '--reload', '--host', '127.0.0.1', '--port', '8000'], backendDir],
  ['extract', ['-m', 'uvicorn', 'task_services.extract_task_service:app', '--host', '127.0.0.1', '--port', '8001'], backendDir],
  ['io', ['-m', 'uvicorn', 'task_services.io_task_service:app', '--host', '127.0.0.1', '--port', '8002'], backendDir],
  ['automation', ['-m', 'uvicorn', 'task_services.automation_task_service:app', '--host', '127.0.0.1', '--port', '8003'], backendDir],
  ['maintenance', ['-m', 'uvicorn', 'task_services.maintenance_task_service:app', '--host', '127.0.0.1', '--port', '8004'], backendDir],
]

const children = services.map(([name, args, cwd]) => {
  console.log(`Starting ${name} service ...`)
  return spawn(python, args, { cwd, env: localEnv, stdio: 'inherit' })
})

let shuttingDown = false
console.log('Starting frontend at http://localhost:3000 ...')
const nextBinary = path.join(repoRoot, 'node_modules', '.bin', 'next')
if (!existsSync(nextBinary)) {
  console.error('Frontend dependencies are missing. Run `npm install`, then `npm run dev`.')
  shutdown()
  process.exit(1)
}
children.push(spawn(nextBinary, ['dev'], {
  cwd: repoRoot,
  env: localEnv,
  stdio: 'inherit',
}))

function shutdown(signal = 'SIGTERM', exitCode = 0) {
  if (shuttingDown) return
  shuttingDown = true
  process.exitCode = exitCode
  for (const child of children) {
    if (!child.killed) child.kill(signal)
  }
  setTimeout(() => process.exit(exitCode), 1000).unref()
}

process.on('SIGINT', () => {
  // The terminal delivers SIGINT to the entire foreground process group, so
  // children are already stopping. Sending it a second time makes Uvicorn
  // report noisy KeyboardInterrupt traces.
  shuttingDown = true
  setTimeout(() => process.exit(0), 1000).unref()
})
process.on('SIGTERM', () => shutdown('SIGTERM'))

for (const child of children) {
  child.on('exit', (code, signal) => {
    if (shuttingDown) return
    console.error(`A local service exited (${signal || code}); stopping the stack.`)
    shutdown('SIGTERM', code || 1)
  })
}
