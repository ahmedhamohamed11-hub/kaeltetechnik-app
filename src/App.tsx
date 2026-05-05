import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { allQuestions, type Question } from "./questions";
import { queueProgressSync, syncOnStartup, trackDailyOnline } from "./supabaseUserSync";
import { generateMCOptions, type MCOption } from "./distractor";
import ExamView from "./ExamView";
import BrowseView from "./BrowseView";
import CalcCard from "./CalcCard";
import StatsView from "./StatsView";
import AdminPanel from "./AdminPanel";
import { loadAdminOverrides } from "./adminOverrides";
import ResetModal from "./ResetModal";
import LoginScreen from "./LoginScreen";
import { storageKeyForUser } from "./userStorage";
import KatalogView from "./KatalogView";
import PruefungsvorbereitungView from "./PruefungsvorbereitungView";
import SmartCard from "./SmartCard";
import { useSwipe } from "./useSwipe";
import { playCorrect, playWrong } from "./playSound";
import { getGreeting } from "./lib/greeting";
import { supabase } from "./supabaseClient";

const CALC_BLOCK = "Rechenaufgaben & Berechnungen";
const _homeRandomFraction = Math.random();

// ── Types ──────────────────────────────────────────────────────────────────
type CardStatus = "unseen" | "learning" | "learned" | "weak";
type LearningMode =
  | "all"
  | "unseen_first"
  | "weak_first"
  | "learned_first"
  | "exam_mix";
type QuizMode = "classic" | "mc" | "tf" | "freetext" | "self" | "smart";
type FilterStatus = "all" | "unseen" | "weak" | "learned";
type AppView = "learn" | "exam" | "browse" | "stats" | "katalog" | "pruefung";

interface CardState {
  id: number;
  status: CardStatus;
  correctStreak: number;
  seenCount: number;
  wrongCount: number;
}

interface AppState {
  cards: Record<number, CardState>;
  customQuestions: Question[];
  learnDays?: string[];
}

// ── Hilfsfunktionen für localStorage (typsicher) ──────────────────────────
function loadState(storageKey: string): AppState {
  try {
    const raw = localStorage.getItem(storageKey);
    if (raw) return JSON.parse(raw);
  } catch {}
  return { cards: {}, customQuestions: [] };
}

function saveState(state: AppState, storageKey: string) {
  localStorage.setItem(storageKey, JSON.stringify(state));
}

function getCardState(state: AppState, id: number): CardState {
  return (
    state.cards[id] ?? {
      id,
      status: "unseen",
      correctStreak: 0,
      seenCount: 0,
      wrongCount: 0,
    }
  );
}

// ── Learning Order ─────────────────────────────────────────────────────────
function orderQuestions(
  questions: Question[],
  state: AppState,
  mode: LearningMode
): Question[] {
  const getStatus = (q: Question) => getCardState(state, q.id).status;
  switch (mode) {
    case "unseen_first":
      return [
        ...questions.filter((q) => getStatus(q) === "unseen"),
        ...questions.filter((q) => getStatus(q) === "learning"),
        ...questions.filter((q) => getStatus(q) === "weak"),
        ...questions.filter((q) => getStatus(q) === "learned"),
      ];
    case "weak_first":
      return [
        ...questions.filter((q) => getStatus(q) === "weak"),
        ...questions.filter((q) => getStatus(q) === "learning"),
        ...questions.filter((q) => getStatus(q) === "unseen"),
        ...questions.filter((q) => getStatus(q) === "learned"),
      ];
    case "learned_first":
      return [
        ...questions.filter((q) => getStatus(q) === "learned"),
        ...questions.filter((q) => getStatus(q) === "learning"),
        ...questions.filter((q) => getStatus(q) === "unseen"),
        ...questions.filter((q) => getStatus(q) === "weak"),
      ];
    case "exam_mix": {
      const pool = [
        ...questions.filter((q) => getStatus(q) === "weak"),
        ...questions.filter((q) => getStatus(q) === "unseen"),
        ...questions.filter((q) => getStatus(q) === "learning"),
      ];
      const learned = questions.filter((q) => getStatus(q) === "learned");
      for (let i = pool.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [pool[i], pool[j]] = [pool[j], pool[i]];
      }
      return [...pool, ...learned];
    }
    default:
      return questions;
  }
}

// ── Streak Helper ──────────────────────────────────────────────────────────
function computeStreak(learnDays: string[] | undefined): number {
  if (!learnDays || learnDays.length === 0) return 0;
  const unique = [...new Set(learnDays)].sort().reverse();
  const todayStr = new Date().toISOString().slice(0, 10);
  const yesterdayStr = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  if (unique[0] !== todayStr && unique[0] !== yesterdayStr) return 0;
  let streak = 0;
  let expected = new Date(unique[0]);
  for (const day of unique) {
    if (day === expected.toISOString().slice(0, 10)) {
      streak++;
      expected = new Date(expected.getTime() - 86400000);
    } else {
      break;
    }
  }
  return streak;
}

// ── Components ─────────────────────────────────────────────────────────────

function StatsBar({
  state,
  total,
  activeFilter,
  onFilter,
}: {
  state: AppState;
  total: number;
  activeFilter: FilterStatus;
  onFilter: (f: FilterStatus) => void;
}) {
  const counts = { unseen: 0, learning: 0, learned: 0, weak: 0 };
  let seen = 0;
  Object.values(state.cards).forEach((c) => {
    if (c.status in counts) counts[c.status as keyof typeof counts]++;
    if (c.seenCount > 0) seen++;
  });

  function toggle(f: FilterStatus) {
    onFilter(activeFilter === f ? "all" : f);
  }

  return (
    <div className="stats-bar">
      <button
        className={`stat-item stat-total${activeFilter === "all" ? " stat-active" : ""}`}
        onClick={() => onFilter("all")}
        title="Alle Fragen anzeigen"
      >
        <span className="stat-num">{total}</span>
        <span className="stat-label">Alle</span>
        {activeFilter === "all" && <span className="stat-filter-dot" />}
      </button>
      <button
        className={`stat-item stat-seen${activeFilter === "unseen" ? " stat-active stat-active-unseen" : ""}`}
        onClick={() => toggle("unseen")}
        title="Nur ungesehene Fragen üben"
      >
        <span className="stat-num">{total - seen}</span>
        <span className="stat-label">Ungesehen</span>
        {activeFilter === "unseen" && <span className="stat-filter-dot" />}
      </button>
      <button
        className={`stat-item stat-learned${activeFilter === "learned" ? " stat-active stat-active-learned" : ""}`}
        onClick={() => toggle("learned")}
        title="Nur gelernte Fragen wiederholen"
      >
        <span className="stat-num">{counts.learned}</span>
        <span className="stat-label">Gelernt ✓</span>
        {activeFilter === "learned" && <span className="stat-filter-dot" />}
      </button>
      <button
        className={`stat-item stat-weak${activeFilter === "weak" ? " stat-active stat-active-weak" : ""}`}
        onClick={() => toggle("weak")}
        title="Nur schwache Fragen üben"
      >
        <span className="stat-num">{counts.weak}</span>
        <span className="stat-label">Schwach ⚠</span>
        {activeFilter === "weak" && <span className="stat-filter-dot" />}
      </button>
    </div>
  );
}

function ProgressBar({ current, total }: { current: number; total: number }) {
  const pct = total === 0 ? 0 : Math.round((current / total) * 100);
  return (
    <div className="progress-container">
      <div className="progress-track">
        <div className="progress-fill" style={{ width: `${pct}%` }} />
      </div>
      <span className="progress-label">
        {current} / {total} ({pct}%)
      </span>
    </div>
  );
}

function CardMeta({
  card,
  cardState,
}: {
  card: Question;
  cardState: CardState | null;
}) {
  const statusLabel: Record<CardStatus, string> = {
    unseen: "Neu",
    learning: "In Bearbeitung",
    learned: "Gelernt ✓",
    weak: "Schwach ⚠",
  };
  const statusClass: Record<CardStatus, string> = {
    unseen: "badge-unseen",
    learning: "badge-learning",
    learned: "badge-learned",
    weak: "badge-weak",
  };
  return (
    <div className="card-meta">
      <span className="card-block">{card.block}</span>
      <span className="card-num">#{card.id}</span>
      {cardState && (
        <span className={`badge ${statusClass[cardState.status]}`}>
          {statusLabel[cardState.status]}
        </span>
      )}
    </div>
  );
}

