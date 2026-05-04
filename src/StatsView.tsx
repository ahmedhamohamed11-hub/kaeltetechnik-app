import { useMemo, useEffect, useState } from "react";
import type { Question } from "./questions";

interface CardState {
  id: number;
  status: "unseen" | "learning" | "learned" | "weak";
  correctStreak: number;
  seenCount: number;
  wrongCount: number;
}
interface AppState {
  cards: Record<number, CardState>;
  customQuestions: Question[];
  learnDays?: string[];
}

// ── SVG Donut Chart ────────────────────────────────────────────────────────
interface Segment { value: number; color: string; label: string; }

function DonutChart({ segments, total }: { segments: Segment[]; total: number }) {
  const R = 48;
  const CX = 60;
  const CY = 60;
  const CIRC = 2 * Math.PI * R;

  let cumulative = 0;
  const arcs = segments.map((seg) => {
    const frac = total > 0 ? seg.value / total : 0;
    const len = frac * CIRC;
    const offset = CIRC - cumulative;
    cumulative += len;
    return { ...seg, len, offset, frac };
  });

  const learned = segments.find((s) => s.label === "Gelernt")?.value ?? 0;
  const pct = total > 0 ? Math.round((learned / total) * 100) : 0;

  return (
    <div className="donut-wrap">
      <svg viewBox="0 0 120 120" className="donut-svg">
        {total === 0 ? (
          <circle cx={CX} cy={CY} r={R} fill="none" stroke="var(--border)" strokeWidth="14" />
        ) : (
          arcs.map((arc, i) =>
            arc.len > 0 ? (
              <circle
                key={i}
                cx={CX}
                cy={CY}
                r={R}
                fill="none"
                stroke={arc.color}
                strokeWidth="14"
                strokeDasharray={`${arc.len} ${CIRC - arc.len}`}
                strokeDashoffset={arc.offset}
                strokeLinecap="butt"
                style={{ transition: "stroke-dasharray 0.6s ease" }}
              />
            ) : null
          )
        )}
        <text x={CX} y={CY - 6} textAnchor="middle" className="donut-pct-num">{pct}</text>
        <text x={CX} y={CY + 10} textAnchor="middle" className="donut-pct-label">% gelernt</text>
      </svg>
    </div>
  );
}

// ── Activity Calendar (last 5 weeks) ──────────────────────────────────────
function ActivityCalendar({ learnDays }: { learnDays: string[] }) {
  const daySet = new Set(learnDays);
  const today = new Date();
  const days: { date: string; active: boolean; isToday: boolean }[] = [];

  for (let i = 34; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    const iso = d.toISOString().slice(0, 10);
    days.push({ date: iso, active: daySet.has(iso), isToday: i === 0 });
  }

  const weekDays = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];
  const streak = calcStreak(learnDays);

  return (
    <div className="activity-section">
      <div className="activity-header">
        <span className="activity-title">Aktivität (letzte 5 Wochen)</span>
        <span className="streak-badge">
          🔥 {streak} Tag{streak !== 1 ? "e" : ""} Serie
        </span>
      </div>
      <div className="cal-grid">
        {weekDays.map((d) => (
          <span key={d} className="cal-weekday">{d}</span>
        ))}
        {days.map((d) => (
          <div
            key={d.date}
            className={`cal-day${d.active ? " cal-active" : ""}${d.isToday ? " cal-today" : ""}`}
            title={d.date}
          />
        ))}
      </div>
      <div className="cal-legend">
        <span className="cal-leg-empty" /> Kein Lernen
        <span className="cal-leg-active" /> Gelernt
      </div>
    </div>
  );
}

function calcStreak(learnDays: string[]): number {
  if (learnDays.length === 0) return 0;
  const daySet = new Set(learnDays);
  const today = new Date();
  let streak = 0;
  for (let i = 0; i <= 365; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    const iso = d.toISOString().slice(0, 10);
    if (daySet.has(iso)) streak++;
    else if (i > 0) break;
  }
  return streak;
}

