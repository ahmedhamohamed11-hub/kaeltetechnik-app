import { saveAnswer } from "./answerUtils";
import { useState, useEffect, useMemo } from "react";
import type { Question } from "./questions";
import { generateMCOptions, type MCOption } from "./distractor";

const EXAM_COUNT = 30;
const EXAM_TIME_SECONDS = 45 * 60;

interface ExamQuestion {
  question: Question;
  options: MCOption[];
  correctIdx: number;
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

const LABELS = ["A", "B", "C", "D"];

export default function ExamView({
  onBack,
  allQs,
}: {
  onBack: () => void;
  allQs: Question[];
}) {
  const [phase, setPhase] = useState<"setup" | "running" | "results">("setup");
  const [examQuestions, setExamQuestions] = useState<ExamQuestion[]>([]);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [userAnswers, setUserAnswers] = useState<(number | null)[]>([]);
  const [selected, setSelected] = useState<number | null>(null);
  const [timeLeft, setTimeLeft] = useState(EXAM_TIME_SECONDS);
  const [timedOut, setTimedOut] = useState(false);

  function startExam() {
    const pool = shuffle([...allQs]).slice(0, EXAM_COUNT);
    const eqs: ExamQuestion[] = pool.map((q) => {
      const opts = generateMCOptions(q, allQs);
      const correctIdx = opts.findIndex((o) => o.isCorrect);
      return { question: q, options: opts, correctIdx };
    });

    setExamQuestions(eqs);
    setUserAnswers(new Array(EXAM_COUNT).fill(null));
    setCurrentIdx(0);
    setSelected(null);
    setTimeLeft(EXAM_TIME_SECONDS);
    setTimedOut(false);
    setPhase("running");
  }

  useEffect(() => {
    if (phase !== "running") return;

    const id = setInterval(() => {
      setTimeLeft((t) => {
        if (t <= 1) {
          clearInterval(id);
          setTimedOut(true);
          setPhase("results");
          return 0;
        }
        return t - 1;
      });
    }, 1000);

    return () => clearInterval(id);
  }, [phase]);

  async function commitAnswer(ans: number | null) {
    const newAnswers = [...userAnswers];
    newAnswers[currentIdx] = ans;
    setUserAnswers(newAnswers);

    const currentQuestion = examQuestions[currentIdx];
    if (currentQuestion) {
      const result = ans === currentQuestion.correctIdx ? "correct" : "wrong";

      // Question-ID sicher speichern: Index als Text
      const questionId = String(currentIdx);

      try {
        console.log("🔥 SAVE TRIGGERED", question.id, result);
        await saveAnswer(String(question.id), result);
      } catch (error) {
        console.error("❌ Fehler beim Speichern:", error);
      }
    }

    if (currentIdx + 1 >= EXAM_COUNT) {
      setPhase("results");
    } else {
      setCurrentIdx((i) => i + 1);
      setSelected(null);
    }
  }

  const results = useMemo(() => {
    if (phase !== "results" || examQuestions.length === 0) return null;
    const score = examQuestions.reduce(
      (acc, eq, i) => acc + (userAnswers[i] === eq.correctIdx ? 1 : 0),
      0
    );
    const items = examQuestions.map((eq, i) => ({
      eq,
      answered: userAnswers[i],
      correct: userAnswers[i] === eq.correctIdx,
    }));
    const wrong = items.filter((x) => !x.correct);
    return { score, total: examQuestions.length, wrong, items };
  }, [phase, examQuestions, userAnswers]);

  const timerWarning = timeLeft < 300;
  const timerCritical = timeLeft < 60;

  if (phase === "setup") {
    return (
      <div className="exam-setup">
        <div className="exam-setup-icon">📝</div>
        <h2>Prüfungssimulation</h2>
        <p className="exam-setup-desc">
          Teste dich unter echten Prüfungsbedingungen — kein Feedback, echter Zeitdruck.
        </p>
        <div className="exam-info-grid">
          <div className="exam-info-item">
            <span className="exam-info-num">30</span>
            <span className="exam-info-label">Fragen</span>
          </div>
          <div className="exam-info-item">
            <span className="exam-info-num">45</span>
            <span className="exam-info-label">Minuten</span>
          </div>
          <div className="exam-info-item">
            <span className="exam-info-num">MC</span>
            <span className="exam-info-label">Multiple Choice</span>
          </div>
        </div>
        <ul className="exam-rules">
          <li>🔀 30 zufällige Fragen aus allen Themenblöcken</li>
          <li>⏱ 45 Minuten Zeitlimit — danach automatische Abgabe</li>
          <li>🚫 Kein Feedback während der Prüfung</li>
          <li>📊 Vollständige Fehleranalyse am Ende</li>
          <li>🎯 Jedes Mal werden neue Fragen ausgewählt</li>
        </ul>
        <div className="exam-setup-actions">
          <button className="btn btn-secondary" onClick={onBack}>
            ← Zurück
          </button>
          <button className="btn btn-primary large-btn" onClick={startExam}>
            Prüfung starten
          </button>
        </div>
      </div>
    );
  }

  if (phase === "running") {
    const eq = examQuestions[currentIdx];
    const pct = Math.round((currentIdx / EXAM_COUNT) * 100);

    return (
      <div className="exam-running">
        <div className="exam-topbar">
          <span className="exam-progress-text">
            Frage {currentIdx + 1} / {EXAM_COUNT}
          </span>
          <span
            className={`exam-timer${
              timerCritical ? " timer-critical" : timerWarning ? " timer-warning" : ""
            }`}
          >
            ⏱ {formatTime(timeLeft)}
          </span>
        </div>

        <div className="progress-track" style={{ borderRadius: 0, height: 5 }}>
          <div
            className="progress-fill"
            style={{ width: `${pct}%`, transition: "none" }}
          />
        </div>

        <div
          className="flashcard mc-card"
          style={{
            marginTop: 0,
            borderTopLeftRadius: 0,
            borderTopRightRadius: 0,
          }}
        >
          <div className="card-meta">
            <span className="card-block">{eq.question.block}</span>
            <span className="card-num">Frage {currentIdx + 1}</span>
            <span className="badge badge-exam">Prüfung</span>
          </div>

          <div className="card-question">
            <p>{eq.question.question}</p>
          </div>

          <div className="mc-options">
            {eq.options.map((opt, idx) => (
              <button
                key={idx}
                className={`mc-option${selected === idx ? " mc-exam-selected" : ""}`}
                onClick={() => selected === null && setSelected(idx)}
              >
                <span className="mc-label">{LABELS[idx]}</span>
                <span className="mc-text">{opt.text}</span>
              </button>
            ))}
          </div>

          <div className="exam-card-footer">
            <button className="btn btn-skip" onClick={() => commitAnswer(null)}>
              Überspringen
            </button>
            {selected !== null && (
              <button
                className="btn btn-primary mc-next"
                onClick={() => commitAnswer(selected)}
              >
                {currentIdx + 1 >= EXAM_COUNT ? "Prüfung abgeben →" : "Nächste Frage →"}
              </button>
            )}
          </div>
        </div>

        <button
          className="btn btn-danger exam-abort"
          onClick={() => {
            if (
              window.confirm(
                "Prüfung abbrechen? Die bisherigen Antworten werden ausgewertet."
              )
            ) {
              setPhase("results");
            }
          }}
        >
          Prüfung abbrechen
        </button>
      </div>
    );
  }

  if (!results) return null;

  const pct = Math.round((results.score / results.total) * 100);
  const passed = pct >= 60;

  return (
    <div className="exam-results">
      {timedOut && (
        <div className="exam-timeout-notice">
          ⏱ Zeit abgelaufen — automatische Abgabe
        </div>
      )}

      <div className="exam-result-header">
        <div className={`exam-result-score-ring ${passed ? "ring-pass" : "ring-fail"}`}>
          <span className="exam-score-num">{results.score}</span>
          <span className="exam-score-sep">/</span>
          <span className="exam-score-total">{results.total}</span>
        </div>
        <div className={`exam-score-pct ${passed ? "pct-pass" : "pct-fail"}`}>
          {pct}% — {passed ? "✓ Bestanden" : "✗ Nicht bestanden"}
        </div>
        <div className="exam-score-breakdown">
          <span className="score-correct">✓ {results.score} Richtig</span>
          <span className="score-wrong">
            ✗ {results.total - results.score} Falsch
          </span>
        </div>
      </div>

      {results.wrong.length > 0 && (
        <div className="exam-wrong-list">
          <h3 className="ewl-title">
            Fehleranalyse
            <span className="ewl-count">{results.wrong.length} Fehler</span>
          </h3>
          {results.wrong.map(({ eq, answered }, i) => (
            <div key={i} className="exam-wrong-item">
              <div className="ewi-header">
                <span className="ewi-block">{eq.question.block}</span>
              </div>
              <p className="ewi-question">{eq.question.question}</p>
              {answered !== null ? (
                <div className="ewi-your-answer">
                  <span className="ewi-label-wrong">✗ Deine Antwort:</span>
                  <span>{eq.options[answered].text}</span>
                </div>
              ) : (
                <div className="ewi-your-answer">
                  <span className="ewi-label-wrong">— Nicht beantwortet</span>
                </div>
              )}
              <div className="ewi-correct">
                <span className="ewi-label-correct">✓ Richtige Antwort:</span>
                <span>{eq.options[eq.correctIdx].text}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {results.wrong.length === 0 && (
        <div className="exam-perfect">
          🎉 Perfekt! Alle Fragen richtig beantwortet!
        </div>
      )}

      <div className="exam-result-actions">
        <button className="btn btn-secondary" onClick={onBack}>
          ← Zurück zum Lernen
        </button>
        <button className="btn btn-primary" onClick={startExam}>
          Neue Prüfung starten
        </button>
      </div>
    </div>
  );
}
