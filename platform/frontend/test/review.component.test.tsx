/** @vitest-environment jsdom */
import { describe, it, expect, vi, beforeEach } from "vitest";
import "@testing-library/jest-dom/vitest";
import { render, screen, waitFor, cleanup, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach } from "vitest";
import React from "react";

afterEach(cleanup);   // no globals:true, so unmount between tests explicitly

// Strip the app chrome (AppShell uses next/navigation) and the router link.
vi.mock("@/components/AppShell", () => ({
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock("next/link", () => ({
  default: ({ href, children }: any) => <a href={typeof href === "string" ? href : "#"}>{children}</a>,
}));

const auditStatus = vi.fn();
const reviewAudit = vi.fn();
const reviewChecklist = vi.fn();
const setReviewItem = vi.fn();
vi.mock("@/lib/api", () => ({
  api: {
    auditStatus: (...a: any[]) => auditStatus(...a),
    reviewAudit: (...a: any[]) => reviewAudit(...a),
    reviewChecklist: (...a: any[]) => reviewChecklist(...a),
    setReviewItem: (...a: any[]) => setReviewItem(...a),
  },
}));

import Review from "@/app/review/page";

const AUDIT = {
  domain: "digilocker.gov.in", compliance_status: "partially_compliant",
  confidence: "automated_only",
};

const checklist = (over: any = {}) => ({
  task_id: "T1", categories: ["About Us", "Search"], total: 2, decided: 0, failed: 0,
  items: [
    { guideline_id: "UX4G-ABT-001", category: "About Us", title: "Define the organisation's purpose",
      issue: "Purpose or mission is missing.", advice: "Add a concise Our Purpose section.",
      good_example: "Mission stated in the first screen.", bad_example: "No mission anywhere.",
      enforcement_level: "Foundational", severity: "Small Issue", automation: "manual",
      reference: "GIGW 3.0 – Section 2.2", decision: null, note: null },
    { guideline_id: "UX4G-SEA-001", category: "Search", title: "Search returns relevant results",
      issue: "Irrelevant results.", advice: "Tune ranking.", enforcement_level: "Foundational",
      severity: "Big Issue", automation: "assisted", decision: "fail", note: "top hit unrelated" },
  ],
  ...over,
});

describe("Guided manual review", () => {
  beforeEach(() => {
    [auditStatus, reviewAudit, reviewChecklist, setReviewItem].forEach(m => m.mockReset());
    auditStatus.mockResolvedValue(AUDIT);
    reviewChecklist.mockResolvedValue(checklist());
    setReviewItem.mockResolvedValue({ ok: true });
    window.history.pushState({}, "", "/review?audit=T1");
  });

  it("loads the audit's current verdict from the API", async () => {
    render(<Review />);
    expect(await screen.findByText("digilocker.gov.in")).toBeInTheDocument();
    // the verdict badge specifically (the phrase also appears in the intro copy)
    expect(screen.getByText("partially compliant", { selector: "span.badge" })).toBeInTheDocument();
    expect(auditStatus).toHaveBeenCalledWith("T1");
  });

  // The checklist used to be three prompts hard-coded in this file. If it ever
  // stops coming from the library, the platform is reviewing against something
  // other than the published guidelines.
  it("renders the checklist from the guideline library, not a hard-coded list", async () => {
    render(<Review />);
    expect(await screen.findByText(/Define the organisation's purpose/)).toBeInTheDocument();
    expect(screen.getByText("UX4G-ABT-001")).toBeInTheDocument();
    expect(screen.getByText(/Search returns relevant results/)).toBeInTheDocument();
    expect(reviewChecklist).toHaveBeenCalledWith("T1",
      { enforcement: "Foundational", category: undefined });
  });

  it("shows the issue and the advice a reviewer needs to judge it", async () => {
    render(<Review />);
    expect(await screen.findByText(/Purpose or mission is missing/)).toBeInTheDocument();
    expect(screen.getByText(/Add a concise Our Purpose section/)).toBeInTheDocument();
    expect(screen.getByText(/Mission stated in the first screen/)).toBeInTheDocument();
  });

  // The old page kept decisions in React state and never sent them, so an
  // assessor's findings died on navigation. This is the regression guard.
  it("persists each decision as it is made", async () => {
    render(<Review />);
    await screen.findByText(/Define the organisation's purpose/);

    const row = screen.getByText("UX4G-ABT-001").closest(".list-group-item")!;
    await userEvent.click(within(row as HTMLElement).getByRole("button", { name: "Fail" }));

    await waitFor(() =>
      expect(setReviewItem).toHaveBeenCalledWith("T1", "UX4G-ABT-001", "fail", undefined));
  });

  it("reflects decisions already recorded against the audit", async () => {
    render(<Review />);
    await screen.findByText(/Search returns relevant results/);
    const row = screen.getByText("UX4G-SEA-001").closest(".list-group-item")!;
    // an already-failed item comes back selected, not blank
    expect(within(row as HTMLElement).getByRole("button", { name: "Fail" })).toHaveClass("btn-primary");
    expect(screen.getByText(/top hit unrelated/)).toBeInTheDocument();
  });

  it("blocks certification while any item is failing", async () => {
    reviewChecklist.mockResolvedValue(checklist({ failed: 1, decided: 1 }));
    render(<Review />);
    await screen.findByText(/Define the organisation's purpose/);
    expect(screen.getByRole("button", { name: /certify compliant/i })).toBeDisabled();
  });

  it("certifying calls the API and shows the new compliant verdict", async () => {
    reviewAudit.mockResolvedValue({
      compliance: { status: "compliant", reason: "expert-reviewed, no critical failures" },
    });
    render(<Review />);
    await screen.findByText(/Define the organisation's purpose/);

    await userEvent.click(screen.getByRole("button", { name: /certify compliant/i }));

    await waitFor(() => expect(reviewAudit).toHaveBeenCalledWith("T1", true, undefined));
    expect(await screen.findByText(/new legal verdict/i)).toBeInTheDocument();
    expect(screen.getByText(/expert-reviewed, no critical failures/i)).toBeInTheDocument();
  });

  it("filtering by category refetches rather than filtering client-side", async () => {
    render(<Review />);
    await screen.findByText(/Define the organisation's purpose/);
    await userEvent.selectOptions(screen.getByLabelText(/Category/i), "Search");
    await waitFor(() => expect(reviewChecklist).toHaveBeenLastCalledWith("T1",
      { enforcement: "Foundational", category: "Search" }));
  });

  it("prompts to open from a report when no audit id is present", async () => {
    window.history.pushState({}, "", "/review");   // no ?audit=
    render(<Review />);
    expect(await screen.findByText(/open this from a completed audit report/i)).toBeInTheDocument();
    expect(auditStatus).not.toHaveBeenCalled();
    expect(reviewChecklist).not.toHaveBeenCalled();
  });
});
