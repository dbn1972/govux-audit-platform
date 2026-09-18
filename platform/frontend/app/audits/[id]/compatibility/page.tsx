"use client";
import { useEffect, useState } from "react";
import AppShell from "@/components/AppShell";
import AuditNav from "@/components/AuditNav";
import Spinner from "@/components/Spinner";
import { api } from "@/lib/api";

type Browser = {
  engine: string; loaded: boolean | null; status: number | null;
  js_errors: number | null; console_errors: number | null;
  overflow: boolean | null; broken_images: number | null;
};

const ok = <span className="ux4g-badge-m bg-success-subtle text-success-emphasis">Pass</span>;
const bad = <span className="ux4g-badge-m bg-danger-subtle text-danger-emphasis">Fail</span>;
const warn = <span className="ux4g-badge-m bg-warning-subtle text-warning-emphasis">Minor</span>;
const yesno = (loaded: boolean | null) => loaded === false ? bad : loaded ? ok : warn;
const count = (n: number | null, unit: string) =>
  !n ? <span className="ux4g-text-success">0</span>
     : <span className="ux4g-text-error ux4g-fw-semibold">{n} {unit}{n === 1 ? "" : "s"}</span>;

export default function Compatibility({ params }: { params: { id: string } }) {
  const [browsers, setBrowsers] = useState<Browser[] | null>(null);
  const [err, setErr] = useState("");
  useEffect(() => {
    api.auditReport(params.id).then(r => setBrowsers(r.browsers || []))
      .catch(e => setErr(e?.message || "Report not ready."));
  }, [params.id]);

  const wrap = (b: React.ReactNode) => <AppShell><div className="gx-page gx-stack">
        <div className="gx-page-head" style={{ marginBottom: 0 }}>
          <div>
            <h1 className="ux4g-mb-2xs">Responsiveness &amp; compatibility</h1>
            <div className="gx-muted">Each site is rendered in three real browser engines — Chromium, Firefox and WebKit (Safari/iOS).</div>
          </div>
        </div>
    <AuditNav id={params.id} />{b}</div></AppShell>;

  if (err) return wrap(<div className="ux4g-alert ux4g-alert-warning" role="alert">{err}</div>);
  if (!browsers) return wrap(<div className="ux4g-text-center ux4g-py-m"><Spinner size="md" label="Loading" /></div>);
  if (browsers.length === 0) return wrap(<div className="gx-muted ux4g-text-center ux4g-py-l">No cross-browser results captured for this audit.</div>);

  return wrap(
    <div className="gx-card">
      <div className="gx-card-head">Cross-browser matrix</div>
      <div className="ux4g-table-responsive ux4g-table-rounded"><table className="ux4g-table ux4g-table-m ux4g-text-center">
        <thead><tr>
          <th className="ux4g-text-start">Engine</th><th>Loads</th><th>Horizontal overflow</th>
          <th>Broken images</th><th>JS errors</th></tr></thead>
        <tbody>{browsers.map(b => (
          <tr key={b.engine}>
            <td className="ux4g-text-start ux4g-fw-semibold">{b.engine}</td>
            <td>{yesno(b.loaded)}</td>
            <td>{b.overflow ? bad : ok}</td>
            <td>{count(b.broken_images, "image")}</td>
            <td>{count(b.js_errors, "error")}</td>
          </tr>
        ))}</tbody>
      </table></div>
      <div className="ux4g-card-footer small gx-muted">
        Divergence between engines (a page that loads in Chromium but not WebKit, or overflows only on one) is what surfaces here.
      </div>
    </div>
  );
}
