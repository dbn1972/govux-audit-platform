"use client";
import { useEffect, useState } from "react";
import AppShell from "@/components/AppShell";
import { api } from "@/lib/api";

const DEMO = [
  { id: "WCAG-1.4.3", family: "WCAG", title: "Colour contrast (minimum)", plain_language: "Text needs ≥4.5:1 contrast so low-vision users can read it.", good_example: "navy on white = 11.8:1 — passes." },
  { id: "WCAG-2.1.1", family: "WCAG", title: "Keyboard operable", plain_language: "All functionality must work with a keyboard alone.", good_example: "a real <button> instead of a clickable <div>." },
  { id: "GIGW-2.4", family: "GIGW", title: "Mandatory footer elements", plain_language: "Contact, last-updated, policies must appear on every page.", good_example: "a consistent footer on all templates." },
  { id: "CWV-LCP", family: "CWV", title: "Largest Contentful Paint", plain_language: "Main content should render within 2.5s on mobile.", good_example: "compressed WebP hero + deferred JS." },
];

export default function Library() {
  const [rows, setRows] = useState<any[]>(DEMO);
  const [fam, setFam] = useState("");
  useEffect(() => { api.guidelines(fam || undefined).then(r => r.length && setRows(r)).catch(() => {}); }, [fam]);
  const shown = fam ? rows.filter(r => r.family === fam) : rows;

  return (
    <AppShell>
      <div className="container-fluid p-4">
        <h1 className="h3">Guideline library</h1>
        <p className="text-secondary small">Every check explained in plain language with a good example.</p>
        <div className="mb-3 d-flex gap-2 flex-wrap">
          {["", "WCAG", "GIGW", "UX4G", "CWV"].map(f => (
            <button key={f} onClick={() => setFam(f)}
              className={`btn btn-sm ${fam === f ? "btn-primary" : "btn-outline-secondary"}`}>{f || "All"}</button>
          ))}
        </div>
        <div className="row g-3">
          {shown.map(g => (
            <div className="col-md-6" key={g.id}><div className="card shadow-sm h-100"><div className="card-body">
              <div className="d-flex gap-2 mb-1"><span className="badge text-bg-primary-subtle">{g.id}</span>
                <span className="badge text-bg-light">{g.family}</span></div>
              <h2 className="h6">{g.title}</h2>
              <p className="text-secondary small mb-2">{g.plain_language}</p>
              {g.good_example && <div className="alert alert-success py-2 small mb-0">✓ {g.good_example}</div>}
            </div></div></div>
          ))}
        </div>
      </div>
    </AppShell>
  );
}
