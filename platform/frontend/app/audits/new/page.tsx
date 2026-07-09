"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import AppShell from "@/components/AppShell";
import { api } from "@/lib/api";

const CATS = [
  ["Accessibility — WCAG 2.2 AA", 22], ["Usability & UX heuristics", 17],
  ["GIGW 3.0 compliance", 15], ["Design foundation — UX4G", 11],
  ["Performance — Core Web Vitals", 12], ["Responsiveness & Compatibility", 10],
  ["Content quality & readability", 7], ["Trust, security & privacy", 6],
] as const;

export default function NewAudit() {
  const router = useRouter();
  const [domainId, setDomainId] = useState("ncsc.dop.gov.in");
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    try {
      const res = await api.submitAudit(domainId);   // -> 202 { task_id }
      router.push(`/audits/${res.task_id}`);
    } catch (e: any) { alert(e.message); setBusy(false); }
  }

  return (
    <AppShell>
      <div className="container-fluid p-4">
        <h1 className="h3">Configure audit</h1>
        <p className="text-secondary small">Submitting returns a task ID instantly; the audit runs in the background.</p>
        <div className="row g-3">
          <div className="col-lg-8">
            <div className="card shadow-sm mb-3"><div className="card-body">
              <label className="form-label fw-semibold">Domain</label>
              <select className="form-select" value={domainId} onChange={e => setDomainId(e.target.value)}>
                <option value="ncsc.dop.gov.in">ncsc.dop.gov.in — Savings certificates</option>
                <option value="indiapost.gov.in">indiapost.gov.in — Main portal</option>
              </select>
            </div></div>
            <div className="card shadow-sm"><div className="card-body">
              <h2 className="h6">Standards &amp; categories</h2>
              <p className="text-secondary small">All eight scoring categories are on by default.</p>
              {CATS.map(([name, wt]) => (
                <div className="form-check form-switch d-flex align-items-center gap-2 border rounded p-2 mb-2" key={name}>
                  <input className="form-check-input" type="checkbox" defaultChecked />
                  <span className="flex-grow-1">{name}</span>
                  <span className="badge text-bg-primary-subtle">{wt}%</span>
                </div>
              ))}
            </div></div>
          </div>
          <div className="col-lg-4">
            <div className="card shadow-sm"><div className="card-body">
              <h2 className="h6">Compatibility matrix</h2>
              <div className="mb-2"><div className="text-secondary small">Browser engines</div>
                <span className="badge text-bg-secondary me-1">Chromium</span>
                <span className="badge text-bg-secondary me-1">Firefox</span>
                <span className="badge text-bg-secondary">WebKit</span></div>
              <div className="mb-3"><div className="text-secondary small">Device sizes</div>
                <span className="badge text-bg-secondary me-1">360</span>
                <span className="badge text-bg-secondary me-1">414</span>
                <span className="badge text-bg-secondary me-1">768</span>
                <span className="badge text-bg-secondary">1440</span></div>
              <button className="btn btn-primary w-100" onClick={submit} disabled={busy}>
                {busy ? "Submitting…" : "▶ Submit — get task ID"}</button>
            </div></div>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
