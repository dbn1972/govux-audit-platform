"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { api } from "@/lib/api";

type NavGroup = { group: string; steward?: boolean; items: string[][] };
const NAV: NavGroup[] = [
  { group: "Workspace", items: [
    ["Dashboard", "/dashboard", "bi-grid"],
    ["My Domains", "/domains", "bi-globe"],
  ]},
  { group: "Audits", items: [
    ["New Audit", "/audits/new", "bi-play-circle"],
    ["Audit History", "/audits", "bi-clock-history"],
    ["Design Studio", "/studio", "bi-magic"],
    ["Sample Report", "/report", "bi-file-earmark-text"],
  ]},
  { group: "Assess", items: [
    ["Manual Review", "/review", "bi-check2-square"],
    ["Guideline Library", "/library", "bi-book"],
  ]},
  { group: "Account", items: [
    ["Team & Settings", "/settings", "bi-gear"],
  ]},
  { group: "Steward (MeitY/NIC)", steward: true, items: [
    ["National Dashboard", "/admin/national", "bi-bank"],
    ["Approvals", "/admin/approvals", "bi-inbox"],
    ["Bulk Scan", "/admin/bulk-scan", "bi-collection"],
    ["Continuous Monitoring", "/admin/monitoring", "bi-arrow-repeat"],
    ["Estate Discovery", "/admin/discovery", "bi-search"],
    ["Ministries", "/admin/ministries", "bi-building"],
    ["States & UTs", "/admin/states", "bi-map"],
    ["League Table", "/admin/league", "bi-trophy"],
    ["Alerts", "/admin/alerts", "bi-bell"],
    ["Standards & Rules", "/admin/standards", "bi-sliders"],
    ["Studio Access", "/admin/studio-access", "bi-key"],
    ["Configuration", "/admin/config", "bi-gear-wide-connected"],
    ["Methodology", "/admin/methodology", "bi-diagram-3"],
  ]},
];

// every route behind the steward group — used to guard non-stewards from deep links
const STEWARD_PREFIXES = NAV.filter(g => g.steward).flatMap(g => g.items.map(([, h]) => h as string));
const isStewardRoute = (path: string) =>
  STEWARD_PREFIXES.some(h => path === h || path.startsWith(h + "/"));

/** The navigation list — shared by the desktop rail and the mobile drawer.
 *  Steward-only groups are hidden unless the signed-in user is a steward. */
