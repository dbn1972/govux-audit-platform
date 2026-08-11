/** @vitest-environment jsdom */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import "@testing-library/jest-dom/vitest";
import { render, screen, act, cleanup } from "@testing-library/react";
import React from "react";

afterEach(() => { cleanup(); vi.useRealTimers(); });

vi.mock("next/navigation", () => ({ usePathname: () => "/dashboard" }));
vi.mock("next/link", () => ({
  default: ({ href, children, onClick }: any) => <a href={String(href)} onClick={onClick}>{children}</a>,
}));

const me = vi.fn();
const logout = vi.fn();
const setToken = vi.fn();
vi.mock("@/lib/api", () => ({
  api: { me: (...a: any[]) => me(...a), logout: (...a: any[]) => logout(...a) },
  setToken: (...a: any[]) => setToken(...a),
}));

import AppShell from "@/components/AppShell";

const MIN = 60 * 1000;

async function mountSignedIn() {
  me.mockResolvedValue({ is_steward: false, email: "owner@gov.in", display_name: "Owner Dev" });
  render(<AppShell><div>page content</div></AppShell>);
  await act(async () => { await Promise.resolve(); });   // flush the api.me() effect
}

beforeEach(() => {
  vi.useFakeTimers();
  me.mockReset(); logout.mockReset(); setToken.mockReset();
  logout.mockResolvedValue(null);
});

describe("AppShell idle timeout", () => {
  it("shows the 'still there?' warning after 19 minutes of inactivity", async () => {
    await mountSignedIn();
    expect(screen.queryByText(/still there/i)).not.toBeInTheDocument();

    await act(async () => { vi.advanceTimersByTime(19 * MIN); });
    expect(screen.getByText(/still there/i)).toBeInTheDocument();
    expect(logout).not.toHaveBeenCalled();
  });

  it("auto signs out one minute after the warning (20 min total idle)", async () => {
    await mountSignedIn();
    await act(async () => { vi.advanceTimersByTime(19 * MIN); });
    expect(screen.getByText(/still there/i)).toBeInTheDocument();

    await act(async () => { vi.advanceTimersByTime(MIN); });
    expect(logout).toHaveBeenCalledTimes(1);
    expect(setToken).toHaveBeenCalledWith(null);
  });

  it("real activity before 19 minutes cancels the pending warning", async () => {
    await mountSignedIn();
    await act(async () => { vi.advanceTimersByTime(10 * MIN); });
    await act(async () => { window.dispatchEvent(new Event("mousedown")); });

    // 9 more minutes puts us at the ORIGINAL 19-min mark, which is now cancelled
    await act(async () => { vi.advanceTimersByTime(9 * MIN); });
    expect(screen.queryByText(/still there/i)).not.toBeInTheDocument();
    expect(logout).not.toHaveBeenCalled();
  });

  it("'Stay signed in' dismisses the warning, re-arms the timer, and touches the API", async () => {
    await mountSignedIn();
    await act(async () => { vi.advanceTimersByTime(19 * MIN); });
    expect(screen.getByText(/still there/i)).toBeInTheDocument();
    me.mockClear();

    await act(async () => { screen.getByRole("button", { name: /stay signed in/i }).click(); });
    expect(screen.queryByText(/still there/i)).not.toBeInTheDocument();
    expect(me).toHaveBeenCalledTimes(1);   // proactive touch, refreshes an expired access token

    // the original 20-min sign-out mark passes with no effect — the timer was re-armed
    await act(async () => { vi.advanceTimersByTime(MIN); });
    expect(logout).not.toHaveBeenCalled();
  });

  it("'Sign out now' on the warning signs out immediately, without waiting out the countdown", async () => {
    await mountSignedIn();
    await act(async () => { vi.advanceTimersByTime(19 * MIN); });
    await act(async () => { screen.getByRole("button", { name: /sign out now/i }).click(); });
    expect(logout).toHaveBeenCalledTimes(1);
  });
});
