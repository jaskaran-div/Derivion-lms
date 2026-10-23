"use client";

import { useEffect, useState } from "react";
import AppLayout from "@/components/layout/AppLayout";
import LearnerContentProtection from "@/components/content/LearnerContentProtection";
import { learnerAPI, usersAPI } from "@/lib/api";
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

interface SavedCourse {
  id: string;
  course: {
    id: string;
    title: string;
    slug: string;
    thumbnail?: string;
    shortDesc?: string;
    totalLessons: number;
    totalDuration: number;
    category?: { name: string };
  };
}

export default function MyCoursesPage() {
  const [enrollments, setEnrollments] = useState<Enrollment[]>([]);
  const [saved, setSaved] = useState<SavedCourse[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "active" | "completed" | "saved">("all");

  useEffect(() => {
    Promise.all([
      usersAPI.getEnrollments().then((res) => setEnrollments((res.data.data as Enrollment[]).filter((e) => e.status !== "REFUNDED"))),
      learnerAPI.bookmarks().then((res) => setSaved(res.data.data)).catch(() => {}),
    ]).catch(() => {}).finally(() => setLoading(false));
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
            { key: "saved", label: `Saved (${saved.length})` },
          ].map((tab) => (
            <div
              key={tab.key}
              className={`tab ${filter === tab.key ? "active" : ""}`}
              onClick={() => setFilter(tab.key as "all" | "active" | "completed" | "saved")}
            >
              {tab.label}
            </div>
          ))}
        </div>

        {loading ? (
          <div className="my-course-grid">
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
        ) : filter === "saved" ? (
          saved.length === 0 ? (
            <div className="card"><div className="empty-state">
              <div className="empty-state-icon">🔖</div>
              <div className="empty-state-title">No saved courses</div>
              <div className="empty-state-text">Tap “Save” on any course page to keep it here for later.</div>
              <Link href="/courses" className="btn btn-dark">Browse Courses</Link>
            </div></div>
          ) : (
            <div className="my-course-grid">
              {saved.map(({ id, course }) => (
                <Link href={`/courses/${course.slug}`} key={id}>
                  <div className="my-course-card">
                    {course.category?.name && <span className="badge badge-success" style={{ alignSelf: "flex-start" }}>{course.category.name}</span>}
                    <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
                      {course.thumbnail ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={course.thumbnail} alt="" className="my-course-thumb" />
                      ) : (
                        <div className="my-course-thumb">📚</div>
                      )}
                      <div style={{ minWidth: 0 }}>
                        <div className="course-card-title" style={{ fontSize: 17, marginBottom: 4 }}>{course.title}</div>
                        {course.shortDesc && <div style={{ fontSize: 12.5, color: "var(--gray-500)" }}>{course.shortDesc.slice(0, 90)}</div>}
                      </div>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginTop: "auto" }}>
                      <div className="course-card-meta" style={{ marginBottom: 0 }}>
                        <span style={{ display: "flex", alignItems: "center", gap: 4 }}><BookOpen size={13} /> {course.totalLessons} lessons</span>
                      </div>
                      <span className="btn btn-dark btn-sm">View course</span>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )
        ) : filtered.length === 0 ? (
          <div className="card"><div className="empty-state">
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
                <button className="btn btn-dark btn-lg">Browse Courses</button>
              </Link>
            )}
          </div></div>
        ) : (
          <div className="my-course-grid">
            {filtered.map((enrollment) => {
              const progress = Math.round(parseFloat(String(enrollment.progressPercent)) || 0);
              const completed = enrollment.status === "COMPLETED";
              return (
                <Link href={`/courses/${enrollment.course.slug}`} key={enrollment.id}>
                  <div className="my-course-card">
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                      {enrollment.course.category?.name && (
                        <span className="badge badge-success">{enrollment.course.category.name}</span>
                      )}
                      {completed ? (
                        <span className="badge badge-violet"><CheckCircle size={12} /> Completed</span>
                      ) : progress === 0 ? (
                        <span className="badge badge-warning">New</span>
                      ) : null}
                    </div>

                    <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
                      {enrollment.course.thumbnail ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={enrollment.course.thumbnail} alt="" className="my-course-thumb" />
                      ) : (
                        <div className="my-course-thumb">📚</div>
                      )}
                      <div style={{ minWidth: 0 }}>
                        <div className="course-card-title" style={{ fontSize: 17, marginBottom: 4 }}>{enrollment.course.title}</div>
                        <div style={{ fontSize: 12.5, color: "var(--gray-500)" }}>Enrolled {formatDate(enrollment.enrolledAt)}</div>
                      </div>
                    </div>

                    <div>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6, fontSize: 13, color: "var(--gray-600)" }}>
                        <span>Progress</span>
                        <span>{completed ? "Completed" : `${progress}%`}</span>
                      </div>
                      <div className="progress-bar">
                        <div className="progress-fill" style={{ width: `${completed ? 100 : progress}%` }} />
                      </div>
                    </div>

                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginTop: "auto", flexWrap: "wrap" }}>
                      <div className="course-card-meta" style={{ marginBottom: 0 }}>
                        {enrollment.course.totalDuration > 0 && (
                          <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                            <Clock size={13} /> {formatDuration(enrollment.course.totalDuration)}
                          </span>
                        )}
                        <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                          <BookOpen size={13} /> {enrollment.course.totalLessons} lessons
                        </span>
                      </div>
                      {completed ? (
                        <button className="btn btn-outline btn-sm">Review Course</button>
                      ) : (
                        <button className="btn btn-dark btn-sm">
                          {progress === 0 ? "Start" : <><Play size={13} /> Continue</>}
                        </button>
                      )}
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </LearnerContentProtection>
    </AppLayout>
  );
}
