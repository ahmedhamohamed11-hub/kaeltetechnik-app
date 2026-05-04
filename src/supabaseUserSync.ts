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

async function updateUserProgress(userId: string, payload: SyncPayload): Promise<boolean> {
  if (!supabase) return false;

  const now = new Date().toISOString();

  const { error } = await supabase
    .from("users")
    .update({
      correctAnswers: payload.correctAnswers,
      learnDays: payload.learnDays,
      lastActive: now,
      totalQuestionsAnswered: payload.totalQuestionsAnswered,
    })
    .eq("id", userId);

  if (!error) return true;

  const { error: fallbackError } = await supabase
    .from("users")
    .update({
      correctAnswers: payload.correctAnswers,
      learnDays: payload.learnDays,
      lastActive: now,
      totalQuestionsAnswerd: payload.totalQuestionsAnswered,
    })
    .eq("id", userId);

  if (fallbackError) {
    console.error("[Sync] push error:", fallbackError.message);
    return false;
  }

  return true;
}

async function insertUser(payload: {
  id: string;
  name: string;
  firstLoginDate: string;
  lastLoginDate: string;
  lastActive: string;
  totalLogins: number;
  correctAnswers: number;
  learnDays: string[];
  xp: number;
}): Promise<string | null> {
  if (!supabase) return null;

  const { data, error } = await supabase
    .from("users")
    .insert({
      ...payload,
      totalQuestionsAnswered: 0,
      totalQuestionsAnswerd: 0,
    })
    .select("id")
    .single();

  if (!error && data) return data.id;

  const { data: fallbackData, error: fallbackError } = await supabase
    .from("users")
    .insert({
      ...payload,
      totalQuestionsAnswerd: 0,
    })
    .select("id")
    .single();

  if (fallbackError) {
    console.error("[Supabase] insert error:", fallbackError.message, fallbackError.code);
    return null;
  }

  return fallbackData?.id ?? null;
}

async function pushToSupabase(payload: SyncPayload): Promise<boolean> {
  const userId = getLocalUserId();
  if (!userId) return false;

  try {
    return await updateUserProgress(userId, payload);
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
  const trimmedName = name.trim();

  try {
    const { data: existing, error: fetchError } = await supabase
      .from("users")
      .select("id, totalLogins")
      .ilike("name", trimmedName)
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
      const insertedId = crypto.randomUUID();

      const id = await insertUser({
        id: insertedId,
        name: trimmedName,
        firstLoginDate: now,
        lastLoginDate: now,
        lastActive: now,
        totalLogins: 1,
        correctAnswers: 0,
        learnDays: [],
        xp: 0,
      });

      if (id) {
        localStorage.setItem(LOCAL_USER_ID_KEY, id);
      }
    }
  } catch (err) {
    console.error("[Supabase] unexpected error:", err);
  }
}
