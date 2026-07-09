#!/usr/bin/env node
/* Deep capture: HAR (for the waterfall) + bounding boxes of failing elements
   (for the annotated screenshot).
   Usage: node deep.js <url> <out.json> <out.png> <out.har>  */
import fs from "fs";
import { chromium } from "playwright";
import { AxeBuilder } from "@axe-core/playwright";

const [url, outJson, outPng, harPath] = process.argv.slice(2);
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
           "(KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36";
const VW = 1366, VH = 900;

const browser = await chromium.launch({ args: ["--no-sandbox"] });
const context = await browser.newContext({
  userAgent: UA, viewport: { width: VW, height: VH },
  recordHar: { path: harPath, mode: "full", content: "omit" },
});
const page = await context.newPage();
const resp = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45000 }).catch(() => null);
await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
await page.evaluate(() => window.scrollTo(0, 0));
try { await page.screenshot({ path: outPng, fullPage: false }); } catch {}

const { violations } = await new AxeBuilder({ page })
  .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze();

const boxes = [];
for (const v of violations) {
  for (const n of v.nodes.slice(0, 4)) {
    const sel = (n.target || [])[0];
    if (!sel) continue;
    try {
      const el = await page.$(sel);
      if (!el) continue;
      const b = await el.boundingBox();
      if (b && b.width > 1 && b.height > 1)
        boxes.push({ id: v.id, impact: v.impact, x: Math.round(b.x), y: Math.round(b.y),
                     w: Math.round(b.width), h: Math.round(b.height) });
    } catch {}
  }
}
fs.writeFileSync(outJson, JSON.stringify({ viewport: { w: VW, h: VH }, boxes }, null, 2));
await context.close();   // flush HAR
await browser.close();
console.error("deep captured: boxes", boxes.length, "har", harPath);
