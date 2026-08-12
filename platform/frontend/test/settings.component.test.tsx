/** @vitest-environment jsdom */
/**
 * /settings is the most interactive screen in the app — organisation details,
 * team roles, invitations, device revocation and DPDP erasure all live here —
 * and it had no component test at all.
 *
 * The focus is the logic that is security-adjacent or destructive: the three
 * role gates (edit org / manage team / grant steward), the rule that nobody
 * edits their own role, and the confirm() guards in front of anything
 * irreversible. Those are the parts where a silent regression matters.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import "@testing-library/jest-dom/vitest";
import { render, screen, waitFor, cleanup, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/components/AppShell", () => ({ default: ({ children }: any) => <div>{children}</div> }));
vi.mock("next/link", () => ({ default: ({ href, children }: any) => <a href={String(href)}>{children}</a> }));

const me = vi.fn();
const updateOrganisation = vi.fn();
const listTeam = vi.fn();
const updateTeamRole = vi.fn();
const listInvitations = vi.fn();
const createInvitation = vi.fn();
const revokeInvitation = vi.fn();
const devices = vi.fn();
const revokeDevice = vi.fn();
const exportMyData = vi.fn();
const eraseMyData = vi.fn();
const setToken = vi.fn();

vi.mock("@/lib/api", () => ({
  api: {
    me: (...a: any[]) => me(...a),
    updateOrganisation: (...a: any[]) => updateOrganisation(...a),
    listTeam: (...a: any[]) => listTeam(...a),
    updateTeamRole: (...a: any[]) => updateTeamRole(...a),
    listInvitations: (...a: any[]) => listInvitations(...a),
    createInvitation: (...a: any[]) => createInvitation(...a),
    revokeInvitation: (...a: any[]) => revokeInvitation(...a),
    devices: (...a: any[]) => devices(...a),
    revokeDevice: (...a: any[]) => revokeDevice(...a),
    exportMyData: (...a: any[]) => exportMyData(...a),
    eraseMyData: (...a: any[]) => eraseMyData(...a),
  },
  setToken: (...a: any[]) => setToken(...a),
}));

import Settings from "@/app/settings/page";

const TEAM = [
  { id: "u-me", email: "me@gov.in", display_name: "Me", role: "owner", is_you: true },
  { id: "u-con", email: "con@gov.in", display_name: "Con", role: "contributor", is_you: false },
  { id: "u-pa", email: "pa@gov.in", display_name: "PA", role: "programme_admin", is_you: false },
];

/** Mount as `role` and wait for first paint. Only `me` is (re)stubbed here — every
 *  other default lives in beforeEach, so a test can set its own fixtures before
 *  calling this without them being clobbered on the way in. */
async function mountAs(role: string) {
  me.mockResolvedValue({ role, org_name: "Dept of Posts", org_state_code: "KA" });
  render(<Settings />);
  await screen.findByDisplayValue("Dept of Posts");
}

beforeEach(() => {
  [me, updateOrganisation, listTeam, updateTeamRole, listInvitations, createInvitation,
   revokeInvitation, devices, revokeDevice, exportMyData, eraseMyData, setToken]
    .forEach((m) => m.mockReset());
  // benign defaults — mockReset leaves a fn returning undefined, which these
  // pages would then call .then() on
  me.mockResolvedValue({ role: "owner", org_name: "Dept of Posts", org_state_code: "KA" });
  listTeam.mockResolvedValue(TEAM);
  listInvitations.mockResolvedValue([]);
  devices.mockResolvedValue([]);
  updateOrganisation.mockResolvedValue({});
  updateTeamRole.mockResolvedValue({});
  createInvitation.mockResolvedValue({});
  revokeInvitation.mockResolvedValue(null);
  revokeDevice.mockResolvedValue(null);
});

