/** @vitest-environment jsdom */
/**
 * /domains and /domains/new — registering a site and proving you own it is the
 * gate every audit depends on, and neither screen had a component test.
 *
 * The load-bearing logic here: verified vs pending drives BOTH the badge and
 * where the row's action link goes (audit vs verify), and the registration form
 * refuses non-government domains before the request is ever made. The gov-only
 * rule is invariant #4 — enforced in the API and by a DB CHECK too, so this
 * test pins the client's half of the same rule.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import "@testing-library/jest-dom/vitest";
import { render, screen, waitFor, cleanup, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";

afterEach(cleanup);

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
vi.mock("@/components/AppShell", () => ({ default: ({ children }: any) => <div>{children}</div> }));
vi.mock("next/link", () => ({ default: ({ href, children }: any) => <a href={String(href)}>{children}</a> }));

const listDomains = vi.fn();
const registerDomain = vi.fn();
const verifyDomain = vi.fn();
vi.mock("@/lib/api", () => ({
  api: {
    listDomains: (...a: any[]) => listDomains(...a),
    registerDomain: (...a: any[]) => registerDomain(...a),
    verifyDomain: (...a: any[]) => verifyDomain(...a),
  },
}));

import Domains from "@/app/domains/page";
import RegisterDomain from "@/app/domains/new/page";

beforeEach(() => {
  [push, listDomains, registerDomain, verifyDomain].forEach((m) => m.mockReset());
  listDomains.mockResolvedValue([]);
  verifyDomain.mockResolvedValue({ verify_status: "verified" });
  // several tests drive /domains/new; reset the query between them
  window.history.pushState({}, "", "/domains/new");
});

// ---------- the list --------------------------------------------------------
describe("My domains", () => {
  it("routes a verified row to an audit and a pending row to verification", async () => {
    listDomains.mockResolvedValue([
      { id: "d-ok", url: "indiapost.gov.in", verify_status: "verified", category: "transactional",
        latest_score: 68.1, latest_band: "C", last_audited_at: "2026-08-01T00:00:00Z" },
      { id: "d-new", url: "draft.nic.in", verify_status: "pending", category: null,
        latest_score: null, latest_band: null, last_audited_at: null },
    ]);
    render(<Domains />);

    const okRow = (await screen.findByText("indiapost.gov.in")).closest("tr")!;
    expect(within(okRow).getByText("Verified")).toBeInTheDocument();
    expect(within(okRow).getByText("68.1")).toBeInTheDocument();
    expect(within(okRow).getByText("C")).toBeInTheDocument();
    // a verified domain can be audited, carrying its id so /audits/new preselects it
    expect(within(okRow).getByRole("link", { name: /Audit/ }))
      .toHaveAttribute("href", "/audits/new?domain=d-ok");

    const pendingRow = screen.getByText("draft.nic.in").closest("tr")!;
    expect(within(pendingRow).getByText("Pending")).toBeInTheDocument();
    // never a score for something never audited — "Not audited", not a zero
    expect(within(pendingRow).getByText("Not audited")).toBeInTheDocument();
    // must carry the id: a bare /domains/new is a blank form, and re-registering
    // an existing domain 409s — which used to strand every pending domain
    expect(within(pendingRow).getByRole("link", { name: /Verify/ }))
      .toHaveAttribute("href", "/domains/new?domain=d-new");
  });

  it("shows an empty state that leads somewhere useful", async () => {
    render(<Domains />);
    expect(await screen.findByText(/No domains yet/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Register your first domain/ }))
      .toHaveAttribute("href", "/domains/new");
  });

  it("surfaces a load failure rather than an empty table", async () => {
    listDomains.mockImplementation(() => Promise.reject(new Error("Not authorised")));
    render(<Domains />);
    expect(await screen.findByRole("alert")).toHaveTextContent(/Not authorised/);
  });
});

// ---------- registration + verification ------------------------------------
describe("Register & verify a domain", () => {
  it("refuses a non-government domain without calling the API", async () => {
    render(<RegisterDomain />);
    await userEvent.type(screen.getByRole("textbox"), "example.com");
    await userEvent.click(screen.getByRole("button", { name: /Register domain/i }));

    expect(await screen.findByText(/Only .gov.in \/ .nic.in domains are accepted/)).toBeInTheDocument();
    expect(registerDomain).not.toHaveBeenCalled();   // invariant #4, client side
  });

  it.each(["indiapost.gov.in", "tracking.indiapost.nic.in", "  posts.gov.in  "])(
    "accepts %s and shows the DNS TXT token to publish", async (input) => {
      registerDomain.mockResolvedValue({ id: "d-1", verify_token: "govux-verify=abc123" });
      render(<RegisterDomain />);
      await userEvent.type(screen.getByRole("textbox"), input);
      await userEvent.click(screen.getByRole("button", { name: /Register domain/i }));

      await waitFor(() => expect(registerDomain).toHaveBeenCalledWith(input.trim()));
      expect(await screen.findByText("govux-verify=abc123")).toBeInTheDocument();
      expect(screen.getByText(/Not yet verified/)).toBeInTheDocument();
    });

  it("returns to the list once verification succeeds", async () => {
    registerDomain.mockResolvedValue({ id: "d-1", verify_token: "govux-verify=abc123" });
    verifyDomain.mockResolvedValue({ status: "verified" });
    render(<RegisterDomain />);
    await userEvent.type(screen.getByRole("textbox"), "posts.gov.in");
    await userEvent.click(screen.getByRole("button", { name: /Register domain/i }));
    await screen.findByText("govux-verify=abc123");

    await userEvent.click(screen.getByRole("button", { name: /Verify now/i }));
    await waitFor(() => expect(verifyDomain).toHaveBeenCalledWith("d-1", "dns_txt"));
    expect(push).toHaveBeenCalledWith("/domains");
  });

  it("keeps the token on screen when verification fails, so it can be retried", async () => {
    registerDomain.mockResolvedValue({ id: "d-1", verify_token: "govux-verify=abc123" });
    verifyDomain.mockImplementation(() =>
      Promise.reject(new Error("TXT record not found — DNS may still be propagating")));
    render(<RegisterDomain />);
    await userEvent.type(screen.getByRole("textbox"), "posts.gov.in");
    await userEvent.click(screen.getByRole("button", { name: /Register domain/i }));
    await screen.findByText("govux-verify=abc123");

    await userEvent.click(screen.getByRole("button", { name: /Verify now/i }));
    expect(await screen.findByText(/TXT record not found/)).toBeInTheDocument();
    expect(screen.getByText("govux-verify=abc123")).toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();
  });

  it("resumes verification for an already-registered domain via ?domain=", async () => {
    // The dead end this fixes: the DNS token only ever lived in this page's
    // state, so leaving while DNS propagated lost it — and /domains sent you
    // back to a blank form whose Register button then 409s.
    window.history.pushState({}, "", "/domains/new?domain=d-pending");
    listDomains.mockResolvedValue([
      { id: "d-pending", url: "waiting.gov.in", verify_status: "pending",
        verify_token: "govux-verify=deadbeef" },
    ]);
    render(<RegisterDomain />);

    // straight to step 2, with the original token recovered — no re-registration
    expect(await screen.findByText("govux-verify=deadbeef")).toBeInTheDocument();
    expect(screen.getByText("waiting.gov.in")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Register domain/i })).not.toBeInTheDocument();
    expect(registerDomain).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole("button", { name: /Verify now/i }));
    await waitFor(() => expect(verifyDomain).toHaveBeenCalledWith("d-pending", "dns_txt"));
  });

  it("defaults to DNS TXT and sends that method", async () => {
    registerDomain.mockResolvedValue({ id: "d-1", verify_token: "govux-verify=abc123" });
    render(<RegisterDomain />);
    await userEvent.type(screen.getByRole("textbox"), "posts.gov.in");
    await userEvent.click(screen.getByRole("button", { name: /Register domain/i }));
    await screen.findByText("govux-verify=abc123");

    expect(screen.getByRole("radio", { name: /DNS TXT record/i })).toBeChecked();
    await userEvent.click(screen.getByRole("button", { name: /Verify now/i }));
    await waitFor(() => expect(verifyDomain).toHaveBeenCalledWith("d-1", "dns_txt"));
  });

  it("offers the metafile proof for teams who do not control DNS", async () => {
    // the API has always supported file_upload; the UI hard-coded dns_txt, so
    // anyone whose DNS zone sits centrally with NIC had no route through
    registerDomain.mockResolvedValue({ id: "d-1", verify_token: "govux-verify=abc123" });
    render(<RegisterDomain />);
    await userEvent.type(screen.getByRole("textbox"), "posts.gov.in");
    await userEvent.click(screen.getByRole("button", { name: /Register domain/i }));
    await screen.findByText("govux-verify=abc123");

    await userEvent.click(screen.getByRole("radio", { name: /File on your website/i }));
    // instructions swap to the well-known path, for the domain being verified
    expect(screen.getByText(/\/\.well-known\/govux-verify\.txt/)).toBeInTheDocument();
    expect(screen.queryByText(/Add this TXT record/)).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /Verify now/i }));
    await waitFor(() => expect(verifyDomain).toHaveBeenCalledWith("d-1", "file_upload"));
  });

  it("explains itself when the resumed domain is gone", async () => {
    window.history.pushState({}, "", "/domains/new?domain=d-missing");
    listDomains.mockResolvedValue([]);
    render(<RegisterDomain />);
    expect(await screen.findByText(/no longer on your account/i)).toBeInTheDocument();
  });

  it("reports a duplicate registration from the server", async () => {
    registerDomain.mockImplementation(() =>
      Promise.reject(new Error("Domain already registered")));
    render(<RegisterDomain />);
    await userEvent.type(screen.getByRole("textbox"), "posts.gov.in");
    await userEvent.click(screen.getByRole("button", { name: /Register domain/i }));
    expect(await screen.findByText(/Domain already registered/)).toBeInTheDocument();
    // still on step 1 — no token to show
    expect(screen.getByRole("button", { name: /Register domain/i })).toBeInTheDocument();
  });
});
