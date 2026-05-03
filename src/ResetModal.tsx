import { useState } from "react";

const RESET_PIN = "2501";

interface ResetModalProps {
  onConfirm: () => void;
  onCancel: () => void;
}

export default function ResetModal({ onConfirm, onCancel }: ResetModalProps) {
  const [pin, setPin] = useState("");
  const [error, setError] = useState(false);
  const [shake, setShake] = useState(false);
  const [step, setStep] = useState<"warn" | "pin">("warn");

  function handleDigit(d: string) {
    if (pin.length >= 4) return;
    const next = pin + d;
    setPin(next);
    setError(false);
    if (next.length === 4) {
      setTimeout(() => {
        if (next === RESET_PIN) {
          onConfirm();
        } else {
          setShake(true);
          setError(true);
          setTimeout(() => {
            setPin("");
            setShake(false);
          }, 700);
        }
      }, 120);
    }
  }

  function handleDelete() {
    setPin((p) => p.slice(0, -1));
    setError(false);
  }

  const digits = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "⌫"];

  return (
    <div className="reset-overlay" onClick={(e) => e.target === e.currentTarget && onCancel()}>
      <div className="reset-modal">
        <button className="admin-close-btn" onClick={onCancel} aria-label="Abbrechen">✕</button>

        {step === "warn" && (
          <>
            <div className="reset-icon">⚠️</div>
            <h2 className="reset-title">Fortschritt zurücksetzen?</h2>
            <p className="reset-desc">
              Alle Lernfortschritte, Streaks und Statistiken werden <strong>unwiderruflich gelöscht</strong>.
              Eigene Fragen bleiben erhalten.
            </p>
            <div className="reset-actions">
              <button className="admin-btn admin-btn--danger" onClick={() => setStep("pin")}>
                Ja, zurücksetzen
              </button>
              <button className="admin-btn admin-btn--ghost" onClick={onCancel}>
                Abbrechen
              </button>
            </div>
          </>
        )}

        {step === "pin" && (
          <>
            <div className="reset-icon">🔒</div>
            <h2 className="reset-title">PIN bestätigen</h2>
            <p className="reset-desc">Gib den Admin-PIN ein, um den Vorgang zu bestätigen.</p>

            <div className={`pin-dots${shake ? " pin-shake" : ""}`} style={{ marginTop: "8px" }}>
              {[0, 1, 2, 3].map((i) => (
                <span
                  key={i}
                  className={`pin-dot${pin.length > i ? " pin-dot--filled" : ""}${error ? " pin-dot--error" : ""}`}
                />
              ))}
            </div>
            {error
              ? <p className="pin-error">Falscher PIN – Zurücksetzen abgebrochen</p>
              : <p className="pin-error" style={{ visibility: "hidden" }}>–</p>
            }

            <div className="pin-grid" style={{ maxWidth: "240px", margin: "0 auto" }}>
              {digits.map((d, i) => {
                if (d === "") return <span key={i} />;
                if (d === "⌫")
                  return (
                    <button key={i} className="pin-btn pin-btn--del" onClick={handleDelete} aria-label="Löschen">⌫</button>
                  );
                return (
                  <button key={i} className="pin-btn" onClick={() => handleDigit(d)}>{d}</button>
                );
              })}
            </div>

            <button
              className="admin-btn admin-btn--ghost"
              style={{ marginTop: "12px", width: "100%" }}
              onClick={onCancel}
            >
              Abbrechen
            </button>
          </>
        )}
      </div>
    </div>
  );
}
