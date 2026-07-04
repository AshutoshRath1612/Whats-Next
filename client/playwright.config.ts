import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"]],
  use: {
    baseURL: "http://127.0.0.1:3010",
    trace: "retain-on-failure"
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] }
    }
  ],
  webServer: [
    {
      command: "PORT=4010 CLIENT_URL=http://127.0.0.1:3010 npm run start:e2e",
      cwd: "../server",
      url: "http://127.0.0.1:4010/api/health",
      reuseExistingServer: true,
      timeout: 120_000
    },
    {
      command: "NEXT_PUBLIC_API_URL=http://127.0.0.1:4010/api ./node_modules/.bin/next dev -p 3010",
      url: "http://127.0.0.1:3010",
      reuseExistingServer: true,
      timeout: 120_000
    }
  ]
});
