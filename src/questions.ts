import { getShortAnswer } from "./answerUtils";
import { examQuestions } from "./examQuestions";

export interface Question {
  id: number;
  frage: string;
  antwortKurz: string;
  erklaerung: string;
  thema: string;
  question: string;
  answer: string;
  block: string;
  explanation: string;
}

function normalizeQuestion(source: {
  id: number;
  question: string;
  answer: string;
  block: string;
}): Question {
  const frage = source.question.trim();
  const erklaerung = source.answer.trim();
  const thema = source.block.trim();
  const antwortKurz = getShortAnswer(erklaerung);

  return {
    id: source.id,
    frage,
    antwortKurz,
    erklaerung,
    thema,
    question: frage,
    answer: antwortKurz,
    block: thema,
    explanation: erklaerung,
  };
}

export const allQuestions: Question[] = examQuestions.map(normalizeQuestion);

export function validateQuestionIntegrity(questions: Question[]): string[] {
  const errors: string[] = [];
  const seenIds = new Set<number>();

  for (const question of questions) {
    if (seenIds.has(question.id)) errors.push(`Doppelte Frage-ID: ${question.id}`);
    seenIds.add(question.id);

    if (!question.frage) errors.push(`Frage ${question.id}: leere Frage`);
    if (!question.antwortKurz) errors.push(`Frage ${question.id}: leere Kurzantwort`);
    if (!question.erklaerung) errors.push(`Frage ${question.id}: leere Originalantwort`);
    if (!question.thema) errors.push(`Frage ${question.id}: leeres Thema`);

    if (question.question !== question.frage) errors.push(`Frage ${question.id}: question/frage Mapping abweichend`);
    if (question.answer !== question.antwortKurz) errors.push(`Frage ${question.id}: answer/antwortKurz Mapping abweichend`);
    if (question.explanation !== question.erklaerung) errors.push(`Frage ${question.id}: explanation/erklaerung Mapping abweichend`);
    if (question.block !== question.thema) errors.push(`Frage ${question.id}: block/thema Mapping abweichend`);
  }

  return errors;
}

const integrityErrors = validateQuestionIntegrity(allQuestions);
if (integrityErrors.length > 0) {
  console.error("[QuestionIntegrity]", integrityErrors);
}

export const totalCount = allQuestions.length;
