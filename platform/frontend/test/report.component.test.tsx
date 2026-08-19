/** @vitest-environment jsdom */
/**
 * /audits/[id]/report and /audits/[id]/issues — the two screens people actually
 * spend time on, and the ones that carry the platform's headline claims.
 *
 * The invariants worth locking here are the product's, not React's: the legal
 * compliance verdict is rendered SEPARATELY from the UX band (never folded into
 * it), the guard-rail and integrity flags are surfaced rather than quietly
 * applied, and advisory AI is always labelled as advisory.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import "@testing-library/jest-dom/vitest";
import { render, screen, waitFor, cleanup, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";

afterEach(cleanup);

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }), usePathname: () => "/" }));
vi.mock("@/components/AppShell", () => ({ default: ({ children }: any) => <div>{children}</div> }));
vi.mock("@/components/AuditNav", () => ({ default: () => <nav aria-label="Audit views" /> }));
vi.mock("next/link", () => ({ default: ({ href, children }: any) => <a href={String(href)}>{children}</a> }));

const auditReport = vi.fn();
const remediation = vi.fn();
const evidencePack = vi.fn();
vi.mock("@/lib/api", () => ({
  api: {
    auditReport: (...a: any[]) => auditReport(...a),
    remediation: (...a: any[]) => remediation(...a),
    evidencePack: (...a: any[]) => evidencePack(...a),
  },
}));

import Report from "@/app/audits/[id]/report/page";
import Issues from "@/app/audits/[id]/issues/page";

const REPORT = {
  domain: "indiapost.gov.in", date: "2026-08-11T00:00:00Z", engine_version: "v3.2",
  overall_score: 68.1, band: "C", guardrail_active: false,
  compliance: { status: "partially_compliant", method: "automated" },
  // categories is an ARRAY of {category, weight, score} — see routers/audits.py
  categories: [
    { category: "accessibility", weight: 22, score: 61 },
    { category: "usability", weight: 17, score: 74 },
  ],
  cwv: {}, findings: [], documents: [], pages_total: 6,
};

beforeEach(() => {
  [auditReport, remediation, evidencePack].forEach((m) => m.mockReset());
  auditReport.mockResolvedValue(REPORT);
  remediation.mockResolvedValue({ ai_available: false, items: [] });
});

// ---------- the report -------------------------------------------------------
describe("Audit report", () => {
  it("shows the score and band, with the compliance verdict kept separate", async () => {
    render(<Report params={{ id: "t1" }} />);
    expect(await screen.findByText("indiapost.gov.in")).toBeInTheDocument();
    expect(screen.getByText("68.1")).toBeInTheDocument();
    expect(screen.getByText("Band C")).toBeInTheDocument();
    // invariant #2: the legal verdict is its own statement, not a restyled band
    expect(screen.getByText(/partially compliant/)).toBeInTheDocument();
    // "automated only" rather than "automated evidence": the verdict panel's job
    // is to say what the evidence CANNOT support, which is the ceiling on it
    expect(screen.getByText(/automated only/i)).toBeInTheDocument();
  });

  it("says so when the guard-rail capped the band", async () => {
    auditReport.mockResolvedValue({ ...REPORT, guardrail_active: true, band: "C" });
    render(<Report params={{ id: "t1" }} />);
    expect(await screen.findByText(/guard-rail active/i)).toBeInTheDocument();
    // says what it costs (the cap) and how to clear it, not merely that it fired
    expect(screen.getByText(/band capped at C/i)).toBeInTheDocument();
    expect(screen.getByText(/lifts as soon as it is fixed/i)).toBeInTheDocument();
  });

  it("surfaces an integrity flag instead of silently capping the verdict", async () => {
    auditReport.mockResolvedValue({
      ...REPORT,
      integrity: {
        flagged: true,
        techniques: [{ key: "overlay", label: "Accessibility overlay widget detected" }],
        jump: { from: 40, to: 88 },
      },
    });
    render(<Report params={{ id: "t1" }} />);
    expect(await screen.findByText(/possible gaming detected/i)).toBeInTheDocument();
    expect(screen.getByText(/Accessibility overlay widget detected/)).toBeInTheDocument();
    // the unexplained jump is spelled out, so a reviewer can judge it
    expect(screen.getByText(/40 → 88/)).toBeInTheDocument();
  });

  it("counts findings by severity", async () => {
    auditReport.mockResolvedValue({
      ...REPORT,
      findings: [
        { severity: "critical", title: "A", category: "accessibility" },
        { severity: "critical", title: "B", category: "accessibility" },
        { severity: "low", title: "C", category: "content" },
      ],
    });
    render(<Report params={{ id: "t1" }} />);
    const critical = (await screen.findByText("Critical")).closest("div")!;
    expect(within(critical).getByText("2")).toBeInTheDocument();
  });

  it("explains itself when the report isn't ready rather than hanging", async () => {
    auditReport.mockImplementation(() => Promise.reject(new Error("Audit still running")));
    render(<Report params={{ id: "t1" }} />);
    expect(await screen.findByText(/Report not ready: Audit still running/)).toBeInTheDocument();
  });
});

// ---------- prioritised issues ----------------------------------------------
const FINDINGS = [
  { id: "f1", severity: "critical", title: "Buttons must have discernible text",
    category: "accessibility", guideline: "WCAG-4.1.2", remediation: "Add an aria-label." },
  { id: "f2", severity: "high", title: "Missing page language",
    category: "content", guideline: "WCAG-3.1.1" },
  { id: "f3", severity: "low", title: "Broken link", category: "content", guideline: "Content-QA" },
];

describe("Prioritised issues", () => {
  it("lists every finding with its fix guidance and severity", async () => {
    auditReport.mockResolvedValue({ ...REPORT, findings: FINDINGS });
    render(<Issues params={{ id: "t1" }} />);

    expect(await screen.findByText("Buttons must have discernible text")).toBeInTheDocument();
    expect(screen.getByText(/Add an aria-label/)).toBeInTheDocument();
    expect(screen.getByText("WCAG-4.1.2")).toBeInTheDocument();
    // the count now carries a line about fixing criticals first, so match the count
    expect(screen.getByText(/3 findings from the audit engine/)).toBeInTheDocument();
  });

  it("filters by severity, with counts on the buttons", async () => {
    auditReport.mockResolvedValue({ ...REPORT, findings: FINDINGS });
    render(<Issues params={{ id: "t1" }} />);
    await screen.findByText("Buttons must have discernible text");

    await userEvent.click(screen.getByRole("button", { name: /^critical 1$/ }));
    expect(screen.getByText("Buttons must have discernible text")).toBeInTheDocument();
    expect(screen.queryByText("Missing page language")).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /^All 3$/ }));
    expect(screen.getByText("Missing page language")).toBeInTheDocument();
  });

  it("shows an empty state for a filter with no matches", async () => {
    auditReport.mockResolvedValue({ ...REPORT, findings: [FINDINGS[2]] });
    render(<Issues params={{ id: "t1" }} />);
    await screen.findByText("Broken link");
    await userEvent.click(screen.getByRole("button", { name: /^critical 0$/ }));
    expect(screen.getByText(/No issues at this severity/)).toBeInTheDocument();
  });

  it("labels AI guidance as advisory and attaches it to the right finding", async () => {
    auditReport.mockResolvedValue({ ...REPORT, findings: FINDINGS });
    remediation.mockResolvedValue({
      ai_available: true,
      items: [{ id: "f1", remediation_ai: "Give the button an accessible name." }],
    });
    render(<Issues params={{ id: "t1" }} />);
    await screen.findByText("Buttons must have discernible text");

    await userEvent.click(screen.getByRole("button", { name: /Explain how to fix/i }));
    expect(await screen.findByText(/Give the button an accessible name/)).toBeInTheDocument();
    // invariant #1: advisory AI never touches the score, and must say so
    expect(screen.getByText(/never affects the score or verdict/i)).toBeInTheDocument();
    expect(remediation).toHaveBeenCalledWith("t1", true);
  });

  it("points at the setting when advisory AI is switched off", async () => {
    auditReport.mockResolvedValue({ ...REPORT, findings: FINDINGS });
    remediation.mockResolvedValue({ ai_available: false, items: [] });
    render(<Issues params={{ id: "t1" }} />);
    await screen.findByText("Buttons must have discernible text");

    await userEvent.click(screen.getByRole("button", { name: /Explain how to fix/i }));
    expect(await screen.findByText(/Advisory AI is off/)).toBeInTheDocument();
    expect(screen.getByText(/Configuration → Advisory AI/)).toBeInTheDocument();
  });
});
