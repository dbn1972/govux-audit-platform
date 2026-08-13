import { describe, it, expect, vi, beforeEach } from "vitest";
import { api, setToken, AuthError } from "../lib/api";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

beforeEach(() => setToken(null));

describe("api client", () => {
  it("prefixes /api, sends credentials, and returns parsed JSON", async () => {
    global.fetch = vi.fn(async () => json({ ok: 1 })) as any;
    const r = await api.national();
    expect(r).toEqual({ ok: 1 });
    expect(global.fetch).toHaveBeenCalledWith(
      "/api/v1/national",
      expect.objectContaining({ credentials: "include" }),
    );
  });

  it("attaches the Bearer token once set", async () => {
    setToken("TOK123");
    global.fetch = vi.fn(async () => json([])) as any;
    await api.listDomains();
    const [, opts] = (global.fetch as any).mock.calls[0];
    expect((opts.headers as any).Authorization).toBe("Bearer TOK123");
  });

  it("silently refreshes on 401, then retries and succeeds", async () => {
    let n = 0;
    global.fetch = vi.fn(async (url: string) => {
      if (url === "/api/v1/auth/refresh") return json({ access_token: "NEW" });
      n++;
      return n === 1 ? json({}, 401) : json([{ id: "d1" }]);   // 1st 401, retry ok
    }) as any;

    const r = await api.listDomains();
    expect(r).toEqual([{ id: "d1" }]);
    const urls = (global.fetch as any).mock.calls.map((c: any[]) => c[0]);
    expect(urls).toContain("/api/v1/auth/refresh");   // refresh happened
  });

  it("throws AuthError (not a silent empty) when the session can't be refreshed", async () => {
    global.fetch = vi.fn(async () => json({}, 401)) as any;   // everything 401, refresh fails too
    await expect(api.national()).rejects.toBeInstanceOf(AuthError);
  });

  it("does not retry auth endpoints in a loop", async () => {
    global.fetch = vi.fn(async () => json({ detail: "bad code" }, 401)) as any;
    await expect(api.verifyOtp("x@nic.in", "000000", "pk")).rejects.toBeTruthy();
    // /v1/auth/* paths must not trigger the redirect/loop guard beyond the single refresh attempt
    const refreshCalls = (global.fetch as any).mock.calls.filter((c: any[]) => c[0] === "/api/v1/auth/refresh");
    expect(refreshCalls.length).toBeLessThanOrEqual(1);
  });

  it("logout() posts to /v1/auth/logout and resolves (server-side revoke)", async () => {
    global.fetch = vi.fn(async () => new Response(null, { status: 204 })) as any;
    await expect(api.logout()).resolves.toBeNull();
    expect(global.fetch).toHaveBeenCalledWith(
      "/api/v1/auth/logout",
      expect.objectContaining({ method: "POST", credentials: "include" }),
    );
  });

  it("surfaces a plain-string detail as the error message", async () => {
    global.fetch = vi.fn(async () => json({ detail: "OTP expired or not found" }, 400)) as any;
    await expect(api.verifyOtp("x@nic.in", "000000", "pk")).rejects.toThrow("OTP expired or not found");
  });

  it("surfaces a structured detail object's .message, not '[object Object]' (lockout shape from otp/verify)", async () => {
    global.fetch = vi.fn(async () => json({
      detail: { message: "Too many failed attempts. Locked for about 10 minute(s).",
                retry_after: 600, captcha_required: true },
    }, 429)) as any;
    await expect(api.verifyOtp("x@nic.in", "000000", "pk"))
      .rejects.toThrow("Too many failed attempts. Locked for about 10 minute(s).");
  });
});
