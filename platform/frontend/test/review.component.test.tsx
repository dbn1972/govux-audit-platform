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
// forwards the rest of the props: these links carry an onClick, because
// /review and /review?assessment=… are one route and the URL alone moves
// nothing. A double that swallowed it would test a link that does not exist.
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: any) =>
    <a href={typeof href === "string" ? href : "#"} {...rest}>{children}</a>,
}));

const auditStatus = vi.fn();
const reviewAudit = vi.fn();
const reviewChecklist = vi.fn();
const setReviewItem = vi.fn();
const listAudits = vi.fn();
// the picker now also offers a review with no audit behind it, so the screen
// asks for the domain list and any assessments already open
const listDomains = vi.fn();
const manualAssessments = vi.fn();
const createManualAssessment = vi.fn();
const assessmentChecklist = vi.fn();
const setAssessmentItem = vi.fn();
const signOffAssessment = vi.fn();
vi.mock("@/lib/api", () => ({
  api: {
    auditStatus: (...a: any[]) => auditStatus(...a),
    reviewAudit: (...a: any[]) => reviewAudit(...a),
    reviewChecklist: (...a: any[]) => reviewChecklist(...a),
    setReviewItem: (...a: any[]) => setReviewItem(...a),
    listAudits: (...a: any[]) => listAudits(...a),
    listDomains: (...a: any[]) => listDomains(...a),
    manualAssessments: (...a: any[]) => manualAssessments(...a),
    createManualAssessment: (...a: any[]) => createManualAssessment(...a),
    assessmentChecklist: (...a: any[]) => assessmentChecklist(...a),
    setAssessmentItem: (...a: any[]) => setAssessmentItem(...a),
    signOffAssessment: (...a: any[]) => signOffAssessment(...a),
  },
}));

import Review from "@/app/review/page";

const AUDIT = {
  domain: "digilocker.gov.in", compliance_status: "partially_compliant",
  confidence: "automated_only",
};

