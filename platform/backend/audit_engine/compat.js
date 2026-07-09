// Cross-browser + responsive matrix collector.
//   node compat.js <url>                       -> prints JSON to stdout (worker mode)
//   node compat.js <url> <out.json> <prefix>   -> writes JSON + screenshots (report mode)
import { chromium, firefox, webkit } from "playwright";
import fs from "fs";
const [rawUrl, outJson, shotPrefix] = process.argv.slice(2);
const url = /^https?:\/\//.test((rawUrl || "").trim()) ? rawUrl.trim() : "https://" + (rawUrl || "").trim();
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36";
const result = { engines: [], responsive: [] };
const shot = (page, path) => shotPrefix ? page.screenshot({ path }).catch(() => {}) : Promise.resolve();

// ---- cross-browser: load in each engine at desktop 1440 ----
for (const [name, engine] of [["Chromium", chromium], ["Firefox", firefox], ["WebKit (Safari/iOS)", webkit]]) {
  const rec = { engine: name };
  try {
    const b = await engine.launch({ args: name === "Chromium" ? ["--no-sandbox"] : [] });
    const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();
    const jsErr = [], conErr = [];
    page.on("pageerror", e => jsErr.push(String(e).replace(/\s+/g," ").slice(0, 140)));
    page.on("console", m => { if (m.type() === "error") conErr.push(m.text().replace(/\s+/g," ").slice(0, 140)); });
    const resp = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 }).catch(() => null);
    await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
    const m = await page.evaluate(() => ({
      scrollW: document.scrollingElement.scrollWidth, innerW: window.innerWidth,
      h1: document.querySelectorAll("h1").length, imgs: document.querySelectorAll("img").length,
      broken: Array.from(document.images).filter(i => i.complete && i.naturalWidth === 0).length,
    }));
    rec.status = resp ? resp.status() : null;
    rec.loaded = !!resp && resp.status() < 400;
    rec.jsErrors = jsErr.length; rec.consoleErrors = conErr.length;
    rec.overflow = m.scrollW > m.innerW + 2; rec.h1 = m.h1; rec.imgs = m.imgs; rec.brokenImgs = m.broken;
    rec.sampleErrors = jsErr.slice(0, 2).concat(conErr.slice(0, 2));
    await shot(page, `${shotPrefix}_${name.split(" ")[0]}.png`);
    await b.close();
  } catch (e) { rec.error = String(e).replace(/\s+/g," ").slice(0, 180); rec.loaded = false; }
  result.engines.push(rec);
}

// ---- responsive: device profiles on chromium ----
const PROFILES = [
  { name: "Mobile", w: 375, h: 812, mobile: true },
  { name: "Tablet", w: 768, h: 1024, mobile: true },
  { name: "Desktop", w: 1440, h: 900, mobile: false },
];
const b = await chromium.launch({ args: ["--no-sandbox"] });
for (const p of PROFILES) {
  const ctx = await b.newContext({ viewport: { width: p.w, height: p.h }, isMobile: p.mobile, hasTouch: p.mobile, userAgent: UA });
  const page = await ctx.newPage();
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45000 }).catch(() => null);
  await page.waitForLoadState("networkidle", { timeout: 12000 }).catch(() => {});
  const r = await page.evaluate(() => {
    const se = document.scrollingElement;
    const vpEl = document.querySelector('meta[name="viewport"]');
    const controls = Array.from(document.querySelectorAll("a,button,input,select,[role=button]"));
    let small = 0, total = 0;
    for (const c of controls) { const b = c.getBoundingClientRect(); if (b.width === 0 || b.height === 0) continue; total++; if (b.width < 24 || b.height < 24) small++; }
    let minFont = 99;
    for (const el of document.querySelectorAll("p,span,a,li,td")) {
      const t = (el.textContent || "").trim(); if (t.length < 8) continue;
      const fs = parseFloat(getComputedStyle(el).fontSize); if (fs && fs < minFont) minFont = fs;
    }
    return { overflow: se.scrollWidth > window.innerWidth + 2, hasViewportMeta: !!vpEl,
      viewportContent: vpEl ? vpEl.content : "", smallTargets: small, totalTargets: total,
      minFontPx: minFont === 99 ? null : Math.round(minFont) };
  });
  await shot(page, `${shotPrefix}_dev${p.w}.png`);
  result.responsive.push({ ...p, ...r });
  await ctx.close();
}
await b.close();
if (outJson) { fs.writeFileSync(outJson, JSON.stringify(result, null, 2)); console.error("compat done"); }
else { process.stdout.write(JSON.stringify(result)); }
