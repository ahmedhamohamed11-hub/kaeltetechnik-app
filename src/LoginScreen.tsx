import { useState } from "react";
import { supabase } from "./supabaseClient";

export default function LoginScreen({ onLogin }: { onLogin: (name: string) => void }) {
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimName = name.trim();
    if (!trimName) {
      setError("Bitte deinen Namen eingeben.");
      return;
    }

    setLoading(true);
    setError("");

    try {
      // 1. Existiert der Benutzer bereits?
      const { data: existing, error: fetchError } = await supabase
        .from("users")
        .select("id, totalLogins")
        .eq("name", trimName)
        .maybeSingle();

      if (fetchError) throw fetchError;

      const now = new Date().toISOString();

      if (existing) {
        // Bestehenden Benutzer aktualisieren
        const { error: updateError } = await supabase
          .from("users")
          .update({
            lastLoginDate: now,
            totalLogins: existing.totalLogins + 1,
          })
          .eq("id", existing.id);
        if (updateError) throw updateError;
      } else {
        // Neuen Benutzer anlegen
        const { error: insertError } = await supabase.from("users").insert({
          name: trimName,
          firstLoginDate: now,
          lastLoginDate: now,
          totalLogins: 1,
          totalQuestionsAnswered: 0,
          correctAnswers: 0,
        });
        if (insertError) throw insertError;
      }

      onLogin(trimName);
    } catch (err) {
      console.error(err);
      setError("Fehler beim Anmelden. Bitte später erneut versuchen.");
    } finally {
      setLoading(false);
    }
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
              disabled={loading}
            />
          </div>

          {error && <div className="login-error">{error}</div>}

          <button className="btn btn-primary login-btn" type="submit" disabled={loading}>
            {loading ? "Wird angemeldet…" : "Start →"}
          </button>
        </form>

        <p className="login-hint">
          Dein Lernfortschritt wird automatisch gespeichert.
        </p>
      </div>
    </div>
  );
}
