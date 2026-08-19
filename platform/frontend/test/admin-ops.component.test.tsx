/** @vitest-environment jsdom */
/**
 * /admin/approvals, /admin/config and /audits/[id]/compare.
 *
 * The three remaining screens that do more than render: approvals is a real
 * decision workflow, config writes runtime settings live (including the
 * notification switches and the email provider), and compare carries actual diff
 * arithmetic. Everything else still untested is read-only presentation.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import "@testing-library/jest-dom/vitest";
import { render, screen, waitFor, cleanup, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";

afterEach(() => { cleanup(); vi.useRealTimers(); });

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }), usePathname: () => "/" }));
vi.mock("@/components/AppShell", () => ({ default: ({ children }: any) => <div>{children}</div> }));
vi.mock("@/components/AuditNav", () => ({ default: () => <nav aria-label="Audit views" /> }));
vi.mock("next/link", () => ({ default: ({ href, children }: any) => <a href={String(href)}>{children}</a> }));

const scanRequests = vi.fn();
const decideScanRequest = vi.fn();
const adminConfig = vi.fn();
const updateConfig = vi.fn();
const testEmail = vi.fn();
const adminMetrics = vi.fn();
const compare = vi.fn();
vi.mock("@/lib/api", () => ({
  api: {
    scanRequests: (...a: any[]) => scanRequests(...a),
    decideScanRequest: (...a: any[]) => decideScanRequest(...a),
    adminConfig: (...a: any[]) => adminConfig(...a),
    updateConfig: (...a: any[]) => updateConfig(...a),
    testEmail: (...a: any[]) => testEmail(...a),
    adminMetrics: (...a: any[]) => adminMetrics(...a),
    compare: (...a: any[]) => compare(...a),
  },
}));

import Approvals from "@/app/admin/approvals/page";
import ConfigAdmin from "@/app/admin/config/page";
import Compare from "@/app/audits/[id]/compare/page";

beforeEach(() => {
  [scanRequests, decideScanRequest, adminConfig, updateConfig, testEmail, adminMetrics, compare]
    .forEach((m) => m.mockReset());
  scanRequests.mockResolvedValue([]);
  decideScanRequest.mockResolvedValue({});
  adminConfig.mockResolvedValue({ categories: [] });
  updateConfig.mockResolvedValue({ applied: {} });
  testEmail.mockResolvedValue({ ok: true, provider: "console" });
  adminMetrics.mockResolvedValue(null);
  compare.mockResolvedValue({ has_baseline: false, message: "No earlier completed audit yet." });
});

// ---------- approvals --------------------------------------------------------
const REQUESTS = [
  { id: "r1", user_email: "officer@nic.in", domain_url: "posts.gov.in", requested_pages: 50,
    reason: "full portal review", status: "pending", created_at: "2026-08-12T00:00:00Z" },
  { id: "r2", user_email: "other@nic.in", domain_url: "x.gov.in", requested_pages: 200,
    reason: null, status: "approved", created_at: "2026-08-11T00:00:00Z" },
];

describe("Larger-crawl approvals", () => {
  it("lists a request with who asked, for what, and why", async () => {
    scanRequests.mockResolvedValue(REQUESTS);
    render(<Approvals />);

    const row = (await screen.findByText("posts.gov.in")).closest("tr")!;
    expect(within(row).getByText("officer@nic.in")).toBeInTheDocument();
    expect(within(row).getByText("50")).toBeInTheDocument();
    expect(within(row).getByText("full portal review")).toBeInTheDocument();
    // the count in the blurb is pending only — an approved request isn't work
    expect(screen.getByText(/1 pending/)).toBeInTheDocument();
  });

  it("approves a request and flips the row without a refetch", async () => {
    scanRequests.mockResolvedValue([REQUESTS[0]]);
    render(<Approvals />);
    await screen.findByText("posts.gov.in");

    await userEvent.click(screen.getByRole("button", { name: "Approve" }));
    await waitFor(() => expect(decideScanRequest).toHaveBeenCalledWith("r1", "approved"));
    expect(await screen.findByText("approved")).toBeInTheDocument();
    // decided rows lose their controls, so a decision can't be double-submitted
    expect(screen.queryByRole("button", { name: "Approve" })).not.toBeInTheDocument();
    expect(screen.getByText("decided")).toBeInTheDocument();
  });

  it("rejects with the same guarantee", async () => {
    scanRequests.mockResolvedValue([REQUESTS[0]]);
    render(<Approvals />);
    await screen.findByText("posts.gov.in");
    await userEvent.click(screen.getByRole("button", { name: "Reject" }));
    await waitFor(() => expect(decideScanRequest).toHaveBeenCalledWith("r1", "rejected"));
    expect(await screen.findByText("rejected")).toBeInTheDocument();
  });

  it("offers no controls on an already-decided request", async () => {
    scanRequests.mockResolvedValue([REQUESTS[1]]);
    render(<Approvals />);
    await screen.findByText("x.gov.in");
    expect(screen.queryByRole("button", { name: "Approve" })).not.toBeInTheDocument();
    expect(screen.getByText(/0 pending/)).toBeInTheDocument();
  });

  it("keeps the row untouched when the decision fails", async () => {
    scanRequests.mockResolvedValue([REQUESTS[0]]);
    decideScanRequest.mockImplementation(() => Promise.reject(new Error("Request already decided")));
    render(<Approvals />);
    await screen.findByText("posts.gov.in");

    await userEvent.click(screen.getByRole("button", { name: "Approve" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/already decided/);
    expect(screen.getByText("pending")).toBeInTheDocument();   // not optimistically flipped
  });

  it("shows an empty state rather than a bare table", async () => {
    render(<Approvals />);
    expect(await screen.findByText(/No crawl requests yet/)).toBeInTheDocument();
  });
});

// ---------- runtime configuration -------------------------------------------
const CONFIG = {
  categories: [{
    name: "Notifications",
    settings: [
      { key: "notify_enabled", label: "Send notification emails (master switch)",
        type: "bool", value: true, is_override: false, secret: false },
      { key: "public_base_url", label: "Public base URL used in emailed links",
        type: "str", value: "http://localhost:3000", is_override: true, secret: false },
    ],
  }, {
    name: "Email / OTP delivery",
    settings: [
      { key: "email_provider", label: "Provider (console | smtp | api)",
        type: "str", value: "console", is_override: false, secret: false },
      { key: "smtp_password", label: "SMTP password",
        type: "str", value: "", is_override: false, secret: true },
    ],
  }],
};

describe("Platform configuration", () => {
  it("groups settings by category and marks overridden ones", async () => {
    adminConfig.mockResolvedValue(CONFIG);
    render(<ConfigAdmin />);
    expect(await screen.findByText("Notifications")).toBeInTheDocument();
    expect(screen.getByText("Send notification emails (master switch)")).toBeInTheDocument();
    expect(screen.getByText("overridden")).toBeInTheDocument();
    // the raw key is shown, so a steward can match it to docs/env
    expect(screen.getByText("notify_enabled")).toBeInTheDocument();
  });

  it("renders an enumerated setting as a dropdown, not free text", async () => {
    adminConfig.mockResolvedValue(CONFIG);
    render(<ConfigAdmin />);
    await screen.findByText("Email / OTP delivery");
    // a typo in the email provider would silently stop every OTP, so it's constrained
    const provider = screen.getByDisplayValue("console");
    expect(provider.tagName).toBe("SELECT");
    expect(within(provider as HTMLElement).getAllByRole("option").map((o) => o.textContent))
      .toEqual(["console", "smtp", "api"]);
  });

  it("only enables Save once something changed, then sends just the edits", async () => {
    adminConfig.mockResolvedValue(CONFIG);
    updateConfig.mockResolvedValue({ applied: { email_provider: "smtp" } });
    render(<ConfigAdmin />);
    await screen.findByText("Email / OTP delivery");

    const save = screen.getByRole("button", { name: /Save changes/i });
    expect(save).toBeDisabled();

    await userEvent.selectOptions(screen.getByDisplayValue("console"), "smtp");
    expect(save).toBeEnabled();
    await userEvent.click(save);

    // only the changed key is sent — not the whole config back
    await waitFor(() => expect(updateConfig).toHaveBeenCalledWith({ email_provider: "smtp" }));
    expect(await screen.findByText(/Saved 1 setting. Changes are live./)).toBeInTheDocument();
    expect(save).toBeDisabled();          // edits cleared after a successful save
  });

  it("reports which provider a test email actually went through", async () => {
    adminConfig.mockResolvedValue(CONFIG);
    testEmail.mockResolvedValue({ ok: false, provider: "smtp", error: "relay refused" });
    render(<ConfigAdmin />);
    await screen.findByText("Email / OTP delivery");

    const to = screen.getByPlaceholderText(/@/);
    await userEvent.type(to, "me@nic.in");
    await userEvent.click(screen.getByRole("button", { name: /Send test/i }));
    expect(await screen.findByText(/Failed via 'smtp': relay refused/)).toBeInTheDocument();
  });

  it("explains a permission failure instead of showing an empty page", async () => {
    adminConfig.mockImplementation(() =>
      Promise.reject(new Error("Only programme admins can edit configuration.")));
    render(<ConfigAdmin />);
    expect(await screen.findByText(/Only programme admins can edit configuration/)).toBeInTheDocument();
  });
});

// ---------- compare ----------------------------------------------------------
const DIFF = {
  has_baseline: true,
  from_audit: { task_id: "old", date: "2026-07-21T00:00:00Z", score: 65.5 },
  to_audit: { task_id: "new", date: "2026-08-11T00:00:00Z", score: 65.6 },
  overall_delta: 0.1,
  new_issues: [{ guideline_id: "WCAG-1.4.3", title: "Colour contrast" }],
  resolved_issues: [
    { guideline_id: "Content-QA", title: "Broken link (403)" },
    { guideline_id: "WCAG-3.1.1", title: "Page has no declared language" },
  ],
  pages: [
    { url: "https://ux4g.gov.in", status: "analysed", score: 67, delta: 0, new_page: false },
    { url: "https://ux4g.gov.in/old", status: "not_recrawled", score: 62, delta: null, new_page: false },
  ],
  pages_analysed: 2, pages_total: 25,
};

describe("Compare & page coverage", () => {
  it("states which two snapshots are being compared", async () => {
    compare.mockResolvedValue(DIFF);
    render(<Compare params={{ id: "t1" }} />);
    expect(await screen.findByText(/most recent prior run/)).toBeInTheDocument();
    expect(screen.getByText("21 Jul 2026")).toBeInTheDocument();
    expect(screen.getByText("11 Aug 2026")).toBeInTheDocument();
  });

  it("signs the delta and counts issues both ways", async () => {
    compare.mockResolvedValue(DIFF);
    render(<Compare params={{ id: "t1" }} />);
    await screen.findByText(/most recent prior run/);

    expect(screen.getByText("+0.1")).toBeInTheDocument();      // improvement carries a +
    // Direction is stated in words under each count, not by colour alone
    // (WCAG 1.4.1) and not by a sign that reads oddly — "−2 resolved" is two
    // resolved issues, not minus two.
    const newTile = screen.getByText("not present last run").closest(".gx-stat") as HTMLElement;
    expect(within(newTile).getByText("1")).toBeInTheDocument();
    const fixedTile = screen.getByText("fixes confirmed").closest(".gx-stat") as HTMLElement;
    expect(within(fixedTile).getByText("2")).toBeInTheDocument();
    expect(screen.getByText("8%")).toBeInTheDocument();        // 2 of 25 pages
    expect(screen.getByText("2 of 25 pages recrawled")).toBeInTheDocument();
  });

  it("shows a regression without a plus sign", async () => {
    compare.mockResolvedValue({ ...DIFF, overall_delta: -12.4 });
    render(<Compare params={{ id: "t1" }} />);
    expect(await screen.findByText("-12.4")).toBeInTheDocument();
  });

  it("names the specific issues that appeared and were fixed", async () => {
    compare.mockResolvedValue(DIFF);
    render(<Compare params={{ id: "t1" }} />);
    await screen.findByText(/most recent prior run/);

    expect(screen.getByText("Colour contrast")).toBeInTheDocument();
    expect(screen.getByText("WCAG-1.4.3")).toBeInTheDocument();
    expect(screen.getByText("Page has no declared language")).toBeInTheDocument();
  });

  it("says so plainly when there is no earlier audit to compare against", async () => {
    render(<Compare params={{ id: "t1" }} />);   // default fixture: no baseline
    expect(await screen.findByText(/No earlier completed audit yet/)).toBeInTheDocument();
    // and no fabricated zeroes
    expect(screen.queryByText("+0.0")).not.toBeInTheDocument();
  });

  it("surfaces a load failure", async () => {
    compare.mockImplementation(() => Promise.reject(new Error("Audit not found")));
    render(<Compare params={{ id: "t1" }} />);
    expect(await screen.findByRole("alert")).toHaveTextContent(/Audit not found/);
  });
});
