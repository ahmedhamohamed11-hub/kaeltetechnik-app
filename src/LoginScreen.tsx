import { useState } from "react";
import { syncUserLogin } from "./supabaseUserSync";
import { loadUsers, saveUsers } from "./userStorage";

export { storageKeyForUser } from "./userStorage";

export default function LoginScreen({ onLogin }: { onLogin: (name: string) => void }) {
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    const trimmedName = name.trim();
    if (!trimmedName) {
      setError("Bitte deinen Namen eingeben.");
      return;
    }

    setSubmitting(true);
    setError("");

    const db = loadUsers();
    db[trimmedName] = { uses: (db[trimmedName]?.uses ?? 0) + 1 };
    saveUsers(db);

    await syncUserLogin(trimmedName).catch(() => {});
    onLogin(trimmedName);
    setSubmitting(false);
  }

  return (
    <div className="login-screen">
      <div className="login-card">
        <div className="login-logo-wrap">
          <img src="/logo.png" alt="Logo" className="login-logo" />
        </div>
        <h1 className="login-title">Kaeltetechnik<br />Meister-Lernprogramm</h1>
        <p className="login-subtitle">Gib deinen Namen ein und starte</p>

        <form className="login-form" onSubmit={handleSubmit}>
          <div className="login-field">
            <label className="login-label">Name</label>
            <input
              className="login-input"
              type="text"
              placeholder="Dein Name"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setError("");
              }}
              disabled={submitting}
              autoFocus
            />
          </div>

          {error && <div className="login-error">{error}</div>}

          <button className="btn btn-primary login-btn" type="submit" disabled={submitting}>
            {submitting ? "Verbinde..." : "Start ->"}
          </button>
        </form>

        <p className="login-hint">
          Dein Lernfortschritt wird automatisch gespeichert.
        </p>
      </div>
    </div>
  );
}
