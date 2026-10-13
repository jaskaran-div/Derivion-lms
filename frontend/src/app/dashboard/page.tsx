"use client";

import { useEffect, useState } from "react";
import AppLayout from "@/components/layout/AppLayout";
import { usersAPI } from "@/lib/api";
import Link from "next/link";
import { BookOpen, Award, Clock, TrendingUp, Play, ChevronRight, Star } from "lucide-react";
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
    category: { name: string };
    totalDuration: number;
    totalLessons: number;
    _count: { sections: number };
  };
}

interface DashboardData {
  stats: {
    enrolledCourses: number;
    completedCourses: number;
    certificates: number;
    inProgressCourses: number;
  };
  enrollments: Enrollment[];
  notifications: any[];
  recentProgress: any[];
}

export default function StudentDashboardPage() {
  const { user } = useAuthStore();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    usersAPI.getStudentDashboard().then((res) => {
      setData(res.data.data);
    }).finally(() => setLoading(false));
  }, []);

  const formatDuration = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    if (h > 0) return `${h}h ${m}m`;
    return `${m}m`;
  };

  if (loading) {
    return (
      <AppLayout>
        <div className="stats-grid">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="stat-card" style={{ height: 120 }}>
              <div className="skeleton" style={{ height: 20, width: "60%", marginBottom: 12 }} />
              <div className="skeleton" style={{ height: 36, width: "40%" }} />
            </div>
          ))}
        </div>
      </AppLayout>
    );
  }

  const inProgressEnrollments = data?.enrollments.filter(
    (e) => e.status === "ACTIVE" && parseFloat(String(e.progressPercent)) > 0
  ) || [];
  const completedEnrollments = data?.enrollments.filter(
    (e) => e.status === "COMPLETED"
  ) || [];
  const newEnrollments = data?.enrollments.filter(
    (e) => e.status === "ACTIVE" && parseFloat(String(e.progressPercent)) === 0
  ) || [];

  return (
    <AppLayout>
      {/* Welcome Banner */}
      <div
        style={{
          background: "linear-gradient(135deg, var(--primary-dark) 0%, var(--primary) 60%, var(--secondary-dark) 100%)",
          borderRadius: "var(--radius-xl)",
          padding: "28px 32px",
          color: "white",
          marginBottom: 24,
          position: "relative",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            position: "absolute",
            right: -40,
            top: -40,
            width: 200,
            height: 200,
            borderRadius: "50%",
            background: "rgba(255,255,255,0.06)",
          }}
        />
        <div style={{ position: "relative", zIndex: 1 }}>
          <div style={{ fontSize: 24, fontWeight: 800, marginBottom: 6 }}>
            Welcome back, {user?.firstName}! 👋
          </div>
          <div style={{ fontSize: 15, opacity: 0.85, marginBottom: 16 }}>
            Continue your learning journey and keep up the great progress!
          </div>
          <Link href="/courses">
            <button
              className="btn"
              style={{
                background: "rgba(255,255,255,0.2)",
                color: "white",
                border: "1px solid rgba(255,255,255,0.3)",
                backdropFilter: "blur(10px)",
              }}
            >
              Browse Courses →
            </button>
          </Link>
        </div>
      </div>

      {/* Stats */}
      <div className="stats-grid">
        <div className="stat-card blue">
          <div className="stat-icon blue"><BookOpen size={22} /></div>
          <div className="stat-value">{data?.stats.enrolledCourses || 0}</div>
          <div className="stat-label">Enrolled Courses</div>
        </div>
        <div className="stat-card yellow">
          <div className="stat-icon yellow"><TrendingUp size={22} /></div>
          <div className="stat-value">{data?.stats.inProgressCourses || 0}</div>
          <div className="stat-label">In Progress</div>
        </div>
        <div className="stat-card green">
          <div className="stat-icon green"><Star size={22} /></div>
          <div className="stat-value">{data?.stats.completedCourses || 0}</div>
          <div className="stat-label">Completed</div>
        </div>
        <div className="stat-card purple">
          <div className="stat-icon purple"><Award size={22} /></div>
          <div className="stat-value">{data?.stats.certificates || 0}</div>
          <div className="stat-label">Certificates</div>
        </div>
      </div>

      {/* Continue Learning */}
      {inProgressEnrollments.length > 0 && (
        <div style={{ marginBottom: 28 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <h2 style={{ fontSize: 18, fontWeight: 700, color: "var(--gray-900)" }}>
              Continue Learning
            </h2>
            <Link href="/my-courses" style={{ fontSize: 13, color: "var(--primary)", fontWeight: 500 }}>
              View all →
            </Link>
          </div>
          <div className="grid-courses">
            {inProgressEnrollments.slice(0, 3).map((enrollment) => (
              <Link href={`/courses/${enrollment.course.slug}`} key={enrollment.id}>
                <div className="course-card">
                  <div
                    className="course-card-image"
                    style={{
                      background: enrollment.course.thumbnail
                        ? `url(${enrollment.course.thumbnail}) center/cover`
                        : "linear-gradient(135deg, var(--primary-100), var(--primary-50))",
                    }}
                  >
                    {!enrollment.course.thumbnail && "📚"}
                  </div>
                  <div className="course-card-body">
                    <div className="course-card-category">{enrollment.course.category?.name}</div>
                    <div className="course-card-title">{enrollment.course.title}</div>

                    {/* Progress */}
                    <div style={{ marginBottom: 12 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6, fontSize: 12, color: "var(--gray-500)" }}>
                        <span>Progress</span>
                        <span style={{ fontWeight: 600, color: "var(--primary)" }}>
                          {Math.round(parseFloat(String(enrollment.progressPercent)))}%
                        </span>
                      </div>
                      <div className="progress-bar">
                        <div
                          className="progress-fill"
                          style={{ width: `${parseFloat(String(enrollment.progressPercent))}%` }}
                        />
                      </div>
                    </div>

                    <button className="btn btn-primary w-full btn-sm" style={{ justifyContent: "center" }}>
                      <Play size={14} /> Continue Learning
                    </button>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Newly Enrolled */}
      {newEnrollments.length > 0 && (
        <div style={{ marginBottom: 28 }}>
          <h2 style={{ fontSize: 18, fontWeight: 700, color: "var(--gray-900)", marginBottom: 16 }}>
            Start These Courses 🆕
          </h2>
          <div className="grid-courses">
            {newEnrollments.slice(0, 3).map((enrollment) => (
              <Link href={`/courses/${enrollment.course.slug}`} key={enrollment.id}>
                <div className="course-card">
                  <div
                    className="course-card-image"
                    style={{
                      background: enrollment.course.thumbnail
                        ? `url(${enrollment.course.thumbnail}) center/cover`
                        : "linear-gradient(135deg, var(--primary-100), var(--primary-50))",
                    }}
                  >
                    {!enrollment.course.thumbnail && "📚"}
                  </div>
                  <div className="course-card-body">
                    <div className="course-card-category">{enrollment.course.category?.name}</div>
                    <div className="course-card-title">{enrollment.course.title}</div>
                    <button className="btn btn-outline w-full btn-sm" style={{ justifyContent: "center" }}>
                      Start Course →
                    </button>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Empty state */}
      {(data?.enrollments.length || 0) === 0 && (
        <div className="card">
          <div className="empty-state" style={{ padding: "64px 24px" }}>
            <div className="empty-state-icon">🎓</div>
            <div className="empty-state-title">No courses yet</div>
            <div className="empty-state-text">
              Explore our library of courses and start learning something new today!
            </div>
            <Link href="/courses">
              <button className="btn btn-primary btn-lg">Browse Courses →</button>
            </Link>
          </div>
        </div>
      )}

      {/* Notifications */}
      {(data?.notifications.length || 0) > 0 && (
        <div style={{ marginTop: 28 }}>
          <h2 style={{ fontSize: 18, fontWeight: 700, color: "var(--gray-900)", marginBottom: 16 }}>
            Recent Notifications
          </h2>
          <div className="card">
            {data?.notifications.map((notif, i) => (
              <div
                key={notif.id}
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: 12,
                  padding: "14px 20px",
                  borderBottom: i < (data.notifications.length - 1) ? "1px solid var(--gray-100)" : "none",
                  background: notif.isRead ? "white" : "var(--primary-50)",
                }}
              >
                <div
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: "50%",
                    background: notif.type === "SUCCESS" ? "var(--success-light)" : "var(--primary-50)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 16,
                    flexShrink: 0,
                  }}
                >
                  {notif.type === "SUCCESS" ? "✅" : "🔔"}
                </div>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: "var(--gray-800)" }}>
                    {notif.title}
                  </div>
                  <div style={{ fontSize: 13, color: "var(--gray-500)", marginTop: 2 }}>
                    {notif.message}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </AppLayout>
  );
}
