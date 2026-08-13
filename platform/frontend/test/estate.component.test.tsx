/** @vitest-environment jsdom */
/**
 * /admin/bulk-scan and /admin/discovery — the last two screens that submit work
 * rather than just render an API response.
 *
 * Bulk scan previously rendered a hardcoded progress bar ("38% · 517 / 1,360
 * done · ~2h 10m left") with no data source behind it — there is no
 * batch-progress endpoint at all. These tests pin the honest replacement, so a
 * fabricated one can't quietly come back.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import "@testing-library/jest-dom/vitest";
import { render, screen, waitFor, cleanup, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";

afterEach(cleanup);

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }), usePathname: () => "/" }));
vi.mock("@/components/AppShell", () => ({ default: ({ children }: any) => <div>{children}</div> }));
vi.mock("next/link", () => ({ default: ({ href, children }: any) => <a href={String(href)}>{children}</a> }));

const bulkScan = vi.fn();
const bulkScanStatus = vi.fn();
const discovered = vi.fn();
const discoveryScan = vi.fn();
vi.mock("@/lib/api", () => ({
  api: {
    bulkScan: (...a: any[]) => bulkScan(...a),
    bulkScanStatus: (...a: any[]) => bulkScanStatus(...a),
    discovered: (...a: any[]) => discovered(...a),
    discoveryScan: (...a: any[]) => discoveryScan(...a),
  },
}));

import BulkScan from "@/app/admin/bulk-scan/page";
import Discovery from "@/app/admin/discovery/page";

beforeEach(() => {
  [bulkScan, bulkScanStatus, discovered, discoveryScan].forEach((m) => m.mockReset());
  bulkScan.mockResolvedValue({ batch_id: "b1c2d3e4-aaaa-bbbb-cccc-dddddddddddd", enqueued: 42 });
  bulkScanStatus.mockResolvedValue({
    batch_id: "b1c2d3e4-aaaa-bbbb-cccc-dddddddddddd", total: 42, done: 0, running: 0,
    queued: 42, scored: 0, no_result: 0, percent: 0, finished: false, by_status: { queued: 42 },
  });
  discovered.mockResolvedValue([]);
  discoveryScan.mockResolvedValue({ total_found: 0, new: 0 });
});

// ---------- bulk scan --------------------------------------------------------
describe("Bulk scan", () => {
  it("enqueues the selected scope and reports the real batch result", async () => {
    render(<BulkScan />);
    await userEvent.selectOptions(screen.getByLabelText("Scope"), "all");
    await userEvent.click(screen.getByRole("button", { name: /Enqueue bulk scan/i }));

    await waitFor(() => expect(bulkScan).toHaveBeenCalledWith("all"));
    expect(await screen.findByText(/b1c2d3e4/)).toBeInTheDocument();
    expect(screen.getByText("42")).toBeInTheDocument();
  });

  it("defaults to never-audited domains", async () => {
    render(<BulkScan />);
    expect(screen.getByLabelText("Scope")).toHaveValue("never_audited");
    await userEvent.click(screen.getByRole("button", { name: /Enqueue bulk scan/i }));
    await waitFor(() => expect(bulkScan).toHaveBeenCalledWith("never_audited"));
  });

  it("draws progress from the batch endpoint, never from hardcoded numbers", async () => {
    bulkScanStatus.mockResolvedValue({
      total: 42, done: 17, running: 3, queued: 22, scored: 15, no_result: 2,
      percent: 40, finished: false, by_status: {},
    });
    render(<BulkScan />);
    await userEvent.click(screen.getByRole("button", { name: /Enqueue bulk scan/i }));

    await waitFor(() => expect(bulkScanStatus)
      .toHaveBeenCalledWith("b1c2d3e4-aaaa-bbbb-cccc-dddddddddddd"));
    const bar = await screen.findByRole("progressbar");
    expect(bar).toHaveAttribute("aria-valuenow", "40");
    expect(within(bar).getByText("40%")).toBeInTheDocument();
    expect(screen.getByText("17 / 42 done")).toBeInTheDocument();
    expect(screen.getByText("3 running · 22 queued")).toBeInTheDocument();

    // the previous hardcoded bar and its invented numbers must never return
    expect(screen.queryByText(/517/)).not.toBeInTheDocument();
    expect(screen.queryByText(/2h 10m/)).not.toBeInTheDocument();
    expect(screen.queryByText(/38%/)).not.toBeInTheDocument();
  });

  it("splits scored from no-result once the batch finishes", async () => {
    bulkScanStatus.mockResolvedValue({
      total: 10, done: 10, running: 0, queued: 0, scored: 8, no_result: 2,
      percent: 100, finished: true, by_status: {},
    });
    render(<BulkScan />);
    await userEvent.click(screen.getByRole("button", { name: /Enqueue bulk scan/i }));

    // "insufficient_evidence" is a deliberate refusal to score, not a failure
    expect(await screen.findByText("8 scored · 2 without a score")).toBeInTheDocument();
    expect(await screen.findByRole("progressbar")).toHaveAttribute("aria-valuenow", "100");
  });

  it("promises no completion time it cannot know", async () => {
    render(<BulkScan />);
    await userEvent.click(screen.getByRole("button", { name: /Enqueue bulk scan/i }));
    await screen.findByRole("progressbar");
    // audit duration depends on crawl depth and the target's own speed, so an
    // ETA would be a guess dressed as a measurement
    expect(screen.queryByText(/left|remaining|ETA/i)).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Audit History/i })).toHaveAttribute("href", "/audits");
  });

  it("shows no progress bar before a batch exists", async () => {
    render(<BulkScan />);
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
  });

  it("shows an inline error rather than a browser alert", async () => {
    const alertSpy = vi.spyOn(window, "alert").mockImplementation(() => {});
    bulkScan.mockImplementation(() =>
      Promise.reject(new Error("Queue depth exceeded — try again later")));
    render(<BulkScan />);
    await userEvent.click(screen.getByRole("button", { name: /Enqueue bulk scan/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/Queue depth exceeded/);
    expect(alertSpy).not.toHaveBeenCalled();
    alertSpy.mockRestore();
  });

  it("sends CSV users to the import screen instead of a dead button", async () => {
    render(<BulkScan />);
    // the old page had an inert "📄 Upload CSV" button next to a hardcoded-active
    // "Auto-discover register", which read as a working toggle
    expect(screen.queryByRole("button", { name: /Upload CSV/i })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Register Import/i }))
      .toHaveAttribute("href", "/admin/registry");
  });

  it("says nothing about a batch before one is submitted", async () => {
    render(<BulkScan />);
    expect(screen.getByText(/Submit a bulk scan to enqueue the estate/)).toBeInTheDocument();
    // the static "Enqueued to Redis Streams" note and the button both contain
    // "enqueue", so match the batch-result phrasing specifically
    expect(screen.queryByText(/domain\(s\) enqueued/)).not.toBeInTheDocument();
  });
});

// ---------- estate discovery -------------------------------------------------
describe("Estate auto-discovery", () => {
  it("lists hosts already discovered, with source and import state", async () => {
    discovered.mockResolvedValue([
      { url: "newsite.gov.in", source: "sitemap", imported: false, discovered_at: "2026-08-12T09:00:00Z" },
      { url: "known.nic.in", source: "robots", imported: true, discovered_at: "2026-08-01T09:00:00Z" },
    ]);
    render(<Discovery />);

    const row = (await screen.findByText("newsite.gov.in")).closest("tr")!;
    expect(within(row).getByText("sitemap")).toBeInTheDocument();
    expect(within(row).getByText("no")).toBeInTheDocument();
    expect(within(row).getByText("2026-08-12")).toBeInTheDocument();

    const imported = screen.getByText("known.nic.in").closest("tr")!;
    expect(within(imported).getByText("yes")).toBeInTheDocument();
  });

  it("submits the pasted source and reports what was found", async () => {
    discoveryScan.mockResolvedValue({ total_found: 7, new: 3 });
    render(<Discovery />);
    await waitFor(() => expect(discovered).toHaveBeenCalled());

    const body = screen.getByPlaceholderText(/Sitemap:/);
    await userEvent.type(body, "Sitemap: https://x.gov.in/sitemap.xml");
    await userEvent.click(screen.getByRole("button", { name: /Scan for gov domains/i }));

    await waitFor(() => expect(discoveryScan).toHaveBeenCalledWith([
      { seed: "https://www.india.gov.in/robots.txt",
        body: "Sitemap: https://x.gov.in/sitemap.xml", kind: "auto" },
    ]));
    expect(await screen.findByText(/Found 7 host\(s\), 3 new\./)).toBeInTheDocument();
  });

  it("refreshes the discovered list after a scan, so new hosts appear", async () => {
    discovered.mockResolvedValueOnce([])
      .mockResolvedValue([{ url: "fresh.gov.in", source: "sitemap", imported: false,
                            discovered_at: "2026-08-12T00:00:00Z" }]);
    discoveryScan.mockResolvedValue({ total_found: 1, new: 1 });
    render(<Discovery />);
    expect(await screen.findByText(/Nothing discovered yet/)).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /Scan for gov domains/i }));
    expect(await screen.findByText("fresh.gov.in")).toBeInTheDocument();
  });

  it("carries an edited seed URL through to the request", async () => {
    render(<Discovery />);
    await waitFor(() => expect(discovered).toHaveBeenCalled());

    const seed = screen.getByDisplayValue("https://www.india.gov.in/robots.txt");
    await userEvent.clear(seed);
    await userEvent.type(seed, "https://mygov.gov.in/robots.txt");
    await userEvent.click(screen.getByRole("button", { name: /Scan for gov domains/i }));

    await waitFor(() => expect(discoveryScan).toHaveBeenCalledWith([
      expect.objectContaining({ seed: "https://mygov.gov.in/robots.txt" }),
    ]));
  });

  it("surfaces a failure from either call", async () => {
    discovered.mockImplementation(() => Promise.reject(new Error("Not authorised")));
    render(<Discovery />);
    expect(await screen.findByText(/Not authorised/)).toBeInTheDocument();
  });
});
