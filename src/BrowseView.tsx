import { useState, useMemo } from "react";
import type { Question } from "./questions";

export default function BrowseView({ onBack, allQs }: { onBack: () => void; allQs: Question[] }) {
  const [openBlocks, setOpenBlocks] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");

  const blocks = useMemo(() => {
    const map: Record<string, Question[]> = {};
    for (const q of allQs) {
      if (!map[q.block]) map[q.block] = [];
      map[q.block].push(q);
    }
    return map;
  }, [allQs]);

  const blockNames = useMemo(() => Object.keys(blocks).sort(), [blocks]);

  const searchResults = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return null;
    return allQs.filter(
      (q) =>
        q.question.toLowerCase().includes(term) ||
        q.answer.toLowerCase().includes(term) ||
        q.block.toLowerCase().includes(term)
    );
  }, [search, allQs]);

  function toggleBlock(b: string) {
    setOpenBlocks((prev) => {
      const next = new Set(prev);
      if (next.has(b)) next.delete(b);
      else next.add(b);
      return next;
    });
  }

  function expandAll() {
    setOpenBlocks(new Set(blockNames));
  }

  function collapseAll() {
    setOpenBlocks(new Set());
  }

  return (
    <div className="browse-view">
      <div className="browse-topbar">
        <button className="btn btn-secondary btn-sm" onClick={onBack}>
          ← Zurück
        </button>
        <div className="browse-topbar-center">
          <h2>Alle Fragen</h2>
          <span className="browse-total">{allQs.length} Fragen</span>
        </div>
        <div className="browse-topbar-actions">
          <button className="btn btn-ghost btn-sm" onClick={expandAll}>
            Alle öffnen
          </button>
          <button className="btn btn-ghost btn-sm" onClick={collapseAll}>
            Alle schließen
          </button>
        </div>
      </div>

      <div className="browse-search-wrap">
        <span className="browse-search-icon">🔍</span>
        <input
          className="browse-search"
          placeholder="Frage oder Antwort suchen..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        {search && (
          <button className="browse-search-clear" onClick={() => setSearch("")}>
            ✕
          </button>
        )}
      </div>

      {searchResults !== null ? (
        <div className="browse-results">
          <p className="browse-results-count">
            {searchResults.length} Treffer für &ldquo;{search}&rdquo;
          </p>
          {searchResults.length === 0 ? (
            <div className="browse-empty">Keine Fragen gefunden.</div>
          ) : (
            searchResults.map((q) => (
              <div key={q.id} className="browse-card">
                <div className="browse-card-meta">
                  <span className="browse-card-block">{q.block}</span>
                  <span className="browse-card-num">#{q.id}</span>
                </div>
                <p className="browse-question">{q.question}</p>
                <div className="browse-answer-wrap">
                  <span className="browse-answer-label">Antwort:</span>
                  <p className="browse-answer">{q.answer}</p>
                </div>
              </div>
            ))
          )}
        </div>
      ) : (
        <div className="browse-blocks">
          {blockNames.map((block) => {
            const qs = blocks[block];
            const isOpen = openBlocks.has(block);
            return (
              <div key={block} className="browse-block">
                <button
                  className={`browse-block-header${isOpen ? " browse-block-open" : ""}`}
                  onClick={() => toggleBlock(block)}
                >
                  <span className="browse-block-name">{block}</span>
                  <span className="browse-block-count">{qs.length} Fragen</span>
                  <span className="browse-block-chevron">{isOpen ? "▲" : "▼"}</span>
                </button>
                {isOpen && (
                  <div className="browse-block-content">
                    {qs.map((q, i) => (
                      <div key={q.id} className="browse-card">
                        <div className="browse-card-meta">
                          <span className="browse-card-num">Frage {i + 1} / #{q.id}</span>
                        </div>
                        <p className="browse-question">{q.question}</p>
                        <div className="browse-answer-wrap">
                          <span className="browse-answer-label">Antwort:</span>
                          <p className="browse-answer">{q.answer}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
