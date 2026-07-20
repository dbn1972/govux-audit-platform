"""STQC evidence pack (G12) — deterministic ZIP bundle for certification submission.

`build(report, assessments, reviewed)` is pure: it takes the already-built audit
report dict (routers.audits._build_report), the org's external-assessment ledger
rows (G9/G11/G13) and the review flag, and returns ZIP bytes. No DB, no clock,
no network — same inputs, same archive — so it is safe to test byte-for-byte and
can never leak into the score path.

Pack contents
  report.json                the complete machine-readable audit evidence
  findings.csv               every finding (severity, guideline, remediation)
  external-assessments.csv   manual-assurance ledger (VAPT / panel / STQC / native app)
  compliance-statement.md    the legal verdict + what automation can and cannot certify
  methodology.md             scoring weights, standards versions, engine version
  summary.pdf                one-page human-readable scorecard (report_pdf, evidence variant)
"""
from __future__ import annotations

import csv
import io
import json
import zipfile

from . import report_pdf
from .scoring import CATEGORY_WEIGHTS

KIND_LABELS = {
    "vapt": "Security VAPT (CERT-In empanelled)",
    "native_app_a11y": "Native mobile-app accessibility audit",
    "lived_experience_panel": "Lived-experience panel (users with disabilities)",
    "stqc_certification": "STQC certification",
    "other": "Other external assessment",
}


def _csv(header: list[str], rows: list[list]) -> str:
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(header)
    w.writerows(rows)
    return buf.getvalue()


def _findings_csv(report: dict) -> str:
    return _csv(
        ["severity", "category", "guideline", "title", "state", "confidence", "remediation"],
        [[f.get("severity"), f.get("category"), f.get("guideline"), f.get("title"),
          f.get("state"), f.get("confidence"), f.get("remediation")]
         for f in report.get("findings", [])])


def _assessments_csv(assessments: list[dict]) -> str:
    return _csv(
        ["kind", "title", "agency", "assessed_on", "outcome", "report_ref", "summary"],
        [[a.get("kind"), a.get("title"), a.get("agency"), a.get("assessed_on"),
          a.get("outcome"), a.get("report_ref"), a.get("summary")]
         for a in assessments])


def _compliance_statement(report: dict, assessments: list[dict], reviewed: bool) -> str:
    comp = report.get("compliance") or {}
    lines = [
        f"# Compliance statement — {report.get('domain')}",
        "",
        f"Audit date: {report.get('date')}  ·  Engine: {report.get('engine_version')}",
        f"GovUX Score: **{report.get('overall_score')}/100** (band {report.get('band')})",
        "",
        "## Legal verdict (separate from the UX band)",
        f"- Status: **{comp.get('status')}**",
        f"- Method: {comp.get('method')}  ·  Confidence: {comp.get('confidence')}",
        f"- Expert-reviewed: {'yes' if reviewed else 'no'}",
        "",
        "Automated testing alone can never establish full GIGW 3.0 / WCAG 2.2 AA",
        "conformance; an automated-only audit is therefore capped at",
        "`partially_compliant`. The verdict reaches `compliant` only after an",
        "authorised assessor records an expert review on the platform.",
        "",
        "## External assessments on record (not automatable)",
    ]
    if assessments:
        for a in assessments:
            lines.append(f"- **{KIND_LABELS.get(a.get('kind'), a.get('kind'))}** — "
                         f"{a.get('title')} ({a.get('agency') or 'agency n/a'}, "
                         f"{a.get('assessed_on') or 'date n/a'}): {a.get('outcome')}"
                         + (f" · ref {a.get('report_ref')}" if a.get('report_ref') else ""))
    else:
        lines.append("- None recorded. Security VAPT, native-app accessibility, and "
                     "lived-experience panel reviews must be performed by external "
                     "agencies and recorded in the platform's assessment ledger.")
    integ = report.get("integrity")
    if integ:
        lines += ["", "## Integrity Engine",
                  "Anti-gaming signals were evaluated for this audit; see "
                  "`report.json` → `integrity` for the full block."]
    return "\n".join(lines) + "\n"


def _methodology(report: dict) -> str:
    lines = [
        "# Methodology",
        "",
        "Standards: GIGW 3.0 · WCAG 2.2 AA · UX4G Design System · Core Web Vitals.",
        f"Engine version: {report.get('engine_version')} · "
        f"Pages audited: {report.get('pages_total')}.",
        "",
        "The GovUX Score (0–100) is fully deterministic and LLM-free. Category",
        "weights (sum = 100):",
        "",
    ]
    lines += [f"- {cat}: {weight:g}" for cat, weight in CATEGORY_WEIGHTS.items()]
    lines += [
        "",
        "A guard-rail caps the band at C when critical accessibility or trust",
        "findings are present. ML/LLM outputs (anomaly score, remediation",
        "enrichment) are advisory only and never contribute points.",
        "The per-category point contributions for this audit are in",
        "`report.json` → `contributions`.",
    ]
    return "\n".join(lines) + "\n"


def build(report: dict, assessments: list[dict], reviewed: bool = False) -> bytes:
    pdf = report_pdf.build({**report, "url": report.get("domain"),
                            "host": report.get("domain"),
                            "date": (report.get("date") or "")[:10]},
                           variant="evidence")
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as z:
        z.writestr("report.json", json.dumps(report, indent=2, default=str))
        z.writestr("findings.csv", _findings_csv(report))
        z.writestr("external-assessments.csv", _assessments_csv(assessments))
        z.writestr("compliance-statement.md",
                   _compliance_statement(report, assessments, reviewed))
        z.writestr("methodology.md", _methodology(report))
        z.writestr("summary.pdf", pdf)
    return buf.getvalue()
