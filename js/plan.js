/** Question types the runner understands. */
export const PART_ORDER = [
  'read_aloud',
  'describe_picture',
  'respond_questions',
  'info_questions',
  'opinion'
];

const TYPE_ALIASES = {
  read_aloud: 'read_aloud',
  describe_picture: 'describe_picture',
  respond_questions: 'respond_questions',
  respond_to_questions: 'respond_questions',
  info_questions: 'info_questions',
  respond_with_information: 'info_questions',
  opinion: 'opinion'
};

export function questionType(q) {
  const named = TYPE_ALIASES[String(q.type || '').trim()];
  if (named) return named;
  if (q.document) return 'info_questions';
  if (q.set_intro) return 'respond_questions';
  if (q.image) return 'describe_picture';
  if (q.text) return 'read_aloud';
  return 'opinion';
}

/** Reading time may sit on the question or on its document. */
export function readSeconds(question) {
  const fromQuestion = Number(question && question.read_sec);
  const fromDocument = Number(question && question.document && question.document.read_sec);
  if (fromQuestion > 0) return fromQuestion;
  if (fromDocument > 0) return fromDocument;
  return 45;
}

function shareWithinType(questions) {
  const shared = new Map();
  for (const q of questions) {
    const type = questionType(q);
    if (!shared.has(type)) shared.set(type, {});
    const bag = shared.get(type);
    if (q.set_intro && !bag.set_intro) bag.set_intro = q.set_intro;
    if (q.caller_intro && !bag.caller_intro) bag.caller_intro = q.caller_intro;
    if (q.document && !bag.document) bag.document = q.document;
  }
  return questions.map((q) => {
    const type = questionType(q);
    const bag = shared.get(type) || {};
    const next = { ...q, type };
    if (type === 'respond_questions' && !next.set_intro && bag.set_intro) next.set_intro = bag.set_intro;
    if (type === 'info_questions') {
      if (!next.caller_intro && bag.caller_intro) next.caller_intro = bag.caller_intro;
      if (!next.document && bag.document) next.document = bag.document;
    }
    return next;
  });
}

/**
 * selection:
 *   { mode: 'full' }
 *   { mode: 'practice', scope: 'question', q: number }
 *   { mode: 'practice', scope: 'part', part: string }
 */
export function buildPlan(test, selection) {
  const questions = shareWithinType([...(test.questions || [])]).sort((a, b) => a.q - b.q);

  let chosen = questions;
  if (selection && selection.mode === 'practice') {
    if (selection.scope === 'part') {
      chosen = questions.filter((q) => q.type === selection.part);
    } else {
      chosen = questions.filter((q) => q.q === selection.q);
    }
  }

  const steps = [];
  let lastType = null;
  let readAddedFor = null;
  let index = 0;
  const total = chosen.length;

  for (const question of chosen) {
    if (question.type !== lastType) {
      const group = chosen.filter((q) => q.type === question.type);
      steps.push({ kind: 'directions', part: question.type, questions: group });
      lastType = question.type;
      readAddedFor = null;
    }
    if (question.type === 'info_questions' && readAddedFor !== question.type) {
      steps.push({
        kind: 'read_document',
        seconds: readSeconds(question),
        question
      });
      readAddedFor = question.type;
    }
    index += 1;
    steps.push({ kind: 'question', question, index, total });
  }
  return steps;
}
