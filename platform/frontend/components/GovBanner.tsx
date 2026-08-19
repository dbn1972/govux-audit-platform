"use client";
import { useEffect, useState } from "react";

export const FONT_KEY = "govux-font-scale";
const MIN = 90, MAX = 140, STEP = 10;

/** Government of India identity bar, with the text-size control GIGW expects.
 *
 *  It lived on the landing page only, and reset to 100% on every navigation —
 *  so a reader who needs 130% had to set it again on each page, which is the
 *  same as not offering it. The choice now persists like the theme, is applied
 *  before first paint, and the bar appears on every page including the
 *  signed-in ones.
 */
export default function GovBanner() {
  const [scale, setScale] = useState(100);

  useEffect(() => {
    const stored = Number(localStorage.getItem(FONT_KEY));
    if (stored >= MIN && stored <= MAX) setScale(stored);
  }, []);

  function apply(next: number) {
    const v = Math.min(MAX, Math.max(MIN, next));
    setScale(v);
    document.documentElement.style.fontSize = v + "%";
    try { localStorage.setItem(FONT_KEY, String(v)); } catch { /* private mode */ }
  }

  return (
    <div className="gx-govbar">
      {/* First focusable element on every page. It lives here because this bar
          is the first thing rendered — a skip link that is not first is not a
          skip link. */}
      <a href="#main" className="gx-skip">Skip to main content</a>
      <div className="container d-flex align-items-center justify-content-between gap-3">
        <span className="d-flex align-items-center gap-2">
          <b>Government of India</b>
          <span className="d-none d-sm-inline gx-govbar-dept">
            Ministry of Electronics &amp; Information Technology
          </span>
        </span>

        <span className="d-flex align-items-center gap-3">
          {/* smallest to largest, left to right — the old order ran A+ A A−,
              which reads backwards against every other size control */}
          <span className="gx-textsize" role="group" aria-label="Text size">
            <button type="button" onClick={() => apply(scale - STEP)}
              disabled={scale <= MIN} aria-label="Decrease text size">A−</button>
            <button type="button" onClick={() => apply(100)}
              aria-label="Reset text size to normal">A</button>
            <button type="button" onClick={() => apply(scale + STEP)}
              disabled={scale >= MAX} aria-label="Increase text size">A+</button>
          </span>
          <span className="visually-hidden" role="status">Text size {scale} per cent</span>
          {/* Plain text, not a menu: there is one language today, and a chevron
              promising a switcher that does not exist is worse than none. */}
          <span className="d-none d-sm-inline gx-govbar-dept">English</span>
        </span>
      </div>
    </div>
  );
}
