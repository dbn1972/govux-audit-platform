import { test, expect } from "@playwright/test";

// The free public scanner is the top-of-funnel — no auth. Cross-browser smoke.
test("scan landing renders with the audit entry point", async ({ page }) => {
  await page.goto("/scan");
  await expect(page.getByRole("heading", { name: "Free UX4G Website Audit" })).toBeVisible();
  await expect(page.getByPlaceholder("e.g. digilocker.gov.in")).toBeVisible();
  await expect(page.getByRole("button", { name: /Scan free/i })).toBeVisible();
});

test("non-gov URL is rejected client-side before any request", async ({ page }) => {
  await page.goto("/scan");
  await page.getByPlaceholder("e.g. digilocker.gov.in").fill("example.com");
  await page.getByRole("button", { name: /Scan free/i }).click();
  await expect(page.getByText(/Only .gov.in and .nic.in/i)).toBeVisible();
});

test("public sample report renders its score card", async ({ page }) => {
  await page.goto("/report");
  await expect(page.getByText(/Category sub-scores/i)).toBeVisible();
});
