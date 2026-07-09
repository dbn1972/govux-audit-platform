"""AI-assisted remediation guidance (gap G5).

Deterministic, rule-based mapping from a finding to plain-language fix guidance
and an impact x effort priority. This is ADVISORY only and is deliberately kept
out of the numeric score path (domain rule 4) — it annotates findings, never
changes the band. A future LLM can enrich `guidance_for` behind the same
interface, routed to human review below a confidence threshold.
"""
from dataclasses import dataclass

# severity -> citizen-impact weight; effort -> cost weight (both 1..4)
_IMPACT = {"critical": 4, "high": 3, "medium": 2, "low": 1}
_EFFORT = {"low": 1, "medium": 2, "high": 3}

# keyword -> (plain guidance, code/authoring hint) keyed on guideline/title tokens
_RULES: list[tuple[tuple[str, ...], str, str]] = [
    (("wcag2.1.1", "keyboard"),
     "Make every interactive control operable by keyboard alone.",
     "Use native <button>/<a>; ensure focus order and visible :focus styles; no mouse-only handlers."),
    (("color-contrast", "1.4.3", "contrast"),
     "Raise text/background contrast to at least 4.5:1 (3:1 for large text).",
     "Adjust UX4G token --ux-navy against its background; verify with a contrast checker."),
    (("image-alt", "1.1.1", "alternate text", "alt text", "images must have"),
     "Give every meaningful image a text alternative; mark decorative images empty.",
     'Add alt="…" describing purpose, or alt="" + role="presentation" for decorative images.'),
    (("label", "3.3.2", "labeledinputs"),
     "Associate a visible label with every form field.",
     'Use <label for="id"> or wrap the control; aria-label only when a visible label is impossible.'),
    (("discernible text", "link text", "link name", "link has no", "buttons must have", "2.4.4"),
     "Give the control text assistive tech can read — a visible label, or aria-label for icon-only buttons/links.",
     "Add visible text or aria-label to the button/link; avoid bare 'click here' or icon-only controls."),
    (("touch target", "target size", "24px", "2.5.8"),
     "Enlarge tap targets to at least 24x24px with spacing between them.",
     "Increase padding / min-height; space adjacent interactive controls apart."),
    (("https", "6.2", "not served over https"),
     "Serve the whole site over HTTPS and redirect HTTP.",
     "Install a valid TLS certificate; add a 301 http->https redirect and HSTS."),
    (("security header", "hsts", "csp", "x-frame", "x-content-type"),
     "Add the missing HTTP security headers.",
     "Set Strict-Transport-Security, Content-Security-Policy, X-Content-Type-Options, X-Frame-Options."),
    (("responsive", "overflow"),
     "Eliminate horizontal overflow on small viewports.",
     "Use max-width:100%, flexible grids and relative units; avoid fixed pixel widths."),
    (("lang", "language"),
     "Declare the page language and offer the citizen's language.",
     'Set <html lang="hi"> (or the correct code); provide a working language switcher.'),
    (("last updated", "last reviewed"),
     "Show a visible 'last updated / reviewed on' date (GIGW mandate).",
     "Render a dated footer stamp maintained by the CMS."),
    (("mandatory element", "sitemap", "privacy", "copyright", "terms",
      "accessibility statement", "hyperlink", "rti", "feedback"),
     "Add the mandatory GIGW policy/utility link.",
     "Link the required policy page in the standard footer navigation."),
    (("broken link", "4xx", "5xx"),
     "Fix or remove links that no longer resolve.",
     "Update the target URL, restore the page, or delete the dead link."),
    (("overlay",),
     "Remove the accessibility overlay widget and fix the underlying markup.",
     "Overlays (accessiBe/UserWay-type) create legal risk and false compliance — remediate the DOM instead."),
    (("pdf", "document", "tagged"),
     "Make the document accessible: tags, title and language.",
     "Export a tagged PDF with a document title and language; add real headings and alt text."),
]

_DEFAULT = ("Review this issue against the cited guideline and remediate the underlying markup.",
            "See the guideline library entry for authoring guidance.")


@dataclass
class Guidance:
    remediation: str
    code_hint: str
    priority: int   # higher = fix sooner (impact x effort-inverse)


def _match(text: str) -> tuple[str, str]:
    t = text.lower()
    for keys, guidance, hint in _RULES:
        if any(k in t for k in keys):
            return guidance, hint
    return _DEFAULT


def priority_score(severity: str, effort: str | None) -> int:
    """Impact x effort-inverse: high-impact, low-effort fixes rank highest."""
    impact = _IMPACT.get((severity or "").lower(), 1)
    cost = _EFFORT.get((effort or "medium").lower(), 2)
    return round(impact * (4 - cost))   # 1..12


def guidance_for(finding: dict) -> Guidance:
    # match on the specific guideline + title only — NOT the broad `category`,
    # whose value ("accessibility") would collide with keyword rules
    text = " ".join(str(finding.get(k, "")) for k in ("guideline", "title"))
    remediation, hint = _match(text)
    return Guidance(remediation, hint,
                    priority_score(finding.get("severity"), finding.get("effort")))


def prioritise(findings: list[dict]) -> list[dict]:
    """Return findings annotated with guidance, sorted most-urgent first."""
    out = []
    for f in findings:
        g = guidance_for(f)
        out.append({**f, "remediation": g.remediation, "code_hint": g.code_hint,
                    "priority": g.priority})
    out.sort(key=lambda x: x["priority"], reverse=True)
    return out
