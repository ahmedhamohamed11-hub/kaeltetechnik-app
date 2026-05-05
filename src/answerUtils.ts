import { supabase } from "./supabaseClient";
import { getLocalUserId } from "./supabaseUserSync";

const STOP_WORDS = new Set([
  "der", "die", "das", "ein", "eine", "einen", "einem", "eines", "einer",
  "und", "oder", "ist", "sind", "wird", "werden", "wurde", "wurden",
  "in", "an", "auf", "fuer", "für", "von", "mit", "zu", "als", "bei",
  "durch", "aus", "nach", "ueber", "über", "unter", "vor", "hinter",
  "neben", "zwischen", "den", "dem", "des", "nicht", "auch", "sich",
  "noch", "aber", "wenn", "dass", "this", "the", "and", "for", "are",
  "was", "has", "have", "with", "kann", "muss", "darf", "soll", "hat",
  "kein", "keine", "damit", "wobei", "sodass", "jedoch", "somit", "daher",
  "immer", "erst", "dann", "nur", "sehr", "mehr", "less", "beim",
  "dieses", "diesen", "dieser", "welcher", "welche",
]);

export function getShortAnswer(answer: string): string {
  const trimmed = answer.trim();
  const sentenceMatch = trimmed.match(/^[^.!?]*[.!?]/);

  if (sentenceMatch) {
    const first = sentenceMatch[0].trim();
    if (first.length >= 20 && first.length <= 180) return first;
    if (first.length > 180) return `${first.slice(0, 177)}...`;
  }

  const byComma = trimmed.split(/[,;]/)[0].trim();
  if (byComma.length >= 20 && byComma.length <= 140) return `${byComma}...`;

  if (trimmed.length <= 160) return trimmed;
  return `${trimmed.slice(0, 157)}...`;
}

function extractKeywords(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-zäöüß0-9\s]/g, " ")
    .split(/\s+/)
    .filter((word) => word.length >= 3 && !STOP_WORDS.has(word));
}

export type ValidationResult = "correct" | "partial" | "wrong";

export function validateAnswerMeaning(
  userInput: string,
  correctAnswer: string
): ValidationResult {
  const input = userInput.trim().toLowerCase();
  if (!input || input.length < 2) return "wrong";

  const uniqueKeywords = [...new Set(extractKeywords(correctAnswer))];
  if (uniqueKeywords.length === 0) return "partial";

  const matched = uniqueKeywords.filter((keyword) => input.includes(keyword));
  const ratio = matched.length / uniqueKeywords.length;

  if (ratio >= 0.45) return "correct";
  if (ratio >= 0.15) return "partial";
  return "wrong";
}

export async function saveAnswer(
  questionId: string,
  result: "correct" | "wrong"
): Promise<void> {
  try {
    if (!supabase) return;

    const userId = getLocalUserId();
    if (!userId) return;

    const { data: existing, error: fetchError } = await supabase
      .from("users")
      .select("*")
      .eq("id", userId)
      .maybeSingle();

    if (fetchError) {
      console.error("[Supabase] user fetch error:", fetchError.message);
      return;
    }

    const now = new Date().toISOString();
    if (!existing) {
      const { error } = await supabase.from("users").insert({
        id: userId,
        totalQuestionsAnswered: 1,
        correctAnswers: result === "correct" ? 1 : 0,
        lastActive: now,
      });

      if (error) console.error("[Supabase] user insert error:", error.message);
      return;
    }

    const totalQuestionsAnswered = (existing.totalQuestionsAnswered ?? 0) + 1;
    const correctAnswers =
      result === "correct"
        ? (existing.correctAnswers ?? 0) + 1
        : existing.correctAnswers ?? 0;

    const { error } = await supabase
      .from("users")
      .update({
        totalQuestionsAnswered,
        correctAnswers,
        lastActive: now,
      })
      .eq("id", userId);

    if (error) {
      console.error("[Supabase] answer update error:", error.message);
      return;
    }

    window.dispatchEvent(
      new CustomEvent("statsUpdated", { detail: { questionId, result } })
    );
  } catch (err) {
    console.error("[Supabase] saveAnswer crash:", err);
  }
}
