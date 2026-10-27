const prisma = require('../config/database');
const { extractText, parseQuestions } = require('../utils/quizImport');
const { markLessonComplete, ACCESS_STATUSES } = require('../services/progress');
const { logActivity } = require('./auditController');

// Answers arriving this long after the deadline are still accepted (network latency)
const GRACE_MS = 30 * 1000;

const shuffle = (arr) => {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

const toInt = (v, fallback) => {
  const n = parseInt(v, 10);
  return Number.isNaN(n) ? fallback : n;
};

// ==================== ADMIN: QUIZ BANK ====================

const pickQuizFields = (body) => {
  const data = {};
  if (body.title !== undefined) data.title = String(body.title).trim();
  if (body.description !== undefined) data.description = body.description || null;
  if (body.passingScore !== undefined) data.passingScore = Math.min(100, Math.max(0, toInt(body.passingScore, 60)));
  if (body.timeLimit !== undefined) {
    const minutes = toInt(body.timeLimit, 0);
    data.timeLimit = minutes > 0 ? minutes : null;
  }
  if (body.maxAttempts !== undefined) data.maxAttempts = Math.max(1, toInt(body.maxAttempts, 1));
  if (body.shuffleQuestions !== undefined) data.shuffleQuestions = !!body.shuffleQuestions;
  if (body.shuffleOptions !== undefined) data.shuffleOptions = !!body.shuffleOptions;
  if (body.showResultsAfter !== undefined) data.showResultsAfter = !!body.showResultsAfter;
  if (body.isPublished !== undefined) data.isPublished = !!body.isPublished;
  return data;
};

// GET /api/admin/quizzes
const listQuizzes = async (req, res) => {
  try {
    const quizzes = await prisma.assessment.findMany({
      where: { type: 'QUIZ' },
      orderBy: { createdAt: 'desc' },
      include: {
        _count: { select: { questions: true, contents: true } },
        questions: { select: { points: true } },
      },
    });
    const attemptCounts = await prisma.assessmentAttempt.groupBy({
      by: ['assessmentId'],
      where: { status: 'SUBMITTED' },
      _count: { _all: true },
    });
    const countMap = Object.fromEntries(attemptCounts.map((a) => [a.assessmentId, a._count._all]));
    res.json({
      success: true,
      data: quizzes.map(({ questions, ...q }) => ({
        ...q,
        totalPoints: questions.reduce((s, x) => s + x.points, 0),
        submittedAttempts: countMap[q.id] || 0,
      })),
    });
  } catch (error) {
    console.error('listQuizzes error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch quizzes.' });
  }
};

// GET /api/admin/quizzes/:id
const getQuizAdmin = async (req, res) => {
  try {
    const quiz = await prisma.assessment.findUnique({
      where: { id: req.params.id },
      include: {
        questions: { orderBy: { order: 'asc' } },
        contents: {
          select: { id: true, title: true, section: { select: { title: true, course: { select: { id: true, title: true } } } } },
        },
      },
    });
    if (!quiz) return res.status(404).json({ success: false, message: 'Quiz not found.' });
    res.json({ success: true, data: quiz });
  } catch (error) {
    console.error('getQuizAdmin error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch quiz.' });
  }
};

// POST /api/admin/quizzes
const createQuiz = async (req, res) => {
  try {
    const data = pickQuizFields(req.body);
    if (!data.title) return res.status(400).json({ success: false, message: 'Quiz name is required.' });
    const quiz = await prisma.assessment.create({ data: { maxAttempts: 1, ...data, type: 'QUIZ' } });
    res.status(201).json({ success: true, data: quiz });
  } catch (error) {
    console.error('createQuiz error:', error);
    res.status(500).json({ success: false, message: 'Failed to create quiz.' });
  }
};

