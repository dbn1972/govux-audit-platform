"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import BrandMark from "@/components/BrandMark";
import ThemeToggle from "@/components/ThemeToggle";

/** The signed-out masthead.
 *
 *  The landing page and the content pages had two of these — same brand, two
 *  paddings, two link colours, one with the section anchors and one without.
 *  The anchors resolve against the landing page from anywhere, so every public
 *  page can carry the same header without pretending it owns those sections.
 */
export default function SiteHeader() {
  // A "Sign in" button on the sign-in page is a control that takes you where you
  // already are.
  const onSignIn = usePathname() === "/login";
  return (
    <header className="gx-siteheader">
      <div className="container d-flex align-items-center justify-content-between gap-3 py-2">
        <Link href="/" className="gx-brand">
          <BrandMark size={40} />
          <span>
            <span className="gx-brand-name" style={{ fontSize: 18 }}>GovUX Audit</span>
            <span className="gx-brand-sub">UX4G · GIGW 3.0 · WCAG 2.2 AA</span>
          </span>
        </Link>
        <nav className="d-flex align-items-center gap-3" aria-label="Site">
          <Link href="/#checks" className="d-none d-md-inline gx-siteheader-link">What we check</Link>
          <Link href="/#how" className="d-none d-md-inline gx-siteheader-link">How it works</Link>
          <Link href="/about-us" className="d-none d-lg-inline gx-siteheader-link">About</Link>
          <ThemeToggle />
          {!onSignIn && (
            <Link href="/login" className="btn btn-outline-primary btn-sm">Sign in</Link>
          )}
        </nav>
      </div>
    </header>
  );
}
