import { useState, useMemo, useEffect, useRef } from "react";
import type { Question } from "./questions";

interface Props {
  allQs: Question[];
  scrollToId?: number | null;
  bookmarkedIds?: Set<number>;
  onToggleBookmark?: (id: number) => void;
}

export default function KatalogView({ allQs, scrollToId, bookmarkedIds, onToggleBookmark }: Props) {
  const [search, setSearch] = useState("");
  const [blockFilter, setBlockFilter] = useState("all");
  const [onlyBookmarked, setOnlyBookmarked] = useState(false);
  const itemRefs = useRef<Record<number, HTMLDivElement | null>>({});

  const blocks = useMemo(() => {
    const map: Record<string, number> = {};
    allQs.forEach((q) => { map[q.block] = (map[q.block] ?? 0) + 1; });
    return Object.entries(map).sort((a, b) => a[0].localeCompare(b[0]));
  }, [allQs]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return allQs.filter((q) => {
      if (onlyBookmarked && !bookmarkedIds?.has(q.id)) return false;
      if (blockFilter !== "all" && q.block !== blockFilter) return false;
      if (!term) return true;
      return (
        q.frage.toLowerCase().includes(term) ||
        q.antwortKurz.toLowerCase().includes(term) ||
        q.erklaerung.toLowerCase().includes(term)
      );
    });
  }, [allQs, search, blockFilter, onlyBookmarked, bookmarkedIds]);

  useEffect(() => {
    if (!scrollToId) return;
    const t = setTimeout(() => {
      const el = itemRefs.current[scrollToId];
      el?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 120);
    return () => clearTimeout(t);
  }, [scrollToId]);

  const bookmarkCount = bookmarkedIds?.size ?? 0;

  return (
    <div className="katalog-view">
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
          <option value="all">Alle Themen ({allQs.length})</option>
          {blocks.map(([name, count]) => (
            <option key={name} value={name}>{name} ({count})</option>
          ))}
        </select>
      </div>

      {onToggleBookmark && (
        <button
          className={`katalog-bm-filter${onlyBookmarked ? " katalog-bm-filter--active" : ""}`}
          onClick={() => setOnlyBookmarked((v) => !v)}
        >
          🔖 Nur Gemerkte
          <span className="katalog-bm-filter-count">{bookmarkCount}</span>
        </button>
      )}

      <div className="katalog-count">
        {filtered.length} {filtered.length === 1 ? "Frage" : "Fragen"}
        {(search || blockFilter !== "all" || onlyBookmarked) && " gefunden"}
      </div>

      <div className="katalog-list">
        {filtered.length === 0 ? (
          <div className="katalog-empty">
            {onlyBookmarked && bookmarkCount === 0
              ? "Noch keine gemerkten Fragen. Merke Fragen während des Lernens mit 🔖."
              : "Keine Fragen gefunden."}
          </div>
        ) : (
          filtered.map((q) => {
            const isBookmarked = bookmarkedIds?.has(q.id) ?? false;
            const isHighlighted = scrollToId === q.id;
            return (
              <div
                key={q.id}
                ref={(el) => { itemRefs.current[q.id] = el; }}
                className={`katalog-item katalog-item--flat${isBookmarked ? " katalog-item--bookmarked" : ""}${isHighlighted ? " katalog-item--highlight" : ""}`}
              >
                <div className="katalog-flat-header">
                  <span className="katalog-item-num">{q.id}</span>
                  <span className="katalog-flat-block">{q.block}</span>
                  {onToggleBookmark && (
                    <button
                      className={`katalog-item-bm-btn${isBookmarked ? " katalog-item-bm-btn--active" : ""}`}
                      title={isBookmarked ? "Merker entfernen" : "Merken"}
                      onClick={() => onToggleBookmark(q.id)}
                    >
                      🔖
                    </button>
                  )}
                </div>
                <p className="katalog-flat-question">{q.frage}</p>
                <div className="katalog-flat-answer-wrap">
                  <span className="katalog-flat-answer-label">Kurzantwort</span>
                  <p className="katalog-flat-answer">{q.antwortKurz}</p>
                  <span className="katalog-flat-answer-label">Originalantwort</span>
                  <p className="katalog-flat-answer">{q.erklaerung}</p>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
