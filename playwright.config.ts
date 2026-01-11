import { defineConfig } from '@playwright/test'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export default defineConfig({
  testDir: path.resolve(path.dirname(fileURLToPath(import.meta.url)), 'tests/e2e'),
  timeout: 60_000,
  expect: { timeout: 10_000 },
  retries: 0,
  globalSetup: path.resolve(path.dirname(fileURLToPath(import.meta.url)), 'tests/e2e/global-setup.ts'),
  use: {
    headless: true,
    viewport: { width: 1280, height: 720 }
  }
})

