// Parses MCQ questions out of a Word (.docx) or plain-text document.
//
// Expected format (blank lines optional):
//
//   Q1. What does HTML stand for?
//   A) Hyper Text Markup Language
//   B) High Tech Modern Language
//   C) Home Tool Markup Language
//   D) Hyperlinks Text Mark Language
//   Answer: A
//   Explanation: HTML is the standard markup language for web pages.   (optional)
//   Marks: 1                                                          (optional, default 1)

const mammoth = require('mammoth');

const QUESTION_RE = /^(?:q(?:uestion)?\s*)?(\d+)\s*[.):\-]\s*(.+)$/i;
const QUESTION_NO_NUM_RE = /^q(?:uestion)?\s*[.):\-]\s*(.+)$/i;
const OPTION_RE = /^(\*)?\s*\(?([a-f])\s*[).:\-]\s*(.+)$/i;
const ANSWER_RE = /^(?:ans(?:wer)?|correct(?:\s+answer)?|key)\s*[:\-.]?\s*(?:\(?([a-f])\)?(?:[).:]|\s|$))?\s*(.*)$/i;
const EXPLANATION_RE = /^(?:explanation|exp|reason|solution)\s*[:\-]\s*(.+)$/i;
const MARKS_RE = /^(?:marks?|points?|score)\s*[:\-]\s*(\d+)/i;

const decodeEntities = (s) =>
  s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10)))
    .replace(/&amp;/g, '&');

const HAS_MARKER_RE = /^(?:q(?:uestion)?\s*\d*\s*[.):\-]|\d+\s*[.):\-]|\*?\s*\(?[a-f]\s*[).:\-])/i;

const QUESTION_LINE_RE = /^(?:q(?:uestion)?\s*\d*|\d+)\s*[.):\-]/i;

const ANSWER_LINE_RE = /^(?:ans(?:wer)?|correct(?:\s+answer)?|key)\b/i;
const optionPrefix = (n) => `${String.fromCharCode(64 + Math.min(n, 26))})`;

// Word turns typed "1." / "A)" into automatic lists, whose numbers are not part of the text.
// Rebuild the markers from the list structure:
//  - nested list items are options (A, B, …)
//  - a list that starts right after a question line is the options of that question
//  - one flat list directly followed by "Answer:" is a question (first item) plus its options
//  - any other list item is a question (1, 2, …)
const docxHtmlToText = (html) => {
  // Pass 1: flatten into entries { text, depth, listId } (depth 0 = paragraph)
  const entries = [];
  const stack = [];
  let nextListId = 0;
  let line = '';
  let inItem = false;
  const flush = () => {
    const text = decodeEntities(line).replace(/\s+/g, ' ').trim();
    if (text) {
      const top = stack[stack.length - 1];
      entries.push(inItem && top ? { text, depth: stack.length, listId: top } : { text, depth: 0 });
    }
    line = '';
  };
  for (const tok of html.split(/(<[^>]+>)/)) {
    if (!tok.startsWith('<')) { line += tok; continue; }
    const tag = tok.toLowerCase();
    if (tag.startsWith('<ol') || tag.startsWith('<ul')) { flush(); stack.push(++nextListId); }
    else if (tag.startsWith('</ol') || tag.startsWith('</ul')) { flush(); stack.pop(); inItem = stack.length > 0; }
    else if (tag.startsWith('<li')) { flush(); inItem = true; }
    else if (tag.startsWith('</li') || tag.startsWith('</p') || tag.startsWith('<br') || /^<\/h\d/.test(tag)) flush();
  }
  flush();

  // Pass 2: give each list item its marker
  const lines = [];
  const counters = {};
  const listRole = {}; // listId -> 'options' | 'questions' | 'question+options'
  let lastWasQuestion = false;

  for (let i = 0; i < entries.length; i++) {
    const e = entries[i];
    let out = e.text;
    if (e.depth > 0 && !HAS_MARKER_RE.test(e.text)) {
      if (!listRole[e.listId]) {
        if (e.depth > 1 || lastWasQuestion) listRole[e.listId] = 'options';
        else {
          // Look ahead: a flat list (no nested items) immediately followed by an Answer line
          let j = i;
          let nested = false;
          while (j < entries.length && entries[j].depth > 0 && (entries[j].listId === e.listId || entries[j].depth > 1)) {
            if (entries[j].depth > 1) nested = true;
            j++;
          }
          const count = j - i;
          listRole[e.listId] = !nested && count >= 3 && entries[j] && ANSWER_LINE_RE.test(entries[j].text) ? 'question+options' : 'questions';
        }
      }
      counters[e.listId] = (counters[e.listId] || 0) + 1;
      const n = counters[e.listId];
      const role = listRole[e.listId];
      if (role === 'options') out = `${optionPrefix(n)} ${e.text}`;
      else if (role === 'question+options') out = n === 1 ? `Q. ${e.text}` : `${optionPrefix(n - 1)} ${e.text}`;
      else out = `${n}. ${e.text}`;
    }
    lines.push(out);
    lastWasQuestion = QUESTION_LINE_RE.test(out) || /^q(?:uestion)?\s*[.):\-]/i.test(out);
  }
  return lines.join('\n');
};

