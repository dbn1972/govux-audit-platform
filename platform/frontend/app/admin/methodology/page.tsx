"use client";
import AppShell from "@/components/AppShell";

// Methodology transparency (gaps G1, G10): the two-tier model, the separation of
// the legal compliance verdict from the UX band, and the no-overlay stance.
export default function Methodology() {
  return (
    <AppShell>
      <div className="gx-page">
        <h1 className="h3" style={{ color: "var(--ux-navy)" }}>Scoring methodology</h1>
        <p className="text-secondary">How the GovUX Score is produced, and its limits — stated openly.</p>

        <div className="card shadow-sm mb-3"><div className="card-body">
          <h2 className="h5">Two verdicts, never conflated</h2>
          <p className="mb-2">Every audit produces two independent results:</p>
          <ul>
            <li><b>UX band (A–E)</b> — an aspirational, comparable quality score across 8 weighted
              categories. Good for league tables and trend-tracking.</li>
            <li><b>Legal compliance status</b> — a hard, WCAG 2.2 AA-anchored pass/fail signal.
              A site can hold a decent band and still be <span className="badge bg-danger">non-compliant</span>;
              we surface that instead of hiding it inside the band.</li>
          </ul>
        </div></div>

        <div className="card shadow-sm mb-3"><div className="card-body">
          <h2 className="h5">Two-tier rigour</h2>
          <p className="mb-2">Automated testing catches only ~30–40% of WCAG issues (UK GDS / Deque).
            So our methodology is explicit:</p>
          <div className="table-responsive"><table className="table table-sm">
            <thead><tr><th>Tier</th><th>Evidence</th><th>Strongest claim</th></tr></thead>
            <tbody>
              <tr><td>Automated</td><td>Engine only</td>
                <td><span className="badge text-bg-warning">partially_compliant</span> at best</td></tr>
              <tr><td>Expert-reviewed</td><td>Automated + assessor</td>
                <td><span className="badge text-bg-success">compliant</span> possible</td></tr>
            </tbody>
          </table></div>
          <p className="small text-secondary mb-0">An automated run can never yield a full compliance
            claim — that requires human review. This is enforced in the scoring engine.</p>
        </div></div>

        <div className="card shadow-sm"><div className="card-body">
          <h2 className="h5">No accessibility overlays</h2>
          <p className="mb-0">Overlay widgets (accessiBe / UserWay-type) create legal risk and a false
            sense of compliance. The engine <b>flags</b> them and we require the underlying markup to be
            fixed — overlays never count toward a passing result.</p>
        </div></div>
      </div>
    </AppShell>
  );
}
