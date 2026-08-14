/** @vitest-environment jsdom */
/**
 * The steward roll-ups: /admin/league, /admin/ministries, /admin/states,
 * /admin/monitoring and /admin/studio-access.
 *
 * Mostly presentation, so these lean on the two things that would actually
 * mislead a programme office: an empty segment must read as "nothing audited
 * yet" rather than "everyone scored zero", and the league must stay segmented —
 * it exists specifically so a payments portal is never ranked against a
 * brochure site. Monitoring and studio-access also write, so their calls are
 * pinned too.
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

const rankings = vi.fn();
const ministries = vi.fn();
const states = vi.fn();
const schedules = vi.fn();
const listDomains = vi.fn();
const createSchedule = vi.fn();
const deleteSchedule = vi.fn();
const studioTenants = vi.fn();
const studioSetTenant = vi.fn();
vi.mock("@/lib/api", () => ({
  api: {
    rankings: (...a: any[]) => rankings(...a),
    ministries: (...a: any[]) => ministries(...a),
    states: (...a: any[]) => states(...a),
    schedules: (...a: any[]) => schedules(...a),
    listDomains: (...a: any[]) => listDomains(...a),
    createSchedule: (...a: any[]) => createSchedule(...a),
    deleteSchedule: (...a: any[]) => deleteSchedule(...a),
    studioTenants: (...a: any[]) => studioTenants(...a),
    studioSetTenant: (...a: any[]) => studioSetTenant(...a),
  },
}));

import League from "@/app/admin/league/page";
import Ministries from "@/app/admin/ministries/page";
import States from "@/app/admin/states/page";
import Monitoring from "@/app/admin/monitoring/page";
import StudioAccess from "@/app/admin/studio-access/page";

beforeEach(() => {
  [rankings, ministries, states, schedules, listDomains, createSchedule, deleteSchedule,
   studioTenants, studioSetTenant].forEach((m) => m.mockReset());
  rankings.mockResolvedValue({ ranking: [] });
  ministries.mockResolvedValue({ ministries: [] });
  states.mockResolvedValue({ states: [] });
  schedules.mockResolvedValue([]);
  listDomains.mockResolvedValue([]);
  createSchedule.mockResolvedValue({});
  deleteSchedule.mockResolvedValue(null);
  studioTenants.mockResolvedValue([]);
  studioSetTenant.mockResolvedValue({});
});

// ---------- league ------------------------------------------------------------
describe("Benchmarking league table", () => {
  it("ranks within a segment and re-queries when the segment changes", async () => {
    rankings.mockResolvedValue({ ranking: [
      { url: "a.gov.in", score: 81, band: "B" },
      { url: "b.gov.in", score: 62, band: "C" },
    ]});
    render(<League />);
    await screen.findByText("a.gov.in");

    // rank is positional, so the first row is #1
    const first = screen.getByText("a.gov.in").closest("tr")!;
    expect(within(first).getByText("1")).toBeInTheDocument();
    expect(within(first).getByText("81")).toBeInTheDocument();

    // the whole point of the screen: like-for-like, never one flat national list
    await userEvent.selectOptions(screen.getByLabelText(/Service category/i), "payments");
    await waitFor(() => expect(rankings).toHaveBeenLastCalledWith("payments"));
  });

  it("says nothing is audited yet rather than implying everyone scored zero", async () => {
    render(<League />);
    expect(await screen.findByText(/No audited domains in this segment yet/)).toBeInTheDocument();
    expect(screen.queryByText("0")).not.toBeInTheDocument();
  });

  it("surfaces a load failure", async () => {
    rankings.mockImplementation(() => Promise.reject(new Error("Forbidden")));
    render(<League />);
    expect(await screen.findByRole("alert")).toHaveTextContent(/Forbidden/);
  });
});

// ---------- ministries & states ----------------------------------------------
describe("Ministries and States roll-ups", () => {
  it("lists organisations with their averaged band", async () => {
    ministries.mockResolvedValue({ ministries: [
      { name: "Department of Posts", domains: 6, avg_score: 62.4, band: "C" },
    ]});
    render(<Ministries />);
    const row = (await screen.findByText("Department of Posts")).closest("tr")!;
    expect(within(row).getByText("6")).toBeInTheDocument();
    expect(within(row).getByText("62.4")).toBeInTheDocument();
    expect(within(row).getByText("C")).toBeInTheDocument();
  });

  it("distinguishes 'none audited' from 'none tagged' on the states board", async () => {
    render(<States />);
    // a state-tagged org that has never been audited must not read as a zero score
    expect(await screen.findByText(/No state-tagged organisations audited yet/)).toBeInTheDocument();
  });

  it("shows each state's average once there is data", async () => {
    states.mockResolvedValue({ states: [{ code: "KA", avg_score: 71.2, domains: 3 }] });
    render(<States />);
    expect(await screen.findByText("KA")).toBeInTheDocument();
    expect(screen.getByText("71.2")).toBeInTheDocument();
  });

  it("reports a failure instead of an empty board", async () => {
    ministries.mockImplementation(() => Promise.reject(new Error("Not authorised")));
    render(<Ministries />);
    expect(await screen.findByText(/Not authorised/)).toBeInTheDocument();
  });
});

// ---------- continuous monitoring --------------------------------------------
describe("Continuous monitoring", () => {
  it("creates a schedule for the chosen domain and cadence, then reloads", async () => {
    listDomains.mockResolvedValue([{ id: "d1", url: "posts.gov.in", verify_status: "verified" }]);
    render(<Monitoring />);
    await waitFor(() => expect(listDomains).toHaveBeenCalled());

    await userEvent.selectOptions(screen.getByLabelText("Domain"), "d1");
    await userEvent.selectOptions(screen.getByLabelText("Cadence"), "daily");
    await userEvent.click(screen.getByRole("button", { name: /Add monitor/i }));

    await waitFor(() => expect(createSchedule).toHaveBeenCalledWith("d1", "daily"));
    expect(schedules).toHaveBeenCalledTimes(2);      // reloaded after the write
  });

  it("won't let you add a monitor without picking a domain", async () => {
    render(<Monitoring />);
    await waitFor(() => expect(listDomains).toHaveBeenCalled());
    expect(screen.getByRole("button", { name: /Add monitor/i })).toBeDisabled();
  });

  it("lists existing monitors and removes one", async () => {
    schedules.mockResolvedValue([
      { id: "s1", domain: "posts.gov.in", cadence: "weekly", next_run_at: "2026-09-01T00:00:00Z" },
    ]);
    listDomains.mockResolvedValue([]);
    render(<Monitoring />);
    await screen.findByText("posts.gov.in");

    await userEvent.click(screen.getByRole("button", { name: /Stop monitoring posts.gov.in/i }));
    await waitFor(() => expect(deleteSchedule).toHaveBeenCalledWith("s1"));
  });

  it("shows an empty state when nothing is monitored", async () => {
    render(<Monitoring />);
    expect(await screen.findByText(/No monitors yet/)).toBeInTheDocument();
  });
});

// ---------- studio access ------------------------------------------------------
describe("Studio access (tenants)", () => {
  it("toggles an organisation's entitlement and reflects it immediately", async () => {
    studioTenants.mockResolvedValue([
      { id: "o1", name: "Dept of Posts", org_type: "department", studio_enabled: false },
    ]);
    render(<StudioAccess />);
    await screen.findByText("Dept of Posts");

    const toggle = screen.getByRole("switch");
    expect(toggle).not.toBeChecked();
    await userEvent.click(toggle);

    await waitFor(() => expect(studioSetTenant).toHaveBeenCalledWith("o1", true));
    expect(toggle).toBeChecked();       // optimistic, no refetch needed
  });

  it("surfaces a refusal rather than silently leaving the switch flipped", async () => {
    studioTenants.mockResolvedValue([
      { id: "o1", name: "Dept of Posts", org_type: "department", studio_enabled: false },
    ]);
    studioSetTenant.mockImplementation(() =>
      Promise.reject(new Error("Only a super_admin can grant Studio access")));
    render(<StudioAccess />);
    await screen.findByText("Dept of Posts");

    await userEvent.click(screen.getByRole("switch"));
    expect(await screen.findByRole("alert")).toHaveTextContent(/super_admin/);
  });
});
