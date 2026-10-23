"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import AppLayout from "@/components/layout/AppLayout";
import { quizAPI } from "@/lib/api";
import { isAxiosError } from "axios";
import toast from "react-hot-toast";
import { Plus, HelpCircle, Clock, Trash2, Edit } from "lucide-react";

interface Quiz {
  id: string;
  title: string;
  description?: string | null;
  timeLimit?: number | null;
  passingScore: number;
  maxAttempts: number;
  isPublished: boolean;
  totalPoints: number;
  submittedAttempts: number;
  createdAt: string;
  _count: { questions: number; contents: number };
}

const errMsg = (err: unknown, fallback: string) =>
  (isAxiosError<{ message?: string }>(err) && err.response?.data?.message) || fallback;

export default function AdminQuizzesPage() {
  const router = useRouter();
  const [quizzes, setQuizzes] = useState<Quiz[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ title: "", description: "", timeLimit: "30", passingScore: "60", maxAttempts: "1" });
  const [saving, setSaving] = useState(false);

  const load = () => {
    return quizAPI.list()
      .then((res) => {
        setQuizzes(res.data.data);
      })
      .catch(() => {
        toast.error("Failed to load quizzes.");
      })
      .finally(() => {
        setLoading(false);
      });
  };

  useEffect(() => { load(); }, []);

  const handleCreate = async () => {
    if (!form.title.trim()) return toast.error("Quiz name is required.");
    setSaving(true);
    try {
      const res = await quizAPI.create(form);
      toast.success("Quiz created. Now add questions.");
      router.push(`/admin/quizzes/${res.data.data.id}`);
    } catch (err) {
      toast.error(errMsg(err, "Failed to create quiz."));
      setSaving(false);
    }
  };

  const handleDelete = async (q: Quiz) => {
    const usage = q._count.contents ? ` It is used in ${q._count.contents} course lesson(s), which will be unlinked.` : "";
    if (!confirm(`Delete quiz "${q.title}" and all its attempts?${usage}`)) return;
    try {
      await quizAPI.delete(q.id);
      toast.success("Quiz deleted.");
      load();
    } catch (err) {
      toast.error(errMsg(err, "Failed to delete quiz."));
    }
  };

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  return (
    <AppLayout requiredRole="ADMIN">
      <div className="page-header">
        <div>
          <h1 className="page-title">Quizzes</h1>
          <p className="page-subtitle">Create MCQ quizzes here, then attach them to course sections as a Quiz lesson</p>
        </div>
        <div className="page-actions">
          <button className="btn btn-primary" onClick={() => setShowCreate(true)}>
            <Plus size={16} /> Create Quiz
          </button>
        </div>
      </div>

      {loading ? (
        <div className="card" style={{ padding: 24 }}>
          <div className="skeleton" style={{ height: 18, width: "60%", marginBottom: 12 }} />
          <div className="skeleton" style={{ height: 18, width: "40%" }} />
        </div>
      ) : quizzes.length === 0 ? (
        <div className="card">
          <div className="empty-state" style={{ padding: "64px 24px" }}>
            <div className="empty-state-icon">🎯</div>
            <div className="empty-state-title">No quizzes yet</div>
            <div className="empty-state-text">Create your first MCQ quiz, then add it to a course section.</div>
            <button className="btn btn-primary" onClick={() => setShowCreate(true)}>
              <Plus size={16} /> Create Quiz
            </button>
          </div>
        </div>
      ) : (
        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>Quiz</th>
                <th>Questions</th>
                <th>Time Limit</th>
                <th>Pass %</th>
                <th>Attempts Allowed</th>
                <th>Used In</th>
                <th>Submissions</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {quizzes.map((q) => (
                <tr key={q.id}>
                  <td>
                    <Link href={`/admin/quizzes/${q.id}`} style={{ fontWeight: 600, color: "var(--gray-900)", display: "flex", alignItems: "center", gap: 8 }}>
                      <HelpCircle size={16} color="var(--primary)" /> {q.title}
                    </Link>
                  </td>
                  <td>{q._count.questions} <span style={{ color: "var(--gray-400)", fontSize: 12 }}>({q.totalPoints} pts)</span></td>
                  <td>{q.timeLimit ? <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}><Clock size={13} /> {q.timeLimit} min</span> : "No limit"}</td>
                  <td>{q.passingScore}%</td>
                  <td>{q.maxAttempts}</td>
                  <td>{q._count.contents} lesson{q._count.contents !== 1 ? "s" : ""}</td>
                  <td>{q.submittedAttempts}</td>
                  <td>
                    <span className={`badge ${q.isPublished ? "badge-success" : "badge-warning"}`}>
                      {q.isPublished ? "Published" : "Draft"}
                    </span>
                  </td>
                  <td style={{ whiteSpace: "nowrap" }}>
                    <Link href={`/admin/quizzes/${q.id}`}>
                      <button className="btn btn-ghost btn-icon btn-sm" title="Edit"><Edit size={14} /></button>
                    </Link>
                    <button className="btn btn-ghost btn-icon btn-sm" title="Delete" onClick={() => handleDelete(q)}>
                      <Trash2 size={14} color="var(--danger)" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showCreate && (
        <div className="modal-overlay" onClick={() => setShowCreate(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title">Create Quiz</h2>
              <button className="btn btn-ghost btn-icon" onClick={() => setShowCreate(false)}>✕</button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label className="form-label">Quiz Name *</label>
                <input className="form-control" value={form.title} onChange={set("title")} placeholder="e.g. HTML Basics – Quiz 1" autoFocus />
              </div>
              <div className="form-group">
                <label className="form-label">Instructions</label>
                <textarea className="form-control" rows={3} value={form.description} onChange={set("description")} placeholder="Shown to students before they start" />
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
                <div className="form-group">
                  <label className="form-label">Time Limit (min)</label>
                  <input type="number" min={0} className="form-control" value={form.timeLimit} onChange={set("timeLimit")} />
                  <div className="form-hint">0 = no limit</div>
                </div>
                <div className="form-group">
                  <label className="form-label">Pass %</label>
                  <input type="number" min={0} max={100} className="form-control" value={form.passingScore} onChange={set("passingScore")} />
                </div>
                <div className="form-group">
                  <label className="form-label">Attempts</label>
                  <input type="number" min={1} className="form-control" value={form.maxAttempts} onChange={set("maxAttempts")} />
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowCreate(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleCreate} disabled={saving}>
                {saving ? "Creating…" : "Create & Add Questions"}
              </button>
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  );
}
