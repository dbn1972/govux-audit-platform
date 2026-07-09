"use client";
// Report — 8-category GovUX Score using UX4G/Bootstrap components.
const cats: [string, number, number, string][] = [
  ["Accessibility", 22, 58, "#b91c1c"], ["Usability & UX", 17, 65, "#b45309"],
  ["GIGW 3.0", 15, 72, "#15803d"], ["Design / UX4G", 11, 67, "#b45309"],
  ["Performance/CWV", 12, 62, "#b45309"], ["Responsiveness & Compat.", 10, 61, "#b45309"],
  ["Content quality", 7, 61, "#b45309"], ["Trust & security", 6, 71, "#15803d"],
];

export default function Report() {
  return (
    <div className="container py-4">
      <h1 className="h3">Audit report — ncsc.dop.gov.in</h1>
      <p className="text-secondary small">Task a1b2-9c3d · Engine v3.2 · GIGW 3.0 · WCAG 2.2 AA · UX4G · CWV</p>

      <div className="card shadow-sm mb-3"><div className="card-body d-flex gap-4 align-items-center flex-wrap">
        <div className="text-center">
          <div className="score-value">63.9</div>
          <span className="badge text-bg-warning-subtle band-C">Band C · Needs work</span>
        </div>
        <p className="mb-0 text-secondary flex-grow-1" style={{ minWidth: 240 }}>
          Weighted across 8 categories. A critical accessibility failure has activated the
          guard-rail, capping the band at C until fixed.
        </p>
      </div></div>

      <div className="card shadow-sm">
        <div className="card-header bg-white fw-semibold">Category sub-scores</div>
        <div className="card-body">
          {cats.map(([name, wt, score, color]) => (
            <div className="d-flex align-items-center gap-3 my-2" key={name}>
              <div style={{ width: 200, fontSize: 14 }}>{name} <span className="text-secondary small">· {wt}%</span></div>
              <div className="score-bar flex-grow-1"><i style={{ width: `${score}%`, background: color }} /></div>
              <b style={{ width: 40, textAlign: "right", color }}>{score}</b>
            </div>
          ))}
          <hr />
          <div className="d-flex gap-2 flex-wrap">
            <a href="/report/issues" className="btn btn-primary">See prioritised issues →</a>
            <a href="/report/compatibility" className="btn btn-outline-secondary">Responsiveness &amp; compatibility</a>
            <a href="/report/compare" className="btn btn-outline-secondary">Compare &amp; page coverage</a>
          </div>
        </div>
      </div>
    </div>
  );
}
