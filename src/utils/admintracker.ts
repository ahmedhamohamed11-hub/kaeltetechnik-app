import { supabase } from "../supabaseClient";
import { getLocalUserId } from "../supabaseUserSync";

/* =========================
   🔥 TRACK ANSWER (FINAL)
========================= */
export async function trackAnswer(
  questionId: string,
  correct: boolean
) {
  try {
    if (!supabase) return;

    const userId = getLocalUserId();

    if (!userId) {
      console.warn("⚠️ Kein User gefunden");
      return;
    }

    const { error } = await supabase
      .from("user_progress")
      .insert({
        user_id: userId,
        question_id: questionId,
        correct: correct,
        created_at: new Date().toISOString(),
      });

    if (error) {
      console.error("❌ Fehler:", error.message);
    }
  } catch (err) {
    console.error("🔥 Crash:", err);
  }
}
