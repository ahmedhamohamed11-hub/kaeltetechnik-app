import { useState, useEffect } from "react";
import type { Question } from "./questions";
import { getShortAnswer, validateAnswerMeaning, type ValidationResult } from "./answerUtils";

interface CardState {
  id: number;
  status: "unseen" | "learning" | "learned" | "weak";
  correctStreak: number;
  seenCount: number;
  wrongCount: number;
}

interface Props {
  card: Question;
  cardState: CardState | null;
  onMark: (correct: boolean) => void;
}

export default function SmartCard({ card, cardState, onMark }: Props) {
  const [input, setInput] = useState("");
  const [result, setResult] = useState<ValidationResult | null>(null);
  const [showFull, setShowFull] = useState(false);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    setInput("");
    setResult(null);
    setShowFull(false);
    setChecked(false);
  }, [card.id]);

  const shortAnswer = getShortAnswer(card.answer);
  const hasMore = shortAnswer !== card.answer;

  function handleCheck() {
    if (!input.trim()) return;
    const res = validateAnswerMeaning(input, card.answer);
    setResult(res);
    setChecked(true);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && e.ctrlKey) handleCheck();
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

  return (
    <div className="flashcard smart-card">
      <div className="card-meta">
        <span className="card-block">{card.block}</span>
        <span className="card-num">#{card.id}</span>
        {cardState && (
          <span className={`badge ${statusClass[cardState.status] ?? "badge-unseen"}`}>
            {statusLabel[cardState.status] ?? "Neu"}
          </span>
        )}
      </div>

      <div className="card-question">
        <p>{card.question}</p>
      </div>

      <div className="smart-short-answer">
        <div className="smart-short-label">Kurzantwort (Hinweis)</div>
        <p className="smart-short-text">{shortAnswer}</p>
        {hasMore && !showFull && (
          <button
            className="smart-show-full-btn"
            onClick={() => setShowFull(true)}
          >
            Vollständige Antwort anzeigen ↓
          </button>
        )}
      </div>

      {showFull && (
        <div className="smart-full-answer">
          <div className="smart-full-label">Vollständige Antwort</div>
          <p className="smart-full-text">{card.answer}</p>
          {card.explanation && (
            <div className="card-explanation">
              <div className="card-explanation-label">💡 Erklärung</div>
              <p className="card-explanation-text">{card.explanation}</p>
            </div>
          )}
        </div>
      )}

      {!checked ? (
        <>
          <div className="smart-input-area">
            <label className="smart-input-label">Deine Antwort (Ctrl+Enter zum Prüfen):</label>
            <textarea
              className="ft-input smart-textarea"
              placeholder="Schreibe deine Antwort…"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              rows={3}
            />
          </div>
          <button
            className="btn btn-primary smart-check-btn"
            onClick={handleCheck}
            disabled={!input.trim()}
          >
            Antwort prüfen ✓
          </button>
        </>
      ) : (
        <>
          {result === "correct" && (
            <div className="smart-result smart-result--correct">
              <span className="smart-result-icon">✓</span>
              <span className="smart-result-text">Richtig! Deine Antwort enthält die Kernaussage.</span>
            </div>
          )}
          {result === "partial" && (
            <div className="smart-result smart-result--partial">
              <span className="smart-result-icon">△</span>
              <span className="smart-result-text">Teilweise richtig — einige Kernbegriffe fehlen noch.</span>
            </div>
          )}
          {result === "wrong" && (
            <div className="smart-result smart-result--wrong">
              <span className="smart-result-icon">✗</span>
              <span className="smart-result-text">Nicht ausreichend — prüfe die vollständige Antwort.</span>
            </div>
          )}

          {!showFull && (
            <button
              className="smart-show-full-btn smart-show-full-btn--after"
              onClick={() => setShowFull(true)}
            >
              Vollständige Antwort &amp; Erklärung anzeigen ↓
            </button>
          )}

          <div className="card-actions smart-card-actions">
            <button className="btn btn-wrong" onClick={() => onMark(false)}>
              🔄 Nochmal
            </button>
            <button
              className="btn btn-correct"
              onClick={() => onMark(result === "correct" || result === "partial")}
            >
              ✓ Weiter
            </button>
          </div>
        </>
      )}
    </div>
  );
}
