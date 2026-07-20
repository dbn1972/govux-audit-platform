import { test, expect } from "@playwright/test";

// Responsive smoke — no page may scroll sideways (WCAG 2.2 Reflow). Guards the
// 0px-overflow property we verified manually across every screen.
const VIEWPORTS = [
  { name: "mobile", width: 375, height: 812 },
  { name: "tablet", width: 768, height: 1024 },
  { name: "desktop", width: 1440, height: 900 },
];
const PAGES = ["/login", "/scan", "/report"];   // public pages (no auth barrier)

for (const vp of VIEWPORTS) {
  for (const path of PAGES) {
    test(`no horizontal overflow · ${path} @ ${vp.name}`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.goto(path);
      await page.waitForLoadState("networkidle").catch(() => {});
      const overflow = await page.evaluate(() =>
        document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow, `${overflow}px horizontal overflow`).toBeLessThanOrEqual(2);
    });
  }
}
