"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import AppLayout from "@/components/layout/AppLayout";
import { teacherAPI } from "@/lib/api";
import { BookOpen, Clock, ExternalLink, GraduationCap, Library, Search, Users } from "lucide-react";

interface TeacherCourse {
  id: string;
  title: string;
  slug: string;
  thumbnail?: string | null;
  shortDesc?: string | null;
  level?: string;
  language?: string;
  totalLessons: number;
  totalDuration: number;
  category?: { name: string } | null;
  assignedVia: string[];
  myStudents: number;
  completed: number;
  averageProgress: number;
}

const hours = (seconds: number) => {
  if (!seconds) return null;
  const h = Math.floor(seconds / 3600);
  const m = Math.round((seconds % 3600) / 60);
  return h ? `${h}h ${m}m` : `${m}m`;
};

export default function TeacherCoursesPage() {
  const [courses, setCourses] = useState<TeacherCourse[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [search, setSearch] = useState("");

  useEffect(() => {
    teacherAPI
      .myCourses()
      .then((res) => setCourses(res.data.data))
      .catch(() => setFailed(true))
      .finally(() => setLoading(false));
  }, []);

  const term = search.trim().toLowerCase();
  const shown = term ? courses.filter((c) => c.title.toLowerCase().includes(term) || c.category?.name.toLowerCase().includes(term)) : courses;
  const totalEnrolled = courses.reduce((s, c) => s + c.myStudents, 0);

  return (
    <AppLayout requiredRole="TEACHER">
      <div className="page-header">
        <div>
          <h1 className="page-title">My Courses</h1>
          <p className="page-subtitle">Courses you have access to and can enroll your students in</p>
        </div>
      </div>

      <div className="grid-3" style={{ marginBottom: 20 }}>
        {[
          { label: "Courses available", value: courses.length, icon: <Library size={20} /> },
          { label: "Your student enrollments", value: totalEnrolled, icon: <Users size={20} /> },
          { label: "Completions", value: courses.reduce((s, c) => s + c.completed, 0), icon: <GraduationCap size={20} /> },
        ].map((s) => (
          <div key={s.label} className="card" style={{ padding: 18, display: "flex", alignItems: "center", gap: 14 }}>
            <div style={{ width: 42, height: 42, borderRadius: 12, background: "var(--primary-50)", color: "var(--primary)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              {s.icon}
            </div>
            <div>
              <div style={{ fontSize: 22, fontWeight: 700, color: "var(--gray-900)" }}>{loading ? "—" : s.value}</div>
              <div style={{ fontSize: 13, color: "var(--gray-500)" }}>{s.label}</div>
            </div>
          </div>
        ))}
      </div>

      {courses.length > 6 && (
        <div className="search-bar" style={{ maxWidth: 380, marginBottom: 16 }}>
          <Search size={16} color="var(--gray-400)" />
          <input placeholder="Search courses…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
      )}

      {loading ? (
        <div className="grid-3">
          {[1, 2, 3].map((i) => <div key={i} className="skeleton" style={{ height: 280, borderRadius: 16 }} />)}
        </div>
      ) : failed ? (
        <div className="empty-state">
          <div className="empty-state-title">Couldn&apos;t load your courses</div>
          <div className="empty-state-text">Please refresh the page to try again.</div>
        </div>
      ) : shown.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon"><BookOpen size={36} /></div>
          <div className="empty-state-title">{term ? "No courses match your search" : "No courses assigned yet"}</div>
          <div className="empty-state-text">Ask your administrator to assign courses to your school or classes.</div>
        </div>
      ) : (
        <div className="grid-3">
          {shown.map((c) => (
            <div key={c.id} className="card" style={{ overflow: "hidden", display: "flex", flexDirection: "column" }}>
              <div style={{ aspectRatio: "16 / 9", background: "linear-gradient(135deg, #172554, #1e40af)", display: "flex", alignItems: "center", justifyContent: "center", color: "white" }}>
                {c.thumbnail ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={c.thumbnail} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                ) : (
                  <BookOpen size={36} />
                )}
              </div>
              <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 10, flex: 1 }}>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {c.category && <span className="badge badge-blue">{c.category.name}</span>}
                  {c.level && <span className="badge badge-gray">{c.level}</span>}
                </div>
                <h3 style={{ fontSize: 15, fontWeight: 700, color: "var(--gray-900)", lineHeight: 1.35 }}>{c.title}</h3>
                <div style={{ display: "flex", gap: 14, fontSize: 12, color: "var(--gray-500)" }}>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}><BookOpen size={13} /> {c.totalLessons} lessons</span>
                  {hours(c.totalDuration) && <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}><Clock size={13} /> {hours(c.totalDuration)}</span>}
                </div>

                <div style={{ background: "var(--gray-50)", borderRadius: 10, padding: "10px 12px", fontSize: 13 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                    <span style={{ color: "var(--gray-600)" }}>Your students enrolled</span>
                    <strong>{c.myStudents}</strong>
                  </div>
                  {c.myStudents > 0 && (
                    <>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                        <span style={{ color: "var(--gray-600)" }}>Completed</span>
                        <strong>{c.completed}</strong>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <div className="progress-bar" style={{ flex: 1 }} role="progressbar" aria-label="Average progress" aria-valuenow={Math.round(c.averageProgress)} aria-valuemin={0} aria-valuemax={100}>
                          <div className="progress-fill" style={{ width: `${Math.round(c.averageProgress)}%` }} />
                        </div>
                        <span style={{ fontSize: 12, color: "var(--gray-600)" }}>{Math.round(c.averageProgress)}% avg</span>
                      </div>
                    </>
                  )}
                </div>

                {c.assignedVia.length > 0 && (
                  <div style={{ fontSize: 12, color: "var(--gray-500)" }}>Assigned to {c.assignedVia.join(", ")}</div>
                )}

                <div style={{ marginTop: "auto", display: "flex", gap: 8 }}>
                  <Link href={`/courses/${c.slug}`} className="btn btn-secondary btn-sm" style={{ flex: 1, justifyContent: "center" }}>
                    <ExternalLink size={14} /> View course
                  </Link>
                  <Link href="/teacher/students" className="btn btn-primary btn-sm" style={{ flex: 1, justifyContent: "center" }}>
                    <Users size={14} /> Enroll students
                  </Link>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </AppLayout>
  );
}
