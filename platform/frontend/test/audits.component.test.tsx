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
vi.mock("@/lib/api", () => ({
  api: {
    listDomains: (...a: any[]) => listDomains(...a),
    submitAudit: (...a: any[]) => submitAudit(...a),
    auditStatus: (...a: any[]) => auditStatus(...a),
  },
}));

import NewAudit from "@/app/audits/new/page";
import Running from "@/app/audits/[id]/page";

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

    await waitFor(() => expect(submitAudit).toHaveBeenCalledWith("uuid-verified-1"));
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
    await waitFor(() => expect(submitAudit).toHaveBeenCalledWith("uuid-verified-2"));
  });

  it("shows a register-and-verify prompt when there are no verified domains", async () => {
    listDomains.mockResolvedValue([{ id: "x", url: "p.gov.in", verify_status: "pending" }]);
    render(<NewAudit />);
    expect(await screen.findByText(/no verified domains yet/i)).toBeInTheDocument();
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
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
