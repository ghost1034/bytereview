#!/usr/bin/env node

import { readFileSync, statSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const manifest = JSON.parse(readFileSync(resolve(root, '.next/app-build-manifest.json'), 'utf8'))
const route = '/dashboard/project-management/w/[workspaceId]/[[...slug]]/page'
const routeFiles = manifest.pages[route]
if (!routeFiles) throw new Error(`Tasklytic route is missing from app-build-manifest: ${route}`)

const hostShared = new Set([
  ...(manifest.pages['/layout'] ?? []),
  ...(manifest.pages['/dashboard/layout'] ?? []),
])
const initialFiles = [...new Set(routeFiles)].filter((file) => file.endsWith('.js') && !hostShared.has(file))
const bytes = initialFiles.reduce((sum, file) => sum + statSync(resolve(root, '.next', file)).size, 0)
const kib = bytes / 1024
const budget = Number(process.env.TASKLYTIC_INITIAL_JS_BUDGET_KB || 350)

console.log(`Tasklytic initial feature JavaScript: ${kib.toFixed(1)} kB (${initialFiles.length} chunks; budget ${budget} kB)`)
if (kib >= budget) {
  console.error(`Tasklytic initial feature JavaScript must remain below ${budget} kB.`)
  process.exit(1)
}
