import { supabase } from "../supabaseClient";

export async function trackAnswer(
  userId: string,
  questionId: string,
  correct: boolean
) {
  console.log("TRACK:", userId, questionId, correct);

  await supabase.from("answers").insert({
    user_id: userId,
    question_id: questionId,
    correct,
    timestamp: new Date().toISOString(),
  });
}