// ── Block Progress Bars ────────────────────────────────────────────────────
function BlockProgress({
  name,
  total,
  learned,
  weak,
  learning,
}: {
  name: string;
  total: number;
  learned: number;
  weak: number;
  learning: number;
}) {
  const pct = total > 0 ? Math.round((learned / total) * 100) : 0;
  const weakPct = total > 0 ? (weak / total) * 100 : 0;
  const learningPct = total > 0 ? (learning / total) * 100 : 0;
  const learnedPct = total > 0 ? (learned / total) * 100 : 0;

  return (
    <div className="block-prog-row">
      <div className="block-prog-header">
        <span className="block-prog-name">{name}</span>
        <span className="block-prog-pct">{pct}%</span>
      </div>
      <div className="block-prog-bar">
        <div className="bpb-learned" style={{ width: `${learnedPct}%` }} />
        <div className="bpb-learning" style={{ width: `${learningPct}%` }} />
        <div className="bpb-weak" style={{ width: `${weakPct}%` }} />
      </div>
      <div className="block-prog-counts">
        <span className="bpc-learned">✓ {learned}</span>
        <span className="bpc-learning">● {learning}</span>
        <span className="bpc-weak">⚠ {weak}</span>
        <span className="bpc-total">/ {total}</span>
      </div>
    </div>
  );
}

