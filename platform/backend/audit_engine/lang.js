// Indic language / script detection (gap G6) — mirrors app/services/language.py.
// Deterministic Unicode-block coverage; no dependencies.
const SCRIPTS = {
  devanagari: [0x0900, 0x097F], bengali: [0x0980, 0x09FF], gurmukhi: [0x0A00, 0x0A7F],
  gujarati: [0x0A80, 0x0AFF], oriya: [0x0B00, 0x0B7F], tamil: [0x0B80, 0x0BFF],
  telugu: [0x0C00, 0x0C7F], kannada: [0x0C80, 0x0CFF], malayalam: [0x0D00, 0x0D7F],
  latin: [0x0041, 0x024F],
};
const SCRIPT_LANG = {
  devanagari: "hi", bengali: "bn", gurmukhi: "pa", gujarati: "gu", oriya: "or",
  tamil: "ta", telugu: "te", kannada: "kn", malayalam: "ml", latin: "en",
};

export function detectScript(text) {
  const counts = {};
  for (const k of Object.keys(SCRIPTS)) counts[k] = 0;
  for (const ch of text || "") {
    const cp = ch.codePointAt(0);
    for (const [name, [lo, hi]] of Object.entries(SCRIPTS)) {
      if (cp >= lo && cp <= hi) { counts[name]++; break; }
    }
  }
  let best = "unknown", max = 0;
  for (const [k, v] of Object.entries(counts)) if (v > max) { max = v; best = k; }
  return max === 0 ? "unknown" : best;
}
export const isIndic = (s) => s !== "latin" && s !== "unknown";

export function langMatchesScript(htmlLang, script) {
  if (!htmlLang || script === "unknown") return true;
  const base = htmlLang.split("-")[0].toLowerCase();
  const expected = SCRIPT_LANG[script];
  return expected == null ? true : base === expected;
}

function vowelGroups(word) {
  let g = 0, prev = false;
  for (const ch of word.toLowerCase()) {
    const v = "aeiouy".includes(ch);
    if (v && !prev) g++;
    prev = v;
  }
  return g || 1;
}

// Script-aware readability 0..100. Latin -> Flesch; Indic -> length proxy.
export function readability(text) {
  const words = (text || "").split(/\s+/).filter(Boolean);
  if (words.length < 30) return 70;
  const sentences = Math.max(1, (text.match(/[.!?।॥]/g) || []).length);
  const script = detectScript(text);
  if (script === "latin") {
    const syll = words.reduce((a, w) => a + vowelGroups(w), 0) || words.length;
    const flesch = 206.835 - 1.015 * (words.length / sentences) - 84.6 * (syll / words.length);
    return Math.max(0, Math.min(100, Math.round(flesch)));
  }
  const avgSentence = words.length / sentences;
  const avgWord = words.reduce((a, w) => a + w.length, 0) / words.length;
  return Math.max(0, Math.min(100, Math.round(110 - 2.2 * avgSentence - 4.0 * avgWord)));
}
