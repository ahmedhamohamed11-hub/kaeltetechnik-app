interface UserRecord {
  uses: number;
}

export type UsersDB = Record<string, UserRecord>;

const USERS_KEY = "kaeltetechnik_users";

/* =========================
   BESTEHENDE FUNKTIONEN (UNVERÄNDERT)
========================= */

export function loadUsers(): UsersDB {
  try {
    const raw = localStorage.getItem(USERS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Record<string, { uses?: number; password?: string }>;
      const clean: UsersDB = {};
      for (const [name, rec] of Object.entries(parsed)) {
        clean[name] = { uses: rec.uses ?? 1 };
      }
      return clean;
    }
  } catch {}
  return {};
}

export function saveUsers(db: UsersDB) {
  localStorage.setItem(USERS_KEY, JSON.stringify(db));
}

export function storageKeyForUser(name: string) {
  return `kaeltetechnik_v1_${name.toLowerCase().replace(/\s+/g, "_")}`;
}

/* =========================
   NEU HINZUGEFÜGT (WICHTIG!)
========================= */

export function getUserId(): string {
  let userId = localStorage.getItem("ktm_user_id");

  if (!userId) {
    userId = crypto.randomUUID();
    localStorage.setItem("ktm_user_id", userId);
  }

  return userId;
}
