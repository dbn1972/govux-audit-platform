/** @vitest-environment jsdom */
/**
 * Per-PR accessibility check on the SIGNED-IN screens.
 *
 * The CI a11y gate serves the frontend with `next start` and no backend, so it
 * can only reach /login and / — every screen a department actually works in was
 * unguarded, and the WCAG defects that turned up there (a column of unnamed
 * role dropdowns, a settings label attached to nothing) all got in that way.
 *
 * These pages already mount under jsdom in the other component tests, so axe
 * can inspect the same trees with no API and no browser. Contrast and hit-area
 * need real layout and are checked by e2e/a11y.auth.spec.ts nightly; what runs
 * here is the structural half — accessible names, label wiring, ARIA sanity —
 * which is where the actual regressions have been.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import "@testing-library/jest-dom/vitest";
import { render, screen, cleanup } from "@testing-library/react";
import React from "react";
import { findA11yViolations } from "./helpers/axe";

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }), usePathname: () => "/",
}));
vi.mock("@/components/AppShell", () => ({ default: ({ children }: any) => <div>{children}</div> }));
vi.mock("next/link", () => ({ default: ({ href, children }: any) => <a href={String(href)}>{children}</a> }));

const me = vi.fn();
const listTeam = vi.fn();
const listInvitations = vi.fn();
const devices = vi.fn();
const listDomains = vi.fn();
const adminConfig = vi.fn();
const adminMetrics = vi.fn();

// The factory is hoisted above every const in this file, so it may only close
// over things it defines itself — hence the inline no-ops for the mutating
// calls, which nothing here exercises.
vi.mock("@/lib/api", () => {
  const noop = () => vi.fn().mockResolvedValue(undefined);
  return {
    api: {
      me: (...a: any[]) => me(...a),
      listTeam: (...a: any[]) => listTeam(...a),
      listInvitations: (...a: any[]) => listInvitations(...a),
      devices: (...a: any[]) => devices(...a),
      listDomains: (...a: any[]) => listDomains(...a),
      adminConfig: (...a: any[]) => adminConfig(...a),
      adminMetrics: (...a: any[]) => adminMetrics(...a),
      updateOrganisation: noop(), updateTeamRole: noop(), createInvitation: noop(),
      revokeInvitation: noop(), revokeDevice: noop(), exportMyData: noop(),
      eraseMyData: noop(), updateConfig: noop(), testEmail: noop(),
      forceVerifyDomain: noop(),
    },
    setToken: vi.fn(),
  };
});

import Settings from "@/app/settings/page";
import ConfigAdmin from "@/app/admin/config/page";
import Domains from "@/app/domains/page";
import Dashboard from "@/app/dashboard/page";

// Populated fixtures on purpose: an empty table has no controls to get wrong,
// so a11y checks against empty state pass while saying nothing.
const TEAM = [
  { id: "u-me", email: "me@gov.in", display_name: "Me", role: "owner", is_you: true },
  { id: "u-con", email: "con@gov.in", display_name: "Con", role: "contributor", is_you: false },
];
const DOMAINS = [
  { id: "d-ok", url: "indiapost.gov.in", verify_status: "verified", category: "transactional",
    latest_score: 68.1, latest_band: "C", last_audited_at: "2026-08-01T00:00:00Z" },
  { id: "d-new", url: "draft.nic.in", verify_status: "pending", category: null,
    latest_score: null, latest_band: null, last_audited_at: null },
];
const CONFIG = {
  categories: [{
    name: "Notifications",
    settings: [
      { key: "notify_enabled", label: "Send notification emails (master switch)",
        type: "bool", value: true, is_override: false, secret: false },
      { key: "public_base_url", label: "Public base URL used in emailed links",
        type: "str", value: "http://localhost:3000", is_override: true, secret: false },
      { key: "smtp_password", label: "SMTP password",
        type: "str", value: "", is_override: false, secret: true },
    ],
  }],
};

beforeEach(() => {
  [me, listTeam, listInvitations, devices, listDomains, adminConfig, adminMetrics]
    .forEach((m) => m.mockReset());
  me.mockResolvedValue({ role: "super_admin", is_steward: true,
    org_name: "Dept of Posts", org_state_code: "KA" });
  listTeam.mockResolvedValue(TEAM);
  listInvitations.mockResolvedValue([]);
  devices.mockResolvedValue([]);
  listDomains.mockResolvedValue(DOMAINS);
  adminConfig.mockResolvedValue(CONFIG);
  adminMetrics.mockResolvedValue(null);
  window.history.pushState({}, "", "/");
});

describe("accessibility of the signed-in screens", () => {
  it("/settings — every team-role dropdown is named", async () => {
    const { container } = render(<Settings />);
    await screen.findByDisplayValue("Dept of Posts");
    expect(await findA11yViolations(container)).toEqual([]);
  });

  it("/admin/config — every setting control is wired to its label", async () => {
    const { container } = render(<ConfigAdmin />);
    await screen.findByText("Notifications");
    expect(await findA11yViolations(container)).toEqual([]);
  });

  it("/domains", async () => {
    const { container } = render(<Domains />);
    await screen.findByText("indiapost.gov.in");
    expect(await findA11yViolations(container)).toEqual([]);
  });

  it("/dashboard", async () => {
    const { container } = render(<Dashboard />);
    await screen.findByText("indiapost.gov.in");
    expect(await findA11yViolations(container)).toEqual([]);
  });
});
