/**
 * Smart distractor generation for Kältetechnik Multiple Choice.
 *
 * Strategy: mutate the CORRECT answer text using domain-specific rules
 * so each wrong option looks structurally identical but contains exactly
 * one expert-level error. Fallback to same-block answers only as last resort.
 */

export interface MCOption {
  text: string;
  isCorrect: boolean;
  hint: string; // shown in feedback after answering
}

// ─────────────────────────────────────────────────────────────────────────────
// 1.  Term-swap table
//     Each entry: [term_A, term_B, hint_when_A_replaced_by_B, hint_when_B_replaced_by_A]
//     Applied bidirectionally.
// ─────────────────────────────────────────────────────────────────────────────
const TERM_SWAPS: [string, string, string, string][] = [
  [
    "Überhitzung", "Unterkühlung",
    "Überhitzung und Unterkühlung wurden vertauscht – Überhitzung betrifft den Dampf am Verdampferaustritt, Unterkühlung die Flüssigkeit vor dem Expansionsorgan.",
    "Unterkühlung und Überhitzung wurden vertauscht – Unterkühlung betrifft die Flüssigkeit vor dem Expansionsorgan, Überhitzung den Dampf am Verdampferaustritt.",
  ],
  [
    "Verdampfer", "Verflüssiger",
    "Verdampfer und Verflüssiger wurden vertauscht – im Verdampfer nimmt das Kältemittel Wärme auf, im Verflüssiger gibt es Wärme ab.",
    "Verflüssiger und Verdampfer wurden vertauscht – im Verflüssiger gibt das Kältemittel Wärme ab, im Verdampfer nimmt es Wärme auf.",
  ],
  [
    "Verdichter", "Expansionsorgan",
    "Verdichter und Expansionsorgan wurden vertauscht – der Verdichter erhöht den Druck, das Expansionsorgan senkt ihn.",
    "Expansionsorgan und Verdichter wurden vertauscht – das Expansionsorgan drosselt und senkt den Druck, der Verdichter erhöht ihn.",
  ],
  [
    "Verdampfungstemperatur", "Verflüssigungstemperatur",
    "Verdampfungstemperatur und Verflüssigungstemperatur wurden verwechselt – die Verdampfungstemperatur liegt unterhalb der Kühlraumtemperatur, die Verflüssigungstemperatur über der Umgebungstemperatur.",
    "Verflüssigungstemperatur und Verdampfungstemperatur wurden verwechselt – die Verflüssigungstemperatur liegt über der Umgebungstemperatur, die Verdampfungstemperatur unter der Kühlraumtemperatur.",
  ],
  [
    "gasförmig", "flüssig",
    "Die Aggregatzustände wurden vertauscht – hier handelt es sich um den gasförmigen Zustand (Dampf), nicht um den flüssigen.",
    "Die Aggregatzustände wurden vertauscht – hier handelt es sich um den flüssigen Zustand, nicht um den gasförmigen.",
  ],
  [
    "Hochdruck", "Niederdruck",
    "Hoch- und Niederdruckseite wurden verwechselt – die Hochdruckseite liegt zwischen Verdichter und Expansionsorgan.",
    "Nieder- und Hochdruckseite wurden verwechselt – die Niederdruckseite liegt zwischen Expansionsorgan und Verdichter.",
  ],
  [
    "steigt", "sinkt",
    "Die Richtung der Zustandsänderung wurde umgekehrt – ein Anstieg wurde fälschlich als Abfall dargestellt.",
    "Die Richtung der Zustandsänderung wurde umgekehrt – ein Abfall wurde fälschlich als Anstieg dargestellt.",
  ],
  [
    "erhöht", "verringert",
    "Die Änderungsrichtung wurde vertauscht – erhöht bedeutet eine Zunahme, nicht eine Abnahme.",
    "Die Änderungsrichtung wurde vertauscht – verringert bedeutet eine Abnahme, nicht eine Zunahme.",
  ],
  [
    "zugeführt", "abgeführt",
    "Wärmezufuhr und Wärmeabfuhr wurden vertauscht – bei diesem Prozess wird Wärme zugeführt, nicht abgeführt.",
    "Wärmeabfuhr und Wärmezufuhr wurden vertauscht – bei diesem Prozess wird Wärme abgeführt, nicht zugeführt.",
  ],
  [
    "Saugseite", "Druckseite",
    "Saug- und Druckseite wurden verwechselt – die Saugseite führt Niederdruckgas zum Verdichter.",
    "Druck- und Saugseite wurden verwechselt – die Druckseite führt Hochdruckgas vom Verdichter zum Verflüssiger.",
  ],
  [
    "Absolutdruck", "Überdruck",
    "Absolutdruck und Überdruck wurden verwechselt – der Absolutdruck bezieht sich auf das Vakuum (0 bar abs), der Überdruck (Manometerdruck) auf den Atmosphärendruck.",
    "Überdruck und Absolutdruck wurden verwechselt – der Manometerdruck zeigt 0 bar bei Atmosphärendruck, der Absolutdruck bezieht sich auf das absolute Vakuum.",
  ],
  [
    "Schmelzen", "Erstarren",
    "Schmelzen und Erstarren wurden vertauscht – beim Schmelzen geht Stoff von fest nach flüssig über (Wärme wird zugeführt).",
    "Erstarren und Schmelzen wurden vertauscht – beim Erstarren geht Stoff von flüssig nach fest über (Wärme wird abgeführt).",
  ],
  [
    "Verdampfen", "Verflüssigen",
    "Verdampfen und Verflüssigen wurden vertauscht – beim Verdampfen geht Stoff von flüssig nach gasförmig über (latente Wärme wird aufgenommen).",
    "Verflüssigen und Verdampfen wurden vertauscht – beim Verflüssigen geht Stoff von gasförmig nach flüssig über (latente Wärme wird abgegeben).",
  ],
  [
    "Kälteleistung", "Heizleistung",
    "Kälteleistung und Heizleistung wurden verwechselt – die Kälteleistung Q₀ wird im Verdampfer aufgenommen.",
    "Heizleistung und Kälteleistung wurden verwechselt – die Heizleistung Qc wird im Verflüssiger abgegeben.",
  ],
  [
    "latente", "sensible",
    "Latente und sensible Wärme wurden vertauscht – latente Wärme tritt ohne Temperaturänderung beim Phasenwechsel auf.",
    "Sensible und latente Wärme wurden vertauscht – sensible Wärme bewirkt eine messbare Temperaturänderung ohne Phasenwechsel.",
  ],
  [
    "TEV", "EEV",
    "Thermostatisches (TEV) und elektronisches Expansionsventil (EEV) wurden verwechselt – das TEV regelt rein mechanisch über Überhitzung.",
    "Elektronisches (EEV) und thermostatisches Expansionsventil (TEV) wurden verwechselt – das EEV regelt elektronisch mit höherer Präzision.",
  ],
  [
    "R-134a", "R-410A",
    "R-134a und R-410A wurden verwechselt – R-134a ist ein HFC mit niedrigerem Druck, R-410A arbeitet bei deutlich höherem Druck.",
    "R-410A und R-134a wurden verwechselt – R-410A arbeitet bei höherem Druck als R-134a.",
  ],
  [
    "R-717", "R-744",
    "R-717 (Ammoniak, NH₃) und R-744 (CO₂) wurden verwechselt – beides natürliche Kältemittel, aber mit sehr unterschiedlichen Eigenschaften.",
    "R-744 (CO₂) und R-717 (Ammoniak) wurden verwechselt – R-744 arbeitet im transkritischen Bereich, R-717 ist giftig aber sehr effizient.",
  ],
  [
    "klein", "groß",
    "Klein und groß wurden vertauscht – ein kleiner Wert wurde fälschlich als groß dargestellt.",
    "Groß und klein wurden vertauscht – ein großer Wert wurde fälschlich als klein dargestellt.",
  ],
  [
    "niedrig", "hoch",
    "Niedrig und hoch wurden vertauscht – ein niedriger Wert wurde als hoch dargestellt.",
    "Hoch und niedrig wurden vertauscht – ein hoher Wert wurde als niedrig dargestellt.",
  ],
  [
    "Wärme ab", "Wärme zu",
    "Wärmeabgabe und Wärmezufuhr wurden verwechselt – bei diesem Prozess wird Wärme abgegeben, nicht aufgenommen.",
    "Wärmezufuhr und Wärmeabgabe wurden verwechselt – bei diesem Prozess wird Wärme aufgenommen, nicht abgegeben.",
  ],
  [
    "GWP", "ODP",
    "GWP (Global Warming Potential) und ODP (Ozone Depletion Potential) wurden verwechselt – GWP beschreibt den Treibhauseffekt, ODP die Ozonschichtschädigung.",
    "ODP und GWP wurden verwechselt – ODP beschreibt die Ozonschichtschädigung, GWP den Treibhauseffekt.",
  ],
  [
    "Sicherheitsgruppe A1", "Sicherheitsgruppe A2L",
    "Sicherheitsgruppen verwechselt – A1 bedeutet nicht brennbar, A2L bezeichnet schwer entflammbare Kältemittel.",
    "Sicherheitsgruppen verwechselt – A2L bezeichnet schwer entflammbare Kältemittel, A1 bedeutet nicht brennbar.",
  ],
];

