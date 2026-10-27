"use client";

import { useState } from "react";
import toast from "react-hot-toast";
import { Award, BookOpen, Download, GraduationCap, Search, Users } from "lucide-react";
import { apiErrorMessage, displayLogin, downloadBlob, schoolsAPI } from "@/lib/api";

export interface SchoolOverviewData {
  summary: {
    totalStudents: number;
    activeStudents: number;
    activeThisWeek: number;
    neverLoggedIn: number;
    notStarted: number;
    totalTeachers: number;
    totalEnrollments: number;
    completedEnrollments: number;
    certificatesIssued: number;
    completionRate: number;
    averageProgress: number;
  };
  students: {
    id: string;
    firstName: string;
    lastName: string;
    username?: string | null;
    email: string;
    guardianEmail?: string | null;
    guardianPhone?: string | null;
    isActive: boolean;
    lastLogin?: string | null;
    createdAt: string;
    createdBy?: { firstName: string; lastName: string; role: string } | null;
    classes: { id: string; name: string; section?: string | null }[];
    enrollments: { status: string; progressPercent: number; course: { id: string; title: string } }[];
    certificates: { certificateId: string }[];
    averageProgress: number;
    completedCourses: number;
    lastActive?: string | null;
  }[];
  teachers: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    phone?: string | null;
    isActive: boolean;
    lastLogin?: string | null;
    classes: { id: string; name: string; section?: string | null }[];
    studentsCreated: number;
  }[];
  courseStats: { id: string; title: string; enrolled: number; completed: number; averageProgress: number }[];
}

const ago = (iso?: string | null) => {
  if (!iso) return "Never";
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 30) return `${days} days ago`;
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
};

const className = (c: { name: string; section?: string | null }) => `${c.name}${c.section ? ` (${c.section})` : ""}`;

function Progress({ value }: { value: number }) {
  const pct = Math.round(value);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 110 }}>
      <div style={{ flex: 1, height: 6, borderRadius: 3, background: "var(--border, #e5e7eb)", overflow: "hidden" }}>
        <div style={{ width: `${pct}%`, height: "100%", background: "linear-gradient(90deg, #1d4ed8, #8b5cf6)" }} />
      </div>
      <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>{pct}%</span>
    </div>
  );
}

