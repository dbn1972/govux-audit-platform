"""Guidance for every guideline id the audit engine can emit.

The UX4G mastersheet covers the human-judged half of an audit; it does not cover
what the crawler detects. That left roughly two-thirds of the findings on a real
report carrying an id and a severity but no explanation of what to do — a
department could see it had failed without being told how to pass.

These entries are the automated half of the library. Ids match exactly what
audit_engine/runner.js writes (see rules.js for the WCAG and GIGW mappings), so
every finding joins to guidance. Idempotent: safe to re-run after adding a
detector.

    docker compose exec api python -m app.seed_engine_guidelines

Deliberately NOT covered: the legacy coarse ids (WCAG2A, WCAG2AA, GIGW) that the
engine emitted before findings recorded a specific rule. Those are historical
rows only — inventing library entries for them would imply a rule that never
existed.
"""
from __future__ import annotations

from .database import SessionLocal
from . import models

# (id, category, title, issue, advice, good_example)
#
# The first block below is the original hand-written seed. Those rows already
# carried a title and a good_example but predate the issue/advice columns, so
# they joined to findings and then displayed nothing. They are merged here
# rather than replaced — good_example is only filled when blank.
WCAG: list[tuple[str, ...]] = [
    ("WCAG-1.1.1", "Accessibility", "Non-text Content",
     "Images, icons and charts have no text alternative, so their meaning is lost to anyone "
     "using a screen reader or with images disabled.",
     "Give every informative image alt text that conveys its meaning, not its filename. Mark "
     "purely decorative images alt=\"\" so they are skipped. Describe charts in adjacent text.",
     ""),
    ("WCAG-1.4.3", "Accessibility", "Contrast (Minimum)",
     "Text does not reach 4.5:1 against its background (3:1 for large text), so it is hard to "
     "read in sunlight, on a cheap screen, or with low vision.",
     "Raise the contrast of text against its actual background — remember a tinted badge is "
     "not white. Check the state you ship, including hover, disabled and placeholder text.",
     ""),
    ("WCAG-2.1.1", "Accessibility", "Keyboard",
     "Functionality cannot be reached or operated with a keyboard alone, blocking users who "
     "cannot use a mouse and anyone using switch or voice control.",
     "Make every control reachable by Tab and operable by Enter/Space. Use real <button> and "
     "<a> elements rather than click handlers on <div>s.",
     ""),
    ("WCAG-2.4.7", "Accessibility", "Focus Visible",
     "The keyboard focus indicator is removed or invisible, so a keyboard user cannot tell "
     "where they are on the page.",
     "Never set outline:none without an equally visible replacement. Ensure the focus style "
     "has sufficient contrast against both the control and the page.",
     ""),
    ("WCAG-2.5.8", "Accessibility", "Target Size (Minimum)",
     "Interactive targets are smaller than 24×24 CSS pixels with no spacing, so they are hard "
     "to hit accurately on a phone or with a tremor.",
     "Give controls at least 24×24px of clickable area — padding counts. Space adjacent small "
     "targets apart, especially icon-only buttons in toolbars and tables.",
     ""),
    ("WCAG-3.1.1", "Accessibility", "Language of Page",
     "The page does not declare its language, so a screen reader reads it with the wrong "
     "pronunciation rules — English phonetics applied to Hindi, or vice versa.",
     "Set a correct lang attribute on the <html> element of every page, matching the language "
     "the content is actually written in.",
     ""),
    ("WCAG-3.3.2", "Accessibility", "Labels or Instructions",
     "Form fields have no visible label, or rely on placeholder text that disappears as soon "
     "as the user types.",
     "Give every field a persistent <label> tied to it with for/id. State the required format "
     "before the field, not only in an error afterwards.",
     ""),
    ("WCAG-4.1.2", "Accessibility", "Name, Role, Value",
     "A control has no accessible name, or a custom widget does not expose its role and state, "
     "so assistive technology announces “button” with no indication of what it does.",
     "Prefer native HTML elements. Where a custom widget is unavoidable, set the correct role, "
     "an accessible name, and keep aria-expanded/checked/selected in step with reality.",
     ""),
    ("WCAG-1.2.1", "Accessibility", "Audio-only and Video-only (Prerecorded)",
     "Prerecorded audio or video carries information with no text alternative, so it is "
     "unavailable to anyone who cannot hear or see it.",
     "Publish a transcript beside audio-only media, and either a transcript or an audio "
     "description for video-only media.",
     "A recorded circular is published with a full text transcript on the same page."),
    ("WCAG-1.2.2", "Accessibility", "Captions (Prerecorded)",
     "Prerecorded video with speech has no captions, excluding deaf and hard-of-hearing users "
     "and anyone in a noisy or sound-off setting.",
     "Add synchronised captions covering speech and meaningful sound. Auto-captions must be "
     "corrected — names, schemes and place names are routinely mis-transcribed.",
     "A scheme explainer video carries reviewed Hindi and English captions."),
    ("WCAG-1.3.1", "Accessibility", "Info and Relationships",
     "Structure is conveyed only by how it looks — bold text used as a heading, layout tables, "
     "or lists built from line breaks. Assistive technology sees an undifferentiated blob.",
     "Use real semantic markup: h1–h6 for headings, <ul>/<ol> for lists, <table> with <th> for "
     "data, <label> tied to each field, <fieldset>/<legend> for grouped inputs.",
     "Section headings are <h2>, not styled <div>s."),
    ("WCAG-1.3.4", "Accessibility", "Orientation",
     "Content is locked to portrait or landscape, which blocks users with a fixed-mounted "
     "device or those who cannot rotate it.",
     "Do not restrict orientation unless it is essential. Remove orientation locks and let "
     "the layout reflow.",
     "The page is usable in both portrait and landscape on a tablet."),
    ("WCAG-1.3.5", "Accessibility", "Identify Input Purpose",
     "Common fields (name, phone, address) lack autocomplete attributes, so browsers cannot "
     "fill them and users with memory or motor difficulties must retype every time.",
     "Add the correct autocomplete token to each field collecting information about the user "
     "— autocomplete=\"name\", \"tel\", \"email\", \"postal-code\".",
     "<input name=\"mobile\" autocomplete=\"tel\">"),
    ("WCAG-1.4.1", "Accessibility", "Use of Color",
     "Colour alone carries meaning — a red field for an error, a green dot for status — so "
     "colour-blind users and those on monochrome displays lose the information.",
     "Pair every colour cue with text, an icon or a pattern.",
     "An invalid field is red AND shows the message “Enter a valid PIN code”."),
    ("WCAG-1.4.2", "Accessibility", "Audio Control",
     "Audio plays automatically for more than three seconds with no way to stop it, drowning "
     "out screen-reader speech.",
     "Do not autoplay audio. If it must, provide a pause/stop control at the very start of "
     "the page.",
     "A background video is muted by default and has a visible mute toggle."),
    ("WCAG-1.4.4", "Accessibility", "Resize Text",
     "Text cannot be enlarged to 200% without loss of content or function — usually a fixed "
     "px height, an overflow:hidden container, or a viewport that blocks zoom.",
     "Size text in relative units, let containers grow, and never set user-scalable=no or "
     "maximum-scale on the viewport meta tag.",
     "At 200% browser zoom every label and button remains readable and reachable."),
    ("WCAG-1.4.12", "Accessibility", "Text Spacing",
     "Increasing line height or letter spacing clips or overlaps text, which blocks users who "
     "adjust spacing for dyslexia or low vision.",
     "Avoid fixed heights on text containers; allow them to expand. Test with increased "
     "line-height, letter-spacing, word-spacing and paragraph spacing.",
     "Card text reflows rather than truncating when spacing is increased."),
    ("WCAG-2.2.1", "Accessibility", "Timing Adjustable",
     "A session or form times out with no warning and no way to extend, so users who read or "
     "type slowly lose their work.",
     "Warn before a timeout and offer to extend, or remove the limit. Preserve entered data "
     "across re-authentication.",
     "A 20-minute form session warns at 19 minutes with a “stay signed in” action."),
    ("WCAG-2.2.2", "Accessibility", "Pause, Stop, Hide",
     "Content moves, blinks or auto-updates for more than five seconds with no control — "
     "carousels and scrolling tickers are the usual cause. It is a barrier for users with "
     "attention or reading difficulties.",
     "Provide a visible pause/stop control for any auto-advancing content, or do not "
     "auto-advance.",
     "A homepage banner carousel has a pause button and stops on focus or hover."),
    ("WCAG-2.4.1", "Accessibility", "Bypass Blocks",
     "There is no way to skip repeated navigation, so a keyboard or screen-reader user tabs "
     "through the whole menu on every page.",
     "Add a “Skip to main content” link as the first focusable element, and mark the main "
     "region with <main>.",
     "A skip link becomes visible on first Tab and jumps focus to <main>."),
    ("WCAG-2.4.2", "Accessibility", "Page Titled",
     "The page title is missing, generic (“Home”, “Untitled”) or identical across pages, so "
     "users cannot tell tabs, history entries or bookmarks apart.",
     "Give every page a unique, descriptive <title> that leads with the page topic and ends "
     "with the department name.",
     "<title>Track your application — India Post</title>"),
    ("WCAG-2.4.4", "Accessibility", "Link Purpose (In Context)",
     "Link text does not say where it goes — “click here”, “read more”, or a bare URL. Screen "
     "reader users listing links hear nothing useful.",
     "Write link text that describes the destination on its own. If the visible text must "
     "stay short, extend it with aria-label or visually-hidden text.",
     "“Download the 2026 citizen charter (PDF, 1.2 MB)” instead of “Click here”."),
    ("WCAG-2.5.3", "Accessibility", "Label in Name",
     "A control's visible text is not part of its accessible name, so a speech-input user "
     "saying what they see does not activate it.",
     "Ensure the accessible name contains the visible label text — keep aria-label consistent "
     "with what is printed on the control, or drop it and let the text be the name.",
     "A button reading “Submit application” has the accessible name “Submit application”."),
    ("WCAG-3.1.2", "Accessibility", "Language of Parts",
     "A passage in another language is not marked, so a screen reader pronounces Hindi with "
     "English phonetics (or vice versa) and it becomes unintelligible.",
     "Mark inline language changes with a lang attribute on the surrounding element.",
     "<span lang=\"hi\">भारत सरकार</span> inside an English page."),
]

