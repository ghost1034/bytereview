/// <reference types="@vitest/browser/providers/playwright" />
import path from 'node:path'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [react()],
  define: {
    'process.env': JSON.stringify({
      NEXT_PUBLIC_APP_ENV: 'local',
      NODE_ENV: 'test',
    }),
  },
  resolve: {
    alias: { '@': path.resolve(__dirname) },
  },
  optimizeDeps: {
    include: ['@radix-ui/react-radio-group'],
  },
  test: {
    include: ['project-management/**/*.browser.tsx'],
    browser: {
      enabled: true,
      provider: 'playwright',
      headless: true,
      instances: [{
        browser: 'chromium',
        launch: {
          executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
        },
      }],
    },
  },
})
