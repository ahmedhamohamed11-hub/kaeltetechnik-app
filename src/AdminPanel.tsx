import { useState, useEffect, useMemo, useRef, Fragment } from "react";
import { allQuestions } from "./questions";
import { loadAdminOverrides, saveAdminOverrides } from "./adminOverrides";
import type { AdminOverrides } from "./adminOverrides";
import type { Question } from "./questions";
import { loadUsers, saveUsers, storageKeyForUser } from "./userStorage";
import { supabase } from "./supabaseClient";
import { deleteAdminUser, fetchAdminUsers, subscribeToAdminUsers, type AdminUser } from "./supabaseUsers";

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return (
    d.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Europe/Berlin" }) +
    " " +
    d.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Berlin"  })
  );
}

function formatDateShort(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Europe/Berlin" });
}

function isOnline(lastActive: string | null): boolean {
  if (!lastActive) return false;
  return Date.now() - new Date(lastActive).getTime() < 5 * 60 * 1000;
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

function MiniCalendar({ learnDays }: { learnDays: string[] }) {
  const daySet = new Set(learnDays);
  const today = new Date();
  const days: { date: string; active: boolean; isToday: boolean }[] = [];
  for (let i = 34; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    const iso = d.toISOString().slice(0, 10);
    days.push({ date: iso, active: daySet.has(iso), isToday: i === 0 });
  }
  const weekLabels = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];
  const uniqueDays = new Set(learnDays).size;
  const streak = calcStreak(learnDays);

  return (
    <div style={{ padding: "12px 16px 14px", background: "var(--surface, #f8f9fa)", borderTop: "1px solid var(--border)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 10, flexWrap: "wrap" }}>
        <span style={{ fontSize: "0.75rem", fontWeight: 600, color: "var(--text-muted)" }}>
          📅 Lernaktivität (letzte 5 Wochen)
        </span>
        <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
          🔥 {streak} Tage{streak !== 1 ? "" : ""} Serie
        </span>
        <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
          📆 {uniqueDays} Lerntage gesamt
        </span>
      </div>

      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(7, 1fr)",
        gap: 3,
        maxWidth: 210,
      }}>
        {weekLabels.map((d) => (
          <span key={d} style={{ fontSize: "0.6rem", color: "var(--text-muted)", textAlign: "center" }}>{d}</span>
        ))}
        {days.map((d) => (
          <div
            key={d.date}
            title={d.date}
            style={{
              width: 22,
              height: 22,
              borderRadius: 4,
              background: d.active
                ? "var(--primary, #3b5bdb)"
                : d.isToday
                ? "var(--border)"
                : "var(--border, #e9ecef)",
              opacity: d.active ? 1 : 0.45,
              border: d.isToday ? "2px solid var(--primary, #3b5bdb)" : "none",
              boxSizing: "border-box",
            }}
          />
        ))}
      </div>

      <div style={{ display: "flex", gap: 12, marginTop: 8 }}>
        <span style={{ fontSize: "0.65rem", color: "var(--text-muted)", display: "flex", alignItems: "center", gap: 4 }}>
          <span style={{ display: "inline-block", width: 10, height: 10, borderRadius: 2, background: "var(--primary, #3b5bdb)" }} />
          Gelernt
        </span>
        <span style={{ fontSize: "0.65rem", color: "var(--text-muted)", display: "flex", alignItems: "center", gap: 4 }}>
          <span style={{ display: "inline-block", width: 10, height: 10, borderRadius: 2, background: "var(--border, #e9ecef)", opacity: 0.45 }} />
          Kein Lernen
        </span>
      </div>
    </div>
  );
}

const ADMIN_PASSWORD = "2501";

type Override = { question?: string; answer?: string; explanation?: string };
type Overrides = AdminOverrides;

interface AdminPanelProps {
  onClose: () => void;
  onChanged: () => void;
  onAddQuestions: (questions: Question[]) => void;
  customQuestions: Question[];
  onUpdateCustomQuestion: (q: Question) => void;
  onDeleteCustomQuestion: (id: number) => void;
}

