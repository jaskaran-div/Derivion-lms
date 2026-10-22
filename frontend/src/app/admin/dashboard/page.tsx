"use client";

import { useEffect, useMemo, useState } from "react";
import AppLayout from "@/components/layout/AppLayout";
import { mentorAPI, usersAPI } from "@/lib/api";
import {
  Users, BookOpen, TrendingUp, Video, Plus, ChevronRight, ArrowUpRight, IndianRupee, CalendarClock,
} from "lucide-react";
import Link from "next/link";
import { useAuthStore } from "@/store/authStore";

interface DashboardData {
  stats: {
    totalUsers: number;
    totalCourses: number;
    totalEnrollments: number;
    totalRevenue: number;
  };
  recentUsers: { id: string; firstName: string; lastName: string; email: string; createdAt: string }[];
  recentEnrollments: {
    id: string;
    status: string;
    enrolledAt: string;
    user: { firstName: string; lastName: string; email: string };
    course: { title: string };
  }[];
  popularCourses: { id: string; title: string; totalStudents: number; price: number | string }[];
  revenueByMonth: { month: string; revenue: number | string; count: number }[];
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

const inr = (amount: number) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(amount);

// Compact axis/label format: ₹950, ₹12.4K, ₹3.1L
const inrShort = (n: number) => {
  if (n >= 100000) return `₹${(n / 100000).toFixed(n >= 1000000 ? 0 : 1)}L`;
  if (n >= 1000) return `₹${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}K`;
  return `₹${Math.round(n)}`;
};

const formatDate = (dateStr: string) =>
  new Date(dateStr).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
const timeLabel = (iso: string) =>
  new Date(iso).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
const dayLabel = (iso: string) =>
  new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
const monthKey = (d: Date) => `${d.toLocaleString("en-US", { month: "short" })} ${d.getFullYear()}`;

const RANK_STYLE = [
  { bg: "#fff7e6", color: "#b7791f", border: "#fde3b0" },
  { bg: "#f1f2f5", color: "#4b5260", border: "#e0e2e7" },
  { bg: "#fff1e9", color: "#c2570c", border: "#fed7b5" },
];

// Six-month revenue bars. The latest month is the highlighted (violet) bar; every bar carries
// its value as a label and a hover tooltip, since the grey bars are too light to read alone.
function RevenueChart({ rows }: { rows: DashboardData["revenueByMonth"] }) {
  const [hover, setHover] = useState<number | null>(null);

  const months = useMemo(() => {
    const byMonth = new Map(rows.map((r) => [r.month, { revenue: Number(r.revenue) || 0, count: r.count || 0 }]));
    const out: { key: string; label: string; revenue: number; count: number }[] = [];
    const now = new Date();
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const v = byMonth.get(monthKey(d)) || { revenue: 0, count: 0 };
      out.push({ key: monthKey(d), label: d.toLocaleString("en-US", { month: "short" }), ...v });
    }
    return out;
  }, [rows]);

  const max = Math.max(...months.map((m) => m.revenue), 1);
  const pow = Math.pow(10, Math.floor(Math.log10(max)));
  const nice = Math.ceil(max / pow) * pow;
  const ticks = [nice, nice * 0.5, 0];
  const empty = months.every((m) => m.revenue === 0);