// Classic flashcard
function ClassicCard({
  card,
  cardState,
  onMark,
}: {
  card: Question;
  cardState: CardState | null;
  onMark: (correct: boolean) => void;
}) {
  const [showAnswer, setShowAnswer] = useState(false);
  useEffect(() => setShowAnswer(false), [card.id]);

  const swipe = useSwipe({
    onRight: () => onMark(true),
    onLeft: () => onMark(false),
    onRightStart: playCorrect,
    onLeftStart: playWrong,
  });

  return (
    <div className="flashcard" ref={swipe.ref} style={swipe.cardStyle}>
      <div className="swipe-ov swipe-ov-right" style={{ opacity: swipe.showRight ? swipe.overlayStrength : 0 }}>✓ Gewusst</div>
      <div className="swipe-ov swipe-ov-left" style={{ opacity: swipe.showLeft ? swipe.overlayStrength : 0 }}>✗ Nochmal</div>
      <CardMeta card={card} cardState={cardState} />
      <div className="card-question">
        <p>{card.question}</p>
      </div>
      {!showAnswer ? (
        <button className="btn btn-reveal" onClick={() => setShowAnswer(true)}>
          Antwort anzeigen
        </button>
      ) : (
        <>
          <div className="card-answer">
            <p>{card.answer}</p>
          </div>
          {card.explanation && (
            <div className="card-explanation">
              <div className="card-explanation-label">💡 Erklärung</div>
              <p className="card-explanation-text">{card.explanation}</p>
            </div>
          )}
          <div className="card-actions">
            <button className="btn btn-wrong" onClick={() => onMark(false)}>
              🔄 Nochmal
            </button>
            <button className="btn btn-correct" onClick={() => onMark(true)}>
              ✓ Gewusst
            </button>
          </div>
        </>
      )}
    </div>
  );
}

// Multiple-choice card
function MCCard({
  card,
  allQs,
  cardState,
  onMark,
}: {
  card: Question;
  allQs: Question[];
  cardState: CardState | null;
  onMark: (correct: boolean) => void;
}) {
  const options = useMemo(
    () => generateMCOptions(card, allQs),
    [card.id]
  );
  const [selected, setSelected] = useState<number | null>(null);
  const answered = selected !== null;

  useEffect(() => setSelected(null), [card.id]);

  function handleSelect(idx: number) {
    if (answered) return;
    setSelected(idx);
  }

  function handleNext() {
    if (selected === null) return;
    onMark(options[selected].isCorrect);
  }

  const labels = ["A", "B", "C", "D"];
  const selectedOpt = selected !== null ? options[selected] : null;
  const correctOpt = options.find((o) => o.isCorrect)!;

  return (
    <div className="flashcard mc-card">
      <CardMeta card={card} cardState={cardState} />
      <div className="card-question">
        <p>{card.question}</p>
      </div>

      <div className="mc-options">
        {options.map((opt, idx) => {
          let cls = "mc-option";
          if (answered) {
            if (opt.isCorrect) cls += " mc-correct";
            else if (selected === idx) cls += " mc-wrong";
            else cls += " mc-dimmed";
          }
          return (
            <button
              key={idx}
              className={cls}
              onClick={() => handleSelect(idx)}
              disabled={answered && !opt.isCorrect && selected !== idx}
            >
              <span className="mc-label">{labels[idx]}</span>
              <span className="mc-text">{opt.text}</span>
              {answered && opt.isCorrect && (
                <span className="mc-icon mc-icon-correct">✓</span>
              )}
              {answered && selected === idx && !opt.isCorrect && (
                <span className="mc-icon mc-icon-wrong">✗</span>
              )}
            </button>
          );
        })}
      </div>

      {answered && selectedOpt && (
        <div className="mc-feedback">
          {selectedOpt.isCorrect ? (
            <div className="mc-feedback-correct">
              <div className="mc-fb-header">
                <span className="mc-fb-icon">✓</span>
                <strong>Richtig!</strong>
              </div>
              <div className="mc-fb-body">
                <span className="mc-fb-label">Vollständige Antwort:</span>
                <p>{correctOpt.hint}</p>
              </div>
            </div>
          ) : (
            <div className="mc-feedback-wrong">
              <div className="mc-fb-header">
                <span className="mc-fb-icon">✗</span>
                <strong>Falsch.</strong>
              </div>
              <div className="mc-fb-body">
                <span className="mc-fb-label">Dein Fehler:</span>
                <p className="mc-fb-error">{selectedOpt.hint}</p>
              </div>
              <div className="mc-fb-correct-block">
                <span className="mc-fb-label">Richtige Antwort:</span>
                <p>{correctOpt.hint}</p>
              </div>
            </div>
          )}
          {card.explanation && (
            <div className="card-explanation">
              <div className="card-explanation-label">💡 Erklärung</div>
              <p className="card-explanation-text">{card.explanation}</p>
            </div>
          )}
          <button className="btn btn-primary mc-next" onClick={handleNext}>
            Weiter →
          </button>
        </div>
      )}
    </div>
  );
}

// True / False card
function TrueFalseCard({
  card,
  allQs,
  cardState,
  onMark,
}: {
  card: Question;
  allQs: Question[];
  cardState: CardState | null;
  onMark: (correct: boolean) => void;
}) {
  const { statement, isTrue } = useMemo(() => {
    const showTrue = card.id % 2 === 0;
    if (showTrue) return { statement: card.answer, isTrue: true };
    const opts = generateMCOptions(card, allQs);
    const wrong = opts.find((o) => !o.isCorrect);
    return wrong
      ? { statement: wrong.text, isTrue: false }
      : { statement: card.answer, isTrue: true };
  }, [card.id]);

  const [answered, setAnswered] = useState(false);
  const [userAnswer, setUserAnswer] = useState<boolean | null>(null);
  useEffect(() => { setAnswered(false); setUserAnswer(null); }, [card.id]);

  function handleAnswer(ans: boolean) {
    if (answered) return;
    setAnswered(true);
    setUserAnswer(ans);
  }

  const correct = answered && userAnswer === isTrue;

  return (
    <div className="flashcard tf-card">
      <CardMeta card={card} cardState={cardState} />
      <div className="card-question"><p>{card.question}</p></div>
      <div className="tf-statement">
        <div className="tf-statement-label">Ist diese Aussage wahr oder falsch?</div>
        <p className="tf-statement-text">„{statement}"</p>
      </div>
      {!answered ? (
        <div className="tf-actions">
          <button className="btn tf-false-btn" onClick={() => handleAnswer(false)}>✗ Falsch</button>
          <button className="btn tf-true-btn" onClick={() => handleAnswer(true)}>✓ Wahr</button>
        </div>
      ) : (
        <>
          <div className={`tf-feedback ${correct ? "tf-feedback-correct" : "tf-feedback-wrong"}`}>
            <div className="tf-fb-header">
              <span className="tf-fb-icon">{correct ? "✓" : "✗"}</span>
              <strong>{correct ? "Richtig!" : "Falsch!"}</strong>
            </div>
            <p>Die Aussage war <strong>{isTrue ? "WAHR" : "FALSCH"}</strong>.</p>
            <div className="tf-correct-answer">
              <span className="tf-ca-label">Vollständige Antwort:</span>
              <p>{card.answer}</p>
            </div>
          </div>
          {card.explanation && (
            <div className="card-explanation">
              <div className="card-explanation-label">💡 Erklärung</div>
              <p className="card-explanation-text">{card.explanation}</p>
            </div>
          )}
          <button className="btn btn-primary mc-next" onClick={() => onMark(correct)}>Weiter →</button>
        </>
      )}
    </div>
  );
}