// PUT /api/admin/quizzes/:id
const updateQuiz = async (req, res) => {
  try {
    const data = pickQuizFields(req.body);
    if (data.title !== undefined && !data.title) {
      return res.status(400).json({ success: false, message: 'Quiz name is required.' });
    }
    if (data.isPublished) {
      const count = await prisma.question.count({ where: { assessmentId: req.params.id } });
      if (count === 0) return res.status(400).json({ success: false, message: 'Add at least one question before publishing.' });
    }
    const quiz = await prisma.assessment.update({ where: { id: req.params.id }, data });
    res.json({ success: true, data: quiz });
  } catch (error) {
    if (error.code === 'P2025') return res.status(404).json({ success: false, message: 'Quiz not found.' });
    console.error('updateQuiz error:', error);
    res.status(500).json({ success: false, message: 'Failed to update quiz.' });
  }
};

// DELETE /api/admin/quizzes/:id
const deleteQuiz = async (req, res) => {
  try {
    await prisma.assessment.delete({ where: { id: req.params.id } });
    res.json({ success: true, message: 'Quiz deleted.' });
  } catch (error) {
    if (error.code === 'P2025') return res.status(404).json({ success: false, message: 'Quiz not found.' });
    console.error('deleteQuiz error:', error);
    res.status(500).json({ success: false, message: 'Failed to delete quiz.' });
  }
};

// MCQ: options = string[], correctAnswer = index (as string) of the right option
const parseMcq = (body) => {
  const text = String(body.text || '').trim();
  const options = Array.isArray(body.options) ? body.options.map((o) => String(o).trim()) : [];
  const correct = toInt(body.correctAnswer, -1);
  if (!text) return { error: 'Question text is required.' };
  if (options.length < 2 || options.length > 6) return { error: 'Provide between 2 and 6 options.' };
  if (options.some((o) => !o)) return { error: 'Options cannot be empty.' };
  if (correct < 0 || correct >= options.length) return { error: 'Select the correct option.' };
  return {
    data: {
      text,
      type: 'MCQ',
      options,
      correctAnswer: String(correct),
      explanation: body.explanation ? String(body.explanation) : null,
      points: Math.max(1, toInt(body.points, 1)),
    },
  };
};

// POST /api/admin/quizzes/:id/questions
const addQuestion = async (req, res) => {
  try {
    const { id: assessmentId } = req.params;
    const { data, error } = parseMcq(req.body);
    if (error) return res.status(400).json({ success: false, message: error });

    const lastQ = await prisma.question.findFirst({ where: { assessmentId }, orderBy: { order: 'desc' } });
    const question = await prisma.question.create({
      data: { ...data, assessmentId, order: (lastQ?.order ?? -1) + 1 },
    });
    res.status(201).json({ success: true, data: question });
  } catch (error) {
    console.error('addQuestion error:', error);
    res.status(500).json({ success: false, message: 'Failed to add question.' });
  }
};

// PUT /api/admin/questions/:id
const updateQuestion = async (req, res) => {
  try {
    const { data, error } = parseMcq(req.body);
    if (error) return res.status(400).json({ success: false, message: error });
    const question = await prisma.question.update({ where: { id: req.params.id }, data });
    res.json({ success: true, data: question });
  } catch (error) {
    if (error.code === 'P2025') return res.status(404).json({ success: false, message: 'Question not found.' });
    console.error('updateQuestion error:', error);
    res.status(500).json({ success: false, message: 'Failed to update question.' });
  }
};

// DELETE /api/admin/questions/:id
const deleteQuestion = async (req, res) => {
  try {
    await prisma.question.delete({ where: { id: req.params.id } });
    res.json({ success: true, message: 'Question deleted.' });
  } catch (error) {
    if (error.code === 'P2025') return res.status(404).json({ success: false, message: 'Question not found.' });
    res.status(500).json({ success: false, message: 'Failed to delete question.' });
  }
};

