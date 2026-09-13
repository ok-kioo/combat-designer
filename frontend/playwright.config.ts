import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './e2e', testMatch: '*.spec.ts', fullyParallel: false, workers: 1,
  timeout: 30000, expect: { timeout: 7000 },
  reporter: [['list'], ['json', { outputFile: 'test-results/navigation.json' }]],
  use: { baseURL: 'http://127.0.0.1:43100', trace: 'retain-on-failure', screenshot: 'only-on-failure', launchOptions: { args: ['--no-sandbox'] } },
  webServer: [
    { command: 'node e2e/start-api.mjs', env: { TEST_API_PORT: '43101' }, url: 'http://127.0.0.1:43101/health/live', timeout: 60000, reuseExistingServer: false },
    { command: 'npm start', url: 'http://127.0.0.1:43100/health', timeout: 60000, env: { PORT: '43100', API_URL: 'http://127.0.0.1:43101' }, reuseExistingServer: false },
  ],
});