// Freetext card
function FreetextCard({
  card,
  cardState,
  onMark,
}: {
  card: Question;
  cardState: CardState | null;
  onMark: (correct: boolean) => void;
}) {
  const [input, setInput] = useState("");
  const [revealed, setRevealed] = useState(false);
  useEffect(() => { setInput(""); setRevealed(false); }, [card.id]);

  return (
    <div className="flashcard ft-card">
      <CardMeta card={card} cardState={cardState} />
      <div className="card-question"><p>{card.question}</p></div>
      <textarea
        className="ft-input"
        placeholder="Deine Antwort eingeben…"
        value={input}
        onChange={(e) => setInput(e.target.value)}
        disabled={revealed}
        rows={4}
      />
      {!revealed ? (
        <button className="btn btn-reveal ft-reveal-btn" onClick={() => setRevealed(true)}>
          Auflösen &amp; vergleichen
        </button>
      ) : (
        <>
          <div className="ft-comparison">
            <div className="ft-your-answer">
              <span className="ft-ca-label">Deine Antwort:</span>
              <p>{input.trim() || "(keine Eingabe)"}</p>
            </div>
            <div className="card-answer ft-correct-answer-box">
              <span className="ft-ca-label">Richtige Antwort:</span>
              <p>{card.answer}</p>
            </div>
          </div>
          {card.explanation && (
            <div className="card-explanation">
              <div className="card-explanation-label">💡 Erklärung</div>
              <p className="card-explanation-text">{card.explanation}</p>
            </div>
          )}
          <div className="card-actions">
            <button className="btn btn-wrong" onClick={() => onMark(false)}>🔄 Nochmal</button>
            <button className="btn btn-correct" onClick={() => onMark(true)}>✓ Gewusst</button>
          </div>
        </>
      )}
    </div>
  );
}

// Self-rating card
function SelfCard({
  card,
  cardState,
  onMark,
}: {
  card: Question;
  cardState: CardState | null;
  onMark: (correct: boolean) => void;
}) {
  const [showAnswer, setShowAnswer] = useState(false);
  useEffect(() => setShowAnswer(false), [card.id]);

  const swipe = useSwipe({
    onRight: () => onMark(true),
    onLeft: () => onMark(false),
    onRightStart: playCorrect,
    onLeftStart: playWrong,
  });

  return (
    <div className="flashcard self-card" ref={swipe.ref} style={swipe.cardStyle}>
      <div className="swipe-ov swipe-ov-right" style={{ opacity: swipe.showRight ? swipe.overlayStrength : 0 }}>✓ Gewusst</div>
      <div className="swipe-ov swipe-ov-left" style={{ opacity: swipe.showLeft ? swipe.overlayStrength : 0 }}>✗ Nochmal</div>
      <CardMeta card={card} cardState={cardState} />
      <div className="card-question"><p>{card.question}</p></div>
      {!showAnswer ? (
        <button className="btn btn-reveal" onClick={() => setShowAnswer(true)}>Antwort anzeigen</button>
      ) : (
        <>
          <div className="card-answer"><p>{card.answer}</p></div>
          {card.explanation && (
            <div className="card-explanation">
              <div className="card-explanation-label">💡 Erklärung</div>
              <p className="card-explanation-text">{card.explanation}</p>
            </div>
          )}
          <div className="self-actions">
            <button className="btn self-btn-wrong" onClick={() => onMark(false)}>✗ Nicht gewusst</button>
            <button className="btn self-btn-partial" onClick={() => onMark(false)}>△ Teilweise</button>
            <button className="btn self-btn-correct" onClick={() => onMark(true)}>✓ Gewusst</button>
          </div>
        </>
      )}
    </div>
  );
}

// Weak Blocks Panel
function WeakBlocksPanel({
  allQs,
  appState,
  onDrillBlock,
}: {
  allQs: Question[];
  appState: AppState;
  onDrillBlock: (block: string) => void;
}) {
  const blockStats = useMemo(() => {
    const map: Record<string, { total: number; wrong: number; weak: number; unseen: number }> = {};
    for (const q of allQs) {
      if (!map[q.block]) map[q.block] = { total: 0, wrong: 0, weak: 0, unseen: 0 };
      const cs = getCardState(appState, q.id);
      map[q.block].total++;
      map[q.block].wrong += cs.wrongCount;
      if (cs.status === "weak") map[q.block].weak++;
      if (cs.status === "unseen" && cs.seenCount === 0) map[q.block].unseen++;
    }
    return Object.entries(map)
      .map(([block, s]) => ({
        block,
        ...s,
        score: s.wrong * 2 + s.weak * 3,
        weakPct: s.total > 0 ? Math.round(((s.wrong + s.weak) / s.total) * 100) : 0,
      }))
      .filter((s) => s.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 6);
  }, [allQs, appState]);

  if (blockStats.length === 0) return null;

  const maxScore = blockStats[0]?.score ?? 1;

  return (
    <div className="weak-blocks-panel">
      <div className="weak-blocks-header">
        <span className="weak-blocks-icon">⚠️</span>
        <span className="weak-blocks-title">Schwächste Themenblöcke</span>
        <span className="weak-blocks-sub">Klick → Drill nur für diesen Block</span>
      </div>
      <div className="weak-blocks-list">
        {blockStats.map(({ block, total, wrong, weak, weakPct, score }) => (
          <button
            key={block}
            className="weak-block-row"
            onClick={() => onDrillBlock(block)}
            title={`Drill starten: ${block}`}
          >
            <div className="weak-block-info">
              <span className="weak-block-name">{block}</span>
              <span className="weak-block-stats">
                {weak > 0 && <span className="wbs-weak">{weak} schwach</span>}
                {wrong > 0 && <span className="wbs-wrong">{wrong}× falsch</span>}
                <span className="wbs-total">{total} Fragen</span>
              </span>
            </div>
            <div className="weak-block-bar-wrap">
              <div
                className="weak-block-bar-fill"
                style={{ width: `${Math.round((score / maxScore) * 100)}%` }}
              />
            </div>
            <span className="weak-block-pct">{weakPct}%</span>
            <span className="weak-block-drill-icon">🔥</span>
          </button>
        ))}
      </div>
    </div>
  );
}

// Splash Screen
function getCurrentPeriod(): "morning" | "day" | "evening" {
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 12) return "morning";
  if (hour >= 12 && hour < 18) return "day";
  return "evening";
}

function SplashScreen({ name }: { name: string }) {
  const greeting = getGreeting(name);
  return (
    <div className="splash-screen">
      <div className="splash-content">
        <img src="/logo.png" alt="KTM Logo" className="splash-logo" />
        <div className="splash-brand">
          <span className="splash-ktm">KTM</span>
          <span className="splash-brand-name">Kältetechnik Meister</span>
          <span className="splash-brand-sub">Lernplattform</span>
        </div>
        <p className="splash-greeting">{greeting}, {name}</p>
      </div>
    </div>
  );
}


