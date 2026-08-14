import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const sourceRoots = [
  'project-management',
  'app/dashboard/project-management',
  'app/project-management',
]

const publicStyleFiles = new Set([
  'project-management/TasklyticPublicProvider.tsx',
  'project-management/features/forms/PublicFormPage.tsx',
  'project-management/styles/tasklytic-public.css',
])

const legacyVariables = [
  'bg-base',
  'bg-elevated',
  'bg-sunken',
  'bg-muted',
  'bg-overlay',
  'ink-primary',
  'ink-secondary',
  'ink-muted',
  'ink-faint',
  'ink-inverse',
  'border-subtle',
  'border-default',
  'primary-hover',
  'primary-glow',
  'danger',
  'danger-soft',
]

const checks = [
  {
    label: 'private Tasklytic theme state',
    pattern: /tasklytic:theme|useTasklyticTheme|TasklyticTheme|toggleTheme/g,
  },
  {
    label: 'authenticated Fraunces typography',
    pattern: /Fraunces/g,
  },
  {
    label: 'legacy private color variable',
    pattern: new RegExp(`--(?:${legacyVariables.join('|')})(?![a-z-])`, 'g'),
  },
  {
    label: 'legacy aurora, glow, or paper-shadow helper',
    pattern: /\b(?:bg-aurora(?:-animated)?|shadow-paper-(?:sm|md|lg)|shadow-glow-sm|glow-(?:pulse|unread)|status-dot-glow-[\w-]+)\b/g,
  },
  {
    label: 'Tasklytic portal-surface workaround',
    pattern: /\btl-(?:dialog|popover)-surface\b/g,
  },
  {
    label: 'raw Tailwind palette class',
    pattern: /\b(?:bg|text|border|ring|from|to|via|placeholder|divide|outline|caret)-(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-(?:\d{2,3})(?:\/\d{1,3})?\b/g,
  },
  {
    label: 'raw hexadecimal Tailwind color class',
    pattern: /\b(?:bg|text|border|ring|from|to|via|placeholder|divide|outline|caret)-\[#[\da-fA-F]{3,8}\]/g,
  },
]

async function collectFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true })
  const nested = await Promise.all(entries.map(async (entry) => {
    const absolute = path.join(directory, entry.name)
    if (entry.isDirectory()) return collectFiles(absolute)
    return /\.(?:css|ts|tsx)$/.test(entry.name) ? [absolute] : []
  }))
  return nested.flat()
}

function lineNumberAt(source, index) {
  return source.slice(0, index).split('\n').length
}

const absoluteFiles = (await Promise.all(
  sourceRoots.map((root) => collectFiles(path.join(repositoryRoot, root)))
)).flat()

const violations = []
for (const absoluteFile of absoluteFiles) {
  const relativeFile = path.relative(repositoryRoot, absoluteFile)
  if (publicStyleFiles.has(relativeFile) || /\.(?:test|browser)\.(?:ts|tsx)$/.test(relativeFile)) continue

  const source = await readFile(absoluteFile, 'utf8')
  for (const check of checks) {
    check.pattern.lastIndex = 0
    for (const match of source.matchAll(check.pattern)) {
      violations.push({
        file: relativeFile,
        line: lineNumberAt(source, match.index ?? 0),
        label: check.label,
        token: match[0],
      })
    }
  }
}

if (violations.length > 0) {
  console.error('Tasklytic style foundation check failed:')
  for (const violation of violations) {
    console.error(`  ${violation.file}:${violation.line} ${violation.label}: ${violation.token}`)
  }
  process.exitCode = 1
} else {
  console.log(`Tasklytic style foundation check passed (${absoluteFiles.length} files scanned).`)
}
