/** @vitest-environment jsdom */
/**
 * AuditNav is the only thing making four audit views reachable, and it had no
 * test — a stale variable in it crashed the whole report page behind the error
 * boundary while `npm test` and `tsc` both stayed green. These lock the routes
 * it must expose and the active-state logic.
 */
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import "@testing-library/jest-dom/vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import React from "react";

afterEach(() => { cleanup(); auditStatus.mockReset(); });
// Block body, not a concise arrow: `() => auditStatus.mockResolvedValue(...)`
// returns the mock, and vitest treats a function returned from a hook as a
// teardown callback — so it called the mock, with no arguments, after every
// test, and "was it requested?" assertions saw a phantom call.
beforeEach(() => {
  auditStatus.mockResolvedValue({ domain: "indiapost.gov.in", created_at: "2026-08-18T09:30:00Z" });
});

let pathname = "/audits/abc/report";
vi.mock("next/navigation", () => ({ usePathname: () => pathname }));
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: any) => <a href={String(href)} {...rest}>{children}</a>,
}));

const auditStatus = vi.fn();
vi.mock("@/lib/api", () => ({ api: { auditStatus: (...a: any[]) => auditStatus(...a) } }));

import AuditNav from "@/components/AuditNav";

const EXPECTED = [
  ["Run status", "/audits/abc"],
  ["Report", "/audits/abc/report"],
  ["Prioritised issues", "/audits/abc/issues"],
  ["Remediation plan", "/audits/abc/remediation"],
  ["Documents", "/audits/abc/documents"],
  ["Compatibility", "/audits/abc/compatibility"],
  ["Trend & history", "/audits/abc/trends"],
  ["Compare", "/audits/abc/compare"],
];

describe("AuditNav", () => {
  it("renders every per-audit view with the id substituted into the path", () => {
    render(<AuditNav id="abc" />);
    for (const [label, href] of EXPECTED) {
      expect(screen.getByRole("link", { name: label })).toHaveAttribute("href", href);
    }
    // exactly these, plus the one route out of the audit — a new audit view
    // must be added here deliberately
    expect(screen.getByRole("link", { name: /Audit history/ })).toHaveAttribute("href", "/audits");
    expect(screen.getAllByRole("link")).toHaveLength(EXPECTED.length + 1);
  });

  it("marks only the current page active, for styling and for screen readers", () => {
    pathname = "/audits/abc/documents";
    render(<AuditNav id="abc" />);
    const current = screen.getByRole("link", { name: "Documents" });
    expect(current).toHaveAttribute("aria-current", "page");
    expect(current.className).toContain("active");

    const other = screen.getByRole("link", { name: "Report" });
    expect(other).not.toHaveAttribute("aria-current");
    expect(other.className).not.toContain("active");
  });

  it("marks nothing active on a path outside the strip", () => {
    pathname = "/audits/abc/evidence";   // a per-audit route with no tab
    render(<AuditNav id="abc" />);
    expect(screen.queryAllByRole("link", { current: "page" })).toHaveLength(0);
  });

  /* Six of these views head themselves after the VIEW — "Prioritised issues",
     "Remediation plan" — and named neither the site nor the run, so arriving
     from a bookmark you could read the findings without knowing whose they
     were. The bar is the only thing that answers it on those screens. */
  it("names the audit being viewed", async () => {
    pathname = "/audits/abc/issues";
    render(<AuditNav id="abc" />);
    expect(await screen.findByText("indiapost.gov.in")).toBeInTheDocument();
    expect(screen.getByText(/18 Aug 2026/)).toBeInTheDocument();
  });

  it("takes the run from its parent rather than re-requesting it", () => {
    pathname = "/audits/abc";
    render(<AuditNav id="abc" run={{ domain: "passed.gov.in" }} />);
    expect(screen.getByText("passed.gov.in")).toBeInTheDocument();
    expect(auditStatus).not.toHaveBeenCalled();
  });

  /* The tabs and the way back must not depend on the identity request. */
  it("still navigates when the run cannot be loaded", async () => {
    auditStatus.mockRejectedValue(new Error("offline"));
    pathname = "/audits/abc/report";
    render(<AuditNav id="abc" />);
    await waitFor(() => expect(auditStatus).toHaveBeenCalled());
    expect(screen.getByRole("link", { name: /Audit history/ })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Prioritised issues" })).toBeInTheDocument();
  });

  it("is a labelled landmark so it is announced as navigation", () => {
    pathname = "/audits/abc/report";
    render(<AuditNav id="abc" />);
    expect(screen.getByRole("navigation", { name: /audit views/i })).toBeInTheDocument();
  });
});
