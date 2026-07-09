"""Indic language / script detection (gap G6).

India has 22+ official languages across several scripts. Auditing must know which
script a page is actually in — to validate the declared <html lang>, to flag
missing language options, and to apply a script-appropriate readability model
instead of the English-only Flesch formula (which is meaningless for Devanagari).

Detection is by Unicode block coverage of the visible text — deterministic and
dependency-free (a fastText model can later refine this behind `detect_script`).
"""
from __future__ import annotations

# Unicode ranges for the major official scripts of India + Latin
_SCRIPTS = {
    "devanagari": (0x0900, 0x097F),   # Hindi, Marathi, etc.
    "bengali": (0x0980, 0x09FF),
    "gurmukhi": (0x0A00, 0x0A7F),     # Punjabi
    "gujarati": (0x0A80, 0x0AFF),
    "oriya": (0x0B00, 0x0B7F),
    "tamil": (0x0B80, 0x0BFF),
    "telugu": (0x0C00, 0x0C7F),
    "kannada": (0x0C80, 0x0CFF),
    "malayalam": (0x0D00, 0x0D7F),
    "latin": (0x0041, 0x024F),
}

# a reasonable default <html lang> for each script (for mismatch hints)
SCRIPT_LANG = {
    "devanagari": "hi", "bengali": "bn", "gurmukhi": "pa", "gujarati": "gu",
    "oriya": "or", "tamil": "ta", "telugu": "te", "kannada": "kn",
    "malayalam": "ml", "latin": "en",
}


def script_histogram(text: str) -> dict[str, int]:
    counts = {k: 0 for k in _SCRIPTS}
    for ch in text or "":
        cp = ord(ch)
        for name, (lo, hi) in _SCRIPTS.items():
            if lo <= cp <= hi:
                counts[name] += 1
                break
    return counts


def detect_script(text: str) -> str:
    """Dominant script by character count; 'unknown' if no letters seen."""
    counts = script_histogram(text)
    total = sum(counts.values())
    if total == 0:
        return "unknown"
    return max(counts, key=counts.get)


def is_indic(script: str) -> bool:
    return script not in ("latin", "unknown")


def lang_matches_script(html_lang: str | None, script: str) -> bool:
    """Does the declared <html lang> match the script actually rendered?"""
    if not html_lang or script == "unknown":
        return True   # nothing to contradict
    base = html_lang.split("-")[0].lower()
    expected = SCRIPT_LANG.get(script)
    if expected is None:
        return True
    return base == expected


def readability(text: str) -> float:
    """Script-aware readability 0..100. Latin -> Flesch reading-ease; Indic ->
    a length-based proxy (shorter words/sentences read easier), because Flesch's
    syllable model is English-specific."""
    words = [w for w in (text or "").split() if w]
    if len(words) < 30:
        return 70.0
    sentences = max(1, sum(text.count(p) for p in ".!?।॥"))  # incl. Devanagari danda
    script = detect_script(text)
    if script == "latin":
        syll = sum(_count_vowel_groups(w) for w in words) or len(words)
        flesch = 206.835 - 1.015 * (len(words) / sentences) - 84.6 * (syll / len(words))
        return max(0.0, min(100.0, round(flesch, 1)))
    # Indic proxy: penalise long sentences and long words
    avg_sentence = len(words) / sentences
    avg_word = sum(len(w) for w in words) / len(words)
    score = 110 - 2.2 * avg_sentence - 4.0 * avg_word
    return max(0.0, min(100.0, round(score, 1)))


def _count_vowel_groups(word: str) -> int:
    groups, prev = 0, False
    for ch in word.lower():
        v = ch in "aeiouy"
        if v and not prev:
            groups += 1
        prev = v
    return groups or 1
