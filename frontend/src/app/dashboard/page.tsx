"use client";

import { useEffect, useState } from "react";
import AppLayout from "@/components/layout/AppLayout";
import { mentorAPI, usersAPI } from "@/lib/api";
import Link from "next/link";
import {
  BookOpen, Award, TrendingUp, CheckCircle2, ArrowUpRight, ChevronRight, Compass, Video, Bell,
} from "lucide-react";
import { useAuthStore } from "@/store/authStore";

interface Enrollment {
  id: string;
  status: string;
  progressPercent: number;
  enrolledAt: string;
  course: {
    id: string;
    title: string;
    slug: string;
    thumbnail?: string;
    shortDesc?: string;
    category: { name: string };
    totalDuration: number;
    totalLessons: number;
    _count: { sections: number };
  };
}

interface Notification {
  id: string;
  title: string;
  message: string;
  type: string;
  isRead: boolean;
}

interface DashboardData {
  stats: {
    enrolledCourses: number;
    completedCourses: number;
    certificates: number;
    inProgressCourses: number;
  };
  enrollments: Enrollment[];
  notifications: Notification[];
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

const TILE_COLORS = ["#16a34a", "#6d3df5", "#111318", "#1d4ed8", "#f97316", "#0891b2"];

const pct = (e: Enrollment) => Math.round(parseFloat(String(e.progressPercent)) || 0);

const timeLabel = (iso: string) =>
  new Date(iso).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
const dayLabel = (iso: string) =>
  new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short" });

export default function StudentDashboardPage() {
  const { user } = useAuthStore();
  const [data, setData] = useState<DashboardData | null>(null);
  const [sessions, setSessions] = useState<MentorSession[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    usersAPI.getStudentDashboard().then((res) => {
      setData(res.data.data);
    }).finally(() => setLoading(false));
    mentorAPI.list().then((res) => {
      const d = res.data.data;
      setSessions([...d.live, ...d.upcoming].slice(0, 3));
    }).catch(() => {});
  }, []);

  if (loading) {
    return (
      <AppLayout>
        <div className="skeleton" style={{ height: 36, width: 240, marginBottom: 24 }} />
        <div className="dash-top">
          <div className="skeleton" style={{ height: 260, borderRadius: 24 }} />
          <div className="stats-grid">
            {[1, 2, 3, 4].map((i) => <div key={i} className="skeleton" style={{ height: 120, borderRadius: 18 }} />)}
          </div>
        </div>
      </AppLayout>
    );
  }

  const enrollments = data?.enrollments || [];
  // The course to resume: most progressed active course, else the newest enrollment
  const current =
    [...enrollments].filter((e) => e.status === "ACTIVE" && pct(e) > 0).sort((a, b) => pct(b) - pct(a))[0] ||
    enrollments.find((e) => e.status === "ACTIVE") ||
    enrollments[0];

