#!/usr/bin/env node
/**
 * GovUX deterministic audit runner (no AI).
 *   Playwright  -> render, multi-page crawl, responsiveness, GIGW rules,
 *                  multilingual/script checks, overlay + broken-link + trust
 *   axe-core    -> WCAG 2.2 accessibility findings
 *   Lighthouse  -> Core Web Vitals / performance
 *
 * Usage:  node runner.js '{"url":"https://example.gov.in","depth":10}'
 * Output: one JSON object on stdout:
 *   { url, categories, cwv, findings, pages, pages_total, documents }
 */
import { chromium } from "playwright";
import { AxeBuilder } from "@axe-core/playwright";
import { gigwChecks } from "./gigw-rules.js";
import { detectScript, isIndic, langMatchesScript, readability } from "./lang.js";

const clamp = (n, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, n));
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
           "(KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36";
const MAX_CRAWL = 25;        // pages fully audited (bounded for runtime) — Phase-1 informational portals
const MAX_LINKCHECK = 30;    // links probed for broken-link QA
const MAX_DOCS = 12;

async function readInput() {
  if (process.argv[2]) return JSON.parse(process.argv[2]);
  const chunks = [];
  for await (const c of process.stdin) chunks.push(c);
  return JSON.parse(Buffer.concat(chunks).toString() || "{}");
}
function normalizeUrl(input) {
  let u = (input.url || input.domain || "").trim();
  if (!/^https?:\/\//.test(u)) u = "https://" + u;
  return u;
}

// ---------- accessibility (axe-core) ----------
async function accessibility(page) {
  const findings = [];
  try {
    const { violations } = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze();
    const w = { critical: 8, serious: 6, moderate: 3, minor: 1 };
    let penalty = 0;
    for (const v of violations) {
      penalty += (w[v.impact] || 2);
      findings.push({
        category: "accessibility",
        severity: v.impact === "critical" ? "critical" : v.impact === "serious" ? "high"
          : v.impact === "moderate" ? "medium" : "low",
        guideline: (v.tags.find(t => t.startsWith("wcag")) || v.id).toUpperCase(),
        title: v.help,
        element: v.nodes[0]?.target?.join(" ") || "",
        effort: v.impact === "minor" ? "low" : "medium",
      });
    }
    return { score: clamp(100 - Math.min(70, penalty)), findings };
  } catch (e) {
    return { score: 60, findings, error: String(e) };
  }
}

// ---------- responsiveness (multi-viewport) ----------
async function responsiveness(page, url) {
  const widths = [{ w: 360 }, { w: 414 }, { w: 768 }, { w: 1440 }];
  const findings = []; let passes = 0;
  for (const bp of widths) {
    try {
      await page.setViewportSize({ width: bp.w, height: 800 });
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
      const overflow = await page.evaluate(() =>
        document.scrollingElement.scrollWidth > window.innerWidth + 2);
      if (overflow) findings.push({ category: "responsiveness", severity: "high",
        guideline: "Responsive", title: `Horizontal overflow at ${bp.w}px`, effort: "medium" });
      else passes++;
    } catch { /* count as fail */ }
  }
  const overflowScore = (passes / widths.length) * 100;

  // WCAG 2.2 SC 2.5.8 Target Size (AA): tap targets must be >= 24x24px. Checked
  // at mobile width and folded into the responsiveness score (deterministic).
  let targetScore = 100;
  try {
    // resize the already-loaded page (no fresh navigation — avoids a redirect
    // destroying the execution context mid-evaluate on JS-heavy gov sites)
    await page.setViewportSize({ width: 375, height: 812 });
    const tt = await page.evaluate(() => {
      const controls = Array.from(document.querySelectorAll("a,button,input,select,[role=button]"));
      let small = 0, total = 0;
      for (const c of controls) {
        const b = c.getBoundingClientRect();
        if (b.width === 0 || b.height === 0) continue;
        total++;
        if (b.width < 24 || b.height < 24) small++;
      }
      return { small, total };
    });
    if (tt.total > 0) {
      const frac = tt.small / tt.total;
      targetScore = clamp(100 - frac * 100);
      if (tt.small > 0) findings.push({
        category: "responsiveness", severity: frac > 0.25 ? "high" : "medium",
        guideline: "WCAG-2.5.8",
        title: `${tt.small} of ${tt.total} tap targets are smaller than 24×24px on mobile`,
        effort: "medium" });
    }
  } catch { /* leave targetScore at 100 if the check can't run */ }

  // 60% no-overflow, 40% adequate tap-target size
  return { score: clamp(0.6 * overflowScore + 0.4 * targetScore), findings };
}

// ---------- GIGW mandatory elements ----------
async function gigw(page) {
  const checks = await page.evaluate(gigwChecks);
  const keys = Object.keys(checks);
  const passed = keys.filter(k => checks[k]).length;
  const findings = keys.filter(k => !checks[k]).map(k => ({
    category: "gigw", severity: k === "https" ? "critical" : "medium",
    guideline: "GIGW", title: `Missing mandatory element: ${k.replace(/_/g, " ")}`, effort: "low",
  }));
  return { score: clamp((passed / keys.length) * 100), findings };
}

// ---------- multilingual content (script-aware, gap G6) ----------
async function content(page) {
  const info = await page.evaluate(() => ({
    text: (document.body?.innerText || "").replace(/\s+/g, " ").trim().slice(0, 20000),
    htmlLang: document.documentElement.getAttribute("lang"),
    switcher: !!document.querySelector(
      '[hreflang], .lang-switcher, #language, [class*="lang"], a[href*="hindi"], a[href*="/hi"]'),
  }));
  const findings = [];
  const script = detectScript(info.text);
  if (!info.htmlLang) findings.push({ category: "content", severity: "medium",
    guideline: "WCAG-3.1.1", title: "Page has no declared language (html lang)", effort: "low" });
  else if (!langMatchesScript(info.htmlLang, script))
    findings.push({ category: "content", severity: "medium", guideline: "WCAG-3.1.1",
      title: `Declared lang '${info.htmlLang}' does not match the ${script} script on the page`,
      effort: "low" });
  if (isIndic(script) && !info.switcher) findings.push({ category: "content", severity: "low",
    guideline: "UX4G-lang", title: "Indic content without a visible language switcher", effort: "medium" });
  return { score: readability(info.text), findings, script, htmlLang: info.htmlLang };
}

// ---------- trust / security signals (expanded) ----------
async function trust(page, resp) {
  const h = resp ? resp.headers() : {};
  const isHttps = page.url().startsWith("https:");
  let score = isHttps ? 30 : 0;
  const findings = [];
  if (!isHttps) findings.push({ category: "trust", severity: "critical",
    guideline: "GIGW-6.2", title: "Site not served over HTTPS", effort: "medium" });
  for (const [key, pts, name, sev] of [
    ["strict-transport-security", 14, "HSTS", "medium"],
    ["content-security-policy", 14, "CSP", "medium"],
    ["x-content-type-options", 10, "X-Content-Type-Options", "low"],
    ["x-frame-options", 10, "X-Frame-Options", "low"],
    ["referrer-policy", 12, "Referrer-Policy", "low"],
    ["permissions-policy", 10, "Permissions-Policy", "low"]]) {
    if (h[key]) score += pts;
    else findings.push({ category: "trust", severity: sev,
      guideline: "Security", title: `Missing security header: ${name}`, effort: "low" });
  }
  return { score: clamp(score), findings };
}

// ---------- integrity: overlays + gaming detection (gap G10 + anti-gaming) ----------
// Two kinds of "accessibility/compliance theater" that inflate an automated score
// without helping real users: (a) third-party accessibility OVERLAY widgets, which
// the disability community rejects because they mask the markup instead of fixing
// it; (b) mandatory GIGW elements that are present in the DOM (so a crawler counts
// them) but HIDDEN from users (display:none / visibility:hidden / aria-hidden /
// zero-size) — i.e. stuffed to pass the check. Either flags the audit's integrity.
async function overlays(page) {
  const sig = await page.evaluate(() => {
    const sigs = ["accessibe", "acsb", "userway", "user-way", "equalweb", "audioeye",
                  "adally", "maxaccess", "max-access", "accessify", "recite-me", "reciteme",
                  "usercentrics-a11y", "textrol", "allyable", "accessibilityjs", "eqio"];
    const html = document.documentElement.outerHTML.toLowerCase();
    const overlay = sigs.filter(s => html.includes(s));

    // hidden-but-present "mandatory" links (classic crawler-stuffing)
    const terms = ["accessibility", "privacy", "sitemap", "rti", "contact", "help"];
    const hidden = [];
    for (const a of Array.from(document.querySelectorAll("a"))) {
      const label = (a.textContent || "").trim().toLowerCase();
      if (!terms.some(t => label.includes(t))) continue;
      const cs = getComputedStyle(a);
      const r = a.getBoundingClientRect();
      const invisible = cs.display === "none" || cs.visibility === "hidden" ||
        parseFloat(cs.opacity) === 0 || a.getAttribute("aria-hidden") === "true" ||
        (r.width <= 1 && r.height <= 1);
      if (invisible && !hidden.includes(label)) hidden.push(label);
    }
    return { overlay, hidden: hidden.slice(0, 6) };
  });

  const findings = [];
  let integrity = false;
  if (sig.overlay.length) {
    integrity = true;
    findings.push({ category: "accessibility", severity: "high", guideline: "Integrity-overlay",
      title: `Accessibility overlay detected (${sig.overlay[0]}) — it masks the markup instead of fixing it; remove it and remediate the page`,
      effort: "high" });
  }
  if (sig.hidden.length) {
    integrity = true;
    findings.push({ category: "gigw", severity: "high", guideline: "Integrity-gaming",
      title: `Mandatory element(s) present but hidden from users (${sig.hidden.join(", ")}) — looks stuffed to pass a check, not to help citizens`,
      effort: "medium" });
  }
  return { findings, integrity };
}

// ---------- usability heuristics ----------
async function usability(page) {
  const f = await page.evaluate(() => ({
    nav: !!document.querySelector("nav, [role=navigation]"),
    search: !!document.querySelector("input[type=search], [role=search]"),
    breadcrumb: !!document.querySelector("[aria-label*=breadcrumb i], .breadcrumb"),
    h1: document.querySelectorAll("h1").length === 1,
    labeledInputs: (() => {
      const inputs = Array.from(document.querySelectorAll("input,select,textarea"));
      if (!inputs.length) return 1;
      const ok = inputs.filter(i => i.labels?.length || i.getAttribute("aria-label")).length;
      return ok / inputs.length;
    })(),
  }));
  const score = clamp(20 * f.nav + 20 * f.search + 15 * f.breadcrumb + 15 * f.h1 + 30 * f.labeledInputs);
  return { score, findings: [] };
}

// ---------- link + document discovery ----------
async function discoverLinks(page, origin) {
  return await page.evaluate((origin) => {
    const abs = (h) => { try { return new URL(h, location.href).href; } catch { return null; } };
    const links = Array.from(document.querySelectorAll("a[href]"))
      .map(a => abs(a.getAttribute("href"))).filter(Boolean);
    const same = [...new Set(links.filter(u => u.startsWith(origin)))];
    // SSRF: only fetch documents from the SAME origin — an audited page can contain
    // attacker-controlled off-origin links (e.g. to cloud metadata / internal hosts).
    const pdfs = [...new Set(same.filter(u => /\.pdf(\?|#|$)/i.test(u)))];
    return { same, pdfs };
  }, origin);
}

// ---- Phase-1 page discovery for public informational portals ----
async function fetchText(context, u) {
  try { const r = await context.request.get(u, { timeout: 15000 }); return r.ok() ? await r.text() : ""; }
  catch { return ""; }
}
const locs = (xml) => [...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)].map(m => m[1]);

// robots.txt sitemaps + /sitemap.xml, recursing one level into a <sitemapindex>
async function sitemapPages(context, origin) {
  const out = new Set();
  const robots = await fetchText(context, origin + "/robots.txt");
  const smUrls = [...robots.matchAll(/sitemap:\s*(\S+)/gi)].map(m => m[1]);
  if (!smUrls.length) smUrls.push(origin + "/sitemap.xml");
  for (const sm of smUrls.slice(0, 5)) {
    const xml = await fetchText(context, sm);
    if (!xml) continue;
    if (/<sitemapindex/i.test(xml)) {                     // index of sitemaps -> recurse one level
      for (const child of locs(xml).filter(u => u.startsWith(origin)).slice(0, 5)) {
        const cx = await fetchText(context, child);
        locs(cx).filter(u => u.startsWith(origin)).forEach(u => out.add(u));
        if (out.size > 500) break;
      }
    } else {
      locs(xml).filter(u => u.startsWith(origin)).forEach(u => out.add(u));
    }
    if (out.size > 500) break;
  }
  return [...out];
}

// pick a diverse sample across distinct top-level path sections (so a big portal
// is judged on breadth — /about, /schemes, /services … — not 25 pages from one area)
function diversify(urls, cap) {
  const seg = (u) => { try { return (new URL(u).pathname.split("/").filter(Boolean)[0] || "/"); } catch { return "/"; } };
  const buckets = new Map();
  for (const u of urls) { const s = seg(u); (buckets.get(s) || buckets.set(s, []).get(s)).push(u); }
  const keys = [...buckets.keys()];
  const picked = [];
  let i = 0;
  while (picked.length < cap && keys.some(k => buckets.get(k).length)) {   // round-robin across sections
    const b = buckets.get(keys[i % keys.length]);
    if (b.length) picked.push(b.shift());
    i++;
  }
  return picked;
}

// ---------- broken-link QA (gap G8) ----------
async function brokenLinks(context, links) {
  const findings = [];
  for (const u of links.slice(0, MAX_LINKCHECK)) {
    try {
      const r = await context.request.get(u, { timeout: 12000, maxRedirects: 3 });
      if (r.status() >= 400) findings.push({ category: "content", severity: "medium",
        guideline: "Content-QA", title: `Broken link (${r.status()}): ${u}`, effort: "low", element: u });
    } catch {
      findings.push({ category: "content", severity: "low", guideline: "Content-QA",
        title: `Unreachable link: ${u}`, effort: "low", element: u });
    }
  }
  return findings;
}

// ---------- Lighthouse (CWV / performance) ----------
async function performance(url) {
  try {
    const chromeLauncher = await import("chrome-launcher");
    const lighthouse = (await import("lighthouse")).default;
    const chrome = await chromeLauncher.launch({
      chromePath: chromium.executablePath(),
      chromeFlags: ["--headless=new", "--no-sandbox", "--disable-dev-shm-usage"],
    });
    const runnerResult = await lighthouse(url, {
      port: chrome.port, onlyCategories: ["performance"], formFactor: "mobile",
      screenEmulation: { mobile: true },
    });
    const lhr = runnerResult.lhr;
    await chrome.kill();
    const cwv = {
      lcp_ms: Math.round(lhr.audits["largest-contentful-paint"]?.numericValue || 0),
      cls: +(lhr.audits["cumulative-layout-shift"]?.numericValue || 0).toFixed(3),
      tbt_ms: Math.round(lhr.audits["total-blocking-time"]?.numericValue || 0),
    };
    return { score: clamp((lhr.categories.performance.score || 0.6) * 100), cwv, findings: [] };
  } catch (e) {
    return { score: 60, cwv: {}, findings: [], error: String(e) };
  }
}

// run the lightweight (no-Lighthouse) check suite on an already-loaded page
async function auditLoaded(page, url, resp) {
  const [a11y, g, c, t, o] = [await accessibility(page), await gigw(page),
    await content(page), await trust(page, resp), await overlays(page)];
  // use the page's FINAL url (after redirects) so links on a redirected host aren't dropped
  const pageOrigin = (() => { try { return new URL(page.url()).origin; } catch { return new URL(url).origin; } })();
  const links = await discoverLinks(page, pageOrigin);
  const findings = [...a11y.findings, ...g.findings, ...c.findings, ...t.findings, ...o.findings];
  const page_score = Math.round((a11y.score + g.score + c.score + t.score) / 4);
  return { url, status: resp ? "analysed" : "error", a11y: a11y.score, gigw: g.score,
    content: c.score, trust: t.score, page_score, issue_count: findings.length,
    integrity: !!o.integrity, findings, links: links.same, pdfs: links.pdfs, script: c.script };
}

// navigate to a crawled page, then audit it (best-effort)
async function auditPage(context, url) {
  const page = await context.newPage();
  try {
    const resp = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 40000 }).catch(() => null);
    if (!resp) return { url, status: "error", page_score: 0, issue_count: 0, findings: [], links: [], pdfs: [] };
    await page.waitForLoadState("networkidle", { timeout: 8000 }).catch(() => {});
    return await auditLoaded(page, url, resp);
  } finally {
    await page.close();
  }
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

function dedupe(findings) {
  const seen = new Set(); const out = [];
  for (const f of findings) {
    const k = `${f.category}|${f.severity}|${f.guideline}|${f.title}`;
    if (seen.has(k)) continue;
    seen.add(k); out.push(f);
  }
  return out;
}
const avg = (xs) => xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;

async function main() {
  const input = await readInput();
  const url = normalizeUrl(input);
  const depth = Math.min(Number(input.depth) || MAX_CRAWL, MAX_CRAWL);
  let origin = new URL(url).origin;

  const browser = await chromium.launch({ args: ["--no-sandbox"] });
  const context = await browser.newContext({ userAgent: UA, viewport: { width: 1366, height: 900 } });
  const home = await context.newPage();
  const resp = await home.goto(url, { waitUntil: "domcontentloaded", timeout: 45000 }).catch(() => null);
  await home.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
  // follow redirects (e.g. apex -> www) so sitemap + same-origin crawl use the real host
  if (resp) { try { origin = new URL(home.url()).origin; } catch {} }

  // screenshot for the deterministic CV design score (worker passes screenshotPath)
  if (input.screenshotPath)
    await home.screenshot({ path: input.screenshotPath, type: "jpeg", quality: 70 }).catch(() => {});

  // audit the homepage in place (it demonstrably loaded) — never re-navigate it,
  // so a WAF throttling the crawl burst can't zero out the primary result
  const homeResult = await auditLoaded(home, url, resp);
  const homeLinks = { same: homeResult.links, pdfs: homeResult.pdfs };

  // homepage-only signals (whole-viewport / usability)
  const [respv, usab] = [await responsiveness(home, url), await usability(home)];

  // ---- build the crawl set: sitemap (robots + index) + homepage nav links,
  //      then a diverse sample across site sections (Phase-1 informational portals) ----
  const fromSitemap = await sitemapPages(context, origin);
  const pool = [...new Set([...fromSitemap, ...homeLinks.same])]
    .filter(u => u !== url && !/\.(pdf|jpg|png|zip|doc|xls)/i.test(u));
  const extra = diversify(pool, Math.max(0, depth - 1));

  const pageResults = [homeResult];
  for (const p of extra) {
    try { pageResults.push(await auditPage(context, p)); }
    catch { pageResults.push({ url: p, status: "error", page_score: 0, issue_count: 0, findings: [], pdfs: [] }); }
    await sleep(400);   // politeness: don't hammer the origin / trip its WAF
  }

  // broken-link QA + document discovery across everything we saw
  const allLinks = [...new Set(pageResults.flatMap(r => r.links || []))];
  const brokenFindings = await brokenLinks(context, allLinks);
  const documents = [...new Set(pageResults.flatMap(r => r.pdfs || []))].slice(0, MAX_DOCS);

  await browser.close();
  const perf = await performance(url);

  // ---- aggregate ----
  const ok = pageResults.filter(r => r.status === "analysed");
  const categories = {
    accessibility: Math.round(avg(ok.map(r => r.a11y).filter(n => n != null))) || 60,
    usability: Math.round(usab.score),
    gigw: Math.round(avg(ok.map(r => r.gigw).filter(n => n != null))) || 60,
    design: 70,                     // TODO: Phase-1 CV (layout/hierarchy/consistency)
    performance: Math.round(perf.score),
    responsiveness: Math.round(respv.score),
    content: Math.round(avg(ok.map(r => r.content).filter(n => n != null))) || 60,
    trust: Math.round(avg(ok.map(r => r.trust).filter(n => n != null))) || 60,
  };
  const findings = dedupe([
    ...pageResults.flatMap(r => r.findings || []),
    ...respv.findings, ...brokenFindings,
  ]);
  const pages = pageResults.map(r => ({
    url: r.url, status: r.status, page_score: r.page_score,
    issue_count: r.issue_count, lcp_ms: r.url === url ? perf.cwv.lcp_ms : undefined,
    cls: r.url === url ? perf.cwv.cls : undefined,
  }));

  process.stdout.write(JSON.stringify({
    url, categories, cwv: perf.cwv, findings, pages,
    pages_total: pages.length, documents,
    // anti-gaming: an overlay widget or hidden-stuffed mandatory element on any
    // audited page flags the audit's integrity so the compliance verdict can
    // refuse to certify "accessibility theater".
    integrity_flagged: pageResults.some(r => r.integrity),
    // Evidence signal for the worker's coverage-confidence gate: if the home
    // page never loaded (WAF/geo-block/timeout) or nothing was analysed, the
    // category fillers above are meaningless and MUST NOT become a GovUX band.
    evidence: { home_reachable: !!resp, pages_analysed: ok.length,
                pages_total: pages.length },
    coverage: { sitemap_urls: fromSitemap.length, discovered: pool.length + 1,
                pages_audited: pages.length, sampling: "diversified across site sections" },
  }));
}

main().catch(e => { console.error(e); process.exit(1); });
