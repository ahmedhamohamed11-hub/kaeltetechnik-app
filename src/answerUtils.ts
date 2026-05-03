import { supabase } from "./supabaseClient";
import { getUserId } from "./userStorage";

/* =========================
   STOP WORDS (unverändert)
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
   🔥 SUPABASE SAVE (WICHTIG)
========================= */
export async function saveAnswer(
  questionId: string,
  result: "correct" | "wrong"
) {
  if (!supabase) return;

  // 🔥 User holen
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return;

  // 🔥 aktuellen Stand holen
  const { data: existing, error } = await supabase
    .from("users")
    .select("*")
    .eq("id", user.id)
    .single();

  if (error || !existing) {
    console.error("User nicht gefunden:", error);
    return;
  }

  // 🔥 Werte berechnen
  const newTotal = (existing.totalQuestionsAnswerd ?? 0) + 1;

  const newCorrect =
    result === "correct"
      ? (existing.correctAnswers ?? 0) + 1
      : (existing.correctAnswers ?? 0);

  // 🔥 UPDATE
  const { error: updateError } = await supabase
    .from("users")
    .update({
      totalQuestionsAnswerd: newTotal,
      correctAnswers: newCorrect,
      lastActive: new Date().toISOString(),
    })
    .eq("id", user.id);

  if (updateError) {
    console.error("Update Fehler:", updateError);
  }
}
  }

  const { error } = await supabase.from("user_progress").insert([
    {
      user_id: userId,
      question_id: questionId,
      correct: result === "correct",
      result: result,
      timestamp: new Date().toISOString(),
    },
  ]);

  if (error) {
    console.error("❌ Supabase Fehler:", error.message);
  } else {
    console.log("✅ In Supabase gespeichert:", questionId, result);
  }
}
