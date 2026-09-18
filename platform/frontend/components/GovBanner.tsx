"use client";
import { useEffect, useState } from "react";
import { buildAccessibilityBarClasses } from "ux4g-web-components/types";

export const FONT_KEY = "govux-font-scale";
const MIN = 90, MAX = 140, STEP = 10;

/** Government of India identity bar, with the text-size control GIGW expects.
 *
 *  It lived on the landing page only, and reset to 100% on every navigation —
 *  so a reader who needs 130% had to set it again on each page, which is the
 *  same as not offering it. The choice now persists like the theme, is applied
 *  before first paint, and the bar appears on every page including the
 *  signed-in ones.
 *
 *  Built on UX4G's own accessibility bar (topbar / __wrap / __group /
 *  __iconbtn / __selectbtn) rather than a bespoke bar, so it inherits the
 *  design system's brand ground, inverse ink and 36px controls — the old
 *  hand-rolled version pinned #12243b and #dfe7f1 as literals and so was the
 *  one strip of UI that never followed the theme.
 *
 *  The root class comes from the package's own `buildAccessibilityBarClasses()`
 *  rather than a hardcoded "ux4g-topbar" string. That function is the supported
 *  API for this component, so a class rename upstream arrives as a new package
 *  version instead of silently unstyling the bar. UX4G ships no builder for the
 *  sub-parts, so those stay literal.
 *
 *  Markup follows the published Accessibility Bar (doc.ux4g.gov.in →
 *  Components → Accessibility Bar): the india-flag emblem, the Government of
 *  India external link, acc-top-divider rules, the __group of three
 *  __iconbtn text-size controls drawn with the embedded UX4G Material Icons
 *  ligatures, and the __select / __selectbtn language control. Every one of
 *  those classes and the icon font ship inside the npm bundle, so nothing is
 *  fetched from a CDN.
 *
 *  Four deliberate departures from the published example, each for a reason:
 *
 *  1. It is a <div>, not <header role="banner">. This bar renders immediately
 *     above another <header> on every page (SiteHeader, AppShell, showcase), and
 *     two top-level banner landmarks is an axe violation. The published example
 *     stands alone, where that role is correct.
 *  2. The skip link stays first in the DOM and off-screen until focused. The
 *     published example puts a visible "Skip to Main Content" *after* the
 *     Government of India link, which makes that external link the first stop
 *     for a keyboard user — a skip link that is not first is not a skip link.
 *  3. No `accessibility_new` button. In the published example it opens UX4G's
 *     accessibility widget, which is a separate CDN script this app does not
 *     load; shipping the button without it is a control that does nothing.
 *  4. No `arrow_drop_down` on the language control, and no aria-haspopup. There
 *     is one language today, and a chevron promising a switcher that does not
 *     exist is worse than none. The trigger keeps its styling so adding the
 *     listbox later is additive.
 */
export default function GovBanner() {
  const [scale, setScale] = useState(100);

  useEffect(() => {
    // Same guard as the write below and the pre-paint script in layout.tsx:
    // storage access throws outright when site data is blocked, and this bar
    // renders on every page — an unguarded read takes the whole app down.
    try {
      const stored = Number(localStorage.getItem(FONT_KEY));
      if (stored >= MIN && stored <= MAX) setScale(stored);
    } catch { /* private mode */ }
  }, []);

  function apply(next: number) {
    const v = Math.min(MAX, Math.max(MIN, next));
    setScale(v);
    document.documentElement.style.fontSize = v + "%";
    try { localStorage.setItem(FONT_KEY, String(v)); } catch { /* private mode */ }
  }

  return (
    <div className={buildAccessibilityBarClasses()}>
      {/* First focusable element on every page — see note 2 above. */}
      <a href="#main" className="gx-skip">Skip to main content</a>
      <div className="ux4g-container">
        <div className="ux4g-topbar__wrap ux4g-d-flex ux4g-jc-between ux4g-ai-center">
          <a className="ux4g-d-flex ux4g-ai-center ux4g-gap-2xs"
            href="https://www.india.gov.in/" target="_blank" rel="noopener noreferrer"
            aria-label="Government of India (opens in new tab)">
            <span className="india-flag" aria-hidden="true" />
            <span className="ux4g-label-m-default ux4g-text-nowrap">Government of India</span>
            <sup className="ux4g-icon-outlined" aria-hidden="true">open_in_new</sup>
          </a>

          <nav aria-label="Top utilities" className="ux4g-d-flex ux4g-ai-center">
            {/* smallest to largest, left to right — the old order ran A+ A A−,
                which reads backwards against every other size control */}
            <div className="ux4g-topbar__group ux4g-d-flex ux4g-ai-center" role="group"
              aria-label="Text size">
              <button type="button" aria-label="Decrease text size" disabled={scale <= MIN}
                onClick={() => apply(scale - STEP)}
                className="ux4g-topbar__iconbtn ux4g-d-flex ux4g-jc-center ux4g-ai-center">
                <span className="ux4g-icon-outlined ux4g-top-bar-icon" aria-hidden="true">text_decrease</span>
              </button>
              <button type="button" aria-label="Reset text size to normal"
                onClick={() => apply(100)}
                className="ux4g-topbar__iconbtn ux4g-d-flex ux4g-jc-center ux4g-ai-center">
                <span className="ux4g-icon-outlined ux4g-top-bar-icon" aria-hidden="true">font_download</span>
              </button>
              <button type="button" aria-label="Increase text size" disabled={scale >= MAX}
                onClick={() => apply(scale + STEP)}
                className="ux4g-topbar__iconbtn ux4g-d-flex ux4g-jc-center ux4g-ai-center">
                <span className="ux4g-icon-outlined ux4g-top-bar-icon" aria-hidden="true">text_increase</span>
              </button>
            </div>
            <span className="ux4g-sr-only" role="status">Text size {scale} per cent</span>

            <span className="ux4g-bl-1 acc-top-divider ux4g-mx-2xs ux4g-d-none ux4g-sm-d-inline-block"
              aria-hidden="true" />

            <div className="ux4g-topbar__select ux4g-d-none ux4g-sm-d-block">
              <span className="ux4g-topbar__selectbtn ux4g-d-inline-flex ux4g-ai-center">
                <span className="ux4g-icon-outlined ux4g-top-bar-icon icon-language"
                  aria-hidden="true">language</span>
                <span className="ux4g-label-m-default">English</span>
              </span>
            </div>
          </nav>
        </div>
      </div>
    </div>
  );
}