// POST /api/admin/quizzes/:id/import/preview  (multipart "file": .docx or .txt)
// Parses the document and returns the questions for review — nothing is saved yet.
const previewImport = async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, message: 'No file uploaded.' });
    let text;
    try {
      text = await extractText(req.file);
    } catch (e) {
      return res.status(400).json({ success: false, message: e.message });
    }
    const { questions, errors } = parseQuestions(text);
    if (questions.length === 0 && errors.length === 0) {
      return res.status(400).json({ success: false, message: 'No questions found. Check the document follows the sample format.' });
    }
    res.json({ success: true, data: { questions, errors } });
  } catch (error) {
    console.error('previewImport error:', error);
    res.status(500).json({ success: false, message: 'Failed to read the document.' });
  }
};

// POST /api/admin/quizzes/:id/questions/bulk  { questions: [...] }
const bulkAddQuestions = async (req, res) => {
  try {
    const { id: assessmentId } = req.params;
    const input = Array.isArray(req.body.questions) ? req.body.questions : [];
    if (input.length === 0) return res.status(400).json({ success: false, message: 'No questions to import.' });
    if (input.length > 500) return res.status(400).json({ success: false, message: 'Import at most 500 questions at a time.' });

    const quiz = await prisma.assessment.findUnique({ where: { id: assessmentId }, select: { id: true } });
    if (!quiz) return res.status(404).json({ success: false, message: 'Quiz not found.' });

    const parsed = [];
    for (let i = 0; i < input.length; i++) {
      const { data, error } = parseMcq(input[i]);
      if (error) return res.status(400).json({ success: false, message: `Question ${i + 1}: ${error}` });
      parsed.push(data);
    }

    const lastQ = await prisma.question.findFirst({ where: { assessmentId }, orderBy: { order: 'desc' } });
    const base = (lastQ?.order ?? -1) + 1;
    const { count } = await prisma.question.createMany({
      data: parsed.map((d, i) => ({ ...d, assessmentId, order: base + i })),
    });
    res.status(201).json({ success: true, data: { count } });
  } catch (error) {
    console.error('bulkAddQuestions error:', error);
    res.status(500).json({ success: false, message: 'Failed to import questions.' });
  }
};

// GET /api/admin/quizzes/:id/attempts
const listQuizAttempts = async (req, res) => {
  try {
    const attempts = await prisma.assessmentAttempt.findMany({
      where: { assessmentId: req.params.id, status: 'SUBMITTED' },
      orderBy: { completedAt: 'desc' },
      select: {
        id: true, score: true, isPassed: true, earnedPoints: true, totalPoints: true,
        tabSwitches: true, autoSubmitted: true, timeTaken: true, startedAt: true, completedAt: true,
        user: { select: { id: true, firstName: true, lastName: true, email: true } },
      },
    });
    res.json({ success: true, data: attempts });
  } catch (error) {
    console.error('listQuizAttempts error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch attempts.' });
  }
};

// GET /api/admin/quizzes/:id/analytics — how each question performed across submitted attempts
const getQuizAnalytics = async (req, res) => {
  try {
    const quiz = await prisma.assessment.findUnique({
      where: { id: req.params.id },
      include: { questions: { orderBy: { order: 'asc' } } },
    });
    if (!quiz) return res.status(404).json({ success: false, message: 'Quiz not found.' });

    const attempts = await prisma.assessmentAttempt.findMany({
      where: { assessmentId: quiz.id, status: 'SUBMITTED' },
      select: { answers: true, score: true, isPassed: true },
    });

    const stats = Object.fromEntries(quiz.questions.map((q) => [q.id, {
      questionId: q.id, text: q.text, options: q.options, correct: Number(q.correctAnswer),
      answered: 0, correctCount: 0, skipped: 0, optionCounts: (Array.isArray(q.options) ? q.options : []).map(() => 0),
    }]));
    for (const a of attempts) {
      for (const g of Array.isArray(a.answers) ? a.answers : []) {
        const st = stats[g.questionId];
        if (!st) continue;
        if (g.selected === null || g.selected === undefined) { st.skipped++; continue; }
        st.answered++;
        if (g.isCorrect) st.correctCount++;
        if (st.optionCounts[g.selected] !== undefined) st.optionCounts[g.selected]++;
      }
    }

    const n = attempts.length;
    res.json({
      success: true,
      data: {
        attempts: n,
        passRate: n ? (attempts.filter((a) => a.isPassed).length / n) * 100 : 0,
        averageScore: n ? attempts.reduce((sum, a) => sum + Number(a.score), 0) / n : 0,
        questions: quiz.questions.map((q) => {
          const st = stats[q.id];
          return { ...st, correctRate: n ? (st.correctCount / n) * 100 : 0 };
        }),
      },
    });
  } catch (error) {
    console.error('getQuizAnalytics error:', error);
    res.status(500).json({ success: false, message: 'Failed to load analytics.' });
  }
};

