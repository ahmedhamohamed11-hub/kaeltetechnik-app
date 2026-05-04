import { useEffect, useState } from "react";
import { supabase } from "./supabaseClient";

interface User {
  id: string;
  name: string;
  totalLogins: number;
  correctAnswers: number;
  totalQuestionsAnswered: number;
  lastActive: string;
  firstLoginDate: string;
}

export default function AdminUsersView() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);

  async function loadUsers() {
    setLoading(true);

    const { data, error } = await supabase
      .from("users")
      .select("*")
      .order("lastActive", { ascending: false });

    if (error) {
      console.error("❌ Fehler beim Laden:", error.message);
    } else {
      setUsers(data || []);
    }

    setLoading(false);
  }

  useEffect(() => {
    loadUsers();

    // 🔥 LIVE UPDATES (sehr wichtig)
    const channel = supabase
      .channel("users-live")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "users" },
        () => {
          loadUsers();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  if (loading) return <div>⏳ Lade User...</div>;

  return (
    <div className="admin-users">
      <h2>👤 Alle User (Live)</h2>

      {users.length === 0 && <p>Keine User vorhanden</p>}

      {users.map((u) => {
        const successRate =
          u.totalQuestionsAnswered > 0
            ? Math.round((u.correctAnswers / u.totalQuestionsAnswered) * 100)
            : 0;

        return (
          <div key={u.id} className="admin-user-card">
            <div className="admin-user-top">
              <strong>{u.name}</strong>
              <span className="admin-user-id">{u.id.slice(0, 6)}</span>
            </div>

            <div className="admin-user-stats">
              <span>🔐 Logins: {u.totalLogins}</span>
              <span>📊 Antworten: {u.totalQuestionsAnswered}</span>
              <span>✅ Richtig: {u.correctAnswers}</span>
              <span>🎯 Quote: {successRate}%</span>
            </div>

            <div className="admin-user-meta">
              <span>🟢 Aktiv: {new Date(u.lastActive).toLocaleString()}</span>
              <span>📅 Erstlogin: {new Date(u.firstLoginDate).toLocaleDateString()}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
