"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import GovBanner from "@/components/GovBanner";
import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";
import { api, setToken } from "@/lib/api";

// Mirrors backend security.is_gov_email: bare @gov.in/@nic.in as well as any subdomain.
const GOV = /(@|\.)(gov\.in|nic\.in)$/i;

// Device key pair for device binding (WebCrypto; use non-extractable + DBSC/WebAuthn in prod)
async function deviceKey(): Promise<string> {
  const kp = await crypto.subtle.generateKey(
    { name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
  const raw = await crypto.subtle.exportKey("spki", kp.publicKey);
  return btoa(String.fromCharCode(...new Uint8Array(raw)));
}

export default function Login() {
  const router = useRouter();
  const [step, setStep] = useState<1 | 2>(1);
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  async function sendOtp() {
    if (busy) return;
    if (!GOV.test(email.trim())) { setErr("Must end in .gov.in or .nic.in"); return; }
    setErr(""); setBusy(true);
    try {
      const res = await api.requestOtp(email.trim());
      // In dev mode the API returns the OTP in the response — show it in console
      if (res?.dev_otp) console.log(`%c[DEV] OTP: ${res.dev_otp}`, "color:green;font-size:18px;font-weight:bold");
      setStep(2);
    }
    catch (e: any) { setErr(e.message); }
    finally { setBusy(false); }
  }
  async function verify() {
    if (busy) return;
    setBusy(true);
    try {
      const pk = await deviceKey();
      const res = await api.verifyOtp(email.trim(), code, pk, true);
      setToken(res.access_token);
      router.push("/dashboard");
    } catch (e: any) { setErr(e.message); setBusy(false); }
  }

  // Sits outside both shells because it is neither a public content page nor a
  // signed-in screen — but it is still a page of this service, so it carries the
  // same identity bar, the same masthead and the same skip link as the rest.
  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column",
                  background: "var(--gx-surface-sunken)" }}>
      <GovBanner />
      <SiteHeader />

      <main id="main" tabIndex={-1} style={{ outline: "none", flex: 1 }}>
        <div className="container" style={{ maxWidth: 440 }}>
          <div className="text-center mt-5 mb-4">
            <h1 className="mb-1">Sign in to GovUX Audit</h1>
            <p className="gx-muted mb-0" style={{ fontSize: ".9375rem" }}>
              For officers of <code>.gov.in</code> and <code>.nic.in</code> departments
            </p>
          </div>
      <div className="gx-card">
        <div className="gx-card-body">
          <h2 className="h5 mb-1">Sign in</h2>
          {step === 1 ? (
            <>
              <p className="gx-muted small mb-3">
                Enter your official government email. We&apos;ll send a one-time password.
              </p>
              <label htmlFor="login-email" className="form-label">Government email</label>
              <input id="login-email" type="email" autoComplete="email" className="form-control" value={email}
                onChange={e => setEmail(e.target.value)} placeholder="name.dept@nic.in" />
              <div className="form-text">Only <b>.gov.in</b> / <b>.nic.in</b> are accepted.</div>
              {err && <div className="text-danger small mt-1" role="alert">✗ {err}</div>}
              <button className="btn btn-primary w-100 mt-3" onClick={sendOtp} disabled={busy}>
                {busy ? "Sending…" : "Send OTP"}</button>
            </>
          ) : (
            <>
              <p className="gx-muted small mb-3">
                Enter the 6-digit OTP sent to <b>{email}</b>.
              </p>
              <label htmlFor="login-otp" className="form-label">One-time password</label>
              <input id="login-otp" className="form-control text-center" inputMode="numeric" maxLength={6}
                autoComplete="one-time-code" aria-label="6-digit one-time password"
                value={code} onChange={e => setCode(e.target.value.replace(/\D/g, ""))}
                placeholder="••••••" style={{ letterSpacing: 8, fontSize: 20 }} />
              {err && <div className="text-danger small mt-1" role="alert">✗ {err}</div>}
              <div className="alert alert-success py-2 mt-3 small mb-0">
                <i className="bi bi-shield-check me-1" />
                On verify we bind this session to this device. A stolen cookie won&apos;t work elsewhere.
              </div>
              <button className="btn btn-primary w-100 mt-3" onClick={verify} disabled={busy || code.length < 6}>
                {busy ? "Verifying…" : "Verify & sign in"}</button>
              <button className="btn btn-link w-100 mt-2" onClick={() => setStep(1)}>← Change email</button>
            </>
          )}
        </div>
        </div>
        </div>
      </main>

      <SiteFooter />
    </div>
  );
}
