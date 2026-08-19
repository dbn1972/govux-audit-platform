/** @vitest-environment jsdom */
/**
 * Coverage for the steward screens. These were wired to real API data without
 * any component tests, and each carries logic that is easy to break silently:
 * a debounce, a stale-response guard, offset pagination, and a preview-before-
 * write gate on a bulk import.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import "@testing-library/jest-dom/vitest";
import { render, screen, waitFor, cleanup, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";

afterEach(() => { cleanup(); vi.useRealTimers(); });

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/components/AppShell", () => ({ default: ({ children }: any) => <div>{children}</div> }));
vi.mock("next/link", () => ({ default: ({ href, children }: any) => <a href={String(href)}>{children}</a> }));

const organisations = vi.fn();
const createOrganisation = vi.fn();
const patchOrganisation = vi.fn();
const alerts = vi.fn();
const importRegistry = vi.fn();
vi.mock("@/lib/api", () => ({
  api: {
    organisations: (...a: any[]) => organisations(...a),
    createOrganisation: (...a: any[]) => createOrganisation(...a),
    patchOrganisation: (...a: any[]) => patchOrganisation(...a),
    alerts: (...a: any[]) => alerts(...a),
    importRegistry: (...a: any[]) => importRegistry(...a),
  },
}));

import Organisations from "@/app/admin/organisations/page";
import Alerts from "@/app/admin/alerts/page";
import Registry from "@/app/admin/registry/page";

const org = (name: string, extra: any = {}) => ({
  id: name, name, org_type: "department", state_code: null,
  domain_count: 0, user_count: 0, audited_domains: 0, audit_count: 0,
  avg_score: null, last_audited_at: null, studio_enabled: false, created_at: null, ...extra,
});

// mockReset() leaves a vi.fn() returning `undefined`, which these pages then try
// to call .then() on. Always re-arm a benign default after resetting so a test
// that never stubs the call still gets a well-formed promise.
describe("Organisations directory", () => {
  beforeEach(() => {
    [organisations, createOrganisation, patchOrganisation].forEach((m) => m.mockReset());
    organisations.mockResolvedValue({ total: 0, items: [] });
    createOrganisation.mockResolvedValue({});
    patchOrganisation.mockResolvedValue({});
  });

  it("renders rows with the real domain count and the total range", async () => {
    organisations.mockResolvedValue({
      total: 1583,
      items: [org("Department of Posts", { domain_count: 6, state_code: "DL" })],
    });
    render(<Organisations />);

    expect(await screen.findByText("Department of Posts")).toBeInTheDocument();
    expect(screen.getByText("6")).toBeInTheDocument();
    expect(screen.getByText("DL")).toBeInTheDocument();
    expect(screen.getByText(/1–25 of 1,583/)).toBeInTheDocument();
  });

  it("debounces the search box instead of firing a request per keystroke", async () => {
    vi.useFakeTimers();
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    organisations.mockResolvedValue({ total: 0, items: [] });
    render(<Organisations />);

    await vi.advanceTimersByTimeAsync(400);      // initial load settles
    organisations.mockClear();

    await user.type(screen.getByLabelText(/Search organisations/i), "Posts");
    // mid-flight: the 300ms window has not elapsed, so nothing has been sent
    await vi.advanceTimersByTimeAsync(100);
    expect(organisations).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(400);
    expect(organisations).toHaveBeenCalledTimes(1);
    expect(organisations.mock.calls[0][0]).toMatchObject({ q: "Posts", offset: 0 });
  });

  it("pages forward with a new offset and back again", async () => {
    organisations.mockResolvedValue({ total: 60, items: [org("A Dept")] });
    render(<Organisations />);
    await screen.findByText("A Dept");

    await userEvent.click(screen.getByRole("button", { name: /Next/i }));
    await waitFor(() =>
      expect(organisations).toHaveBeenLastCalledWith(expect.objectContaining({ offset: 25 })));
    expect(await screen.findByText(/26–50 of 60/)).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /Previous/i }));
    await waitFor(() =>
      expect(organisations).toHaveBeenLastCalledWith(expect.objectContaining({ offset: 0 })));
  });

  it("hides pagination entirely when everything fits on one page", async () => {
    organisations.mockResolvedValue({ total: 3, items: [org("Solo Dept")] });
    render(<Organisations />);
    await screen.findByText("Solo Dept");
    expect(screen.queryByRole("button", { name: /Next/i })).not.toBeInTheDocument();
  });

  it("ignores a slow response that lands after a newer one", async () => {
    // The stale-response guard: without it, a slow first query can overwrite the
    // results of the search the user has since typed.
    let resolveSlow: (v: any) => void = () => {};
    organisations
      .mockImplementationOnce(() => new Promise((r) => { resolveSlow = r; }))
      .mockResolvedValue({ total: 1, items: [org("Fresh Result")] });

    render(<Organisations />);
    await userEvent.type(screen.getByLabelText(/Search organisations/i), "x");
    expect(await screen.findByText("Fresh Result")).toBeInTheDocument();

    resolveSlow({ total: 99, items: [org("Stale Result")] });
    await waitFor(() => expect(screen.queryByText("Stale Result")).not.toBeInTheDocument());
    expect(screen.getByText("Fresh Result")).toBeInTheDocument();
  });

  it("surfaces a permission failure rather than an empty table", async () => {
    organisations.mockImplementation(() => Promise.reject(new Error("Forbidden")));
    render(<Organisations />);
    expect(await screen.findByRole("alert")).toHaveTextContent(/Forbidden/);
  });
});

describe("Organisation management", () => {
  beforeEach(() => {
    [organisations, createOrganisation, patchOrganisation].forEach((m) => m.mockReset());
    organisations.mockResolvedValue({ total: 0, items: [] });
    createOrganisation.mockResolvedValue({});
    patchOrganisation.mockResolvedValue({});
  });

  it("shows activity, not just a domain count", async () => {
    organisations.mockResolvedValue({ total: 1, items: [org("Dept of Posts", {
      domain_count: 6, user_count: 4, audit_count: 12, audited_domains: 5,
      avg_score: 68.1, last_audited_at: "2026-08-01T00:00:00Z" })] });
    render(<Organisations />);
    await screen.findByText("Dept of Posts");
    const row = screen.getByText("Dept of Posts").closest("tr")!;
    expect(within(row).getByText("6")).toBeInTheDocument();      // domains
    expect(within(row).getByText("4")).toBeInTheDocument();      // users
    expect(within(row).getByText(/12/)).toBeInTheDocument();     // audits
    expect(within(row).getByText("68.1")).toBeInTheDocument();   // avg score
  });

  it("creates an organisation and refreshes the list", async () => {
    render(<Organisations />);
    await userEvent.click(screen.getByRole("button", { name: /New organisation/i }));
    await userEvent.type(screen.getByLabelText("Name"), "Ministry of Rural Development");
    await userEvent.selectOptions(screen.getByLabelText("Type"), "ministry");
    await userEvent.type(screen.getByLabelText("State / UT"), "dl");
    await userEvent.click(screen.getByRole("button", { name: /^Create$/ }));

    await waitFor(() => expect(createOrganisation).toHaveBeenCalledWith({
      name: "Ministry of Rural Development", org_type: "ministry", state_code: "DL" }));
    expect(await screen.findByRole("status")).toHaveTextContent(/Created/);
  });

  it("surfaces a duplicate-name refusal from the server", async () => {
    createOrganisation.mockImplementation(() =>
      Promise.reject(new Error("An organisation with that name already exists")));
    render(<Organisations />);
    await userEvent.click(screen.getByRole("button", { name: /New organisation/i }));
    await userEvent.type(screen.getByLabelText("Name"), "Dept of Posts");
    await userEvent.click(screen.getByRole("button", { name: /^Create$/ }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/already exists/);
  });

  it("edits an auto-provisioned name — the reason this screen can write at all", async () => {
    organisations.mockResolvedValue({ total: 1, items: [org("aman's Organisation")] });
    render(<Organisations />);
    await screen.findByText("aman's Organisation");
    await userEvent.click(screen.getByRole("button", { name: "Edit" }));

    const name = screen.getByLabelText("Name");
    await userEvent.clear(name);
    await userEvent.type(name, "Dept of Fisheries");
    await userEvent.click(screen.getByRole("button", { name: /^Save$/ }));

    await waitFor(() => expect(patchOrganisation).toHaveBeenCalledWith("aman's Organisation",
      expect.objectContaining({ name: "Dept of Fisheries" })));
  });
});

describe("Alerts", () => {
  beforeEach(() => {
    alerts.mockReset();
    alerts.mockResolvedValue({ band_e_count: 0, regressed_count: 0, never_audited_count: 0,
      critical_spike_count: 0, alerts: [] });
  });

  it("shows the real computed counts and each alert with its severity", async () => {
    alerts.mockResolvedValue({
      band_e_count: 4, regressed_count: 2, never_audited_count: 11, critical_spike_count: 1,
      alerts: [
        { severity: "critical", title: "4 domains fell into Band E (critical risk)",
          detail: "Highest concentration in Dept of Posts · avg 31" },
        { severity: "high", title: "posts.gov.in dropped 12 points", detail: "Since its previous audit" },
      ],
    });
    render(<Alerts />);

    expect(await screen.findByText(/4 domains fell into Band E/)).toBeInTheDocument();
    expect(screen.getByText(/posts.gov.in dropped 12 points/)).toBeInTheDocument();
    expect(screen.getByText(/Highest concentration in Dept of Posts/)).toBeInTheDocument();
  });

  it("renders a clean all-clear when nothing is wrong", async () => {
    alerts.mockResolvedValue({
      band_e_count: 0, regressed_count: 0, never_audited_count: 0,
      critical_spike_count: 0, alerts: [],
    });
    render(<Alerts />);
    // the four counters always render (they're the summary tiles); what must be
    // absent is any alert item — and the estate-is-clean message takes its place
    expect(await screen.findByText(/Nothing to act on/i)).toBeInTheDocument();
    // the label and its number are siblings inside .card-body
    expect(screen.getByText("Band E domains").parentElement).toHaveTextContent("0");
  });
});

describe("Register import", () => {
  beforeEach(() => {
    importRegistry.mockReset();
    importRegistry.mockResolvedValue({ dry_run: true, total_rows: 0, imported: 0,
      duplicates: 0, invalid: 0, new_organisations: [], errors: [], errors_truncated: 0 });
  });

  const preview = {
    dry_run: true, total_rows: 3, imported: 2, duplicates: 1, invalid: 0,
    new_organisations: ["Government of Karnataka"], errors: [], errors_truncated: 0,
  };

  it("requires a preview before a real import can be run", async () => {
    importRegistry.mockResolvedValue(preview);
    render(<Registry />);

    const importBtn = screen.getByRole("button", { name: /Import for real/i });
    const previewBtn = screen.getByRole("button", { name: /Preview/i });
    // nothing typed yet: both are unusable
    expect(previewBtn).toBeDisabled();
    expect(importBtn).toBeDisabled();

    await userEvent.click(screen.getByRole("button", { name: /Use sample/i }));
    expect(previewBtn).toBeEnabled();
    expect(importBtn).toBeDisabled();          // still gated — no preview yet

    await userEvent.click(previewBtn);
    expect(await screen.findByText(/nothing has been saved/i)).toBeInTheDocument();
    expect(importBtn).toBeEnabled();
    expect(importRegistry).toHaveBeenLastCalledWith(expect.any(String), true);
  });

  it("re-gates the import button when the CSV is edited after previewing", async () => {
    importRegistry.mockResolvedValue(preview);
    render(<Registry />);
    await userEvent.click(screen.getByRole("button", { name: /Use sample/i }));
    await userEvent.click(screen.getByRole("button", { name: /Preview/i }));
    await screen.findByText(/nothing has been saved/i);

    await userEvent.type(screen.getByLabelText(/Registry CSV contents/i), "\nextra.gov.in,X");
    // the preview no longer describes what's in the box, so it must not authorise a write
    expect(screen.getByRole("button", { name: /Import for real/i })).toBeDisabled();
  });

  it("sends dry_run=false on the real import and reports the outcome", async () => {
    importRegistry.mockResolvedValueOnce(preview)
      .mockResolvedValueOnce({ ...preview, dry_run: false });
    render(<Registry />);
    await userEvent.click(screen.getByRole("button", { name: /Use sample/i }));
    await userEvent.click(screen.getByRole("button", { name: /Preview/i }));
    await screen.findByText(/nothing has been saved/i);

    await userEvent.click(screen.getByRole("button", { name: /Import for real/i }));
    await waitFor(() =>
      expect(importRegistry).toHaveBeenLastCalledWith(expect.any(String), false));
    expect(await screen.findByText(/Import complete/i)).toBeInTheDocument();
  });

  it("lists rejected rows with their row numbers", async () => {
    importRegistry.mockResolvedValue({
      ...preview, imported: 1, invalid: 2, errors: [
        { row: 3, url: "evil.example.com", error: "not a valid .gov.in / .nic.in domain" },
        { row: 5, url: "", error: "url and organisation are both required" },
      ], errors_truncated: 7,
    });
    render(<Registry />);
    await userEvent.click(screen.getByRole("button", { name: /Use sample/i }));
    await userEvent.click(screen.getByRole("button", { name: /Preview/i }));

    expect(await screen.findByText("evil.example.com")).toBeInTheDocument();
    expect(screen.getByText(/not a valid .gov.in/)).toBeInTheDocument();
    expect(screen.getByText(/7 more rows with problems/)).toBeInTheDocument();
  });

  it("shows the server's reason when the import is rejected", async () => {
    importRegistry.mockImplementation(() =>
      Promise.reject(new Error("Missing required column 'url'.")));
    render(<Registry />);
    await userEvent.click(screen.getByRole("button", { name: /Use sample/i }));
    await userEvent.click(screen.getByRole("button", { name: /Preview/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/Missing required column/);
  });
});
