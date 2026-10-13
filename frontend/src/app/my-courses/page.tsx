"use client";

import { useEffect, useState } from "react";
import AppLayout from "@/components/layout/AppLayout";
import LearnerContentProtection from "@/components/content/LearnerContentProtection";
import { usersAPI } from "@/lib/api";
import Link from "next/link";
import { Play, CheckCircle, Clock, BookOpen } from "lucide-react";

interface Enrollment {
  id: string;
  status: string;
  progressPercent: number;
  enrolledAt: string;
  completedAt?: string;
  course: {
    id: string;
    title: string;
    slug: string;
    thumbnail?: string;
    totalDuration: number;
    totalLessons: number;
    category: { name: string };
    _count: { sections: number };
  };
}

export default function MyCoursesPage() {
  const [enrollments, setEnrollments] = useState<Enrollment[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "active" | "completed">("all");

  useEffect(() => {
    usersAPI.getEnrollments().then((res) => {
      setEnrollments(res.data.data);
    }).finally(() => setLoading(false));
  }, []);

  const filtered = enrollments.filter((e) => {
    if (filter === "active") return e.status === "ACTIVE";
    if (filter === "completed") return e.status === "COMPLETED";
    return true;
  });

  const formatDuration = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    if (h > 0) return `${h}h ${m}m`;
    return `${m}m`;
  };

  const formatDate = (dateStr: string) =>
    new Date(dateStr).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });

  return (
    <AppLayout>
      <LearnerContentProtection>
        <div className="page-header">
          <div>
            <h1 className="page-title">My Courses</h1>
            <p className="page-subtitle">{enrollments.length} course{enrollments.length !== 1 ? "s" : ""} enrolled</p>
          </div>
        </div>

        {/* Tabs */}
        <div className="tabs">
          {[
            { key: "all", label: `All (${enrollments.length})` },
            { key: "active", label: `In Progress (${enrollments.filter(e => e.status === "ACTIVE").length})` },
            { key: "completed", label: `Completed (${enrollments.filter(e => e.status === "COMPLETED").length})` },
          ].map((tab) => (
            <div
              key={tab.key}
              className={`tab ${filter === tab.key ? "active" : ""}`}
              onClick={() => setFilter(tab.key as "all" | "active" | "completed")}
            >
              {tab.label}
            </div>
          ))}
        </div>

        {loading ? (
          <div className="grid-courses">
            {[1, 2, 3].map((i) => (
              <div key={i} className="card" style={{ overflow: "hidden" }}>
                <div className="skeleton" style={{ height: 180 }} />
                <div style={{ padding: 18 }}>
                  <div className="skeleton" style={{ height: 18, marginBottom: 8 }} />
                  <div className="skeleton" style={{ height: 14, width: "60%", marginBottom: 16 }} />
                  <div className="skeleton" style={{ height: 36 }} />
                </div>
              </div>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">📚</div>
            <div className="empty-state-title">
              {filter === "completed" ? "No completed courses yet" : "No courses here"}
            </div>
            <div className="empty-state-text">
              {filter === "all"
                ? "You haven't enrolled in any courses yet. Start learning today!"
                : filter === "active"
                ? "You have no active courses."
                : "Complete a course to see it here."}
            </div>
            {filter === "all" && (
              <Link href="/courses">
                <button className="btn btn-primary btn-lg">Browse Courses →</button>
              </Link>
            )}
          </div>
        ) : (
          <div className="grid-courses">
            {filtered.map((enrollment) => (
              <Link href={`/courses/${enrollment.course.slug}`} key={enrollment.id}>
                <div className="course-card">
                  <div
                    className="course-card-image"
                    style={{
                      background: enrollment.course.thumbnail
                        ? `url(${enrollment.course.thumbnail}) center/cover`
                        : "linear-gradient(135deg, var(--primary-100), var(--primary-50))",
                      position: "relative",
                    }}
                  >
                    {!enrollment.course.thumbnail && <span style={{ fontSize: 48 }}>📚</span>}
                    {enrollment.status === "COMPLETED" && (
                      <div
                        style={{
                          position: "absolute",
                          top: 10,
                          right: 10,
                          background: "var(--success)",
                          color: "white",
                          borderRadius: 999,
                          padding: "4px 10px",
                          fontSize: 11,
                          fontWeight: 600,
                          display: "flex",
                          alignItems: "center",
                          gap: 4,
                        }}
                      >
                        <CheckCircle size={12} /> Completed
                      </div>
                    )}
                  </div>

                  <div className="course-card-body">
                    <div className="course-card-category">{enrollment.course.category?.name}</div>
                    <div className="course-card-title">{enrollment.course.title}</div>

                    <div className="course-card-meta">
                      {enrollment.course.totalDuration > 0 && (
                        <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                          <Clock size={12} /> {formatDuration(enrollment.course.totalDuration)}
                        </span>
                      )}
                      <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                        <BookOpen size={12} /> {enrollment.course.totalLessons} lessons
                      </span>
                    </div>

                    {/* Progress */}
                    <div style={{ marginBottom: 14 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6, fontSize: 12 }}>
                        <span style={{ color: "var(--gray-500)" }}>
                          {enrollment.status === "COMPLETED" ? "Completed" : "Progress"}
                        </span>
                        <span style={{ fontWeight: 600, color: enrollment.status === "COMPLETED" ? "var(--success)" : "var(--primary)" }}>
                          {Math.round(parseFloat(String(enrollment.progressPercent)))}%
                        </span>
                      </div>
                      <div className="progress-bar">
                        <div
                          className="progress-fill"
                          style={{
                            width: `${parseFloat(String(enrollment.progressPercent))}%`,
                            background: enrollment.status === "COMPLETED"
                              ? "linear-gradient(90deg, var(--success), #34d399)"
                              : undefined,
                          }}
                        />
                      </div>
                    </div>

                    <button className="btn btn-primary w-full btn-sm" style={{ justifyContent: "center" }}>
                      {enrollment.status === "COMPLETED" ? (
                        "Review Course"
                      ) : parseFloat(String(enrollment.progressPercent)) === 0 ? (
                        "Start Course →"
                      ) : (
                        <><Play size={13} /> Continue Learning</>
                      )}
                    </button>

                    <div style={{ fontSize: 11, color: "var(--gray-400)", textAlign: "center", marginTop: 8 }}>
                      Enrolled {formatDate(enrollment.enrolledAt)}
                    </div>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </LearnerContentProtection>
    </AppLayout>
  );
}
