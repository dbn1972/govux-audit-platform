"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { api, setToken } from "@/lib/api";
import BrandMark from "@/components/BrandMark";
import ThemeToggle from "@/components/ThemeToggle";
import { useFocusTrap } from "@/components/useFocusTrap";
import NotificationBell from "@/components/NotificationBell";

type NavGroup = { group: string; steward?: boolean; items: NavItem[] };
type NavItem = string[] & { studio?: boolean };

// Helper to tag an item with metadata (studio entitlement gating)
function navItem(label: string, href: string, icon: string, opts?: { studio?: boolean }): NavItem {
  const item = [label, href, icon] as NavItem;
  if (opts?.studio) item.studio = true;
  return item;
}

const NAV: NavGroup[] = [
  { group: "Workspace", items: [
    navItem("Dashboard", "/dashboard", "bi-grid"),
    navItem("My Domains", "/domains", "bi-globe"),
  ]},
  { group: "Audits", items: [
    navItem("New Audit", "/audits/new", "bi-play-circle"),
    navItem("Audit History", "/audits", "bi-clock-history"),
    navItem("Design Studio", "/studio", "bi-magic", { studio: true }),
    navItem("Sample Report", "/report", "bi-file-earmark-text"),
  ]},
  { group: "Assess", items: [
    navItem("Manual Review", "/review", "bi-check2-square"),
    navItem("External Assessments", "/assessments", "bi-shield-check"),
    navItem("Guideline Library", "/library", "bi-book"),
  ]},
  { group: "Account", items: [
    navItem("Team & Settings", "/settings", "bi-gear"),
  ]},
  { group: "Steward (MeitY/NIC)", steward: true, items: [
    navItem("National Dashboard", "/admin/national", "bi-bank"),
    navItem("Approvals", "/admin/approvals", "bi-inbox"),
    navItem("Bulk Scan", "/admin/bulk-scan", "bi-collection"),
    navItem("Continuous Monitoring", "/admin/monitoring", "bi-arrow-repeat"),
    navItem("Estate Discovery", "/admin/discovery", "bi-search"),
    navItem("Organisations", "/admin/organisations", "bi-diagram-2"),
    navItem("Register Import", "/admin/registry", "bi-upload"),
    navItem("Domain Claims", "/admin/domain-claims", "bi-shield-exclamation"),
    navItem("Ministries", "/admin/ministries", "bi-building"),
    navItem("States & UTs", "/admin/states", "bi-map"),
    navItem("League Table", "/admin/league", "bi-trophy"),
    navItem("Alerts", "/admin/alerts", "bi-bell"),
    navItem("Standards & Rules", "/admin/standards", "bi-sliders"),
    navItem("Studio Access", "/admin/studio-access", "bi-key"),
    navItem("Configuration", "/admin/config", "bi-gear-wide-connected"),
    navItem("Methodology", "/admin/methodology", "bi-diagram-3"),
  ]},
];

// every route behind the steward group — used to guard non-stewards from deep links
const STEWARD_PREFIXES = NAV.filter(g => g.steward).flatMap(g => g.items.map(([, h]) => h as string));
const isStewardRoute = (path: string) =>
  STEWARD_PREFIXES.some(h => path === h || path.startsWith(h + "/"));

// idle-session policy (separate from the 15-min access token): warn 1 minute
// before auto sign-out, so an officer who stepped away doesn't lose work
// silently. Real activity anywhere on the page cancels both timers.
const IDLE_WARNING_AFTER_MS = 29 * 60 * 1000;
const IDLE_LOGOUT_AFTER_MS = 30 * 60 * 1000;
const ACTIVITY_EVENTS = ["mousemove", "keydown", "mousedown", "touchstart", "scroll"] as const;

/** The navigation list — shared by the desktop rail and the mobile drawer.
 *  Steward-only groups are hidden unless the signed-in user is a steward.
 *  Studio item is hidden unless the org has studio_enabled entitlement. */
