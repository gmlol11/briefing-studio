import { defineConfig, devices } from '@playwright/test'

const PORT = 5173
const BASE_URL = process.env.E2E_BASE_URL ?? `http://localhost:${PORT}`

/**
 * Локальный E2E-smoke. Playwright оркеструет только frontend (vite); backend на
 * :8000 и demo-seed (`python scripts/seed_demo.py --reset`) — внешний prerequisite
 * (см. e2e/README.md). Только Chromium, без CI-матрицы.
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: 'list',
  use: {
    baseURL: BASE_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'npm run dev',
    port: PORT,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
})
