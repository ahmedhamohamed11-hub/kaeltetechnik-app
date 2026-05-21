import { useState, useMemo } from "react";
import { allQuestions } from "./questions";

export default function PruefungsvorbereitungView() {
  const [search, setSearch] = useState("");
  const [blockFilter, setBlockFilter] = useState("all");

  const blocks = useMemo(() => {
    const map: Record<string, number> = {};
    allQuestions.forEach((q) => { map[q.thema] = (map[q.thema] ?? 0) + 1; });
    return Object.entries(map);
  }, []);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return allQuestions.filter((q) => {
      if (blockFilter !== "all" && q.thema !== blockFilter) return false;
      if (!term) return true;
      return (
        q.frage.toLowerCase().includes(term) ||
        q.antwortKurz.toLowerCase().includes(term) ||
        q.erklaerung.toLowerCase().includes(term)
      );
    });
  }, [search, blockFilter]);

  return (
    <div className="katalog-view">
      <div className="pruef-header">
        <h2 className="pruef-title">Fragen – Prüfungsvorbereitung</h2>
        <p className="pruef-subtitle">
          {allQuestions.length} prüfungsrelevante Fragen · dieselbe Master-Datenquelle wie alle Lernmodi
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
          <option value="all">Alle Themen ({allQuestions.length})</option>
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
                <span className="katalog-flat-block">{q.thema}</span>
              </div>
              <p className="katalog-flat-question">{q.frage}</p>
              <div className="katalog-flat-answer-wrap">
                <span className="katalog-flat-answer-label">Kurzantwort</span>
                <p className="katalog-flat-answer">{q.antwortKurz}</p>
                <span className="katalog-flat-answer-label">Originalantwort</span>
                <p className="katalog-flat-answer">{q.erklaerung}</p>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