// ── Main App ───────────────────────────────────────────────────────────────
export default function App() {
  const [currentUser, setCurrentUser] = useState<string | null>(() => {
    const session = sessionStorage.getItem("kaeltetechnik_session");
    if (session) return session;
    const saved = localStorage.getItem("name");
    if (saved?.trim()) {
      sessionStorage.setItem("kaeltetechnik_session", saved);
      return saved;
    }
    return null;
  });

  const storageKey = currentUser ? storageKeyForUser(currentUser) : "kaeltetechnik_v1";
  const [appState, setAppState] = useState<AppState>(() => loadState(storageKey));
  const [showAdmin, setShowAdmin] = useState(false);
  const [adminVersion, setAdminVersion] = useState(0);
  const [showResetModal, setShowResetModal] = useState(false);
  const [appView, setAppView] = useState<AppView>("learn");
  const [learningMode, setLearningMode] = useState<LearningMode>(() => {
    const saved = localStorage.getItem("ktm_learning_mode");
    return saved === "all" || saved === "unseen_first" || saved === "weak_first" || saved === "learned_first" || saved === "exam_mix"
      ? saved
      : "unseen_first";
  });
  const [quizMode, setQuizMode] = useState<QuizMode>(() => {
    const saved = localStorage.getItem("ktm_quiz_mode");
    return saved === "classic" || saved === "mc" || saved === "tf" || saved === "freetext" || saved === "self" || saved === "smart"
      ? saved
      : "classic";
  });
  const [filterStatus, setFilterStatus] = useState<FilterStatus>(() => {
    const saved = localStorage.getItem("ktm_filter_status");
    return saved === "all" || saved === "unseen" || saved === "weak" || saved === "learned"
      ? saved
      : "all";
  });
  const [blockFilter, setBlockFilter] = useState<string>(() =>
    localStorage.getItem("ktm_block_filter") || "all"
  );
  const [learnTab, setLearnTab] = useState<"dashboard" | "setup">(() => {
    const saved = localStorage.getItem("ktm_learn_tab");
    return saved === "setup" ? "setup" : "dashboard";
  });
  const [searchFilter, setSearchFilter] = useState("");
  const [darkMode, setDarkMode] = useState(() => {
    const saved = localStorage.getItem("kaeltetechnik_dark");
    if (saved !== null) return saved === "true";
    return false;
  });
  const [cardIndex, setCardIndex] = useState(0);
  const [sessionQueue, setSessionQueue] = useState<Question[]>([]);
  const [sessionStarted, setSessionStarted] = useState(false);
  const [isDrillMode, setIsDrillMode] = useState(false);
  const [drillInitialIds, setDrillInitialIds] = useState<number[]>([]);
  const [showSplash, setShowSplash] = useState(() => {
    const savedName = localStorage.getItem("name")?.trim();
    if (!savedName) return false;
    const currentPeriod = getCurrentPeriod();
    const lastPeriod = localStorage.getItem("lastWelcomePeriod");
    if (lastPeriod !== currentPeriod) {
      localStorage.setItem("lastWelcomePeriod", currentPeriod);
      return true;
    }
    return false;
  });
  const splashOnMount = useRef(showSplash);
  const sessionRestoredForRef = useRef<string | null>(null);
  const skipProgressSyncForUserRef = useRef<string | null>(null);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [hasSavedSession, setHasSavedSession] = useState(false);
  const [showWelcomeBanner, setShowWelcomeBanner] = useState(false);
  const savedSessionDataRef = useRef<{ queue: Question[]; cardIndex: number; isDrillMode: boolean } | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const edgeTouchX = useRef<number | null>(null);
  const edgeTouchY = useRef<number | null>(null);
  const sidebarSwipeX = useRef<number | null>(null);
  const [katalogScrollTo, setKatalogScrollTo] = useState<number | null>(null);
  const [drillCompleted, setDrillCompleted] = useState(false);
  const bookmarkKey = currentUser ? `ktm_bookmarks_${currentUser}` : "ktm_bookmarks";
  const [bookmarkedIds, setBookmarkedIds] = useState<Set<number>>(() => {
    try {
      const key = currentUser ? `ktm_bookmarks_${currentUser}` : "ktm_bookmarks";
      const raw = localStorage.getItem(key);
      if (raw) return new Set<number>(JSON.parse(raw));
    } catch {}
    return new Set<number>();
  });

  const allQs = useMemo(() => {
    const overrides = loadAdminOverrides();
    return [...allQuestions, ...appState.customQuestions].map((q) => {
      const ov = overrides[q.id];
      if (!ov) return q;
      return { ...q, ...ov };
    });
  }, [appState.customQuestions, adminVersion]);

  const streak = useMemo(() => computeStreak(appState.learnDays), [appState.learnDays]);

  const progressPayload = useMemo(() => {
    const cardValues = Object.values(appState.cards);
    const correctAnswers = cardValues.reduce(
      (sum, card) => sum + Math.max(0, card.seenCount - card.wrongCount),
      0
    );
    const wrongAnswers = cardValues.reduce((sum, card) => sum + card.wrongCount, 0);

    return {
      correctAnswers,
      totalQuestionsAnswered: correctAnswers + wrongAnswers,
      learnDays: appState.learnDays ?? [],
    };
  }, [appState.cards, appState.learnDays]);

  const blocks = useMemo(() => {
    const map: Record<string, number> = {};
    allQs.forEach((q) => { map[q.block] = (map[q.block] ?? 0) + 1; });
    return Object.entries(map).sort((a, b) => a[0].localeCompare(b[0]));
  }, [allQs]);

  // Persistenz & Themes
  useEffect(() => { saveState(appState, storageKey); }, [appState, storageKey]);
  useEffect(() => { localStorage.setItem("kaeltetechnik_dark", String(darkMode)); }, [darkMode]);
  useEffect(() => {
    document.documentElement.classList.toggle("dark", darkMode);
  }, [darkMode]);
  useEffect(() => { localStorage.setItem("ktm_quiz_mode", quizMode); }, [quizMode]);
  useEffect(() => { localStorage.setItem("ktm_learning_mode", learningMode); }, [learningMode]);
  useEffect(() => { localStorage.setItem("ktm_filter_status", filterStatus); }, [filterStatus]);
  useEffect(() => { localStorage.setItem("ktm_block_filter", blockFilter); }, [blockFilter]);
  useEffect(() => { localStorage.setItem("ktm_learn_tab", learnTab); }, [learnTab]);

  // Splash Auto-Dismiss mit Cleanup
  useEffect(() => {
    if (!splashOnMount.current) return;
    const t = setTimeout(() => setShowSplash(false), 1600);
    return () => clearTimeout(t);
  }, []);

  // Startup Sync & Daily Tracking – nur wenn Benutzer bekannt
  useEffect(() => {
    if (!currentUser) return;
    trackDailyOnline();
    skipProgressSyncForUserRef.current = currentUser;
    syncOnStartup(progressPayload).catch(() => {});
  }, [currentUser, progressPayload]);

  // Queue Progress Sync (throttled)
  useEffect(() => {
    if (!currentUser) return;
    if (skipProgressSyncForUserRef.current === currentUser) {
      skipProgressSyncForUserRef.current = null;
      return;
    }
    queueProgressSync(progressPayload);
  }, [progressPayload, currentUser]);

  // Session speichern
  useEffect(() => {
    if (!currentUser || !sessionStarted || sessionQueue.length === 0) return;
    const key = `ktm_last_session_${currentUser.toLowerCase()}`;
    localStorage.setItem(key, JSON.stringify({
      queueIds: sessionQueue.map((q) => q.id),
      cardIndex,
      isDrillMode,
    }));
  }, [sessionStarted, cardIndex, isDrillMode, sessionQueue, currentUser]);

  // Session wiederherstellen (Weiter lernen)
  useEffect(() => {
    if (!currentUser || sessionRestoredForRef.current === currentUser || allQs.length === 0) return;
    sessionRestoredForRef.current = currentUser;
    const key = `ktm_last_session_${currentUser.toLowerCase()}`;
    const raw = localStorage.getItem(key);
    if (!raw) return;
    try {
      const saved = JSON.parse(raw) as { queueIds: number[]; cardIndex: number; isDrillMode: boolean };
      const restored = saved.queueIds
        .map((id: number) => allQs.find((q) => q.id === id))
        .filter((q): q is Question => q !== undefined);
      if (restored.length > 0 && saved.cardIndex < restored.length) {
        savedSessionDataRef.current = {
          queue: restored,
          cardIndex: saved.cardIndex,
          isDrillMode: saved.isDrillMode ?? false,
        };
        setHasSavedSession(true);
      }
    } catch {}
  }, [currentUser, allQs]);

  // Willkommensbanner (stündlich)
  useEffect(() => {
    if (!currentUser) return;
    setShowWelcomeBanner(true);
    const hideTimer = setTimeout(() => setShowWelcomeBanner(false), 5000);
    const interval = setInterval(() => {
      setShowWelcomeBanner(true);
      setTimeout(() => setShowWelcomeBanner(false), 5000);
    }, 60 * 60 * 1000);
    return () => { clearTimeout(hideTimer); clearInterval(interval); };
  }, [currentUser]);

  const continueLastSession = useCallback(() => {
    const data = savedSessionDataRef.current;
    if (!data) return;
    setSessionQueue(data.queue);
    setCardIndex(data.cardIndex);
    setIsDrillMode(data.isDrillMode);
    setSessionStarted(true);
    setDrillCompleted(false);
    setHasSavedSession(false);
  }, []);

  const startSession = useCallback(() => {
    savedSessionDataRef.current = null;
    setHasSavedSession(false);
    let pool = allQs;
    if (blockFilter !== "all") {
      pool = pool.filter((q) => q.block === blockFilter);
    }
    if (filterStatus !== "all") {
      pool = pool.filter((q) => {
        const cs = getCardState(appState, q.id);
        if (filterStatus === "unseen") return cs.seenCount === 0;
        return cs.status === filterStatus;
      });
    }
    if (searchFilter.trim()) {
      const term = searchFilter.trim().toLowerCase();
      pool = pool.filter(
        (q) =>
          q.question.toLowerCase().includes(term) ||
          q.answer.toLowerCase().includes(term)
      );
    }
    const ordered = orderQuestions(pool, appState, learningMode);
    setSessionQueue(ordered);
    setCardIndex(0);
    setSessionStarted(true);
    setIsDrillMode(false);
    setDrillCompleted(false);
    setDrillInitialIds([]);
  }, [allQs, appState, learningMode, filterStatus, blockFilter, searchFilter]);

  const startDrill = useCallback((blockFilterParam?: string) => {
    const pool = blockFilterParam ? allQs.filter((q) => q.block === blockFilterParam) : allQs;
    const scored = pool
      .map((q) => ({ q, cs: getCardState(appState, q.id) }))
      .filter(({ cs }) => cs.wrongCount > 0 || cs.status === "weak")
      .sort((a, b) => b.cs.wrongCount - a.cs.wrongCount || (a.cs.status === "weak" ? -1 : 1));
    const top = scored.slice(0, 20).map(({ q }) => q);
    if (top.length === 0) {
      alert("Noch keine schwachen Fragen vorhanden. Lerne erst einige Karten und beantworte sie falsch!");
      return;
    }
    const ids = top.map((q) => q.id);
    setDrillInitialIds(ids);
    setSessionQueue(top);
    setCardIndex(0);
    setSessionStarted(true);
    setIsDrillMode(true);
    setDrillCompleted(false);
  }, [allQs, appState]);

  function toggleBookmark(id: number) {
    setBookmarkedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      localStorage.setItem(bookmarkKey, JSON.stringify([...next]));
      return next;
    });
  }

  const startBookmarkSession = useCallback(() => {
    const pool = allQs.filter((q) => bookmarkedIds.has(q.id));
    if (pool.length === 0) return;
    setSessionQueue(pool);
    setCardIndex(0);
    setSessionStarted(true);
    setIsDrillMode(false);
    setDrillCompleted(false);
    setDrillInitialIds([]);
  }, [allQs, bookmarkedIds]);

  const currentCard = sessionQueue[cardIndex];
  const cardState = currentCard ? getCardState(appState, currentCard.id) : null;

  const drillMastered = useMemo(
    () => isDrillMode
      ? drillInitialIds.filter((id) => appState.cards[id]?.status === "learned").length
      : 0,
    [isDrillMode, drillInitialIds, appState.cards]
  );

  const searchMatchCount = useMemo(() => {
    if (!searchFilter.trim()) return 0;
    const term = searchFilter.trim().toLowerCase();
    let pool = allQs;
    if (blockFilter !== "all") pool = pool.filter((q) => q.block === blockFilter);
    if (filterStatus !== "all") {
      pool = pool.filter((q) => {
        const cs = getCardState(appState, q.id);
        if (filterStatus === "unseen") return cs.seenCount === 0;
        return cs.status === filterStatus;
      });
    }
    return pool.filter(
      (q) =>
        q.question.toLowerCase().includes(term) ||
        q.answer.toLowerCase().includes(term)
    ).length;
  }, [searchFilter, allQs, blockFilter, filterStatus, appState]);

  const drillCandidateCount = useMemo(
    () => allQs.filter((q) => {
      const cs = getCardState(appState, q.id);
      return cs.wrongCount > 0 || cs.status === "weak";
    }).length,
    [allQs, appState]
  );

