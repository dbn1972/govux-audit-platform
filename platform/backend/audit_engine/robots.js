/**
 * robots.txt (Robots Exclusion Protocol) parsing + matching, and the crawler's
 * identity.
 *
 * The runner used to read robots.txt ONLY to harvest `Sitemap:` lines and
 * ignored every exclusion rule in it, while presenting a user-agent that
 * impersonated Chrome-on-Windows. That combination made GovUX an undisclosed
 * bot crawling government infrastructure against the operator's stated wishes —
 * indefensible for a platform whose product is compliance.
 *
 * Dependency-free on purpose: pure logic, unit-testable (`robots.test.js`)
 * without installing Playwright.
 */

// Follows Googlebot's convention: keep a real browser token so UA-sniffing
// portals still serve the normal page, and append the bot identity + a contact
// URL so operators can allow-list, rate-limit or block us deliberately.
export const BOT_TOKEN = "GovUXBot";
export const BOT_URL = process.env.GOVUX_BOT_URL || "https://govux.gov.in/bot";

const BROWSER_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
                   "(KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36";

// Disclosure is the default and the correct behaviour. It has a real cost:
// some government WAFs block anything that self-identifies as a bot — measured
// on www.india.gov.in, which returns 403 to the disclosed UA and 200 to the
// bare browser one. The remedy is for the site operator to allow-list
// GovUXBot; an audit is normally run WITH their consent (DNS-TXT-verified
// ownership), so that is a conversation, not a technical obstacle.
//
// GOVUX_UA_DISCLOSE=0 exists for deployments that cannot get allow-listed and
// would otherwise have no working audit at all. It is deliberately an explicit,
// logged operator decision — never an automatic "retry in disguise when blocked",
// which would make the platform an evasive crawler by default.
export const UA_DISCLOSED = process.env.GOVUX_UA_DISCLOSE !== "0";
export const UA = UA_DISCLOSED
  ? `${BROWSER_UA} (compatible; ${BOT_TOKEN}/1.0; +${BOT_URL})`
  : BROWSER_UA;

/**
 * Parse robots.txt and return the rule group that applies to us.
 *
 * Group selection follows the REP: the most specific `User-agent` group wins, so
 * an explicit `GovUXBot` group beats the `*` catch-all. Consecutive User-agent
 * lines share one group of rules.
 */
export function parseRobots(text, token = BOT_TOKEN) {
  const groups = new Map();          // ua -> {allow, disallow, crawlDelay}
  let current = [];
  const want = token.toLowerCase();
  let lastWasUa = false;

  for (const rawLine of String(text || "").split(/\r?\n/)) {
    const line = rawLine.replace(/#.*$/, "").trim();
    if (!line) continue;
    const idx = line.indexOf(":");
    if (idx < 0) continue;
    const field = line.slice(0, idx).trim().toLowerCase();
    const value = line.slice(idx + 1).trim();

    if (field === "user-agent") {
      const ua = value.toLowerCase();
      if (!lastWasUa) current = [];
      if (!groups.has(ua)) groups.set(ua, { allow: [], disallow: [], crawlDelay: 0 });
      current.push(groups.get(ua));
      lastWasUa = true;
      continue;
    }
    lastWasUa = false;
    if (!current.length) continue;                       // rule outside any group
    for (const g of current) {
      if (field === "disallow") g.disallow.push(value);
      else if (field === "allow") g.allow.push(value);
      else if (field === "crawl-delay") {
        const n = parseFloat(value);
        if (!Number.isNaN(n) && n > 0) g.crawlDelay = n;
      }
    }
  }

  const exact = groups.get(want);
  if (exact) return exact;
  // a group naming us as a substring (e.g. "govuxbot/1.0") still beats "*"
  for (const [ua, g] of groups) if (ua !== "*" && want.includes(ua)) return g;
  return groups.get("*") || { allow: [], disallow: [], crawlDelay: 0 };
}

function ruleToRegex(rule) {
  // escape regex metacharacters EXCEPT the `*` wildcard and a trailing `$`
  const anchored = rule.endsWith("$");
  const body = anchored ? rule.slice(0, -1) : rule;
  const escaped = body.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*");
  return new RegExp("^" + escaped + (anchored ? "$" : ""));
}

/**
 * REP verdict for a path (pathname + query). Longest match wins; an Allow of
 * equal length beats Disallow, as Google's reference parser does.
 */
export function robotsAllows(rules, pathname) {
  const p = pathname || "/";
  let bestAllow = -1, bestDisallow = -1;
  for (const r of rules.allow || []) {
    if (r && ruleToRegex(r).test(p)) bestAllow = Math.max(bestAllow, r.length);
  }
  for (const r of rules.disallow || []) {
    if (r === "") continue;                 // `Disallow:` with no value allows everything
    if (ruleToRegex(r).test(p)) bestDisallow = Math.max(bestDisallow, r.length);
  }
  return bestDisallow < 0 || bestAllow >= bestDisallow;
}

export const pathOf = (u) => {
  try { const x = new URL(u); return x.pathname + x.search; } catch { return "/"; }
};
