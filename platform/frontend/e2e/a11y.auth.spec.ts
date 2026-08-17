import { test, expect, Page, BrowserContext } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

// Accessibility gate for the SIGNED-IN application.
//
// e2e/a11y.spec.ts covers /login and / — the only two pages reachable without a
// backend, which is all the fast per-PR job can serve. Everything a department
// actually spends its day in sits behind sign-in and was going unchecked; the
// WCAG defects found so far (unlabelled controls, buttons with no accessible
// name) were all on these screens. This spec needs the full stack, so it runs
// in the nightly e2e job. The per-PR half of the net is the axe pass inside the
// jsdom component tests, which catches name/label/ARIA defects without an API.
//
// Signed in as a steward, so the /admin/* routes are reachable too.
//
// ONE context and ONE page are shared by every test here, deliberately. Refresh
// tokens rotate and the API runs reuse-detection, so replaying a saved
// storageState into a fresh context per test gets the whole token family
// revoked as suspected theft partway through the run. Holding a single live
// session is both correct and closer to how someone actually uses the app.

// Defaults to the programme_admin created by `python -m app.seed`, which is
// what CI boots — the /admin/* routes below need a steward. Override for a
// local database seeded differently.
const EMAIL = process.env.E2E_STEWARD_EMAIL || "programme_admin@gov.in";

const PAGES = [
  "/dashboard",
  "/domains",
  "/audits",
  "/settings",
  "/library",
  "/assessments",
  "/studio",
  "/admin/organisations",
  "/admin/domain-claims",
  "/admin/config",
  "/admin/bulk-scan",
  "/admin/national",
];

let ctx: BrowserContext;
let page: Page;

test.beforeAll(async ({ browser }) => {
  ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  page = await ctx.newPage();

  // Drive the REAL sign-in form rather than POSTing to the API, so a break in
  // the login flow fails here instead of quietly yielding an unauthenticated
  // "pass" on every route below.
  await page.goto("/login");
  await page.getByPlaceholder("name.dept@nic.in").fill(EMAIL);

  // The dev API returns the code in the response body; grab it in flight.
  // (It answers 202 Accepted, not 200 — match on ok(), not an exact status.)
  const otpResponse = page.waitForResponse(
    (r) => r.url().includes("/v1/auth/otp/request") && r.ok());
  await page.getByRole("button", { name: "Send OTP" }).click();
  const { dev_otp } = await (await otpResponse).json();

  if (!dev_otp) {
    throw new Error(
      "The API did not return dev_otp — the authenticated a11y specs need a " +
      "backend running in dev mode. Check DEV_MODE on the api service.");
  }

  await page.getByLabel(/one-time password/i).fill(dev_otp);
  await page.getByRole("button", { name: /verify & sign in/i }).click();
  await page.waitForURL("**/dashboard");
});

test.afterAll(async () => { await ctx?.close(); });

/** Load a signed-in page and wait for its data to land. */
async function openSignedIn(path: string) {
  await page.goto(path);

  // A dead session silently bounces to /login, where axe finds nothing wrong
  // and the test "passes" having audited the wrong page. The avatar carries the
  // signed-in user's address in its title, which proves it at any viewport
  // width (the sidebar nav is hidden below lg).
  await expect(page).not.toHaveURL(/\/login/);
  await expect(page.locator(`[title="${EMAIL}"]`)).toBeVisible();

  // Wait for the data, or axe audits a page of spinners and finds nothing.
  // Asserting the placeholder is *absent* is not enough on its own — it is also
  // absent in the moment before it renders, so that check passes trivially and
  // the audit runs too early. Settle the network first, then confirm no spinner
  // is left; .spinner-border is what every one of these pages uses.
  await page.waitForLoadState("networkidle");
  await expect(page.locator(".spinner-border")).toHaveCount(0);
}

/** Critical + serious WCAG 2.2 AA violations, each naming its elements. */
async function seriousViolations() {
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .analyze();
  return results.violations
    .filter((v) => v.impact === "critical" || v.impact === "serious")
    // Name the offending elements — a bare rule id sends you hunting.
    .map((v) => `${v.id}: ${v.help} → ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`);
}

for (const path of PAGES) {
  test(`no critical/serious a11y violations · ${path}`, async () => {
    await openSignedIn(path);
    expect(await seriousViolations()).toEqual([]);
  });
}

// The navigation drawer is a11y-relevant and only exists at mobile widths, so a
// desktop-only sweep never sees it. It is also the one piece of UI present on
// every signed-in page, which makes a defect here a defect everywhere.
test("no critical/serious a11y violations · mobile navigation drawer", async () => {
  await page.setViewportSize({ width: 390, height: 844 });
  try {
    await openSignedIn("/dashboard");
    await page.getByRole("button", { name: "Open navigation menu" }).click();
    await expect(page.getByRole("button", { name: "Close navigation menu" })).toBeVisible();
    expect(await seriousViolations()).toEqual([]);
  } finally {
    await page.setViewportSize({ width: 1280, height: 900 });
  }
});
