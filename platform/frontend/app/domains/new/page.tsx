"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import AppShell from "@/components/AppShell";
import { api } from "@/lib/api";

const GOV = /(\.gov\.in|\.nic\.in)$/i;

export default function RegisterDomain() {
  const router = useRouter();
  const [url, setUrl] = useState("");
  const [step, setStep] = useState<1 | 2>(1);
  const [reg, setReg] = useState<any>(null);
  const [err, setErr] = useState("");

  async function register() {
    if (!GOV.test(url.trim())) { setErr("Only .gov.in / .nic.in domains are accepted"); return; }
    setErr("");
    try { const r = await api.registerDomain(url.trim()); setReg(r); setStep(2); }
    catch (e: any) { setErr(e.message); }
  }
  async function verify() {
    try { await api.verifyDomain(reg.id); router.push("/domains"); }
    catch (e: any) { setErr(e.message); }
  }

  return (
    <AppShell>
      <div className="container-fluid p-4" style={{ maxWidth: 720 }}>
        <h1 className="h3">Register &amp; verify a domain</h1>
        <p className="text-secondary small">Only <b>.gov.in</b> and <b>.nic.in</b> domains can be audited.</p>

        {step === 1 ? (
          <div className="card shadow-sm"><div className="card-body">
            <label className="form-label fw-semibold">Website domain</label>
            <div className="input-group">
              <span className="input-group-text">https://</span>
              <input className="form-control" placeholder="tracking.indiapost.nic.in"
                value={url} onChange={e => setUrl(e.target.value)} />
            </div>
            {err && <div className="text-danger small mt-1">✗ {err}</div>}
            <button className="btn btn-primary mt-3" onClick={register}>Register domain</button>
          </div></div>
        ) : (
          <div className="card shadow-sm"><div className="card-body">
            <span className="badge text-bg-warning-subtle mb-2">Not yet verified</span>
            <p className="small mb-2">Add this TXT record to your domain&apos;s DNS, then verify:</p>
            <pre className="bg-dark text-light p-3 rounded small"><code>{reg?.verify_token}</code></pre>
            <div className="alert alert-light border small">⏱ DNS changes can take up to 30 minutes; we re-check automatically.</div>
            {err && <div className="text-danger small">✗ {err}</div>}
            <button className="btn btn-primary" onClick={verify}>Verify now</button>
          </div></div>
        )}
      </div>
    </AppShell>
  );
}
