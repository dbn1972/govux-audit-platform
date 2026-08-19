"""One-page national brief (reportlab) — the steward dashboard as a PDF.

The dashboard is what gets shown in a room; the brief is what gets left behind
in it. Same numbers, same order, plus the two things a screen can leave implicit
and a circulated document cannot: when it was generated and which engine
produced it. Deterministic and offline, like report_pdf.
"""
from __future__ import annotations
from datetime import datetime, timezone
from io import BytesIO
from xml.sax.saxutils import escape

from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.platypus import (SimpleDocTemplate, Paragraph, Spacer, Table,
                                TableStyle, HRFlowable)

NAVY = colors.HexColor("#0a3d7a"); MUTED = colors.HexColor("#5b6570")
LINE = colors.HexColor("#dde3ea"); GREY = colors.HexColor("#f4f6f9")
BAND_COLOUR = {"A": colors.HexColor("#116932"), "B": colors.HexColor("#0c655e"),
               "C": colors.HexColor("#9a4508"), "D": colors.HexColor("#a6370a"),
               "E": colors.HexColor("#b91c1c")}
BAND_MEANING = {"A": "Exemplary", "B": "Good", "C": "Needs work",
                "D": "Poor", "E": "Critical"}


def build(data: dict, engine_version: str, generated_at: datetime | None = None) -> bytes:
    when = generated_at or datetime.now(timezone.utc)
    st = getSampleStyleSheet()
    def S(n, **k): return ParagraphStyle(n, parent=st["Normal"], **k)
    h1 = S("h1", fontName="Helvetica-Bold", fontSize=17, leading=21, textColor=NAVY)
    small = S("small", fontSize=8, leading=11, textColor=MUTED)
    label = S("label", fontName="Helvetica-Bold", fontSize=6.8, leading=9, textColor=MUTED)
    figure = S("figure", fontName="Helvetica-Bold", fontSize=18, leading=21, textColor=NAVY)
    cell = S("cell", fontSize=8.6, leading=11)
    cellB = S("cellB", fontName="Helvetica-Bold", fontSize=8.6, leading=11)
    h2 = S("h2", fontName="Helvetica-Bold", fontSize=10.5, leading=14, textColor=NAVY)

    buf = BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A4, title="GovUX national brief",
                            leftMargin=16 * mm, rightMargin=16 * mm,
                            topMargin=14 * mm, bottomMargin=14 * mm)
    flow = [Paragraph("National digital-service quality", h1),
            Paragraph(f"GovUX Audit Platform · generated {when:%d %b %Y, %H:%M UTC} · engine {escape(engine_version)}", small),
            Spacer(1, 5 * mm), HRFlowable(width="100%", color=LINE), Spacer(1, 5 * mm)]

    avg = data.get("avg_score")
    kpis = [("Register size", str(data.get("domains_total", 0)), "known domains"),
            ("Domains audited", str(data.get("audited", 0)), f"{data.get('coverage_pct', 0)}% of the register"),
            ("National average", "—" if avg is None else str(avg), "GovUX score"),
            ("Band E (critical)", str((data.get("band_distribution") or {}).get("E", 0)), "need intervention")]
    kpi_tbl = Table([[Paragraph(l.upper(), label) for l, _, _ in kpis],
                     [Paragraph(v, figure) for _, v, _ in kpis],
                     [Paragraph(n, small) for _, _, n in kpis]],
                    colWidths=[44 * mm] * 4)
    kpi_tbl.setStyle(TableStyle([("BACKGROUND", (0, 0), (-1, -1), GREY),
                                 ("BOX", (0, 0), (-1, -1), 0.5, LINE),
                                 ("INNERGRID", (0, 0), (-1, -1), 0.5, colors.white),
                                 ("LEFTPADDING", (0, 0), (-1, -1), 6),
                                 ("TOPPADDING", (0, 0), (-1, -1), 5),
                                 ("BOTTOMPADDING", (0, 0), (-1, -1), 5)]))
    flow += [kpi_tbl, Spacer(1, 7 * mm), Paragraph("Score distribution", h2), Spacer(1, 2 * mm)]

    dist = data.get("band_distribution") or {}
    scored = sum(int(dist.get(b, 0)) for b in "ABCDE")
    rows = [[Paragraph("BAND", label), Paragraph("MEANING", label),
             Paragraph("DOMAINS", label), Paragraph("SHARE", label)]]
    for b in "ABCDE":
        n = int(dist.get(b, 0))
        share = f"{(100 * n / scored):.0f}%" if scored else "—"
        rows.append([Paragraph(f"Band {b}", ParagraphStyle("bd", parent=cellB, textColor=BAND_COLOUR[b])),
                     Paragraph(BAND_MEANING[b], cell), Paragraph(str(n), cellB), Paragraph(share, cell)])
    dist_tbl = Table(rows, colWidths=[26 * mm, 68 * mm, 42 * mm, 42 * mm])
    dist_tbl.setStyle(TableStyle([("LINEBELOW", (0, 0), (-1, -1), 0.4, LINE),
                                 ("ALIGN", (2, 0), (-1, -1), "RIGHT"),
                                 ("TOPPADDING", (0, 0), (-1, -1), 4),
                                 ("BOTTOMPADDING", (0, 0), (-1, -1), 4)]))
    flow += [dist_tbl, Spacer(1, 7 * mm), Paragraph("Top performers", h2), Spacer(1, 2 * mm)]

    league = data.get("league") or []
    lrows = [[Paragraph("#", label), Paragraph("DOMAIN", label),
              Paragraph("SCORE", label), Paragraph("BAND", label)]]
    for i, r in enumerate(league, 1):
        band = r.get("band") or "—"
        lrows.append([Paragraph(str(i), cell), Paragraph(escape(str(r.get("url", ""))), cellB),
                      Paragraph("—" if r.get("score") is None else str(r["score"]), cellB),
                      Paragraph(band, ParagraphStyle("bl", parent=cellB,
                                                     textColor=BAND_COLOUR.get(band, MUTED)))])
    if not league:
        lrows.append([Paragraph("", cell), Paragraph("No scored audits yet.", cell),
                      Paragraph("", cell), Paragraph("", cell)])
    league_tbl = Table(lrows, colWidths=[12 * mm, 104 * mm, 32 * mm, 30 * mm])
    league_tbl.setStyle(TableStyle([("LINEBELOW", (0, 0), (-1, -1), 0.4, LINE),
                                    ("ALIGN", (2, 0), (-1, -1), "RIGHT"),
                                    ("TOPPADDING", (0, 0), (-1, -1), 4),
                                    ("BOTTOMPADDING", (0, 0), (-1, -1), 4)]))
    flow += [league_tbl, Spacer(1, 8 * mm), HRFlowable(width="100%", color=LINE), Spacer(1, 3 * mm),
             Paragraph(
                 "Scores are produced by a deterministic engine with fixed category weights; no "
                 "model or human judgement enters the number. Coverage is measured against the "
                 "registered domain estate, so it moves as the register grows. A GovUX score is a "
                 "measure of quality, not a legal compliance verdict — conformance is certified "
                 "separately, per audit, and automated evidence alone cannot exceed a partial verdict.",
                 small)]
    doc.build(flow)
    return buf.getvalue()