function NavList({ path, isSteward, studioEnabled, onSignOut, onNavigate }:
  { path: string; isSteward: boolean; studioEnabled: boolean; onSignOut: () => void; onNavigate?: () => void }) {
  const groups = NAV.filter(g => !g.steward || isSteward);
  // Filter out studio-gated items when the org doesn't have entitlement
  const filteredGroups = groups.map(g => ({
    ...g,
    items: g.items.filter(item => !item.studio || studioEnabled),
  }));
  // Longest-prefix wins so only one item highlights: on /audits/new, "New Audit"
  // is active, not the shorter "/audits" (Audit History) that also prefix-matches.
  const hrefs = filteredGroups.flatMap(g => g.items.map(([, href]) => href as string));
  const activeHref = hrefs
    .filter(h => path === h || path.startsWith(h + "/"))
    .sort((a, b) => b.length - a.length)[0];
  return (
    <nav aria-label="Primary">
      {filteredGroups.map(g => (
        <div key={g.group}>
          <div className="gx-rail-group gx-label">{g.group}</div>
          {g.items.map(([label, href, icon]) => {
            const active = href === activeHref;
            return (
              <Link key={href} href={href} onClick={onNavigate}
                aria-current={active ? "page" : undefined} className="gx-nav-link">
                <i className={`bi ${icon}`} aria-hidden="true" /> <span>{label}</span>
              </Link>
            );
          })}
          {g.group === "Account" && (
            <button type="button" onClick={onSignOut} className="gx-nav-link">
              <i className="bi bi-box-arrow-right" aria-hidden="true" /> <span>Sign out</span>
            </button>
          )}
        </div>
      ))}
    </nav>
  );
}