export default function AdminPanel({ onClose, onChanged, onAddQuestions, customQuestions = [], onUpdateCustomQuestion, onDeleteCustomQuestion }: AdminPanelProps) {
  // ── Auth state ──────────────────────────────────────────────────────────────
  const [password, setPassword] = useState("");
  const [pwError, setPwError] = useState("");
  const [unlocked, setUnlocked] = useState(false);
  const [pinShake, setPinShake] = useState(false);

  // ── Edit state ──────────────────────────────────────────────────────────────
  const [search, setSearch] = useState("");
  const [blockFilter, setBlockFilter] = useState("all");
  const [editId, setEditId] = useState<number | null>(null);
  const [editIsCustom, setEditIsCustom] = useState(false);
  const [editQ, setEditQ] = useState("");
  const [editA, setEditA] = useState("");
  const [editE, setEditE] = useState("");
  const [overrides, setOverrides] = useState<Overrides>(loadAdminOverrides);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saved" | "reset">("idle");
  const [importStatus, setImportStatus] = useState<"idle" | "ok" | "err">("idle");
  const importRef = useRef<HTMLInputElement>(null);
  const addFileRef = useRef<HTMLInputElement>(null);

  // ── Tab state ───────────────────────────────────────────────────────────────
  const [adminTab, setAdminTab] = useState<"edit" | "add" | "users">("edit");

  // ── Add question form state ─────────────────────────────────────────────────
  const [newQ, setNewQ] = useState("");
  const [newA, setNewA] = useState("");
  const [newE, setNewE] = useState("");
  const [newBlock, setNewBlock] = useState("");
  const [newBlockCustom, setNewBlockCustom] = useState("");
  const [addStatus, setAddStatus] = useState<"idle" | "ok" | "err">("idle");
  const [addMsg, setAddMsg] = useState("");

  // ── Users state ──────────────────────────────────────────────────────────────
  const [usersDB, setUsersDB] = useState(loadUsers);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  // ── Supabase users state ──────────────────────────────────────────────────────
  const [sbUsers, setSbUsers] = useState<AdminUser[]>([]);
  const [sbLoading, setSbLoading] = useState(false);
  const [sbDeleteConfirm, setSbDeleteConfirm] = useState<string | null>(null);
  const [expandedUserId, setExpandedUserId] = useState<string | null>(null);
  const [sbError, setSbError] = useState("");

  // ── Supabase users: load + realtime ─────────────────────────────────────────
  useEffect(() => {
    if (!unlocked || adminTab !== "users" || !supabase) return;

    let active = true;
    setSbLoading(true);
    setSbError("");

    fetchAdminUsers()
      .then((users) => {
        if (active) setSbUsers(users);
      })
      .catch((err) => {
        console.warn("[Supabase Admin] users fetch:", err);
        if (active) setSbError("Nutzer konnten nicht geladen werden.");
      })
      .finally(() => {
        if (active) setSbLoading(false);
      });

    const unsubscribe = subscribeToAdminUsers(
      (users) => {
        if (active) setSbUsers(users);
      },
      () => {
        if (active) setSbError("Realtime-Verbindung wurde unterbrochen.");
      }
    );

    return () => {
      active = false;
      unsubscribe();
    };
  }, [unlocked, adminTab]);

  const blockNames = useMemo(() => {
    const s = new Set([...allQuestions, ...customQuestions].map((q) => q.block));
    return Array.from(s).sort();
  }, [customQuestions]);

  const blockOptions = useMemo(() => ["all", ...blockNames], [blockNames]);

  const filtered = useMemo(() => {
    return allQuestions.filter((q) => {
      if (blockFilter !== "all" && q.block !== blockFilter) return false;
      if (search) {
        const lower = search.toLowerCase();
        const ov = overrides[q.id];
        return (
          (ov?.question ?? q.question).toLowerCase().includes(lower) ||
          (ov?.answer ?? q.answer).toLowerCase().includes(lower) ||
          String(q.id).includes(lower)
        );
      }
      return true;
    });
  }, [search, blockFilter, overrides]);

  const filteredCustom = useMemo(() => {
    return customQuestions.filter((q) => {
      if (blockFilter !== "all" && q.block !== blockFilter) return false;
      if (search) {
        const lower = search.toLowerCase();
        return (
          q.question.toLowerCase().includes(lower) ||
          q.answer.toLowerCase().includes(lower) ||
          q.block.toLowerCase().includes(lower)
        );
      }
      return true;
    });
  }, [search, blockFilter, customQuestions]);

  // ── PIN login ──────────────────────────────────────────────────────────────
  function handleAdminPinDigit(d: string) {
    if (password.length >= 4) return;
    const next = password + d;
    setPassword(next);
    setPwError("");
    if (next.length === 4) {
      setTimeout(() => {
        if (next === ADMIN_PASSWORD) {
          setUnlocked(true);
          setPassword("");
        } else {
          setPinShake(true);
          setPwError("wrong");
          setTimeout(() => {
            setPassword("");
            setPinShake(false);
            setPwError("");
          }, 700);
        }
      }, 120);
    }
  }

  function handleAdminPinDelete() {
    setPassword((p) => p.slice(0, -1));
    setPwError("");
  }

  // ── Add single question ─────────────────────────────────────────────────────
  function handleAddSingle() {
    const q = newQ.trim();
    const a = newA.trim();
    const block = (newBlock === "__new__" ? newBlockCustom.trim() : newBlock) || "Importiert";

    if (!q || !a) {
      setAddStatus("err");
      setAddMsg("Frage und Antwort sind Pflichtfelder.");
      return;
    }
    if (newBlock === "__new__" && !newBlockCustom.trim()) {
      setAddStatus("err");
      setAddMsg("Bitte den neuen Block-Namen eingeben.");
      return;
    }

    const question: Question = {
      id: Date.now() + Math.random(),
      question: q,
      answer: a,
      block,
      explanation: newE.trim() || undefined,
    };

    onAddQuestions([question]);
    setNewQ("");
    setNewA("");
    setNewE("");
    setNewBlock("");
    setNewBlockCustom("");
    setAddStatus("ok");
    setAddMsg(`✓ Frage zu "${block}" hinzugefügt`);
    setTimeout(() => setAddStatus("idle"), 3000);
  }

  function handleAddFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const lines = (ev.target?.result as string)
        .split("\n").map((l) => l.trim()).filter((l) => l.length > 0);
      const qs: Question[] = [];
      for (const line of lines) {
        const parts = line.split("|").map((p) => p.trim());
        if (parts.length < 2) continue;
        qs.push({
          id: Date.now() + qs.length + Math.random(),
          question: parts[0],
          answer: parts[1],
          block: parts[2] ?? "Importiert",
          explanation: parts[3] || undefined,
        });
      }
      if (qs.length === 0) {
        setAddStatus("err");
        setAddMsg("Keine gültigen Zeilen gefunden (Format: Frage | Antwort | Thema)");
      } else {
        onAddQuestions(qs);
        setAddStatus("ok");
        setAddMsg(`✓ ${qs.length} Fragen aus Datei importiert`);
        setTimeout(() => setAddStatus("idle"), 4000);
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  }

  // ── Edit existing question ──────────────────────────────────────────────────
  function openEdit(id: number, isCustom: boolean) {
    const q = isCustom
      ? customQuestions.find((qx) => qx.id === id)!
      : allQuestions.find((qx) => qx.id === id)!;
    const ov = !isCustom ? (overrides[id] ?? {}) : {};
    setEditId(id);
    setEditIsCustom(isCustom);
    setEditQ(ov.question ?? q.question);
    setEditA(ov.answer ?? q.answer);
    setEditE(ov.explanation ?? q.explanation ?? "");
    setSaveStatus("idle");
  }

  function handleSave() {
    if (editId === null) return;
    if (editIsCustom) {
      const q = customQuestions.find((qx) => qx.id === editId)!;
      onUpdateCustomQuestion({
        ...q,
        question: editQ.trim(),
        answer: editA.trim(),
        explanation: editE.trim() || undefined,
      });
      setSaveStatus("saved");
    } else {
      const q = allQuestions.find((qx) => qx.id === editId)!;
      const newOv = { ...overrides };
      const entry: Override = {};
      if (editQ.trim() !== q.question) entry.question = editQ.trim();
      if (editA.trim() !== q.answer) entry.answer = editA.trim();
      const baseExp = q.explanation ?? "";
      if (editE.trim() !== baseExp) entry.explanation = editE.trim();
      if (Object.keys(entry).length > 0) {
        newOv[editId] = entry;
      } else {
        delete newOv[editId];
      }
      saveAdminOverrides(newOv);
      setOverrides(newOv);
      onChanged();
      setSaveStatus("saved");
    }
  }

  function handleReset() {
    if (editId === null || editIsCustom) return;
    const q = allQuestions.find((qx) => qx.id === editId)!;
    setEditQ(q.question);
    setEditA(q.answer);
    setEditE(q.explanation ?? "");
    const newOv = { ...overrides };
    delete newOv[editId];
    saveAdminOverrides(newOv);
    setOverrides(newOv);
    onChanged();
    setSaveStatus("reset");
  }

  function handleExport() {
    const blob = new Blob([JSON.stringify({ version: 1, exportedAt: new Date().toISOString(), overrides }, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `kaeltetechnik-admin-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function handleImportFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const parsed = JSON.parse(ev.target?.result as string);
        const incoming: Overrides = parsed.overrides ?? parsed;
        if (typeof incoming !== "object" || Array.isArray(incoming)) throw new Error();
        const merged = { ...overrides, ...incoming };
        saveAdminOverrides(merged);
        setOverrides(merged);
        onChanged();
        setImportStatus("ok");
        setTimeout(() => setImportStatus("idle"), 3000);
      } catch {
        setImportStatus("err");
        setTimeout(() => setImportStatus("idle"), 3000);
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  }

  // ── Users helpers ───────────────────────────────────────────────────────────
  function getUserStats(name: string) {
    try {
      const raw = localStorage.getItem(storageKeyForUser(name));
      if (!raw) return { learned: 0, weak: 0, seen: 0, total: allQuestions.length };
      const state = JSON.parse(raw);
      const cards: Record<string, { status: string; seenCount: number }> = state.cards ?? {};
      let learned = 0, weak = 0, seen = 0;
      for (const c of Object.values(cards)) {
        if (c.status === "learned") learned++;
        if (c.status === "weak") weak++;
        if (c.seenCount > 0) seen++;
      }
      return { learned, weak, seen, total: allQuestions.length };
    } catch {
      return { learned: 0, weak: 0, seen: 0, total: allQuestions.length };
    }
  }

  function deleteUser(name: string) {
    const db = { ...usersDB };
    delete db[name];
    saveUsers(db);
    localStorage.removeItem(storageKeyForUser(name));
    setUsersDB(db);
    setDeleteConfirm(null);
  }

  async function deleteSbUser(id: string) {
    const deleted = await deleteAdminUser(id);
    if (deleted) setSbUsers((prev) => prev.filter((u) => u.id !== id));
    setSbDeleteConfirm(null);
  }

  const modifiedCount = Object.keys(overrides).length;
  const userNames = Object.keys(usersDB).sort();

  // ── PIN login screen ─────────────────────────────────────────────────────────
  if (!unlocked) {
    const pinDigits = ["1","2","3","4","5","6","7","8","9","","0","⌫"];
    return (
      <div className="admin-pin-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
        <div className="admin-pin-modal">
          <button className="admin-pin-close" onClick={onClose}>✕</button>
          <span className="admin-pin-gear">⚙️</span>
          <h2 className="admin-pin-title">Admin-Bereich</h2>
          <p className="admin-pin-subtitle">Fragen · Antworten · Erklärungen</p>

          <span className="admin-pin-label">ADMIN-PIN EINGEBEN</span>

          <div className={`admin-pin-dots${pinShake ? " pin-shake" : ""}`}>
            {[0,1,2,3].map((i) => (
              <span
                key={i}
                className={`admin-pin-dot${password.length > i ? " admin-pin-dot--filled" : ""}${pwError ? " admin-pin-dot--error" : ""}`}
              />
            ))}
          </div>

          <p className="admin-pin-error">{pwError ? "Falscher PIN — bitte erneut versuchen" : "\u00a0"}</p>

          <div className="admin-pin-grid">
            {pinDigits.map((d, i) => {
              if (d === "") return <span key={i} />;
              if (d === "⌫")
                return (
                  <button key={i} className="admin-pin-btn admin-pin-btn--del" onClick={handleAdminPinDelete} aria-label="Löschen">⌫</button>
                );
              return (
                <button key={i} className="admin-pin-btn" onClick={() => handleAdminPinDigit(d)}>{d}</button>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  // ── Main panel ──────────────────────────────────────────────────────────────
  return (
    <div className="admin-overlay">
      <div className="admin-panel">

        {/* Header */}
        <div className="admin-panel-header">
          <div className="admin-panel-title">
            <span>⚙️</span>
            <h2>Admin-Panel</h2>
            {modifiedCount > 0 && <span className="admin-mod-badge">{modifiedCount} geändert</span>}
          </div>
          <div className="admin-header-actions">
            {adminTab === "edit" && (
              <>
                <button className="admin-btn admin-btn--ghost admin-btn--sm" onClick={handleExport}>⬇ Export</button>
                <button className="admin-btn admin-btn--ghost admin-btn--sm" onClick={() => importRef.current?.click()}>⬆ Import</button>
                {importStatus === "ok" && <span className="admin-import-status admin-import-status--ok">✓ Importiert</span>}
                {importStatus === "err" && <span className="admin-import-status admin-import-status--err">✗ Fehler</span>}
                <input ref={importRef} type="file" accept=".json" style={{ display: "none" }} onChange={handleImportFile} />
              </>
            )}
          </div>
          <button className="admin-close-btn" onClick={onClose}>✕</button>
        </div>

        {/* Tab bar */}
        <div className="admin-tab-bar">
          <button className={`admin-tab-btn${adminTab === "add" ? " admin-tab-active" : ""}`} onClick={() => setAdminTab("add")}>
            ➕ Neue Frage
          </button>
          <button className={`admin-tab-btn${adminTab === "edit" ? " admin-tab-active" : ""}`} onClick={() => setAdminTab("edit")}>
            ✏️ Bearbeiten {modifiedCount > 0 && `(${modifiedCount})`}
          </button>
          <button className={`admin-tab-btn${adminTab === "users" ? " admin-tab-active" : ""}`} onClick={() => setAdminTab("users")}>
            👥 Nutzer {sbUsers.length > 0 ? `(${sbUsers.length})` : ""}
          </button>
        </div>

        {/* ── ADD TAB ── */}
        {adminTab === "add" && (
          <div className="admin-body">
            <div className="admin-add-form">
              <p className="admin-add-intro">
                Frage, Antwort und optional eine Erklärung eingeben — dann auf <strong>Speichern</strong> klicken.
              </p>

              <label className="admin-label">Themenblock <span className="admin-label-required">*</span></label>
              <div className="admin-block-row">
                <select
                  className="admin-block-select admin-block-select--full"
                  value={newBlock}
                  onChange={(e) => setNewBlock(e.target.value)}
                >
                  <option value="">— Block auswählen —</option>
                  {blockNames.map((b) => <option key={b} value={b}>{b}</option>)}
                  <option value="__new__">➕ Neuen Block erstellen …</option>
                </select>
                {newBlock === "__new__" && (
                  <input
                    className="admin-search"
                    type="text"
                    placeholder="Name des neuen Blocks"
                    value={newBlockCustom}
                    onChange={(e) => setNewBlockCustom(e.target.value)}
                    style={{ marginTop: 6 }}
                  />
                )}
              </div>

              <label className="admin-label" style={{ marginTop: 14 }}>
                Frage <span className="admin-label-required">*</span>
              </label>
              <textarea
                className="admin-textarea"
                rows={3}
                placeholder="z. B. Was ist die Siedetemperatur von R-410A bei 10 bar?"
                value={newQ}
                onChange={(e) => { setNewQ(e.target.value); setAddStatus("idle"); }}
              />

              <label className="admin-label" style={{ marginTop: 12 }}>
                Antwort <span className="admin-label-required">*</span>
              </label>
              <textarea
                className="admin-textarea"
                rows={3}
                placeholder="z. B. ca. +8 °C"
                value={newA}
                onChange={(e) => { setNewA(e.target.value); setAddStatus("idle"); }}
              />

              <label className="admin-label" style={{ marginTop: 12 }}>
                Erklärung <span className="admin-label-hint">(optional – erscheint als 💡 Tipp)</span>
              </label>
              <textarea
                className="admin-textarea"
                rows={3}
                placeholder="z. B. Aus der Dampfdrucktabelle R-410A: bei 10 bar abs liegt t₀ ≈ +8 °C …"
                value={newE}
                onChange={(e) => setNewE(e.target.value)}
              />

              {addStatus === "err" && <div className="admin-import-status admin-import-status--err" style={{ marginTop: 10 }}>{addMsg}</div>}
              {addStatus === "ok"  && <div className="admin-import-status admin-import-status--ok"  style={{ marginTop: 10 }}>{addMsg}</div>}

              <div className="admin-add-actions">
                <button
                  className="admin-btn admin-btn--primary admin-add-save-btn"
                  onClick={handleAddSingle}
                >
                  💾 Frage speichern
                </button>
                <span className="admin-add-or">oder</span>
                <button className="admin-btn admin-btn--ghost" onClick={() => addFileRef.current?.click()}>
                  📂 Aus .txt Datei importieren
                </button>
                <input ref={addFileRef} type="file" accept=".txt,.csv" style={{ display: "none" }} onChange={handleAddFile} />
              </div>
              <p className="admin-add-file-hint">
                Dateiformat pro Zeile: <code>Frage | Antwort | Thema | Erklärung(optional)</code>
              </p>
            </div>
          </div>
        )}

        {/* ── EDIT TAB ── */}
        {adminTab === "edit" && (
          <>
            <div className="admin-toolbar">
              <input
                className="admin-search"
                type="text"
                placeholder="🔍  ID, Frage oder Antwort suchen …"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              <select
                className="admin-block-select"
                value={blockFilter}
                onChange={(e) => { setBlockFilter(e.target.value); setEditId(null); }}
              >
                {blockOptions.map((b) => (
                  <option key={b} value={b}>{b === "all" ? "Alle Themen" : b}</option>
                ))}
              </select>
            </div>

            <div className="admin-body">
              <div className="admin-list">
                <div className="admin-list-count">
                  {filtered.length + filteredCustom.length} von {allQuestions.length + customQuestions.length} Fragen
                  {customQuestions.length > 0 && <span style={{ color: "var(--primary)", marginLeft: 6 }}>({customQuestions.length} eigene)</span>}
                </div>
                {filtered.map((q, idx) => {
                  const hasOv = !!overrides[q.id];
                  const displayQ = overrides[q.id]?.question ?? q.question;
                  const isSelected = editId === q.id;
                  return (
                    <Fragment key={q.id}>
                      <div
                        className={`admin-row${isSelected ? " admin-row--active" : ""}${hasOv ? " admin-row--modified" : ""}`}
                        onClick={() => (isSelected ? setEditId(null) : openEdit(q.id, false))}
                      >
                        <span className="admin-row-id">#{idx + 1}</span>
                        <span className="admin-row-text">{displayQ.length > 90 ? displayQ.slice(0, 90) + "…" : displayQ}</span>
                        {hasOv && <span className="admin-row-badge">✏️</span>}
                        <span className="admin-row-edit-hint">{isSelected ? "▲" : "✏️"}</span>
                      </div>
                      {isSelected && (
                        <div className="admin-inline-edit">
                          <div className="admin-edit-header">
                            <h3>Frage #{idx + 1}</h3>
                            <span className="admin-edit-block">{q.block}</span>
                            {saveStatus === "saved" && <span className="admin-status admin-status--saved">✓ Gespeichert</span>}
                            {saveStatus === "reset" && <span className="admin-status admin-status--reset">↩ Zurückgesetzt</span>}
                          </div>
                          <label className="admin-label">Frage</label>
                          <textarea className="admin-textarea" value={editQ} onChange={(e) => { setEditQ(e.target.value); setSaveStatus("idle"); }} rows={3} />
                          <label className="admin-label">Antwort</label>
                          <textarea className="admin-textarea" value={editA} onChange={(e) => { setEditA(e.target.value); setSaveStatus("idle"); }} rows={3} />
                          <label className="admin-label">Erklärung <span className="admin-label-hint">(optional)</span></label>
                          <textarea className="admin-textarea" value={editE} onChange={(e) => { setEditE(e.target.value); setSaveStatus("idle"); }} rows={4} placeholder="Noch keine Erklärung …" />
                          <div className="admin-edit-actions">
                            <button className="admin-btn admin-btn--primary" onClick={handleSave}>💾 Speichern</button>
                            <button className="admin-btn admin-btn--ghost" onClick={handleReset}>↩ Original</button>
                            <button className="admin-btn admin-btn--close" onClick={() => setEditId(null)}>Abbrechen</button>
                          </div>
                        </div>
                      )}
                    </Fragment>
                  );
                })}
                {filteredCustom.length > 0 && (
                  <div className="admin-list-section-label">— Eigene Fragen ({filteredCustom.length}) —</div>
                )}
                {filteredCustom.map((q) => {
                  const displayQ = q.question;
                  const isSelected = editId === q.id;
                  return (
                    <Fragment key={q.id}>
                      <div
                        className={`admin-row admin-row--custom${isSelected ? " admin-row--active" : ""}`}
                        onClick={() => (isSelected ? setEditId(null) : openEdit(q.id, true))}
                      >
                        <span className="admin-row-id" style={{ fontSize: "0.7rem" }}>✦</span>
                        <span className="admin-row-text">{displayQ.length > 90 ? displayQ.slice(0, 90) + "…" : displayQ}</span>
                        <span className="admin-row-badge" style={{ background: "var(--primary)", color: "#fff", opacity: 0.85 }}>Eigene</span>
                        <span className="admin-row-edit-hint">{isSelected ? "▲" : "✏️"}</span>
                      </div>
                      {isSelected && (
                        <div className="admin-inline-edit">
                          <div className="admin-edit-header">
                            <h3>Eigene Frage</h3>
                            <span className="admin-edit-block">{q.block}</span>
                            <span className="admin-row-badge" style={{ background: "var(--primary)", color: "#fff", opacity: 0.85, fontSize: "0.7rem", padding: "2px 6px" }}>Eigene</span>
                            {saveStatus === "saved" && <span className="admin-status admin-status--saved">✓ Gespeichert</span>}
                          </div>
                          <label className="admin-label">Frage</label>
                          <textarea className="admin-textarea" value={editQ} onChange={(e) => { setEditQ(e.target.value); setSaveStatus("idle"); }} rows={3} />
                          <label className="admin-label">Antwort</label>
                          <textarea className="admin-textarea" value={editA} onChange={(e) => { setEditA(e.target.value); setSaveStatus("idle"); }} rows={3} />
                          <label className="admin-label">Erklärung <span className="admin-label-hint">(optional)</span></label>
                          <textarea className="admin-textarea" value={editE} onChange={(e) => { setEditE(e.target.value); setSaveStatus("idle"); }} rows={4} placeholder="Noch keine Erklärung …" />
                          <div className="admin-edit-actions">
                            <button className="admin-btn admin-btn--primary" onClick={handleSave}>💾 Speichern</button>
                            <button
                              className="admin-btn admin-btn--danger"
                              onClick={() => { if (window.confirm("Diese eigene Frage wirklich löschen?")) { onDeleteCustomQuestion(editId!); setEditId(null); } }}
                            >🗑 Löschen</button>
                            <button className="admin-btn admin-btn--close" onClick={() => setEditId(null)}>Abbrechen</button>
                          </div>
                        </div>
                      )}
                    </Fragment>
                  );
                })}
                {filtered.length === 0 && filteredCustom.length === 0 && <p className="admin-empty">Keine Fragen gefunden</p>}
                {editId === null && (
                  <div className="admin-edit-placeholder">
                    <span>👈</span>
                    <p>Frage antippen, um sie direkt zu bearbeiten</p>
                  </div>
                )}
              </div>
            </div>
          </>
        )}

        {/* ── USERS TAB ── */}
        {adminTab === "users" && (
          <div className="admin-body">
            {!supabase ? (
              <div className="admin-empty" style={{ textAlign: "center", padding: "48px 20px" }}>
                <div style={{ fontSize: "2.5rem", marginBottom: 12 }}>⚠️</div>
                <p style={{ color: "var(--text-muted)" }}>Supabase nicht verbunden. Bitte Umgebungsvariablen prüfen.</p>
              </div>
            ) : sbLoading ? (
              <div className="admin-empty" style={{ textAlign: "center", padding: "48px 20px" }}>
                <div style={{ fontSize: "2rem", marginBottom: 12 }}>⏳</div>
                <p style={{ color: "var(--text-muted)" }}>Nutzer werden geladen…</p>
              </div>
            ) : sbError ? (
              <div className="admin-empty" style={{ textAlign: "center", padding: "48px 20px" }}>
                <div style={{ fontSize: "2.5rem", marginBottom: 12 }}>!</div>
                <p style={{ color: "var(--text-muted)" }}>{sbError}</p>
              </div>
            ) : sbUsers.length === 0 ? (
              <div className="admin-empty" style={{ textAlign: "center", padding: "48px 20px" }}>
                <div style={{ fontSize: "2.5rem", marginBottom: 12 }}>👥</div>
                <p style={{ color: "var(--text-muted)" }}>Noch keine Nutzer registriert.</p>
              </div>
            ) : (
              <div className="admin-users-list">
                <div className="admin-users-header" style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span>{sbUsers.length} registrierte Nutzer</span>
                  <span style={{ fontSize: "0.7rem", color: "var(--text-muted)", marginLeft: "auto" }}>
                    🟢 = aktiv in letzten 5 Min · Echtzeit-Updates aktiv
                  </span>
                </div>
                {sbUsers.map((user) => {
                  const displayName = user.name
                    ? user.name.charAt(0).toUpperCase() + user.name.slice(1)
                    : "?";
                  const total = user.totalQuestionsAnswered;
                  const correct = user.correctAnswers;
                  const pct = total > 0 ? Math.round((correct / total) * 100) : 0;
                  const wrong = total - correct;
                  const online = isOnline(user.lastActive);
                  const expanded = expandedUserId === user.id;
                  const days = user.learnDays;

                  return (
                    <div key={user.id} style={{ borderBottom: "1px solid var(--border)" }}>
                      {/* ── Row ── */}
                      <div
                        className="admin-user-row"
                        style={{ cursor: "pointer", borderBottom: "none" }}
                        onClick={() => setExpandedUserId(expanded ? null : user.id)}
                      >
                        <div className="admin-user-avatar" style={{ position: "relative" }}>
                          {displayName.charAt(0)}
                          {online && (
                            <span style={{
                              position: "absolute", bottom: 0, right: 0,
                              width: 10, height: 10, background: "#22c55e",
                              borderRadius: "50%", border: "2px solid var(--card-bg, #fff)",
                            }} />
                          )}
                        </div>

                        <div className="admin-user-info">
                          <div className="admin-user-name" style={{ display: "flex", alignItems: "center", gap: 6 }}>
                            {displayName}
                            {online && (
                              <span style={{ fontSize: "0.65rem", background: "#22c55e", color: "#fff", borderRadius: 4, padding: "1px 5px" }}>
                                Online
                              </span>
                            )}
                            <span style={{ fontSize: "0.65rem", color: "var(--text-muted)", marginLeft: "auto" }}>
                              {expanded ? "▲" : "▼"}
                            </span>
                          </div>
                          <div className="admin-user-meta">
                            {user.totalLogins ?? 0} Anmeldung{(user.totalLogins ?? 0) !== 1 ? "en" : ""}
                            &nbsp;·&nbsp;
                            Zuletzt: {formatDate(user.lastLoginDate)}
                          </div>
                          <div className="admin-user-prog-wrap">
                            <div className="admin-user-prog-bar">
                              <div className="admin-user-prog-fill" style={{ width: `${pct}%` }} />
                            </div>
                            <span className="admin-user-prog-label">{pct}%</span>
                          </div>
                          <div className="admin-user-stats">
                            <span className="aus-learned">✓ {correct} richtig</span>
                            <span className="aus-weak">✗ {wrong} falsch</span>
                            <span style={{ fontSize: "0.7rem", color: "var(--text-muted)" }}>/ {total} gesamt</span>
                          </div>
                        </div>

                        <div className="admin-user-actions" onClick={(e) => e.stopPropagation()}>
                          {sbDeleteConfirm === user.id ? (
                            <>
                              <button className="admin-btn admin-btn--danger admin-btn--sm" onClick={() => deleteSbUser(user.id)}>Löschen</button>
                              <button className="admin-btn admin-btn--ghost admin-btn--sm" onClick={() => setSbDeleteConfirm(null)}>Abbrechen</button>
                            </>
                          ) : (
                            <button className="admin-btn admin-btn--ghost admin-btn--sm" onClick={() => setSbDeleteConfirm(user.id)}>🗑</button>
                          )}
                        </div>
                      </div>

                      {/* ── Expanded detail ── */}
                      {expanded && (
                        <div>
                          {/* Summary strip */}
                          <div style={{
                            display: "flex", gap: 0, flexWrap: "wrap",
                            background: "var(--surface, #f8f9fa)",
                            borderTop: "1px solid var(--border)",
                          }}>
                            {[
                              { icon: "📅", label: "Erste Anmeldung", value: formatDateShort(user.firstLoginDate) },
                              { icon: "🔑", label: "Letzte Anmeldung", value: formatDateShort(user.lastLoginDate) },
                              { icon: "📊", label: "Genauigkeit", value: `${pct}%` },
                              { icon: "✓", label: "Richtig", value: String(correct) },
                              { icon: "✗", label: "Falsch", value: String(wrong) },
                              { icon: "🔢", label: "Fragen gesamt", value: String(total) },
                              { icon: "🔑", label: "Anmeldungen", value: String(user.totalLogins ?? 0) },
                            ].map(({ icon, label, value }) => (
                              <div key={label} style={{
                                flex: "1 1 90px", padding: "10px 14px",
                                borderRight: "1px solid var(--border)",
                                borderBottom: "1px solid var(--border)",
                                minWidth: 90,
                              }}>
                                <div style={{ fontSize: "0.6rem", color: "var(--text-muted)", marginBottom: 2 }}>
                                  {icon} {label}
                                </div>
                                <div style={{ fontSize: "0.85rem", fontWeight: 700, color: "var(--text)" }}>
                                  {value}
                                </div>
                              </div>
                            ))}
                          </div>

                          {/* Activity calendar */}
                          {days.length > 0 ? (
                            <MiniCalendar learnDays={days} />
                          ) : (
                            <div style={{ padding: "12px 16px", background: "var(--surface, #f8f9fa)", borderTop: "1px solid var(--border)", fontSize: "0.75rem", color: "var(--text-muted)" }}>
                              📅 Noch keine Lernaktivität aufgezeichnet.
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