GIGW = [
    ("GIGW-6.2", "Trust & Security", "Website Security (HTTPS)",
     "The site is served over plain HTTP, or mixes HTTP assets into an HTTPS page. Citizens "
     "see a “Not secure” warning and anything they submit can be read in transit.",
     "Serve every page and asset over HTTPS with a valid certificate, redirect HTTP "
     "permanently, and enable HSTS.",
     ""),
    ("GIGW-accessibility-statement", "Mandatory Elements", "Accessibility Statement",
     "No accessibility statement, so citizens cannot tell what conformance is claimed, what "
     "is known to be non-conforming, or how to report a barrier.",
     "Publish an accessibility statement giving the conformance level claimed, known "
     "exceptions, the date last reviewed, and a contact route for reporting problems. Link it "
     "from the footer of every page.",
     ""),
    ("GIGW-contact-info", "Mandatory Elements", "Contact Information",
     "No contact details, leaving a citizen with a question or complaint no route to a person.",
     "Publish a contact page with a postal address, a working phone number with its hours, and "
     "an official email address. Link it from the footer of every page.",
     ""),
    ("GIGW-content-freshness", "Mandatory Elements", "Last Updated / Reviewed Date",
     "Pages carry no last-updated date, so a citizen cannot tell whether a scheme, form or "
     "circular is current — and stale government information causes wasted journeys.",
     "Show a last updated or last reviewed date on every content page, and update it when the "
     "content genuinely changes.",
     ""),
    ("GIGW-hyperlinking-policy", "Mandatory Elements", "Hyperlinking Policy",
     "No hyperlinking policy, so the terms for linking to and from the site are undefined.",
     "Publish a hyperlinking policy stating how others may link to the site and the department's "
     "position on outbound links. Link it from the footer.",
     ""),
    ("GIGW-rti", "Mandatory Elements", "Right to Information (RTI)",
     "No RTI link. Publishing the RTI route is a statutory obligation under the Right to "
     "Information Act 2005, not a matter of site design.",
     "Publish an RTI section naming the Public Information Officer, the appellate authority "
     "and how to file a request, and link it prominently from the footer or main navigation.",
     ""),
    ("GIGW-copyright-policy", "Mandatory Elements", "Copyright Policy",
     "No copyright policy link, so users do not know how the material may be reused.",
     "Publish a copyright policy and link it from the footer of every page.",
     "Footer carries “Copyright Policy” alongside Terms and Privacy."),
    ("GIGW-privacy-policy", "Mandatory Elements", "Privacy Policy",
     "No privacy policy, which is both a GIGW requirement and a DPDP Act expectation for any "
     "site collecting personal data.",
     "Publish a privacy policy stating what is collected, why, how long it is kept and who to "
     "contact. Link it from the footer and from every form that collects data.",
     "Footer “Privacy Policy” link, plus a link beside each form's submit control."),
    ("GIGW-terms", "Mandatory Elements", "Terms of Use",
     "No terms of use, leaving the basis on which the service is offered undefined.",
     "Publish terms of use and link them from the footer of every page.", ""),
    ("GIGW-help-faq", "Mandatory Elements", "Help / FAQ",
     "No help or FAQ section, so users with a routine question have no option but to call or "
     "visit in person.",
     "Publish a help or FAQ section covering the most common tasks, written in plain language "
     "and reachable from the main navigation.", ""),
    ("GIGW-sitemap", "Mandatory Elements", "Sitemap",
     "No sitemap, so the full structure of the site is undiscoverable to users and to search "
     "engines.",
     "Publish an HTML sitemap linked from the footer, and an XML sitemap for crawlers.", ""),
    ("GIGW-search", "Mandatory Elements", "Site Search",
     "No search facility. On a large government portal, browsing alone is not a realistic way "
     "to find a specific form or notification.",
     "Provide a site search box in the header on every page, using a real <input type=\"search\"> "
     "with an accessible label.", ""),
    ("GIGW-feedback", "Mandatory Elements", "Feedback Mechanism",
     "No way to report a problem or give feedback, so faults go unreported and accessibility "
     "complaints have nowhere to land.",
     "Provide a feedback form or a clearly published contact route, and state the response "
     "time you commit to.", ""),
    ("GIGW-language-option", "Mandatory Elements", "Language Option",
     "No language switcher. Government services must be usable by citizens who do not read "
     "English.",
     "Offer at least Hindi and English, with a visible switcher in the header that preserves "
     "the current page, and set the lang attribute to match.", ""),
    ("GIGW-metadata-title", "Mandatory Elements", "Page Title Metadata",
     "The page <title> is missing or too short to identify the page in search results, "
     "bookmarks or browser tabs.",
     "Give each page a unique descriptive title of roughly 50–60 characters.", ""),
    ("GIGW-metadata-desc", "Mandatory Elements", "Meta Description",
     "No meta description, so search engines invent a snippet and citizens see arbitrary text "
     "in results.",
     "Add a meta description of roughly 150 characters summarising the page.", ""),
    ("GIGW-viewport", "Mandatory Elements", "Responsive Viewport",
     "No viewport meta tag, so mobile browsers render a desktop layout scaled down to "
     "illegibility. Most citizens reach government services on a phone.",
     "Add <meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">. Do not add "
     "user-scalable=no — it blocks zoom and fails WCAG 1.4.4.", ""),
]

