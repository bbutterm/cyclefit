import { defineConfig, devices } from '@playwright/test';

// E2E прогон против локального стека (backend :3000, miniapp :5173, admin :5174).
// Chromium предустановлен в окружении (/opt/pw-browsers/chromium).

export default defineConfig({
  testDir: '.',
  timeout: 30_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [['list'], ['json', { outputFile: 'results.json' }]],
  outputDir: 'artifacts',
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'off',
    screenshot: 'only-on-failure',
    launchOptions: { executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' },
    viewport: { width: 390, height: 844 }, // iPhone 12-ish, как в Telegram
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
