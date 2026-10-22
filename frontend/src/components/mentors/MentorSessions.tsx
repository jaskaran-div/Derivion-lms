"use client";

import { useCallback, useEffect, useState } from "react";
import AppLayout from "@/components/layout/AppLayout";
import { mentorAPI, coursesAPI } from "@/lib/api";
import { Video, Calendar, Clock, User, ExternalLink, PlayCircle, Plus, Edit2, Trash2, Radio, BookOpen } from "lucide-react";

type Status = "LIVE" | "UPCOMING" | "PAST";

interface MentorSession {
  id: string;
  title: string;
  description?: string | null;
  mentorName: string;
  courseId: string;
  course?: { id: string; title: string };
  startTime: string;
  endTime: string;
  meetingLink?: string | null;
  recordingUrl?: string | null;
  resources?: string | null;
  status: Status;
}

interface Grouped {
  live: MentorSession[];
  upcoming: MentorSession[];
  past: MentorSession[];
}

const emptyForm = {
  title: "",
  description: "",
  mentorName: "",
  courseId: "",
  startTime: "",
  endTime: "",
  meetingLink: "",
  recordingUrl: "",
  resources: "",
};

// Convert ISO string to value for <input type="datetime-local"> in local time
const toLocalInput = (iso: string) => {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", year: "numeric" });
const formatTime = (iso: string) =>
  new Date(iso).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });

// Render plain text, turning URLs into clickable links
function Linkified({ text }: { text: string }) {
  const parts = text.split(/(https?:\/\/[^\s]+)/g);
  return (
    <span style={{ whiteSpace: "pre-wrap" }}>
      {parts.map((p, i) =>
        /^https?:\/\//.test(p) ? (
          <a key={i} href={p} target="_blank" rel="noopener noreferrer" style={{ color: "var(--primary)", wordBreak: "break-all" }}>
            {p}
          </a>
        ) : (
          p
        )
      )}
    </span>
  );
}

