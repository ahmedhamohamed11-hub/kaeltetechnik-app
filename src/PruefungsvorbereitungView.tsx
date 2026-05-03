import { useState, useMemo } from "react";
import { examQuestions } from "./examQuestions";

export default function PruefungsvorbereitungView() {
  const [search, setSearch] = useState("");
  const [blockFilter, setBlockFilter] = useState("all");

  const blocks = useMemo(() => {
    const map: Record<string, number> = {};
    examQuestions.forEach((q) => { map[q.block] = (map[q.block] ?? 0) + 1; });
    return Object.entries(map);
  }, []);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return examQuestions.filter((q) => {
      if (blockFilter !== "all" && q.block !== blockFilter) return false;
      if (!term) return true;
      return (
        q.question.toLowerCase().includes(term) ||
        q.answer.toLowerCase().includes(term)
      );
    });
  }, [search, blockFilter]);

  return (
    <div className="katalog-view">
      <div className="pruef-header">
        <h2 className="pruef-title">Fragen – Prüfungsvorbereitung</h2>
        <p className="pruef-subtitle">
          {examQuestions.length} prüfungsrelevante Fragen · Nur lesen, kein Quiz
        </p>
      </div>

      <div className="katalog-toolbar">
        <div className="katalog-search-wrap">
          <span className="katalog-search-icon">🔍</span>
          <input
            className="katalog-search"
            placeholder="Frage oder Antwort suchen…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {search && (
            <button className="katalog-search-clear" onClick={() => setSearch("")}>✕</button>
          )}
        </div>
        <select
          className="katalog-block-select"
          value={blockFilter}
          onChange={(e) => setBlockFilter(e.target.value)}
        >
          <option value="all">Alle Themen ({examQuestions.length})</option>
          {blocks.map(([name, count]) => (
            <option key={name} value={name}>{name} ({count})</option>
          ))}
        </select>
      </div>

      <div className="katalog-count">
        {filtered.length} {filtered.length === 1 ? "Frage" : "Fragen"}
        {(search || blockFilter !== "all") && " gefunden"}
      </div>

      <div className="katalog-list">
        {filtered.length === 0 ? (
          <div className="katalog-empty">Keine Fragen gefunden.</div>
        ) : (
          filtered.map((q) => (
            <div key={q.id} className="katalog-item katalog-item--flat">
              <div className="katalog-flat-header">
                <span className="katalog-item-num">{q.id}</span>
                <span className="katalog-flat-block">{q.block}</span>
              </div>
              <p className="katalog-flat-question">{q.question}</p>
              <div className="katalog-flat-answer-wrap">
                <span className="katalog-flat-answer-label">Antwort</span>
                <p className="katalog-flat-answer">{q.answer}</p>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
