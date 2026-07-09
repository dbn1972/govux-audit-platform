import { Inter } from "next/font/google";
// UX4G Design System = Bootstrap 5 foundation + UX4G theme overrides + app layer
import "bootstrap/dist/css/bootstrap.min.css";
import "bootstrap-icons/font/bootstrap-icons.css";
import "./ux4g-theme.css";
import "./globals.css";
import type { ReactNode } from "react";

// UX4G-style clean sans (swap for the exact UX4G font / add Noto Sans for Indic scripts)
const font = Inter({ subsets: ["latin"], variable: "--font-ux4g", display: "swap" });

export const metadata = {
  title: "GovUX Audit Platform",
  description: "Self-service UX & compliance audit engine for .gov.in / .nic.in sites",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={font.variable} data-bs-theme="light">
      <body>
        <div className="govux-strip" />
        {children}
      </body>
    </html>
  );
}
