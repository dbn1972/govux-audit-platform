"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import AppShell from "@/components/AppShell";
import Icon from "@/components/Icon";
import { api } from "@/lib/api";

const GOV = /(\.gov\.in|\.nic\.in)$/i;

export default function RegisterDomain() {
  const router = useRouter();
  // read the query in an effect like /audits/new and /review do, rather than
  // useSearchParams — that hook forces dynamic rendering and needs a Suspense
  // boundary, which would break `next build`
  const [resumeId, setResumeId] = useState<string | null>(null);
  useEffect(() => {
    setResumeId(new URLSearchParams(window.location.search).get("domain"));
  }, []);

  const [url, setUrl] = useState("");
  const [step, setStep] = useState<1 | 2>(1);
  const [reg, setReg] = useState<any>(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [method, setMethod] = useState<"dns_txt" | "file_upload">("dns_txt");

  // Resume verification for a domain registered earlier. Without this the page
  // was write-once: the DNS token only ever existed in this component's state,
  // so anyone who left while DNS propagated (the page itself says that takes up
  // to 30 minutes) could never come back — /domains sent them to a blank form
  // and re-registering returns 409, leaving the domain permanently unverifiable.
  useEffect(() => {
    if (!resumeId) return;
    api.listDomains()
      .then((rows: any[]) => {
        const d = (rows || []).find((x) => x.id === resumeId);
        if (!d) { setErr("That domain is no longer on your account."); return; }
        setUrl(d.url);
        setReg({ id: d.id, verify_token: d.verify_token });
        setStep(2);
      })
      .catch((e: any) => setErr(e?.message || "Could not load that domain."));
  }, [resumeId]);

  async function register() {
    if (!GOV.test(url.trim())) { setErr("Only .gov.in / .nic.in domains are accepted"); return; }
    setErr(""); setBusy(true);
    try { const r = await api.registerDomain(url.trim()); setReg(r); setStep(2); }
    catch (e: any) { setErr(e.message); }
    finally { setBusy(false); }
  }
  async function verify() {
    setErr(""); setBusy(true);
    try { await api.verifyDomain(reg.id, method); router.push("/domains"); }
    catch (e: any) { setErr(e.message); }
    finally { setBusy(false); }
  }

  return (
    <AppShell>
      <div className="gx-page gx-stack">
        <div className="gx-page-head" style={{ marginBottom: 0 }}>
          <div>
            <h1 className="ux4g-mb-2xs">{resumeId ? "Verify a domain" : "Register & verify a domain"}</h1>
            <div className="gx-muted">Only <b>.gov.in</b> and <b>.nic.in</b> domains can be audited.</div>
          </div>
        </div>

        {/* Registering and verifying are two steps with a wait in between —
            DNS propagates, a file has to be published — and the screen gave no
            sense of that shape. Same stepper the audit run uses. */}
        <div className="gx-card"><div className="gx-card-body">
          <div className="gx-steps-rail" style={{ maxWidth: 420 }}>
            {[["Register the domain", 1], ["Prove ownership", 2]].map(([label, n]) => (
              <div key={label as string}
                className={`gx-stage ${step > (n as number) ? "gx-stage-done"
                  : step === n ? "gx-stage-now" : ""}`}>
                <span className="gx-stage-dot">
                  {step > (n as number) ? <Icon name="check-lg" size={16} /> : n}
                </span>
                <div className="gx-stage-name" style={{ textTransform: "none" }}>{label}</div>
              </div>
            ))}
          </div>
        </div></div>

        {step === 1 ? (
          <div className="gx-card"><div className="gx-card-body">
            <label className="form-label" htmlFor="domain-url">Website domain</label>
            <div className="input-group">
              <span className="input-group-text">https://</span>
              <input id="domain-url" className="ux4g-input" placeholder="tracking.indiapost.nic.in"
                value={url} onChange={e => setUrl(e.target.value)} />
            </div>
            {err && (
              <div className="small ux4g-mt-xs" style={{ color: "var(--gx-band-E)" }} role="alert">
                <Icon name="exclamation-circle" size={16} className="ux4g-mr-2xs" />{err}
              </div>
            )}
            <button className="ux4g-btn ux4g-btn-primary ux4g-btn-md ux4g-mt-s" onClick={register} disabled={busy}>
              {busy ? "Registering…" : "Register domain"}</button>
          </div></div>
        ) : (
          <div className="gx-card"><div className="gx-card-body">
            <span className="ux4g-badge-m text-bg-warning-subtle ux4g-mb-xs">Not yet verified</span>
            {url && <div className="ux4g-fw-semibold ux4g-mb-xs">{url}</div>}

            {/* Both proofs demonstrate the same thing — control of the domain —
                so the choice is purely about which one you can actually complete.
                Plenty of government teams run the web server but not the DNS
                zone (often held centrally by NIC), and the API has supported the
                metafile route all along; only the UI hard-coded dns_txt. */}
            <fieldset className="ux4g-mb-s">
              <legend className="form-label ux4g-fw-semibold fs-6">How do you want to prove ownership?</legend>
              <div className="form-check">
                <input className="form-check-input" type="radio" name="verify-method" id="m-dns"
                  checked={method === "dns_txt"} onChange={() => setMethod("dns_txt")} />
                <label className="form-check-label" htmlFor="m-dns">
                  <b>DNS TXT record</b>
                  <span className="ux4g-d-block gx-muted small">
                    Best if you manage the domain&apos;s DNS zone.
                  </span>
                </label>
              </div>
              <div className="form-check">
                <input className="form-check-input" type="radio" name="verify-method" id="m-file"
                  checked={method === "file_upload"} onChange={() => setMethod("file_upload")} />
                <label className="form-check-label" htmlFor="m-file">
                  <b>File on your website</b>
                  <span className="ux4g-d-block gx-muted small">
                    Best if DNS is managed elsewhere but you can publish a file.
                  </span>
                </label>
              </div>
            </fieldset>

            {method === "dns_txt" ? (
              <>
                <p className="small ux4g-mb-xs">Add this TXT record to your domain&apos;s DNS, then verify:</p>
                <pre className="bg-dark text-light ux4g-p-s ux4g-radius-m small"><code>{reg?.verify_token}</code></pre>
                <div className="alert alert-light ux4g-b-1 small">
                  ⏱ DNS changes can take up to 30 minutes; we re-check automatically.
                  You can leave this page — the record is kept, and “Verify” on your
                  domains list brings you straight back here.
                </div>
              </>
            ) : (
              <>
                <p className="small ux4g-mb-xs">
                  Publish a file at this address containing exactly the text below, then verify:
                </p>
                <pre className="bg-dark text-light ux4g-p-s ux4g-radius-m small"><code>
                  https://{url || "your-domain.gov.in"}/.well-known/govux-verify.txt
                </code></pre>
                <p className="small ux4g-mb-xs">File contents:</p>
                <pre className="bg-dark text-light ux4g-p-s ux4g-radius-m small"><code>{reg?.verify_token}</code></pre>
                <div className="alert alert-light ux4g-b-1 small">
                  The file must be served over HTTPS and reachable without sign-in.
                  You can leave this page — “Verify” on your domains list brings you
                  straight back here.
                </div>
              </>
            )}

            {err && <div className="ux4g-text-error small ux4g-mb-xs">✗ {err}</div>}
            <button className="ux4g-btn ux4g-btn-primary ux4g-btn-md" onClick={verify} disabled={busy}>
              {busy ? "Checking…" : "Verify now"}</button>
          </div></div>
        )}
      </div>
    </AppShell>
  );
}
