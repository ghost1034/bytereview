/// <reference types="@vitest/browser/providers/playwright" />
import path from 'node:path'
import { existsSync } from 'node:fs'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

const localChrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'

export default defineConfig({
  plugins: [react()],
  define: { 'process.env': JSON.stringify({ NODE_ENV: 'test' }) },
  resolve: {
    alias: { '@': path.resolve(__dirname) },
  },
  test: {
    include: ['taxatlas-ui/**/*.browser.tsx'],
    browser: {
      enabled: true,
      provider: 'playwright',
      headless: true,
      instances: [{
        browser: 'chromium',
        launch: existsSync(localChrome) ? { executablePath: localChrome } : {},
      }],
    },
  },
})
