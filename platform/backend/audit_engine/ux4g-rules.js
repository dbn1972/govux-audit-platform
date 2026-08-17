// UX4G v3.0.0 deterministic checks — run in the browser via page.evaluate.
//
// The mastersheet marks 71 guidelines "deterministic" that the engine had no
// code for. They were advertised in the library as automated AND excluded from
// the assessor's checklist, so they were falling through entirely: neither
// machine-checked nor human-checked.
//
// This covers the ones that genuinely are decidable from the DOM and computed
// styles. Anything needing judgement (tone of voice, whether content is "easy
// to understand", whether the right tasks are prioritised) is deliberately NOT
// here — those are reclassified for human review instead, because a check that
// guesses is worse than no check on a compliance report.
//
// Every rule returns { id, ok, detail } and is written to fail closed: when the
// page gives us nothing to judge, ok is true rather than inventing a finding.

export function ux4gChecks() {
  const out = [];
  const add = (id, ok, detail = "") => out.push({ id, ok, detail });
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));
  const visible = (el) => {
    const r = el.getBoundingClientRect();
    const s = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && s.visibility !== "hidden" && s.display !== "none";
  };
  const text = (el) => (el.textContent || "").trim();

  // ---- identity: logo present, and it goes home -----------------------------
  const header = document.querySelector("header, [role=banner], .navbar, .header") || document.body;
  const logo = header.querySelector('img[alt*="logo" i], img[src*="logo" i], svg[aria-label*="logo" i], .logo, #logo, .navbar-brand');
  add("UX4G-PLD-022", !!logo, logo ? "" : "No logo found in the header region");
  if (logo) {
    const link = logo.closest("a");
    const href = link && link.getAttribute("href");
    const home = href !== null && href !== undefined &&
      (href === "/" || href === "" || href === "#" || /^https?:\/\/[^/]+\/?$/.test(href) ||
       href === window.location.origin + "/");
    add("UX4G-PLD-023", !!home,
        link ? `Logo links to "${href}", not the homepage` : "Logo is not a link");
  } else {
    add("UX4G-PLD-023", true);   // nothing to judge
  }

  // ---- links must be distinguishable from body text -------------------------
  // Colour alone is not enough; the guideline asks for a visible difference.
  const paraLinks = $$("p a[href], li a[href]").filter(visible).slice(0, 60);
  const undecorated = paraLinks.filter((a) => {
    const s = getComputedStyle(a);
    const p = getComputedStyle(a.parentElement || document.body);
    const noLine = !/(underline|overline)/.test(s.textDecorationLine || s.textDecoration || "");
    const sameColour = s.color === p.color;
    const sameWeight = s.fontWeight === p.fontWeight;
    return noLine && sameColour && sameWeight;
  });
  add("UX4G-PLD-012", undecorated.length === 0,
      undecorated.length ? `${undecorated.length} in-text link(s) look identical to surrounding text` : "");

  // ---- underline reserved for links ----------------------------------------
  const falseUnderline = $$("p, span, li, div, h1, h2, h3, h4, h5, h6")
    .filter((el) => el.children.length === 0 && text(el) && visible(el))
    .filter((el) => !el.closest("a"))
    .filter((el) => /underline/.test(getComputedStyle(el).textDecorationLine || ""))
    .slice(0, 20);
  add("UX4G-PLD-018", falseUnderline.length === 0,
      falseUnderline.length ? `${falseUnderline.length} underlined element(s) that are not links` : "");

  // ---- typography: legible size, consistent family, sane scale --------------
  const bodyish = $$("p, li, td, dd, label").filter((el) => text(el).length > 20 && visible(el)).slice(0, 200);
  const tooSmall = bodyish.filter((el) => parseFloat(getComputedStyle(el).fontSize) < 12);
  add("UX4G-PLD-004", tooSmall.length === 0,
      tooSmall.length ? `${tooSmall.length} block(s) of body text below 12px` : "");

  const families = new Set(bodyish.concat($$("h1,h2,h3,button,a").filter(visible).slice(0, 100))
    .map((el) => (getComputedStyle(el).fontFamily || "").split(",")[0].trim().replace(/["']/g, "").toLowerCase())
    .filter(Boolean));
  add("UX4G-PLD-014", families.size <= 3,
      families.size > 3 ? `${families.size} different font families: ${[...families].slice(0, 6).join(", ")}` : "");

  const sizes = new Set(bodyish.concat($$("h1,h2,h3,h4,h5,h6").filter(visible))
    .map((el) => Math.round(parseFloat(getComputedStyle(el).fontSize))));
  add("UX4G-PLD-028", sizes.size <= 10,
      sizes.size > 10 ? `${sizes.size} distinct font sizes — no consistent type scale` : "");

  // ---- affordances: pointer cursor on things that aren't interactive --------
  const INTERACTIVE = "a,button,input,select,textarea,summary,label,[role=button],[role=link],[role=tab],[role=menuitem],[onclick],[tabindex]";
  const falseAffordance = $$("div, span, p, li")
    .filter(visible)
    .filter((el) => getComputedStyle(el).cursor === "pointer")
    .filter((el) => !el.matches(INTERACTIVE) && !el.closest(INTERACTIVE))
    .slice(0, 20);
  add("UX4G-PLD-010", falseAffordance.length === 0,
      falseAffordance.length ? `${falseAffordance.length} element(s) look clickable but are not` : "");

  // ---- print-friendly -------------------------------------------------------
  let hasPrint = $$('link[rel=stylesheet][media*="print" i]').length > 0;
  if (!hasPrint) {
    for (const sheet of Array.from(document.styleSheets)) {
      try {
        for (const rule of Array.from(sheet.cssRules || [])) {
          if (rule.media && /print/.test(rule.conditionText || rule.media.mediaText || "")) { hasPrint = true; break; }
        }
      } catch { /* cross-origin sheet — cannot inspect, don't penalise */ }
      if (hasPrint) break;
    }
  }
  add("UX4G-PLD-017", hasPrint, hasPrint ? "" : "No print stylesheet — printed pages will carry navigation and chrome");

  // ---- responsive: media queries present ------------------------------------
  let mediaQueries = 0, unreadable = 0;
  for (const sheet of Array.from(document.styleSheets)) {
    try {
      for (const rule of Array.from(sheet.cssRules || [])) {
        if (rule.media && /(max-width|min-width)/.test(rule.conditionText || rule.media.mediaText || "")) mediaQueries++;
      }
    } catch { unreadable++; }
  }
  // Only assert when at least one stylesheet was actually readable.
  add("UX4G-MFA-002", mediaQueries > 0 || unreadable === Array.from(document.styleSheets).length,
      mediaQueries > 0 ? "" : "No width-based media queries — layout is unlikely to adapt to phones");

  // ---- lazy loading for below-the-fold images -------------------------------
  const imgs = $$("img").filter(visible);
  const belowFold = imgs.filter((el) => el.getBoundingClientRect().top > window.innerHeight);
  const eager = belowFold.filter((el) => (el.getAttribute("loading") || "") !== "lazy");
  add("UX4G-MFA-007", belowFold.length === 0 || eager.length === 0,
      eager.length ? `${eager.length} of ${belowFold.length} below-the-fold image(s) load eagerly` : "");

  // ---- heading hierarchy ----------------------------------------------------
  const heads = $$("h1,h2,h3,h4,h5,h6").filter(visible);
  const levels = heads.map((h) => Number(h.tagName[1]));
  const h1s = levels.filter((l) => l === 1).length;
  let skipped = null;
  for (let i = 1; i < levels.length; i++) {
    if (levels[i] - levels[i - 1] > 1) { skipped = `h${levels[i - 1]} → h${levels[i]}`; break; }
  }
  add("UX4G-WCQ-007", heads.length > 0 && h1s === 1 && !skipped,
      heads.length === 0 ? "No headings at all"
      : h1s === 0 ? "No h1 on the page"
      : h1s > 1 ? `${h1s} h1 elements — there should be exactly one`
      : skipped ? `Heading level skipped (${skipped})` : "");

  // ---- content broken into readable chunks ----------------------------------
  const longParas = $$("p").filter(visible).filter((p) => text(p).split(/\s+/).length > 150);
  add("UX4G-WCQ-011", longParas.length === 0,
      longParas.length ? `${longParas.length} paragraph(s) over 150 words — break these up` : "");

  // ---- placeholder used as the only label -----------------------------------
  const fields = $$("input:not([type=hidden]):not([type=submit]):not([type=button]), textarea, select").filter(visible);
  const placeholderOnly = fields.filter((el) => {
    if (!el.getAttribute("placeholder")) return false;
    const labelled = (el.id && document.querySelector(`label[for="${CSS.escape(el.id)}"]`)) ||
                     el.closest("label") || el.getAttribute("aria-label") || el.getAttribute("aria-labelledby");
    return !labelled;
  });
  add("UX4G-WCQ-017", placeholderOnly.length === 0,
      placeholderOnly.length ? `${placeholderOnly.length} field(s) rely on placeholder text as their only label` : "");

  // ---- forms kept to essential fields ---------------------------------------
  const forms = $$("form").filter(visible);
  const bloated = forms.filter((f) =>
    f.querySelectorAll("input:not([type=hidden]):not([type=submit]):not([type=button]), select, textarea").length > 15);
  add("UX4G-FDE-001", bloated.length === 0,
      bloated.length ? `${bloated.length} form(s) with more than 15 fields on one screen` : "");

  // ---- navigation landmark, labelled ----------------------------------------
  const navs = $$("nav, [role=navigation]").filter(visible);
  const namedNav = navs.some((n) => n.getAttribute("aria-label") || n.getAttribute("aria-labelledby"));
  add("UX4G-NIA-003", navs.length > 0 && (navs.length === 1 || namedNav),
      navs.length === 0 ? "No <nav> landmark"
      : !namedNav ? `${navs.length} navigation regions and none is labelled — they are indistinguishable` : "");

  // ---- links used as buttons ------------------------------------------------
  const fakeButtons = $$("a").filter(visible).filter((a) => {
    const href = a.getAttribute("href");
    return href === null || href === "#" || /^javascript:/i.test(href);
  }).filter((a) => a.getAttribute("role") !== "button").slice(0, 20);
  add("UX4G-TO-023", fakeButtons.length === 0,
      fakeButtons.length ? `${fakeButtons.length} link(s) act as buttons (no destination)` : "");

  // ---- list items big enough to hit ----------------------------------------
  const listTargets = $$("li a[href], li button").filter(visible);
  const small = listTargets.filter((el) => {
    const r = el.getBoundingClientRect();
    return r.height < 24 || r.width < 24;
  });
  add("UX4G-LFS-004", small.length === 0,
      small.length ? `${small.length} list target(s) below 24×24px` : "");

  return out;
}
