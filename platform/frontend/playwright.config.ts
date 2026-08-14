import { defineConfig, devices } from "@playwright/test";
const BROWSER_DEVICE = {
  chromium: "Desktop Chrome",
  firefox: "Desktop Firefox",
  webkit: "Desktop Safari",
} as const;

// Cross-browser E2E of the app's OWN UI (Chrome/Firefox/Safari-WebKit).
// Assumes the app is already running at baseURL (CI boots the stack first).
export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  expect: { timeout: 7_000 },
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? [["github"], ["list"]] : "list",
  use: {
    baseURL: process.env.E2E_BASE_URL || "http://localhost:3000",
    trace: "on-first-retry",
  },
  projects: [
    // The cross-browser projects stay SIGNED OUT: they cover the public pages
    // and the sign-in flow itself, which an existing session would skip past.
    ...(["chromium", "firefox", "webkit"] as const).map((name) => ({
      name,
      use: { ...devices[BROWSER_DEVICE[name]] },
      testIgnore: /a11y\.auth\.spec\.ts/,
    })),

    // Signed-in a11y sweep. Needs a live API, so it only runs where the whole
    // stack is up (the nightly e2e job) — Chromium alone, since axe's findings
    // are engine-independent and the point is route coverage, not browsers.
    // It signs itself in and manages its own context; see the spec's header.
    {
      name: "a11y-auth",
      testMatch: /a11y\.auth\.spec\.ts/,
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