const checklist = (over: any = {}) => ({
  task_id: "T1",
  categories: [{ name: "About Us", count: 8, answered: 0 },
               { name: "Search", count: 9, answered: 0 }],
  standards: [{ name: "GIGW", count: 347 }, { name: "WCAG", count: 217 }],
  // subject-wide, as the API returns them: the second item below is already
  // answered "fail", so a fixture claiming 0 decided would be describing a
  // payload the server cannot produce
  reviewable_total: 379, total: 2, decided: 1, failed: 1, passed: 0, rating: 0,
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

// File-level reset + benign defaults for EVERY api mock. mockReset() leaves a
// bare vi.fn() that returns undefined, and the picker effect does
// `api.listDomains().then(...)` / `api.manualAssessments().then(...)` directly —
// so any test that reaches the picker without a stubbed promise crashes on
// `.then` of undefined. Each describe below only ever *narrows* these; nothing
// relies on a sibling block having run first to arm a mock. (This file used to
// pass only because tests ran in source order — under a shuffled run the
// "assessing without an audit" block ran before the block that armed these.)
beforeEach(() => {
  [auditStatus, reviewAudit, reviewChecklist, setReviewItem, listAudits,
   listDomains, manualAssessments, createManualAssessment, assessmentChecklist,
   setAssessmentItem, signOffAssessment]
    .forEach(m => m.mockReset());
  auditStatus.mockResolvedValue(AUDIT);
  reviewChecklist.mockResolvedValue(checklist());
  setReviewItem.mockResolvedValue({ ok: true });
  reviewAudit.mockResolvedValue({ compliance: { status: "compliant", reason: "" } });
  listAudits.mockResolvedValue([]);
  listDomains.mockResolvedValue([]);
  manualAssessments.mockResolvedValue([]);
  createManualAssessment.mockResolvedValue({ id: "A1" });
  assessmentChecklist.mockResolvedValue(checklist());
  setAssessmentItem.mockResolvedValue({ ok: true });
  signOffAssessment.mockResolvedValue({ verdict: "compliant", answered: 1, failed: 0 });
});

describe("Guided manual review", () => {
  beforeEach(() => {
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
    listDomains.mockResolvedValue([]);
    manualAssessments.mockResolvedValue([]);
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
    expect(screen.getByText("partially compliant", { selector: "span.ux4g-tag-s" })).toBeInTheDocument();
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
    expect(within(row as HTMLElement).getByRole("button", { name: "No" })).toHaveClass("ux4g-btn-primary");
    expect(screen.getByText(/top hit unrelated/)).toBeInTheDocument();
  });

  it("blocks certification while any item is failing", async () => {
    reviewChecklist.mockResolvedValue(checklist({ failed: 1, decided: 1 }));
    render(<Review />);
    await screen.findByText(/Define the organisation's purpose/);
    expect(screen.getByRole("button", { name: /certify compliant/i })).toBeDisabled();
  });

  it("certifying calls the API and shows the new compliant verdict", async () => {
    // nothing unmet — the default fixture carries a failure, which the test
    // above proves blocks this button
    reviewChecklist.mockResolvedValue(checklist({
      decided: 1, passed: 1, failed: 0, rating: 100,
      items: [{ ...checklist().items[0], decision: "pass" }],
    }));
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
    expect(await screen.findByText(/Certify a completed audit/i)).toBeInTheDocument();
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
      { enforcement: "Foundational", category: "About Us", standard: "WCAG", platform: "website" }));
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
    reviewChecklist.mockResolvedValue(checklist({
      decided: 0, failed: 0, passed: 0, rating: null,
      items: [checklist().items[0]],          // nothing answered anywhere
    }));
    render(<Review />);
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
    // a category is always in play now — the screen never loads all 151 at once
    await waitFor(() => expect(reviewChecklist).toHaveBeenLastCalledWith("T1",
      { enforcement: "Foundational", category: "About Us", standard: undefined, platform: "app" }));
    expect(screen.getByRole("button", { name: "Mobile app" })).toHaveAttribute("aria-pressed", "true");
  });
});

// ── review without an audit ────────────────────────────────────────────────
// The whole point of the change: an org with three registered domains could
// review exactly the one it had audited, and a mobile app had no route in.
describe("assessing without an audit", () => {
  beforeEach(() => {
    window.history.pushState({}, "", "/review");
    listDomains.mockResolvedValue([
      { id: "d1", url: "indiapost.gov.in" },
      { id: "d2", url: "ippbonline.gov.in" },
    ]);
  });

  it("offers every registered domain, not only the audited ones", async () => {
    listAudits.mockResolvedValue([]);          // nothing has been crawled at all
    render(<Review />);
    const picker = await screen.findByLabelText(/website/i);
    expect(within(picker).getByRole("option", { name: "indiapost.gov.in" })).toBeInTheDocument();
    expect(within(picker).getByRole("option", { name: "ippbonline.gov.in" })).toBeInTheDocument();
  });

  it("starts an app assessment, which has no domain behind it", async () => {
    createManualAssessment.mockResolvedValue({ id: "A1" });
    assessmentChecklist.mockResolvedValue({
      assessment_id: "A1", subject: "India Post Mobile", platform: "app",
      items: [], categories: [], standards: [], total: 0, decided: 0,
      passed: 0, failed: 0, rating: null, reviewable_total: 0,
    });
    render(<Review />);

    await userEvent.type(await screen.findByLabelText(/mobile app/i), "India Post Mobile");
    await userEvent.click(screen.getByRole("button", { name: /start app/i }));

    await waitFor(() => expect(createManualAssessment).toHaveBeenCalledWith(
      { subject: "India Post Mobile", platform: "app" }));
    await waitFor(() => expect(assessmentChecklist).toHaveBeenCalled());
  });
});

// ── the assessment route, end to end ───────────────────────────────────────
// Everything below this line was gated on `?audit=`: an assessment rendered a
// checklist with no subject, no filters, no progress, and a Certify button that
// could never be clicked — several hundred answers with no way to record a
// verdict at the end of them.
describe("a standalone assessment", () => {
  const assessment = (over: any = {}) => ({
    ...checklist(), assessment_id: "A1", subject: "ncsc.dop.gov.in",
    platform: "website", status: "in_progress", verdict: null, ...over,
  });
  const answered = (over: any = {}) => assessment({
    decided: 1, passed: 1, failed: 0, rating: 100,
    items: [{ ...checklist().items[0], decision: "pass" }], ...over,
  });

  beforeEach(() => {
    window.history.pushState({}, "", "/review?assessment=A1");
    assessmentChecklist.mockResolvedValue(assessment());
    setAssessmentItem.mockResolvedValue({ ok: true });
  });

  it("names the subject being assessed", async () => {
    render(<Review />);
    expect(await screen.findByText("ncsc.dop.gov.in")).toBeInTheDocument();
    expect(screen.getByText(/assessing website/i)).toBeInTheDocument();
  });

  it("carries the same filters and progress an audit-backed review has", async () => {
    render(<Review />);
    await screen.findByText(/Define the organisation's purpose/);
    expect(screen.getByLabelText(/enforcement tier/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^category$/i)).toBeInTheDocument();
    expect(screen.getByText(/1 of 379 answered/)).toBeInTheDocument();
    // the platform is what the subject IS, fixed when the assessment started —
    // offering it as a toggle would re-scope answers already recorded
    expect(screen.queryByRole("button", { name: "Mobile app" })).not.toBeInTheDocument();
  });

  it("sends no platform, so an app assessment is not answered against the website set", async () => {
    render(<Review />);
    await screen.findByText(/Define the organisation's purpose/);
    await waitFor(() => expect(assessmentChecklist).toHaveBeenLastCalledWith(
      "A1", { enforcement: "Foundational", category: "About Us" }));
  });

  it("can actually be signed off", async () => {
    assessmentChecklist.mockResolvedValue(answered());
    signOffAssessment.mockResolvedValue({ verdict: "compliant", answered: 1, failed: 0 });
    render(<Review />);
    await screen.findByText(/Define the organisation's purpose/);

    await userEvent.click(screen.getByRole("button", { name: /certify compliant/i }));
    await waitFor(() => expect(signOffAssessment).toHaveBeenCalledWith("A1", true, undefined));
    expect(await screen.findByText(/assessment verdict/i)).toBeInTheDocument();
  });

  it("will not certify a checklist with nothing answered", async () => {
    assessmentChecklist.mockResolvedValue(assessment({
      decided: 0, passed: 0, failed: 0, rating: null, items: [checklist().items[0]],
    }));
    render(<Review />);
    await screen.findByText(/Define the organisation's purpose/);
    expect(screen.getByRole("button", { name: /certify compliant/i })).toBeDisabled();
    expect(screen.getByText(/Answer at least one guideline/i)).toBeInTheDocument();
  });

  it("is a record, not a form, once signed off", async () => {
    assessmentChecklist.mockResolvedValue(answered({
      status: "signed_off", verdict: "compliant", signed_off_at: "2026-08-20T09:00:00Z",
    }));
    render(<Review />);
    await screen.findByText(/Define the organisation's purpose/);
    expect(screen.queryByRole("button", { name: /certify compliant/i })).not.toBeInTheDocument();
    expect(screen.getByText(/cannot be changed/i)).toBeInTheDocument();
    const row = screen.getByText("UX4G-ABT-001").closest(".gx-check")!;
    expect(within(row as HTMLElement).getByRole("button", { name: "Yes" })).toBeDisabled();
  });
});

// ── moving between the picker and a review ─────────────────────────────────
// /review and /review?assessment=… are the SAME route, so React keeps the page
// mounted across them and a mount-only effect never runs again. Both links
// changed the URL and nothing else: "Continue" left you sitting on the picker,
// and "All manual reviews" left you sitting on the checklist.
describe("navigating within the review screen", () => {
  const IN_PROGRESS = {
    id: "A1", subject: "ncsc.dop.gov.in", platform: "website", status: "in_progress",
    answered: 1, verdict: null, created_at: "2026-08-20T09:00:00Z",
  };
  const payload = {
    ...checklist(), assessment_id: "A1", subject: "ncsc.dop.gov.in",
    platform: "website", status: "in_progress", verdict: null,
  };

  beforeEach(() => {
    listAudits.mockResolvedValue([]);
    listDomains.mockResolvedValue([{ id: "d1", url: "indiapost.gov.in" }]);
    manualAssessments.mockResolvedValue([IN_PROGRESS]);
    assessmentChecklist.mockResolvedValue(payload);
  });

  it("opens a checklist from Continue, with no reload", async () => {
    window.history.pushState({}, "", "/review");
    render(<Review />);
    await userEvent.click(await screen.findByRole("link", { name: "Continue" }));

    expect(await screen.findByText(/Define the organisation's purpose/)).toBeInTheDocument();
    expect(screen.queryByText(/Assess without an audit/)).not.toBeInTheDocument();
  });

  it("returns to the picker from the back link, and refreshes what it lists", async () => {
    window.history.pushState({}, "", "/review?assessment=A1");
    render(<Review />);
    await screen.findByText(/Define the organisation's purpose/);
    manualAssessments.mockClear();

    await userEvent.click(screen.getByRole("link", { name: /All manual reviews/ }));

    expect(await screen.findByText(/Assess without an audit/)).toBeInTheDocument();
    // the checklist must go with it — the two are gated separately, so a stale
    // payload would render both at once
    expect(screen.queryByText(/Define the organisation's purpose/)).not.toBeInTheDocument();
    // an assessment signed off a moment ago belongs in the other list now
    expect(manualAssessments).toHaveBeenCalled();
  });

  it("follows the browser's own back button", async () => {
    window.history.pushState({}, "", "/review?assessment=A1");
    render(<Review />);
    await screen.findByText(/Define the organisation's purpose/);

    window.history.replaceState({}, "", "/review");     // as the browser leaves it
    window.dispatchEvent(new PopStateEvent("popstate"));

    expect(await screen.findByText(/Assess without an audit/)).toBeInTheDocument();
  });
});