  return (
    <AppLayout>
      <div className="page-header">
        <h1 className="page-title">
          Hello, <strong style={{ fontWeight: 600 }}>{user?.firstName}</strong>
        </h1>
      </div>

      {enrollments.length === 0 ? (
        <div className="card">
          <div className="empty-state" style={{ padding: "64px 24px" }}>
            <div className="empty-state-icon">🎓</div>
            <div className="empty-state-title">No courses yet</div>
            <div className="empty-state-text">
              Explore our library of courses and start learning something new today!
            </div>
            <Link href="/courses">
              <button className="btn btn-dark btn-lg">Browse Courses</button>
            </Link>
          </div>
        </div>
      ) : (
        <>
        <div className="dash-top">
          {/* LEFT COLUMN */}
          <div className="dash-col">
            {current && (
              <div className="hero-course-card">
                <div className="hero-course-inner">
                  {current.course.thumbnail ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={current.course.thumbnail} alt="" className="hero-course-thumb" />
                  ) : (
                    <div className="hero-course-thumb">📚</div>
                  )}
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 16, color: "var(--gray-900)", lineHeight: 1.3 }}>
                      {current.course.title}
                    </div>
                    <div style={{ fontSize: 13, color: "var(--gray-600)", marginTop: 4 }}>
                      {current.course.category?.name}
                      {current.course.totalLessons ? ` · ${current.course.totalLessons} lessons` : ""}
                    </div>
                  </div>
                </div>
                <div>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: "var(--gray-700)", marginBottom: 6 }}>
                    <span>Progress</span>
                    <span>{pct(current)}%</span>
                  </div>
                  <div className="progress-bar" style={{ background: "rgba(255,255,255,0.7)" }}>
                    <div className="progress-fill" style={{ width: `${pct(current)}%` }} />
                  </div>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 8 }}>
                  {[
                    ["Lessons", String(current.course.totalLessons || 0)],
                    ["Length", current.course.totalDuration ? `${Math.floor(current.course.totalDuration / 3600)}h ${Math.round((current.course.totalDuration % 3600) / 60)}m` : "—"],
                    ["Enrolled", new Date(current.enrolledAt).toLocaleDateString("en-IN", { day: "numeric", month: "short" })],
                  ].map(([label, value]) => (
                    <div key={label} style={{ background: "rgba(255,255,255,0.6)", borderRadius: 12, padding: "10px 12px" }}>
                      <div style={{ fontSize: 11, color: "var(--gray-600)" }}>{label}</div>
                      <div style={{ fontSize: 15, fontWeight: 600, color: "var(--gray-900)" }}>{value}</div>
                    </div>
                  ))}
                </div>
                <Link href={`/courses/${current.course.slug}`}>
                  <button className="btn btn-pill-white">
                    {pct(current) > 0 ? "Continue Learning" : "Start Learning"}
                  </button>
                </Link>
                <Link href="/courses">
                  <button className="btn btn-pill-violet">
                    <Compass size={18} /> Browse Courses <ChevronRight size={16} />
                  </button>
                </Link>
              </div>
            )}

          </div>

          {/* RIGHT COLUMN */}
          <div className="dash-col">
            <div className="stats-grid">
              <div className="stat-card">
                <div className="stat-icon blue"><BookOpen size={20} /></div>
                <div className="stat-label">Enrolled<br />Courses</div>
                <div className="stat-value">{data?.stats.enrolledCourses || 0}</div>
              </div>
              <div className="stat-card">
                <div className="stat-icon yellow"><TrendingUp size={20} /></div>
                <div className="stat-label">In<br />Progress</div>
                <div className="stat-value">{data?.stats.inProgressCourses || 0}</div>
              </div>
              <div className="stat-card">
                <div className="stat-icon green"><CheckCircle2 size={20} /></div>
                <div className="stat-label">Completed<br />Courses</div>
                <div className="stat-value">{data?.stats.completedCourses || 0}</div>
              </div>
              <div className="stat-card">
                <div className="stat-icon purple"><Award size={20} /></div>
                <div className="stat-label">Earned<br />Certificates</div>
                <div className="stat-value">{data?.stats.certificates || 0}</div>
              </div>
            </div>

            {/* My Schedule — mentor live sessions */}
            <div className="card">
              <div className="card-header" style={{ borderBottom: "none", paddingBottom: 8 }}>
                <span className="card-title" style={{ fontSize: 20, fontWeight: 500 }}>My Schedule</span>
                <Link href="/mentors" style={{ fontSize: 14, fontWeight: 500, color: "var(--gray-800)", display: "flex", alignItems: "center", gap: 4 }}>
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
                          <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, opacity: live ? 0.85 : 1, color: live ? "#fff" : "var(--gray-700)" }}>
                            {live ? <span className="live-pill">Live Now</span> : null}
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

          </div>
        </div>

        <div className={`dash-row ${(data?.notifications.length || 0) > 0 ? "equal" : "single"}`}>
        {/* Course tracker */}
        <div className="card">
          <div className="card-header" style={{ borderBottom: "none", paddingBottom: 4 }}>
            <span className="card-title" style={{ fontSize: 20, fontWeight: 500 }}>Course Tracker</span>
            <Link href="/my-courses" className="round-link-btn" aria-label="All my courses">
              <ArrowUpRight size={18} />
            </Link>
          </div>
          <div style={{ padding: "0 24px 12px" }}>
            {enrollments.slice(0, 5).map((e, i) => {
              const p = pct(e);
              const done = e.status === "COMPLETED" || p >= 100;
              return (
                <Link href={`/courses/${e.course.slug}`} key={e.id} className="list-row">
                  {e.course.thumbnail ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={e.course.thumbnail} alt="" className="thumb-tile" />
                  ) : (
                    <div className="thumb-tile" style={{ background: TILE_COLORS[i % TILE_COLORS.length] }}>
                      <span style={{ fontSize: 16 }}>{e.course.title.split(/s+/).filter((w) => /^[A-Za-z0-9]/.test(w)).slice(0, 2).map((w) => w[0].toUpperCase()).join("")}</span>
                    </div>
                  )}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="truncate" style={{ fontWeight: 600, fontSize: 14, color: "var(--gray-900)" }}>
                      {e.course.title}
                    </div>
                    <div style={{ fontSize: 12, color: "var(--gray-500)" }}>{e.course.category?.name}</div>
                    <div style={{ fontSize: 12, color: "var(--primary)", marginTop: 2 }}>{p}% complete</div>
                  </div>
                  {done ? (
                    <span className="badge badge-success badge-dot">Completed</span>
                  ) : p > 0 ? (
                    <span className="badge badge-warning badge-dot">In Progress</span>
                  ) : (
                    <span className="badge badge-gray badge-dot">Not Started</span>
                  )}
                </Link>
              );
            })}
          </div>
        </div>
        {/* Notifications */}
        {(data?.notifications.length || 0) > 0 && (
          <div className="card">
            <div className="card-header" style={{ borderBottom: "none", paddingBottom: 4 }}>
              <span className="card-title" style={{ fontSize: 20, fontWeight: 500 }}>Recent Notifications</span>
            </div>
            <div style={{ padding: "0 24px 12px" }}>
              {data?.notifications.map((notif) => (
                <div key={notif.id} className="list-row" style={{ alignItems: "flex-start" }}>
                  <div
                    style={{
                      width: 36, height: 36, borderRadius: 10, flexShrink: 0,
                      border: "1px solid var(--gray-200)",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      color: notif.type === "SUCCESS" ? "var(--success)" : "var(--primary)",
                    }}
                  >
                    {notif.type === "SUCCESS" ? <CheckCircle2 size={17} /> : <Bell size={17} />}
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 600, color: "var(--gray-900)" }}>
                      {notif.title}
                      {!notif.isRead && <span className="badge badge-blue" style={{ marginLeft: 8, fontSize: 10 }}>New</span>}
                    </div>
                    <div style={{ fontSize: 13, color: "var(--gray-500)", marginTop: 2 }}>{notif.message}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
        </div>
        </>
      )}
    </AppLayout>
  );
}
