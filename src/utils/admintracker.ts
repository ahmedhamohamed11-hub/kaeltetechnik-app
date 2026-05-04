import { supabase } from "../supabaseClient";

export async function trackUserLogin(userId: string) {
  const now = new Date().toISOString();

  const { data: existing } = await supabase
    .from("users")
    .select("*")
    .eq("id", userId)
    .maybeSingle();

  if (!existing) {
    await supabase.from("users").insert({
      id: userId,
      name: userId,
      firstLoginDate: now,
      lastLoginDate: now,
      totalLogins: 1,
    });
  } else {
    await supabase
      .from("users")
      .update({
        lastLoginDate: now,
        totalLogins: (existing.totalLogins || 0) + 1,
      })
      .eq("id", userId);
  }
}

export async function trackAnswer(
  userId: string,
  questionId: string,
  correct: boolean
) {
  await supabase.from("answers").insert({
    user_id: userId,
    question_id: questionId,
    correct,
    timestamp: new Date().toISOString(),
  });
}
