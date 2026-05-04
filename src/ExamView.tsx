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

  // ✅ NEU: richtig / falsch Anzeige
  const [resultState, setResultState] = useState<"correct" | "wrong" | null>(null);

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
    setResultState(null);
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

      // ✅ Anzeige setzen
      setResultState(result);

      try {
        console.log("🔥 SAVE TRIGGERED", currentQuestion.question.id, result);
        await saveAnswer(String(currentQuestion.question.id), result);
      } catch (error) {
        console.error("❌ Fehler beim Speichern:", error);
      }
    }

    // 👉 kurze Anzeige bevor nächste Frage kommt
    setTimeout(() => {
      setResultState(null);

      if (currentIdx + 1 >= EXAM_COUNT) {
        setPhase("results");
      } else {
        setCurrentIdx((i) => i + 1);
        setSelected(null);
      }
    }, 700);
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

        <div className="exam-setup-actions">
          <button className="btn btn-secondary" onClick={onBack}>
            ← Zurück
          </button>
          <button className="btn btn-primary" onClick={startExam}>
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
          <span>Frage {currentIdx + 1} / {EXAM_COUNT}</span>
          <span>⏱ {formatTime(timeLeft)}</span>
        </div>

        <div className="progress-fill" style={{ width: `${pct}%` }} />

        <div className="flashcard">
          <p>{eq.question.question}</p>

          <div className="mc-options">
            {eq.options.map((opt, idx) => (
              <button
                key={idx}
                className={`
                  mc-option
                  ${selected === idx ? " mc-exam-selected" : ""}
                  ${resultState === "correct" && idx === eq.correctIdx ? " mc-correct" : ""}
                  ${resultState === "wrong" && selected === idx ? " mc-wrong" : ""}
                `}
                onClick={() => selected === null && setSelected(idx)}
              >
                {LABELS[idx]} - {opt.text}
              </button>
            ))}
          </div>

          {selected !== null && (
            <button onClick={() => commitAnswer(selected)}>
              Weiter
            </button>
          )}
        </div>
      </div>
    );
  }

  if (!results) return null;

  return <div>Ergebnis</div>;
}
