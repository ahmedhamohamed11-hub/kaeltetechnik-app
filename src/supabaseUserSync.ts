import { supabase } from "./supabaseClient";

const LOCAL_USER_ID_KEY = "supabase_user_id";
const LAST_SYNC_KEY = "ktm_last_sync";
const SYNC_QUEUE_KEY = "ktm_sync_queue";
const DAILY_ONLINE_KEY = "ktm_daily_online";

export interface SyncPayload {
  correctAnswers: number;
  totalQuestionsAnswered: number;
  learnDays: string[];
}

interface QueueEntry {
  payload: SyncPayload;
  timestamp: number;
}

export function getLocalUserId(): string | null {
  return localStorage.getItem(LOCAL_USER_ID_KEY);
}

function setLastSyncTime(): void {
  localStorage.setItem(LAST_SYNC_KEY, String(Date.now()));
}

function loadQueue(): QueueEntry[] {
  try {
    const raw = localStorage.getItem(SYNC_QUEUE_KEY);
    if (raw) return JSON.parse(raw) as QueueEntry[];
  } catch {}
  return [];
}

function saveQueue(queue: QueueEntry[]): void {
  localStorage.setItem(SYNC_QUEUE_KEY, JSON.stringify(queue));
}

function isOnline(): boolean {
  return typeof navigator !== "undefined" ? navigator.onLine : false;
}

async function pushToSupabase(payload: SyncPayload): Promise<boolean> {
  if (!supabase) return false;
  const userId = getLocalUserId();
  if (!userId) return false;

  try {
    const { error } = await supabase
      .from("users")
      .update({
        correctAnswers: payload.correctAnswers,
        totalQuestionsAnswered: payload.totalQuestionsAnswered,
        learnDays: payload.learnDays,
        lastActive: new Date().toISOString(),
      })
      .eq("id", userId);

    if (error) {
      console.error("[Sync] push error:", error.message);
      return false;
    }
    return true;
  } catch (err) {
    console.error("[Sync] unexpected error:", err);
    return false;
  }
}

async function flushQueue(): Promise<void> {
  const queue = loadQueue();
  if (queue.length === 0) return;

  const latest = queue[queue.length - 1];
  const ok = await pushToSupabase(latest.payload);

  if (ok) {
    saveQueue([]);
    setLastSyncTime();
  }
}

export function trackDailyOnline(): void {
  const today = new Date().toISOString().slice(0, 10);
  const last = localStorage.getItem(DAILY_ONLINE_KEY);
  if (last === today) return;
  localStorage.setItem(DAILY_ONLINE_KEY, today);
}

export function getTodayTracked(): boolean {
  const today = new Date().toISOString().slice(0, 10);
  return localStorage.getItem(DAILY_ONLINE_KEY) === today;
}

export function queueProgressSync(payload: SyncPayload): void {
  saveQueue([{ payload, timestamp: Date.now() }]);

  if (isOnline()) {
    flushQueue().catch(() => {});
  }
}

export async function syncOnStartup(payload: SyncPayload): Promise<void> {
  saveQueue([{ payload, timestamp: Date.now() }]);

  if (!isOnline()) return;

  await flushQueue().catch(() => {});
}

export async function syncUserLogin(name: string): Promise<void> {
  if (!supabase) {
    console.error("[Supabase] Client not initialized - check env vars.");
    return;
  }
  if (!isOnline()) return;

  const now = new Date().toISOString();
  const normalized = name.trim().toLowerCase();

  try {
    const { data: existing, error: fetchError } = await supabase
      .from("users")
      .select("id, totalLogins")
      .eq("name", normalized)
      .maybeSingle();

    if (fetchError) {
      console.error("[Supabase] fetch error:", fetchError.message);
      return;
    }

    if (existing) {
      localStorage.setItem(LOCAL_USER_ID_KEY, existing.id);
      const { error: updateError } = await supabase
        .from("users")
        .update({
          lastLoginDate: now,
          lastActive: now,
          totalLogins: (existing.totalLogins ?? 0) + 1,
        })
        .eq("id", existing.id);

      if (updateError) console.error("[Supabase] update error:", updateError.message);
    } else {
      const payload = {
        name: normalized,
        firstLoginDate: now,
        lastLoginDate: now,
        lastActive: now,
        totalLogins: 1,
        totalQuestionsAnswered: 0,
        correctAnswers: 0,
        learnDays: [],
        xp: 0,
      };
      const { data: inserted, error: insertError } = await supabase
        .from("users")
        .insert(payload)
        .select("id")
        .single();

      if (insertError) {
        console.error("[Supabase] insert error:", insertError.message, insertError.code);
      } else if (inserted) {
        localStorage.setItem(LOCAL_USER_ID_KEY, inserted.id);
      }
    }
  } catch (err) {
    console.error("[Supabase] unexpected error:", err);
  }
}