function markCard(correct: boolean) {
  if (!currentCard) return;

  const today = new Date().toISOString().slice(0, 10);
  const existing = getCardState(appState, currentCard.id);
  const newStreak = correct ? existing.correctStreak + 1 : 0;
  const newStatus: CardStatus =
    newStreak >= 2 ? "learned" : !correct ? "weak" : "learning";
  const prevDays = appState.learnDays ?? [];
  const learnDays = prevDays.includes(today) ? prevDays : [...prevDays, today];
  const newCards = {
    ...appState.cards,
    [currentCard.id]: {
      ...existing,
      status: newStatus,
      correctStreak: newStreak,
      seenCount: existing.seenCount + 1,
      wrongCount: existing.wrongCount + (correct ? 0 : 1),
    },
  };
  setAppState({ ...appState, learnDays, cards: newCards });

  // ─── Fortschritt in Supabase speichern ──────────────────────────────
  const allCards = Object.values(newCards);
  const totalQuestionsAnswered = allCards.reduce((sum, c) => sum + c.seenCount, 0);
  const correctAnswers = allCards.reduce(
    (sum, c) => sum + Math.max(0, c.seenCount - c.wrongCount),
    0
  );
  const accuracy = totalQuestionsAnswered > 0 ? Math.round((correctAnswers / totalQuestionsAnswered) * 100) : 0;

  if (currentUser) {
    supabase
      .from("users")
      .update({
        totalQuestionsAn: totalQuestionsAnswered,
        correctAnswers: correctAnswers,
        accuracy: accuracy,
        lastActive: new Date().toISOString(),
        learnDays: learnDays,
      })
      .eq("name", currentUser)
      .then(({ error }) => error && console.warn("Supabase update error:", error));
  }

  // ─── Drill- / Session-Logik ──────────────────────────────────────────
  if (isDrillMode) {
    const allDone = drillInitialIds.every(
      (id) => (newCards[id]?.status ?? "unseen") === "learned"
    );
    if (allDone) {
      setDrillCompleted(true);
      setSessionStarted(false);
      setIsDrillMode(false);
      clearSavedSession();
      return;
    }
    let nextQueue = [...sessionQueue];
    if (!correct) {
      nextQueue.push(currentCard);
    }
    const nextIdx = cardIndex + 1;
    if (nextIdx >= nextQueue.length) {
      const remaining = drillInitialIds
        .filter((id) => (newCards[id]?.status ?? "unseen") !== "learned")
        .map((id) => allQs.find((q) => q.id === id))
        .filter((q): q is Question => q !== undefined);
      for (let i = remaining.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [remaining[i], remaining[j]] = [remaining[j], remaining[i]];
      }
      setSessionQueue(remaining);
      setCardIndex(0);
    } else {
      setSessionQueue(nextQueue);
      setCardIndex(nextIdx);
    }
  } else {
    if (cardIndex + 1 >= sessionQueue.length) {
      setSessionStarted(false);
      clearSavedSession();
    } else {
      setCardIndex((i) => i + 1);
    }
  }
}

  function clearSavedSession() {
    if (!currentUser) return;
    localStorage.removeItem(`ktm_last_session_${currentUser.toLowerCase()}`);
  }

  function resetProgress() {
    setShowResetModal(true);
  }

  function confirmReset() {
    setAppState({ cards: {}, customQuestions: appState.customQuestions });
    setSessionStarted(false);
    clearSavedSession();
    savedSessionDataRef.current = null;
    setHasSavedSession(false);
    setShowResetModal(false);
  }

  function handleAddQuestions(questions: Question[]) {
    setAppState((prev) => ({ ...prev, customQuestions: [...prev.customQuestions, ...questions] }));
  }

  function handleUpdateCustomQuestion(updated: Question) {
    setAppState((prev) => ({
      ...prev,
      customQuestions: prev.customQuestions.map((q) => q.id === updated.id ? updated : q),
    }));
  }

  function handleDeleteCustomQuestion(id: number) {
    setAppState((prev) => ({
      ...prev,
      customQuestions: prev.customQuestions.filter((q) => q.id !== id),
    }));
  }

  function handleLogin(name: string) {
    sessionRestoredForRef.current = null;
    localStorage.setItem("name", name);
    sessionStorage.setItem("kaeltetechnik_session", name);
    const period = getCurrentPeriod();
    localStorage.setItem("lastWelcomePeriod", period);
    setCurrentUser(name);
    setShowLogoutConfirm(false); // ← wichtig, damit der Abmelde-Dialog nicht direkt erscheint
    setAppState(loadState(storageKeyForUser(name)));
    setSessionStarted(false);
    setAppView("learn");
    setShowSplash(true);
    setTimeout(() => setShowSplash(false), 1600);
  }

  function handleLogout() {
    setShowUserMenu(false);
    setShowLogoutConfirm(true);
  }

  function confirmLogout() {
    localStorage.removeItem("name");
    sessionStorage.removeItem("kaeltetechnik_session");
    setCurrentUser(null);
    setAppState({ cards: {}, customQuestions: [] });
  }

  function handleRootTouchStart(e: React.TouchEvent) {
    const x = e.touches[0].clientX;
    const y = e.touches[0].clientY;
    if (x < 32 && !sidebarOpen) {
      edgeTouchX.current = x;
      edgeTouchY.current = y;
    } else {
      edgeTouchX.current = null;
      edgeTouchY.current = null;
    }
  }

  function handleRootTouchEnd(e: React.TouchEvent) {
    if (edgeTouchX.current !== null) {
      const endX = e.changedTouches[0].clientX;
      const endY = e.changedTouches[0].clientY;
      const dx = endX - edgeTouchX.current;
      const dy = Math.abs(endY - (edgeTouchY.current ?? endY));
      if (dx > 60 && dy < 80) setSidebarOpen(true);
    }
    edgeTouchX.current = null;
    edgeTouchY.current = null;
  }

  if (!currentUser) {
    return <LoginScreen onLogin={handleLogin} />;
  }

  if (showSplash) {
    return <SplashScreen name={currentUser} />;
  }

  return (
    <div
      className={`app-root${darkMode ? " dark" : ""}`}
      onTouchStart={handleRootTouchStart}
      onTouchEnd={handleRootTouchEnd}
    >
      {/* Sidebar Backdrop */}
      {sidebarOpen && (
        <div className="sidebar-backdrop" onClick={() => setSidebarOpen(false)} />
      )}

      {/* Sidebar */}
      <nav
        className={`sidebar${sidebarOpen ? " sidebar--open" : ""}`}
        onTouchStart={(e) => { sidebarSwipeX.current = e.touches[0].clientX; }}
        onTouchEnd={(e) => {
          if (sidebarSwipeX.current !== null) {
            const dx = sidebarSwipeX.current - e.changedTouches[0].clientX;
            if (dx > 60) setSidebarOpen(false);
          }
          sidebarSwipeX.current = null;
        }}
      >
        <div className="sidebar-top">
          <div className="sidebar-brand">
            <img src="/logo.png" alt="KTM" className="sidebar-logo" />
            <div>
              <div className="sidebar-brand-name">KTM</div>
              <div className="sidebar-brand-sub">Kältetechnik Meister</div>
            </div>
          </div>
          <button className="sidebar-close-btn" onClick={() => setSidebarOpen(false)} aria-label="Schließen">✕</button>
        </div>

        <div className="sidebar-nav">
          {([
            { view: "learn",    icon: "🏠", label: "Startseite" },
            { view: "exam",     icon: "📝", label: "Prüfungssimulation" },
            { view: "browse",   icon: "📋", label: "Alle Fragen" },
            { view: "stats",    icon: "📊", label: "Statistik" },
            { view: "katalog",  icon: "📚", label: "Fragenkatalog" },
            { view: "pruefung", icon: "🎓", label: "Prüfungsvorbereitung" },
          ] as const).map(({ view, icon, label }) => (
            <button
              key={view}
              className={`sidebar-nav-item${appView === view ? " sidebar-nav-item--active" : ""}`}
              onClick={() => {
                setAppView(view);
                setSessionStarted(false);
                setSidebarOpen(false);
              }}
            >
              <span className="sidebar-nav-icon">{icon}</span>
              <span className="sidebar-nav-label">{label}</span>
            </button>
          ))}
        </div>

        <div className="sidebar-footer">
          {streak > 0 && (
            <div className="sidebar-streak">
              <span>🔥</span>
              <span>{streak} Tage{streak !== 1 ? "" : ""} Serie</span>
            </div>
          )}
          <div className="sidebar-footer-user">
            <span className="sidebar-footer-avatar">{currentUser.charAt(0).toUpperCase()}</span>
            <div>
              <div className="sidebar-footer-name">{currentUser}</div>
              <button className="sidebar-footer-logout" onClick={() => { setSidebarOpen(false); handleLogout(); }}>
                Abmelden
              </button>
            </div>
          </div>
          <button className="sidebar-dark-btn" onClick={() => setDarkMode((d) => !d)}>
            {darkMode ? "☀️ Hellmodus" : "🌙 Dunkelmodus"}
          </button>
        </div>
      </nav>

      <header className="app-header">
        <button className="hamburger-btn" onClick={() => setSidebarOpen(true)} aria-label="Menü öffnen">
          <span className="hamburger-bar" />
          <span className="hamburger-bar" />
          <span className="hamburger-bar" />
        </button>
        <button
          className="header-brand header-brand--btn"
          onClick={() => { setAppView("learn"); setSessionStarted(false); }}
          title="Startseite"
        >
          <img src="/logo.png" alt="KTM" className="header-logo" style={{ width: "60px", height: "auto" }} /
          <div className="header-title">
            <span className="header-ktm">KTM</span>
            <span className="header-brand-name">Kältetechnik Meister Lernplattform</span>
          </div>
        </button>
        <div className="header-right">
          {streak > 0 && (
            <div className={`streak-badge${streak >= 30 ? " streak-legendary" : streak >= 14 ? " streak-epic" : streak >= 7 ? " streak-great" : ""}`}>
              <span className="streak-flame">🔥</span>
              <span className="streak-count">{streak}</span>
              <span className="streak-label">
                {streak === 1 ? "Tag" : "Tage"}
              </span>
            </div>
          )}
          <div className="user-menu-wrap">
            <button
              className="header-username-btn"
              onClick={() => setShowUserMenu((v) => !v)}
              aria-haspopup="true"
              aria-expanded={showUserMenu}
            >
              <span className="header-username-text">{currentUser}</span>
              <span className="header-username-arrow">{showUserMenu ? "▲" : "▼"}</span>
            </button>
            {showUserMenu && (
              <>
                <div className="user-menu-backdrop" onClick={() => setShowUserMenu(false)} />
                <div className="user-menu-dropdown">
                  <button className="user-menu-item user-menu-item--danger" onClick={handleLogout}>
                    Abmelden
                  </button>
                </div>
              </>
            )}
          </div>
          <button className="btn btn-icon" onClick={() => setDarkMode((d) => !d)} title={darkMode ? "Hellmodus" : "Dunkelmodus"}>
            {darkMode ? "☀️" : "🌙"}
          </button>
          <button className="btn btn-icon admin-gear-btn" onClick={() => setShowAdmin(true)} title="Admin-Einstellungen">⚙️</button>
        </div>
      </header>

      {/* Breadcrumb */}
      {appView !== "learn" && (
        <div className="view-breadcrumb">
          <button className="view-breadcrumb-back" onClick={() => { setAppView("learn"); setSessionStarted(false); }}>← Startseite</button>
          <span className="view-breadcrumb-sep">/</span>
          <span className="view-breadcrumb-current">
            {appView === "exam" ? "Prüfungssimulation"
              : appView === "browse" ? "Alle Fragen"
              : appView === "stats" ? "Statistik"
              : appView === "katalog" ? "Fragenkatalog"
              : "Prüfungsvorbereitung"}
          </span>
        </div>
      )}

      <main className="app-main">
        <div key={appView} className="view-slide-in">
          {/* Exam View */}
          {appView === "exam" && (
            <ExamView onBack={() => setAppView("learn")} allQs={allQs} />
          )}

          {/* Browse View */}
          {appView === "browse" && (
            <BrowseView onBack={() => setAppView("learn")} allQs={allQs} />
          )}

          {/* Stats View */}
          {appView === "stats" && (
            <StatsView appState={appState} allQs={allQs} />
          )}

          {/* Katalog View */}
          {appView === "katalog" && (
            <KatalogView
              allQs={allQs}
              scrollToId={katalogScrollTo}
              bookmarkedIds={bookmarkedIds}
              onToggleBookmark={toggleBookmark}
            />
          )}

          {/* Prüfungsvorbereitung View */}
          {appView === "pruefung" && (
            <PruefungsvorbereitungView />
          )}

          {/* Learn View */}
          {appView === "learn" && (
            <>
              {/* Fullscreen Session */}
              {sessionStarted && currentCard ? (
                <div className="session-fullscreen">
                  <div className="session-fullscreen-topbar">
                    <button className="session-back-btn" onClick={() => { clearSavedSession(); setSessionStarted(false); }}>
                      ← Zurück
                    </button>
                    {isDrillMode ? (
                      <div className="drill-session-header">
                        <div className="drill-session-title">
                          <span className="drill-fire">🔥</span>
                          <span>Schwachstellen-Drill</span>
                        </div>
                        <div className="drill-mastery-row">
                          <div className="drill-mastery-bar-track">
                            <div
                              className="drill-mastery-bar-fill"
                              style={{ width: `${drillInitialIds.length === 0 ? 0 : (drillMastered / drillInitialIds.length) * 100}%` }}
                            />
                          </div>
                          <span className="drill-mastery-label">
                            {drillMastered} / {drillInitialIds.length} gemeistert
                          </span>
                        </div>
                      </div>
                    ) : (
                      <div className="session-header">
                        <ProgressBar current={cardIndex + 1} total={sessionQueue.length} />
                        <span className={`quiz-mode-badge${
                          currentCard.block === CALC_BLOCK ? " qmb-calc"
                          : quizMode === "mc" ? " qmb-mc"
                          : quizMode === "tf" ? " qmb-tf"
                          : quizMode === "freetext" ? " qmb-freetext"
                          : quizMode === "self" ? " qmb-self"
                          : quizMode === "smart" ? " qmb-smart"
                          : " qmb-classic"
                        }`}>
                          {currentCard.block === CALC_BLOCK ? "🔢 Rechenaufgabe"
                          : quizMode === "mc" ? "🎯 Multiple Choice"
                          : quizMode === "tf" ? "✅ Wahr / Falsch"
                          : quizMode === "freetext" ? "✍️ Freitext"
                          : quizMode === "self" ? "⭐ Selbstbewertung"
                          : quizMode === "smart" ? "🧠 Smart-Lernen"
                          : "📖 Klassisch"}
                        </span>
                      </div>
                    )}
                  </div>

                  <div className="session-fullscreen-body">
                    {currentCard.block === CALC_BLOCK ? (
                      <CalcCard key={currentCard.id} card={currentCard} cardState={cardState} onMark={markCard} />
                    ) : quizMode === "classic" ? (
                      <ClassicCard key={currentCard.id} card={currentCard} cardState={cardState} onMark={markCard} />
                    ) : quizMode === "mc" ? (
                      <MCCard key={currentCard.id} card={currentCard} allQs={allQs} cardState={cardState} onMark={markCard} />
                    ) : quizMode === "tf" ? (
                      <TrueFalseCard key={currentCard.id} card={currentCard} allQs={allQs} cardState={cardState} onMark={markCard} />
                    ) : quizMode === "freetext" ? (
                      <FreetextCard key={currentCard.id} card={currentCard} cardState={cardState} onMark={markCard} />
                    ) : quizMode === "smart" ? (
                      <SmartCard key={currentCard.id} card={currentCard} cardState={cardState} onMark={markCard} />
                    ) : (
                      <SelfCard key={currentCard.id} card={currentCard} cardState={cardState} onMark={markCard} />
                    )}

                    <button
                      className={`btn-bookmark-card${bookmarkedIds.has(currentCard.id) ? " btn-bookmark-card--active" : ""}`}
                      onClick={() => toggleBookmark(currentCard.id)}
                      title={bookmarkedIds.has(currentCard.id) ? "Merker entfernen" : "Frage merken"}
                    >
                      {bookmarkedIds.has(currentCard.id) ? "🔖 Gemerkt" : "🔖 Merken"}
                    </button>

                    {!isDrillMode && cardIndex + 1 < sessionQueue.length && (
                      <button className="btn btn-skip" onClick={() => setCardIndex((i) => i + 1)}>
                        Überspringen →
                      </button>
                    )}
                  </div>
                </div>
              ) : drillCompleted ? (
                <div className="session-done drill-done">
                  <div className="done-icon">🏆</div>
                  <h2>Drill abgeschlossen!</h2>
                  <p>Hervorragend! Du hast alle <strong>{drillInitialIds.length}</strong> schwachen Fragen gemeistert.</p>
                  <div className="drill-done-actions">
                    <button className="btn btn-drill" onClick={() => startDrill()} disabled={drillCandidateCount === 0}>
                      🔥 Neuer Drill ({Math.min(drillCandidateCount, 20)})
                    </button>
                    <button className="btn btn-primary" onClick={() => { setDrillCompleted(false); startSession(); }}>
                      Weiter lernen
                    </button>
                  </div>
                </div>
              ) : sessionStarted && !currentCard ? (
                <div className="session-done">
                  <div className="done-icon">🎉</div>
                  <h2>Runde abgeschlossen!</h2>
                  <p>Du hast alle Karten in dieser Runde durchgearbeitet.</p>
                  <button className="btn btn-primary" onClick={startSession}>Neue Runde starten</button>
                </div>
              ) : (
                /* Home / Learn Tabs */
                <>
                  <div className="learn-tab-switch">
                    <button
                      className={`learn-tab-btn${learnTab === "dashboard" ? " learn-tab-btn--active" : ""}`}
                      onClick={() => setLearnTab("dashboard")}
                    >
                      📊 Dashboard
                    </button>
                    <button
                      className={`learn-tab-btn${learnTab === "setup" ? " learn-tab-btn--active" : ""}`}
                      onClick={() => setLearnTab("setup")}
                    >
                      📚 Lernen
                    </button>
                  </div>

                  {learnTab === "dashboard" ? (
                    <div className="learn-panel">
                      <div className={`welcome-banner${showWelcomeBanner ? " welcome-banner--visible" : ""}`}>
                        <span className="welcome-banner-text">
                          {getGreeting(currentUser)} 👋
                        </span>
                        <button className="welcome-banner-close" onClick={() => setShowWelcomeBanner(false)}>✕</button>
                      </div>

                      {hasSavedSession && savedSessionDataRef.current && (
                        <button className="continue-session-btn" onClick={continueLastSession}>
                          <span className="continue-session-icon">▶</span>
                          <span className="continue-session-text">
                            <span className="continue-session-label">Weiter lernen</span>
                            <span className="continue-session-sub">
                              {savedSessionDataRef.current.isDrillMode ? "Schwachstellen-Drill" : "Letzte Session"} · Frage {savedSessionDataRef.current.cardIndex + 1} von {savedSessionDataRef.current.queue.length}
                            </span>
                          </span>
                          <span className="continue-session-arrow">→</span>
                        </button>
                      )}

                      {(() => {
                        const cardValues = Object.values(appState.cards);
                        const learned = cardValues.filter(c => c.status === "learned").length;
                        const seen = cardValues.filter(c => c.seenCount > 0).length;
                        const weak = cardValues.filter(c => c.status === "weak").length;
                        const pct = allQs.length > 0 ? Math.round((learned / allQs.length) * 100) : 0;
                        const seenPct = allQs.length > 0 ? Math.round((seen / allQs.length) * 100) : 0;
                        return (
                          <div className="dashboard-overview">
                            <div className="dashboard-overview-header">
                              <span className="dashboard-overview-title">Gesamtfortschritt</span>
                              <span className="dashboard-overview-pct">{pct}%</span>
                            </div>
                            <div className="dashboard-progress-track">
                              <div className="dashboard-progress-seen"  style={{ width: `${seenPct}%` }} />
                              <div className="dashboard-progress-learned" style={{ width: `${pct}%` }} />
                            </div>
                            <div className="dashboard-overview-stats">
                              <span className="dash-stat dash-stat--total">
                                <strong>{allQs.length}</strong> Gesamt
                              </span>
                              <span className="dash-stat dash-stat--unseen">
                                <strong>{allQs.length - seen}</strong> Ungesehen
                              </span>
                              <span className="dash-stat dash-stat--learned">
                                <strong>{learned}</strong> Gelernt ✓
                              </span>
                              <span className="dash-stat dash-stat--weak">
                                <strong>{weak}</strong> Schwach ⚠
                              </span>
                            </div>
                            {streak > 0 && (
                              <div className="dashboard-streak-row">
                                🔥 <strong>{streak} Tage</strong> Lernserie aktiv
                              </div>
                            )}
                            <button
                              className="btn btn-primary dashboard-start-btn"
                              onClick={() => setLearnTab("setup")}
                            >
                              Lernen einrichten →
                            </button>
                          </div>
                        );
                      })()}

                      {(() => {
                        const rdmQ = allQs.length > 0 ? allQs[Math.floor(_homeRandomFraction * allQs.length)] : null;
                        if (!rdmQ) return null;
                        return (
                          <button
                            className="fragenkatalog-block fragenkatalog-block--interactive frage-des-moments-home"
                            onClick={() => { setKatalogScrollTo(rdmQ.id); setAppView("katalog"); }}
                            title="Im Fragenkatalog öffnen"
                          >
                            <div className="fragenkatalog-header">
                              <span className="fragenkatalog-icon">💡</span>
                              <h3 className="fragenkatalog-title">Frage des Moments</h3>
                              <span className="fragenkatalog-open-hint">→ Katalog</span>
                            </div>
                            <p className="fragenkatalog-question">{rdmQ.question}</p>
                            <p className="fragenkatalog-answer-label-inline">Antwort</p>
                            <p className="fragenkatalog-desc">{rdmQ.answer}</p>
                          </button>
                        );
                      })()}

                      <WeakBlocksPanel allQs={allQs} appState={appState} onDrillBlock={(block) => startDrill(block)} />
                    </div>
                  ) : (
                    <div className="learn-panel">
                      <div className="mode-section">
                        <span className="mode-section-label">Kartentyp</span>
                        <div className="quiz-mode-grid">
                          {([
                            { value: "classic",  icon: "📖", label: "Klassisch" },
                            { value: "mc",       icon: "🎯", label: "Multiple Choice" },
                            { value: "tf",       icon: "✅", label: "Wahr / Falsch" },
                            { value: "freetext", icon: "✍️", label: "Freitext" },
                            { value: "self",     icon: "⭐", label: "Selbstbewertung" },
                            { value: "smart",    icon: "🧠", label: "Smart-Lernen" },
                          ] as const).map(({ value, icon, label }) => (
                            <button
                              key={value}
                              className={`qm-tile${quizMode === value ? " qm-tile--active" : ""}`}
                              onClick={() => setQuizMode(value)}
                            >
                              <span className="qm-tile-icon">{icon}</span>
                              <span className="qm-tile-label">{label}</span>
                            </button>
                          ))}
                        </div>
                      </div>

                      <div className="learn-filters">
                        <div className="mode-bar">
                          <label className="mode-label">Kapitel:</label>
                          <select
                            className="mode-select"
                            value={blockFilter}
                            onChange={(e) => { setBlockFilter(e.target.value); setSessionStarted(false); }}
                          >
                            <option value="all">Alle Kapitel ({allQs.length})</option>
                            {blocks.map(([name, count]) => (
                              <option key={name} value={name}>{name} ({count})</option>
                            ))}
                          </select>
                        </div>

                        <div className="mode-bar">
                          <label className="mode-label">Reihenfolge:</label>
                          <select
                            className="mode-select"
                            value={learningMode}
                            onChange={(e) => setLearningMode(e.target.value as LearningMode)}
                          >
                            <option value="all">Alle Karten</option>
                            <option value="unseen_first">Ungesehen zuerst</option>
                            <option value="weak_first">Schwach zuerst</option>
                            <option value="learned_first">Gelernt zuerst</option>
                            <option value="exam_mix">Prüfungsmix</option>
                          </select>
                        </div>

                        <div className="mode-bar">
                          <label className="mode-label">Suche:</label>
                          <div className="browse-search-wrap" style={{ flex: 1, margin: 0 }}>
                            <span className="browse-search-icon">🔍</span>
                            <input
                              className="browse-search"
                              placeholder="Frage oder Antwort durchsuchen…"
                              value={searchFilter}
                              onChange={(e) => { setSearchFilter(e.target.value); setSessionStarted(false); }}
                            />
                            {searchFilter && (
                              <button className="browse-search-clear" onClick={() => { setSearchFilter(""); setSessionStarted(false); }}>✕</button>
                            )}
                          </div>
                          {searchFilter.trim() && (
                            <span className="search-match-hint">{searchMatchCount} Treffer</span>
                          )}
                        </div>
                      </div>

                      {(filterStatus !== "all" || blockFilter !== "all" || searchFilter.trim() !== "") && (
                        <div className="filter-banners">
                          {blockFilter !== "all" && (
                            <div className="filter-banner filter-banner-block">
                              <span className="filter-banner-icon">📚</span>
                              <span className="filter-banner-text">Kapitel: <strong>{blockFilter}</strong></span>
                              <button className="filter-banner-clear" onClick={() => { setBlockFilter("all"); setSessionStarted(false); }}>✕</button>
                            </div>
                          )}
                          {filterStatus !== "all" && (
                            <div className={`filter-banner filter-banner-${filterStatus}`}>
                              <span className="filter-banner-icon">
                                {filterStatus === "weak" ? "⚠" : filterStatus === "learned" ? "✓" : "👁"}
                              </span>
                              <span className="filter-banner-text">
                                {filterStatus === "weak" && "Nur schwache Fragen"}
                                {filterStatus === "learned" && "Nur gelernte Fragen"}
                                {filterStatus === "unseen" && "Nur ungesehene Fragen"}
                              </span>
                              <button className="filter-banner-clear" onClick={() => { setFilterStatus("all"); setSessionStarted(false); }}>✕</button>
                            </div>
                          )}
                          {searchFilter.trim() && (
                            <div className="filter-banner filter-banner-search">
                              <span className="filter-banner-icon">🔍</span>
                              <span className="filter-banner-text">Suche: <strong>„{searchFilter}"</strong> · {searchMatchCount} Treffer</span>
                              <button className="filter-banner-clear" onClick={() => { setSearchFilter(""); setSessionStarted(false); }}>✕</button>
                            </div>
                          )}
                        </div>
                      )}

                      <button className="btn btn-primary large-btn setup-start-btn" onClick={startSession}>
                        {blockFilter !== "all" ? `📚 Kapitel starten` : "Jetzt starten"}
                      </button>

                      {drillCandidateCount > 0 && (
                        <div className="mode-bar drill-bar">
                          <button
                            className="btn btn-drill"
                            onClick={() => startDrill()}
                            title={`Top ${Math.min(drillCandidateCount, 20)} schwächste Fragen wiederholen bis alle gemeistert sind`}
                          >
                            🔥 Schwachstellen-Drill
                            <span className="drill-count-badge">{Math.min(drillCandidateCount, 20)}</span>
                          </button>
                          <span className="drill-hint">
                            {drillCandidateCount} schwache Frage{drillCandidateCount !== 1 ? "n" : ""} · Drill läuft bis alle gemeistert sind
                          </span>
                        </div>
                      )}

                      {bookmarkedIds.size > 0 && (
                        <div className="mode-bar bookmark-bar">
                          <button
                            className="btn btn-bookmark-session"
                            onClick={startBookmarkSession}
                            title={`${bookmarkedIds.size} gemerkte Fragen lernen`}
                          >
                            🔖 Gemerkte lernen
                            <span className="drill-count-badge">{bookmarkedIds.size}</span>
                          </button>
                          <span className="drill-hint">
                            {bookmarkedIds.size} gemerkte Frage{bookmarkedIds.size !== 1 ? "n" : ""} in eigener Session lernen
                          </span>
                        </div>
                      )}

                      <button className="btn btn-ghost reset-btn-sm" onClick={resetProgress}>
                        Fortschritt zurücksetzen
                      </button>
                    </div>
                  )}
                </>
              )}
            </>
          )}
        </div>
      </main>

      {showAdmin && (
        <AdminPanel
          onClose={() => setShowAdmin(false)}
          onChanged={() => setAdminVersion((v) => v + 1)}
          onAddQuestions={handleAddQuestions}
          customQuestions={appState.customQuestions}
          onUpdateCustomQuestion={handleUpdateCustomQuestion}
          onDeleteCustomQuestion={handleDeleteCustomQuestion}
        />
      )}

      {showResetModal && (
        <ResetModal
          onConfirm={confirmReset}
          onCancel={() => setShowResetModal(false)}
        />
      )}

      {showLogoutConfirm && (
        <div className="logout-confirm-overlay" onClick={() => setShowLogoutConfirm(false)}>
          <div className="logout-confirm-dialog" onClick={(e) => e.stopPropagation()}>
            <p className="logout-confirm-text">Möchten Sie sich wirklich abmelden?</p>
            <div className="logout-confirm-actions">
              <button className="btn btn-ghost logout-confirm-cancel" onClick={() => setShowLogoutConfirm(false)}>
                Abbrechen
              </button>
              <button className="btn btn-danger logout-confirm-ok" onClick={confirmLogout}>
                Abmelden
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