// ==================== STUDENT: TAKING A QUIZ ====================

// Student may take a quiz if it is published and linked to a lesson of a course they are enrolled in.
// Returns { quiz, content } or { status, message }.
const resolveAccess = async (user, assessmentId, contentId) => {
  const quiz = await prisma.assessment.findUnique({
    where: { id: assessmentId },
    include: { questions: { orderBy: { order: 'asc' } } },
  });
  if (!quiz) return { status: 404, message: 'Quiz not found.' };

  let content = null;
  if (contentId) {
    content = await prisma.content.findFirst({
      where: { id: contentId, assessmentId },
      select: { id: true, title: true, section: { select: { course: { select: { id: true, title: true, slug: true } } } } },
    });
  }

  if (user.role === 'ADMIN') return { quiz, content };

  if (!quiz.isPublished) return { status: 404, message: 'Quiz not found.' };
  if (!content) {
    // Fall back to any lesson linking this quiz in a course the user is enrolled in
    content = await prisma.content.findFirst({
      where: {
        assessmentId,
        section: { course: { enrollments: { some: { userId: user.id, status: { not: 'REFUNDED' } } } } },
      },
      select: { id: true, title: true, section: { select: { course: { select: { id: true, title: true, slug: true } } } } },
    });
    if (!content) return { status: 403, message: 'You are not enrolled in a course that contains this quiz.' };
  } else {
    const enrolled = await prisma.enrollment.findFirst({
      where: { userId: user.id, courseId: content.section.course.id, status: { not: 'REFUNDED' } },
      select: { id: true },
    });
    if (!enrolled) return { status: 403, message: 'You are not enrolled in this course.' };
  }
  return { quiz, content };
};