  return (
    <div style={{ position: "relative" }}>
      <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: 10, height: 220 }}>
        {/* Y axis */}
        <div style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", fontSize: 11, color: "var(--gray-400)", textAlign: "right", paddingBottom: 22 }}>
          {ticks.map((t) => <span key={t} style={{ visibility: empty ? "hidden" : "visible" }}>{inrShort(t)}</span>)}
        </div>

        {/* Plot */}
        <div style={{ position: "relative", display: "flex", flexDirection: "column" }}>
          <div style={{ position: "relative", flex: 1 }}>
            {ticks.map((t, i) => (
              <div
                key={t}
                style={{
                  position: "absolute", left: 0, right: 0, top: `${(i / (ticks.length - 1)) * 100}%`,
                  borderTop: i === ticks.length - 1 ? "1px solid var(--gray-200)" : "1px dashed var(--gray-200)",
                }}
              />
            ))}
            <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "flex-end", gap: 10 }}>
              {months.map((m, i) => {
                const latest = i === months.length - 1;
                const h = (m.revenue / nice) * 100;
                return (
                  <div
                    key={m.key}
                    onMouseEnter={() => setHover(i)}
                    onMouseLeave={() => setHover(null)}
                    style={{ flex: 1, height: "100%", display: "flex", flexDirection: "column", justifyContent: "flex-end", alignItems: "center", position: "relative" }}
                  >
                    {m.revenue > 0 && (
                      <span
                        style={{
                          fontSize: 11, marginBottom: 4, whiteSpace: "nowrap",
                          ...(latest
                            ? { background: "var(--ink)", color: "#fff", padding: "3px 8px", borderRadius: 8, fontWeight: 600 }
                            : { color: "var(--gray-500)" }),
                        }}
                      >
                        {inrShort(m.revenue)}
                      </span>
                    )}
                    <div
                      style={{
                        width: "100%", maxWidth: 46, height: `${h}%`,
                        minHeight: m.revenue > 0 ? 4 : 0,
                        borderRadius: "4px 4px 0 0",
                        background: latest
                          ? "repeating-linear-gradient(135deg, #6d3df5 0 6px, #8f6bff 6px 12px)"
                          : hover === i ? "#c2c6ce" : "#d3d6dd",
                        transition: "background 0.15s",
                      }}
                    />
                    {hover === i && (
                      <div
                        role="tooltip"
                        style={{
                          position: "absolute", bottom: `calc(${h}% + 30px)`, left: "50%", transform: "translateX(-50%)",
                          background: "var(--bg-card)", border: "1px solid var(--border-color)", boxShadow: "var(--shadow-md)",
                          borderRadius: 10, padding: "8px 10px", fontSize: 12, whiteSpace: "nowrap", zIndex: 5, pointerEvents: "none",
                        }}
                      >
                        <div style={{ color: "var(--gray-500)" }}>{m.key}</div>
                        <div style={{ fontWeight: 600, color: "var(--gray-900)", fontSize: 13 }}>{inr(m.revenue)}</div>
                        <div style={{ color: "var(--gray-500)" }}>{m.count} payment{m.count !== 1 ? "s" : ""}</div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
          {/* X axis */}
          <div style={{ display: "flex", gap: 10, height: 22, alignItems: "flex-end" }}>
            {months.map((m, i) => (
              <span key={m.key} style={{ flex: 1, textAlign: "center", fontSize: 12, color: i === months.length - 1 ? "var(--gray-900)" : "var(--gray-500)", fontWeight: i === months.length - 1 ? 600 : 400 }}>
                {m.label}
              </span>
            ))}
          </div>
        </div>
      </div>
      {empty && (
        <div style={{ position: "absolute", inset: "0 0 22px 40px", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--gray-500)", fontSize: 13 }}>
          No successful payments in the last 6 months
        </div>
      )}
    </div>
  );
}

export default function AdminDashboardPage() {
  const { user } = useAuthStore();
  const [data, setData] = useState<DashboardData | null>(null);
  const [sessions, setSessions] = useState<{ live: MentorSession[]; upcoming: MentorSession[] } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    usersAPI.getDashboard()
      .then((res) => setData(res.data.data))
      .catch((err) => console.error(err))
      .finally(() => setLoading(false));
    mentorAPI.list()
      .then((res) => setSessions({ live: res.data.data.live, upcoming: res.data.data.upcoming }))
      .catch(() => setSessions({ live: [], upcoming: [] }));
  }, []);

  if (loading) {
    return (
      <AppLayout requiredRole="ADMIN">
        <div className="skeleton" style={{ height: 36, width: 240, marginBottom: 24 }} />
        <div className="dash-top">
          <div className="skeleton" style={{ height: 300, borderRadius: 24 }} />
          <div className="stats-grid">
            {[1, 2, 3, 4].map((i) => <div key={i} className="skeleton" style={{ height: 130, borderRadius: 18 }} />)}
          </div>
        </div>
      </AppLayout>
    );
  }

  const upcomingSessions = [...(sessions?.live || []), ...(sessions?.upcoming || [])];
  const schedule = upcomingSessions.slice(0, 3);
  const thisMonthRevenue = Number(data?.revenueByMonth?.find((r) => r.month === monthKey(new Date()))?.revenue || 0);

  return (
    <AppLayout requiredRole="ADMIN">
      <div className="page-header">
        <div>
          <h1 className="page-title">
            Hello, <strong style={{ fontWeight: 600 }}>{user?.firstName || "Admin"}</strong>
          </h1>
          <p className="page-subtitle">Here&apos;s what&apos;s happening across your LMS.</p>
        </div>
      </div>

      <div className="dash-top">
        {/* ============ LEFT COLUMN ============ */}
        <div className="dash-col">
          {/* Revenue hero */}
          <div className="hero-course-card">
            <div className="hero-course-inner" style={{ alignItems: "flex-start", flexDirection: "column", gap: 4, padding: 18 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14, color: "var(--gray-600)" }}>
                <span style={{ width: 32, height: 32, borderRadius: 10, background: "var(--primary)", color: "#fff", display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
                  <IndianRupee size={16} />
                </span>
                Total Revenue
              </div>
              <div style={{ fontSize: 38, fontWeight: 500, color: "var(--gray-900)", letterSpacing: "-0.02em", lineHeight: 1.1, marginTop: 8 }}>
                {inr(data?.stats.totalRevenue || 0)}
              </div>
              <div style={{ fontSize: 13, color: "var(--gray-600)" }}>
                {inr(thisMonthRevenue)} collected this month
              </div>
            </div>
            <Link href="/admin/courses/new">
              <button className="btn btn-pill-white">
                <Plus size={17} /> Add Course
              </button>
            </Link>
            <Link href="/admin/mentors">
              <button className="btn btn-pill-violet">
                <CalendarClock size={18} /> Schedule Live Session <ChevronRight size={16} />
              </button>
            </Link>
          </div>

          {/* Recent registrations */}
          <div className="card">
            <div className="card-header" style={{ borderBottom: "none", paddingBottom: 4 }}>
              <span className="card-title" style={{ fontSize: 20, fontWeight: 500 }}>New Students</span>
              <Link href="/admin/users" className="round-link-btn" aria-label="All users">
                <ArrowUpRight size={18} />
              </Link>
            </div>
            <div style={{ padding: "0 24px 12px" }}>
              {!data?.recentUsers.length ? (
                <div style={{ padding: "16px 0", fontSize: 14, color: "var(--gray-500)" }}>No students yet.</div>
              ) : (
                data.recentUsers.slice(0, 4).map((u) => (
                  <div key={u.id} className="list-row">
                    <div className="avatar">{u.firstName[0]}{u.lastName[0]}</div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div className="truncate" style={{ fontWeight: 600, fontSize: 14, color: "var(--gray-900)" }}>
                        {u.firstName} {u.lastName}
                      </div>
                      <div className="truncate" style={{ fontSize: 12, color: "var(--gray-500)" }}>{u.email}</div>
                    </div>
                    <span style={{ fontSize: 12, color: "var(--primary)", whiteSpace: "nowrap" }}>{formatDate(u.createdAt)}</span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* ============ RIGHT COLUMN ============ */}
        <div className="dash-col">
          <div className="stats-grid">
            <div className="stat-card">
              <div className="stat-icon blue"><Users size={20} /></div>
              <div className="stat-label">Total<br />Students</div>
              <div className="stat-value">{(data?.stats.totalUsers || 0).toLocaleString("en-IN")}</div>
            </div>
            <div className="stat-card">
              <div className="stat-icon green"><BookOpen size={20} /></div>
              <div className="stat-label">Published<br />Courses</div>
              <div className="stat-value">{data?.stats.totalCourses || 0}</div>
            </div>
            <div className="stat-card">
              <div className="stat-icon yellow"><TrendingUp size={20} /></div>
              <div className="stat-label">Total<br />Enrollments</div>
              <div className="stat-value">{(data?.stats.totalEnrollments || 0).toLocaleString("en-IN")}</div>
            </div>
            <div className="stat-card">
              <div className="stat-icon purple"><Video size={20} /></div>
              <div className="stat-label">Upcoming<br />Live Sessions</div>
              <div className="stat-value">{sessions ? upcomingSessions.length : "—"}</div>
            </div>
          </div>

          <div className="admin-dash-row">
            {/* Revenue chart */}
            <div className="card" style={{ padding: "20px 22px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
                <span className="card-title" style={{ fontSize: 20, fontWeight: 500 }}>Revenue</span>
                <span className="badge badge-gray" style={{ padding: "6px 12px" }}>Last 6 months</span>
              </div>
              <RevenueChart rows={data?.revenueByMonth || []} />
            </div>

            {/* Top courses */}
            <div className="card" style={{ padding: "20px 22px", display: "flex", flexDirection: "column" }}>
              <span className="card-title" style={{ fontSize: 20, fontWeight: 500, marginBottom: 14 }}>Top Courses</span>
              {!data?.popularCourses.length ? (
                <div style={{ fontSize: 14, color: "var(--gray-500)" }}>No published courses yet.</div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {data.popularCourses.slice(0, 3).map((c, i) => (
                    <div
                      key={c.id}
                      style={{
                        display: "flex", alignItems: "center", gap: 12, padding: "10px 12px", borderRadius: 14,
                        border: `1px solid ${i === 0 ? "#fde3b0" : "var(--border-color)"}`,
                        background: i === 0 ? "#fffaf2" : "var(--bg-card)",
                      }}
                    >
                      <span
                        style={{
                          width: 30, height: 30, borderRadius: "50%", flexShrink: 0, fontSize: 13, fontWeight: 600,
                          display: "inline-flex", alignItems: "center", justifyContent: "center",
                          background: RANK_STYLE[i].bg, color: RANK_STYLE[i].color, border: `1px solid ${RANK_STYLE[i].border}`,
                        }}
                      >
                        {i + 1}
                      </span>
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div className="truncate" style={{ fontSize: 14, fontWeight: 600, color: "var(--gray-900)" }}>{c.title}</div>
                        <div style={{ fontSize: 12, color: "var(--gray-500)" }}>
                          {c.totalStudents} student{c.totalStudents !== 1 ? "s" : ""} · {Number(c.price) > 0 ? inr(Number(c.price)) : "Free"}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              <Link href="/admin/courses" style={{ marginTop: "auto", paddingTop: 14, textAlign: "center", fontSize: 14, fontWeight: 500, color: "var(--primary)" }}>
                View all courses →
              </Link>
            </div>
          </div>

        </div>
      </div>

      <div className="dash-row">
        {/* Recent enrollments */}
        <div className="card">
          <div className="card-header" style={{ borderBottom: "none", paddingBottom: 4 }}>
            <span className="card-title" style={{ fontSize: 20, fontWeight: 500 }}>Recent Enrollments</span>
          </div>
          {!data?.recentEnrollments.length ? (
            <div style={{ padding: "0 24px 24px", fontSize: 14, color: "var(--gray-500)" }}>No enrollments yet.</div>
          ) : (
            <div className="table-container flush">
              <table>
                <thead>
                  <tr>
                    <th>Student</th>
                    <th>Course</th>
                    <th>Enrolled On</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {data.recentEnrollments.map((e) => (
                    <tr key={e.id}>
                      <td>
                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                          <div className="avatar avatar-sm">{e.user.firstName[0]}{e.user.lastName[0]}</div>
                          <div style={{ minWidth: 0 }}>
                            <div style={{ fontWeight: 600, fontSize: 14, color: "var(--gray-900)" }}>{e.user.firstName} {e.user.lastName}</div>
                            <div style={{ fontSize: 12, color: "var(--gray-400)" }}>{e.user.email}</div>
                          </div>
                        </div>
                      </td>
                      <td style={{ fontWeight: 500 }}>{e.course.title}</td>
                      <td style={{ color: "var(--gray-500)" }}>{formatDate(e.enrolledAt)}</td>
                      <td>
                        <span className={`badge badge-dot ${e.status === "ACTIVE" ? "badge-success" : e.status === "COMPLETED" ? "badge-violet" : "badge-gray"}`}>
                          {e.status.charAt(0) + e.status.slice(1).toLowerCase()}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
        {/* Live sessions schedule */}
        <div className="card">
          <div className="card-header" style={{ borderBottom: "none", paddingBottom: 8 }}>
            <span className="card-title" style={{ fontSize: 20, fontWeight: 500 }}>Live Sessions</span>
            <Link href="/admin/mentors" style={{ fontSize: 14, fontWeight: 500, color: "var(--gray-800)", display: "flex", alignItems: "center", gap: 4 }}>
              View all <ChevronRight size={16} />
            </Link>
          </div>
          <div style={{ padding: "0 24px 24px" }}>
            {schedule.length === 0 ? (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap", color: "var(--gray-500)", fontSize: 14 }}>
                <span style={{ display: "flex", alignItems: "center", gap: 10 }}><Video size={18} /> No live or upcoming sessions scheduled.</span>
                <Link href="/admin/mentors"><button className="btn btn-dark btn-sm"><Plus size={14} /> Schedule one</button></Link>
              </div>
            ) : (
              <div className="schedule-grid">
                {schedule.map((s) => {
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

      </div>
    </AppLayout>
  );
}
