import { supabase } from "./supabaseClient";

export interface SupabaseUserRow {
  id: string;
  name: string | null;
  firstLoginDate: string | null;
  lastLoginDate: string | null;
  lastActive: string | null;
  totalLogins: number | null;
  totalQuestionsAnswered?: number | null;
  correctAnswers: number | null;
  learnDays: string[] | null;
}

export interface AdminUser {
  id: string;
  name: string;
  firstLoginDate: string | null;
  lastLoginDate: string | null;
  lastActive: string | null;
  totalLogins: number;
  totalQuestionsAnswered: number;
  correctAnswers: number;
  learnDays: string[];
}

export function normalizeUser(row: SupabaseUserRow): AdminUser {
  return {
    id: row.id,
    name: row.name?.trim() || "Unbekannt",
    firstLoginDate: row.firstLoginDate ?? null,
    lastLoginDate: row.lastLoginDate ?? null,
    lastActive: row.lastActive ?? null,
    totalLogins: row.totalLogins ?? 0,
    totalQuestionsAnswered: row.totalQuestionsAnswered ?? 0,
    correctAnswers: row.correctAnswers ?? 0,
    learnDays: Array.isArray(row.learnDays) ? row.learnDays : [],
  };
}

function sortUsers(users: AdminUser[]): AdminUser[] {
  return [...users].sort((a, b) => {
    const aTime = new Date(a.lastActive ?? a.lastLoginDate ?? 0).getTime();
    const bTime = new Date(b.lastActive ?? b.lastLoginDate ?? 0).getTime();
    return bTime - aTime;
  });
}

export async function fetchAdminUsers(): Promise<AdminUser[]> {
  if (!supabase) return [];

  const { data, error } = await supabase
    .from("users")
    .select("*")
    .order("lastActive", { ascending: false });

  if (error) {
    console.warn("[Supabase Admin] users fetch:", error.message);
    return [];
  }

  return sortUsers(((data ?? []) as SupabaseUserRow[]).map(normalizeUser));
}

export function subscribeToAdminUsers(
  onChange: (users: AdminUser[]) => void,
  onError?: (message: string) => void
): () => void {
  if (!supabase) return () => {};

  const channel = supabase
    .channel(`admin-users-${Date.now()}`)
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "users" },
      async () => {
        onChange(await fetchAdminUsers());
      }
    )
    .subscribe((status, err) => {
      if (status === "CHANNEL_ERROR") {
        onError?.(err?.message ?? "Realtime subscription failed");
      }
    });

  return () => {
    supabase.removeChannel(channel);
  };
}

export async function deleteAdminUser(id: string): Promise<boolean> {
  if (!supabase) return false;

  const { error } = await supabase.from("users").delete().eq("id", id);
  if (error) {
    console.warn("[Supabase Admin] user delete:", error.message);
    return false;
  }

  return true;
}
