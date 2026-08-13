/**
 * Unit tests for the robots.txt (REP) parser and matcher in runner.js.
 *
 * Worth real tests rather than a syntax check: getting these wrong means either
 * crawling pages a government site explicitly asked us not to touch, or quietly
 * excluding most of a portal and reporting a score from three pages.
 *
 *   node --test robots.test.js
 */
import test from "node:test";
import assert from "node:assert/strict";
import { parseRobots, robotsAllows } from "./robots.js";

const allows = (txt, path) => robotsAllows(parseRobots(txt), path);

test("no robots.txt (or an empty one) allows everything", () => {
  assert.equal(allows("", "/anything"), true);
  assert.equal(allows(null, "/anything"), true);
});

test("wildcard group Disallow blocks matching paths", () => {
  const txt = "User-agent: *\nDisallow: /admin\n";
  assert.equal(allows(txt, "/admin"), false);
  assert.equal(allows(txt, "/admin/users"), false);
  assert.equal(allows(txt, "/public"), true);
});

test("`Disallow:` with an empty value allows everything", () => {
  assert.equal(allows("User-agent: *\nDisallow:\n", "/admin"), true);
});

test("`Disallow: /` blocks the whole site", () => {
  const txt = "User-agent: *\nDisallow: /\n";
  assert.equal(allows(txt, "/"), false);
  assert.equal(allows(txt, "/schemes"), false);
});

test("longest match wins, and an equal-length Allow beats Disallow", () => {
  const txt = "User-agent: *\nDisallow: /docs\nAllow: /docs/public\n";
  assert.equal(allows(txt, "/docs/private"), false);
  assert.equal(allows(txt, "/docs/public/report.html"), true);

  // exact tie -> Allow wins (matches Google's reference parser)
  const tie = "User-agent: *\nDisallow: /x\nAllow: /x\n";
  assert.equal(allows(tie, "/x"), true);
});

test("`*` wildcard and `$` end-anchor are honoured", () => {
  const star = "User-agent: *\nDisallow: /*.pdf\n";
  assert.equal(allows(star, "/files/report.pdf"), false);
  assert.equal(allows(star, "/files/report.html"), true);

  const anchored = "User-agent: *\nDisallow: /page$\n";
  assert.equal(allows(anchored, "/page"), false);
  assert.equal(allows(anchored, "/page/child"), true);
});

test("a group naming GovUXBot overrides the wildcard group", () => {
  const txt = [
    "User-agent: *", "Disallow: /",
    "", "User-agent: GovUXBot", "Disallow: /private", "",
  ].join("\n");
  // the catch-all bans everything, but our own group is more specific
  assert.equal(allows(txt, "/schemes"), true);
  assert.equal(allows(txt, "/private"), false);
});

test("user-agent matching is case-insensitive", () => {
  const txt = "User-agent: govuxbot\nDisallow: /nope\n";
  assert.equal(allows(txt, "/nope"), false);
});

test("consecutive User-agent lines share one rule group", () => {
  const txt = "User-agent: GovUXBot\nUser-agent: SomeOtherBot\nDisallow: /shared\n";
  assert.equal(allows(txt, "/shared"), false);
});

test("comments and blank lines are ignored", () => {
  const txt = "# site rules\nUser-agent: *   # everyone\n\nDisallow: /admin  # staff only\n";
  assert.equal(allows(txt, "/admin"), false);
  assert.equal(allows(txt, "/"), true);
});

test("Crawl-delay is parsed from the winning group", () => {
  assert.equal(parseRobots("User-agent: *\nCrawl-delay: 2\n").crawlDelay, 2);
  assert.equal(parseRobots("User-agent: *\nCrawl-delay: 1.5\n").crawlDelay, 1.5);
  // junk / non-positive values are ignored rather than stalling the crawl
  assert.equal(parseRobots("User-agent: *\nCrawl-delay: soon\n").crawlDelay, 0);
  assert.equal(parseRobots("User-agent: *\nCrawl-delay: -5\n").crawlDelay, 0);
});

test("Sitemap directives don't leak into the path rules", () => {
  const rules = parseRobots("Sitemap: https://x.gov.in/sitemap.xml\nUser-agent: *\nDisallow: /a\n");
  assert.deepEqual(rules.disallow, ["/a"]);
});

test("a path containing regex metacharacters is matched literally", () => {
  const txt = "User-agent: *\nDisallow: /search?q=(a+b)\n";
  assert.equal(allows(txt, "/search?q=(a+b)"), false);
  assert.equal(allows(txt, "/search?q=aab"), true);
});
