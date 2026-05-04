import { useState } from "react";
import { loadUsers, saveUsers } from "./userStorage";
import { syncUserLogin } from "./supabaseUserSync";
export { storageKeyForUser } from "./userStorage";

export default function LoginScreen({ onLogin }: { onLogin: (name: string) => void }) {
  const [name, setName] = useState("");
  const [error, setError] = useState("");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimName = name.trim();
    if (!trimName) {
      setError("Bitte deinen Namen eingeben.");
      return;
    }

    const db = loadUsers();
    if (db[trimName]) {
      db[trimName].uses += 1;
    } else {
      db[trimName] = { uses: 1 };
    }

    saveUsers(db);
    syncUserLogin(trimName).catch(() => {});
    onLogin(trimName);
  }

  return (
    <div className="login-screen">
      <div className="login-card">
        <div className="login-logo-wrap">
          <img src="/logo.png" alt="Logo" className="login-logo" />
        </div>
        <h1 className="login-title">Kältetechnik<br />Meister-Lernprogramm</h1>
        <p className="login-subtitle">Gib deinen Namen ein und starte</p>

        <form className="login-form" onSubmit={handleSubmit}>
          <div className="login-field">
            <label className="login-label">Name</label>
            <input
              className="login-input"
              type="text"
              placeholder="Dein Name"
              value={name}
              onChange={(e) => { setName(e.target.value); setError(""); }}
              autoFocus
            />
          </div>

          {error && <div className="login-error">{error}</div>}

          <button className="btn btn-primary login-btn" type="submit">
            Start →
          </button>
        </form>

        <p className="login-hint">
          Dein Lernfortschritt wird automatisch gespeichert.
        </p>
      </div>
    </div>
  );
}
