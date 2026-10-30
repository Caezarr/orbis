import { defineConfig, devices } from "@playwright/test";

/**
 * Browser end-to-end tests of the /start golden path, against the local
 * production-like stack only (Supabase in Docker + demo mailbox). No live
 * service is called: step 1 uses the description path (no site fetch), the
 * mailbox is the in-process fake, and no AI model is configured (or, with
 * E2E_DEMO_MODEL=1, the local demo model: templates, no model call).
 * See docs/product/e2e-start.md.
 */
const baseURL = process.env.E2E_BASE_URL ?? "http://127.0.0.1:3000";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  // First hits compile routes in `next dev`.
  timeout: 180_000,
  expect: { timeout: 30_000 },
  reporter: process.env.CI ? "list" : [["list"], ["html", { open: "never", outputFolder: "playwright-report" }]],
  outputDir: "test-results",
  use: {
    baseURL,
    locale: "fr-FR",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        // Pre-installed browser (cloud sandboxes); otherwise `pnpm exec playwright install chromium`.
        launchOptions: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE
          ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE }
          : {},
      },
    },
  ],
  webServer: {
    command: "pnpm exec next dev --hostname 127.0.0.1 --port 3000",
    url: `${baseURL}/start`,
    reuseExistingServer: true,
    env: process.env.E2E_DEMO_MODEL === "1" ? { ORBIS_AI_PROVIDER: "demo" } : {},
    timeout: 180_000,
  },
});
