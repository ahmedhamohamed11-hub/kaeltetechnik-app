import { supabase } from "../supabaseClient";
import { getLocalUserId } from "../supabaseUserSync";

/* =========================
   🔥 TRACK ANSWER (FINAL CLEAN)
========================= */
export async function trackAnswer(
  questionId: string,
  correct: boolean
) {
  try {
    if (!supabase) return;

    const userId = getLocalUserId();

    if (!userId) {
      console.warn("⚠️ Kein User gefunden (localStorage)");
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
      console.error("❌ Fehler beim Speichern:", error.message);
    } else {
      console.log("✅ Answer gespeichert:", questionId, correct);
    }

  } catch (err) {
    console.error("🔥 trackAnswer Crash:", err);
  }
}
