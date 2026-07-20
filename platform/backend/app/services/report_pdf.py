"""In-platform PDF generator for scan reports (reportlab).

Produces a clean scorecard PDF from a scan result dict — used by the free public
scanner (returned as a direct download) and stored in S3 for registered users.
Deterministic; no external calls.
"""
from __future__ import annotations
from io import BytesIO
from xml.sax.saxutils import escape

from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.enums import TA_CENTER
from reportlab.platypus import (SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, HRFlowable)

NAVY = colors.HexColor("#0a3d7a"); GREEN = colors.HexColor("#198754")
AMBER = colors.HexColor("#fd7e14"); RED = colors.HexColor("#dc3545")
GREY = colors.HexColor("#f4f6f9"); MUTED = colors.HexColor("#5b6570"); LINE = colors.HexColor("#dde3ea")


def _tier(s):
    return GREEN if s >= 75 else (AMBER if s >= 50 else RED)


def _bandcol(b):
    return {"A": GREEN, "B": GREEN, "C": AMBER, "D": RED, "E": RED}.get(b, MUTED)


def build(scan: dict, variant: str = "public") -> bytes:
    # variant "public" = free single-page scan; "evidence" = summary sheet inside
    # the STQC evidence pack for a full authenticated audit (G12)
    ev = variant == "evidence"
    st = getSampleStyleSheet()
    def S(n, **k): return ParagraphStyle(n, parent=st["Normal"], **k)
    body = S("body", fontSize=9.5, leading=13, textColor=colors.HexColor("#22272e"))
    small = S("small", fontSize=8, leading=11, textColor=MUTED)
    cellL = S("cellL", fontSize=8.6, leading=11)
    cellB = S("cellB", fontName="Helvetica-Bold", fontSize=8.6, leading=11)
    story = []

    story.append(Paragraph("GOVUX AUDIT PLATFORM &nbsp;·&nbsp; " + ("Audit evidence pack" if ev else "Free website scan"), S("eb", fontName="Helvetica-Bold", fontSize=8, textColor=MUTED, spaceAfter=6)))
    story.append(Paragraph("Audit Evidence Summary" if ev else "Website Scan Report", S("t", fontName="Helvetica-Bold", fontSize=17, textColor=NAVY, leading=21, spaceAfter=5)))
    story.append(Paragraph(f"{escape(str(scan.get('url','')))} &nbsp;·&nbsp; {scan.get('date','')}", S("u", fontName="Helvetica-Bold", fontSize=11, textColor=colors.HexColor("#22272e"), spaceAfter=3)))
    story.append(Paragraph(f"Checked against GIGW 3.0, WCAG 2.2 AA and Core Web Vitals · this URL has been "
                 f"scanned <b>{scan.get('scan_count', 1)}</b> time(s) on GovUX.", small))
    story.append(Spacer(1, 6)); story.append(HRFlowable(width="100%", thickness=1.2, color=NAVY)); story.append(Spacer(1, 10))

    overall = scan.get("overall_score", 0); band = scan.get("band", "E")
    def kpi(big, lab, col, size=22):
        return [Paragraph(f"<b>{big}</b>", S("k", fontName="Helvetica-Bold", fontSize=size, alignment=TA_CENTER, textColor=col, leading=size+2)),
                Paragraph(lab, S("kl", fontSize=8, alignment=TA_CENTER, textColor=MUTED, leading=10))]
    a = kpi(f"{overall}", "GOVUX SCORE / 100", NAVY)
    b = kpi(band, "BAND (A–E)", _bandcol(band))
    cwv = scan.get("cwv") or {}
    lcp = cwv.get("lcp_ms")
    c = kpi(f"{round(lcp/1000,1)}s" if lcp else "—", "LOAD (LCP)", _tier(100 if (lcp or 9999) < 2500 else 40) if lcp else MUTED)
    summ = Table([[a[0], b[0], c[0]], [a[1], b[1], c[1]]], colWidths=[57*mm]*3)
    summ.setStyle(TableStyle([("BACKGROUND", (0,0), (-1,-1), GREY), ("BOX",(0,0),(-1,-1),0.5,LINE),
        ("INNERGRID",(0,0),(-1,-1),0.5,LINE), ("TOPPADDING",(0,0),(-1,0),10), ("BOTTOMPADDING",(0,1),(-1,1),8),
        ("VALIGN",(0,0),(-1,-1),"MIDDLE")]))
    story.append(summ); story.append(Spacer(1, 12))

    story.append(Paragraph("Category scorecard", S("h", fontName="Helvetica-Bold", fontSize=12, textColor=NAVY, spaceAfter=4)))
    rows = [[Paragraph("Category", cellB), Paragraph("Weight", cellB), Paragraph("Score /100", cellB)]]
    lab = {"accessibility":"Accessibility (WCAG 2.2 AA)","usability":"Usability","gigw":"GIGW 3.0",
           "design":"Design (UX4G)","performance":"Speed (Core Web Vitals)","responsiveness":"Works on phones & browsers",
           "content":"Content","trust":"Trust & security"}
    for cat in scan.get("categories", []):
        sc = cat["score"]
        rows.append([Paragraph(lab.get(cat["category"], cat["category"]), cellL),
                     Paragraph(f"{cat['weight']:g}", cellL),
                     Paragraph(f"<b>{sc:g}</b>", S("sx", fontName="Helvetica-Bold", fontSize=9, alignment=TA_CENTER, textColor=colors.white))])
    t = Table(rows, colWidths=[92*mm, 30*mm, 30*mm])
    ts = [("BACKGROUND",(0,0),(-1,0),NAVY),("TEXTCOLOR",(0,0),(-1,0),colors.white),("FONTNAME",(0,0),(-1,0),"Helvetica-Bold"),
          ("FONTSIZE",(0,0),(-1,0),8.3),("ALIGN",(1,0),(-1,-1),"CENTER"),("VALIGN",(0,0),(-1,-1),"MIDDLE"),
          ("GRID",(0,0),(-1,-1),0.4,LINE),("TOPPADDING",(0,0),(-1,-1),4.5),("BOTTOMPADDING",(0,0),(-1,-1),4.5),("LEFTPADDING",(0,0),(-1,-1),6)]
    for i, cat in enumerate(scan.get("categories", []), 1):
        ts.append(("BACKGROUND",(2,i),(2,i),_tier(cat["score"])))
        if i % 2 == 0: ts.append(("BACKGROUND",(0,i),(1,i),colors.HexColor("#fafbfc")))
    t.setStyle(TableStyle(ts)); story.append(t); story.append(Spacer(1, 12))

    findings = scan.get("findings", [])
    story.append(Paragraph(f"Top findings ({len(findings)})", S("h2", fontName="Helvetica-Bold", fontSize=12, textColor=NAVY, spaceAfter=4)))
    sevcol = {"critical": RED, "high": AMBER, "medium": MUTED, "low": MUTED}
    frows = [[Paragraph("Severity", cellB), Paragraph("Issue", cellB), Paragraph("Category", cellB)]]
    for f in findings[:15]:
        col = sevcol.get(f.get("severity"), MUTED)
        frows.append([Paragraph(f'<font color="#{col.hexval()[2:]}"><b>{escape(str(f.get("severity","")).upper())}</b></font>', S("sv", fontSize=7.6)),
                      Paragraph(escape((f.get("title") or f.get("guideline") or "").strip()), cellL),
                      Paragraph(escape(str(f.get("category", ""))), cellL)])
    if len(frows) == 1:
        frows.append([Paragraph("—", cellL), Paragraph("No automated issues found on this page.", cellL), Paragraph("", cellL)])
    ft = Table(frows, colWidths=[22*mm, 100*mm, 30*mm])
    ft.setStyle(TableStyle([("BACKGROUND",(0,0),(-1,0),NAVY),("TEXTCOLOR",(0,0),(-1,0),colors.white),
        ("FONTNAME",(0,0),(-1,0),"Helvetica-Bold"),("FONTSIZE",(0,0),(-1,0),8.3),("VALIGN",(0,0),(-1,-1),"TOP"),
        ("GRID",(0,0),(-1,-1),0.4,LINE),("TOPPADDING",(0,0),(-1,-1),4),("BOTTOMPADDING",(0,0),(-1,-1),4),("LEFTPADDING",(0,0),(-1,-1),6),
        ("ROWBACKGROUNDS",(0,1),(-1,-1),[colors.white, colors.HexColor("#fafbfc")])]))
    story.append(ft); story.append(Spacer(1, 12))

    if ev:
        story.append(Paragraph("Summary sheet of a full automated audit — see report.json in this pack for the "
            "complete evidence. Automated testing catches ~30–40% of accessibility issues; the legal compliance "
            "verdict is reported separately and reaches 'compliant' only after expert review.", small))
    else:
        story.append(Paragraph("This is a free single-page automated scan. Automated testing catches ~30–40% of "
            "accessibility issues; a full audit adds a multi-page crawl and expert review. Register with a "
            "government email to scan up to 10 pages and save reports.", small))

    def footer(cv, doc):
        cv.saveState(); cv.setStrokeColor(LINE); cv.setLineWidth(0.5); cv.line(18*mm, 13*mm, 192*mm, 13*mm)
        cv.setFont("Helvetica", 7.3); cv.setFillColor(MUTED)
        cv.drawString(18*mm, 9*mm, "GovUX Audit Platform · " + ("evidence pack" if ev else "free scan") + " · MeitY / NIC")
        cv.drawRightString(192*mm, 9*mm, f"Page {doc.page}")
        cv.restoreState()

    buf = BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A4, leftMargin=18*mm, rightMargin=18*mm, topMargin=16*mm, bottomMargin=16*mm,
                            title=f"GovUX scan — {scan.get('host','')}")
    doc.build(story, onFirstPage=footer, onLaterPages=footer)
    return buf.getvalue()
