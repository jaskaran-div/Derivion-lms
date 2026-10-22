"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import AppLayout from "@/components/layout/AppLayout";
import { mentorAPI, teacherAPI } from "@/lib/api";
import { useAuthStore } from "@/store/authStore";
import { GraduationCap, UserCheck, UserX, Plus, ChevronRight, ArrowUpRight, Video } from "lucide-react";

interface RecentStudent {
  id: string;
  firstName: string;
  lastName: string;
  username?: string;
  guardianEmail?: string;
  guardianPhone?: string;
  _count?: { enrollments: number };
}

interface MentorSession {
  id: string;
  title: string;
  mentorName: string;
  startTime: string;
  meetingLink?: string | null;
  status: "LIVE" | "UPCOMING" | "PAST";
  course?: { title: string };
}

const timeLabel = (iso: string) =>
  new Date(iso).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
const dayLabel = (iso: string) =>
  new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short" });

export default function TeacherDashboardPage() {
  const { user } = useAuthStore();
  const [data, setData] = useState<{
    stats?: { totalStudents?: number; activeStudents?: number };
    recentStudents?: RecentStudent[];
  } | null>(null);
  const [sessions, setSessions] = useState<MentorSession[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    teacherAPI.dashboard().then((res) => setData(res.data.data)).finally(() => setLoading(false));
    mentorAPI.list().then((res) => {
      const d = res.data.data;
      setSessions([...d.live, ...d.upcoming].slice(0, 3));
    }).catch(() => {});
  }, []);

  const total = data?.stats?.totalStudents ?? 0;
  const active = data?.stats?.activeStudents ?? 0;

  return (
    <AppLayout requiredRole="TEACHER">
      <div className="page-header">
        <div>
          <h1 className="page-title">
            Hello, <strong style={{ fontWeight: 600 }}>{user?.firstName}</strong>
          </h1>
          <p className="page-subtitle">Manage school students and issue one-time login credentials.</p>
        </div>
        <Link href="/teacher/students">
          <button className="btn btn-dark"><Plus size={16} /> Add Student</button>
        </Link>
      </div>

      <div className="stats-grid three">
        <div className="stat-card">
          <div className="stat-icon blue"><GraduationCap size={20} /></div>
          <div className="stat-label">Total<br />Students</div>
          <div className="stat-value">{loading ? "—" : total}</div>
        </div>
        <div className="stat-card">
          <div className="stat-icon green"><UserCheck size={20} /></div>
          <div className="stat-label">Active<br />Students</div>
          <div className="stat-value">{loading ? "—" : active}</div>
        </div>
        <div className="stat-card">
          <div className="stat-icon yellow"><UserX size={20} /></div>
          <div className="stat-label">Inactive<br />Students</div>
          <div className="stat-value">{loading ? "—" : Math.max(0, total - active)}</div>
        </div>
      </div>

      <div className="dash-bottom" style={{ gridTemplateColumns: "minmax(0, 1fr)" }}>
        {/* My Schedule — mentor live sessions */}
        <div className="card">
          <div className="card-header" style={{ borderBottom: "none", paddingBottom: 8 }}>
            <span className="card-title" style={{ fontSize: 20, fontWeight: 500 }}>My Schedule</span>
            <Link href="/teacher/mentors" style={{ fontSize: 14, fontWeight: 500, color: "var(--gray-800)", display: "flex", alignItems: "center", gap: 4 }}>
              View all <ChevronRight size={16} />
            </Link>
          </div>
          <div style={{ padding: "0 24px 24px" }}>
            {sessions.length === 0 ? (
              <div style={{ display: "flex", alignItems: "center", gap: 12, color: "var(--gray-500)", fontSize: 14, padding: "8px 0" }}>
                <Video size={18} /> No live or upcoming mentor sessions right now.
              </div>
            ) : (
              <div className="schedule-grid">
                {sessions.map((s) => {
                  const live = s.status === "LIVE";
                  return (
                    <div key={s.id} className={`schedule-card ${live ? "dark" : ""}`}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: live ? "#fff" : "var(--gray-700)" }}>
                        {live && <span className="live-pill">Live Now</span>}
                        <span>{live ? `Started ${timeLabel(s.startTime)}` : `${dayLabel(s.startTime)} · ${timeLabel(s.startTime)}`}</span>
                      </div>
                      <div style={{ fontSize: 17, fontWeight: 600, lineHeight: 1.3 }}>{s.title}</div>
                      {s.course && (
                        <div style={{ fontSize: 13, color: live ? "rgba(255,255,255,0.65)" : "var(--gray-500)" }}>{s.course.title}</div>
                      )}
                      <div style={{ marginTop: "auto", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                          <div className="avatar avatar-sm">{s.mentorName.charAt(0).toUpperCase()}</div>
                          <div style={{ minWidth: 0 }}>
                            <div style={{ fontSize: 11, color: live ? "rgba(255,255,255,0.6)" : "var(--gray-500)" }}>Mentor</div>
                            <div className="truncate" style={{ fontSize: 13, fontWeight: 500 }}>{s.mentorName}</div>
                          </div>
                        </div>
                        {live && s.meetingLink && (
                          <a href={s.meetingLink} target="_blank" rel="noopener noreferrer">
                            <button className="btn btn-sm" style={{ background: "#fff", color: "var(--gray-900)", borderRadius: 999 }}>
                              Join <ChevronRight size={14} />
                            </button>
                          </a>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Recently added students */}
        <div className="card">
          <div className="card-header" style={{ borderBottom: "none", paddingBottom: 4 }}>
            <span className="card-title" style={{ fontSize: 20, fontWeight: 500 }}>Recently Added</span>
            <Link href="/teacher/students" className="round-link-btn" aria-label="All students">
              <ArrowUpRight size={18} />
            </Link>
          </div>
          {!data?.recentStudents?.length ? (
            <div className="empty-state">
              <div className="empty-state-icon">🎓</div>
              <div className="empty-state-title">No students yet</div>
              <div className="empty-state-text">Create student IDs using guardian email or phone.</div>
            </div>
          ) : (
            <div className="table-container flush">
              <table>
                <thead>
                  <tr>
                    <th>Student</th>
                    <th>Student ID</th>
                    <th>Guardian</th>
                    <th>Courses</th>
                  </tr>
                </thead>
                <tbody>
                  {data.recentStudents.map((s) => (
                    <tr key={s.id}>
                      <td>
                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                          <div className="avatar">{(s.firstName?.[0] || "") + (s.lastName?.[0] || "")}</div>
                          <span style={{ fontWeight: 600, color: "var(--gray-900)" }}>{s.firstName} {s.lastName}</span>
                        </div>
                      </td>
                      <td><code>{s.username}</code></td>
                      <td>{s.guardianEmail || s.guardianPhone || "—"}</td>
                      <td>{s._count?.enrollments ?? 0}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  );
}