// ── Main Stats View ────────────────────────────────────────────────────────
export default function StatsView({
  appState,
  allQs,
}: {
  appState: AppState;
  allQs: Question[];
}) {

  const [, setRefresh] = useState(0);

  useEffect(() => {
    const refresh = () => {
      setRefresh((r) => r + 1);
    };

    window.addEventListener("statsUpdated", refresh);

    return () => {
      window.removeEventListener("statsUpdated", refresh);
    };
  }, []);

  const stats = useMemo(() => {
    const cards = Object.values(appState.cards);
    const seen = cards.filter((c) => c.seenCount > 0);
    const learned = cards.filter((c) => c.status === "learned").length;
    const weak = cards.filter((c) => c.status === "weak").length;
    const learning = cards.filter((c) => c.status === "learning").length;
    const unseen = allQs.length - seen.length;

    const totalAttempts = cards.reduce((s, c) => s + c.seenCount, 0);
    const totalWrong = cards.reduce((s, c) => s + c.wrongCount, 0);
    const accuracy = totalAttempts > 0
      ? Math.round(((totalAttempts - totalWrong) / totalAttempts) * 100)
      : null;

    // Per-block stats
    const blockMap: Record<string, { total: number; learned: number; weak: number; learning: number }> = {};
    allQs.forEach((q) => {
      if (!blockMap[q.block]) blockMap[q.block] = { total: 0, learned: 0, weak: 0, learning: 0 };
      blockMap[q.block].total++;
      const cs = appState.cards[q.id];
      if (cs) {
        if (cs.status === "learned") blockMap[q.block].learned++;
        else if (cs.status === "weak") blockMap[q.block].weak++;
        else if (cs.status === "learning") blockMap[q.block].learning++;
      }
    });
    const blockEntries = Object.entries(blockMap).sort((a, b) =>
      b[1].weak - a[1].weak || b[1].total - a[1].total
    );

    // Top 10 weakest questions
    const topWeak = cards
      .filter((c) => c.wrongCount > 0)
      .sort((a, b) => b.wrongCount - a.wrongCount)
      .slice(0, 10)
      .map((c) => ({
        cardState: c,
        question: allQs.find((q) => q.id === c.id),
      }))
      .filter((x) => x.question !== undefined);

    return { learned, weak, learning, unseen, accuracy, totalAttempts, blockEntries, topWeak };
  }, [appState, allQs]);

  const segments: Segment[] = [
    { label: "Gelernt", value: stats.learned, color: "var(--correct)" },
    { label: "Bearbeitung", value: stats.learning, color: "var(--primary)" },
    { label: "Schwach", value: stats.weak, color: "var(--wrong)" },
    { label: "Neu", value: stats.unseen, color: "var(--border)" },
  ];

  const learnDays = appState.learnDays ?? [];

  return (
    <div className="stats-view">
      {/* ── KPI Row ── */}
      <div className="stats-kpi-row">
        <div className="stats-kpi stats-kpi-learned">
          <span className="kpi-num">{stats.learned}</span>
          <span className="kpi-label">✓ Gelernt</span>
        </div>
        <div className="stats-kpi stats-kpi-learning">
          <span className="kpi-num">{stats.learning}</span>
          <span className="kpi-label">● In Bearbeitung</span>
        </div>
        <div className="stats-kpi stats-kpi-weak">
          <span className="kpi-num">{stats.weak}</span>
          <span className="kpi-label">⚠ Schwach</span>
        </div>
        <div className="stats-kpi stats-kpi-unseen">
          <span className="kpi-num">{stats.unseen}</span>
          <span className="kpi-label">● Noch nicht gesehen</span>
        </div>
        <div className="stats-kpi stats-kpi-accuracy">
          <span className="kpi-num">
            {stats.accuracy !== null ? `${stats.accuracy}%` : "\u2014"}
          </span>
          <span className="kpi-label">🎯 Trefferquote</span>
        </div>
        <div className="stats-kpi stats-kpi-attempts">
          <span className="kpi-num">{stats.totalAttempts}</span>
          <span className="kpi-label">📋 Antworten gesamt</span>
        </div>
      </div>

      {/* ── Chart + Block Bars ── */}
      <div className="stats-main-row">
        {/* Donut */}
        <div className="stats-card stats-donut-card">
          <h3 className="stats-card-title">Gesamtfortschritt</h3>
          <DonutChart segments={segments} total={allQs.length} />
          <div className="donut-legend">
            {segments.map((s) => (
              <div key={s.label} className="donut-leg-item">
                <span className="donut-leg-dot" style={{ background: s.color }} />
                <span className="donut-leg-label">{s.label}</span>
                <span className="donut-leg-val">{s.value}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Block Bars */}
        <div className="stats-card stats-blocks-card">
          <h3 className="stats-card-title">Fortschritt pro Thema</h3>
          <div className="block-prog-list">
            {stats.blockEntries.map(([name, b]) => (
              <BlockProgress
                key={name}
                name={name}
                total={b.total}
                learned={b.learned}
                weak={b.weak}
                learning={b.learning}
              />
            ))}
          </div>
        </div>
      </div>

      {/* ── Activity Calendar ── */}
      <div className="stats-card">
        <ActivityCalendar learnDays={learnDays} />
      </div>

      {/* ── Weak Questions ── */}
      {stats.topWeak.length > 0 && (
        <div className="stats-card">
          <h3 className="stats-card-title">
            Top {stats.topWeak.length} schwächste Fragen
            <span className="stats-card-sub">nach Anzahl falscher Antworten</span>
          </h3>
          <div className="weak-list">
            {stats.topWeak.map(({ cardState, question }, i) => (
              <div key={cardState.id} className="weak-item">
                <span className="weak-rank">#{i + 1}</span>
                <div className="weak-body">
                  <div className="weak-meta">
                    <span className="weak-block">{question!.block}</span>
                    <span className="weak-wrong-count">{cardState.wrongCount}× falsch</span>
                    <span className="weak-seen-count">{cardState.seenCount}× gesehen</span>
                  </div>
                  <p className="weak-question">{question!.question}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {stats.topWeak.length === 0 && stats.totalAttempts === 0 && (
        <div className="stats-empty">
          <div className="stats-empty-icon">📊</div>
          <p>Noch keine Lernstatistiken vorhanden.</p>
          <p className="stats-empty-sub">Starte eine Lernsession, um hier Fortschritte zu sehen.</p>
        </div>
      )}
    </div>
  );
}
