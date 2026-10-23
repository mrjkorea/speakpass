import { RUBRIC } from "./rubric.js";

const TRANSCRIPT_CAP = 2500;

function clip(text) {
  const value = String(text || "").replace(/\s+/g, " ").trim();
  if (value.length <= TRANSCRIPT_CAP) return { text: value, cut: false };
  return { text: value.slice(0, TRANSCRIPT_CAP), cut: true };
}

function documentText(question) {
  const doc = question.document || {};
  if (doc.markdown) return String(doc.markdown);
  if (doc.title) return String(doc.title);
  return "";
}

function linesFor(question, transcript) {
  const lines = [`Question ${question.q}`];
  if (question.q <= 2) {
    lines.push("Task: read the printed text aloud.");
    lines.push(`Printed text: ${question.text || ""}`);
  } else if (question.q <= 4) {
    lines.push("Task: describe the picture.");
    lines.push(`Picture notes: ${question.description || question.image_prompt || ""}`);
    const keys = Array.isArray(question.key_elements)
      ? question.key_elements.map((item) => {
        if (typeof item === "string") return item;
        return item && item.text ? String(item.text) : "";
      }).filter(Boolean).join("; ")
      : "";
    lines.push(`Main things to mention: ${keys}`);
  } else if (question.q <= 7) {
    lines.push("Task: answer the question.");
    if (question.set_intro) lines.push(`Scene: ${question.set_intro}`);
    lines.push(`Question: ${question.question || ""}`);
    if (question.model_answer) lines.push(`Strong sample, not a script: ${question.model_answer}`);
  } else if (question.q <= 10) {
    lines.push("Task: answer from the document.");
    if (question.caller_intro) lines.push(`Caller: ${question.caller_intro}`);
    lines.push(`Document: ${documentText(question)}`);
    lines.push(`Question: ${question.question || ""}`);
    const facts = Array.isArray(question.answer_facts) ? question.answer_facts.join(" ") : "";
    if (facts) lines.push(`Facts a full answer includes: ${facts}`);
    if (question.model_answer) lines.push(`Strong sample, not a script: ${question.model_answer}`);
  } else {
    lines.push("Task: give an opinion with reasons.");
    lines.push(`Question: ${question.question || ""}`);
    if (question.model_answer) lines.push(`Strong sample, not a script: ${question.model_answer}`);
  }
  lines.push(`Transcript: ${transcript.text}`);
  if (transcript.cut) lines.push("The transcript was cut at 2500 characters.");
  return lines.join("\n");
}

export function normalizeAnswers(raw) {
  const byQ = new Map();
  const list = Array.isArray(raw) ? raw : [];
  for (const item of list) {
    const q = Number(item && item.q);
    if (!Number.isInteger(q) || q < 1 || q > 11) continue;
    byQ.set(q, String(item && item.transcript || ""));
  }
  return [...byQ.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([q, transcript]) => ({ q, transcript }));
}

/** Student UI languages the app offers. Feedback language only; answers stay English. */
export const FEEDBACK_LANGS = {
  en: "English", ko: "Korean", "zh-Hans": "Simplified Chinese", ja: "Japanese", es: "Spanish",
  hi: "Hindi", de: "German", vi: "Vietnamese", "pt-BR": "Brazilian Portuguese", id: "Indonesian",
  fr: "French", ar: "Arabic", tr: "Turkish", it: "Italian", pl: "Polish"
};

export function feedbackLanguage(lang) {
  const key = String(lang || "").trim();
  return Object.prototype.hasOwnProperty.call(FEEDBACK_LANGS, key) ? FEEDBACK_LANGS[key] : "English";
}

/** Rubric is message 0. The test and transcripts are message 1. */
export function buildMessages(test, answers, lang) {
  const pending = [];
  const skipped = [];
  const language = feedbackLanguage(lang);
  const blocks = [
    `Practice test ${test.id}. Grade only these questions.`,
    `Write every "comment" and "tip" in ${language}. Keep "corrected" in English.`
  ];
  for (const answer of answers) {
    const question = (test.questions || []).find((item) => item.q === answer.q);
    if (!question) continue;
    const transcript = clip(answer.transcript);
    if (!transcript.text) {
      skipped.push(answer.q);
      continue;
    }
    pending.push(answer.q);
    blocks.push(linesFor(question, transcript));
  }
  return {
    pending,
    skipped,
    messages: [
      { role: "system", content: RUBRIC },
      { role: "user", content: blocks.join("\n\n") }
    ]
  };
}
