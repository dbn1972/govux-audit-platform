// GIGW 3.0 mandatory-element checks — deterministic DOM rules (no AI).
// Runs in the browser context via page.evaluate.
export function gigwChecks() {
  const text = document.body ? document.body.innerText.toLowerCase() : "";
  const html = document.documentElement.outerHTML.toLowerCase();
  const hasLink = (kw) => Array.from(document.querySelectorAll("a"))
    .some(a => (a.textContent || "").toLowerCase().includes(kw) ||
               (a.getAttribute("href") || "").toLowerCase().includes(kw));

  const checks = {
    contact_info:        /contact|helpline|toll[- ]?free|email/.test(text),
    last_updated:        /last updated|last reviewed|reviewed on/.test(text),
    copyright_policy:    hasLink("copyright"),
    privacy_policy:      hasLink("privacy"),
    terms:               hasLink("terms"),
    accessibility_stmt:  hasLink("accessibility"),
    hyperlink_policy:    hasLink("hyperlink"),
    help_faq:            hasLink("help") || hasLink("faq"),
    sitemap:             hasLink("sitemap"),
    search:              !!document.querySelector("input[type=search], [role=search], form[role=search]"),
    feedback:            hasLink("feedback") || hasLink("contact"),
    rti:                 hasLink("rti") || text.includes("right to information"),
    language_option:     hasLink("hindi") || hasLink("lang") ||
                         !!document.querySelector("[hreflang], .lang-switcher, #language"),
    metadata_title:      !!document.title && document.title.trim().length > 5,
    metadata_desc:       !!document.querySelector('meta[name="description"]'),
    viewport:            !!document.querySelector('meta[name="viewport"]'),
    https:               location.protocol === "https:",
  };
  return checks;
}