function NavList({ path, isSteward, onNavigate }: { path: string; isSteward: boolean; onNavigate?: () => void }) {
  const groups = NAV.filter(g => !g.steward || isSteward);
  // Longest-prefix wins so only one item highlights: on /audits/new, "New Audit"
  // is active, not the shorter "/audits" (Audit History) that also prefix-matches.
  const hrefs = groups.flatMap(g => g.items.map(([, href]) => href as string));
  const activeHref = hrefs
    .filter(h => path === h || path.startsWith(h + "/"))
    .sort((a, b) => b.length - a.length)[0];
  return (
    <nav aria-label="Primary">
      {groups.map(g => (
        <div key={g.group}>
          <div className="text-secondary text-uppercase fw-bold px-2 pt-3 pb-1" style={{ fontSize: 10.5, letterSpacing: ".04em" }}>{g.group}</div>
          {g.items.map(([label, href, icon]) => {
            const active = href === activeHref;
            return (
              <Link key={href} href={href} onClick={onNavigate}
                aria-current={active ? "page" : undefined}
                className={`d-flex align-items-center gap-2 px-2 py-2 rounded text-decoration-none mb-1 ${active ? "text-white" : "text-body"}`}
                style={active ? { background: "#0a3d7a" } : {}}>
                <i className={`bi ${icon}`} /> <span style={{ fontSize: 13.5 }}>{label}</span>
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}

function AccessDenied() {
  return (
    <div className="container-fluid p-4">
      <div className="card shadow-sm mx-auto mt-5" style={{ maxWidth: 520 }}>
        <div className="card-body text-center p-4">
          <div className="display-6 mb-2" aria-hidden="true">🔒</div>
          <h1 className="h4" style={{ color: "var(--ux-navy)" }}>This area is for MeitY/NIC stewards</h1>
          <p className="text-secondary">
            National oversight, rankings, monitoring and platform configuration are available to
            programme stewards only. Your account manages your own organisation’s domains and audits.
          </p>
          <Link href="/dashboard" className="btn btn-primary">← Back to your workspace</Link>
        </div>
      </div>
    </div>
  );
}

export default function AppShell({ children }: { children: ReactNode }) {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const [me, setMe] = useState<any>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const drawerRef = useRef<HTMLDivElement>(null);

  // who is signed in — drives role-aware nav + route guarding + the avatar
  useEffect(() => { api.me().then(setMe).catch(() => setMe({ is_steward: false })); }, []);
  const isSteward = !!me?.is_steward;
  const denied = !!me && !me.is_steward && isStewardRoute(path);
  const initials = ((me?.display_name || me?.email || "").match(/[A-Za-z]+/g) || [])
    .slice(0, 2).map((s: string) => s[0].toUpperCase()).join("") || "GX";

  // close the drawer whenever the route changes (tapping a nav item navigates)
  useEffect(() => { setOpen(false); }, [path]);

  // when the drawer is open: lock body scroll, Esc to close, move focus into the
  // dialog, trap Tab within it, and restore focus to the trigger on close — the
  // contract implied by role="dialog" aria-modal="true" (WCAG 2.4.3 / 4.1.2).
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const panel = drawerRef.current;
    const focusables = () => Array.from(
      panel?.querySelectorAll<HTMLElement>('a[href],button:not([disabled]),[tabindex]:not([tabindex="-1"])') || []);
    focusables()[0]?.focus();   // first focusable = the close button
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { setOpen(false); return; }
      if (e.key !== "Tab") return;
      const f = focusables();
      if (!f.length) return;
      const first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
      triggerRef.current?.focus();   // restore focus to the hamburger
    };
  }, [open]);

  return (
    <div>
      <nav className="navbar navbar-expand bg-white border-bottom px-3 sticky-top" style={{ zIndex: 1040 }}>
        {/* hamburger — only on tablet/mobile (<lg) */}
        <button type="button" ref={triggerRef} onClick={() => setOpen(true)}
          className="btn btn-link text-body p-0 me-2 d-lg-none border-0"
          aria-label="Open navigation menu" aria-expanded={open} aria-controls="app-drawer"
          style={{ fontSize: 22, lineHeight: 1 }}>
          <i className="bi bi-list" />
        </button>
        <span className="navbar-brand d-flex align-items-center gap-2 fw-bold me-0">
          <span className="d-inline-flex align-items-center justify-content-center text-white fw-bold"
            style={{ width: 34, height: 34, borderRadius: 9, background: "linear-gradient(135deg,#0a3d7a,#0d6efd)" }}>GX</span>
          <span className="d-none d-sm-inline">GovUX <span className="text-secondary fw-normal small">Audit Platform</span></span>
          <span className="d-inline d-sm-none">GovUX</span>
        </span>
        <div className="ms-auto d-flex align-items-center gap-3">
          <i className="bi bi-bell text-secondary" />
          <span className="rounded-circle text-white d-inline-flex align-items-center justify-content-center"
            title={me?.email || ""}
            style={{ width: 34, height: 34, background: "#0a3d7a", fontSize: 13 }}>{initials}</span>
        </div>
      </nav>

      <div className="d-flex">
        {/* desktop rail — sticky, self-scrolling, hidden below lg */}
        <aside className="border-end bg-white p-2 d-none d-lg-block flex-shrink-0"
          style={{ width: 236, position: "sticky", top: 60, height: "calc(100vh - 60px)", overflowY: "auto" }}>
          <NavList path={path} isSteward={isSteward} />
        </aside>

        <main className="flex-grow-1" style={{ background: "var(--bs-body-bg)", minWidth: 0 }}>
          {denied ? <AccessDenied /> : children}
        </main>
      </div>

      {/* mobile / tablet drawer (<lg): backdrop + off-canvas panel, driven by React state */}
      <div className="d-lg-none" aria-hidden={!open}>
        <div onClick={() => setOpen(false)}
          style={{
            position: "fixed", inset: 0, background: "rgba(9,20,40,.45)", zIndex: 1045,
            opacity: open ? 1 : 0, pointerEvents: open ? "auto" : "none",
            transition: "opacity .25s ease",
          }} />
        <div id="app-drawer" ref={drawerRef} role="dialog" aria-modal="true" aria-label="Navigation"
          className="bg-white shadow"
          style={{
            position: "fixed", top: 0, left: 0, bottom: 0, width: 280, maxWidth: "82vw", zIndex: 1046,
            transform: open ? "translateX(0)" : "translateX(-100%)",
            transition: "transform .28s cubic-bezier(.22,.61,.36,1)",
            overflowY: "auto", padding: "10px 8px",
          }}>
          <div className="d-flex align-items-center justify-content-between px-2 pb-2 mb-1 border-bottom">
            <span className="fw-bold d-flex align-items-center gap-2">
              <span className="d-inline-flex align-items-center justify-content-center text-white fw-bold"
                style={{ width: 30, height: 30, borderRadius: 8, background: "linear-gradient(135deg,#0a3d7a,#0d6efd)", fontSize: 13 }}>GX</span>
              GovUX
            </span>
            <button type="button" onClick={() => setOpen(false)}
              className="btn btn-link text-secondary p-1 border-0" aria-label="Close navigation menu"
              style={{ fontSize: 20, lineHeight: 1 }}>
              <i className="bi bi-x-lg" />
            </button>
          </div>
          <NavList path={path} isSteward={isSteward} onNavigate={() => setOpen(false)} />
        </div>
      </div>
    </div>
  );
}
