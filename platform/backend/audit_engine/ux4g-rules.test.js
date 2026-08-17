/**
 * Tests for the UX4G deterministic checks.
 *
 * These run in a real Chromium page rather than jsdom on purpose: half the
 * rules depend on computed styles and layout geometry (font size, cursor,
 * element box, above/below the fold), and jsdom reports zeroes for all of it —
 * every rule would "pass" against a page that plainly fails.
 *
 * Each case asserts BOTH directions: a page that should fail does, and a page
 * that should pass does. A rule that only ever fires is as useless as one that
 * never does.
 *
 *   node --test ux4g-rules.test.js
 */
import test from "node:test";
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { ux4gChecks } from "./ux4g-rules.js";

let browser;
test.before(async () => { browser = await chromium.launch({ args: ["--no-sandbox"] }); });
test.after(async () => { await browser?.close(); });

/** Load an HTML fragment and return the checks keyed by rule id. */
async function check(html) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  try {
    await page.setContent(`<!doctype html><html lang="en"><body>${html}</body></html>`,
                          { waitUntil: "domcontentloaded" });
    const results = await page.evaluate(ux4gChecks);
    return Object.fromEntries(results.map(r => [r.id, r]));
  } finally { await page.close(); }
}

test("logo: present and linking home passes; a non-linked logo fails", async () => {
  const ok = await check(`<header><a href="/"><img src="/logo.png" alt="Department logo"></a></header>`);
  assert.equal(ok["UX4G-PLD-022"].ok, true);
  assert.equal(ok["UX4G-PLD-023"].ok, true);

  const bad = await check(`<header><img src="/logo.png" alt="Department logo"></header>`);
  assert.equal(bad["UX4G-PLD-022"].ok, true);      // it is there...
  assert.equal(bad["UX4G-PLD-023"].ok, false);     // ...but goes nowhere
});

test("heading hierarchy: exactly one h1 and no skipped level", async () => {
  const ok = await check(`<h1>Title</h1><h2>Section</h2><h3>Sub</h3>`);
  assert.equal(ok["UX4G-WCQ-007"].ok, true);

  const twoH1 = await check(`<h1>One</h1><h1>Two</h1>`);
  assert.equal(twoH1["UX4G-WCQ-007"].ok, false);
  assert.match(twoH1["UX4G-WCQ-007"].detail, /2 h1/);

  const skip = await check(`<h1>Title</h1><h4>Jumped</h4>`);
  assert.equal(skip["UX4G-WCQ-007"].ok, false);
  assert.match(skip["UX4G-WCQ-007"].detail, /skipped/i);
});

test("placeholder is not a label", async () => {
  const ok = await check(`<label for="a">Full name</label><input id="a" placeholder="e.g. R. Sharma">`);
  assert.equal(ok["UX4G-WCQ-017"].ok, true);

  const bad = await check(`<input placeholder="Full name">`);
  assert.equal(bad["UX4G-WCQ-017"].ok, false);
});

test("links that act as buttons are flagged", async () => {
  const ok = await check(`<a href="/apply">Apply</a>`);
  assert.equal(ok["UX4G-TO-023"].ok, true);

  const bad = await check(`<a href="#" onclick="go()">Apply</a><a>Submit</a>`);
  assert.equal(bad["UX4G-TO-023"].ok, false);
});

test("false affordance: pointer cursor on a plain div", async () => {
  const ok = await check(`<button style="cursor:pointer">Real button</button>`);
  assert.equal(ok["UX4G-PLD-010"].ok, true);

  const bad = await check(`<div style="cursor:pointer">Looks clickable</div>`);
  assert.equal(bad["UX4G-PLD-010"].ok, false);
});

test("body text below 12px is flagged", async () => {
  const ok = await check(`<p style="font-size:16px">${"word ".repeat(10)}</p>`);
  assert.equal(ok["UX4G-PLD-004"].ok, true);

  const bad = await check(`<p style="font-size:9px">${"word ".repeat(10)}</p>`);
  assert.equal(bad["UX4G-PLD-004"].ok, false);
});

test("navigation landmark must exist, and be named when there are several", async () => {
  const ok = await check(`<nav><a href="/a">A</a></nav>`);
  assert.equal(ok["UX4G-NIA-003"].ok, true);

  const none = await check(`<div><a href="/a">A</a></div>`);
  assert.equal(none["UX4G-NIA-003"].ok, false);

  const unnamed = await check(`<nav><a href="/a">A</a></nav><nav><a href="/b">B</a></nav>`);
  assert.equal(unnamed["UX4G-NIA-003"].ok, false);

  const named = await check(
    `<nav aria-label="Primary"><a href="/a">A</a></nav><nav aria-label="Footer"><a href="/b">B</a></nav>`);
  assert.equal(named["UX4G-NIA-003"].ok, true);
});

test("in-text links must differ from surrounding text", async () => {
  const ok = await check(`<p style="color:#000">text <a href="/x" style="color:#00f;text-decoration:underline">link</a></p>`);
  assert.equal(ok["UX4G-PLD-012"].ok, true);

  const bad = await check(
    `<p style="color:#000;font-weight:400">text <a href="/x" style="color:#000;font-weight:400;text-decoration:none">link</a></p>`);
  assert.equal(bad["UX4G-PLD-012"].ok, false);
});

test("underline is reserved for links", async () => {
  const ok = await check(`<p>plain <a href="/x" style="text-decoration:underline">link</a></p>`);
  assert.equal(ok["UX4G-PLD-018"].ok, true);

  const bad = await check(`<p><span style="text-decoration:underline">not a link</span></p>`);
  assert.equal(bad["UX4G-PLD-018"].ok, false);
});

test("long paragraphs are flagged as unreadable chunks", async () => {
  const ok = await check(`<p>${"word ".repeat(40)}</p>`);
  assert.equal(ok["UX4G-WCQ-011"].ok, true);

  const bad = await check(`<p>${"word ".repeat(200)}</p>`);
  assert.equal(bad["UX4G-WCQ-011"].ok, false);
});

test("oversized forms are flagged", async () => {
  const small = await check(`<form>${"<input>".repeat(5)}</form>`);
  assert.equal(small["UX4G-FDE-001"].ok, true);

  const huge = await check(`<form>${"<input>".repeat(20)}</form>`);
  assert.equal(huge["UX4G-FDE-001"].ok, false);
});

test("a page with nothing to judge does not invent findings", async () => {
  // Fails closed: an empty page should not report a logo problem or a link
  // problem it has no evidence for.
  const empty = await check("");
  assert.equal(empty["UX4G-PLD-023"].ok, true);
  assert.equal(empty["UX4G-PLD-012"].ok, true);
  assert.equal(empty["UX4G-TO-023"].ok, true);
  assert.equal(empty["UX4G-WCQ-017"].ok, true);
});
