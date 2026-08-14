/** @vitest-environment jsdom */
/**
 * /assessments, /library and /studio — the last routes with real behaviour.
 *
 * The manual-assurance ledger (G9/G11/G13) is advisory evidence that must never
 * look like it upgraded a verdict; the library used to seed itself with four
 * hardcoded guidelines and swallow API errors; Studio is a long-running
 * generation that polls.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import "@testing-library/jest-dom/vitest";
import { render, screen, waitFor, cleanup, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";

afterEach(() => { cleanup(); vi.useRealTimers(); });

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }), usePathname: () => "/" }));
vi.mock("@/components/AppShell", () => ({ default: ({ children }: any) => <div>{children}</div> }));
vi.mock("next/link", () => ({ default: ({ href, children }: any) => <a href={String(href)}>{children}</a> }));

const listAssessments = vi.fn();
const createAssessment = vi.fn();
const listDomains = vi.fn();
const me = vi.fn();
const guidelines = vi.fn();
const listStudio = vi.fn();
const studioCreate = vi.fn();
const studioGet = vi.fn();
const studioPreview = vi.fn();
vi.mock("@/lib/api", () => ({
  api: {
    listAssessments: (...a: any[]) => listAssessments(...a),
    createAssessment: (...a: any[]) => createAssessment(...a),
    listDomains: (...a: any[]) => listDomains(...a),
    me: (...a: any[]) => me(...a),
    guidelines: (...a: any[]) => guidelines(...a),
    listStudio: (...a: any[]) => listStudio(...a),
    studioCreate: (...a: any[]) => studioCreate(...a),
    studioGet: (...a: any[]) => studioGet(...a),
    studioPreview: (...a: any[]) => studioPreview(...a),
  },
}));

import Assessments from "@/app/assessments/page";
import Library from "@/app/library/page";
import Studio from "@/app/studio/page";

beforeEach(() => {
  [listAssessments, createAssessment, listDomains, me, guidelines,
   listStudio, studioCreate, studioGet, studioPreview].forEach((m) => m.mockReset());
  listAssessments.mockResolvedValue({ assessments: [] });
  createAssessment.mockResolvedValue({});
  listDomains.mockResolvedValue([]);
  me.mockResolvedValue({ role: "assessor" });
  guidelines.mockResolvedValue([]);
  listStudio.mockResolvedValue([]);
  studioCreate.mockResolvedValue({ id: "run-1" });
  studioGet.mockResolvedValue({ id: "run-1", status: "running", files: [] });
  studioPreview.mockResolvedValue("<html></html>");
});

// ---------- external assessments (G9/G11/G13) --------------------------------
describe("External assessments", () => {
  it("lists recorded assessments with agency and outcome", async () => {
    listAssessments.mockResolvedValue({ assessments: [
      { id: "e1", kind: "vapt", title: "Annual VAPT", agency: "CERT-In empanelled firm",
        outcome: "passed", assessed_on: "2026-06-01", domain_url: "posts.gov.in" },
    ]});
    render(<Assessments />);

    const row = (await screen.findByText("Annual VAPT")).closest("tr")!;
    expect(row).toHaveTextContent("CERT-In empanelled firm");
    expect(row).toHaveTextContent("passed");
  });

  it("records a new assessment and reloads the ledger", async () => {
    listDomains.mockResolvedValue([{ id: "d1", url: "posts.gov.in" }]);
    render(<Assessments />);
    // wait for the FORM, not for listAssessments: the form is gated on
    // api.me() -> canWrite, a different promise, so waiting on the list raced
    await userEvent.type(await screen.findByLabelText(/Title/i), "STQC certification");
    await userEvent.click(screen.getByRole("button", { name: /Record assessment/i }));

    await waitFor(() => expect(createAssessment).toHaveBeenCalledWith(
      expect.objectContaining({ title: "STQC certification" })));
    expect(listAssessments).toHaveBeenCalledTimes(2);      // reloaded after the write
  });

  it("hides the form from a role that cannot record evidence", async () => {
    me.mockResolvedValue({ role: "contributor" });
    render(<Assessments />);
    await waitFor(() => expect(me).toHaveBeenCalled());
    expect(screen.queryByRole("button", { name: /Record assessment/i })).not.toBeInTheDocument();
  });

  it("shows an empty ledger honestly", async () => {
    render(<Assessments />);
    expect(await screen.findByText(/No external assessments recorded yet/)).toBeInTheDocument();
  });

  it("surfaces a rejected submission", async () => {
    createAssessment.mockImplementation(() =>
      Promise.reject(new Error("Recording assessments requires an assessor role")));
    render(<Assessments />);
    // the button stays disabled until the title is at least 3 characters
    await userEvent.type(await screen.findByLabelText(/Title/i), "STQC");
    await userEvent.click(screen.getByRole("button", { name: /Record assessment/i }));
    expect(await screen.findByText(/requires an assessor role/)).toBeInTheDocument();
  });
});

// ---------- guideline library -------------------------------------------------
describe("Guideline library", () => {
  it("renders what the API returns", async () => {
    guidelines.mockResolvedValue([
      { id: "WCAG-1.4.3", family: "WCAG", title: "Colour contrast",
        plain_language: "Text needs ≥4.5:1 contrast.", good_example: "navy on white" },
    ]);
    render(<Library />);
    expect(await screen.findByText("Colour contrast")).toBeInTheDocument();
    expect(screen.getByText("WCAG-1.4.3")).toBeInTheDocument();
    expect(screen.getByText(/navy on white/)).toBeInTheDocument();
  });

  it("re-queries the API when a family is chosen", async () => {
    render(<Library />);
    await waitFor(() => expect(guidelines).toHaveBeenCalledWith(undefined));
    await userEvent.click(screen.getByRole("button", { name: "GIGW" }));
    await waitFor(() => expect(guidelines).toHaveBeenLastCalledWith("GIGW"));
  });

  it("shows nothing rather than fabricated guidelines when the library is empty", async () => {
    render(<Library />);
    // this page used to fall back to four hardcoded entries, indistinguishable
    // from the real seeded library
    expect(await screen.findByText(/No guidelines in this family yet/)).toBeInTheDocument();
    expect(screen.queryByText("Colour contrast (minimum)")).not.toBeInTheDocument();
    expect(screen.queryByText("Keyboard operable")).not.toBeInTheDocument();
  });

  it("says why it is empty when the call fails, instead of silently showing demo data", async () => {
    guidelines.mockImplementation(() => Promise.reject(new Error("Not authorised")));
    render(<Library />);
    expect(await screen.findByRole("alert")).toHaveTextContent(/Not authorised/);
    expect(screen.queryByText("Colour contrast (minimum)")).not.toBeInTheDocument();
  });
});

// ---------- GovUX Studio -------------------------------------------------------
describe("GovUX Studio", () => {
  it("submits the brief and starts polling the run", async () => {
    studioGet.mockResolvedValue({ id: "run-1", status: "running", files: [] });
    render(<Studio />);

    await userEvent.type(screen.getByLabelText("Organisation"), "Dept of Posts");
    await userEvent.type(screen.getByLabelText("Purpose"), "Citizen services portal");
    await userEvent.click(screen.getByRole("button", { name: /Generate pages/i }));

    await waitFor(() => expect(studioCreate).toHaveBeenCalledWith(
      expect.objectContaining({ department: "Dept of Posts", purpose: "Citizen services portal" })));
    // generation is long-running, so the screen polls the run rather than
    // blocking on one request
    await waitFor(() => expect(studioGet).toHaveBeenCalledWith("run-1"));
  });

  it("surfaces a refusal when Studio is not enabled for the tenant", async () => {
    studioCreate.mockImplementation(() =>
      Promise.reject(new Error("GovUX Studio is not enabled for your organisation")));
    render(<Studio />);
    await userEvent.type(screen.getByLabelText("Organisation"), "Dept");
    await userEvent.type(screen.getByLabelText("Purpose"), "Portal");
    await userEvent.click(screen.getByRole("button", { name: /Generate pages/i }));

    expect(await screen.findByText(/not enabled for your organisation/)).toBeInTheDocument();
  });
});
