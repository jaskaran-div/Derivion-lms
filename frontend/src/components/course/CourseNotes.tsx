"use client";

import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { Bookmark, Play, Trash2 } from "lucide-react";
import { apiErrorMessage, learnerAPI } from "@/lib/api";
import type { Content, LessonNote } from "./types";
import { formatVideoTime } from "./format";

interface Props {
  courseId: string;
  canAccess: boolean;
  activeContent: Content | null;
  currentTime: number;
}

// Timestamped study notes, saved to the learner's account (available on every device)
export default function CourseNotes({ courseId, canAccess, activeContent, currentTime }: Props) {
  const [notes, setNotes] = useState<LessonNote[] | null>(null);
  const [text, setText] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!canAccess) return;
    let cancelled = false;
    learnerAPI.courseNotes(courseId)
      .then((res) => { if (!cancelled) setNotes(res.data.data); })
      .catch(() => { if (!cancelled) setNotes([]); });
    return () => { cancelled = true; };
  }, [courseId, canAccess]);

  if (!canAccess) {
    return <p style={{ color: "var(--gray-500)", fontSize: 14, padding: "24px 0" }}>Enroll in this course to take notes.</p>;
  }

  const save = async () => {
    if (!text.trim() || !activeContent) {
      if (!activeContent) toast.error("Open a lesson first.");
      return;
    }
    setSaving(true);
    try {
      const res = await learnerAPI.addNote({ contentId: activeContent.id, timestamp: Math.floor(currentTime), text: text.trim() });
      setNotes((prev) => [res.data.data, ...(prev || [])]);
      setText("");
      toast.success("Note saved");
    } catch (err) {
      toast.error(apiErrorMessage(err, "Could not save note."));
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: string) => {
    const before = notes;
    setNotes((prev) => (prev || []).filter((n) => n.id !== id));
    try {
      await learnerAPI.deleteNote(id);
    } catch {
      setNotes(before);
      toast.error("Could not delete note.");
    }
  };

  return (
    <div>
      <div style={{ background: "var(--gray-50)", padding: 18, borderRadius: 14, border: "1px solid var(--gray-200)", marginBottom: 24 }}>
        <label htmlFor="note-input" style={{ display: "block", fontSize: 13, fontWeight: 600, color: "var(--gray-700)", marginBottom: 10 }}>
          New note{activeContent ? <> on <em>{activeContent.title}</em></> : ""} at <span className="badge badge-primary">{formatVideoTime(currentTime)}</span>
        </label>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <input
            id="note-input"
            type="text"
            className="form-control"
            style={{ flex: 1, minWidth: 200 }}
            placeholder="Type your study note here…"
            value={text}
            maxLength={5000}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") save(); }}
          />
          <button className="btn btn-primary" onClick={save} disabled={saving || !text.trim()}>
            {saving ? "Saving…" : "Save note"}
          </button>
        </div>
      </div>

      {notes === null ? (
        <div className="skeleton" style={{ height: 80 }} />
      ) : notes.length === 0 ? (
        <div style={{ textAlign: "center", padding: "40px 20px", color: "var(--gray-500)" }}>
          <Bookmark size={36} style={{ margin: "0 auto 12px", opacity: 0.5 }} />
          <p style={{ fontSize: 14 }}>No notes yet. Capture your insights while you learn.</p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {notes.map((n) => (
            <div key={n.id} className="card" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "12px 16px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12, flex: 1, minWidth: 0, flexWrap: "wrap" }}>
                <span className="badge badge-blue"><Play size={10} fill="currentColor" /> {formatVideoTime(n.timestamp)}</span>
                <span style={{ fontSize: 14, color: "var(--gray-800)", wordBreak: "break-word" }}>{n.text}</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
                <span style={{ fontSize: 12, color: "var(--gray-500)" }} title={n.content.title}>
                  {new Date(n.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
                </span>
                <button className="btn btn-ghost btn-icon" onClick={() => remove(n.id)} aria-label="Delete note">
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
