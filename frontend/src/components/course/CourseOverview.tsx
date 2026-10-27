import { Award, BookOpen, CheckCircle2, Clock, Globe, PlayCircle, Users } from "lucide-react";
import type { Course } from "./types";
import { formatDuration } from "./format";

export default function CourseOverview({ course, totalLessons, totalDuration }: { course: Course; totalLessons: number; totalDuration: number }) {
  return (
    <div>
      <h3 className="overview-summary-heading">Summary</h3>
      <p className="overview-summary-text" style={{ whiteSpace: "pre-line" }}>
        {course.description || course.shortDesc || "No description yet."}
      </p>

      <div className="course-specs-grid">
        <div className="course-spec-row"><span className="spec-icon"><BookOpen size={16} /></span><span>Skill level: <strong>{course.level || "All levels"}</strong></span></div>
        <div className="course-spec-row"><span className="spec-icon"><PlayCircle size={16} /></span><span>Lessons: <strong>{totalLessons}</strong></span></div>
        <div className="course-spec-row"><span className="spec-icon"><Users size={16} /></span><span>Learners: <strong>{(course.totalStudents || 0).toLocaleString("en-IN")}</strong></span></div>
        <div className="course-spec-row"><span className="spec-icon"><Clock size={16} /></span><span>Duration: <strong>{totalDuration > 0 ? formatDuration(totalDuration) : "—"}</strong></span></div>
        <div className="course-spec-row"><span className="spec-icon"><Globe size={16} /></span><span>Language: <strong>{course.language || "English"}</strong></span></div>
        <div className="course-spec-row"><span className="spec-icon"><Award size={16} /></span><span>Certificate: <strong>On completion</strong></span></div>
      </div>

      {course.objectives?.length > 0 && (
        <div style={{ marginBottom: 28 }}>
          <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 14 }}>What you&apos;ll learn</h3>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 12 }}>
            {course.objectives.map((obj, i) => (
              <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 10, fontSize: 14, color: "var(--gray-700)" }}>
                <CheckCircle2 size={16} color="var(--success)" style={{ flexShrink: 0, marginTop: 2 }} aria-hidden="true" />
                <span>{obj}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {course.requirements?.length > 0 && (
        <div>
          <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 12 }}>Requirements</h3>
          <ul style={{ paddingLeft: 20, color: "var(--gray-600)", fontSize: 14, lineHeight: 1.8 }}>
            {course.requirements.map((req, i) => <li key={i}>{req}</li>)}
          </ul>
        </div>
      )}
    </div>
  );
}
