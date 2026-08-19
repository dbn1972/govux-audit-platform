import { Noto_Sans, Noto_Sans_Devanagari } from "next/font/google";
// UX4G Design System = Bootstrap 5 foundation + UX4G theme overrides + design layer
import "bootstrap/dist/css/bootstrap.min.css";
import "bootstrap-icons/font/bootstrap-icons.css";
import "./ux4g-theme.css";
import "./design-system.css";
import "./globals.css";
import type { ReactNode } from "react";

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
    <html lang="en" className={`${sans.variable} ${devanagari.variable}`} data-bs-theme="light">
      <body>
        <div className="govux-strip" />
        {children}
      </body>
    </html>
  );
}
