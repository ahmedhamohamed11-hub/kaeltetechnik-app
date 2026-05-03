import { useState, useEffect } from "react";
import type { Question } from "./questions";

interface CardState {
  id: number;
  status: "unseen" | "learning" | "learned" | "weak";
  correctStreak: number;
  seenCount: number;
  wrongCount: number;
}

interface CalcStep {
  label: string;
  expression: string;
  isResult: boolean;
}

function parseCalcAnswer(answer: string): { steps: CalcStep[]; hint: string } {
  // Separate trailing hint from formula chain
  // Hint = text after ". " that starts with uppercase, digit, or "("
  const hintMatch = answer.match(/\.\s+([A-ZÜÄÖ\d(].+)$/s);
  let formulaChain = answer;
  let hint = "";
  if (hintMatch) {
    formulaChain = answer
      .slice(0, answer.length - hintMatch[0].length)
      .replace(/\.\s*$/, "")
      .trim();
    hint = hintMatch[1].trim().replace(/^\(/, "").replace(/\)$/, "");
  } else {
    formulaChain = answer.replace(/\.\s*$/, "").trim();
  }

  const parts = formulaChain.split("=").map((p) => p.trim());

  if (parts.length < 2) {
    return { steps: [{ label: "Lösung", expression: answer, isResult: true }], hint: "" };
  }

  const steps: CalcStep[] = [];

  // Step 0: formula / definition  e.g.  "Q̇ = k × A × ΔT"
  steps.push({
    label: parts.length > 2 ? "Formel" : "Ansatz",
    expression: `${parts[0]} = ${parts[1]}`,
    isResult: parts.length === 2,
  });

  // Middle steps: substitution
  for (let i = 2; i < parts.length - 1; i++) {
    steps.push({
      label: "Einsetzen",
      expression: `${parts[0]} = ${parts[i]}`,
      isResult: false,
    });
  }

  // Last step: result
  if (parts.length > 2) {
    steps.push({
      label: "Ergebnis",
      expression: `${parts[0]} = ${parts[parts.length - 1]}`,
      isResult: true,
    });
  }

  return { steps, hint };
}

const statusLabel: Record<string, string> = {
  unseen: "Neu",
  learning: "In Bearbeitung",
  learned: "Gelernt ✓",
  weak: "Schwach ⚠",
};
const statusClass: Record<string, string> = {
  unseen: "badge-unseen",
  learning: "badge-learning",
  learned: "badge-learned",
  weak: "badge-weak",
};

export default function CalcCard({
  card,
  cardState,
  onMark,
}: {
  card: Question;
  cardState: CardState | null;
  onMark: (correct: boolean) => void;
}) {
  const { steps, hint } = parseCalcAnswer(card.answer);
  const [revealed, setRevealed] = useState(0);
  const allRevealed = revealed >= steps.length;

  useEffect(() => {
    setRevealed(0);
  }, [card.id]);

  function revealNext() {
    setRevealed((r) => Math.min(r + 1, steps.length));
  }

  return (
    <div className="flashcard calc-card">
      {/* Meta */}
      <div className="card-meta">
        <span className="card-block">{card.block}</span>
        <span className="card-num">#{card.id}</span>
        <span className="badge badge-calc">🔢 Rechnen</span>
        {cardState && (
          <span className={`badge ${statusClass[cardState.status]}`}>
            {statusLabel[cardState.status]}
          </span>
        )}
      </div>

      {/* Question */}
      <div className="card-question">
        <p>{card.question}</p>
      </div>

      {/* Steps */}
      <div className="calc-steps">
        {steps.map((step, idx) => {
          const isVisible = idx < revealed;
          const isCurrent = idx === revealed - 1;
          return (
            <div
              key={idx}
              className={`calc-step${isVisible ? " calc-step-visible" : " calc-step-hidden"}${step.isResult && isVisible ? " calc-step-result" : ""}${isCurrent && !step.isResult ? " calc-step-current" : ""}`}
            >
              <span className="calc-step-label">
                {step.isResult ? "✅" : idx === 0 ? "📐" : "🔢"} {step.label}
              </span>
              <span className="calc-step-expr">{step.expression}</span>
            </div>
          );
        })}
      </div>

      {/* Reveal button or action buttons */}
      {!allRevealed ? (
        <button className="btn btn-calc-reveal" onClick={revealNext}>
          {revealed === 0
            ? "Schritt 1: Formel anzeigen →"
            : revealed === steps.length - 1
            ? "Ergebnis anzeigen →"
            : `Schritt ${revealed + 1} anzeigen →`}
        </button>
      ) : (
        <>
          {hint && (
            <div className="calc-hint">
              <span className="calc-hint-icon">💡</span>
              <span className="calc-hint-text">{hint}</span>
            </div>
          )}
          <div className="card-actions">
            <button className="btn btn-wrong" onClick={() => onMark(false)}>
              🔄 Nochmal rechnen
            </button>
            <button className="btn btn-correct" onClick={() => onMark(true)}>
              ✓ Richtig gerechnet
            </button>
          </div>
        </>
      )}
    </div>
  );
}