// ---------- organisation ----------------------------------------------------
describe("Organisation card", () => {
  it("loads the current name and state, and saves both", async () => {
    await mountAs("owner");
    expect(screen.getByLabelText("Name")).toHaveValue("Dept of Posts");
    expect(screen.getByLabelText("State / UT")).toHaveValue("KA");

    await userEvent.clear(screen.getByLabelText("Name"));
    await userEvent.type(screen.getByLabelText("Name"), "Dept of Telecom");
    await userEvent.selectOptions(screen.getByLabelText("State / UT"), "DL");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(updateOrganisation)
      .toHaveBeenCalledWith({ name: "Dept of Telecom", state_code: "DL" }));
    expect(await screen.findByText(/✓ Saved/)).toBeInTheDocument();
  });

  it("hides Save and disables the fields for a role that cannot edit", async () => {
    await mountAs("contributor");
    expect(screen.queryByRole("button", { name: "Save" })).not.toBeInTheDocument();
    expect(screen.getByLabelText("Name")).toBeDisabled();
    expect(screen.getByLabelText("State / UT")).toBeDisabled();
    expect(screen.getByText(/Only an owner or admin can edit organisation settings/i))
      .toBeInTheDocument();
  });

  it("surfaces a save failure instead of claiming success", async () => {
    await mountAs("owner");
    updateOrganisation.mockImplementation(() => Promise.reject(new Error("State code invalid")));
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByText(/✗ State code invalid/)).toBeInTheDocument();
  });
});

// ---------- team roles ------------------------------------------------------
describe("Team roles", () => {
  it("an owner can change a normal member but never their own role", async () => {
    await mountAs("owner");
    const rows = screen.getAllByRole("row");
    const mine = rows.find((r) => within(r).queryByText("you"))!;
    // own row shows a static badge, not a control
    expect(within(mine).queryByRole("combobox")).not.toBeInTheDocument();

    const conRow = rows.find((r) => within(r).queryByText("Con"))!;
    await userEvent.selectOptions(within(conRow).getByRole("combobox"), "assessor");
    await waitFor(() => expect(updateTeamRole).toHaveBeenCalledWith("u-con", "assessor"));
    // optimistic update, so the row reflects the new role without a refetch
    expect(within(conRow).getByRole("combobox")).toHaveValue("assessor");
  });

  it("an owner cannot grant steward roles, nor edit an existing steward", async () => {
    await mountAs("owner");
    const conRow = screen.getAllByRole("row").find((r) => within(r).queryByText("Con"))!;
    const options = within(conRow).getAllByRole("option").map((o) => (o as HTMLOptionElement).value);
    expect(options).not.toContain("programme_admin");
    expect(options).not.toContain("super_admin");

    // a member who already holds a steward role is read-only to an owner
    const paRow = screen.getAllByRole("row").find((r) => within(r).queryByText("PA"))!;
    expect(within(paRow).queryByRole("combobox")).not.toBeInTheDocument();
  });

  it("a super_admin can grant steward roles", async () => {
    await mountAs("super_admin");
    const conRow = screen.getAllByRole("row").find((r) => within(r).queryByText("Con"))!;
    const options = within(conRow).getAllByRole("option").map((o) => (o as HTMLOptionElement).value);
    expect(options).toContain("programme_admin");
    expect(options).toContain("super_admin");
  });

  it("a contributor gets no controls at all", async () => {
    await mountAs("contributor");
    const conRow = screen.getAllByRole("row").find((r) => within(r).queryByText("Con"))!;
    expect(within(conRow).queryByRole("combobox")).not.toBeInTheDocument();
    expect(screen.getByText(/Only an owner or admin can change team roles/i)).toBeInTheDocument();
  });
});