ENGINE = [
    ("Security", "Trust & Security", "HTTP security headers",
     "Response headers that defend against clickjacking, MIME sniffing and downgrade attacks "
     "are missing.",
     "Set Strict-Transport-Security, Content-Security-Policy, X-Content-Type-Options: nosniff "
     "and X-Frame-Options (or CSP frame-ancestors) at the web server or CDN.", ""),
    ("Consent-banner", "Trust & Security", "Consent before non-essential cookies",
     "Non-essential cookies or trackers are set before the user has agreed to them.",
     "Set only strictly-necessary cookies on load. Load analytics and marketing tags after "
     "explicit consent, and make refusing as easy as accepting.", ""),
    ("DPDP-s6-consent", "Trust & Security", "DPDP s6 — consent for personal data",
     "Third-party trackers receive personal data without the free, specific, informed consent "
     "the Digital Personal Data Protection Act 2023 requires.",
     "Remove third-party trackers from pages handling personal data, or obtain and record "
     "consent before they load. Publish what each one collects.",
     "Analytics loads only after the citizen accepts, and never on the payment step."),
    ("Responsive", "Responsiveness", "Layout reflow at mobile widths",
     "Content overflows horizontally on a phone, forcing side-to-side scrolling to read a "
     "line of text.",
     "Use fluid widths and wrapping; avoid fixed pixel widths wider than the viewport. Make "
     "wide tables and code blocks scroll inside their own container, not the page.", ""),
    ("Cross-browser", "Responsiveness", "Cross-browser rendering",
     "The page renders or behaves differently across Chromium, Firefox and WebKit — script "
     "errors, missing images, or broken layout on one engine only.",
     "Test on all three engines. Avoid engine-specific APIs without a fallback, and fix "
     "console errors rather than tolerating them.", ""),
    ("Content-QA", "Content quality", "Broken links and content quality",
     "Links return 4xx/5xx, or content quality checks fail. Dead links on a government site "
     "erode trust quickly and often hide a withdrawn form or notification.",
     "Fix or remove broken links; redirect moved pages rather than deleting them. Run a link "
     "check before publishing.", ""),
    ("PDF-UA", "Accessibility", "Document accessibility (PDF/UA)",
     "Linked PDFs are untagged, so a screen reader cannot follow their headings, tables or "
     "reading order. Government forms and circulars are overwhelmingly PDFs.",
     "Publish an accessible HTML version alongside every PDF. Where a PDF is unavoidable, tag "
     "it (headings, alt text, table headers, reading order, document language).", ""),
    ("Integrity-overlay", "Accessibility", "Accessibility overlay detected",
     "A third-party accessibility overlay or widget is present. Overlays do not fix underlying "
     "barriers and can break assistive technology, while inflating automated scores.",
     "Remove the overlay and fix the underlying markup. Overlay presence caps the confidence "
     "of this audit — it cannot substitute for conformance.", ""),
    ("Integrity-gaming", "Trust & Security", "Compliance-theatre signals",
     "The page carries signals of gaming an automated audit rather than meeting the "
     "requirement — for example a claim of conformance without the underlying evidence.",
     "Remove the misleading signal and address the underlying guideline. This caps the "
     "compliance verdict; it never changes the score.", ""),
    ("ML-ADVISORY", "Content quality", "Advisory anomaly signal (ML)",
     "A machine-learning model flagged this result as unusual for its peer group. This is "
     "advisory only and never contributes to the score.",
     "Treat as a prompt for a human look, not a finding in itself. Confirm or dismiss it "
     "during expert review.", ""),
    ("Evidence", "Trust & Security", "Evidence could not be captured",
     "The site could not be reached from the audit network — timeout, WAF block or "
     "geo-restriction. No GovUX score is issued without real evidence.",
     "Confirm the site is reachable and allow-lists the audit egress addresses, then re-run "
     "the audit.", ""),
]


