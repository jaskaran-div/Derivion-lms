"use client";

import { useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";
import { Award, BookOpen, Download, ExternalLink, Plus, X } from "lucide-react";
import { activityAPI, apiErrorMessage, certificatePdfUrl, teacherAPI } from "@/lib/api";

interface Certificate {
  id: string;
  certificateId: string;
  certificateNo: string;
  issuedAt: string;
  course: { id: string; title: string };
}

interface Enrollment {
  id: string;
  status: "ACTIVE" | "COMPLETED" | "REFUNDED";
  progressPercent: string | number;
  enrolledAt: string;
  completedAt?: string | null;
  lastAccessedAt?: string | null;
  lessonsCompleted: number;
  lessonsTotal: number;
  course: { id: string; title: string; slug: string };
  certificate: Certificate | null;
}

interface StudentDetail {
  id: string;
  firstName: string;
  lastName: string;
  username?: string | null;
  guardianEmail?: string | null;
  guardianPhone?: string | null;
  isActive: boolean;
  createdAt: string;
  lastLogin?: string | null;
  schoolMemberships: { school: { name: string; code: string } }[];
  studentBatches: { class: { name: string; section?: string | null } }[];
  enrollments: Enrollment[];
  certificates: Certificate[];
  assessmentAttempts: { id: string; score: string | number; isPassed: boolean; completedAt?: string | null; assessment: { title: string } }[];
  watchSeconds: number;
  recentActivity: { id: string; action: string; details?: { event?: string; path?: string; lesson?: string; quiz?: string } | null; createdAt: string }[];
}

const fmtDate = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "—";
const fmtDateTime = (iso: string) =>
  new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
const fmtWatch = (s: number) => {
  if (!s) return "0m";
  const h = Math.floor(s / 3600);
  const m = Math.round((s % 3600) / 60);
  return h ? `${h}h ${m}m` : `${m}m`;
};

const EVENT_LABELS: Record<string, string> = {
  LESSON_OPENED: "Opened a lesson",
  LESSON_COMPLETED: "Completed a lesson",
  LESSON_UNMARKED: "Unmarked a lesson",
  QUIZ_STARTED: "Started a quiz",
  QUIZ_SUBMITTED: "Submitted a quiz",
  FORUM_POST: "Posted in the forum",
  FORUM_REPLY: "Replied in the forum",
  PAGE_VIEW: "Visited",
  DOWNLOAD: "Downloaded",
};

const describeActivity = (a: StudentDetail["recentActivity"][number]) => {
  if (a.action === "LOGIN") return "Signed in";
  if (a.action === "LOGOUT") return "Signed out";
  const d = a.details || {};
  const label = EVENT_LABELS[d.event || ""] || d.event || "Activity";
  const what = d.lesson || d.quiz || d.path;
  return what ? `${label}: ${what}` : label;
};

export default function StudentDetailModal({
  studentId,
  courses,
  onClose,
  onChanged,
}: {
  studentId: string;
  courses: { id: string; title: string }[];
  onClose: () => void;
  onChanged: () => void;
}) {
  const [student, setStudent] = useState<StudentDetail | null>(null);
  const [failed, setFailed] = useState(false);
  const [enrollCourseId, setEnrollCourseId] = useState("");
  const [enrolling, setEnrolling] = useState(false);

  const load = useCallback(
    () =>
      teacherAPI
        .getStudent(studentId)
        .then((res) => setStudent(res.data.data))
        .catch(() => setFailed(true)),
    [studentId]
  );

  useEffect(() => {
    load();
  }, [load]);

  const enroll = async () => {
    if (!enrollCourseId) return;
    setEnrolling(true);
    try {
      await teacherAPI.enrollStudent(studentId, enrollCourseId);
      toast.success("Student enrolled.");
      setEnrollCourseId("");
      load();
      onChanged();
    } catch (err) {
      toast.error(apiErrorMessage(err, "Could not enroll the student."));
    } finally {
      setEnrolling(false);
    }
  };

  const downloadCert = (c: Certificate) => {
    activityAPI.track("DOWNLOAD", { label: `Certificate ${c.certificateNo} (${student?.firstName} ${student?.lastName})` });
    window.open(certificatePdfUrl(c.certificateId, true), "_blank", "noopener");
  };

  const enrolledIds = new Set(student?.enrollments.map((e) => e.course.id));
  const enrollable = courses.filter((c) => !enrolledIds.has(c.id));

  return (
    <div className="modal-overlay" onClick={onClose} role="dialog" aria-modal="true" aria-label="Student details">
      <div className="card student-detail-modal" onClick={(e) => e.stopPropagation()}>
        <div className="card-header">
          <span className="card-title">Student details</span>
          <button className="btn btn-ghost btn-icon" onClick={onClose} aria-label="Close"><X size={16} /></button>
        </div>

        <div className="card-body" style={{ overflowY: "auto" }}>
          {failed ? (
            <div className="empty-state"><div className="empty-state-title">Could not load this student.</div></div>
          ) : !student ? (
            <div>
              <div className="skeleton" style={{ height: 56, marginBottom: 16 }} />
              <div className="skeleton" style={{ height: 120, marginBottom: 16 }} />
              <div className="skeleton" style={{ height: 160 }} />
            </div>
          ) : (
            <>
              <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 18 }}>
                <div className="avatar avatar-lg">{student.firstName[0]}{student.lastName[0]}</div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 18, fontWeight: 700, color: "var(--gray-900)" }}>{student.firstName} {student.lastName}</div>
                  <div style={{ fontSize: 13, color: "var(--gray-500)", display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                    <code>{student.username}</code>
                    <span className={`badge badge-dot ${student.isActive ? "badge-success" : "badge-danger"}`}>{student.isActive ? "Active" : "Inactive"}</span>
                  </div>
                </div>
              </div>

              <div className="detail-grid">
                {[
                  ["School", student.schoolMemberships.map((m) => m.school.name).join(", ") || "—"],
                  ["Class", student.studentBatches.map((b) => `${b.class.name}${b.class.section ? ` ${b.class.section}` : ""}`).join(", ") || "—"],
                  ["Guardian email", student.guardianEmail || "—"],
                  ["Guardian phone", student.guardianPhone || "—"],
                  ["Joined", fmtDate(student.createdAt)],
                  ["Last login", student.lastLogin ? fmtDateTime(student.lastLogin) : "Never"],
                  ["Watch time", fmtWatch(student.watchSeconds)],
                  ["Certificates", String(student.certificates.length)],
                ].map(([label, value]) => (
                  <div key={label}>
                    <div className="detail-label">{label}</div>
                    <div className="detail-value">{value}</div>
                  </div>
                ))}
              </div>

              <h3 className="detail-section-title"><BookOpen size={16} /> Courses</h3>
              {student.enrollments.length === 0 ? (
                <p style={{ fontSize: 13, color: "var(--gray-500)" }}>Not enrolled in any course yet.</p>
              ) : (
                <div className="table-container flush" style={{ marginBottom: 12 }}>
                  <table>
                    <thead>
                      <tr><th>Course</th><th>Progress</th><th>Lessons</th><th>Enrolled</th><th>Last active</th><th>Certificate</th></tr>
                    </thead>
                    <tbody>
                      {student.enrollments.map((e) => {
                        const pct = Math.round(Number(e.progressPercent));
                        return (
                          <tr key={e.id}>
                            <td style={{ fontWeight: 600 }}>
                              {e.course.title}
                              {e.status === "COMPLETED" && <div style={{ fontSize: 11, color: "var(--success)" }}>Completed {fmtDate(e.completedAt)}</div>}
                              {e.status === "REFUNDED" && <div style={{ fontSize: 11, color: "var(--danger)" }}>Refunded</div>}
                            </td>
                            <td style={{ minWidth: 120 }}>
                              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                <div className="progress-bar" style={{ width: 70 }}><div className="progress-fill" style={{ width: `${pct}%` }} /></div>
                                <span style={{ fontSize: 12 }}>{pct}%</span>
                              </div>
                            </td>
                            <td>{e.lessonsCompleted}/{e.lessonsTotal}</td>
                            <td style={{ whiteSpace: "nowrap" }}>{fmtDate(e.enrolledAt)}</td>
                            <td style={{ whiteSpace: "nowrap" }}>{fmtDate(e.lastAccessedAt)}</td>
                            <td>
                              {e.certificate ? (
                                <button className="btn btn-secondary btn-sm" onClick={() => downloadCert(e.certificate!)}>
                                  <Download size={13} /> Download
                                </button>
                              ) : (
                                <span style={{ fontSize: 12, color: "var(--gray-400)" }}>Not yet</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              {enrollable.length > 0 && (
                <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
                  <select className="form-control" value={enrollCourseId} onChange={(e) => setEnrollCourseId(e.target.value)} aria-label="Course to enroll in">
                    <option value="">Enroll in another course…</option>
                    {enrollable.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
                  </select>
                  <button className="btn btn-primary" onClick={enroll} disabled={!enrollCourseId || enrolling}>
                    <Plus size={14} /> {enrolling ? "Enrolling…" : "Enroll"}
                  </button>
                </div>
              )}

              <h3 className="detail-section-title"><Award size={16} /> Certificates</h3>
              {student.certificates.length === 0 ? (
                <p style={{ fontSize: 13, color: "var(--gray-500)", marginBottom: 20 }}>No certificates yet. They are issued automatically when a course is completed.</p>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 20 }}>
                  {student.certificates.map((c) => (
                    <div key={c.id} className="cert-row">
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontWeight: 600 }}>{c.course.title}</div>
                        <div style={{ fontSize: 12, color: "var(--gray-500)" }}>{c.certificateNo} · Issued {fmtDate(c.issuedAt)}</div>
                      </div>
                      <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                        <a className="btn btn-ghost btn-sm" href={`/verify/${c.certificateId}`} target="_blank" rel="noopener noreferrer">
                          <ExternalLink size={13} /> Verify
                        </a>
                        <button className="btn btn-primary btn-sm" onClick={() => downloadCert(c)}>
                          <Download size={13} /> Download PDF
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {student.assessmentAttempts.length > 0 && (
                <>
                  <h3 className="detail-section-title">Quiz results</h3>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 20 }}>
                    {student.assessmentAttempts.map((a) => (
                      <div key={a.id} style={{ display: "flex", justifyContent: "space-between", gap: 10, fontSize: 13 }}>
                        <span>{a.assessment.title}</span>
                        <span style={{ whiteSpace: "nowrap" }}>
                          <strong style={{ color: a.isPassed ? "var(--success)" : "var(--danger)" }}>{Math.round(Number(a.score))}%</strong>
                          <span style={{ color: "var(--gray-400)" }}> · {fmtDate(a.completedAt)}</span>
                        </span>
                      </div>
                    ))}
                  </div>
                </>
              )}

              <h3 className="detail-section-title">Recent activity</h3>
              {student.recentActivity.length === 0 ? (
                <p style={{ fontSize: 13, color: "var(--gray-500)" }}>No activity recorded in the last two weeks.</p>
              ) : (
                <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 6 }}>
                  {student.recentActivity.map((a) => (
                    <li key={a.id} style={{ display: "flex", justifyContent: "space-between", gap: 10, fontSize: 13 }}>
                      <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{describeActivity(a)}</span>
                      <span style={{ color: "var(--gray-400)", whiteSpace: "nowrap" }}>{fmtDateTime(a.createdAt)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
