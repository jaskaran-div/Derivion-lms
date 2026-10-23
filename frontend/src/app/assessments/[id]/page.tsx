"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import AppLayout from "@/components/layout/AppLayout";
import { quizAPI } from "@/lib/api";
import LearnerContentProtection from "@/components/content/LearnerContentProtection";
import { isAxiosError } from "axios";
import toast from "react-hot-toast";
import {
  ArrowLeft, Clock, CheckCircle, XCircle, ChevronLeft, ChevronRight, Flag, AlertTriangle, Send,
} from "lucide-react";

interface AttemptSummary {
  id: string;
  score: number;
  isPassed: boolean;
  earnedPoints: number;
  totalPoints: number;
  timeTaken?: number | null;
  autoSubmitted: boolean;
  completedAt: string;
}

interface QuizInfo {
  id: string;
  title: string;
  description?: string | null;
  timeLimit?: number | null;
  passingScore: number;
  maxAttempts: number;
  showResultsAfter: boolean;
  questionCount: number;
  totalPoints: number;
  content: { id: string; title: string; course: { id: string; title: string; slug: string } } | null;
  attemptsUsed: number;
  attemptsLeft: number;
  bestScore: number | null;
  hasPassed: boolean;
  inProgressAttemptId: string | null;
  attempts: AttemptSummary[];
}

interface ExamQuestion {
  id: string;
  text: string;
  points: number;
  options: { index: number; text: string }[];
}

interface ReviewItem {
  questionId: string;
  text: string;
  options: string[];
  selected: number | null;
  correct: number;
  isCorrect: boolean;
  points: number;
  explanation?: string | null;
}

interface Result extends AttemptSummary {
  passingScore: number;
  attemptsLeft: number;
  review: ReviewItem[] | null;
}

const errMsg = (err: unknown, fallback: string) =>
  (isAxiosError<{ message?: string }>(err) && err.response?.data?.message) || fallback;

const fmtClock = (s: number) => {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const mm = String(m).padStart(2, "0");
  const ss = String(sec).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
};
const fmtDuration = (s?: number | null) => (s == null ? "—" : `${Math.floor(s / 60)}m ${s % 60}s`);
const letter = (i: number) => String.fromCharCode(65 + i);

