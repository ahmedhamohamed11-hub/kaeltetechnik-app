import type { Question } from "./questions";

export interface MCOption {
  text: string;
  isCorrect: boolean;
  hint: string;
  sourceQuestionId: number;
}

const STOP_WORDS = new Set([
  "der", "die", "das", "und", "oder", "eine", "einer", "einem", "einen",
  "ist", "sind", "wird", "werden", "bei", "mit", "von", "zur", "zum",
  "auf", "aus", "den", "dem", "des", "nicht", "nur", "auch", "was",
  "warum", "wie", "welche", "welcher", "welches", "unter", "begriff",
]);

function normalize(text: string): string {
  return text.toLowerCase().replace(/\s+/g, " ").trim();
}

function keywords(text: string): Set<string> {
  const words = normalize(text)
    .replace(/[^a-z0-9äöüß\s-]/g, " ")
    .split(/\s+/)
    .filter((word) => word.length > 2 && !STOP_WORDS.has(word));
  return new Set(words);
}

function similarity(a: Question, b: Question): number {
  const aWords = keywords(`${a.question} ${a.answer} ${a.block}`);
  const bWords = keywords(`${b.question} ${b.answer} ${b.block}`);
  let overlap = 0;
  aWords.forEach((word) => {
    if (bWords.has(word)) overlap += 1;
  });
  const blockBoost = a.block === b.block ? 4 : 0;
  const distancePenalty = Math.min(Math.abs(a.id - b.id) / 250, 2);
  return overlap + blockBoost - distancePenalty;
}

function shuffle<T>(items: T[]): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

function uniqueKey(text: string): string {
  return normalize(text).slice(0, 180);
}

export function generateMCOptions(current: Question, allQs: Question[]): MCOption[] {
  const used = new Set<string>([uniqueKey(current.answer), uniqueKey(current.explanation)]);

  const ranked = allQs
    .filter((candidate) => candidate.id !== current.id)
    .map((candidate) => ({ candidate, score: similarity(current, candidate) }))
    .sort((a, b) => b.score - a.score);

  const distractors: MCOption[] = [];

  for (const { candidate } of ranked) {
    if (distractors.length >= 3) break;
    const text = candidate.answer.trim();
    const key = uniqueKey(text);
    if (!text || used.has(key)) continue;
    used.add(key);
    distractors.push({
      text,
      isCorrect: false,
      hint: candidate.explanation,
      sourceQuestionId: candidate.id,
    });
  }

  const fallback = allQs.filter((q) => q.id !== current.id);
  for (const candidate of shuffle(fallback)) {
    if (distractors.length >= 3) break;
    const text = candidate.answer.trim();
    const key = uniqueKey(text);
    if (!text || used.has(key)) continue;
    used.add(key);
    distractors.push({
      text,
      isCorrect: false,
      hint: candidate.explanation,
      sourceQuestionId: candidate.id,
    });
  }

  const correct: MCOption = {
    text: current.answer,
    isCorrect: true,
    hint: current.explanation,
    sourceQuestionId: current.id,
  };

  return shuffle([correct, ...distractors.slice(0, 3)]);
}