export default function SchoolOverview({ schoolId, schoolCode, data }: { schoolId: string; schoolCode: string; data: SchoolOverviewData | null }) {
  const [search, setSearch] = useState("");
  const [exporting, setExporting] = useState(false);

  const exportStudents = async () => {
    setExporting(true);
    try {
      const res = await schoolsAPI.exportStudents(schoolId);
      downloadBlob(res.data, `school-${schoolCode}-students_${new Date().toISOString().split("T")[0]}.csv`);
      toast.success("Student list exported.");
    } catch (err) {
      toast.error(apiErrorMessage(err, "Export failed."));
    } finally {
      setExporting(false);
    }
  };

  if (!data) {
    return (
      <div className="tab-pane">
        <div className="empty-panel"><p>Loading school details…</p></div>
      </div>
    );
  }

  const term = search.trim().toLowerCase();
  const students = term
    ? data.students.filter((s) =>
        `${s.firstName} ${s.lastName} ${s.username || ""} ${s.guardianEmail || ""} ${s.classes.map(className).join(" ")}`.toLowerCase().includes(term)
      )
    : data.students;
  const s = data.summary;

  return (
    <div className="tab-pane">
      <div className="pane-header">
        <div>
          <h2>School Overview</h2>
          <p>Every student linked to this school — added by its teachers, imported, or placed in a class — with live progress</p>
        </div>
        <button className="btn-secondary" onClick={exportStudents} disabled={exporting || s.totalStudents === 0}>
          <Download size={15} /> {exporting ? "Exporting…" : "Export Students CSV"}
        </button>
      </div>

      <div className="analytics-overview-cards" style={{ marginBottom: "1.5rem" }}>
        {[
          ["Students", s.totalStudents, `${s.activeStudents} active accounts`],
          ["Active this week", s.activeThisWeek, `${s.neverLoggedIn} never signed in`],
          ["Teachers", s.totalTeachers, "linked to this school"],
          ["Course enrollments", s.totalEnrollments, `${s.notStarted} students not enrolled yet`],
          ["Completion rate", `${s.completionRate.toFixed(1)}%`, `${s.completedEnrollments} completed`],
          ["Average progress", `${Math.round(s.averageProgress)}%`, `${s.certificatesIssued} certificates issued`],
        ].map(([title, value, sub]) => (
          <div key={String(title)} className="stat-box">
            <span className="stat-title">{title}</span>
            <span className="stat-num">{value}</span>
            <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>{sub}</span>
          </div>
        ))}
      </div>

      {/* Students */}
      <div className="pane-header" style={{ marginTop: "0.5rem" }}>
        <div>
          <h2 style={{ fontSize: "1.05rem", display: "flex", alignItems: "center", gap: 8 }}><Users size={17} /> Students ({data.students.length})</h2>
        </div>
        <div className="member-search-box" style={{ maxWidth: 320 }}>
          <Search size={16} className="search-icon" />
          <input type="text" placeholder="Search name, login ID, class…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
      </div>

      {data.students.length === 0 ? (
        <div className="empty-panel">
          <Users size={40} className="empty-icon" />
          <h3>No students yet</h3>
          <p>Students appear here when a teacher of this school adds them, when they are imported for this school, or placed in one of its classes.</p>
        </div>
      ) : (
        <div className="table-responsive" style={{ marginBottom: "2rem" }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>Student</th>
                <th>Class</th>
                <th>Added by</th>
                <th>Courses</th>
                <th>Avg. progress</th>
                <th>Certificates</th>
                <th>Last active</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {students.map((st) => (
                <tr key={st.id}>
                  <td>
                    <div className="member-profile-cell">
                      <div className="member-avatar avatar-student"><span>{st.firstName.charAt(0).toUpperCase()}</span></div>
                      <div className="member-info">
                        <span className="member-name">{st.firstName} {st.lastName}</span>
                        <span className="member-email">{displayLogin(st)}{st.guardianPhone ? ` · ${st.guardianPhone}` : ""}</span>
                      </div>
                    </div>
                  </td>
                  <td><span className="member-classes-text">{st.classes.map(className).join(", ") || "—"}</span></td>
                  <td><span className="member-classes-text">{st.createdBy ? `${st.createdBy.firstName} ${st.createdBy.lastName}` : "—"}</span></td>
                  <td title={st.enrollments.map((e) => `${e.course.title} — ${Math.round(e.progressPercent)}%`).join("\n")}>
                    {st.enrollments.length}
                    {st.completedCourses > 0 && <span style={{ fontSize: 12, color: "#059669" }}> · {st.completedCourses} done</span>}
                  </td>
                  <td>{st.enrollments.length ? <Progress value={st.averageProgress} /> : <span className="member-date-text">Not started</span>}</td>
                  <td>{st.certificates.length ? <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}><Award size={13} color="#d97706" /> {st.certificates.length}</span> : "0"}</td>
                  <td><span className="member-date-text">{ago(st.lastActive)}</span></td>
                  <td>
                    <span className={`status-pill ${st.isActive ? "status-pill--active" : "status-pill--inactive"}`}>
                      {st.isActive ? "Active" : "Inactive"}
                    </span>
                  </td>
                </tr>
              ))}
              {students.length === 0 && (
                <tr><td colSpan={8} style={{ textAlign: "center", color: "var(--text-secondary)" }}>No students match “{search}”.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Teachers */}
      <h2 style={{ fontSize: "1.05rem", fontWeight: 700, display: "flex", alignItems: "center", gap: 8, margin: "0 0 0.75rem" }}>
        <GraduationCap size={17} /> Teachers ({data.teachers.length})
      </h2>
      {data.teachers.length === 0 ? (
        <div className="empty-panel" style={{ marginBottom: "2rem" }}>
          <p>No teachers linked yet. Add a teacher from the Members tab or assign one to a class.</p>
        </div>
      ) : (
        <div className="table-responsive" style={{ marginBottom: "2rem" }}>
          <table className="data-table">
            <thead>
              <tr><th>Teacher</th><th>Classes</th><th>Students added</th><th>Last login</th><th>Status</th></tr>
            </thead>
            <tbody>
              {data.teachers.map((t) => (
                <tr key={t.id}>
                  <td>
                    <div className="member-profile-cell">
                      <div className="member-avatar avatar-teacher"><span>{t.firstName.charAt(0).toUpperCase()}</span></div>
                      <div className="member-info">
                        <span className="member-name">{t.firstName} {t.lastName}</span>
                        <span className="member-email">{t.email}{t.phone ? ` · ${t.phone}` : ""}</span>
                      </div>
                    </div>
                  </td>
                  <td><span className="member-classes-text">{t.classes.map(className).join(", ") || "—"}</span></td>
                  <td>{t.studentsCreated}</td>
                  <td><span className="member-date-text">{ago(t.lastLogin)}</span></td>
                  <td>
                    <span className={`status-pill ${t.isActive ? "status-pill--active" : "status-pill--inactive"}`}>{t.isActive ? "Active" : "Inactive"}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Courses */}
      <h2 style={{ fontSize: "1.05rem", fontWeight: 700, display: "flex", alignItems: "center", gap: 8, margin: "0 0 0.75rem" }}>
        <BookOpen size={17} /> Course uptake
      </h2>
      {data.courseStats.length === 0 ? (
        <div className="empty-panel"><p>No student of this school is enrolled in a course yet.</p></div>
      ) : (
        <div className="table-responsive">
          <table className="data-table">
            <thead>
              <tr><th>Course</th><th>Students enrolled</th><th>Completed</th><th>Avg. progress</th></tr>
            </thead>
            <tbody>
              {data.courseStats.map((c) => (
                <tr key={c.id}>
                  <td style={{ fontWeight: 600 }}>{c.title}</td>
                  <td>{c.enrolled}</td>
                  <td>{c.completed}</td>
                  <td><Progress value={c.averageProgress} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
