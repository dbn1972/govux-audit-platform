"use client";
import Link from "next/link";
import BrandMark from "@/components/BrandMark";
import ThemeToggle from "@/components/ThemeToggle";
import SiteFooter from "@/components/SiteFooter";
import GovBanner from "@/components/GovBanner";
import SiteHeader from "@/components/SiteHeader";

/** Masthead and footer for the pages a visitor can reach without an account.
 *
 *  The landing page carries its own copy of this chrome because it also owns the
 *  scanner and the text-size controls; these content pages share one shell so
 *  the three of them cannot drift apart from each other.
 */
export default function PublicShell({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column",
                  background: "var(--gx-surface-sunken)" }}>
      <GovBanner />

      <SiteHeader />

      <main id="main" tabIndex={-1} style={{ outline: "none", flex: 1 }}>
        <div className="gx-page">{children}</div>
      </main>

      <SiteFooter />
    </div>
  );
}
