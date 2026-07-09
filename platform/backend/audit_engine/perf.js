#!/usr/bin/env node
/* Deep performance evidence (GTmetrix-style): Lighthouse metrics, opportunities,
   page weight, resource breakdown, and the load filmstrip.
   Usage: node perf.js <url> <out.json> <filmstrip_prefix>  */
import fs from "fs";
import { chromium } from "playwright";

const url = process.argv[2];
const outJson = process.argv[3];
const fsPrefix = process.argv[4];

const chromeLauncher = await import("chrome-launcher");
const lighthouse = (await import("lighthouse")).default;
const chrome = await chromeLauncher.launch({
  chromePath: chromium.executablePath(),
  chromeFlags: ["--headless=new", "--no-sandbox", "--disable-dev-shm-usage"],
});
const { lhr } = await lighthouse(url, {
  port: chrome.port, onlyCategories: ["performance"], formFactor: "mobile",
  screenEmulation: { mobile: true },
});
await chrome.kill();

const A = lhr.audits;
const num = (id) => A[id] ? A[id].numericValue : null;
const disp = (id) => A[id] ? A[id].displayValue : null;

// Core Web Vitals + lab metrics
const metrics = {
  fcp: num("first-contentful-paint"),
  si: num("speed-index"),
  lcp: num("largest-contentful-paint"),
  tti: num("interactive"),
  tbt: num("total-blocking-time"),
  cls: num("cumulative-layout-shift"),
};

// page weight + request breakdown
let totalBytes = null, totalReq = null, byType = [];
if (A["resource-summary"] && A["resource-summary"].details) {
  for (const it of A["resource-summary"].details.items) {
    if (it.resourceType === "total") { totalBytes = it.transferSize; totalReq = it.requestCount; }
    else byType.push({ type: it.resourceType, requests: it.requestCount, bytes: it.transferSize });
  }
  byType.sort((a, b) => b.bytes - a.bytes);
}

// top optimisation opportunities (with estimated savings)
const opportunities = [];
for (const [id, a] of Object.entries(A)) {
  const d = a.details;
  if (d && d.type === "opportunity" && (a.numericValue || 0) > 0) {
    opportunities.push({ id, title: a.title, savingsMs: Math.round(a.numericValue),
      savingsBytes: d.overallSavingsBytes || 0, score: a.score });
  }
}
opportunities.sort((a, b) => b.savingsMs - a.savingsMs);

// filmstrip (speed visualization)
let frames = [];
const th = A["screenshot-thumbnails"];
if (th && th.details && th.details.items) {
  const items = th.details.items;
  const pick = items.length > 6 ? items.filter((_, i) => i % Math.ceil(items.length / 6) === 0).slice(0, 6) : items;
  pick.forEach((f, i) => {
    const b64 = (f.data || "").split(",")[1];
    if (b64) {
      const p = `${fsPrefix}_${i}.jpg`;
      fs.writeFileSync(p, Buffer.from(b64, "base64"));
      frames.push({ path: p, timing: Math.round(f.timing) });
    }
  });
}

fs.writeFileSync(outJson, JSON.stringify({
  score: Math.round((lhr.categories.performance.score || 0) * 100),
  metrics, displays: {
    fcp: disp("first-contentful-paint"), si: disp("speed-index"),
    lcp: disp("largest-contentful-paint"), tti: disp("interactive"),
    tbt: disp("total-blocking-time"), cls: disp("cumulative-layout-shift"),
  },
  totalBytes, totalReq, byType, opportunities: opportunities.slice(0, 8), frames,
}, null, 2));
console.error("perf written:", outJson, "| opportunities:", opportunities.length, "| frames:", frames.length);