function AccessDenied() {
  return (
    <div className="container-fluid p-4">
      <div className="gx-card mx-auto mt-5" style={{ maxWidth: 520 }}>
        <div className="card-body text-center p-4">
          <div className="gx-empty-icon mb-3"><i className="bi bi-shield-lock" aria-hidden="true" /></div>
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

function IdleWarning({ secondsLeft, onContinue, onSignOut }:
  { secondsLeft: number; onContinue: () => void; onSignOut: () => void }) {
  const panel = useRef<HTMLDivElement>(null);
  useFocusTrap(true, panel);   // mounted only while the warning is up
  return (
    <div role="alertdialog" aria-modal="true" aria-labelledby="idle-warning-title"
      style={{ position: "fixed", inset: 0, zIndex: 1080, background: "rgba(9,20,40,.45)",
        display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div ref={panel} className="gx-card" style={{ maxWidth: 420, width: "92%" }}>
        <div className="card-body p-4 text-center">
          <div className="gx-empty-icon mb-3"><i className="bi bi-hourglass-split" aria-hidden="true" /></div>
          <h2 id="idle-warning-title" className="h5">Still there?</h2>
          <p className="text-secondary mb-3">
            You've been inactive — for your security, you'll be signed out in{" "}
            <strong>{secondsLeft}s</strong> unless you continue.
          </p>
          <div className="d-flex gap-2 justify-content-center">
            <button type="button" className="btn btn-primary" onClick={onContinue}>Stay signed in</button>
            <button type="button" className="btn btn-outline-secondary" onClick={onSignOut}>Sign out now</button>
          </div>
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
  const studioEnabled = !!me?.entitlements?.studio_enabled;
  const denied = !!me && !me.is_steward && isStewardRoute(path);
  const initials = ((me?.display_name || me?.email || "").match(/[A-Za-z]+/g) || [])
    .slice(0, 2).map((s: string) => s[0].toUpperCase()).join("") || "GX";

  // best-effort server-side revoke, then always forget the local token and
  // leave — even if the network call fails, the user must not stay signed in
  function signOut() {
    api.logout().catch(() => {});
    setToken(null);
    window.location.assign("/login");
  }

  // Sign out sits one line under "Team & Settings" in the rail, and signing back
  // in means waiting for an emailed code. A misclick costing a round trip
  // through a mailbox is worth one confirmation.
  const [confirmSignOut, setConfirmSignOut] = useState(false);
  const signOutPanel = useRef<HTMLDivElement>(null);
  useFocusTrap(confirmSignOut, signOutPanel);

  // --- idle timeout: 29 min inactive -> warn, 30 min -> auto sign-out -------
  const [menuOpen, setMenuOpen] = useState(false);
  useEffect(() => {
    if (!menuOpen) return;
    const close = (e: MouseEvent) => {
      if (!(e.target as HTMLElement).closest(".gx-menu-wrap")) setMenuOpen(false);
    };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setMenuOpen(false); };
    window.addEventListener("mousedown", close);
    window.addEventListener("keydown", esc);
    return () => { window.removeEventListener("mousedown", close); window.removeEventListener("keydown", esc); };
  }, [menuOpen]);

  const [idleWarning, setIdleWarning] = useState(false);
  const [idleSecondsLeft, setIdleSecondsLeft] = useState(60);
  const warnTimer = useRef<ReturnType<typeof setTimeout>>();
  const logoutTimer = useRef<ReturnType<typeof setTimeout>>();
  const countdownTimer = useRef<ReturnType<typeof setInterval>>();
  const lastResetAt = useRef(0);

  function clearIdleTimers() {
    clearTimeout(warnTimer.current);
    clearTimeout(logoutTimer.current);
    clearInterval(countdownTimer.current);
  }

  function armIdleTimers() {
    clearIdleTimers();
    warnTimer.current = setTimeout(() => {
      setIdleWarning(true);
      setIdleSecondsLeft(Math.round((IDLE_LOGOUT_AFTER_MS - IDLE_WARNING_AFTER_MS) / 1000));
      countdownTimer.current = setInterval(() => {
        setIdleSecondsLeft(s => Math.max(0, s - 1));
      }, 1000);
    }, IDLE_WARNING_AFTER_MS);
    logoutTimer.current = setTimeout(signOut, IDLE_LOGOUT_AFTER_MS);
  }

  // "still there?" — any real activity (including while the warning is up)
  // cancels the pending sign-out and dismisses it. Throttled, not run on
  // every mousemove, since re-arming two timers per event is unnecessary;
  // a few seconds of slack doesn't matter for a 30-minute idle window.
  function onActivity() {
    const now = Date.now();
    if (now - lastResetAt.current < 5000) return;
    lastResetAt.current = now;
    setIdleWarning(false);
    armIdleTimers();
  }

  function stayLoggedIn() {
    setIdleWarning(false);
    api.me().catch(() => {});   // touch the API — proactively refreshes an expired access token
    lastResetAt.current = Date.now();
    armIdleTimers();
  }

  useEffect(() => {
    armIdleTimers();
    ACTIVITY_EVENTS.forEach(ev => window.addEventListener(ev, onActivity, { passive: true }));
    return () => {
      clearIdleTimers();
      ACTIVITY_EVENTS.forEach(ev => window.removeEventListener(ev, onActivity));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
      {/* First tab stop on every signed-in page. Without it a keyboard user
          walks all ~25 rail links before reaching the content, on every
          navigation — the bypass-blocks failure this platform reports on
          other people's sites. */}
      <a href="#main" className="gx-skip">Skip to main content</a>

      <header className="gx-topbar d-flex align-items-center px-3 sticky-top" style={{ zIndex: 1040 }}>
        {/* hamburger — only on tablet/mobile (<lg) */}
        <button type="button" ref={triggerRef} onClick={() => setOpen(true)}
          className="gx-icon-btn me-2 d-lg-none"
          aria-label="Open navigation menu" aria-expanded={open} aria-controls="app-drawer">
          <i className="bi bi-list" aria-hidden="true" />
        </button>
        <Link href="/dashboard" className="gx-brand">
          <BrandMark />
          <span className="d-none d-sm-block">
            <span className="gx-brand-name">GovUX</span>
            <span className="gx-brand-sub">Audit Platform</span>
          </span>
          <span className="gx-brand-name d-sm-none">GovUX</span>
        </Link>
        <div className="ms-auto d-flex align-items-center gap-1">
          <ThemeToggle />
          <NotificationBell />
          <div className="gx-menu-wrap">
            <button type="button" className="gx-avatar" onClick={() => setMenuOpen(o => !o)}
              aria-haspopup="menu" aria-expanded={menuOpen}
              aria-label={`Account menu — ${me?.email || "signed in"}`}>
              {initials}
            </button>
            {menuOpen && (
              <div className="gx-menu" role="menu">
                {/* the avatar used to be a bare link to /settings, so clicking it
                    was a guess. Say who you are signed in as, then offer the two
                    things that follow from that. */}
                <div className="gx-menu-head">
                  <div className="fw-semibold text-truncate">{me?.display_name || me?.email || "Signed in"}</div>
                  <div className="gx-muted text-truncate" style={{ fontSize: ".8125rem" }}>{me?.email}</div>
                  <div className="gx-muted" style={{ fontSize: ".75rem" }}>
                    {(me?.role || "").replace(/_/g, " ")}{me?.org_name ? ` · ${me.org_name}` : ""}
                  </div>
                </div>
                <Link href="/settings" role="menuitem" className="gx-menu-item"
                  onClick={() => setMenuOpen(false)}>
                  <i className="bi bi-gear" aria-hidden="true" />Team &amp; settings
                </Link>
                <button type="button" role="menuitem" className="gx-menu-item"
                  onClick={() => { setMenuOpen(false); setConfirmSignOut(true); }}>
                  <i className="bi bi-box-arrow-right" aria-hidden="true" />Sign out
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      <div className="d-flex">
        {/* desktop rail — sticky, self-scrolling, hidden below lg */}
        <aside className="gx-rail d-none d-lg-block flex-shrink-0"
          style={{ position: "sticky", top: 60, height: "calc(100vh - 60px)", overflowY: "auto" }}>
          {/* Which organisation am I acting for, and as what? Stewards and
              owners see very different screens under the same nav labels, and
              nothing on the page said which one you were. */}
          <div className="gx-context">
            <div className="gx-label mb-1">Signed in as</div>
            <div className="gx-context-org">{me?.org_name || me?.email || "—"}</div>
            <div className="gx-muted" style={{ fontSize: ".75rem" }}>
              {(me?.role || "").replace(/_/g, " ") || "\u00a0"}
            </div>
          </div>
          <div className="px-2 pb-3">
            <NavList path={path} isSteward={isSteward} studioEnabled={studioEnabled} onSignOut={() => setConfirmSignOut(true)} />
          </div>
        </aside>

        {/* tabIndex -1 so the skip link can move focus here, not merely scroll */}
        <main id="main" tabIndex={-1} className="flex-grow-1"
          style={{ background: "var(--bs-body-bg)", minWidth: 0, outline: "none" }}>
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
          <NavList path={path} isSteward={isSteward} studioEnabled={studioEnabled} onSignOut={() => setConfirmSignOut(true)} onNavigate={() => setOpen(false)} />
        </div>
      </div>

      {confirmSignOut && (
        <div role="alertdialog" aria-modal="true" aria-labelledby="signout-title"
          style={{ position: "fixed", inset: 0, zIndex: 1080, background: "rgba(9,20,40,.45)",
            display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div ref={signOutPanel} className="gx-card" style={{ maxWidth: 420, width: "92%" }}>
            <div className="gx-card-body text-center">
              <div className="gx-empty-icon mb-3"><i className="bi bi-box-arrow-right" aria-hidden="true" /></div>
              <h2 id="signout-title" className="h5">Sign out?</h2>
              <p className="gx-muted mb-3">
                You'll need a new one-time code by email to sign back in.
              </p>
              <div className="d-flex gap-2 justify-content-center">
                <button type="button" className="btn btn-outline-secondary"
                  onClick={() => setConfirmSignOut(false)}>Stay signed in</button>
                <button type="button" className="btn btn-primary" onClick={signOut}>Sign out</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {idleWarning && (
        <IdleWarning secondsLeft={idleSecondsLeft} onContinue={stayLoggedIn} onSignOut={signOut} />
      )}
    </div>
  );
}
