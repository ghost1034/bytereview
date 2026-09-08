/// <reference types="@vitest/browser/providers/playwright" />
import path from 'node:path'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [react()],
  resolve: { alias: { '@': path.resolve(__dirname) } },
  test: {
    include: ['components/feedback/*.browser.tsx'],
    browser: {
      enabled: true,
      provider: 'playwright',
      headless: true,
      screenshotDirectory: 'tmp/feedback-browser',
      instances: [{ browser: 'chromium', launch: { channel: 'chrome' } }],
    },
  },
})