const extractText = async (file) => {
  const name = (file.originalname || '').toLowerCase();
  if (name.endsWith('.docx') || file.mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
    const { value } = await mammoth.convertToHtml({ buffer: file.buffer });
    return docxHtmlToText(value);
  }
  if (name.endsWith('.txt') || file.mimetype === 'text/plain') {
    return file.buffer.toString('utf8');
  }
  throw new Error('Unsupported file. Upload a Word (.docx) or text (.txt) file.');
};

const parseQuestions = (text) => {
  const lines = text
    .replace(/\r/g, '')
    .split('\n')
    .map((l) => l.replace(/ /g, ' ').trim())
    .filter(Boolean);

  const blocks = [];
  let cur = null;
  let lastField = null; // 'text' | 'option' | 'explanation'

  const start = (number, qText) => {
    cur = { number, text: qText, options: [], markedCorrect: null, answerLetter: null, answerText: null, explanation: null, points: 1 };
    blocks.push(cur);
    lastField = 'text';
  };

  for (const line of lines) {
    let m;
    // Answer/explanation/marks lines are checked before options so "A) ..." can't swallow them
    if (cur && (m = line.match(MARKS_RE))) { cur.points = Math.max(1, parseInt(m[1], 10)); continue; }
    if (cur && (m = line.match(EXPLANATION_RE))) { cur.explanation = m[1].trim(); lastField = 'explanation'; continue; }
    if (cur && cur.options.length > 0 && (m = line.match(ANSWER_RE))) {
      if (m[1]) cur.answerLetter = m[1].toUpperCase();
      else if (m[2]) cur.answerText = m[2].trim();
      lastField = null;
      continue;
    }
    if (cur && cur.answerLetter === null && cur.answerText === null && (m = line.match(OPTION_RE))) {
      const expected = String.fromCharCode(65 + cur.options.length);
      if (m[2].toUpperCase() === expected) {
        if (m[1]) cur.markedCorrect = cur.options.length;
        cur.options.push(m[3].trim());
        lastField = 'option';
        continue;
      }
    }
    if ((m = line.match(QUESTION_RE))) { start(parseInt(m[1], 10), m[2].trim()); continue; }
    if ((m = line.match(QUESTION_NO_NUM_RE))) { start(blocks.length + 1, m[1].trim()); continue; }

    // Continuation of the previous field (multi-line question text, option or explanation)
    if (!cur) continue;
    if (lastField === 'text') cur.text += `\n${line}`;
    else if (lastField === 'option') cur.options[cur.options.length - 1] += ` ${line}`;
    else if (lastField === 'explanation') cur.explanation += ` ${line}`;
  }

  const questions = [];
  const errors = [];
  blocks.forEach((b, i) => {
    const label = `Question ${b.number || i + 1}`;
    let correct = -1;
    if (b.answerLetter) correct = b.answerLetter.charCodeAt(0) - 65;
    else if (b.answerText) correct = b.options.findIndex((o) => o.toLowerCase() === b.answerText.toLowerCase());
    else if (b.markedCorrect !== null) correct = b.markedCorrect;

    if (b.options.length < 2) return errors.push({ question: label, text: b.text, message: 'needs at least 2 options (A, B, …)' });
    if (b.options.length > 6) return errors.push({ question: label, text: b.text, message: 'has more than 6 options' });
    if (correct < 0 || correct >= b.options.length) {
      return errors.push({ question: label, text: b.text, message: 'missing or invalid "Answer:" line' });
    }
    questions.push({
      text: b.text,
      options: b.options,
      correctAnswer: correct,
      explanation: b.explanation || '',
      points: b.points,
    });
  });

  return { questions, errors };
};

module.exports = { extractText, parseQuestions };