CWV = [
    ("CWV-LCP", "Performance", "Largest Contentful Paint (LCP)",
     "The main content takes too long to appear (target: under 2.5s). On the 3G and mid-range "
     "phones most citizens use, a slow LCP is the difference between a service being usable "
     "and being abandoned.",
     "Optimise and correctly size the hero image, preload it, serve modern formats, and remove "
     "render-blocking CSS and fonts from the critical path.",
     ""),
    ("CWV-INP", "Performance", "Interaction to Next Paint (INP)",
     "The page is slow to respond to taps and clicks (target: under 200ms), so users press "
     "twice and submit forms twice.",
     "Break up long JavaScript tasks, defer non-essential scripts, and avoid heavy work in "
     "input handlers.",
     ""),
    ("CWV-CLS", "Performance", "Cumulative Layout Shift (CLS)",
     "Content moves as the page loads (target: under 0.1), so a citizen taps the wrong control "
     "— which on a payment or consent screen matters a great deal.",
     "Reserve space for images, ads and embeds with explicit width/height or aspect-ratio, and "
     "never insert content above existing content after load.",
     ""),
]

UX4G_LEGACY = [
    ("UX4G-consistent-components", "Design", "Consistent Design Tokens & Components",
     "Components and styling are inconsistent across the site, so citizens have to relearn the "
     "interface page by page.",
     "Adopt the UX4G design tokens and component set, and use them consistently for buttons, "
     "forms, tables and navigation across every page.",
     ""),
    ("UX4G-lang", "Design", "Indic Language Switcher",
     "No visible Indic language switcher, so citizens who do not read English cannot use the "
     "service.",
     "Provide a language switcher in the header that is visible without scrolling, preserves "
     "the current page when switched, and sets the correct lang attribute.",
     ""),
    ("UX4G-mobile-first", "Design", "Mobile-First Responsive Layout",
     "The layout is designed for desktop and degraded for mobile, while the majority of "
     "citizens reach government services on a phone.",
     "Design for the smallest viewport first and enhance upward. Verify the primary task can "
     "be completed on a 360px-wide screen without horizontal scrolling.",
     ""),
]


