import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { stubOcrAdapter } from './lib/ocr/stubAdapter'

describe('Phase 10 launch contracts', () => {
  it('keeps receipt entry usable when extraction is unavailable', async () => {
    await expect(stubOcrAdapter.scanReceipt({ file: new File([], 'receipt.png') })).resolves.toEqual({
      status: 'manual_required', reason: 'integration_unavailable',
    })
  })

  it('loads PSA, reporting, AI, and settings only through feature chunks', () => {
    const router = readFileSync('project-management/ProjectManagementWorkspaceRouter.tsx', 'utf8')
    const chrome = readFileSync('project-management/TasklyticChrome.tsx', 'utf8')
    expect(router).not.toMatch(/from '\.\/features\/(psa|reporting|ai|settings)\//)
    for (const family of ['psa', 'reporting', 'ai', 'settings']) {
      expect(router).toMatch(new RegExp(`lazy\\(\\s*\\(\\) =>\\s*import\\('\\./features/${family}/`))
    }
    expect(chrome).toMatch(/dynamic\(\s*\(\) =>\s*import\('\.\/features\/ai\/AiAssistantPanel'\)/)
    expect(chrome).toMatch(/dynamic\(\s*\(\) =>\s*import\('\.\/features\/psa\/time\/TimerBanner'\)/)
  })

  it('does not advertise unsupported provider registries or stale destinations', () => {
    const driveTypes = readFileSync('project-management/lib/cloudDrive/types.ts', 'utf8')
    const analyticsTypes = readFileSync('project-management/lib/analytics/types.ts', 'utf8')
    const destinations = readFileSync('project-management/features/shell/searchDestinations.ts', 'utf8')
    expect(driveTypes).not.toMatch(/onedrive|dropbox/i)
    expect(analyticsTypes).not.toMatch(/segment|mixpanel|amplitude|posthog/i)
    expect(destinations).not.toContain('pending-emails')
  })
})
