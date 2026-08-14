import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const root = process.cwd()
const read = (file: string) => readFileSync(path.join(root, file), 'utf8')

describe('Tasklytic style isolation', () => {
  it('keeps authenticated styles on the shared design foundation', () => {
    const authenticatedStyles = read('project-management/styles/tasklytic.css')

    expect(authenticatedStyles).toContain('.tasklytic-root')
    expect(authenticatedStyles).toContain('hsl(var(--background))')
    expect(authenticatedStyles).toContain('var(--font-ibm-plex-sans)')
    expect(authenticatedStyles).not.toMatch(/Fraunces|tasklytic:theme|--bg-base|--ink-primary|bg-aurora|shadow-paper|glow-/)
  })

  it('loads the warm public-form identity only from the public provider', () => {
    const authenticatedProvider = read('project-management/TasklyticProvider.tsx')
    const publicProvider = read('project-management/TasklyticPublicProvider.tsx')
    const publicStyles = read('project-management/styles/tasklytic-public.css')

    expect(authenticatedProvider).toContain("import './styles/tasklytic.css'")
    expect(authenticatedProvider).not.toContain('tasklytic-public.css')
    expect(publicProvider).toContain("import '@/project-management/styles/tasklytic-public.css'")
    expect(publicProvider).toContain('tasklytic-public-root')
    expect(publicStyles).toContain('.tasklytic-public-root')
    expect(publicStyles).toContain('Fraunces')
    expect(publicStyles).not.toContain('.tasklytic-root')
  })
})