// Grade an in-progress attempt from its saved answers and mark it submitted
const finalizeAttempt = async (attempt, quiz, { autoSubmitted = false } = {}) => {
  const saved = attempt.answers && typeof attempt.answers === 'object' && !Array.isArray(attempt.answers) ? attempt.answers : {};
  let totalPoints = 0;
  let earnedPoints = 0;
  const graded = quiz.questions.map((q) => {
    totalPoints += q.points;
    const chosen = saved[q.id] !== undefined && saved[q.id] !== null ? String(saved[q.id]) : null;
    const isCorrect = chosen !== null && chosen === q.correctAnswer;
    if (isCorrect) earnedPoints += q.points;
    return { questionId: q.id, selected: chosen === null ? null : Number(chosen), correct: Number(q.correctAnswer), isCorrect, points: q.points };
  });

  const score = totalPoints > 0 ? (earnedPoints / totalPoints) * 100 : 0;
  const isPassed = score >= quiz.passingScore;
  const now = new Date();
  const end = attempt.expiresAt && now > attempt.expiresAt ? attempt.expiresAt : now;

  // Only finalize if still in progress (guards against double submit)
  const { count } = await prisma.assessmentAttempt.updateMany({
    where: { id: attempt.id, status: 'IN_PROGRESS' },
    data: {
      status: 'SUBMITTED',
      answers: graded,
      score,
      isPassed,
      earnedPoints,
      totalPoints,
      autoSubmitted,
      completedAt: now,
      timeTaken: Math.max(0, Math.round((end - attempt.startedAt) / 1000)),
    },
  });
  if (count === 0) return prisma.assessmentAttempt.findUnique({ where: { id: attempt.id } });

  // A pass completes every lesson that uses this quiz in courses the learner is enrolled in
  if (isPassed) {
    const lessons = await prisma.content.findMany({
      where: {
        assessmentId: quiz.id,
        section: { course: { enrollments: { some: { userId: attempt.userId, status: { in: ACCESS_STATUSES } } } } },
      },
      select: { id: true, section: { select: { courseId: true } } },
    });
    for (const l of lessons) {
      await markLessonComplete(attempt.userId, l.id, l.section.courseId).catch((e) => console.error('quiz completion error:', e.message));
    }
  }

  await prisma.notification.create({
    data: {
      userId: attempt.userId,
      title: isPassed ? 'Quiz passed!' : 'Quiz submitted',
      message: `You scored ${score.toFixed(1)}% on "${quiz.title}". ${isPassed ? 'Well done!' : `Passing score is ${quiz.passingScore}%.`}`,
      type: isPassed ? 'SUCCESS' : 'INFO',
    },
  }).catch(() => {});

  return prisma.assessmentAttempt.findUnique({ where: { id: attempt.id } });
};

// Auto-submit any of this user's attempts whose time has run out
const closeExpiredAttempts = async (userId, quiz) => {
  const expired = await prisma.assessmentAttempt.findMany({
    where: { userId, assessmentId: quiz.id, status: 'IN_PROGRESS', expiresAt: { lt: new Date(Date.now() - GRACE_MS) } },
  });
  for (const a of expired) await finalizeAttempt(a, quiz, { autoSubmitted: true });
};

const attemptSummary = (a) => ({
  id: a.id,
  score: Number(a.score),
  isPassed: a.isPassed,
  earnedPoints: a.earnedPoints,
  totalPoints: a.totalPoints,
  timeTaken: a.timeTaken,
  autoSubmitted: a.autoSubmitted,
  tabSwitches: a.tabSwitches,
  completedAt: a.completedAt,
});

// Questions as shown to the student (no correct answers), in the attempt's order
const presentQuestions = (quiz, questionOrder) => {
  const byId = Object.fromEntries(quiz.questions.map((q) => [q.id, q]));
  return (questionOrder || [])
    .filter((o) => byId[o.questionId])
    .map((o) => {
      const q = byId[o.questionId];
      const opts = Array.isArray(q.options) ? q.options : [];
      return {
        id: q.id,
        text: q.text,
        points: q.points,
        options: o.optionOrder.filter((i) => i < opts.length).map((i) => ({ index: i, text: opts[i] })),
      };
    });
};

// Full review (with correct answers) — only when the quiz allows showing results
const buildReview = (quiz, attempt) => {
  const byId = Object.fromEntries(quiz.questions.map((q) => [q.id, q]));
  const graded = Array.isArray(attempt.answers) ? attempt.answers : [];
  return graded
    .filter((g) => byId[g.questionId])
    .map((g) => ({
      ...g,
      text: byId[g.questionId].text,
      options: byId[g.questionId].options,
      explanation: byId[g.questionId].explanation,
    }));
};

