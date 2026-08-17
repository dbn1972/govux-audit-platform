/**
 * Unit tests for findings → rule identity.
 *
 * Worth real tests: when this mapping is wrong the audit still completes and
 * the score is unchanged, so nothing fails — the findings simply stop naming
 * which rule they broke, which is the whole point of a compliance report. That
 * is exactly how every axe violation came to be filed as "WCAG2AA".
 *
 *   node --test rules.test.js
 */
import test from "node:test";
import assert from "node:assert/strict";
import { wcagCriterion, gigwId } from "./rules.js";

test("prefers the success criterion over the conformance level", () => {
  // real axe tag order for colour contrast — level first, criterion second
  assert.equal(
    wcagCriterion(["cat.color", "wcag2aa", "wcag143", "TTv5", "EN-301-549"]),
    "WCAG-1.4.3");
});

test("handles two-digit criterion numbers", () => {
  assert.equal(wcagCriterion(["cat.semantics", "wcag2a", "wcag2411"]), "WCAG-2.4.11");
});

test("maps the WCAG 2.2 additions", () => {
  assert.equal(wcagCriterion(["cat.sensory-and-visual-cues", "wcag22aa", "wcag258"]),
    "WCAG-2.5.8");
});

test("every conformance-level tag is rejected as a criterion", () => {
  // the bug: these all start with "wcag" but identify a level, not a rule
  for (const level of ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]) {
    assert.equal(wcagCriterion([level]), null, `${level} must not parse as a criterion`);
  }
});

test("returns null when no criterion is present, so the caller can fall back", () => {
  assert.equal(wcagCriterion(["cat.color", "best-practice"]), null);
  assert.equal(wcagCriterion([]), null);
  assert.equal(wcagCriterion(), null);
  assert.equal(wcagCriterion(null), null);
});

test("GIGW checks that have library entries use the library's id", () => {
  assert.equal(gigwId("rti"), "GIGW-rti");
  assert.equal(gigwId("https"), "GIGW-6.2");
  assert.equal(gigwId("last_updated"), "GIGW-content-freshness");
  assert.equal(gigwId("accessibility_stmt"), "GIGW-accessibility-statement");
});

test("GIGW checks without a library entry still get a distinct, stable id", () => {
  assert.equal(gigwId("privacy_policy"), "GIGW-privacy-policy");
  assert.equal(gigwId("sitemap"), "GIGW-sitemap");
  // the point of the fix: two different checks must not share one id
  assert.notEqual(gigwId("sitemap"), gigwId("search"));
});

// ---- Core Web Vitals -> findings ------------------------------------------
// These numbers were measured on every audit and shown as a metric tile, but no
// finding was produced and perf.findings was never merged into the report — so
// the worst problem on a page could be missing from the remediation plan.
import { cwvFindings, CWV } from "./rules.js";

test("a vital inside the good band produces nothing", () => {
  assert.deepEqual(cwvFindings({ lcp_ms: 2000, cls: 0.05, tbt_ms: 150 }), []);
});

test("a breached vital produces a finding with its measured value", () => {
  const f = cwvFindings({ lcp_ms: 13600 });
  assert.equal(f.length, 1);
  assert.equal(f[0].guideline, "CWV-LCP");
  assert.equal(f[0].category, "performance");
  assert.equal(f[0].severity, "high");            // 13.6s is past the poor bound
  assert.match(f[0].title, /13\.6s/);             // the actual number, not "slow"
  assert.match(f[0].title, /poor/);
  assert.ok(f[0].remediation, "must carry its own advice");
});

test("needs-improvement is medium, poor is high", () => {
  assert.equal(cwvFindings({ lcp_ms: 3000 })[0].severity, "medium");
  assert.equal(cwvFindings({ lcp_ms: 5000 })[0].severity, "high");
  assert.equal(cwvFindings({ cls: 0.15 })[0].severity, "medium");
  assert.equal(cwvFindings({ cls: 0.4 })[0].severity, "high");
});

test("a missing measurement is not reported as a pass", () => {
  // The collector writes 0 when Lighthouse produced nothing; claiming a perfect
  // vital from a failed measurement would be worse than staying silent.
  assert.deepEqual(cwvFindings({ lcp_ms: 0, cls: 0, tbt_ms: 0 }), []);
  assert.deepEqual(cwvFindings({}), []);
  assert.deepEqual(cwvFindings(), []);
});

test("TBT is labelled as the lab proxy it is, not presented as INP", () => {
  const f = cwvFindings({ tbt_ms: 900 });
  assert.equal(f[0].guideline, "CWV-INP");
  assert.match(f[0].title, /Total Blocking Time/);
  assert.match(f[0].title, /proxy/i);
});

test("thresholds match the report's cwvJudge bounds", () => {
  // If these drift, a metric reads "Poor" on the report while the remediation
  // plan disagrees. Mirrors app/audits/[id]/report/page.tsx.
  assert.equal(CWV.lcp.good, 2500);
  assert.equal(CWV.lcp.poor, 4000);
  assert.equal(CWV.cls.good, 0.1);
  assert.equal(CWV.cls.poor, 0.25);
});
