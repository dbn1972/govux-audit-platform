"use client";
import AppShell from "@/components/AppShell";

// Methodology transparency (gaps G1, G10): the two-tier model, the separation of
// the legal compliance verdict from the UX band, and the no-overlay stance.
export default function Methodology() {
  return (
    <AppShell>
      <div className="gx-page">
        <div className="gx-page-head" style={{ marginBottom: 0 }}>
          <div>
            <h1 className="ux4g-mb-2xs">Scoring methodology</h1>
            <div className="gx-muted">
              How the GovUX score is produced, and what it cannot tell you — stated openly, because a
              score nobody can interrogate is a score nobody should act on.
            </div>
          </div>
        </div>

        <div className="ux4g-card ux4g-card-solid ux4g-card-outline ux4g-mb-s"><div className="ux4g-card-body">
          <h2 className="ux4g-heading-2xs-strong">Two verdicts, never conflated</h2>
          <p className="ux4g-mb-xs">Every audit produces two independent results:</p>
          <ul>
            <li><b>UX band (A–E)</b> — an aspirational, comparable quality score across 8 weighted
              categories. Good for league tables and trend-tracking.</li>
            <li><b>Legal compliance status</b> — a hard, WCAG 2.2 AA-anchored pass/fail signal.
              A site can hold a decent band and still be <span className="ux4g-tag-filled-error ux4g-tag-s">non-compliant</span>;
              we surface that instead of hiding it inside the band.</li>
          </ul>
        </div></div>

        <div className="ux4g-card ux4g-card-solid ux4g-card-outline ux4g-mb-s"><div className="ux4g-card-body">
          <h2 className="ux4g-heading-2xs-strong">Two-tier rigour</h2>
          <p className="ux4g-mb-xs">Automated testing catches only ~30–40% of WCAG issues (UK GDS / Deque).
            So our methodology is explicit:</p>
          <div className="ux4g-table-responsive ux4g-table-rounded"><table className="ux4g-table ux4g-table-s">
            <thead><tr><th>Tier</th><th>Evidence</th><th>Strongest claim</th></tr></thead>
            <tbody>
              <tr><td>Automated</td><td>Engine only</td>
                <td><span className="ux4g-tag-tonal-warning ux4g-tag-s">partially_compliant</span> at best</td></tr>
              <tr><td>Expert-reviewed</td><td>Automated + assessor</td>
                <td><span className="ux4g-tag-tonal-success ux4g-tag-s">compliant</span> possible</td></tr>
            </tbody>
          </table></div>
          <p className="ux4g-fs-14 gx-muted ux4g-mb-none">An automated run can never yield a full compliance
            claim — that requires human review. This is enforced in the scoring engine.</p>
        </div></div>

        <div className="ux4g-card ux4g-card-solid ux4g-card-outline"><div className="ux4g-card-body">
          <h2 className="ux4g-heading-2xs-strong">No accessibility overlays</h2>
          <p className="ux4g-mb-none">Overlay widgets (accessiBe / UserWay-type) create legal risk and a false
            sense of compliance. The engine <b>flags</b> them and we require the underlying markup to be
            fixed — overlays never count toward a passing result.</p>
        </div></div>
      </div>
    </AppShell>
  );
}
