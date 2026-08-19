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
const listAudits = vi.fn();
vi.mock("@/lib/api", () => ({
  api: {
    auditStatus: (...a: any[]) => auditStatus(...a),
    reviewAudit: (...a: any[]) => reviewAudit(...a),
    reviewChecklist: (...a: any[]) => reviewChecklist(...a),
    setReviewItem: (...a: any[]) => setReviewItem(...a),
    listAudits: (...a: any[]) => listAudits(...a),
  },
}));

import Review from "@/app/review/page";

const AUDIT = {
  domain: "digilocker.gov.in", compliance_status: "partially_compliant",
  confidence: "automated_only",
};

const checklist = (over: any = {}) => ({
  task_id: "T1",
  categories: [{ name: "About Us", count: 8 }, { name: "Search", count: 9 }],
  standards: [{ name: "GIGW", count: 347 }, { name: "WCAG", count: 217 }],
  reviewable_total: 379, total: 2, decided: 0, failed: 0, passed: 0, rating: null,
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
    [auditStatus, reviewAudit, reviewChecklist, setReviewItem, listAudits]
      .forEach(m => m.mockReset());
    auditStatus.mockResolvedValue(AUDIT);
    reviewChecklist.mockResolvedValue(checklist());
    setReviewItem.mockResolvedValue({ ok: true });
    listAudits.mockResolvedValue([]);
    window.history.pushState({}, "", "/review?audit=T1");
  });

  // Manual Review is a top-level nav item, so it is routinely opened with no
  // ?audit= at all. It used to answer that with an instruction to go somewhere
  // else, which reads as a broken page.
  describe("opened from the nav, with no audit selected", () => {
    beforeEach(() => window.history.pushState({}, "", "/review"));

    it("offers the completed audits to certify", async () => {
      listAudits.mockResolvedValue([
        { task_id: "T9", domain: "ux4g.gov.in", status: "completed", score: 71.4,
          compliance_status: "partially_compliant", date: "2026-08-16T10:00:00Z" },
        { task_id: "T8", domain: "half-done.gov.in", status: "running", score: null,
          compliance_status: null, date: "2026-08-16T09:00:00Z" },
      ]);
      render(<Review />);
      const row = (await screen.findByText("ux4g.gov.in")).closest("li")!;
      expect(within(row).getByRole("link", { name: "Review" }))
        .toHaveAttribute("href", "/review?audit=T9");
      // an audit still running cannot be certified, so it must not be offered
      expect(screen.queryByText("half-done.gov.in")).not.toBeInTheDocument();
      expect(reviewChecklist).not.toHaveBeenCalled();
    });

    it("points at New Audit when there is nothing to certify yet", async () => {
      listAudits.mockResolvedValue([]);
      render(<Review />);
      expect(await screen.findByText(/No completed audits yet/)).toBeInTheDocument();
      expect(screen.getByRole("link", { name: "New Audit" }))
        .toHaveAttribute("href", "/audits/new");
    });
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
      { enforcement: "Foundational", category: undefined, standard: undefined, platform: "website" });
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

    const row = screen.getByText("UX4G-ABT-001").closest(".gx-check")!;
    await userEvent.click(within(row as HTMLElement).getByRole("button", { name: "No" }));

    await waitFor(() =>
      expect(setReviewItem).toHaveBeenCalledWith("T1", "UX4G-ABT-001", "fail", undefined));
  });

  it("reflects decisions already recorded against the audit", async () => {
    render(<Review />);
    await screen.findByText(/Search returns relevant results/);
    const row = screen.getByText("UX4G-SEA-001").closest(".gx-check")!;
    // an already-failed item comes back selected, not blank
    expect(within(row as HTMLElement).getByRole("button", { name: "No" })).toHaveClass("btn-primary");
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
      { enforcement: "Foundational", category: "Search", standard: undefined, platform: "website" }));
  });

  it("loads no checklist until an audit is chosen", async () => {
    window.history.pushState({}, "", "/review");   // no ?audit=
    render(<Review />);
    expect(await screen.findByText(/Choose an audit to certify/i)).toBeInTheDocument();
    expect(auditStatus).not.toHaveBeenCalled();
    expect(reviewChecklist).not.toHaveBeenCalled();
  });

  // Mirrors the UX4G self-health-check: you can see how much sits behind each
  // filter before choosing it. Without counts, picking one is guesswork.
  it("shows how many guidelines sit behind each filter option", async () => {
    render(<Review />);
    await screen.findByText(/Define the organisation's purpose/);
    const cat = screen.getByLabelText(/Category/i);
    expect(within(cat as HTMLElement).getByRole("option", { name: "About Us (8)" })).toBeInTheDocument();
    const std = screen.getByLabelText(/Compliance/i);
    expect(within(std as HTMLElement).getByRole("option", { name: "GIGW (347)" })).toBeInTheDocument();
    expect(within(std as HTMLElement).getByRole("option", { name: /All compliances \(379\)/ })).toBeInTheDocument();
  });

  it("filtering by compliance standard refetches", async () => {
    render(<Review />);
    await screen.findByText(/Define the organisation's purpose/);
    await userEvent.selectOptions(screen.getByLabelText(/Compliance/i), "WCAG");
    await waitFor(() => expect(reviewChecklist).toHaveBeenLastCalledWith("T1",
      { enforcement: "Foundational", category: undefined, standard: "WCAG", platform: "website" }));
  });

  it("reports a compliance rating over answered items, ignoring N/A", async () => {
    reviewChecklist.mockResolvedValue(checklist({ passed: 3, failed: 1, decided: 5, rating: 75 }));
    render(<Review />);
    await screen.findByText(/Define the organisation's purpose/);
    expect(screen.getByText(/Compliance rating/)).toBeInTheDocument();
    expect(screen.getByText("75%")).toBeInTheDocument();
    // 5 answered but only 4 assessed — the N/A is excluded from the rate
    expect(screen.getByText(/3 met of 4/)).toBeInTheDocument();
  });

  it("shows no rating until something has actually been answered", async () => {
    render(<Review />);   // rating: null
    await screen.findByText(/Define the organisation's purpose/);
    expect(screen.queryByText(/Compliance rating/)).not.toBeInTheDocument();
  });

  it("the rating updates as answers are given, rather than going stale", async () => {
    render(<Review />);
    await screen.findByText(/Define the organisation's purpose/);
    const row = screen.getByText("UX4G-ABT-001").closest(".gx-check")!;
    await userEvent.click(within(row as HTMLElement).getByRole("button", { name: "Yes" }));
    // fixture already carries one "fail" -> 1 met of 2 assessed
    expect(await screen.findByText("50%")).toBeInTheDocument();
  });

  // A website audit must not ask about avatar menus or walkthrough screens.
  it("reviews the website by default and refetches when switched to App", async () => {
    render(<Review />);
    await screen.findByText(/Define the organisation's purpose/);
    expect(screen.getByRole("button", { name: "Website" })).toHaveAttribute("aria-pressed", "true");

    await userEvent.click(screen.getByRole("button", { name: "Mobile app" }));
    await waitFor(() => expect(reviewChecklist).toHaveBeenLastCalledWith("T1",
      { enforcement: "Foundational", category: undefined, standard: undefined, platform: "app" }));
    expect(screen.getByRole("button", { name: "Mobile app" })).toHaveAttribute("aria-pressed", "true");
  });
});
