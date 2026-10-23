"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import AppLayout from "@/components/layout/AppLayout";
import { quizAPI } from "@/lib/api";
import { isAxiosError } from "axios";
import toast from "react-hot-toast";
import { ArrowLeft, Plus, Trash2, Edit, Save, CheckCircle, ToggleLeft, ToggleRight, X, Upload } from "lucide-react";
import QuizImportModal from "@/components/quiz/QuizImportModal";
import QuizAnalytics from "@/components/quiz/QuizAnalytics";

interface Question {
  id: string;
  text: string;
  options: string[];
  correctAnswer: string;
  explanation?: string | null;
  points: number;
  order: number;
}

interface Quiz {
  id: string;
  title: string;
  description?: string | null;
  timeLimit?: number | null;
  passingScore: number;
  maxAttempts: number;
  shuffleQuestions: boolean;
  shuffleOptions: boolean;
  showResultsAfter: boolean;
  isPublished: boolean;
  questions: Question[];
  contents: { id: string; title: string; section: { title: string; course: { id: string; title: string } } }[];
}

interface Attempt {
  id: string;
  score: string | number;
  isPassed: boolean;
  earnedPoints: number;
  totalPoints: number;
  tabSwitches: number;
  autoSubmitted: boolean;
  timeTaken?: number | null;
  completedAt: string;
  user: { firstName: string; lastName: string; email: string };
}

const emptyQuestion = { text: "", options: ["", "", "", ""], correctAnswer: -1, explanation: "", points: "1" };
type QuestionForm = typeof emptyQuestion;

const errMsg = (err: unknown, fallback: string) =>
  (isAxiosError<{ message?: string }>(err) && err.response?.data?.message) || fallback;

const fmtDuration = (s?: number | null) => (s == null ? "—" : `${Math.floor(s / 60)}m ${s % 60}s`);
const letter = (i: number) => String.fromCharCode(65 + i);

