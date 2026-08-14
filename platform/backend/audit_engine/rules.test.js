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
