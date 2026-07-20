import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

// Automated accessibility gate on the two pages every user hits. Fails on any
// critical/serious WCAG 2.2 AA violation. (Real screen-reader testing stays manual.)
const PAGES = ["/login", "/scan"];

for (const path of PAGES) {
  test(`no critical/serious a11y violations · ${path}`, async ({ page }) => {
    await page.goto(path);
    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
      .analyze();
    const serious = results.violations.filter(
      (v) => v.impact === "critical" || v.impact === "serious");
    expect(serious.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
  });
}
