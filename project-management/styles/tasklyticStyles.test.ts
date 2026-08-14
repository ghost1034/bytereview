import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const root = process.cwd()
const read = (file: string) => readFileSync(path.join(root, file), 'utf8')

describe('Tasklytic style isolation', () => {
  it('keeps authenticated styles on the shared design foundation', () => {
    const authenticatedProvider = read(
      'project-management/TasklyticProvider.tsx',
    )
    const chrome = read('project-management/TasklyticChrome.tsx')

    expect(
      existsSync(path.join(root, 'project-management/styles/tasklytic.css')),
    ).toBe(false)
    expect(authenticatedProvider).not.toContain(
      "import './styles/tasklytic.css'",
    )
    expect(chrome).toContain('bg-background font-sans text-foreground')
    expect(`${authenticatedProvider}\n${chrome}`).not.toMatch(
      /Fraunces|tasklytic:theme|--bg-base|--ink-primary|bg-aurora|shadow-paper|glow-/,
    )
  })

  it('loads the warm public-form identity only from the public provider', () => {
    const authenticatedProvider = read(
      'project-management/TasklyticProvider.tsx',
    )
    const publicProvider = read(
      'project-management/TasklyticPublicProvider.tsx',
    )
    const publicStyles = read('project-management/styles/tasklytic-public.css')

    expect(authenticatedProvider).not.toContain('tasklytic-public.css')
    expect(publicProvider).toContain(
      "import '@/project-management/styles/tasklytic-public.css'",
    )
    expect(publicProvider).toContain('tasklytic-public-root')
    expect(publicStyles).toContain('.tasklytic-public-root')
    expect(publicStyles).toContain('Fraunces')
    expect(publicStyles).not.toContain('.tasklytic-root')
  })
})
