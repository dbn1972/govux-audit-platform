import { test, expect } from "@playwright/test";

// End-to-end smoke of the core owner flow (run against `npm run dev`).
// The OTP request is stubbed so this asserts the UI transition deterministically
// — not the live rate-limited auth backend (that's covered by the API tests).
test("login shows the OTP step after a valid gov email", async ({ page }) => {
  await page.route("**/v1/auth/otp/request", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: "{\"ok\":true}" }));
  await page.goto("/login");
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
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
