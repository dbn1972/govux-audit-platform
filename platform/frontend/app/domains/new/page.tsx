"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import AppShell from "@/components/AppShell";
import Icon from "@/components/Icon";
import StatusLine from "@/components/StatusLine";
import Spinner from "@/components/Spinner";
import { api } from "@/lib/api";
import { hostOnly, stripScheme } from "@/lib/domain";

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
    // Hostnames are case-insensitive; normalise here rather than as they type,
    // so the field does not fight someone holding shift.
    const host = hostOnly(url).toLowerCase();
    if (!GOV.test(host)) { setErr("Only .gov.in / .nic.in domains are accepted"); return; }
    setErr(""); setBusy(true);
    try { const r = await api.registerDomain(host); setReg(r); setStep(2); }
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
            {/* This screen is only ever reached from /domains ("Add domain")
                or from a "Verify" row on it, and it is not in the rail — so
                without this the only way back was the browser button. */}
            <Link href="/domains" className="gx-back ux4g-fs-14 ux4g-mb-2xs">
              <Icon name="arrow-left" size={14} />My domains
            </Link>
            <h1 className="ux4g-mb-2xs">{resumeId ? "Verify a domain" : "Register & verify a domain"}</h1>
            <div className="gx-muted">Only <b>.gov.in</b> and <b>.nic.in</b> domains can be audited.</div>
          </div>
        </div>

        {/* Registering and verifying are two steps with a wait in between —
            DNS propagates, a file has to be published — and the screen gave no
            sense of that shape. Same stepper the audit run uses. */}
        <div className="ux4g-card ux4g-card-solid ux4g-card-outline"><div className="ux4g-card-body">
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
          <div className="ux4g-card ux4g-card-solid ux4g-card-outline"><div className="ux4g-card-body">
            {/* UX4G Input contract (input.css): container > label + .ux4g-input > .ux4g-input-input.
                The https:// scheme is a plain span, NOT .ux4g-input-leading-icon: that slot is
                hard-sized to the glyph box (`.ux4g-input-md .ux4g-input-leading-icon{width:1.125rem}`),
                so a ~48px text prefix overflowed it and printed on top of the placeholder. .ux4g-input
                is a flex row and .ux4g-input-input is flex:1, so an unstyled span sizes itself
                correctly and the field starts after it. */}
            <div className={`ux4g-input-container ux4g-input-md ${err ? "ux4g-input-error" : "ux4g-input-default"}`}>
              <label className="ux4g-label-m-default" htmlFor="domain-url">Website domain</label>
              <div className="ux4g-input">
                <span className="gx-muted ux4g-fs-14 ux4g-mr-2xs ux4g-flex-shrink-0" aria-hidden="true">https://</span>
                <input id="domain-url" className="ux4g-input-input" placeholder="tracking.indiapost.nic.in"
                  value={url}
                  // scheme as they type (safe), everything else once they are
                  // done — see lib/domain.ts on why that split exists
                  onChange={e => setUrl(stripScheme(e.target.value))}
                  onBlur={e => setUrl(hostOnly(e.target.value))} />
              </div>
              {err && (
                <div className="ux4g-input-helper" role="alert">
                  <Icon name="exclamation-circle" size={16} className="ux4g-input-helper-icon" />
                  <span className="ux4g-input-helper-text">{err}</span>
                </div>
              )}
            </div>
            <button className="ux4g-btn ux4g-btn-primary ux4g-btn-md ux4g-mt-s" onClick={register} disabled={busy}>
              {busy ? "Registering…" : "Register domain"}</button>
          </div></div>
        ) : (
          <div className="ux4g-card ux4g-card-solid ux4g-card-outline"><div className="ux4g-card-body">
            <span className="ux4g-tag-tonal-warning ux4g-tag-s ux4g-mb-xs">Not yet verified</span>
            {url && <div className="ux4g-fw-semibold ux4g-mb-xs">{url}</div>}

            {/* Both proofs demonstrate the same thing — control of the domain —
                so the choice is purely about which one you can actually complete.
                Plenty of government teams run the web server but not the DNS
                zone (often held centrally by NIC), and the API has supported the
                metafile route all along; only the UI hard-coded dns_txt. */}
            {/* UX4G Radio contract (radio.css): label.ux4g-radio > input.ux4g-radio-input
                + div.ux4g-radio-control>span.ux4g-radiomark + content. */}
            <fieldset className="ux4g-mb-s ux4g-d-flex ux4g-flex-column ux4g-gap-xs">
              <legend className="ux4g-label-m-default ux4g-fw-semibold ux4g-mb-2xs">How do you want to prove ownership?</legend>
              <label className="ux4g-radio ux4g-radio-md">
                <input className="ux4g-radio-input" type="radio" name="verify-method"
                  checked={method === "dns_txt"} onChange={() => setMethod("dns_txt")} />
                <div className="ux4g-radio-control"><span className="ux4g-radiomark"></span></div>
                <div className="ux4g-radio-content">
                  <b>DNS TXT record</b>
                  <span className="ux4g-d-block gx-muted ux4g-fs-14">
                    Best if you manage the domain&apos;s DNS zone.
                  </span>
                </div>
              </label>
              <label className="ux4g-radio ux4g-radio-md">
                <input className="ux4g-radio-input" type="radio" name="verify-method"
                  checked={method === "file_upload"} onChange={() => setMethod("file_upload")} />
                <div className="ux4g-radio-control"><span className="ux4g-radiomark"></span></div>
                <div className="ux4g-radio-content">
                  <b>File on your website</b>
                  <span className="ux4g-d-block gx-muted ux4g-fs-14">
                    Best if DNS is managed elsewhere but you can publish a file.
                  </span>
                </div>
              </label>
            </fieldset>

            {method === "dns_txt" ? (
              <>
                <p className="ux4g-fs-14 ux4g-mb-xs">Add this TXT record to your domain&apos;s DNS, then verify:</p>
                <pre className="ux4g-bg-neutral-stronger ux4g-text-white ux4g-p-s ux4g-radius-m ux4g-fs-14"><code>{reg?.verify_token}</code></pre>
                <div className="ux4g-alert ux4g-alert-info ux4g-fs-14 ux4g-d-flex ux4g-ai-start ux4g-gap-2xs">
                  <Icon name="hourglass-split" size={16} className="ux4g-flex-shrink-0 ux4g-mt-3xs" />
                  <span>DNS changes can take up to 30 minutes; we re-check automatically.
                  You can leave this page — the record is kept, and “Verify” on your
                  domains list brings you straight back here.</span>
                </div>
              </>
            ) : (
              <>
                <p className="ux4g-fs-14 ux4g-mb-xs">
                  Publish a file at this address containing exactly the text below, then verify:
                </p>
                <pre className="ux4g-bg-neutral-stronger ux4g-text-white ux4g-p-s ux4g-radius-m ux4g-fs-14"><code>
                  https://{url || "your-domain.gov.in"}/.well-known/govux-verify.txt
                </code></pre>
                <p className="ux4g-fs-14 ux4g-mb-xs">File contents:</p>
                <pre className="ux4g-bg-neutral-stronger ux4g-text-white ux4g-p-s ux4g-radius-m ux4g-fs-14"><code>{reg?.verify_token}</code></pre>
                <div className="ux4g-alert ux4g-alert-info ux4g-fs-14">
                  The file must be served over HTTPS and reachable without sign-in.
                  You can leave this page — “Verify” on your domains list brings you
                  straight back here.
                </div>
              </>
            )}

            {err && <StatusLine ok={false} text={err} className="ux4g-mb-xs" />}
            <button className="ux4g-btn ux4g-btn-primary ux4g-btn-md" onClick={verify} disabled={busy}>
              {busy ? "Checking…" : "Verify now"}</button>
          </div></div>
        )}
      </div>
    </AppShell>
  );
}
