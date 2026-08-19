/** @vitest-environment jsdom */
/**
 * /dashboard, /admin/national and /admin/domain-claims.
 *
 * The dashboard is where every signed-in user lands; the national roll-up is the
 * steward flagship and the platform's most quotable number; domain claims is the
 * newest screen and had no coverage at all. Each is pinned on the thing that
 * would be embarrassing to get wrong: never inventing a score for an unaudited
 * estate, never rendering coverage as a bare count without its denominator, and
 * never letting a verified domain look releasable.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import "@testing-library/jest-dom/vitest";
import { render, screen, waitFor, cleanup, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";

afterEach(cleanup);

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }), usePathname: () => "/" }));
vi.mock("@/components/AppShell", () => ({ default: ({ children }: any) => <div>{children}</div> }));
vi.mock("next/link", () => ({ default: ({ href, children }: any) => <a href={String(href)}>{children}</a> }));

const listDomains = vi.fn();
const me = vi.fn();
const national = vi.fn();
const domainClaims = vi.fn();
const releaseClaim = vi.fn();
vi.mock("@/lib/api", () => ({
  api: {
    listDomains: (...a: any[]) => listDomains(...a),
    me: (...a: any[]) => me(...a),
    national: (...a: any[]) => national(...a),
    domainClaims: (...a: any[]) => domainClaims(...a),
    releaseClaim: (...a: any[]) => releaseClaim(...a),
  },
}));

import Dashboard from "@/app/dashboard/page";
import National from "@/app/admin/national/page";
import DomainClaims from "@/app/admin/domain-claims/page";

beforeEach(() => {
  [listDomains, me, national, domainClaims, releaseClaim].forEach((m) => m.mockReset());
  listDomains.mockResolvedValue([]);
  // the dashboard names the organisation it is reporting on, so identity is
  // part of the screen now rather than only the shell around it
  me.mockResolvedValue({ email: "owner@gov.in", org_name: "GovUX QA Sandbox", role: "owner" });
  national.mockResolvedValue({
    domains_total: 0, audited: 0, coverage_pct: 0, avg_score: null,
    band_distribution: { A: 0, B: 0, C: 0, D: 0, E: 0 }, league: [],
  });
  domainClaims.mockResolvedValue({ total: 0, items: [] });
  releaseClaim.mockResolvedValue(null);
});

// ---------- dashboard --------------------------------------------------------
describe("Dashboard", () => {
  it("splits the estate into verified and pending", async () => {
    listDomains.mockResolvedValue([
      { id: "1", url: "a.gov.in", verify_status: "verified" },
      { id: "2", url: "b.gov.in", verify_status: "pending" },
      { id: "3", url: "c.gov.in", verify_status: "failed" },
    ]);
    render(<Dashboard />);
    // the subtitle now names the organisation as well, and pluralises properly
    // ("3 registered domains", not "domain(s)"), so match the count not the line
    expect(await screen.findByText(/3 registered domains/)).toBeInTheDocument();

    // label and value are siblings inside the stat tile, so go up one level
    expect(screen.getByText("Verified").parentElement).toHaveTextContent("1");
    // anything not verified is pending work — failed counts as pending, not as done
    expect(screen.getByText("Pending verification").parentElement).toHaveTextContent("2");
  });

  it("offers the two next actions a new user needs", async () => {
    render(<Dashboard />);
    await waitFor(() => expect(listDomains).toHaveBeenCalled());
    expect(screen.getByRole("link", { name: /Add domain/i })).toHaveAttribute("href", "/domains/new");
    expect(screen.getByRole("link", { name: /New audit/i })).toHaveAttribute("href", "/audits/new");
  });

  it("reports a load failure rather than showing an empty estate", async () => {
    listDomains.mockImplementation(() => Promise.reject(new Error("Session expired")));
    render(<Dashboard />);
    expect(await screen.findByText(/Session expired/)).toBeInTheDocument();
  });
});

// ---------- national roll-up -------------------------------------------------
describe("National dashboard", () => {
  it("shows coverage against the register, not a bare audited count", async () => {
    national.mockResolvedValue({
      domains_total: 9, audited: 4, coverage_pct: 44.4, avg_score: 62.4,
      band_distribution: { A: 0, B: 0, C: 2, D: 2, E: 0 },
      league: [{ url: "indiapost.gov.in", score: 68.1, band: "C" }],
    });
    render(<National />);

    expect(await screen.findByText("62.4")).toBeInTheDocument();
    // coverage is never a bare percentage — it is stated against the register
    expect(screen.getByText("44.4% of the register")).toBeInTheDocument();
    expect(screen.getByText("9")).toBeInTheDocument();          // register size
    expect(screen.getByText("indiapost.gov.in")).toBeInTheDocument();
  });

  it("never invents an average for an estate with no audits", async () => {
    render(<National />);      // default fixture: nothing audited
    expect(await screen.findByText("—")).toBeInTheDocument();
    expect(screen.queryByText("0.0")).not.toBeInTheDocument();
  });

  it("surfaces a permission failure instead of an empty dashboard", async () => {
    national.mockImplementation(() => Promise.reject(new Error("Forbidden")));
    render(<National />);
    expect(await screen.findByRole("alert")).toHaveTextContent(/Forbidden/);
  });
});

// ---------- domain claims ----------------------------------------------------
const CONTESTED = {
  total: 1,
  items: [{
    url: "data.gov.in", contested: true,
    claims: [
      { id: "c1", org_id: "o1", org_name: "Dept of Posts", verify_status: "pending",
        created_at: "2026-08-12T00:00:00Z" },
      { id: "c2", org_id: "o2", org_name: "Rival Dept", verify_status: "pending",
        created_at: "2026-08-12T01:00:00Z" },
    ],
  }],
};

describe("Domain claims", () => {
  it("groups competing claims under one host and flags it contested", async () => {
    domainClaims.mockResolvedValue(CONTESTED);
    render(<DomainClaims />);

    expect(await screen.findByText("Dept of Posts")).toBeInTheDocument();
    expect(screen.getByText("Rival Dept")).toBeInTheDocument();
    expect(screen.getByText(/contested · 2/)).toBeInTheDocument();
    // the host is labelled once, on the first row of its group
    expect(screen.getAllByText("data.gov.in")).toHaveLength(1);
  });

  it("releases a claim only after confirmation", async () => {
    domainClaims.mockResolvedValue(CONTESTED);
    render(<DomainClaims />);
    await screen.findByText("Dept of Posts");

    vi.spyOn(window, "confirm").mockReturnValue(false);
    await userEvent.click(screen.getAllByRole("button", { name: "Release" })[0]);
    expect(releaseClaim).not.toHaveBeenCalled();

    vi.spyOn(window, "confirm").mockReturnValue(true);
    await userEvent.click(screen.getAllByRole("button", { name: "Release" })[0]);
    await waitFor(() => expect(releaseClaim).toHaveBeenCalledWith("c1"));
    expect(await screen.findByRole("status")).toHaveTextContent(/Released data.gov.in from Dept of Posts/);
  });

  it("filters to contested hosts only", async () => {
    domainClaims.mockResolvedValue(CONTESTED);
    render(<DomainClaims />);
    await screen.findByText("Dept of Posts");

    await userEvent.click(screen.getByLabelText(/Contested only/i));
    await waitFor(() => expect(domainClaims).toHaveBeenLastCalledWith(true));
  });

  it("says the estate is clean when every domain has proven ownership", async () => {
    render(<DomainClaims />);
    expect(await screen.findByText(/every registered domain has proven ownership/i)).toBeInTheDocument();
  });

  it("surfaces the server's refusal to release a verified domain", async () => {
    domainClaims.mockResolvedValue(CONTESTED);
    releaseClaim.mockImplementation(() => Promise.reject(
      new Error("This domain is verified — ownership was proven and cannot be released here.")));
    render(<DomainClaims />);
    await screen.findByText("Dept of Posts");

    vi.spyOn(window, "confirm").mockReturnValue(true);
    await userEvent.click(screen.getAllByRole("button", { name: "Release" })[0]);
    expect(await screen.findByRole("alert")).toHaveTextContent(/cannot be released here/);
  });
});