function AssessmentInner() {
  const { id } = useParams<{ id: string }>();
  const contentId = useSearchParams().get("content") || undefined;
  const router = useRouter();

  const [info, setInfo] = useState<QuizInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [phase, setPhase] = useState<"info" | "exam" | "result">("info");
  const [starting, setStarting] = useState(false);

  // Exam state
  const [attemptId, setAttemptId] = useState<string | null>(null);
  const [questions, setQuestions] = useState<ExamQuestion[]>([]);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [flagged, setFlagged] = useState<Set<string>>(new Set());
  const [current, setCurrent] = useState(0);
  const [deadline, setDeadline] = useState<number | null>(null); // local-clock ms
  const [timeLeft, setTimeLeft] = useState<number | null>(null);
  const [tabSwitches, setTabSwitches] = useState(0);
  const [saveState, setSaveState] = useState<"saved" | "saving" | "error">("saved");
  const [showConfirm, setShowConfirm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<Result | null>(null);

  // Refs so timers/listeners always see the latest values
  const answersRef = useRef(answers);
  const tabRef = useRef(tabSwitches);
  const submittedRef = useRef(false);
  useEffect(() => { answersRef.current = answers; }, [answers]);
  useEffect(() => { tabRef.current = tabSwitches; }, [tabSwitches]);

  const loadInfo = useCallback(() => {
    return quizAPI.getInfo(id, contentId)
      .then((res) => {
        setInfo(res.data.data);
      })
      .catch((err) => {
        toast.error(errMsg(err, "Quiz not available."));
        router.back();
      })
      .finally(() => {
        setLoading(false);
      });
  }, [id, contentId, router]);

  useEffect(() => { if (id) loadInfo(); }, [id, loadInfo]);

  const startExam = async () => {
    setStarting(true);
    try {
      const res = await quizAPI.start(id, contentId ?? info?.content?.id);
      const d = res.data.data;
      setAttemptId(d.attemptId);
      setQuestions(d.questions);
      setAnswers(d.answers || {});
      setTabSwitches(d.tabSwitches || 0);
      setCurrent(0);
      setFlagged(new Set());
      submittedRef.current = false;
      if (d.expiresAt) {
        // Correct for clock skew between this device and the server
        const offset = Date.now() - new Date(d.serverNow).getTime();
        setDeadline(new Date(d.expiresAt).getTime() + offset);
      } else {
        setDeadline(null);
        setTimeLeft(null);
      }
      setPhase("exam");
      document.documentElement.requestFullscreen?.().catch(() => {});
    } catch (err) {
      toast.error(errMsg(err, "Could not start the quiz."));
      loadInfo();
    } finally {
      setStarting(false);
    }
  };

  const submit = useCallback(async (auto = false) => {
    if (!attemptId || submittedRef.current) return;
    submittedRef.current = true;
    setSubmitting(true);
    setShowConfirm(false);
    try {
      const res = await quizAPI.submit(attemptId, {
        answers: answersRef.current,
        tabSwitches: tabRef.current,
        autoSubmitted: auto,
      });
      const r: Result = res.data.data;
      setResult(r);
      setPhase("result");
      if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
      if (auto) toast("Time is up — your quiz was submitted automatically.", { icon: "⏰" });
      else toast.success("Quiz submitted!");
      // Passing completes the lesson on the server (course progress and certificate included)
    } catch (err) {
      submittedRef.current = false;
      toast.error(errMsg(err, "Failed to submit. Check your connection and try again."));
    } finally {
      setSubmitting(false);
    }
  }, [attemptId]);

  // Countdown
  useEffect(() => {
    if (phase !== "exam" || deadline === null) return;
    const tick = () => {
    const left = Math.max(0, Math.round((deadline - Date.now()) / 1000));
    setTimeLeft(left);
    if (left === 0) submit(true);
    };
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [phase, deadline, submit]);

  // Autosave shortly after each change, plus a periodic heartbeat
  const save = useCallback(async () => {
    if (!attemptId || submittedRef.current) return;
    setSaveState("saving");
    try {
      await quizAPI.save(attemptId, { answers: answersRef.current, tabSwitches: tabRef.current });
      setSaveState("saved");
    } catch (err) {
      if (isAxiosError(err) && err.response?.data?.expired) submit(true);
      else setSaveState("error");
    }
  }, [attemptId, submit]);

  useEffect(() => {
    if (phase !== "exam") return;
    const t = setTimeout(save, 800);
    return () => clearTimeout(t);
  }, [answers, tabSwitches, phase, save]);

  useEffect(() => {
    if (phase !== "exam") return;
    const t = setInterval(save, 20000);
    return () => clearInterval(t);
  }, [phase, save]);

  // Restrictions: record tab/window switches, warn before leaving the page
  useEffect(() => {
    if (phase !== "exam") return;
    let lastHit = 0;
    const onLeave = () => {
    const now = Date.now();
    if (submittedRef.current || now - lastHit < 1500) return; // blur + visibilitychange fire together
    lastHit = now;
    setTabSwitches((n) => n + 1);
    toast.error("Leaving the quiz window is recorded and visible to your instructor.", { id: "tab-warning", duration: 4000 });
    };
    const onVisibility = () => { if (document.visibilityState === "hidden") onLeave(); };
    const onBeforeUnload = (e: BeforeUnloadEvent) => { if (!submittedRef.current) e.preventDefault(); };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("blur", onLeave);
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("blur", onLeave);
      window.removeEventListener("beforeunload", onBeforeUnload);
    };
  }, [phase]);

  if (loading || !info) {
    return <div className="skeleton" style={{ maxWidth: 760, margin: "0 auto", height: 240, borderRadius: 16 }} />;
  }

  const backToCourse = () => (info.content ? router.push(`/courses/${info.content.course.slug}`) : router.back());

  // ==================== RESULT ====================
  if (phase === "result" && result) {
    return (
      <div style={{ maxWidth: 760, margin: "0 auto" }}>
        <div className="card" style={{ textAlign: "center", padding: 32, marginBottom: 20, border: `2px solid ${result.isPassed ? "var(--success)" : "var(--danger)"}` }}>
          <div style={{ fontSize: 52, marginBottom: 8 }}>{result.isPassed ? "🎉" : "📝"}</div>
          <h2 style={{ fontSize: 22, fontWeight: 800, marginBottom: 8, color: result.isPassed ? "var(--success)" : "var(--danger)" }}>
            {result.isPassed ? "You passed!" : "You didn't pass this time"}
          </h2>
          <div style={{ fontSize: 40, fontWeight: 800 }}>{result.score.toFixed(1)}%</div>
          <div style={{ color: "var(--gray-500)", marginTop: 4 }}>
            {result.earnedPoints}/{result.totalPoints} marks · passing score {result.passingScore}% · time {fmtDuration(result.timeTaken)}
          </div>
          {result.autoSubmitted && <div className="badge badge-gray" style={{ marginTop: 10 }}>Auto-submitted when time ran out</div>}
          <div style={{ display: "flex", gap: 10, justifyContent: "center", marginTop: 20, flexWrap: "wrap" }}>
            <button className="btn btn-secondary" onClick={backToCourse}><ArrowLeft size={16} /> Back to course</button>
            {result.attemptsLeft > 0 && !result.isPassed && (
              <button className="btn btn-primary" onClick={() => { setPhase("info"); setResult(null); loadInfo(); }}>
                Try again ({result.attemptsLeft} left)
              </button>
            )}
          </div>
        </div>

        {result.review && (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <h3 style={{ fontSize: 16, fontWeight: 700 }}>Answer review</h3>
            {result.review.map((r, i) => (
              <div key={r.questionId} className="card" style={{ padding: 18, borderLeft: `4px solid ${r.isCorrect ? "var(--success)" : "var(--danger)"}` }}>
                <div style={{ fontWeight: 600, marginBottom: 10, display: "flex", gap: 8 }}>
                  {r.isCorrect ? <CheckCircle size={18} color="var(--success)" /> : <XCircle size={18} color="var(--danger)" />}
                  Q{i + 1}. {r.text}
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {r.options.map((o, oi) => {
                    const isCorrect = oi === r.correct;
                    const isChosen = oi === r.selected;
                    return (
                      <div
                        key={oi}
                        style={{
                          fontSize: 14, padding: "8px 12px", borderRadius: 8,
                          background: isCorrect ? "var(--success-light, #dcfce7)" : isChosen ? "var(--danger-light, #fee2e2)" : "var(--gray-50)",
                        }}
                      >
                        <strong>{letter(oi)}.</strong> {o}
                        {isCorrect && <span style={{ marginLeft: 8, fontSize: 12, color: "var(--success)" }}>✓ correct</span>}
                        {isChosen && !isCorrect && <span style={{ marginLeft: 8, fontSize: 12, color: "var(--danger)" }}>your answer</span>}
                      </div>
                    );
                  })}
                  {r.selected === null && <div style={{ fontSize: 12, color: "var(--gray-500)" }}>Not answered</div>}
                </div>
                {r.explanation && <div style={{ fontSize: 13, color: "var(--gray-600)", marginTop: 10 }}>💡 {r.explanation}</div>}
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  // ==================== EXAM ====================
  if (phase === "exam") {
    const q = questions[current];
    const answeredCount = questions.filter((x) => answers[x.id] !== undefined).length;
    const unanswered = questions.length - answeredCount;
    const lowTime = timeLeft !== null && timeLeft <= 60;

    return (
      <div style={{ maxWidth: 1000, margin: "0 auto" }}>
        {/* Top bar */}
        <div
          className="card"
          style={{ padding: "12px 20px", marginBottom: 16, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, position: "sticky", top: 72, zIndex: 10, flexWrap: "wrap" }}
        >
          <div>
            <div style={{ fontWeight: 700 }}>{info.title}</div>
            <div style={{ fontSize: 12, color: "var(--gray-500)" }}>
              {answeredCount}/{questions.length} answered ·{" "}
              {saveState === "saving" ? "saving…" : saveState === "error" ? <span style={{ color: "var(--danger)" }}>not saved — check connection</span> : "all changes saved"}
              {tabSwitches > 0 && <span style={{ color: "var(--danger)" }}> · {tabSwitches} tab switch{tabSwitches > 1 ? "es" : ""} recorded</span>}
            </div>
          </div>
          {timeLeft !== null && (
            <div
              style={{
                display: "flex", alignItems: "center", gap: 6, fontWeight: 800, fontSize: 20, fontVariantNumeric: "tabular-nums",
                color: lowTime ? "var(--danger)" : timeLeft <= 300 ? "var(--warning)" : "var(--gray-800)",
              }}
            >
              <Clock size={18} /> {fmtClock(timeLeft)}
            </div>
          )}
          <button className="btn btn-primary" onClick={() => setShowConfirm(true)} disabled={submitting}>
            <Send size={15} /> Submit
          </button>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) 240px", gap: 16, alignItems: "start" }} className="quiz-exam-grid">
          {/* Question */}
          <div className="card" style={{ padding: 24 }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 12, fontSize: 13, color: "var(--gray-500)" }}>
              <span>Question {current + 1} of {questions.length}</span>
              <span>{q.points} mark{q.points !== 1 ? "s" : ""}</span>
            </div>
            <div style={{ fontSize: 17, fontWeight: 600, lineHeight: 1.5, marginBottom: 20, whiteSpace: "pre-wrap" }}>{q.text}</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {q.options.map((o, pos) => {
                const selected = answers[q.id] === o.index;
                return (
                  <label
                    key={o.index}
                    style={{
                      display: "flex", alignItems: "center", gap: 12, padding: "12px 16px", borderRadius: "var(--radius-md)", cursor: "pointer",
                      border: `2px solid ${selected ? "var(--primary)" : "var(--border-color)"}`,
                      background: selected ? "var(--primary-50)" : "white", fontSize: 15, transition: "all 0.15s",
                    }}
                  >
                    <input
                      type="radio"
                      name={q.id}
                      checked={selected}
                      onChange={() => setAnswers((a) => ({ ...a, [q.id]: o.index }))}
                      style={{ accentColor: "var(--primary)", width: 18, height: 18 }}
                    />
                    <strong>{letter(pos)}.</strong> {o.text}
                  </label>
                );
              })}
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 24, gap: 8, flexWrap: "wrap" }}>
              <button className="btn btn-secondary" onClick={() => setCurrent((c) => c - 1)} disabled={current === 0}>
                <ChevronLeft size={16} /> Previous
              </button>
              <div style={{ display: "flex", gap: 8 }}>
                {answers[q.id] !== undefined && (
                  <button
                    className="btn btn-ghost"
                    onClick={() => setAnswers((a) => { const { [q.id]: _, ...rest } = a; return rest; })}
                  >
                    Clear
                  </button>
                )}
                <button
                  className="btn btn-ghost"
                  style={{ color: flagged.has(q.id) ? "var(--warning)" : undefined }}
                  onClick={() => setFlagged((f) => { const n = new Set(f); if (n.has(q.id)) n.delete(q.id); else n.add(q.id); return n; })}
                >
                  <Flag size={15} /> {flagged.has(q.id) ? "Marked" : "Mark for review"}
                </button>
              </div>
              {current < questions.length - 1 ? (
                <button className="btn btn-primary" onClick={() => setCurrent((c) => c + 1)}>
                  Next <ChevronRight size={16} />
                </button>
              ) : (
                <button className="btn btn-success" onClick={() => setShowConfirm(true)}>
                  Finish <Send size={15} />
                </button>
              )}
            </div>
          </div>

          {/* Palette */}
          <div className="card" style={{ padding: 16 }}>
            <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 10 }}>Questions</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 6 }}>
              {questions.map((x, i) => {
                const done = answers[x.id] !== undefined;
                const isFlagged = flagged.has(x.id);
                return (
                  <button
                    key={x.id}
                    onClick={() => setCurrent(i)}
                    style={{
                      height: 34, borderRadius: 8, fontWeight: 600, fontSize: 13, cursor: "pointer",
                      border: i === current ? "2px solid var(--gray-900)" : "1px solid var(--border-color)",
                      background: isFlagged ? "var(--warning)" : done ? "var(--primary)" : "white",
                      color: isFlagged || done ? "white" : "var(--gray-600)",
                    }}
                  >
                    {i + 1}
                  </button>
                );
              })}
            </div>
            <div style={{ fontSize: 12, color: "var(--gray-500)", marginTop: 12, display: "flex", flexDirection: "column", gap: 4 }}>
              <span><span style={{ display: "inline-block", width: 10, height: 10, borderRadius: 3, background: "var(--primary)", marginRight: 6 }} />Answered</span>
              <span><span style={{ display: "inline-block", width: 10, height: 10, borderRadius: 3, background: "var(--warning)", marginRight: 6 }} />Marked for review</span>
              <span><span style={{ display: "inline-block", width: 10, height: 10, borderRadius: 3, border: "1px solid var(--border-color)", marginRight: 6 }} />Not answered</span>
            </div>
          </div>
        </div>

        <style>{`@media (max-width: 800px) { .quiz-exam-grid { grid-template-columns: 1fr !important; } }`}</style>

        {showConfirm && (
          <div className="modal-overlay" onClick={() => setShowConfirm(false)}>
            <div className="modal" style={{ maxWidth: 420 }} onClick={(e) => e.stopPropagation()}>
              <div className="modal-header"><h2 className="modal-title">Submit quiz?</h2></div>
              <div className="modal-body">
                <p style={{ margin: 0 }}>You answered <strong>{answeredCount}</strong> of {questions.length} questions.</p>
                {unanswered > 0 && (
                  <div className="alert alert-warning" style={{ marginTop: 12 }}>
                    <AlertTriangle size={16} /> {unanswered} question{unanswered > 1 ? "s are" : " is"} unanswered and will score 0.
                  </div>
                )}
                {flagged.size > 0 && <p style={{ fontSize: 13, color: "var(--gray-500)" }}>{flagged.size} marked for review.</p>}
                <p style={{ fontSize: 13, color: "var(--gray-500)", marginBottom: 0 }}>You can&apos;t change your answers after submitting.</p>
              </div>
              <div className="modal-footer">
                <button className="btn btn-secondary" onClick={() => setShowConfirm(false)}>Keep working</button>
                <button className="btn btn-primary" onClick={() => submit(false)} disabled={submitting}>
                  {submitting ? "Submitting…" : "Submit now"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ==================== INFO / INSTRUCTIONS ====================
  const canStart = info.inProgressAttemptId !== null || info.attemptsLeft > 0;

  return (
    <div style={{ maxWidth: 760, margin: "0 auto" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
        <button className="btn btn-ghost btn-icon" onClick={backToCourse}><ArrowLeft size={20} /></button>
        <div>
          {info.content && <div style={{ fontSize: 12, color: "var(--gray-400)" }}>{info.content.course.title}</div>}
          <h1 className="page-title" style={{ margin: 0 }}>{info.title}</h1>
        </div>
      </div>

      <div className="card">
        <div className="card-body">
          {info.description && <p style={{ color: "var(--gray-600)", lineHeight: 1.7, marginTop: 0, whiteSpace: "pre-wrap" }}>{info.description}</p>}

          <div className="grid-2" style={{ marginBottom: 20 }}>
            {[
              ["Questions", info.questionCount],
              ["Total Marks", info.totalPoints],
              ["Time Limit", info.timeLimit ? `${info.timeLimit} minutes` : "No limit"],
              ["Passing Score", `${info.passingScore}%`],
              ["Attempts", `${info.attemptsUsed} used of ${info.maxAttempts}`],
              ["Best Score", info.bestScore !== null ? `${info.bestScore.toFixed(1)}%` : "—"],
            ].map(([label, value]) => (
              <div key={String(label)} style={{ background: "var(--gray-50)", borderRadius: "var(--radius-md)", padding: "12px 16px" }}>
                <div style={{ fontSize: 12, color: "var(--gray-400)", marginBottom: 2 }}>{label}</div>
                <div style={{ fontSize: 17, fontWeight: 700 }}>{value}</div>
              </div>
            ))}
          </div>

          <div style={{ background: "var(--gray-50)", borderRadius: "var(--radius-md)", padding: "14px 18px", marginBottom: 20, fontSize: 14 }}>
            <div style={{ fontWeight: 700, marginBottom: 6 }}>Rules</div>
            <ul style={{ margin: 0, paddingLeft: 18, lineHeight: 1.8, color: "var(--gray-600)" }}>
              {info.timeLimit && <li>The timer starts when you click Start and keeps running even if you close or refresh the page.</li>}
              {info.timeLimit && <li>The quiz is submitted automatically when time runs out.</li>}
              <li>Your answers are saved automatically as you go.</li>
              <li>Switching tabs or windows is recorded and visible to your instructor.</li>
              <li>Each question has one correct answer. Unanswered questions score 0.</li>
              <li>Starting the quiz uses one of your {info.maxAttempts} attempt{info.maxAttempts > 1 ? "s" : ""}.</li>
            </ul>
          </div>

          {info.hasPassed && <div className="alert alert-success" style={{ marginBottom: 16 }}>✅ You have already passed this quiz.</div>}

          {info.inProgressAttemptId ? (
            <button className="btn btn-primary btn-lg w-full" style={{ justifyContent: "center" }} onClick={startExam} disabled={starting}>
              {starting ? "Loading…" : "Resume Quiz →"}
            </button>
          ) : canStart ? (
            <button className="btn btn-primary btn-lg w-full" style={{ justifyContent: "center" }} onClick={startExam} disabled={starting}>
              {starting ? "Starting…" : info.attemptsUsed > 0 ? "Retake Quiz →" : "Start Quiz →"}
            </button>
          ) : (
            <div className="alert alert-warning">⚠️ You have used all allowed attempts for this quiz.</div>
          )}
        </div>
      </div>

      {info.attempts.length > 0 && (
        <div className="card" style={{ marginTop: 16 }}>
          <div className="card-header"><span className="card-title">Your attempts</span></div>
          <div className="table-container" style={{ border: "none" }}>
            <table>
              <thead><tr><th>#</th><th>Score</th><th>Result</th><th>Time</th><th>Submitted</th></tr></thead>
              <tbody>
                {info.attempts.map((a, i) => (
                  <tr key={a.id}>
                    <td>{info.attempts.length - i}</td>
                    <td>{a.score.toFixed(1)}% ({a.earnedPoints}/{a.totalPoints})</td>
                    <td><span className={`badge ${a.isPassed ? "badge-success" : "badge-danger"}`}>{a.isPassed ? "Passed" : "Failed"}</span></td>
                    <td>{fmtDuration(a.timeTaken)}</td>
                    <td style={{ fontSize: 13 }}>{new Date(a.completedAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

export default function AssessmentPage() {
  return (
    <AppLayout>
      <LearnerContentProtection>
        <Suspense fallback={<div className="skeleton" style={{ maxWidth: 760, margin: "0 auto", height: 240, borderRadius: 16 }} />}>
          <AssessmentInner />
        </Suspense>
      </LearnerContentProtection>
    </AppLayout>
  );
}