export default function MentorSessions({ canManage = false }: { canManage?: boolean }) {
  const [data, setData] = useState<Grouped>({ live: [], upcoming: [], past: [] });
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"live" | "upcoming" | "past">("upcoming");
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<MentorSession | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [courses, setCourses] = useState<{ id: string; title: string }[]>([]);

  useEffect(() => {
    if (!canManage) return;
    coursesAPI.adminGetAll({ limit: 500 }).then((res) => setCourses(res.data?.data?.courses || [])).catch(() => {});
  }, [canManage]);

  const load = useCallback(async (initial = false) => {
    try {
      const res = await mentorAPI.list();
      setData(res.data.data);
      if (initial && res.data.data.live.length > 0) setTab("live");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(true);
    const t = setInterval(() => load(), 60000); // keep live/upcoming status fresh
    return () => clearInterval(t);
  }, [load]);

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm);
    setError("");
    setShowModal(true);
  };

  const openEdit = (s: MentorSession) => {
    setEditing(s);
    setForm({
      title: s.title,
      description: s.description || "",
      mentorName: s.mentorName,
      courseId: s.courseId,
      startTime: toLocalInput(s.startTime),
      endTime: toLocalInput(s.endTime),
      meetingLink: s.meetingLink || "",
      recordingUrl: s.recordingUrl || "",
      resources: s.resources || "",
    });
    setError("");
    setShowModal(true);
  };

  const save = async () => {
    if (!form.title.trim() || !form.mentorName.trim() || !form.courseId || !form.startTime || !form.endTime) {
      setError("Title, course, mentor, start and end time are required.");
      return;
    }
    const payload = {
      ...form,
      startTime: new Date(form.startTime).toISOString(),
      endTime: new Date(form.endTime).toISOString(),
    };
    setSaving(true);
    setError("");
    try {
      if (editing) await mentorAPI.update(editing.id, payload);
      else await mentorAPI.create(payload);
      setShowModal(false);
      await load();
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { message?: string } } })?.response?.data?.message;
      setError(msg || "Failed to save session.");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (s: MentorSession) => {
    if (!confirm(`Delete session "${s.title}"?`)) return;
    await mentorAPI.delete(s.id);
    await load();
  };

  const list = data[tab];
  const tabs: { key: "live" | "upcoming" | "past"; label: string }[] = [
    { key: "live", label: `Live Now (${data.live.length})` },
    { key: "upcoming", label: `Upcoming (${data.upcoming.length})` },
    { key: "past", label: `Past (${data.past.length})` },
  ];

  const set = (k: keyof typeof emptyForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  return (
    <AppLayout>
      <div className="page-header">
        <div>
          <h1 className="page-title">Mentors</h1>
          <p className="page-subtitle">{canManage ? "Schedule live mentor sessions for a course — enrolled students are notified automatically" : "Live mentor sessions for your enrolled courses — join live, see what's coming up, and catch up on past sessions"}</p>
        </div>
        {canManage && (
          <button className="btn btn-primary" onClick={openCreate}>
            <Plus size={16} /> Add Session
          </button>
        )}
      </div>

      {data.live.length > 0 && tab !== "live" && (
        <div
          className="card"
          style={{ padding: 16, marginBottom: 20, display: "flex", alignItems: "center", gap: 12, borderLeft: "4px solid var(--danger, #ef4444)", cursor: "pointer" }}
          onClick={() => setTab("live")}
        >
          <Radio size={18} color="#ef4444" />
          <strong>{data.live.length} session{data.live.length > 1 ? "s are" : " is"} live right now.</strong>
          <span style={{ color: "var(--gray-500)" }}>Click to view</span>
        </div>
      )}

      <div className="tabs">
        {tabs.map((t) => (
          <div key={t.key} className={`tab ${tab === t.key ? "active" : ""}`} onClick={() => setTab(t.key)}>
            {t.label}
          </div>
        ))}
      </div>

      {loading ? (
        <div className="grid-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="card" style={{ padding: 24 }}>
              <div className="skeleton" style={{ height: 18, width: "70%", marginBottom: 12 }} />
              <div className="skeleton" style={{ height: 14, width: "50%", marginBottom: 8 }} />
              <div className="skeleton" style={{ height: 14, width: "40%" }} />
            </div>
          ))}
        </div>
      ) : list.length === 0 ? (
        <div className="card">
          <div className="empty-state" style={{ padding: "64px 24px" }}>
            <div className="empty-state-icon">🎥</div>
            <div className="empty-state-title">
              {tab === "live" ? "No session is live right now" : tab === "upcoming" ? "No upcoming sessions" : "No past sessions yet"}
            </div>
            <div className="empty-state-text">
              {tab === "past" ? "Recordings and notes from completed sessions will appear here." : "Check back soon for new mentor sessions."}
            </div>
          </div>
        </div>
      ) : (
        <div className="grid-3">
          {list.map((s) => (
            <div key={s.id} className="card" style={{ padding: 20, display: "flex", flexDirection: "column", gap: 10 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                <h3 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>{s.title}</h3>
                {s.status === "LIVE" ? (
                  <span className="badge badge-danger">● LIVE</span>
                ) : s.status === "UPCOMING" ? (
                  <span className="badge badge-blue">Upcoming</span>
                ) : (
                  <span className="badge badge-gray">Completed</span>
                )}
              </div>

              <div style={{ fontSize: 13, color: "var(--gray-600)", display: "flex", flexDirection: "column", gap: 4 }}>
                {s.course && <span style={{ display: "flex", alignItems: "center", gap: 6, fontWeight: 600, color: "var(--primary)" }}><BookOpen size={14} /> {s.course.title}</span>}
                <span style={{ display: "flex", alignItems: "center", gap: 6 }}><User size={14} /> {s.mentorName}</span>
                <span style={{ display: "flex", alignItems: "center", gap: 6 }}><Calendar size={14} /> {formatDate(s.startTime)}</span>
                <span style={{ display: "flex", alignItems: "center", gap: 6 }}><Clock size={14} /> {formatTime(s.startTime)} – {formatTime(s.endTime)}</span>
              </div>

              {s.description && (
                <div style={{ fontSize: 13, color: "var(--gray-700)" }}>
                  <Linkified text={s.description} />
                </div>
              )}

              {s.status === "PAST" && s.resources && (
                <div style={{ fontSize: 13, background: "var(--gray-50)", padding: 10, borderRadius: 8 }}>
                  <div style={{ fontWeight: 600, marginBottom: 4 }}>Notes & Resources</div>
                  <Linkified text={s.resources} />
                </div>
              )}

              <div style={{ marginTop: "auto", display: "flex", gap: 8, flexWrap: "wrap" }}>
                {s.status !== "PAST" && s.meetingLink && (
                  <a href={s.meetingLink} target="_blank" rel="noopener noreferrer">
                    <button className={`btn btn-sm ${s.status === "LIVE" ? "btn-danger" : "btn-primary"}`}>
                      <Video size={14} /> {s.status === "LIVE" ? "Join Now" : "Meeting Link"} <ExternalLink size={12} />
                    </button>
                  </a>
                )}
                {s.status !== "PAST" && !s.meetingLink && (
                  <span style={{ fontSize: 12, color: "var(--gray-500)" }}>Meeting link will be shared soon</span>
                )}
                {s.status === "PAST" && s.recordingUrl && (
                  <a href={s.recordingUrl} target="_blank" rel="noopener noreferrer">
                    <button className="btn btn-sm btn-primary">
                      <PlayCircle size={14} /> Watch Recording
                    </button>
                  </a>
                )}
                {canManage && (
                  <>
                    <button className="btn btn-sm btn-outline" onClick={() => openEdit(s)}>
                      <Edit2 size={14} /> Edit
                    </button>
                    <button className="btn btn-sm btn-ghost" onClick={() => remove(s)} title="Delete">
                      <Trash2 size={14} />
                    </button>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {canManage && showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title">{editing ? "Edit Session" : "Add Mentor Session"}</h2>
              <button className="btn btn-ghost btn-icon" onClick={() => setShowModal(false)}>✕</button>
            </div>
            <div className="modal-body">
              {error && <div className="form-error" style={{ marginBottom: 12 }}>{error}</div>}
              <div className="form-group">
                <label className="form-label">Title *</label>
                <input className="form-control" value={form.title} onChange={set("title")} placeholder="e.g. Career guidance with industry expert" />
              </div>
              <div className="form-group">
                <label className="form-label">Course *</label>
                <select className="form-control" value={form.courseId} onChange={(e) => setForm((f) => ({ ...f, courseId: e.target.value }))}>
                  <option value="">Select a course…</option>
                  {courses.map((c) => (
                    <option key={c.id} value={c.id}>{c.title}</option>
                  ))}
                </select>
                {!editing && <div className="form-hint">Students enrolled in this course will get a notification.</div>}
              </div>
              <div className="form-group">
                <label className="form-label">Mentor Name *</label>
                <input className="form-control" value={form.mentorName} onChange={set("mentorName")} />
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div className="form-group">
                  <label className="form-label">Start *</label>
                  <input type="datetime-local" className="form-control" value={form.startTime} onChange={set("startTime")} />
                </div>
                <div className="form-group">
                  <label className="form-label">End *</label>
                  <input type="datetime-local" className="form-control" value={form.endTime} onChange={set("endTime")} />
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Meeting Link</label>
                <input className="form-control" value={form.meetingLink} onChange={set("meetingLink")} placeholder="https://meet.google.com/..." />
              </div>
              <div className="form-group">
                <label className="form-label">Description / Agenda</label>
                <textarea className="form-control" rows={3} value={form.description} onChange={set("description")} />
              </div>
              <div className="form-group">
                <label className="form-label">Recording URL</label>
                <input className="form-control" value={form.recordingUrl} onChange={set("recordingUrl")} placeholder="Shown on past sessions" />
              </div>
              <div className="form-group">
                <label className="form-label">Notes & Resources</label>
                <textarea className="form-control" rows={3} value={form.resources} onChange={set("resources")} placeholder="Slides, links, summary… (shown on past sessions)" />
                <div className="form-hint">Links are clickable for students.</div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowModal(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={save} disabled={saving}>
                {saving ? "Saving…" : editing ? "Save Changes" : "Create Session"}
              </button>
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  );
}
