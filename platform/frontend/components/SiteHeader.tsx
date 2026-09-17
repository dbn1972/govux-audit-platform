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
      <div className="container ux4g-d-flex ux4g-ai-center ux4g-jc-between ux4g-gap-s ux4g-py-xs">
        <Link href="/" className="gx-brand">
          <BrandMark size={40} />
          <span>
            <span className="gx-brand-name" style={{ fontSize: 18 }}>GovUX Audit</span>
            <span className="gx-brand-sub">UX4G · GIGW 3.0 · WCAG 2.2 AA</span>
          </span>
        </Link>
        <nav className="ux4g-d-flex ux4g-ai-center ux4g-gap-s" aria-label="Site">
          <Link href="/#checks" className="ux4g-d-none ux4g-md-d-inline gx-siteheader-link">What we check</Link>
          <Link href="/#how" className="ux4g-d-none ux4g-md-d-inline gx-siteheader-link">How it works</Link>
          <Link href="/about-us" className="ux4g-d-none ux4g-lg-d-inline gx-siteheader-link">About</Link>
          <ThemeToggle />
          {!onSignIn && (
            <Link href="/login" className="ux4g-btn ux4g-btn-outline-primary ux4g-btn-sm">Sign in</Link>
          )}
        </nav>
      </div>
    </header>
  );
}
