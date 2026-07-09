import { test, expect } from "@playwright/test";

// End-to-end smoke of the core owner flow (run against `npm run dev`).
test("login shows the OTP step after a valid gov email", async ({ page }) => {
  await page.goto("/login");
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
  await page.getByPlaceholder("name.dept@nic.in").fill("d.nayak@nic.in");
  await page.getByRole("button", { name: "Send OTP" }).click();
  await expect(page.getByText(/Enter the/i)).toBeVisible();
});

test("non-gov email is rejected", async ({ page }) => {
  await page.goto("/login");
  await page.getByPlaceholder("name.dept@nic.in").fill("user@gmail.com");
  await page.getByRole("button", { name: "Send OTP" }).click();
  await expect(page.getByText(/Must end in/i)).toBeVisible();
});
