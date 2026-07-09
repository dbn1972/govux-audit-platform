#!/usr/bin/env node
/* One-off deep evidence collector: full axe violation detail + screenshot.
   Usage: node evidence.js <url> <out.json> <out.png>  */
import fs from "fs";
import { chromium } from "playwright";
import { AxeBuilder } from "@axe-core/playwright";

const url = process.argv[2];
const outJson = process.argv[3];
const outPng = process.argv[4];
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
           "(KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36";

const browser = await chromium.launch({ args: ["--no-sandbox"] });
const ctx = await browser.newContext({ userAgent: UA, viewport: { width: 1366, height: 900 } });
const page = await ctx.newPage();
const resp = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45000 }).catch(() => null);
await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
try { await page.screenshot({ path: outPng, fullPage: false }); } catch {}

const { violations, passes, incomplete } = await new AxeBuilder({ page })
  .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze();

const clip = (s, n) => (s || "").replace(/\s+/g, " ").trim().slice(0, n);
const viol = violations.map(v => ({
  id: v.id, impact: v.impact, help: v.help, helpUrl: v.helpUrl,
  description: clip(v.description, 240),
  wcag: v.tags.filter(t => /^wcag\d/.test(t)),
  level: v.tags.includes("wcag2a") || v.tags.includes("wcag21a") ? "A" : "AA",
  count: v.nodes.length,
  nodes: v.nodes.slice(0, 3).map(n => ({
    target: (n.target || []).join(" "),
    html: clip(n.html, 200),
    failure: clip(n.failureSummary, 300),
    data: (n.any && n.any[0] && n.any[0].data) || null,
  })),
}));

const h = resp ? resp.headers() : {};
const security = {
  https: page.url().startsWith("https:"),
  hsts: !!h["strict-transport-security"], csp: !!h["content-security-policy"],
  xcto: !!h["x-content-type-options"], xfo: !!h["x-frame-options"],
  referrer: !!h["referrer-policy"], permissions: !!h["permissions-policy"],
};

fs.writeFileSync(outJson, JSON.stringify({
  url, title: await page.title(), finalUrl: page.url(),
  status: resp ? resp.status() : null,
  violations: viol, passCount: passes.length, incompleteCount: incomplete.length,
  security,
}, null, 2));
await browser.close();
console.error("evidence written:", outJson);
