/** @vitest-environment jsdom */
/**
 * The remaining per-audit views: compatibility, documents, remediation, trends.
 *
 * All four were unreachable until the AuditNav strip was added, and two of them
 * (documents = G3, remediation = G5) are BRD gap-closure deliverables. They are
 * read-only, so these tests cover the honest-empty-state contract each one has:
 * "nothing was captured" must never render as "everything passed".
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import "@testing-library/jest-dom/vitest";
import { render, screen, cleanup, within } from "@testing-library/react";
import React from "react";

afterEach(cleanup);

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }), usePathname: () => "/" }));
vi.mock("@/components/AppShell", () => ({ default: ({ children }: any) => <div>{children}</div> }));
vi.mock("@/components/AuditNav", () => ({ default: () => <nav aria-label="Audit views" /> }));
vi.mock("next/link", () => ({ default: ({ href, children }: any) => <a href={String(href)}>{children}</a> }));

const auditReport = vi.fn();
const auditDocuments = vi.fn();
const remediation = vi.fn();
const auditTrend = vi.fn();
vi.mock("@/lib/api", () => ({
  api: {
    auditReport: (...a: any[]) => auditReport(...a),
    auditDocuments: (...a: any[]) => auditDocuments(...a),
    remediation: (...a: any[]) => remediation(...a),
    auditTrend: (...a: any[]) => auditTrend(...a),
  },
}));

import Compatibility from "@/app/audits/[id]/compatibility/page";
import Documents from "@/app/audits/[id]/documents/page";
import Remediation from "@/app/audits/[id]/remediation/page";
import Trends from "@/app/audits/[id]/trends/page";

beforeEach(() => {
  [auditReport, auditDocuments, remediation, auditTrend].forEach((m) => m.mockReset());
  auditReport.mockResolvedValue({ browsers: [] });
  auditDocuments.mockResolvedValue({ documents: [] });
  remediation.mockResolvedValue({ items: [] });
  auditTrend.mockResolvedValue({ history: [] });
});

// ---------- cross-browser ----------------------------------------------------
describe("Responsiveness & compatibility", () => {
  it("shows one row per engine with its failures", async () => {
    auditReport.mockResolvedValue({ browsers: [
      { engine: "chromium", loaded: true, overflow: false, broken_images: 0, js_errors: 0 },
      { engine: "webkit", loaded: true, overflow: true, broken_images: 2, js_errors: 1 },
      { engine: "firefox", loaded: false, overflow: false, broken_images: 0, js_errors: 0 },
    ]});
    render(<Compatibility params={{ id: "t1" }} />);

    expect(await screen.findByText("chromium")).toBeInTheDocument();
    // the point of the matrix: a browser-specific failure is visible per engine
    const webkit = screen.getByText("webkit").closest("tr")!;
    expect(within(webkit).getByText(/2/)).toBeInTheDocument();
    expect(screen.getByText("firefox").closest("tr")).toBeInTheDocument();
  });

  it("says nothing was captured rather than implying every browser passed", async () => {
    render(<Compatibility params={{ id: "t1" }} />);
    expect(await screen.findByText(/No cross-browser results captured for this audit/))
      .toBeInTheDocument();
  });
});

// ---------- document accessibility (G3) --------------------------------------
describe("Document accessibility", () => {
  it("lists each document with its PDF/UA checks and score", async () => {
    auditDocuments.mockResolvedValue({ documents: [
      { url: "https://posts.gov.in/form.pdf", type: "pdf", pages: 4, tagged: false,
        has_title: true, has_lang: false, score: 42, issues: 3 },
    ]});
    render(<Documents params={{ id: "t1" }} />);

    const link = await screen.findByRole("link", { name: /form\.pdf/ });
    expect(link).toHaveAttribute("href", "https://posts.gov.in/form.pdf");
    // opens off-site, so it must not leak the referrer or expose window.opener
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
    const row = link.closest("tr")!;
    expect(within(row).getByText("42")).toBeInTheDocument();
    expect(within(row).getByText("3")).toBeInTheDocument();
  });

  it("distinguishes 'no documents found' from 'documents all passed'", async () => {
    render(<Documents params={{ id: "t1" }} />);
    expect(await screen.findByText(/No documents were discovered in this audit/))
      .toBeInTheDocument();
  });
});

// ---------- remediation plan (G5) --------------------------------------------
describe("Remediation plan", () => {
  it("ranks fixes and shows the guidance and priority for each", async () => {
    remediation.mockResolvedValue({ items: [
      { title: "Buttons must have discernible text", severity: "critical",
        category: "accessibility", remediation: "Give each button an accessible name.",
        code_hint: '<button aria-label="Search">', priority: 1 },
      { title: "Colour contrast too low", severity: "high", category: "accessibility",
        remediation: "Raise contrast to 4.5:1.", priority: 2 },
    ]});
    render(<Remediation params={{ id: "t1" }} />);

    expect(await screen.findByText("Buttons must have discernible text")).toBeInTheDocument();
    expect(screen.getByText("Give each button an accessible name.")).toBeInTheDocument();
    expect(screen.getByText('<button aria-label="Search">')).toBeInTheDocument();
    // ordered by impact × effort, numbered so the plan reads as a plan
    expect(screen.getByText("#1")).toBeInTheDocument();
    expect(screen.getByText("#2")).toBeInTheDocument();
    expect(screen.getByText("P1")).toBeInTheDocument();
  });

  it("says there is nothing to fix rather than rendering a blank plan", async () => {
    render(<Remediation params={{ id: "t1" }} />);
    expect(await screen.findByText(/No findings to remediate/)).toBeInTheDocument();
  });

  it("surfaces a load failure", async () => {
    remediation.mockImplementation(() => Promise.reject(new Error("Report not ready")));
    render(<Remediation params={{ id: "t1" }} />);
    expect(await screen.findByRole("alert")).toHaveTextContent(/Report not ready/);
  });
});

// ---------- score trend ------------------------------------------------------
describe("Score trend & history", () => {
  it("lists every dated snapshot for the domain", async () => {
    auditTrend.mockResolvedValue({ history: [
      { task_id: "a2", date: "2026-08-11T00:00:00Z", score: 68.1, band: "C" },
      { task_id: "a1", date: "2026-07-21T00:00:00Z", score: 61.0, band: "C" },
    ]});
    render(<Trends params={{ id: "t1" }} />);

    // the score also appears in the chart above, so scope to the history rows.
    // The delta is computed against the NEXT row (the list is newest-first) and
    // the oldest run is labelled a baseline rather than a fake +0.
    const newest = (await screen.findByText("+7")).closest("tr")!;
    expect(within(newest).getByText("68")).toBeInTheDocument();   // rounded

    const oldest = screen.getByText("baseline").closest("tr")!;
    expect(within(oldest).getByText("61")).toBeInTheDocument();
  });

  it("invites a first audit rather than drawing an empty chart", async () => {
    render(<Trends params={{ id: "t1" }} />);
    expect(await screen.findByText(/run one to start the trend/i)).toBeInTheDocument();
  });
});
