"use client";

import { useState } from "react";
import { CheckCircle2, ChevronDown, ChevronUp, FileText, HelpCircle, Lock, MoreVertical, PlayCircle } from "lucide-react";
import type { Content, Course } from "./types";
import { formatDuration, lessonTypeLabel } from "./format";

function LessonTypeIcon({ type, size, color }: { type: string; size: number; color: string }) {
  if (type === "PDF" || type === "DOCUMENT") return <FileText size={size} color={color} aria-hidden="true" />;
  if (type === "QUIZ") return <HelpCircle size={size} color={color} aria-hidden="true" />;
  return <PlayCircle size={size} color={color} aria-hidden="true" />;
}

interface Props {
  course: Course;
  canAccess: boolean; // enrolled or admin
  activeId?: string;
  completedIds: Set<string>;
  onOpen: (content: Content) => void;
  onToggleComplete: (content: Content) => void;
}

// "Course Content" sidebar: progress summary and the expandable list of units and lessons
export default function CourseContentList({ course, canAccess, activeId, completedIds, onOpen, onToggleComplete }: Props) {
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(course.sections.map((s) => s.id)));
  const [showOptions, setShowOptions] = useState(false);

  const allContents = course.sections.flatMap((s) => s.contents);
  const total = allContents.length;
  const done = allContents.filter((c) => completedIds.has(c.id)).length;
  const percent = total ? Math.round((done / total) * 100) : 0;

  const toggle = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <div className="sidebar-content-card">
      <div className="sidebar-content-header">
        <span className="sidebar-content-title">Course Content</span>
        <div style={{ position: "relative" }}>
          <button
            className="btn btn-ghost btn-icon"
            onClick={() => setShowOptions(!showOptions)}
            aria-label="Course content options"
            aria-expanded={showOptions}
          >
            <MoreVertical size={18} />
          </button>
          {showOptions && (
            <div className="header-dropdown" style={{ minWidth: 150, top: "100%" }}>
              <button className="sidebar-nav-item plain" style={{ width: "100%", marginBottom: 0 }} onClick={() => { setExpanded(new Set(course.sections.map((s) => s.id))); setShowOptions(false); }}>
                Expand all
              </button>
              <button className="sidebar-nav-item plain" style={{ width: "100%", marginBottom: 0 }} onClick={() => { setExpanded(new Set()); setShowOptions(false); }}>
                Collapse all
              </button>
            </div>
          )}
        </div>
      </div>

      {canAccess && (
        <div style={{ padding: "12px 20px", background: "var(--gray-50)", borderBottom: "1px solid var(--gray-100)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, marginBottom: 6 }}>
            <span style={{ color: "var(--gray-600)" }}>Your Progress</span>
            <strong style={{ color: "var(--violet)" }}>{done}/{total} completed ({percent}%)</strong>
          </div>
          <div className="progress-bar" style={{ height: 6 }} role="progressbar" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100}>
            <div className="progress-fill" style={{ width: `${percent}%` }} />
          </div>
        </div>
      )}

      {course.sections.length === 0 ? (
        <div style={{ padding: "30px 20px", textAlign: "center", color: "var(--gray-500)", fontSize: 14 }}>No course content available yet.</div>
      ) : (
        course.sections.map((section) => {
          const sectionDone = section.contents.filter((c) => completedIds.has(c.id)).length;
          const sectionDuration = section.contents.reduce((d, c) => d + (c.duration || 0), 0);
          const isOpen = expanded.has(section.id);
          return (
            <div key={section.id} className="sidebar-section-item">
              <div className="sidebar-section-header" onClick={() => toggle(section.id)} aria-expanded={isOpen}>
                <div>
                  <div className="sidebar-section-title">{section.title}</div>
                  <div className="sidebar-section-sub">
                    {sectionDone}/{section.contents.length}{sectionDuration > 0 ? ` · ${formatDuration(sectionDuration)} total` : ""}
                  </div>
                </div>
                {isOpen ? <ChevronUp size={18} color="var(--gray-400)" /> : <ChevronDown size={18} color="var(--gray-400)" />}
              </div>

              {isOpen && (
                <div>
                  {section.contents.length === 0 ? (
                    <div style={{ padding: "12px 20px", fontSize: 13, color: "var(--gray-500)" }}>No lessons in this unit yet.</div>
                  ) : (
                    section.contents.map((content, i) => {
                      const isActive = activeId === content.id;
                      const isDone = completedIds.has(content.id);
                      const isLocked = !content.isFree && !canAccess;
                      // Quizzes complete only by passing; other lessons can be ticked off by hand
                      const canToggle = canAccess && content.type !== "QUIZ";
                      return (
                        <div
                          key={content.id}
                          className={`sidebar-lecture-row ${isActive ? "active" : ""}`}
                          onClick={() => onOpen(content)}
                          aria-current={isActive ? "true" : undefined}
                        >
                          <div className="lecture-main-info">
                            <div className="lecture-title">{String(i + 1).padStart(2, "0")}: {content.title}</div>
                            <div className="lecture-meta">
                              {isDone ? (
                                <span style={{ color: "var(--violet)", fontWeight: 600 }}>Completed</span>
                              ) : content.duration && content.duration > 0 ? (
                                <span>{formatDuration(content.duration)}</span>
                              ) : (
                                <span>{lessonTypeLabel(content.type)}</span>
                              )}
                              {content.isFree && !canAccess && (
                                <span className="badge badge-success" style={{ fontSize: 10, padding: "1px 6px" }}>Preview</span>
                              )}
                            </div>
                          </div>

                          <div className="lecture-status-icon">
                            {isLocked ? (
                              <Lock size={15} color="var(--gray-400)" aria-label="Locked" />
                            ) : canToggle ? (
                              <button
                                className="btn btn-ghost btn-icon"
                                style={{ padding: 2 }}
                                onClick={(e) => { e.stopPropagation(); onToggleComplete(content); }}
                                title={isDone ? "Mark as not completed" : "Mark as completed"}
                                aria-label={isDone ? `Mark ${content.title} as not completed` : `Mark ${content.title} as completed`}
                              >
                                {isDone
                                  ? <CheckCircle2 size={20} color="var(--violet)" fill="var(--violet-50)" />
                                  : <LessonTypeIcon type={content.type} size={18} color={isActive ? "var(--violet)" : "var(--gray-400)"} />}
                              </button>
                            ) : isDone ? (
                              <CheckCircle2 size={20} color="var(--violet)" fill="var(--violet-50)" aria-label="Completed" />
                            ) : (
                              <LessonTypeIcon type={content.type} size={18} color={isActive ? "var(--violet)" : "var(--gray-400)"} />
                            )}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              )}
            </div>
          );
        })
      )}
    </div>
  );
}
