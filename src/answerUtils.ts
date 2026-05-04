import { supabase } from "./supabaseClient";

/* =========================
   STOP WORDS
========================= */
const STOP_WORDS = new Set([
  "der","die","das","ein","eine","einen","einem","eines","einer",
  "und","oder","ist","sind","wird","werden","wurde","wurden",
  "in","an","auf","für","von","mit","zu","als","bei","durch",
  "aus","nach","über","unter","vor","hinter","neben","zwischen",
  "den","dem","des","nicht","auch","sich","noch","aber","wenn",
  "dass","this","the","and","for","are","was","has","have","with",
  "bei","aus","kann","muss","darf","soll","wird","hat","kein","keine",
  "damit","wobei","sodass","jedoch","somit","daher",
  "immer","erst","dann","nur","sehr","mehr","less","beim",
  "dieses","diesen","dieser","welcher","welche",
]);

/* =========================
   SHORT ANSWER
========================= */
export function getShortAnswer(answer: string): string {
  const trimmed = answer.trim();
  const sentenceMatch = trimmed.match(/^[^.!?]*[.!?]/);

  if (sentenceMatch) {
    const first = sentenceMatch[0].trim();
    if (first.length >= 20 && first.length <= 180) return first;
    if (first.length > 180) return first.slice(0, 177) + "…";
  }

  const byComma = trimmed.split(/[,;]/)[0].trim();
  if (byComma.length >= 20 && byComma.length <= 140) return byComma + "…";

  if (trimmed.length <= 160) return trimmed;
  return trimmed.slice(0, 157) + "…";
}

/* =========================
   KEYWORDS
========================= */
function extractKeywords(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-züäöß0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 3 && !STOP_WORDS.has(w));
}

/* =========================
   VALIDATION
========================= */
export type ValidationResult = "correct" | "partial" | "wrong";

export function validateAnswerMeaning(
  userInput: string,
  correctAnswer: string
): ValidationResult {
  const input = userInput.trim().toLowerCase();
  if (!input || input.length < 2) return "wrong";

  const keywords = extractKeywords(correctAnswer);
  const unique = [...new Set(keywords)];

  if (unique.length === 0) return "partial";

  const matched = unique.filter((kw) => input.includes(kw));
  const ratio = matched.length / unique.length;

  if (ratio >= 0.45) return "correct";
  if (ratio >= 0.15) return "partial";
  return "wrong";
}

/* =========================
   🔥 SAVE ANSWER (FIXED FINAL)
========================= */
export async function saveAnswer(
  questionId: string,
  result: "correct" | "wrong"
) {
  try {
    if (!supabase) return;

    // ✅ User holen
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      console.warn("⚠️ Kein eingeloggter User");
      return;
    }

    const userId = user.id; // 🔥 WICHTIG FIX

    // ✅ USER holen
    const { data: existing, error: userError } = await supabase
      .from("users")
      .select("*")
      .eq("id", userId)
      .maybeSingle();

    if (userError) {
      console.error("❌ User Fehler:", userError);
      return;
    }

    // ✅ Wenn User NICHT existiert → erstellen
    if (!existing) {
      const { error: insertUserError } = await supabase.from("users").insert({
        id: userId,
        totalQuestionsAnswerd: 1,
        correctAnswers: result === "correct" ? 1 : 0,
        lastActive: new Date().toISOString(),
      });

      if (insertUserError) {
        console.error("❌ User Insert Fehler:", insertUserError);
        return;
      }
    } else {
     const newTotal = (existing.totalQuestionsAnswerd ?? 0) + 1;

const newCorrect =
  result === "correct"
    ? (existing.correctAnswers ?? 0) + 1
    : existing.correctAnswers ?? 0;

// 🔥 XP SYSTEM
const currentXP = existing.xp ?? 0;
const xpChange = result === "correct" ? 10 : -2;
const newXP = Math.max(0, currentXP + xpChange);

// 🔥 LEVEL SYSTEM
const newLevel = Math.floor(newXP / 100) + 1;

// 🔥 ACCURACY
const accuracy = newTotal > 0 ? newCorrect / newTotal : 0;

      const { error: updateError } = await supabase
        .from("users")
        .update({
          totalQuestionsAnswerd: newTotal,
          correctAnswers: newCorrect,
          lastActive: new Date().toISOString(),
             // 🔥 NEU
          xp: newXP,
         level: newLevel,
         accuracy: accuracy,

        })
        .eq("id", userId);

      if (updateError) {
        console.error("❌ Update Fehler:", updateError);
      }
    }

    // ✅ PROGRESS speichern (FIXED)
    const { error: insertError } = await supabase
      .from("user_progress")
      .insert([
        {
          user_id: userId,
          question_id: questionId,
          correct: result === "correct",
          created_at: new Date().toISOString(), // 🔥 FIX
          result: result,
        },
      ]);

    if (insertError) {
      console.error("❌ Supabase Fehler:", insertError.message);
    } else {
      console.log("✅ Gespeichert:", questionId, result);
       // 🔥 UI sofort updaten (wichtig!)
setTimeout(() => {
  window.dispatchEvent(new Event("statsUpdated"));
}, 200);
    }

  } catch (err) {
    console.error("🔥 CRASH saveAnswer:", err);
  }
}
