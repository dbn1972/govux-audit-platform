"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { buildNavbarClasses } from "ux4g-web-components/types";
import BrandMark from "@/components/BrandMark";
import ThemeToggle from "@/components/ThemeToggle";

/** The signed-out masthead.
 *
 *  The landing page and the content pages had two of these — same brand, two
 *  paddings, two link colours, one with the section anchors and one without.
 *  The anchors resolve against the landing page from anywhere, so every public
 *  page can carry the same header without pretending it owns those sections.
 *
 *  Built on UX4G's published Navbar (doc.ux4g.gov.in → Components → Navbar):
 *  `ux4g-navbar` from the package's own `buildNavbarClasses()`, the
 *  `ux4g-navbar-wrap` row, the brand block with its emblem / `divider-vertical`
 *  / title + description pair, and the `ux4g-navbar-links` list of
 *  `ux4g-text-link-sm` anchors. That retires the bespoke .gx-siteheader and
 *  .gx-siteheader-link rules.
 *
 *  Three deliberate departures from the published example:
 *
 *  1. It stays a <header>, not a bare <nav>. This is the page's banner landmark
 *     — the identity bar above it is deliberately not one — and the links sit in
 *     a <nav> inside it, so both landmarks exist exactly once.
 *  2. No `ux4g-navbar-desktop` / `ux4g-navbar-mobile` pair. That pair is
 *     all-or-nothing: `navbar-desktop` is `display:none !important` below 768px
 *     and everything inside it moves into a `navbar-mobile` dropdown you have to
 *     build. Adopting the wrapper without building that dropdown would take the
 *     links *and the Sign in button* off every phone. With three links and two
 *     actions, hiding links individually keeps sign-in reachable at every width.
 *  3. No `ux4g-navbar-logo` on the mark. That class is `filter:brightness(0)
 *     invert(1)`, for a white logo on a dark bar; our navbar ground is
 *     `--ux4g-bg-neutral-elevated`, so it would render the mark white on white.
 */
export default function SiteHeader() {
  // A "Sign in" button on the sign-in page is a control that takes you where you
  // already are.
  const onSignIn = usePathname() === "/login";
  return (
    <header className={buildNavbarClasses()}>
      <div className="ux4g-container">
        <div className="ux4g-navbar-wrap">
          <Link href="/" className="ux4g-d-flex ux4g-ai-center ux4g-gap-x-s gx-brand">
            <BrandMark size={40} />
            <span className="ux4g-divider-vertical ux4g-d-none ux4g-sm-d-block" aria-hidden="true" />
            <span className="ux4g-d-flex ux4g-flex-column">
              <span className="ux4g-label-m-strong">GovUX Audit</span>
              <span className="ux4g-body-xs-default">UX4G · GIGW 3.0 · WCAG 2.2 AA</span>
            </span>
          </Link>

          <div className="ux4g-d-flex ux4g-ai-center ux4g-gap-x-l">
            <nav aria-label="Site">
              <ul className="ux4g-navbar-links">
                <li className="ux4g-d-none ux4g-md-d-flex">
                  <Link href="/#checks" className="ux4g-text-link-sm">What we check</Link>
                </li>
                <li className="ux4g-d-none ux4g-md-d-flex">
                  <Link href="/#how" className="ux4g-text-link-sm">How it works</Link>
                </li>
                <li className="ux4g-d-none ux4g-lg-d-flex">
                  <Link href="/about-us" className="ux4g-text-link-sm">About</Link>
                </li>
              </ul>
            </nav>
            <div className="ux4g-d-flex ux4g-ai-center ux4g-gap-x-m">
              <ThemeToggle />
              {!onSignIn && (
                <Link href="/login" className="ux4g-btn ux4g-btn-outline-primary ux4g-btn-sm">Sign in</Link>
              )}
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
