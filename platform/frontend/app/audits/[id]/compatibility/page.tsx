"use client";
import { useEffect, useState } from "react";
import AppShell from "@/components/AppShell";
import AuditNav from "@/components/AuditNav";
import { api } from "@/lib/api";

type Browser = {
  engine: string; loaded: boolean | null; status: number | null;
  js_errors: number | null; console_errors: number | null;
  overflow: boolean | null; broken_images: number | null;
};

const ok = <span className="badge bg-success-subtle text-success-emphasis">Pass</span>;
const bad = <span className="badge bg-danger-subtle text-danger-emphasis">Fail</span>;
const warn = <span className="badge bg-warning-subtle text-warning-emphasis">Minor</span>;
const yesno = (loaded: boolean | null) => loaded === false ? bad : loaded ? ok : warn;
const count = (n: number | null, unit: string) =>
  !n ? <span className="text-success">0</span>
     : <span className="text-danger fw-semibold">{n} {unit}{n === 1 ? "" : "s"}</span>;

export default function Compatibility({ params }: { params: { id: string } }) {
  const [browsers, setBrowsers] = useState<Browser[] | null>(null);
  const [err, setErr] = useState("");
  useEffect(() => {
    api.auditReport(params.id).then(r => setBrowsers(r.browsers || []))
      .catch(e => setErr(e?.message || "Report not ready."));
  }, [params.id]);

  const wrap = (b: React.ReactNode) => <AppShell><div className="container-fluid p-4" style={{ maxWidth: 1100 }}>
    <h1 className="h3">Responsiveness &amp; compatibility</h1>
    <p className="text-secondary small">Each site is rendered in three real browser engines — Chromium, Firefox and WebKit (Safari/iOS).</p>
    <AuditNav id={params.id} />{b}</div></AppShell>;

  if (err) return wrap(<div className="alert alert-warning" role="alert">{err}</div>);
  if (!browsers) return wrap(<div className="text-center py-4"><span className="spinner-border text-primary" role="status" aria-label="Loading" /></div>);
  if (browsers.length === 0) return wrap(<div className="text-secondary text-center py-5">No cross-browser results captured for this audit.</div>);

  return wrap(
    <div className="card shadow-sm">
      <div className="card-header bg-white fw-semibold">Cross-browser matrix</div>
      <div className="table-responsive"><table className="table align-middle text-center mb-0">
        <thead className="table-light"><tr>
          <th className="text-start">Engine</th><th>Loads</th><th>Horizontal overflow</th>
          <th>Broken images</th><th>JS errors</th></tr></thead>
        <tbody>{browsers.map(b => (
          <tr key={b.engine}>
            <td className="text-start fw-semibold">{b.engine}</td>
            <td>{yesno(b.loaded)}</td>
            <td>{b.overflow ? bad : ok}</td>
            <td>{count(b.broken_images, "image")}</td>
            <td>{count(b.js_errors, "error")}</td>
          </tr>
        ))}</tbody>
      </table></div>
      <div className="card-footer bg-white small text-secondary">
        Divergence between engines (a page that loads in Chromium but not WebKit, or overflows only on one) is what surfaces here.
      </div>
    </div>
  );
}
