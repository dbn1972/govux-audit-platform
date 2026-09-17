import { Noto_Sans, Noto_Sans_Devanagari } from "next/font/google";
// UX4G Design System, layered:
//   1. ux4g-web-components — the official UX4G CSS bundle (utilities + components +
//      tokens). The primary system: every page's layout, spacing, buttons, cards,
//      alerts, tabs and colour come from ux4g-* classes.
//   2. bootstrap 5 — retained ONLY for the handful of components UX4G has no drop-in
//      equivalent for and whose markup we did not restructure: native tables,
//      form-check/switch, input-group, list-group, progress and the .spinner-border
//      the e2e a11y suite waits on. Documented residual dependency, not a full stack.
//   3. ux4g-theme.css — maps the GovUX brand onto Bootstrap's --bs-* variables so those
//      residual Bootstrap components inherit the brand.
//   4. design-system.css — the gx-* product layer (page/card/stat/table/pill/report/
//      review primitives) + the UX4G primary-token rebase to the GovUX brand (Option A).
//   5. globals.css — a few app-specific helpers.
// Theme: the app writes BOTH data-theme (drives UX4G) and data-bs-theme (drives the
// retained Bootstrap components + gx layer) in lockstep — see the pre-paint script below.
// Import order matters: UX4G first so its base can be overridden by the brand layers,
// and design-system.css last among the token layers so the gx-* system wins.
import "ux4g-web-components/styles.css";
import "bootstrap/dist/css/bootstrap.min.css";
import "./ux4g-theme.css";
import "./design-system.css";
import "./globals.css";
import type { ReactNode } from "react";
import Ux4gRuntime from "@/components/Ux4gRuntime";

// Noto Sans, with its Devanagari companion loaded alongside rather than later:
// the platform is destined to run bilingually, and a face swapped in at that
// point changes every line length and column width on 62 screens. Both are
// self-hosted by next/font at build time — no request leaves the origin.
const sans = Noto_Sans({
  subsets: ["latin"], weight: ["400", "500", "600", "700"],
  variable: "--font-ux4g", display: "swap",
});
const devanagari = Noto_Sans_Devanagari({
  subsets: ["devanagari"], weight: ["400", "500", "600", "700"],
  variable: "--font-ux4g-deva", display: "swap",
});

export const metadata = {
  title: "GovUX Audit Platform",
  description: "Self-service UX & compliance audit engine for .gov.in / .nic.in sites",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${sans.variable} ${devanagari.variable}`}
      data-theme="light" data-bs-theme="light">
      <head>
        {/* Applied before first paint. Reading localStorage in an effect would
            paint the light theme, then repaint dark — a white flash on every
            navigation for anyone who chose dark.
            Sets BOTH attributes: data-theme drives the UX4G design system,
            data-bs-theme still drives the (shrinking) Bootstrap/gx dark layer
            until the migration retires it. UX4G has no prefers-color-scheme
            fallback, so the stored/system choice must be written explicitly. */}
        <script dangerouslySetInnerHTML={{ __html: `(function(){try{var d=document.documentElement;var t=localStorage.getItem('govux-theme');if(!t){t=window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';}d.setAttribute('data-theme',t);d.setAttribute('data-bs-theme',t);var f=Number(localStorage.getItem('govux-font-scale'));if(f>=90&&f<=140){d.style.fontSize=f+'%';}}catch(e){}})();` }} />
      </head>
      <body>
        <Ux4gRuntime />
        {children}
      </body>
    </html>
  );
}