// GET /api/student/assessments/:id?contentId=
const getAssessment = async (req, res) => {
  try {
    const access = await resolveAccess(req.user, req.params.id, req.query.contentId);
    if (access.status) return res.status(access.status).json({ success: false, message: access.message });
    const { quiz, content } = access;

    await closeExpiredAttempts(req.user.id, quiz);
    const attempts = await prisma.assessmentAttempt.findMany({
      where: { userId: req.user.id, assessmentId: quiz.id },
      orderBy: { startedAt: 'desc' },
    });
    const submitted = attempts.filter((a) => a.status === 'SUBMITTED');
    const inProgress = attempts.find((a) => a.status === 'IN_PROGRESS');

    res.json({
      success: true,
      data: {
        id: quiz.id,
        title: quiz.title,
        description: quiz.description,
        timeLimit: quiz.timeLimit,
        passingScore: quiz.passingScore,
        maxAttempts: quiz.maxAttempts,
        showResultsAfter: quiz.showResultsAfter,
        questionCount: quiz.questions.length,
        totalPoints: quiz.questions.reduce((s, q) => s + q.points, 0),
        content: content ? { id: content.id, title: content.title, course: content.section.course } : null,
        attemptsUsed: attempts.length,
        attemptsLeft: Math.max(0, quiz.maxAttempts - attempts.length),
        bestScore: submitted.length ? Math.max(...submitted.map((a) => Number(a.score))) : null,
        hasPassed: submitted.some((a) => a.isPassed),
        inProgressAttemptId: inProgress?.id || null,
        attempts: submitted.map(attemptSummary),
      },
    });
  } catch (error) {
    console.error('getAssessment error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch quiz.' });
  }
};

// POST /api/student/assessments/:id/start  { contentId }
// Resumes the in-progress attempt or starts a new one. The deadline is fixed server-side.
const startAttempt = async (req, res) => {
  try {
    const access = await resolveAccess(req.user, req.params.id, req.body.contentId);
    if (access.status) return res.status(access.status).json({ success: false, message: access.message });
    const { quiz } = access;
    if (quiz.questions.length === 0) return res.status(400).json({ success: false, message: 'This quiz has no questions yet.' });

    await closeExpiredAttempts(req.user.id, quiz);

    let attempt = await prisma.assessmentAttempt.findFirst({
      where: { userId: req.user.id, assessmentId: quiz.id, status: 'IN_PROGRESS' },
    });

    if (!attempt) {
      const used = await prisma.assessmentAttempt.count({ where: { userId: req.user.id, assessmentId: quiz.id } });
      if (used >= quiz.maxAttempts) {
        return res.status(400).json({ success: false, message: 'You have used all allowed attempts.' });
      }
      const qs = quiz.shuffleQuestions ? shuffle(quiz.questions) : quiz.questions;
      const questionOrder = qs.map((q) => {
        const idx = (Array.isArray(q.options) ? q.options : []).map((_, i) => i);
        return { questionId: q.id, optionOrder: quiz.shuffleOptions ? shuffle(idx) : idx };
      });
      const startedAt = new Date();
      attempt = await prisma.assessmentAttempt.create({
        data: {
          userId: req.user.id,
          assessmentId: quiz.id,
          status: 'IN_PROGRESS',
          answers: {},
          questionOrder,
          startedAt,
          expiresAt: quiz.timeLimit ? new Date(startedAt.getTime() + quiz.timeLimit * 60 * 1000) : null,
        },
      });
      logActivity(req, 'QUIZ_STARTED', { targetId: quiz.id, targetType: 'assessment', quiz: quiz.title });
    }

    res.json({
      success: true,
      data: {
        attemptId: attempt.id,
        startedAt: attempt.startedAt,
        expiresAt: attempt.expiresAt,
        serverNow: new Date(),
        answers: attempt.answers || {},
        tabSwitches: attempt.tabSwitches,
        questions: presentQuestions(quiz, attempt.questionOrder),
      },
    });
  } catch (error) {
    console.error('startAttempt error:', error);
    res.status(500).json({ success: false, message: 'Failed to start quiz.' });
  }
};

const sanitizeAnswers = (quiz, answers) => {
  const valid = {};
  if (!answers || typeof answers !== 'object') return valid;
  for (const q of quiz.questions) {
    const v = answers[q.id];
    if (v === undefined || v === null || v === '') continue;
    const n = toInt(v, -1);
    if (n >= 0 && n < (Array.isArray(q.options) ? q.options.length : 0)) valid[q.id] = n;
  }
  return valid;
};

