import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests",
  testMatch: "**/*.e2e.mjs",
  workers: 1,
  timeout: 60000,
  expect: { timeout: 10000 },
  use: {
    baseURL: "http://127.0.0.1:3181",
    channel: "msedge",
    viewport: { width: 1440, height: 900 },
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  reporter: [["list"], ["html", { open: "never" }]],
  webServer: {
    command: `"${process.execPath}" tests/serve-e2e.mjs`,
    url: "http://127.0.0.1:3181/api/health",
    reuseExistingServer: false,
    timeout: 30000,
  },
});
