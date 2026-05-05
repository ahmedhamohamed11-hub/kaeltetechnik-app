import { useEffect, useState } from "react";
import { supabase } from "./supabaseClient";
import { fetchAdminUsers, subscribeToAdminUsers, type AdminUser } from "./supabaseUsers";

export default function AdminUsersView() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!supabase) {
      setLoading(false);
      setError("Supabase ist nicht konfiguriert.");
      return;
    }

    let active = true;
    setLoading(true);

    fetchAdminUsers()
      .then((nextUsers) => {
        if (active) setUsers(nextUsers);
      })
      .catch(() => {
        if (active) setError("User konnten nicht geladen werden.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    const unsubscribe = subscribeToAdminUsers(
      (nextUsers) => {
        if (active) setUsers(nextUsers);
      },
      () => {
        if (active) setError("Realtime-Verbindung wurde unterbrochen.");
      }
    );

    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  if (loading) return <div>Lade User...</div>;
  if (error) return <div>{error}</div>;

  return (
    <div className="admin-users">
      <h2>Alle User (Live)</h2>

      {users.length === 0 && <p>Keine User vorhanden</p>}

      {users.map((user) => {
        const successRate =
          user.totalQuestionsAnswered > 0
            ? Math.round((user.correctAnswers / user.totalQuestionsAnswered) * 100)
            : 0;

        return (
          <div key={user.id} className="admin-user-card">
            <div className="admin-user-top">
              <strong>{user.name}</strong>
              <span className="admin-user-id">{user.id.slice(0, 6)}</span>
            </div>

            <div className="admin-user-stats">
              <span>Logins: {user.totalLogins}</span>
              <span>Antworten: {user.totalQuestionsAnswered}</span>
              <span>Richtig: {user.correctAnswers}</span>
              <span>Quote: {successRate}%</span>
            </div>

            <div className="admin-user-meta">
              <span>
                Aktiv: {user.lastActive ? new Date(user.lastActive).toLocaleString() : "-"}
              </span>
              <span>
                Erstlogin:{" "}
                {user.firstLoginDate
                  ? new Date(user.firstLoginDate).toLocaleDateString()
                  : "-"}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