// ─────────────────────────────────────────────────────────────────────────────
// 2.  Number mutation
// ─────────────────────────────────────────────────────────────────────────────
function mutateNumbers(text: string): { result: string; changed: boolean; hint: string } {
  // Match patterns like: 7-8 K, 1,2 bar, –10 °C, 0,5 K, 33°C, 100.000 Pa
  const NUM_RE = /(-?\d+(?:[.,]\d+)?(?:\s*[-–]\s*-?\d+(?:[.,]\d+)?)?)\s*(K|bar|°C|Pa|kW|kJ\/kg|%|K\/W)/g;

  let changed = false;
  let hintValue = "";
  let hintUnit = "";

  const result = text.replace(NUM_RE, (match, num, unit) => {
    if (changed) return match; // only mutate one number per distractor for clarity
    // Parse first number
    const clean = num.replace(",", ".").replace(/–|-/, "-");
    const val = parseFloat(clean);
    if (isNaN(val)) return match;

    // Pick a mutation: ×1.5 or ×0.5 or ×2, but stay in same sign
    const factors = [0.5, 1.5, 2.0, 0.33];
    const f = factors[Math.floor(Math.random() * factors.length)];
    let newVal = Math.round(val * f * 10) / 10;
    if (newVal === val) newVal = val + (val > 0 ? Math.abs(val) : 1);

    // Format back, keep German comma
    const formatted = String(newVal).replace(".", ",");
    hintValue = `${num} ${unit}`;
    hintUnit = unit;
    changed = true;
    return `${formatted} ${unit}`;
  });

  return {
    result,
    changed,
    hint: changed
      ? `Der Zahlenwert ist falsch – der korrekte Wert lautet ${hintValue}, nicht der genannte Wert (${hintUnit}).`
      : "",
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 3.  Apply one term-swap to a text, returning null if the term isn't found
// ─────────────────────────────────────────────────────────────────────────────
function applyTermSwap(
  text: string,
  swapIdx: number
): { result: string; hint: string } | null {
  const [termA, termB, hintAtoB, hintBtoA] = TERM_SWAPS[swapIdx];

  // Try A → B first
  const reA = new RegExp(termA, "g");
  if (reA.test(text)) {
    return { result: text.replace(new RegExp(termA, "g"), termB), hint: hintAtoB };
  }
  // Try B → A
  const reB = new RegExp(termB, "g");
  if (reB.test(text)) {
    return { result: text.replace(new RegExp(termB, "g"), termA), hint: hintBtoA };
  }
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// 4.  Trim answer to a prüfungsnah length (~150 chars max, first 2 sentences)
// ─────────────────────────────────────────────────────────────────────────────
function trimAnswer(text: string, maxLen = 150): string {
  // Take first 2 sentence-ending chunks
  const sentences = text.split(/(?<=[.!?])\s+/);
  let out = sentences.slice(0, 2).join(" ").trim();
  if (out.length > maxLen) out = out.slice(0, maxLen - 1).trimEnd() + "…";
  return out || text.slice(0, maxLen).trimEnd() + "…";
}

// ─────────────────────────────────────────────────────────────────────────────
// 5.  Main generator
// ─────────────────────────────────────────────────────────────────────────────
import type { Question } from "./questions";

export function generateMCOptions(
  current: Question,
  allQs: Question[]
): MCOption[] {
  const correctRaw = trimAnswer(current.answer);
  const correctOption: MCOption = {
    text: correctRaw,
    isCorrect: true,
    hint: current.answer, // full answer shown in feedback
  };

  const distractors: MCOption[] = [];
  const usedTexts = new Set<string>([correctRaw.toLowerCase().slice(0, 80)]);

  // ── Strategy A: term swaps ──────────────────────────────────────────────
  // Shuffle swap table for variety across different questions
  const shuffledSwaps = [...Array(TERM_SWAPS.length).keys()].sort(() => Math.random() - 0.5);

  for (const idx of shuffledSwaps) {
    if (distractors.length >= 3) break;
    const swapped = applyTermSwap(current.answer, idx);
    if (!swapped) continue;
    const text = trimAnswer(swapped.result);
    const key = text.toLowerCase().slice(0, 80);
    if (usedTexts.has(key) || text === correctRaw) continue;
    // Sanity: the text must actually have changed
    if (text.toLowerCase().slice(0, 60) === correctRaw.toLowerCase().slice(0, 60)) continue;
    usedTexts.add(key);
    distractors.push({ text, isCorrect: false, hint: swapped.hint });
  }

  // ── Strategy B: number mutation ─────────────────────────────────────────
  if (distractors.length < 3) {
    const mutated = mutateNumbers(current.answer);
    if (mutated.changed) {
      const text = trimAnswer(mutated.result);
      const key = text.toLowerCase().slice(0, 80);
      if (!usedTexts.has(key)) {
        usedTexts.add(key);
        distractors.push({ text, isCorrect: false, hint: mutated.hint });
      }
    }
  }

  // ── Strategy C: same-block answers (fallback) ────────────────────────────
  if (distractors.length < 3) {
    const sameBlock = allQs.filter(
      (q) => q.id !== current.id && q.block === current.block
    );
    const nearby = allQs
      .filter((q) => q.id !== current.id && q.block !== current.block)
      .sort((a, b) => Math.abs(a.id - current.id) - Math.abs(b.id - current.id));

    for (const q of [...sameBlock, ...nearby]) {
      if (distractors.length >= 3) break;
      const text = trimAnswer(q.answer);
      const key = text.toLowerCase().slice(0, 80);
      if (usedTexts.has(key) || text.length < 15) continue;
      usedTexts.add(key);
      distractors.push({
        text,
        isCorrect: false,
        hint: `Diese Antwort beschreibt ein anderes Konzept aus dem Themenbereich "${q.block}" und passt nicht zur gestellten Frage.`,
      });
    }
  }

  // Ensure exactly 3 distractors
  while (distractors.length < 3) {
    distractors.push({
      text: "Keine der anderen Antwortmöglichkeiten trifft zu.",
      isCorrect: false,
      hint: "Diese Option ist immer falsch – die richtige Antwort ist oben grün markiert.",
    });
  }

  const options: MCOption[] = [correctOption, ...distractors.slice(0, 3)];

  // Fisher-Yates shuffle
  for (let i = options.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [options[i], options[j]] = [options[j], options[i]];
  }
  return options;
}
