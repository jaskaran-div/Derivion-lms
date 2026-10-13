"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import AppLayout from "@/components/layout/AppLayout";
import { coursesAPI } from "@/lib/api";
import { useAuthStore } from "@/store/authStore";
import LearnerContentProtection from "@/components/content/LearnerContentProtection";
import toast from "react-hot-toast";
import { ArrowLeft, Clock, CheckCircle, AlertCircle, ChevronRight } from "lucide-react";

interface Question {
  id: string;
  question: string;
  type: "MULTIPLE_CHOICE" | "TRUE_FALSE" | "SHORT_ANSWER";
  options: string[];
  marks: number;
}

interface Assessment {
  id: string;
  title: string;
  description?: string;
  timeLimit?: number;
  passingScore: number;
  totalMarks: number;
  maxAttempts: number;
  questions: Question[];
  course: { title: string; slug: string };
  userAttempts: any[];
}

export default function AssessmentPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { user } = useAuthStore();
  const [assessment, setAssessment] = useState<Assessment | null>(null);
  const [loading, setLoading] = useState(true);
  const [started, setStarted] = useState(false);
  const [answers, setAnswers] = useState<Record<string, string | string[]>>({});
  const [timeLeft, setTimeLeft] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<any>(null);

  useEffect(() => {
    if (id) loadAssessment();
  }, [id]);

  useEffect(() => {
    if (timeLeft === null || timeLeft <= 0 || !started) return;
    const timer = setInterval(() => {
      setTimeLeft(prev => {
        if (prev === null || prev <= 1) {
          clearInterval(timer);
          handleSubmit();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [started]);

  const loadAssessment = async () => {
    try {
      const res = await coursesAPI.getAssessment(id as string);
      setAssessment(res.data.data);
      if (res.data.data.timeLimit) {
        setTimeLeft(res.data.data.timeLimit * 60);
      }
    } catch {
      toast.error("Assessment not found.");
      router.back();
    } finally {
      setLoading(false);
    }
  };

  const handleStart = () => {
    setStarted(true);
    if (assessment?.timeLimit) {
      setTimeLeft(assessment.timeLimit * 60);
    }
  };

  const handleAnswer = (questionId: string, value: string) => {
    setAnswers(prev => ({ ...prev, [questionId]: value }));
  };

  const handleSubmit = async () => {
    if (submitting) return;
    setSubmitting(true);
    try {
      const payload = {
        answers: Object.entries(answers).map(([questionId, answer]) => ({
          questionId,
          answer: Array.isArray(answer) ? answer.join(",") : answer,
        })),
      };
      const res = await coursesAPI.submitAssessment(id as string, payload);
      setResult(res.data.data);
      setStarted(false);
      toast.success("Assessment submitted!");
    } catch {
      toast.error("Failed to submit. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  };

  const answeredCount = Object.keys(answers).length;
  const totalQuestions = assessment?.questions.length || 0;

  if (loading) {
    return (
      <AppLayout>
        <LearnerContentProtection>
          <div style={{ maxWidth: 700, margin: "0 auto" }}>
            <div className="skeleton" style={{ height: 200, borderRadius: 16, marginBottom: 20 }} />
          </div>
        </LearnerContentProtection>
      </AppLayout>
    );
  }

  if (!assessment) return null;

  const lastAttempt = assessment.userAttempts?.[0];
  const canAttempt = !assessment.maxAttempts || (assessment.userAttempts?.length || 0) < assessment.maxAttempts;
  const hasPassed = lastAttempt?.passed;

  return (
    <AppLayout>
      <LearnerContentProtection>
      <div style={{ maxWidth: 720, margin: "0 auto" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 24 }}>
          <button className="btn btn-ghost btn-icon" onClick={() => router.back()}>
            <ArrowLeft size={20} />
          </button>
          <div>
            <div style={{ fontSize: 12, color: "var(--gray-400)", marginBottom: 2 }}>
              {assessment.course.title}
            </div>
            <h1 className="page-title" style={{ margin: 0 }}>{assessment.title}</h1>
          </div>
        </div>

        {/* Result Card */}
        {result && (
          <div
            className="card"
            style={{
              marginBottom: 24,
              border: `2px solid ${result.passed ? "var(--success)" : "var(--danger)"}`,
              textAlign: "center",
              padding: 32,
            }}
          >
            <div style={{ fontSize: 56, marginBottom: 12 }}>
              {result.passed ? "🎉" : "😔"}
            </div>
            <h2 style={{ fontSize: 24, fontWeight: 800, marginBottom: 8, color: result.passed ? "var(--success)" : "var(--danger)" }}>
              {result.passed ? "Congratulations! You Passed!" : "Keep Trying!"}
            </h2>
            <div style={{ fontSize: 40, fontWeight: 800, color: "var(--gray-900)", marginBottom: 4 }}>
              {result.score}/{result.totalMarks}
            </div>
            <div style={{ fontSize: 15, color: "var(--gray-500)", marginBottom: 16 }}>
              {Math.round((result.score / result.totalMarks) * 100)}% · Passing score: {assessment.passingScore}%
            </div>
            {result.passed && result.certificate && (
              <div className="alert alert-success" style={{ marginTop: 16 }}>
                🏆 A certificate has been issued! Check your <a href="/certificates" style={{ color: "var(--primary)", fontWeight: 600 }}>certificates</a>.
              </div>
            )}
          </div>
        )}

        {/* Info Card (before starting) */}
        {!started && !result && (
          <div className="card" style={{ marginBottom: 20 }}>
            <div className="card-body">
              {assessment.description && (
                <p style={{ color: "var(--gray-600)", lineHeight: 1.7, marginBottom: 20 }}>
                  {assessment.description}
                </p>
              )}

              <div className="grid-2" style={{ marginBottom: 24 }}>
                {[
                  { label: "Total Questions", value: assessment.questions.length },
                  { label: "Total Marks", value: assessment.totalMarks },
                  { label: "Passing Score", value: `${assessment.passingScore}%` },
                  { label: "Time Limit", value: assessment.timeLimit ? `${assessment.timeLimit} min` : "Unlimited" },
                  { label: "Max Attempts", value: assessment.maxAttempts || "Unlimited" },
                  { label: "Attempts Used", value: assessment.userAttempts?.length || 0 },
                ].map((item, i) => (
                  <div key={i} style={{ background: "var(--gray-50)", borderRadius: "var(--radius-md)", padding: "14px 18px" }}>
                    <div style={{ fontSize: 12, color: "var(--gray-400)", marginBottom: 4 }}>{item.label}</div>
                    <div style={{ fontSize: 18, fontWeight: 700, color: "var(--gray-900)" }}>{item.value}</div>
                  </div>
                ))}
              </div>

              {lastAttempt && (
                <div className={`alert ${lastAttempt.passed ? "alert-success" : "alert-info"}`} style={{ marginBottom: 20 }}>
                  Previous attempt: {lastAttempt.score}/{lastAttempt.totalMarks} — {lastAttempt.passed ? "✅ Passed" : "❌ Failed"}
                </div>
              )}

              {hasPassed ? (
                <div className="alert alert-success">
                  ✅ You have already passed this assessment. You can retake it if attempts remain.
                </div>
              ) : !canAttempt ? (
                <div className="alert alert-warning">
                  ⚠️ You have used all allowed attempts for this assessment.
                </div>
              ) : (
                <button
                  className="btn btn-primary btn-lg w-full"
                  style={{ justifyContent: "center" }}
                  onClick={handleStart}
                >
                  {lastAttempt ? "Retake Assessment" : "Start Assessment"} →
                </button>
              )}
            </div>
          </div>
        )}

        {/* Questions */}
        {started && (
          <>
            {/* Timer & Progress */}
            <div
              className="card"
              style={{
                padding: "14px 20px",
                marginBottom: 20,
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                position: "sticky",
                top: 72,
                zIndex: 10,
              }}
            >
              <div style={{ fontSize: 14, color: "var(--gray-600)" }}>
                <span style={{ fontWeight: 700, color: "var(--primary)" }}>{answeredCount}</span>/{totalQuestions} answered
              </div>
              <div className="progress-bar" style={{ width: 200 }}>
                <div className="progress-fill" style={{ width: `${(answeredCount / totalQuestions) * 100}%` }} />
              </div>
              {timeLeft !== null && (
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    fontWeight: 700,
                    fontSize: 16,
                    color: timeLeft < 300 ? "var(--danger)" : "var(--gray-800)",
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  <Clock size={16} /> {formatTime(timeLeft)}
                </div>
              )}
            </div>

            {/* Question Cards */}
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              {assessment.questions.map((q, i) => (
                <div
                  key={q.id}
                  className="card"
                  style={{
                    padding: 24,
                    border: answers[q.id] ? "2px solid var(--primary-light)" : "1px solid var(--border-color)",
                  }}
                >
                  <div style={{ display: "flex", gap: 12, alignItems: "flex-start", marginBottom: 16 }}>
                    <div
                      style={{
                        width: 30,
                        height: 30,
                        borderRadius: "50%",
                        background: answers[q.id] ? "var(--primary)" : "var(--gray-100)",
                        color: answers[q.id] ? "white" : "var(--gray-500)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontWeight: 700,
                        fontSize: 13,
                        flexShrink: 0,
                      }}
                    >
                      {i + 1}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 15, fontWeight: 600, color: "var(--gray-800)", lineHeight: 1.5 }}>
                        {q.question}
                      </div>
                      <div style={{ fontSize: 12, color: "var(--gray-400)", marginTop: 2 }}>
                        {q.marks} mark{q.marks !== 1 ? "s" : ""}
                      </div>
                    </div>
                  </div>

                  {q.type === "MULTIPLE_CHOICE" && (
                    <div style={{ display: "flex", flexDirection: "column", gap: 10, paddingLeft: 42 }}>
                      {q.options.map((option, oi) => (
                        <label
                          key={oi}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 10,
                            padding: "10px 14px",
                            borderRadius: "var(--radius-md)",
                            border: `2px solid ${answers[q.id] === option ? "var(--primary)" : "var(--border-color)"}`,
                            background: answers[q.id] === option ? "var(--primary-50)" : "white",
                            cursor: "pointer",
                            transition: "all 0.15s",
                            fontSize: 14,
                          }}
                        >
                          <input
                            type="radio"
                            name={q.id}
                            value={option}
                            checked={answers[q.id] === option}
                            onChange={() => handleAnswer(q.id, option)}
                            style={{ accentColor: "var(--primary)" }}
                          />
                          {option}
                        </label>
                      ))}
                    </div>
                  )}

                  {q.type === "TRUE_FALSE" && (
                    <div style={{ display: "flex", gap: 12, paddingLeft: 42 }}>
                      {["True", "False"].map(opt => (
                        <label
                          key={opt}
                          style={{
                            flex: 1,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            gap: 8,
                            padding: "12px",
                            borderRadius: "var(--radius-md)",
                            border: `2px solid ${answers[q.id] === opt ? "var(--primary)" : "var(--border-color)"}`,
                            background: answers[q.id] === opt ? "var(--primary-50)" : "white",
                            cursor: "pointer",
                            fontWeight: 500,
                            fontSize: 14,
                            transition: "all 0.15s",
                          }}
                        >
                          <input
                            type="radio"
                            name={q.id}
                            value={opt}
                            checked={answers[q.id] === opt}
                            onChange={() => handleAnswer(q.id, opt)}
                            style={{ accentColor: "var(--primary)" }}
                          />
                          {opt === "True" ? "✅" : "❌"} {opt}
                        </label>
                      ))}
                    </div>
                  )}

                  {q.type === "SHORT_ANSWER" && (
                    <div style={{ paddingLeft: 42 }}>
                      <textarea
                        className="form-control"
                        rows={3}
                        placeholder="Type your answer here..."
                        value={(answers[q.id] as string) || ""}
                        onChange={e => handleAnswer(q.id, e.target.value)}
                      />
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Submit */}
            <div
              style={{
                marginTop: 24,
                padding: "20px 24px",
                background: "white",
                borderRadius: "var(--radius-xl)",
                border: "1px solid var(--border-color)",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <div style={{ fontSize: 14, color: "var(--gray-500)" }}>
                {answeredCount < totalQuestions && (
                  <span style={{ color: "var(--warning)", fontWeight: 500 }}>
                    ⚠️ {totalQuestions - answeredCount} question{totalQuestions - answeredCount !== 1 ? "s" : ""} unanswered
                  </span>
                )}
                {answeredCount === totalQuestions && (
                  <span style={{ color: "var(--success)", fontWeight: 500 }}>
                    ✅ All questions answered!
                  </span>
                )}
              </div>
              <button
                className="btn btn-primary btn-lg"
                onClick={handleSubmit}
                disabled={submitting || answeredCount === 0}
              >
                {submitting ? "Submitting..." : "Submit Assessment →"}
              </button>
            </div>
          </>
        )}
      </div>
      </LearnerContentProtection>
    </AppLayout>
  );
}
