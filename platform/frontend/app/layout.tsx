import { Noto_Sans, Noto_Sans_Devanagari } from "next/font/google";
// UX4G Design System, three layers, in this order (Bootstrap fully removed):
//   1. ux4g-web-components — the official UX4G CSS bundle (utilities + components +
//      tokens + stock default theme). The system: layout, spacing, buttons, cards,
//      alerts, tabs, tables, forms, inputs, tags, spinners, colour — all ux4g-*.
//   2. design-system.css — the bespoke gx-* product primitives UX4G has no component
//      for (score meter, verdict/severity blocks, review workflow, nav rail, stat
//      tiles), authored entirely on UX4G semantic tokens and the gx-* tokens it
//      declares. No Bootstrap variables, classes or stylesheet remain.
//   3. globals.css — the page ground and the responsive-table reflow.
// Theme: single data-theme attribute (UX4G's switch). Default theme, no brand override.
// Import order: UX4G first (establishes reset + tokens), then the gx layer, then globals.
import "ux4g-web-components/styles.css";
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
      data-theme="light">
      <head>
        {/* Applied before first paint. Reading localStorage in an effect would
            paint the light theme, then repaint dark — a white flash on every
            navigation for anyone who chose dark. data-theme is UX4G's theme
            switch; UX4G has no prefers-color-scheme fallback, so the stored or
            system choice must be written explicitly here. */}
        <script dangerouslySetInnerHTML={{ __html: `(function(){try{var d=document.documentElement;var t=localStorage.getItem('govux-theme');if(!t){t=window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';}d.setAttribute('data-theme',t);var f=Number(localStorage.getItem('govux-font-scale'));if(f>=90&&f<=140){d.style.fontSize=f+'%';}}catch(e){}})();` }} />
      </head>
      <body>
        <Ux4gRuntime />
        {children}
      </body>
    </html>
  );
}
