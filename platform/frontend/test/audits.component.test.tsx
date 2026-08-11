/** @vitest-environment jsdom */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import "@testing-library/jest-dom/vitest";
import { render, screen, waitFor, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";

afterEach(cleanup);

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
vi.mock("@/components/AppShell", () => ({ default: ({ children }: any) => <div>{children}</div> }));
vi.mock("next/link", () => ({ default: ({ href, children }: any) => <a href={String(href)}>{children}</a> }));

const listDomains = vi.fn();
const submitAudit = vi.fn();
const auditStatus = vi.fn();
const listAudits = vi.fn();
vi.mock("@/lib/api", () => ({
  api: {
    listDomains: (...a: any[]) => listDomains(...a),
    submitAudit: (...a: any[]) => submitAudit(...a),
    auditStatus: (...a: any[]) => auditStatus(...a),
    listAudits: (...a: any[]) => listAudits(...a),
    me: () => Promise.resolve({ is_steward: false, entitlements: { free_pages_per_audit: 10 } }),
    createScanRequest: () => Promise.resolve({ id: "x", status: "pending" }),
  },
}));

import NewAudit from "@/app/audits/new/page";
import Running from "@/app/audits/[id]/page";
import Audits from "@/app/audits/page";

describe("New Audit — real domains, real ids", () => {
  beforeEach(() => { push.mockReset(); listDomains.mockReset(); submitAudit.mockReset();
    window.history.pushState({}, "", "/audits/new"); });

  it("submits the selected domain's UUID (not its URL) and navigates to the task", async () => {
    listDomains.mockResolvedValue([
      { id: "uuid-verified-1", url: "posts.gov.in", verify_status: "verified" },
      { id: "uuid-pending", url: "draft.gov.in", verify_status: "pending" },
    ]);
    submitAudit.mockResolvedValue({ task_id: "task-xyz" });
    render(<NewAudit />);

    await screen.findByRole("combobox");           // domains loaded
    await userEvent.click(screen.getByRole("button", { name: /Submit/i }));

    await waitFor(() => expect(submitAudit).toHaveBeenCalledWith("uuid-verified-1", 10));
    expect(push).toHaveBeenCalledWith("/audits/task-xyz");
  });

  it("pre-selects the domain passed in the ?domain= query", async () => {
    window.history.pushState({}, "", "/audits/new?domain=uuid-verified-2");
    listDomains.mockResolvedValue([
      { id: "uuid-verified-1", url: "a.gov.in", verify_status: "verified" },
      { id: "uuid-verified-2", url: "b.gov.in", verify_status: "verified" },
    ]);
    submitAudit.mockResolvedValue({ task_id: "t2" });
    render(<NewAudit />);
    await screen.findByRole("combobox");
    await userEvent.click(screen.getByRole("button", { name: /Submit/i }));
    await waitFor(() => expect(submitAudit).toHaveBeenCalledWith("uuid-verified-2", 10));
  });

  it("shows a register-and-verify prompt when there are no verified domains", async () => {
    listDomains.mockResolvedValue([{ id: "x", url: "p.gov.in", verify_status: "pending" }]);
    render(<NewAudit />);
    expect(await screen.findByText(/no verified domains yet/i)).toBeInTheDocument();
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
  });
});

describe("Audit history list", () => {
  beforeEach(() => listAudits.mockReset());

  it("lists audits: completed rows link to the report, unreachable rows show no score", async () => {
    listAudits.mockResolvedValue([
      { task_id: "a1", domain: "posts.gov.in", status: "completed", score: 72, band: "B",
        compliance_status: "partially_compliant", date: "2026-07-10T10:00:00Z" },
      { task_id: "a2", domain: "blocked.gov.in", status: "insufficient_evidence", score: null,
        band: null, compliance_status: null, date: "2026-07-11T10:00:00Z" },
    ]);
    render(<Audits />);
    expect(await screen.findByText("posts.gov.in")).toBeInTheDocument();
    expect(screen.getByText("72")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /View report/i })).toHaveAttribute("href", "/audits/a1/report");
    // the unreachable audit shows the honest "no score" badge, not a fabricated number
    expect(screen.getByText("no score")).toBeInTheDocument();
  });

  it("shows an empty state with a call to action when there are no audits", async () => {
    listAudits.mockResolvedValue([]);
    render(<Audits />);
    expect(await screen.findByText(/Run your first audit/i)).toBeInTheDocument();
  });
});

describe("Audit status — terminal states don't spin forever", () => {
  beforeEach(() => auditStatus.mockReset());

  it("renders an explanation for insufficient_evidence instead of an endless spinner", async () => {
    auditStatus.mockResolvedValue({ status: "insufficient_evidence", domain: "blocked.gov.in" });
    render(<Running params={{ id: "t9" }} />);
    expect(await screen.findByText(/couldn.t capture this site/i)).toBeInTheDocument();
    // the "running the engine" spinner must NOT be shown for a terminal state
    expect(screen.queryByText(/Running the engine/i)).not.toBeInTheDocument();
  });
});
