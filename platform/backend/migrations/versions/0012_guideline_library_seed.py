"""Seed a starter guideline library — WCAG 2.2 AA / GIGW 3.0 / UX4G / CWV.

Data-only migration: before this, /v1/guidelines returned a single manually
inserted row ("Colour contrast"), leaving the library screen effectively
empty. IDs are chosen to match what the deterministic engine actually emits
as `Finding.guideline_id` where a real one exists (WCAG-2.5.8, WCAG-3.1.1,
UX4G-lang, GIGW-6.2 — see audit_engine/runner.js and gigw-rules.js); the rest
use descriptive slugs rather than invented clause numbers this repo can't
verify. CWV thresholds mirror services/crux.py's own _GOOD/_POOR constants.

Idempotent (ON CONFLICT DO NOTHING on the text primary key) so it never
clobbers the pre-existing WCAG-1.4.3 row or a re-run.

Revision ID: 0012_guideline_library_seed
Revises: 0011_external_assessments
Create Date: 2026-08-11
"""
from alembic import op

revision = "0012_guideline_library_seed"
down_revision = "0011_external_assessments"
branch_labels = None
depends_on = None

GUIDELINES = [
    # id, family, category, title, plain_language, good_example, version
    ("WCAG-1.1.1", "WCAG", "Accessibility", "Non-text Content",
     "Every image, icon or graphic that conveys meaning needs alt text a screen reader can announce. Purely decorative images should have empty alt (alt=\"\") so screen readers skip them.",
     'alt="Photo of the Minister inaugurating the new health centre" — not alt="image123.jpg" or a missing attribute.',
     "WCAG 2.2"),
    ("WCAG-1.4.3", "WCAG", "Accessibility", "Contrast (Minimum)",
     "Body text needs at least 4.5:1 contrast against its background (3:1 for large text, 18pt+ or 14pt+ bold) so low-vision users can read it.",
     "#1a1a1a text on #ffffff background (~16:1) clears the bar; light grey #999 on white (~2.8:1) does not.",
     "WCAG 2.2"),
    ("WCAG-2.1.1", "WCAG", "Accessibility", "Keyboard",
     "Every action available with a mouse — opening a menu, submitting a form, dismissing a modal — must also work using only a keyboard (Tab, Enter, Space, arrow keys).",
     "A dropdown built with <select> or a custom widget with correct tabindex/keydown handling, not a <div onclick> with no keyboard path.",
     "WCAG 2.2"),
    ("WCAG-2.4.7", "WCAG", "Accessibility", "Focus Visible",
     "When an element receives keyboard focus, there must be a visible indicator (outline, highlight) so a sighted keyboard user always knows where they are on the page.",
     "A clear 2px outline on the focused button, not CSS that sets outline: none without a replacement style.",
     "WCAG 2.2"),
    ("WCAG-2.5.8", "WCAG", "Accessibility", "Target Size (Minimum)",
     "Buttons, links and other clickable controls need at least a 24×24 CSS-pixel touch target so they're reliably tappable on a phone, especially for users with limited dexterity.",
     "A mobile nav icon with 44×44px of tappable area, not a 16px icon with no surrounding padding.",
     "WCAG 2.2 (new in 2.2)"),
    ("WCAG-3.1.1", "WCAG", "Accessibility", "Language of Page",
     "The page's primary language must be declared in the HTML (<html lang=\"hi\"> / \"en\") so screen readers use correct pronunciation rules.",
     '<html lang="en"> on an English page, <html lang="hi"> on a Hindi page — not a missing or wrong lang attribute.',
     "WCAG 2.2"),
    ("WCAG-3.3.2", "WCAG", "Accessibility", "Labels or Instructions",
     "Every form field needs a visible, programmatically associated label (or clear instructions) — not just a placeholder, which disappears once the user starts typing.",
     '<label for="mobile">Mobile number</label><input id="mobile"> — not an <input placeholder="Mobile number"> with no <label>.',
     "WCAG 2.2"),
    ("WCAG-4.1.2", "WCAG", "Accessibility", "Name, Role, Value",
     "Custom interactive components (built from <div>/<span> rather than native HTML controls) must expose a correct accessible name, role and state via ARIA so assistive tech understands them.",
     'A custom toggle with role="switch" aria-checked="true" and an accessible name, not an unlabelled clickable <div>.',
     "WCAG 2.2"),

    ("GIGW-6.2", "GIGW", "Trust & Security", "Website Security (HTTPS)",
     "Every page must be served over HTTPS, not plain HTTP, so citizen data in transit (including form submissions) is encrypted.",
     "https://service.gov.in loads without a mixed-content or insecure warning; http:// is absent or redirects to https://.",
     "GIGW 3.0"),
    ("GIGW-contact-info", "GIGW", "Mandatory Elements", "Contact Information",
     "A findable way to reach the department — phone/helpline number, email, or physical address — must be present, typically in the header, footer or a dedicated Contact Us page.",
     'A footer "Contact Us" link to a page listing a helpline number and email, not just a generic feedback form with no direct contact details.',
     "GIGW 3.0"),
    ("GIGW-rti", "GIGW", "Mandatory Elements", "Right to Information (RTI) Link",
     "Government sites must link to their RTI (Right to Information Act) disclosure page or the designated Public Information Officer's details.",
     'A footer link labelled "RTI" pointing to the department\'s RTI disclosure page.',
     "GIGW 3.0"),
    ("GIGW-accessibility-statement", "GIGW", "Mandatory Elements", "Accessibility Statement",
     "A published accessibility statement explains the site's conformance level, known limitations, and how to report an accessibility problem.",
     'A footer link "Accessibility" leading to a page stating WCAG 2.2 AA conformance and a contact for accessibility feedback.',
     "GIGW 3.0"),
    ("GIGW-hyperlinking-policy", "GIGW", "Mandatory Elements", "Hyperlinking Policy",
     "Sites that link to external (non-government) websites should publish a hyperlinking policy explaining that external content isn't endorsed or controlled by the department.",
     'A footer link "Hyperlinking Policy" explaining that external links open in a new tab and aren\'t endorsed content.',
     "GIGW 3.0"),
    ("GIGW-content-freshness", "GIGW", "Mandatory Elements", "Last Updated / Reviewed Date",
     "Pages — especially those with schemes, forms or notifications — should show when the content was last updated or reviewed, so citizens can judge whether it's current.",
     '"Page last reviewed: 15 Jul 2026" near the page footer, not content of unknown age with no timestamp.',
     "GIGW 3.0"),

    ("UX4G-lang", "UX4G", "Design", "Indic Language Switcher",
     "Sites offering content in Hindi or a regional language need a visible, easy-to-find language switcher — not just browser auto-translate — so citizens can read in their preferred language.",
     'A header control like "English | हिंदी" that actually swaps the page content, not a Google Translate widget bolted on as the only option.',
     "UX4G"),
    ("UX4G-mobile-first", "UX4G", "Design", "Mobile-First Responsive Layout",
     "Given most citizens access government services on low-end Android phones, layouts should be designed mobile-first: single-column, large tap targets, no horizontal scrolling at narrow widths.",
     "A form that reflows cleanly to one column at 360px width with no horizontal scrollbar, not a fixed-width desktop layout that gets clipped.",
     "UX4G"),
    ("UX4G-consistent-components", "UX4G", "Design", "Consistent Design Tokens & Components",
     "Buttons, form fields, alerts and navigation should use a single consistent visual language (colour, spacing, type) across the whole service, not ad hoc styling that differs page to page.",
     "The same primary-button style and spacing scale used on every screen of the service, not three different button shapes/colours across three pages.",
     "UX4G"),

    ("CWV-LCP", "CWV", "Performance", "Largest Contentful Paint (LCP)",
     "Measures perceived load speed — the time until the largest visible element (usually a hero image or heading) has rendered. Good: ≤2.5s. Poor: ≥4.0s.",
     "A citizen service homepage with its main content visible within 2 seconds on a typical 4G connection, not 6+ seconds of a blank/loading page.",
     "Core Web Vitals"),
    ("CWV-INP", "CWV", "Performance", "Interaction to Next Paint (INP)",
     "Measures responsiveness — the delay between a user's click/tap and the page visibly responding. Good: ≤200ms. Poor: ≥500ms.",
     "A submit button that visibly responds (loading spinner, page change) within 150ms of being tapped, not a UI that appears frozen for half a second.",
     "Core Web Vitals"),
    ("CWV-CLS", "CWV", "Performance", "Cumulative Layout Shift (CLS)",
     "Measures visual stability — how much content unexpectedly shifts as the page loads (e.g. an ad or image pushing a button down just as the user goes to tap it). Good: ≤0.10. Poor: ≥0.25.",
     "Images and ad slots with reserved width/height so the layout doesn't jump once they load, not content that reflows repeatedly during load.",
     "Core Web Vitals"),
]


def upgrade():
    conn = op.get_bind()
    for gid, family, category, title, plain, example, version in GUIDELINES:
        conn.exec_driver_sql(
            """INSERT INTO guidelines (id, family, category, title, plain_language, good_example, version)
               VALUES (%s, %s, %s, %s, %s, %s, %s)
               ON CONFLICT (id) DO NOTHING""",
            (gid, family, category, title, plain, example, version),
        )


def downgrade():
    conn = op.get_bind()
    ids = [g[0] for g in GUIDELINES]
    conn.exec_driver_sql(
        "DELETE FROM guidelines WHERE id = ANY(%s)", (ids,)
    )