def run() -> dict[str, int]:
    stats = {"inserted": 0, "updated": 0}
    db = SessionLocal()
    try:
        groups = [("WCAG", "WCAG 2.2", WCAG), ("GIGW", "GIGW 3.0", GIGW),
                  ("CWV", "Core Web Vitals", CWV), ("UX4G", "UX4G", UX4G_LEGACY),
                  ("GovUX", "GovUX engine", ENGINE)]
        for family, source, rows in groups:
            for gid, category, title, issue, advice, good in rows:
                g = db.get(models.Guideline, gid)
                if g is None:
                    g = models.Guideline(id=gid)
                    db.add(g)
                    stats["inserted"] += 1
                else:
                    stats["updated"] += 1
                g.family = family
                g.category = category
                g.title = title
                g.issue = issue
                g.advice = advice
                # only fill a blank: the original seed rows carry hand-written
                # good_example text from before this column existed, and passing
                # "" here would erase it.
                if good:
                    g.good_example = good
                # every id here is one the crawler decides on its own; these must
                # never appear in the human review checklist
                g.automation = "automated"
                g.source = source
                g.enforcement_level = g.enforcement_level or "Foundational"
        db.commit()
    finally:
        db.close()
    return stats


if __name__ == "__main__":
    s = run()
    print(f"{s['inserted']:>5}  inserted")
    print(f"{s['updated']:>5}  updated")
