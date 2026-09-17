import { Noto_Sans, Noto_Sans_Devanagari } from "next/font/google";
// UX4G Design System, layered:
//   1. ux4g-web-components — the official UX4G CSS bundle (utilities + components + tokens)
//   2. bootstrap 5 — still present during migration; being replaced screen by screen
//   3. ux4g-theme.css — maps the brand onto Bootstrap's variables (legacy layer, shrinking)
//   4. design-system.css — the gx-* product layer, rebased onto UX4G tokens
//   5. globals.css — a few app-specific helpers
// Import order matters: UX4G first so its base can be overridden by the brand
// layers, and design-system.css last among the token layers so the gx-* system wins.
import "ux4g-web-components/styles.css";
import "bootstrap/dist/css/bootstrap.min.css";
import "bootstrap-icons/font/bootstrap-icons.css";
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
