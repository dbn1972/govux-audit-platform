/** @vitest-environment jsdom */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import "@testing-library/jest-dom/vitest";
import { render, screen, waitFor, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";

afterEach(cleanup);

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

const requestOtp = vi.fn();
vi.mock("@/lib/api", () => ({
  api: { requestOtp: (...a: any[]) => requestOtp(...a) },
  setToken: vi.fn(),
}));

import Login from "@/app/login/page";

describe("Login — gov-email gate + OTP step", () => {
  beforeEach(() => requestOtp.mockReset());

  it("starts empty so the pre-filled value can't be an invalid apex address", () => {
    render(<Login />);
    expect(screen.getByPlaceholderText("name.dept@nic.in")).toHaveValue("");
  });

  it("rejects a non-gov domain before any API call", async () => {
    render(<Login />);
    await userEvent.type(screen.getByPlaceholderText("name.dept@nic.in"), "user@gmail.com");
    await userEvent.click(screen.getByRole("button", { name: "Send OTP" }));
    expect(await screen.findByText(/Must end in/i)).toBeInTheDocument();
    expect(requestOtp).not.toHaveBeenCalled();
  });

  it("rejects a bare apex gov address (@nic.in) — a sub-domain is required", async () => {
    render(<Login />);
    await userEvent.type(screen.getByPlaceholderText("name.dept@nic.in"), "d.nayak@nic.in");
    await userEvent.click(screen.getByRole("button", { name: "Send OTP" }));
    expect(await screen.findByText(/Must end in/i)).toBeInTheDocument();
    expect(requestOtp).not.toHaveBeenCalled();
  });

  it("accepts a sub-domained gov email and advances to the OTP step", async () => {
    requestOtp.mockResolvedValue({ ok: true });
    render(<Login />);
    await userEvent.type(screen.getByPlaceholderText("name.dept@nic.in"), "d.nayak@meity.gov.in");
    await userEvent.click(screen.getByRole("button", { name: "Send OTP" }));
    await waitFor(() => expect(requestOtp).toHaveBeenCalledWith("d.nayak@meity.gov.in"));
    expect(await screen.findByText(/Enter the 6-digit OTP/i)).toBeInTheDocument();
  });
});
