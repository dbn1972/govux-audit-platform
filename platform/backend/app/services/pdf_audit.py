"""PDF / document accessibility (gap G3).

Government runs on PDFs — forms, circulars, notifications — and citizens get
stuck there more than on any single web page. We check the machine-verifiable
accessibility signals (WCAG/PDF-UA basics): a tagged structure tree, a document
title, and a declared language. `assess` is pure and fully tested; the pypdf
extraction is a thin wrapper so the parser dependency stays isolated.
"""
from __future__ import annotations
from dataclasses import dataclass, field
from io import BytesIO

# penalty weights for each missing signal (sum <= 100)
_W = {"tagged": 40, "has_lang": 25, "has_title": 20, "scanned": 15}


@dataclass
class DocResult:
    url: str
    doc_type: str
    pages: int
    tagged: bool
    has_title: bool
    has_lang: bool
    score: float
    findings: list[dict] = field(default_factory=list)

    def as_row(self) -> dict:
        return {"url": self.url, "doc_type": self.doc_type, "pages": self.pages,
                "tagged": self.tagged, "has_title": self.has_title,
                "has_lang": self.has_lang, "score": self.score,
                "issue_count": len(self.findings)}


def assess(url: str, features: dict) -> DocResult:
    """Score a document from extracted features. Pure — no I/O."""
    tagged = bool(features.get("tagged"))
    has_title = bool(features.get("has_title"))
    has_lang = bool(features.get("has_lang"))
    pages = int(features.get("pages") or 0)
    scanned = bool(features.get("scanned"))   # image-only, no extractable text

    score = 100
    findings: list[dict] = []

    def fail(key, severity, title, effort="medium"):
        nonlocal score
        score -= _W[key]
        findings.append({"category": "accessibility", "severity": severity,
                         "guideline": "PDF-UA", "title": title, "effort": effort,
                         "element": url})

    if not tagged:
        fail("tagged", "critical", "PDF is not tagged (no structure tree)")
    if not has_lang:
        fail("has_lang", "high", "PDF has no declared language")
    if not has_title:
        fail("has_title", "medium", "PDF has no document title")
    if scanned:
        fail("scanned", "high", "PDF appears image-only (no extractable text)", "high")

    score = max(0, min(100, score))
    return DocResult(url, features.get("doc_type", "pdf"), pages,
                     tagged, has_title, has_lang, float(score), findings)


def extract_features(data: bytes) -> dict:  # pragma: no cover - thin pypdf wrapper
    """Pull accessibility features from PDF bytes using pypdf."""
    from pypdf import PdfReader
    reader = PdfReader(BytesIO(data))
    root = reader.trailer.get("/Root", {})
    mark_info = root.get("/MarkInfo", {}) or {}
    tagged = bool(mark_info.get("/Marked")) or ("/StructTreeRoot" in root)
    lang = root.get("/Lang")
    title = getattr(reader.metadata, "title", None) if reader.metadata else None
    pages = len(reader.pages)
    # heuristic: no extractable text across the doc => likely a scanned image
    text = ""
    for p in reader.pages[:3]:
        try:
            text += p.extract_text() or ""
        except Exception:
            pass
    return {"tagged": tagged, "has_lang": bool(lang), "has_title": bool(title),
            "pages": pages, "scanned": pages > 0 and len(text.strip()) == 0,
            "doc_type": "pdf"}


def audit_pdf_bytes(url: str, data: bytes) -> DocResult:
    """Full pipeline: extract features from bytes, then assess."""
    return assess(url, extract_features(data))