export default function QuizEditorPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [quiz, setQuiz] = useState<Quiz | null>(null);
  const [tab, setTab] = useState<"questions" | "settings" | "results">("questions");
  const [settings, setSettings] = useState({
    title: "", description: "", timeLimit: "", passingScore: "60", maxAttempts: "1",
    shuffleQuestions: false, shuffleOptions: false, showResultsAfter: true,
  });
  const [savingSettings, setSavingSettings] = useState(false);
  const [editingId, setEditingId] = useState<string | "new" | null>(null);
  const [qForm, setQForm] = useState<QuestionForm>(emptyQuestion);
  const [savingQ, setSavingQ] = useState(false);
  const [attempts, setAttempts] = useState<Attempt[] | null>(null);
  const [showImport, setShowImport] = useState(false);

  const load = () => {
    return quizAPI.get(id)
      .then((res) => {
        const q: Quiz = res.data.data;
        setQuiz(q);
        setSettings({
          title: q.title,
          description: q.description || "",
          timeLimit: q.timeLimit ? String(q.timeLimit) : "",
          passingScore: String(q.passingScore),
          maxAttempts: String(q.maxAttempts),
          shuffleQuestions: q.shuffleQuestions,
          shuffleOptions: q.shuffleOptions,
          showResultsAfter: q.showResultsAfter,
        });
      })
      .catch(() => {
        toast.error("Quiz not found.");
        router.push("/admin/quizzes");
      });
  };

  useEffect(() => { if (id) load(); }, [id]);

  useEffect(() => {
    if (tab === "results" && attempts === null) {
      quizAPI.attempts(id).then((res) => setAttempts(res.data.data)).catch(() => setAttempts([]));
    }
  }, [tab]);

  const saveSettings = async () => {
    setSavingSettings(true);
    try {
      await quizAPI.update(id, { ...settings, timeLimit: settings.timeLimit || "0" });
      toast.success("Settings saved.");
      load();
    } catch (err) {
      toast.error(errMsg(err, "Failed to save settings."));
    } finally {
      setSavingSettings(false);
    }
  };

  const togglePublish = async () => {
    if (!quiz) return;
    try {
      await quizAPI.update(id, { isPublished: !quiz.isPublished });
      toast.success(quiz.isPublished ? "Quiz unpublished." : "Quiz published.");
      load();
    } catch (err) {
      toast.error(errMsg(err, "Failed to update quiz."));
    }
  };

  const startNew = () => { setEditingId("new"); setQForm({ ...emptyQuestion, options: ["", "", "", ""] }); };
  const startEdit = (q: Question) => {
    setEditingId(q.id);
    setQForm({
      text: q.text,
      options: [...q.options],
      correctAnswer: Number(q.correctAnswer),
      explanation: q.explanation || "",
      points: String(q.points),
    });
  };

  const saveQuestion = async () => {
    if (!qForm.text.trim()) return toast.error("Enter the question.");
    if (qForm.options.some((o) => !o.trim())) return toast.error("Fill in every option or remove empty ones.");
    if (qForm.correctAnswer < 0) return toast.error("Mark the correct option.");
    setSavingQ(true);
    try {
      if (editingId === "new") await quizAPI.addQuestion(id, qForm);
      else if (editingId) await quizAPI.updateQuestion(editingId, qForm);
      toast.success("Question saved.");
      setEditingId(null);
      load();
    } catch (err) {
      toast.error(errMsg(err, "Failed to save question."));
    } finally {
      setSavingQ(false);
    }
  };

  const deleteQuestion = async (qid: string) => {
    if (!confirm("Delete this question?")) return;
    try {
      await quizAPI.deleteQuestion(qid);
      load();
    } catch (err) {
      toast.error(errMsg(err, "Failed to delete question."));
    }
  };

  const setOption = (i: number, v: string) => setQForm((f) => ({ ...f, options: f.options.map((o, j) => (j === i ? v : o)) }));
  const addOption = () => setQForm((f) => (f.options.length >= 6 ? f : { ...f, options: [...f.options, ""] }));
  const removeOption = (i: number) =>
    setQForm((f) => {
      if (f.options.length <= 2) return f;
      const correct = f.correctAnswer === i ? -1 : f.correctAnswer > i ? f.correctAnswer - 1 : f.correctAnswer;
      return { ...f, options: f.options.filter((_, j) => j !== i), correctAnswer: correct };
    });

  if (!quiz) {
    return (
      <AppLayout requiredRole="ADMIN">
        <div className="skeleton" style={{ height: 200, borderRadius: 16 }} />
      </AppLayout>
    );
  }

  const totalPoints = quiz.questions.reduce((s, q) => s + q.points, 0);

  const questionEditor = (
    <div className="card" style={{ padding: 20, border: "2px solid var(--primary-light)" }}>
      <div className="form-group">
        <label className="form-label">Question *</label>
        <textarea className="form-control" rows={2} value={qForm.text} onChange={(e) => setQForm({ ...qForm, text: e.target.value })} autoFocus />
      </div>
      <label className="form-label">Options * <span style={{ fontWeight: 400, color: "var(--gray-400)" }}>(select the correct one)</span></label>
      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 12 }}>
        {qForm.options.map((opt, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <input
              type="radio"
              name="correct"
              checked={qForm.correctAnswer === i}
              onChange={() => setQForm({ ...qForm, correctAnswer: i })}
              style={{ accentColor: "var(--success)", width: 18, height: 18 }}
              title="Mark as correct"
            />
            <span style={{ fontWeight: 600, width: 18 }}>{letter(i)}</span>
            <input
              className="form-control"
              value={opt}
              onChange={(e) => setOption(i, e.target.value)}
              placeholder={`Option ${letter(i)}`}
              style={qForm.correctAnswer === i ? { borderColor: "var(--success)" } : undefined}
            />
            <button className="btn btn-ghost btn-icon btn-sm" onClick={() => removeOption(i)} disabled={qForm.options.length <= 2} title="Remove option">
              <X size={14} />
            </button>
          </div>
        ))}
        {qForm.options.length < 6 && (
          <button className="btn btn-ghost btn-sm" style={{ alignSelf: "flex-start", color: "var(--primary)" }} onClick={addOption}>
            <Plus size={14} /> Add option
          </button>
        )}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 120px", gap: 12 }}>
        <div className="form-group">
          <label className="form-label">Explanation (shown after submission)</label>
          <input className="form-control" value={qForm.explanation} onChange={(e) => setQForm({ ...qForm, explanation: e.target.value })} />
        </div>
        <div className="form-group">
          <label className="form-label">Marks</label>
          <input type="number" min={1} className="form-control" value={qForm.points} onChange={(e) => setQForm({ ...qForm, points: e.target.value })} />
        </div>
      </div>
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
        <button className="btn btn-secondary btn-sm" onClick={() => setEditingId(null)}>Cancel</button>
        <button className="btn btn-primary btn-sm" onClick={saveQuestion} disabled={savingQ}>
          <Save size={14} /> {savingQ ? "Saving…" : "Save Question"}
        </button>
      </div>
    </div>
  );

  return (
    <AppLayout requiredRole="ADMIN">
      <div className="page-header">
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <button className="btn btn-ghost btn-icon" onClick={() => router.push("/admin/quizzes")}>
            <ArrowLeft size={20} />
          </button>
          <div>
            <h1 className="page-title">{quiz.title}</h1>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4, fontSize: 13, color: "var(--gray-500)" }}>
              <span className={`badge ${quiz.isPublished ? "badge-success" : "badge-warning"}`}>{quiz.isPublished ? "Published" : "Draft"}</span>
              {quiz.questions.length} questions · {totalPoints} marks · {quiz.timeLimit ? `${quiz.timeLimit} min` : "no time limit"} · pass {quiz.passingScore}%
            </div>
          </div>
        </div>
        <div className="page-actions">
          <button className={`btn ${quiz.isPublished ? "btn-secondary" : "btn-success"}`} onClick={togglePublish}>
            {quiz.isPublished ? <><ToggleRight size={16} /> Unpublish</> : <><ToggleLeft size={16} /> Publish Quiz</>}
          </button>
        </div>
      </div>

      {!quiz.isPublished && (
        <div className="alert alert-warning" style={{ marginBottom: 16 }}>
          Draft quizzes can be attached to courses, but students can&apos;t open them until you publish.
        </div>
      )}

      <div className="tabs">
        {(["questions", "settings", "results"] as const).map((t) => (
          <div key={t} className={`tab ${tab === t ? "active" : ""}`} onClick={() => setTab(t)}>
            {t === "questions" ? `Questions (${quiz.questions.length})` : t === "settings" ? "Settings & Rules" : "Student Results"}
          </div>
        ))}
      </div>

      {tab === "questions" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div className="card" style={{ padding: 16, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
            <div style={{ fontSize: 14, color: "var(--gray-600)" }}>
              Add questions one by one, or import many at once from a Word / text document.
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button className="btn btn-secondary" onClick={() => setShowImport(true)}>
                <Upload size={16} /> Upload Document
              </button>
              <button className="btn btn-primary" onClick={startNew} disabled={editingId !== null}>
                <Plus size={16} /> Add Question
              </button>
            </div>
          </div>
          {quiz.questions.length === 0 && editingId !== "new" && (
            <div className="card">
              <div className="empty-state" style={{ padding: "40px 24px" }}>
                <div className="empty-state-icon">📝</div>
                <div className="empty-state-title">No questions yet</div>
                <div className="empty-state-text">Upload a document in the sample format, or add questions individually.</div>
              </div>
            </div>
          )}
          {quiz.questions.map((q, i) =>
            editingId === q.id ? (
              <div key={q.id}>{questionEditor}</div>
            ) : (
              <div key={q.id} className="card" style={{ padding: 20 }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                  <div style={{ fontWeight: 600, fontSize: 15 }}>
                    Q{i + 1}. {q.text}
                    <span style={{ fontWeight: 400, fontSize: 12, color: "var(--gray-400)", marginLeft: 8 }}>
                      {q.points} mark{q.points !== 1 ? "s" : ""}
                    </span>
                  </div>
                  <div style={{ whiteSpace: "nowrap" }}>
                    <button className="btn btn-ghost btn-icon btn-sm" onClick={() => startEdit(q)} title="Edit"><Edit size={14} /></button>
                    <button className="btn btn-ghost btn-icon btn-sm" onClick={() => deleteQuestion(q.id)} title="Delete">
                      <Trash2 size={14} color="var(--danger)" />
                    </button>
                  </div>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, marginTop: 10 }}>
                  {q.options.map((o, oi) => {
                    const correct = String(oi) === q.correctAnswer;
                    return (
                      <div
                        key={oi}
                        style={{
                          fontSize: 13,
                          padding: "6px 10px",
                          borderRadius: 8,
                          background: correct ? "var(--success-light, #dcfce7)" : "var(--gray-50)",
                          display: "flex",
                          alignItems: "center",
                          gap: 6,
                        }}
                      >
                        <strong>{letter(oi)}.</strong> {o}
                        {correct && <CheckCircle size={14} color="var(--success)" style={{ marginLeft: "auto" }} />}
                      </div>
                    );
                  })}
                </div>
                {q.explanation && (
                  <div style={{ fontSize: 12, color: "var(--gray-500)", marginTop: 8 }}>💡 {q.explanation}</div>
                )}
              </div>
            )
          )}

          {editingId === "new" && questionEditor}
        </div>
      )}

      {showImport && <QuizImportModal quizId={id} onClose={() => setShowImport(false)} onImported={load} />}

      {tab === "settings" && (
        <div className="card">
          <div className="card-body">
            <div className="form-group">
              <label className="form-label">Quiz Name *</label>
              <input className="form-control" value={settings.title} onChange={(e) => setSettings({ ...settings, title: e.target.value })} />
            </div>
            <div className="form-group">
              <label className="form-label">Instructions</label>
              <textarea className="form-control" rows={3} value={settings.description} onChange={(e) => setSettings({ ...settings, description: e.target.value })} />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
              <div className="form-group">
                <label className="form-label">Time Limit (minutes)</label>
                <input type="number" min={0} className="form-control" value={settings.timeLimit} placeholder="No limit" onChange={(e) => setSettings({ ...settings, timeLimit: e.target.value })} />
                <div className="form-hint">Auto-submits when time runs out. Leave empty for no limit.</div>
              </div>
              <div className="form-group">
                <label className="form-label">Passing Score (%)</label>
                <input type="number" min={0} max={100} className="form-control" value={settings.passingScore} onChange={(e) => setSettings({ ...settings, passingScore: e.target.value })} />
              </div>
              <div className="form-group">
                <label className="form-label">Max Attempts</label>
                <input type="number" min={1} className="form-control" value={settings.maxAttempts} onChange={(e) => setSettings({ ...settings, maxAttempts: e.target.value })} />
              </div>
            </div>
            {([
              ["shuffleQuestions", "Shuffle question order for each attempt"],
              ["shuffleOptions", "Shuffle option order for each attempt"],
              ["showResultsAfter", "Show correct answers & explanations after submission"],
            ] as const).map(([key, label]) => (
              <label key={key} style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 14, marginBottom: 10, cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={settings[key]}
                  onChange={(e) => setSettings({ ...settings, [key]: e.target.checked })}
                  style={{ width: 16, height: 16, accentColor: "var(--primary)" }}
                />
                {label}
              </label>
            ))}
            <div className="form-hint" style={{ marginBottom: 16 }}>
              Always on: timer enforced by the server (survives refresh), answers autosaved, tab/window switches recorded, copy &amp; right-click blocked.
            </div>
            <button className="btn btn-primary" onClick={saveSettings} disabled={savingSettings}>
              <Save size={16} /> {savingSettings ? "Saving…" : "Save Settings"}
            </button>
          </div>
          <div className="card-footer">
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>Used in course lessons</div>
            {quiz.contents.length === 0 ? (
              <div style={{ fontSize: 13, color: "var(--gray-500)" }}>
                Not attached yet. Open a course → section → Add Content → Quiz, and pick this quiz.
              </div>
            ) : (
              <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13 }}>
                {quiz.contents.map((c) => (
                  <li key={c.id}>
                    <a href={`/admin/courses/${c.section.course.id}`} style={{ color: "var(--primary)" }}>{c.section.course.title}</a>
                    {" → "}{c.section.title}{" → "}{c.title}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      {tab === "results" && (
        attempts === null ? (
          <div className="skeleton" style={{ height: 120, borderRadius: 12 }} />
        ) : attempts.length === 0 ? (
          <div className="card">
            <div className="empty-state" style={{ padding: "48px 24px" }}>
              <div className="empty-state-icon">📊</div>
              <div className="empty-state-title">No submissions yet</div>
            </div>
          </div>
        ) : (
          <>
          <QuizAnalytics quizId={id} />
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th>Student</th>
                  <th>Score</th>
                  <th>Result</th>
                  <th>Time Taken</th>
                  <th>Tab Switches</th>
                  <th>Submitted</th>
                </tr>
              </thead>
              <tbody>
                {attempts.map((a) => (
                  <tr key={a.id}>
                    <td>
                      <div style={{ fontWeight: 600 }}>{a.user.firstName} {a.user.lastName}</div>
                      <div style={{ fontSize: 12, color: "var(--gray-400)" }}>{a.user.email}</div>
                    </td>
                    <td>{Number(a.score).toFixed(1)}% <span style={{ fontSize: 12, color: "var(--gray-400)" }}>({a.earnedPoints}/{a.totalPoints})</span></td>
                    <td><span className={`badge ${a.isPassed ? "badge-success" : "badge-danger"}`}>{a.isPassed ? "Passed" : "Failed"}</span></td>
                    <td>{fmtDuration(a.timeTaken)}{a.autoSubmitted && <span className="badge badge-gray" style={{ marginLeft: 6, fontSize: 10 }}>auto-submitted</span>}</td>
                    <td style={{ color: a.tabSwitches > 0 ? "var(--danger)" : undefined, fontWeight: a.tabSwitches > 0 ? 600 : undefined }}>{a.tabSwitches}</td>
                    <td style={{ fontSize: 13 }}>{new Date(a.completedAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          </>
        )
      )}
    </AppLayout>
  );
}
