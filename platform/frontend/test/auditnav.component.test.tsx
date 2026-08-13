/** @vitest-environment jsdom */
/**
 * AuditNav is the only thing making four audit views reachable, and it had no
 * test — a stale variable in it crashed the whole report page behind the error
 * boundary while `npm test` and `tsc` both stayed green. These lock the routes
 * it must expose and the active-state logic.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import "@testing-library/jest-dom/vitest";
import { render, screen, cleanup } from "@testing-library/react";
import React from "react";

afterEach(cleanup);

let pathname = "/audits/abc/report";
vi.mock("next/navigation", () => ({ usePathname: () => pathname }));
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: any) => <a href={String(href)} {...rest}>{children}</a>,
}));

import AuditNav from "@/components/AuditNav";

const EXPECTED = [
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
    // exactly these — a new audit view must be added here deliberately
    expect(screen.getAllByRole("link")).toHaveLength(EXPECTED.length);
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
    pathname = "/audits/abc";           // the in-progress status page
    render(<AuditNav id="abc" />);
    expect(screen.queryAllByRole("link", { current: "page" })).toHaveLength(0);
  });

  it("is a labelled landmark so it is announced as navigation", () => {
    pathname = "/audits/abc/report";
    render(<AuditNav id="abc" />);
    expect(screen.getByRole("navigation", { name: /audit views/i })).toBeInTheDocument();
  });
});
