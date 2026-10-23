const assert = require('node:assert/strict');
const { describe, it } = require('node:test');
const { parseQuestions, docxHtmlToText, extractText } = require('../src/utils/quizImport');

describe('quiz document import', () => {
  it('parses the documented sample format', () => {
    const { questions, errors } = parseQuestions(`Q1. What does HTML stand for?
A) Hyper Text Markup Language
B) High Tech Modern Language
Answer: A
Explanation: HTML is the markup language
of the web.
Marks: 2`);
    assert.equal(errors.length, 0);
    assert.deepEqual(questions, [{
      text: 'What does HTML stand for?',
      options: ['Hyper Text Markup Language', 'High Tech Modern Language'],
      correctAnswer: 0,
      explanation: 'HTML is the markup language of the web.',
      points: 2,
    }]);
  });

  it('accepts answers given as option text or with a star marker', () => {
    const { questions } = parseQuestions(`1) Capital of France?
a. Paris
b. Berlin
Ans: Paris

2. Pick the fruit
A) car
*B) apple`);
    assert.equal(questions[0].correctAnswer, 0);
    assert.equal(questions[1].correctAnswer, 1);
  });

  it('does not read an answer word starting with a-f as an option letter', () => {
    const { questions } = parseQuestions(`1. Pick one
A) banana
B) apple
Answer: apple`);
    assert.equal(questions[0].correctAnswer, 1);
  });

  it('reports questions it cannot use instead of guessing', () => {
    const { questions, errors } = parseQuestions(`1. Only one option
A) x
Answer: A

2. No answer line
A) x
B) y`);
    assert.equal(questions.length, 0);
    assert.equal(errors.length, 2);
    assert.match(errors[0].message, /at least 2 options/);
    assert.match(errors[1].message, /Answer/);
  });

  it('rebuilds Word auto-numbered lists (nested options)', () => {
    const html = '<ol><li>Which tag makes a link?<ol><li>&lt;img&gt;</li><li>&lt;a&gt;</li></ol></li></ol><p>Answer: B</p>';
    const { questions } = parseQuestions(docxHtmlToText(html));
    assert.deepEqual(questions[0].options, ['<img>', '<a>']);
    assert.equal(questions[0].correctAnswer, 1);
  });

  it('rebuilds Word lists where options are a sibling list merged with the question', () => {
    const html = '<ol><li>Capital of France?</li><li>Paris</li><li>Berlin</li></ol><p>Answer: A</p>';
    const { questions, errors } = parseQuestions(docxHtmlToText(html));
    assert.equal(errors.length, 0);
    assert.equal(questions[0].text, 'Capital of France?');
    assert.deepEqual(questions[0].options, ['Paris', 'Berlin']);
  });

  it('rejects unsupported file types', async () => {
    await assert.rejects(() => extractText({ originalname: 'q.pdf', mimetype: 'application/pdf', buffer: Buffer.from('x') }), /Unsupported file/);
  });
});
