const prisma = require('../config/database');

// GET /api/courses/:courseId/assessments/:id - Get assessment (student)
const getAssessment = async (req, res) => {
  try {
    const { id } = req.params;

    const assessment = await prisma.assessment.findUnique({
      where: { id },
      include: {
        questions: {
          orderBy: { order: 'asc' },
          select: {
            id: true, text: true, type: true, options: true, points: true, order: true,
            // Don't send correctAnswer to student
          },
        },
        _count: { select: { attempts: true } },
      },
    });

    if (!assessment || !assessment.isPublished) {
      return res.status(404).json({ success: false, message: 'Assessment not found.' });
    }

    // Check enrollment
    const enrollment = await prisma.enrollment.findUnique({
      where: { userId_courseId: { userId: req.user.id, courseId: assessment.courseId } },
    });
    if (!enrollment) return res.status(403).json({ success: false, message: 'Not enrolled.' });

    // Check max attempts
    const attempts = await prisma.assessmentAttempt.count({
      where: { userId: req.user.id, assessmentId: id },
    });

    res.json({
      success: true,
      data: {
        ...assessment,
        attemptsUsed: attempts,
        canAttempt: attempts < assessment.maxAttempts,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to fetch assessment.' });
  }
};

// POST /api/assessments/:id/submit
const submitAssessment = async (req, res) => {
  try {
    const { id } = req.params;
    const { answers, timeTaken } = req.body; // answers: [{ questionId, answer }]

    const assessment = await prisma.assessment.findUnique({
      where: { id },
      include: { questions: true },
    });

    if (!assessment) return res.status(404).json({ success: false, message: 'Assessment not found.' });

    // Check enrollment
    const enrollment = await prisma.enrollment.findUnique({
      where: { userId_courseId: { userId: req.user.id, courseId: assessment.courseId } },
    });
    if (!enrollment) return res.status(403).json({ success: false, message: 'Not enrolled.' });

    // Check attempt limit
    const attemptsCount = await prisma.assessmentAttempt.count({
      where: { userId: req.user.id, assessmentId: id },
    });
    if (attemptsCount >= assessment.maxAttempts) {
      return res.status(400).json({ success: false, message: 'Maximum attempts reached.' });
    }

    // Calculate score
    let totalPoints = 0;
    let earnedPoints = 0;
    const gradedAnswers = [];

    for (const question of assessment.questions) {
      totalPoints += question.points;
      const userAnswer = answers.find((a) => a.questionId === question.id);
      const isCorrect = userAnswer && userAnswer.answer === question.correctAnswer;
      if (isCorrect) earnedPoints += question.points;

      gradedAnswers.push({
        questionId: question.id,
        userAnswer: userAnswer?.answer || null,
        correctAnswer: question.correctAnswer,
        isCorrect,
        explanation: question.explanation,
      });
    }

    const scorePercent = totalPoints > 0 ? (earnedPoints / totalPoints) * 100 : 0;
    const isPassed = scorePercent >= assessment.passingScore;

    const attempt = await prisma.assessmentAttempt.create({
      data: {
        userId: req.user.id,
        assessmentId: id,
        score: scorePercent,
        isPassed,
        answers: gradedAnswers,
        timeTaken,
      },
    });

    // Create notification
    await prisma.notification.create({
      data: {
        userId: req.user.id,
        title: isPassed ? '🎉 Assessment Passed!' : '📝 Assessment Completed',
        message: `You scored ${scorePercent.toFixed(1)}% on "${assessment.title}". ${isPassed ? 'Congratulations!' : `Passing score is ${assessment.passingScore}%.`}`,
        type: isPassed ? 'SUCCESS' : 'INFO',
      },
    });

    res.json({
      success: true,
      data: {
        attemptId: attempt.id,
        score: scorePercent,
        isPassed,
        earnedPoints,
        totalPoints,
        passingScore: assessment.passingScore,
        gradedAnswers,
        attemptsUsed: attemptsCount + 1,
        attemptsLeft: assessment.maxAttempts - attemptsCount - 1,
      },
    });
  } catch (error) {
    console.error('Submit assessment error:', error);
    res.status(500).json({ success: false, message: 'Failed to submit assessment.' });
  }
};

// Admin: POST /api/admin/courses/:courseId/assessments
const createAssessment = async (req, res) => {
  try {
    const { courseId } = req.params;
    const { title, description, type, passingScore, timeLimit, maxAttempts } = req.body;

    const assessment = await prisma.assessment.create({
      data: {
        title, description, type, courseId,
        passingScore: parseInt(passingScore) || 60,
        timeLimit: timeLimit ? parseInt(timeLimit) : null,
        maxAttempts: parseInt(maxAttempts) || 3,
      },
    });

    res.status(201).json({ success: true, data: assessment });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to create assessment.' });
  }
};

// Admin: PUT /api/admin/assessments/:id
const updateAssessment = async (req, res) => {
  try {
    const { id } = req.params;
    const data = req.body;
    if (data.passingScore) data.passingScore = parseInt(data.passingScore);
    if (data.timeLimit) data.timeLimit = parseInt(data.timeLimit);
    if (data.maxAttempts) data.maxAttempts = parseInt(data.maxAttempts);

    const assessment = await prisma.assessment.update({ where: { id }, data });
    res.json({ success: true, data: assessment });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to update assessment.' });
  }
};

// Admin: POST /api/admin/assessments/:id/questions
const addQuestion = async (req, res) => {
  try {
    const { id: assessmentId } = req.params;
    const { text, type, options, correctAnswer, explanation, points } = req.body;

    const lastQ = await prisma.question.findFirst({
      where: { assessmentId },
      orderBy: { order: 'desc' },
    });

    const question = await prisma.question.create({
      data: {
        assessmentId, text, type,
        options: options || null,
        correctAnswer,
        explanation,
        points: parseInt(points) || 1,
        order: (lastQ?.order ?? -1) + 1,
      },
    });

    res.status(201).json({ success: true, data: question });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to add question.' });
  }
};

// Admin: PUT /api/admin/questions/:id
const updateQuestion = async (req, res) => {
  try {
    const { id } = req.params;
    const question = await prisma.question.update({ where: { id }, data: req.body });
    res.json({ success: true, data: question });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to update question.' });
  }
};

// Admin: DELETE /api/admin/questions/:id
const deleteQuestion = async (req, res) => {
  try {
    await prisma.question.delete({ where: { id: req.params.id } });
    res.json({ success: true, message: 'Question deleted.' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to delete question.' });
  }
};

// GET /api/student/assessments/:id/attempts
const getAttempts = async (req, res) => {
  try {
    const { id } = req.params;
    const attempts = await prisma.assessmentAttempt.findMany({
      where: { assessmentId: id, userId: req.user.id },
      orderBy: { completedAt: 'desc' },
    });
    res.json({ success: true, data: attempts });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to fetch attempts.' });
  }
};

module.exports = {
  getAssessment, submitAssessment,
  createAssessment, updateAssessment, addQuestion, updateQuestion, deleteQuestion,
  getAttempts,
};