const loadOwnAttempt = async (req) => {
  const attempt = await prisma.assessmentAttempt.findUnique({
    where: { id: req.params.attemptId },
    include: { assessment: { include: { questions: { orderBy: { order: 'asc' } } } } },
  });
  if (!attempt || attempt.userId !== req.user.id) return null;
  return attempt;
};

// PUT /api/student/attempts/:attemptId  { answers, tabSwitches } — autosave
const saveProgress = async (req, res) => {
  try {
    const attempt = await loadOwnAttempt(req);
    if (!attempt) return res.status(404).json({ success: false, message: 'Attempt not found.' });
    if (attempt.status !== 'IN_PROGRESS') return res.status(400).json({ success: false, message: 'Attempt already submitted.' });
    if (attempt.expiresAt && Date.now() > attempt.expiresAt.getTime() + GRACE_MS) {
      return res.status(400).json({ success: false, message: 'Time is up.', expired: true });
    }
    await prisma.assessmentAttempt.update({
      where: { id: attempt.id },
      data: {
        answers: sanitizeAnswers(attempt.assessment, req.body.answers),
        tabSwitches: Math.max(attempt.tabSwitches, toInt(req.body.tabSwitches, 0)),
      },
    });
    res.json({ success: true, data: { savedAt: new Date() } });
  } catch (error) {
    console.error('saveProgress error:', error);
    res.status(500).json({ success: false, message: 'Failed to save answers.' });
  }
};

// POST /api/student/attempts/:attemptId/submit  { answers, tabSwitches }
const submitAttempt = async (req, res) => {
  try {
    const attempt = await loadOwnAttempt(req);
    if (!attempt) return res.status(404).json({ success: false, message: 'Attempt not found.' });
    const quiz = attempt.assessment;

    let finalAttempt = attempt;
    if (attempt.status === 'IN_PROGRESS') {
      const late = attempt.expiresAt && Date.now() > attempt.expiresAt.getTime() + GRACE_MS;
      // Answers sent after the deadline are ignored — the last autosaved answers are graded
      if (!late) {
        attempt.answers = sanitizeAnswers(quiz, req.body.answers);
        attempt.tabSwitches = Math.max(attempt.tabSwitches, toInt(req.body.tabSwitches, 0));
        await prisma.assessmentAttempt.update({
          where: { id: attempt.id },
          data: { answers: attempt.answers, tabSwitches: attempt.tabSwitches },
        });
      }
      finalAttempt = await finalizeAttempt(attempt, quiz, { autoSubmitted: !!late || !!req.body.autoSubmitted });
      logActivity(req, 'QUIZ_SUBMITTED', {
        targetId: quiz.id, targetType: 'assessment', quiz: quiz.title,
        score: Number(finalAttempt.score), passed: finalAttempt.isPassed, autoSubmitted: finalAttempt.autoSubmitted,
      });
    }

    const used = await prisma.assessmentAttempt.count({ where: { userId: req.user.id, assessmentId: quiz.id } });
    res.json({
      success: true,
      data: {
        ...attemptSummary(finalAttempt),
        passingScore: quiz.passingScore,
        attemptsLeft: Math.max(0, quiz.maxAttempts - used),
        review: quiz.showResultsAfter ? buildReview(quiz, finalAttempt) : null,
      },
    });
  } catch (error) {
    console.error('submitAttempt error:', error);
    res.status(500).json({ success: false, message: 'Failed to submit quiz.' });
  }
};

module.exports = {
  // admin
  listQuizzes, getQuizAdmin, createQuiz, updateQuiz, deleteQuiz,
  addQuestion, updateQuestion, deleteQuestion, listQuizAttempts,
  previewImport, bulkAddQuestions, getQuizAnalytics,
  // student
  getAssessment, startAttempt, saveProgress, submitAttempt,
};
