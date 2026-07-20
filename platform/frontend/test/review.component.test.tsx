/** @vitest-environment jsdom */
import { describe, it, expect, vi, beforeEach } from "vitest";
import "@testing-library/jest-dom/vitest";
import { render, screen, waitFor, cleanup } from "@testing-library/react";
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
vi.mock("@/lib/api", () => ({
  api: {
    auditStatus: (...a: any[]) => auditStatus(...a),
    reviewAudit: (...a: any[]) => reviewAudit(...a),
  },
}));

import Review from "@/app/review/page";

describe("Review / certify flow", () => {
  beforeEach(() => {
    auditStatus.mockReset();
    reviewAudit.mockReset();
    window.history.pushState({}, "", "/review?audit=T1");
  });

  it("loads the audit's current verdict from the API", async () => {
    auditStatus.mockResolvedValue({
      domain: "digilocker.gov.in", compliance_status: "partially_compliant",
      confidence: "automated_only",
    });
    render(<Review />);
    expect(await screen.findByText("digilocker.gov.in")).toBeInTheDocument();
    // the verdict badge specifically (the phrase also appears in the intro copy)
    expect(screen.getByText("partially compliant", { selector: "span.badge" })).toBeInTheDocument();
    expect(auditStatus).toHaveBeenCalledWith("T1");
  });

  it("certifying calls the API and shows the new compliant verdict", async () => {
    auditStatus.mockResolvedValue({
      domain: "digilocker.gov.in", compliance_status: "partially_compliant",
      confidence: "automated_only",
    });
    reviewAudit.mockResolvedValue({
      compliance: { status: "compliant", reason: "expert-reviewed, no critical failures" },
    });
    render(<Review />);
    await screen.findByText("digilocker.gov.in");

    await userEvent.click(screen.getByRole("button", { name: /certify compliant/i }));

    await waitFor(() => expect(reviewAudit).toHaveBeenCalledWith("T1", true, undefined));
    expect(await screen.findByText(/new legal verdict/i)).toBeInTheDocument();
    expect(screen.getByText(/expert-reviewed, no critical failures/i)).toBeInTheDocument();
  });

  it("prompts to open from a report when no audit id is present", async () => {
    window.history.pushState({}, "", "/review");   // no ?audit=
    render(<Review />);
    expect(await screen.findByText(/open this from a completed audit report/i)).toBeInTheDocument();
    expect(auditStatus).not.toHaveBeenCalled();
  });
});
