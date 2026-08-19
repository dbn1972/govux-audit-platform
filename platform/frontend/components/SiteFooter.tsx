"use client";
import Link from "next/link";
import BrandMark from "@/components/BrandMark";

/** The one footer.
 *
 *  There were three: a bespoke row on the landing page, a second inside
 *  PublicShell, and none at all on the 38 signed-in screens — so the legal
 *  pages a department is entitled to reach were unreachable from every screen
 *  they actually work in.
 */
const PAGES: [string, string][] = [
  ["About Audit 360", "/about-us"],
  ["Privacy Policy", "/privacy-policy"],
  ["Terms & Conditions", "/term-and-conditions"],
  ["Contact", "/contact"],
];

// The standards this platform grades against, on the bodies that publish them.
// A reader checking whether we grade correctly needs the source, not our
// summary of it.
const STANDARDS: [string, string][] = [
  ["UX4G accessibility", "https://www.ux4g.gov.in/foundations/accessibility"],
  ["GIGW 3.0", "https://guidelines.india.gov.in/"],
  ["WCAG 2.2 AA", "https://www.w3.org/TR/WCAG22/"],
];

export default function SiteFooter() {
  return (
    <footer className="gx-footer">
      <div className="gx-footer-inner">
        <div className="gx-footer-brand">
          <BrandMark size={34} />
          <div>
            <div className="gx-brand-name">GovUX Audit</div>
            <p className="gx-muted mb-2" style={{ fontSize: ".8125rem", maxWidth: "34ch" }}>
              UX and compliance audits for <code>.gov.in</code> and <code>.nic.in</code> services,
              scored against GIGW 3.0, WCAG 2.2 AA and UX4G.
            </p>
            <a href="mailto:support.ux4g@digitalindia.gov.in" style={{ fontSize: ".8125rem" }}>
              support.ux4g@digitalindia.gov.in
            </a>
          </div>
        </div>

        <nav className="gx-footer-nav" aria-label="Footer">
          <div>
            <h2 className="gx-label">Platform</h2>
            <ul>
              {PAGES.map(([label, href]) => (
                <li key={href}><Link href={href}>{label}</Link></li>
              ))}
            </ul>
          </div>
          <div>
            <h2 className="gx-label">What we audit against</h2>
            <ul>
              {STANDARDS.map(([label, href]) => (
                <li key={href}>
                  <a href={href} target="_blank" rel="noopener noreferrer">
                    {label}
                    <i className="bi bi-box-arrow-up-right ms-1" aria-hidden="true"
                      style={{ fontSize: ".7em" }} />
                    <span className="visually-hidden"> (opens in a new tab)</span>
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </nav>
      </div>

      <div className="gx-footer-legal">
        <span>© {new Date().getFullYear()} UX4G · Powered by NeGD · MeitY, Government of India</span>
      </div>
    </footer>
  );
}
