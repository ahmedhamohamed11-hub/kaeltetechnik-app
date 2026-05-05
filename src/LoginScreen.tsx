import React, { useState, useEffect } from 'react';
import { supabase } from './lib/supabaseClient';

interface User {
  id: string;
  name: string;
  firstLoginDate: string;
  lastLoginDate: string;
  totalLogins: number;
  totalQuestionsAnswered: number;
}

interface LoginScreenProps {
  onLogin: (name: string) => void;
}

export default function LoginScreen({ onLogin }: LoginScreenProps) {
  const [users, setUsers] = useState<User[]>([]);
  const [newUserName, setNewUserName] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const fetchUsers = async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from('users')
        .select('id, name, firstLoginDate, lastLoginDate, totalLogins, totalQuestionsAnswered')
        .order('name');
      if (error) {
        console.error(error);
        setError('Benutzer konnten nicht geladen werden');
      } else if (data) {
        setUsers(data);
      }
      setLoading(false);
    };
    fetchUsers();
  }, []);

  const addUser = async () => {
    const trimmed = newUserName.trim();
    if (!trimmed) return;
    if (users.some(u => u.name.toLowerCase() === trimmed.toLowerCase())) {
      setError('Benutzername existiert bereits');
      return;
    }
    const now = new Date().toISOString();
    const { error } = await supabase.from('users').insert({
      name: trimmed,
      firstLoginDate: now,
      lastLoginDate: now,
      lastActive: now,
      totalLogins: 1,
      totalQuestionsAnswered: 0,
      correctAnswers: 0,
      xp: 0,
      level: 0,
      accuracy: 0,
    });
    if (error) {
      console.error(error);
      setError('Fehler beim Anlegen des Benutzers');
      return;
    }
    // Refresh user list
    const { data } = await supabase
      .from('users')
      .select('id, name, firstLoginDate, lastLoginDate, totalLogins, totalQuestionsAnswered')
      .order('name');
    if (data) setUsers(data);
    setNewUserName('');
    onLogin(trimmed);
  };

  const selectUser = async (user: User) => {
    await supabase
      .from('users')
      .update({
        lastLoginDate: new Date().toISOString(),
        lastActive: new Date().toISOString(),
        totalLogins: user.totalLogins + 1,
      })
      .eq('id', user.id);
    onLogin(user.name);
  };

  return (
    <div className="login-screen">
      <div className="login-container">
        <img src="/logo.png" alt="KTM" className="login-logo" />
        <h1>Kältetechnik Meister</h1>
        <p className="login-subtitle">Lernplattform</p>

        {error && <div className="login-error">{error}</div>}

        {loading ? (
          <div className="login-loading">Lade Benutzer...</div>
        ) : (
          <>
            <div className="user-list">
              {users.map(user => (
                <button key={user.id} className="user-btn" onClick={() => selectUser(user)}>
                  {user.name}
                </button>
              ))}
            </div>
            <div className="new-user-form">
              <input
                type="text"
                placeholder="Neuer Benutzername"
                value={newUserName}
                onChange={e => setNewUserName(e.target.value)}
                onKeyPress={e => e.key === 'Enter' && addUser()}
              />
              <button onClick={addUser}>Neuen Benutzer anlegen</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
