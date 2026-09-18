import { test, expect } from "@playwright/test";

// End-to-end smoke of the core owner flow (run against `npm run dev`).
// The OTP request is stubbed so this asserts the UI transition deterministically
// — not the live rate-limited auth backend (that's covered by the API tests).
test("login shows the OTP step after a valid gov email", async ({ page }) => {
  await page.route("**/v1/auth/otp/request", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: "{\"ok\":true}" }));
  await page.goto("/login");
  // exact: the migration wrapped this page in the site header, which added an
  // <h1>Sign in to GovUX Audit</h1> above the card's own <h2>Sign in</h2>; a
  // substring match now resolves to both and fails strict mode.
  await expect(page.getByRole("heading", { name: "Sign in", exact: true })).toBeVisible();
  await page.getByPlaceholder("name.dept@nic.in").fill("d.nayak@meity.gov.in");
  await page.getByRole("button", { name: "Send OTP" }).click();
  await expect(page.getByText(/Enter the/i)).toBeVisible();
});

test("non-gov email is rejected", async ({ page }) => {
  await page.goto("/login");
  await page.getByPlaceholder("name.dept@nic.in").fill("user@gmail.com");
  await page.getByRole("button", { name: "Send OTP" }).click();
  await expect(page.getByText(/Must end in/i)).toBeVisible();
});