// ---------- invitations -----------------------------------------------------
describe("Invitations", () => {
  it("normalises the address before sending and clears the field", async () => {
    await mountAs("owner");
    const field = screen.getByLabelText(/Colleague's government email/i);
    await userEvent.type(field, "  New.Person@Ministry.GOV.IN  ");
    await userEvent.click(screen.getByRole("button", { name: /Send invitation/i }));

    await waitFor(() => expect(createInvitation)
      .toHaveBeenCalledWith("new.person@ministry.gov.in", "contributor"));
    expect(await screen.findByText(/✓ Invitation sent/)).toBeInTheDocument();
    expect(field).toHaveValue("");
  });

  it("lists pending invitations and revokes one after confirmation", async () => {
    listInvitations.mockResolvedValue([
      { id: "inv-1", email: "waiting@gov.in", role: "assessor",
        expires_at: "2030-01-01T00:00:00Z", expired: false },
    ]);
    await mountAs("owner");
    expect(await screen.findByText("waiting@gov.in")).toBeInTheDocument();

    vi.spyOn(window, "confirm").mockReturnValue(true);
    await userEvent.click(screen.getByRole("button", { name: "Revoke" }));
    await waitFor(() => expect(revokeInvitation).toHaveBeenCalledWith("inv-1"));
    await waitFor(() => expect(screen.queryByText("waiting@gov.in")).not.toBeInTheDocument());
  });

  it("does not revoke when the confirmation is declined", async () => {
    listInvitations.mockResolvedValue([
      { id: "inv-1", email: "waiting@gov.in", role: "assessor",
        expires_at: "2030-01-01T00:00:00Z", expired: false },
    ]);
    await mountAs("owner");
    vi.spyOn(window, "confirm").mockReturnValue(false);
    await userEvent.click(await screen.findByRole("button", { name: "Revoke" }));
    expect(revokeInvitation).not.toHaveBeenCalled();
    expect(screen.getByText("waiting@gov.in")).toBeInTheDocument();
  });

  it("shows the server's refusal (e.g. cross-org conflict) verbatim", async () => {
    await mountAs("owner");
    createInvitation.mockImplementation(() =>
      Promise.reject(new Error("That address already belongs to another organisation")));
    await userEvent.type(screen.getByLabelText(/Colleague's government email/i), "taken@gov.in");
    await userEvent.click(screen.getByRole("button", { name: /Send invitation/i }));
    expect(await screen.findByText(/already belongs to another organisation/)).toBeInTheDocument();
  });

  it("offers no invite form to a role that cannot invite", async () => {
    await mountAs("contributor");
    expect(screen.queryByLabelText(/Colleague's government email/i)).not.toBeInTheDocument();
    expect(screen.getByText(/Only an owner or admin can invite colleagues/i)).toBeInTheDocument();
  });
});

// ---------- devices ---------------------------------------------------------
describe("Trusted devices", () => {
  it("revokes a device only after confirmation, then drops the row", async () => {
    devices.mockResolvedValue([
      { id: "d1", label: "Laptop", last_active_at: "2026-08-01T00:00:00Z", current: false },
    ]);
    await mountAs("owner");
    expect(await screen.findByText("Laptop")).toBeInTheDocument();

    vi.spyOn(window, "confirm").mockReturnValue(false);
    await userEvent.click(screen.getByRole("button", { name: /^Revoke$/ }));
    expect(revokeDevice).not.toHaveBeenCalled();

    vi.spyOn(window, "confirm").mockReturnValue(true);
    await userEvent.click(screen.getByRole("button", { name: /^Revoke$/ }));
    await waitFor(() => expect(revokeDevice).toHaveBeenCalledWith("d1"));
    await waitFor(() => expect(screen.queryByText("Laptop")).not.toBeInTheDocument());
  });

  it("reports a load failure rather than showing an empty, reassuring list", async () => {
    me.mockResolvedValue({ role: "owner", org_name: "Dept of Posts", org_state_code: "KA" });
    listTeam.mockResolvedValue([]);
    listInvitations.mockResolvedValue([]);
    devices.mockImplementation(() => Promise.reject(new Error("Session store unreachable")));
    render(<Settings />);
    expect(await screen.findByRole("alert")).toHaveTextContent(/Session store unreachable/);
  });
});

// ---------- DPDP -----------------------------------------------------------
describe("DPDP account actions", () => {
  it("erases only after confirmation, then drops the access token", async () => {
    await mountAs("owner");
    eraseMyData.mockResolvedValue({});
    const del = screen.getByRole("button", { name: /Delete my account/i });

    vi.spyOn(window, "confirm").mockReturnValue(false);
    await userEvent.click(del);
    expect(eraseMyData).not.toHaveBeenCalled();

    vi.spyOn(window, "confirm").mockReturnValue(true);
    await userEvent.click(del);
    await waitFor(() => expect(eraseMyData).toHaveBeenCalled());
    // Clearing the in-memory token is the part that matters and the part we can
    // assert: jsdom's location.assign is non-configurable, so the redirect that
    // follows it cannot be intercepted here. It is covered by the live sweep.
    await waitFor(() => expect(setToken).toHaveBeenCalledWith(null));
  });
});
