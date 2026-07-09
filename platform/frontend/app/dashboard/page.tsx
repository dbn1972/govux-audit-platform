"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import AppShell from "@/components/AppShell";
import { api } from "@/lib/api";

type Domain = { id: string; url: string; verify_status: string; category?: string | null };

export default function Dashboard() {
  const [domains, setDomains] = useState<Domain[] | null>(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    api.listDomains()
      .then((d) => setDomains(d || []))
      .catch((e) => { setErr(e?.message || "Could not load your domains."); setDomains([]); });
  }, []);

  const verified = (domains || []).filter((d) => d.verify_status === "verified").length;
  const pending = (domains || []).filter((d) => d.verify_status !== "verified").length;
  const stats: [string, string | number][] = [
    ["Registered domains", domains?.length ?? "—"],
    ["Verified", verified],
    ["Pending verification", pending],
  ];

  return (
    <AppShell><div className="container-fluid p-4" style={{ maxWidth: 1240 }}>
      <div className="d-flex align-items-end flex-wrap gap-2 mb-3">
        <div>
          <h1 className="h3 mb-0">Your workspace</h1>
          <div className="text-secondary small">
            {domains == null ? "Loading your estate…" : `${domains.length} registered domain(s)`}
          </div>
        </div>
        <div className="ms-auto d-flex gap-2">
          <Link href="/domains/new" className="btn btn-outline-secondary">＋ Add domain</Link>
          <Link href="/audits/new" className="btn btn-primary">▶ New audit</Link>
        </div>
      </div>

      {err && <div className="alert alert-warning" role="alert">{err}</div>}

      <div className="row g-3 mb-3">
        {stats.map(([l, v]) => (
          <div className="col-6 col-md-4" key={l}>
            <div className="card shadow-sm h-100"><div className="card-body">
              <div className="text-secondary small fw-semibold">{l}</div>
              <div className="fs-3 fw-bold" style={{ color: "var(--ux-navy)" }}>{v}</div>
            </div></div>
          </div>
        ))}
      </div>

      <div className="card shadow-sm">
        <div className="card-header bg-white fw-semibold">My domains</div>
        <div className="table-responsive">
          <table className="table table-hover align-middle mb-0">
            <thead className="table-light">
              <tr><th>Domain</th><th>Category</th><th>Status</th><th></th></tr>
            </thead>
            <tbody>
              {domains == null && (
                <tr><td colSpan={4} className="text-center py-4">
                  <span className="spinner-border spinner-border-sm text-primary me-2" />Loading…
                </td></tr>
              )}
              {domains?.length === 0 && !err && (
                <tr><td colSpan={4} className="text-secondary text-center py-4">
                  No domains yet. <Link href="/domains/new">Register your first domain →</Link>
                </td></tr>
              )}
              {(domains || []).map((d) => (
                <tr key={d.id}>
                  <td className="fw-semibold" style={{ color: "var(--ux-navy)" }}>{d.url}</td>
                  <td className="text-secondary">{d.category || "—"}</td>
                  <td>
                    <span className={`badge ${d.verify_status === "verified"
                      ? "text-bg-success-subtle" : "text-bg-warning-subtle"}`}>
                      {d.verify_status}
                    </span>
                  </td>
                  <td>
                    {d.verify_status === "verified"
                      ? <Link href={`/audits/new?domain=${d.id}`} className="btn btn-sm btn-link">Run audit →</Link>
                      : <Link href="/domains/new" className="btn btn-sm btn-link">Verify →</Link>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div></AppShell>
  );
}
