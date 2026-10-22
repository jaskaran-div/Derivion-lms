"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import AppLayout from "@/components/layout/AppLayout";
import { coursesAPI, quizAPI } from "@/lib/api";
import Link from "next/link";
import { isAxiosError } from "axios";
import toast from "react-hot-toast";
import {
  ArrowLeft, Plus, Trash2, Upload, ChevronDown, ChevronUp,
  Video, FileText, Link2, HelpCircle, ToggleLeft, ToggleRight,
  Edit, GripVertical, Eye, Save, Lock, Unlock, Film, Book
} from "lucide-react";

type ContentType = "VIDEO" | "PDF" | "DOCUMENT" | "QUIZ" | "LINK";

interface Content {
  id: string; title: string; type: ContentType; duration?: number;
  isFree: boolean; isPublished: boolean; s3Key?: string; cloudFrontUrl?: string; order: number;
  assessmentId?: string | null;
  assessment?: { id: string; title: string; isPublished: boolean } | null;
}
interface QuizOption { id: string; title: string; isPublished: boolean; _count: { questions: number } }
interface Section {
  id: string; title: string; order: number; isPublished: boolean; contents: Content[];
}
interface Course {
  id: string; title: string; slug: string; status: string; price: number;
  emiEnabled: boolean;
  sections: Section[]; assessments: any[];
}

const contentTypeIcon = (type: ContentType) => {
  const icons: Record<ContentType, React.ReactNode> = {
    VIDEO: <Film size={14} />,
    PDF: <FileText size={14} />,
    DOCUMENT: <Book size={14} />,
    QUIZ: <HelpCircle size={14} />,
    LINK: <Link2 size={14} />,
  };
  return icons[type] || <FileText size={14} />;
};

const contentTypeClass: Record<ContentType, string> = {
  VIDEO: "video", PDF: "pdf", DOCUMENT: "pdf", QUIZ: "quiz", LINK: "link",
};

export default function CourseEditPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [course, setCourse] = useState<Course | null>(null);
  const [loading, setLoading] = useState(true);
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set());
  const [addingSectionTitle, setAddingSectionTitle] = useState("");
  const [showAddSection, setShowAddSection] = useState(false);
  const [addingContent, setAddingContent] = useState<{ sectionId: string; title: string; type: ContentType; assessmentId?: string } | null>(null);
  const [quizzes, setQuizzes] = useState<QuizOption[] | null>(null);
  const [uploadProgress, setUploadProgress] = useState<Record<string, number>>({});
  const [emiEnabled, setEmiEnabled] = useState(false);
  const [savingEmi, setSavingEmi] = useState(false);

  useEffect(() => { if (id) loadCourse(); }, [id]);

  // Load the quiz bank the first time the admin picks "Quiz" as a content type
  useEffect(() => {
    if (addingContent?.type === "QUIZ" && quizzes === null) {
      quizAPI.list().then((res) => setQuizzes(res.data.data)).catch(() => setQuizzes([]));
    }
  }, [addingContent?.type, quizzes]);

  const loadCourse = async () => {
    try {
      const res = await coursesAPI.adminGetOne(id as string);
      setCourse(res.data.data);
      setEmiEnabled(res.data.data.emiEnabled === true);
      // Auto-expand all sections by default so admin sees all lessons
      if (res.data.data.sections.length > 0) {
        setExpandedSections(new Set(res.data.data.sections.map((s: any) => s.id)));
      }
    } catch {
      toast.error("Failed to load course.");
    } finally {
      setLoading(false);
    }
  };

  const handleSaveEmi = async () => {
    if (!course) return;
    setSavingEmi(true);
    try {
      const res = await coursesAPI.update(course.id, { emiEnabled });
      setCourse((current) => current
        ? { ...current, emiEnabled: res.data.data.emiEnabled === true }
        : current);
      setEmiEnabled(res.data.data.emiEnabled === true);
      toast.success("EMI setting updated.");
    } catch (err: unknown) {
      const message = isAxiosError<{ message?: string }>(err)
        ? err.response?.data?.message
        : undefined;
      toast.error(message || "Failed to update EMI setting.");
    } finally {
      setSavingEmi(false);
    }
  };

  const handleAddSection = async () => {
    if (!addingSectionTitle.trim()) return;
    try {
      await coursesAPI.createSection(id as string, { title: addingSectionTitle });
      setAddingSectionTitle("");
      setShowAddSection(false);
      toast.success("Section added.");
      loadCourse();
    } catch {
      toast.error("Failed to add section.");
    }
  };

  const handleDeleteSection = async (sectionId: string) => {
    if (!confirm("Delete this section and all its content?")) return;
    try {
      await coursesAPI.deleteSection(sectionId);
      toast.success("Section deleted.");
      loadCourse();
    } catch {
      toast.error("Failed to delete section.");
    }
  };

  const handleToggleSectionPublish = async (sectionId: string, isPublished: boolean) => {
    try {
      await coursesAPI.updateSection(sectionId, { isPublished: !isPublished });
      loadCourse();
    } catch {
      toast.error("Failed to update section.");
    }
  };

  const handleAddContent = async () => {
    if (!addingContent) return;
    const isQuiz = addingContent.type === "QUIZ";
    if (isQuiz && !addingContent.assessmentId) {
      toast.error("Select a quiz.");
      return;
    }
    const title = addingContent.title.trim() || (isQuiz ? quizzes?.find((q) => q.id === addingContent.assessmentId)?.title : "") || "";
    if (!title) return;
    try {
      await coursesAPI.createContent(addingContent.sectionId, {
        title,
        type: addingContent.type,
        ...(isQuiz && { assessmentId: addingContent.assessmentId }),
      });
      setAddingContent(null);
      toast.success("Content added.");
      loadCourse();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || "Failed to add content.");
    }
  };

  const handleDeleteContent = async (contentId: string) => {
    if (!confirm("Delete this content?")) return;
    try {
      await coursesAPI.deleteContent(contentId);
      toast.success("Content deleted.");
      loadCourse();
    } catch {
      toast.error("Failed to delete content.");
    }
  };

  const handleVideoUpload = async (contentId: string, file: File) => {
    setUploadProgress((p) => ({ ...p, [contentId]: 0 }));
    try {
      await coursesAPI.uploadVideo(contentId, file, (progress) => {
        setUploadProgress((p) => ({ ...p, [contentId]: progress }));
      });
      toast.success("Video uploaded successfully!");
      setUploadProgress((p) => { const { [contentId]: _, ...rest } = p; return rest; });
      loadCourse();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || "Failed to upload video.");
      setUploadProgress((p) => { const { [contentId]: _, ...rest } = p; return rest; });
    }
  };

  const handleDocumentUpload = async (contentId: string, file: File) => {
    try {
      await coursesAPI.uploadDocument(contentId, file);
      toast.success("Document uploaded!");
      loadCourse();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || "Failed to upload document.");
    }
  };

  const handlePublishCourse = async () => {
    if (!course) return;
    try {
      await coursesAPI.togglePublish(course.id);
      toast.success(`Course ${course.status === "PUBLISHED" ? "unpublished" : "published"}.`);
      loadCourse();
    } catch {
      toast.error("Failed to update course status.");
    }
  };

  const toggleSection = (sectionId: string) => {
    setExpandedSections((prev) => {
      const next = new Set(prev);
      if (next.has(sectionId)) next.delete(sectionId);
      else next.add(sectionId);
      return next;
    });
  };

  const formatDuration = (seconds?: number) => {
    if (!seconds) return "";
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${String(s).padStart(2, "0")}`;
  };

  if (loading) {
    return (
      <AppLayout requiredRole="ADMIN">
        <div style={{ display: "flex", justifyContent: "center", alignItems: "center", height: 400 }}>
          <div className="animate-spin" style={{ fontSize: 32 }}>⏳</div>
        </div>
      </AppLayout>
    );
  }

  if (!course) return null;

  return (
    <AppLayout requiredRole="ADMIN">
      {/* Header */}
      <div className="page-header">
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <button className="btn btn-ghost btn-icon" onClick={() => router.push("/admin/courses")}>
            <ArrowLeft size={20} />
          </button>
          <div>
            <h1 className="page-title">{course.title}</h1>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4 }}>
              <span className={`badge ${course.status === "PUBLISHED" ? "badge-success" : "badge-warning"}`}>
                {course.status}
              </span>
              <span style={{ fontSize: 13, color: "var(--gray-400)" }}>
                {course.sections.length} sections •{" "}
                {course.sections.reduce((acc, s) => acc + s.contents.length, 0)} lessons
              </span>
            </div>
          </div>
        </div>
        <div className="page-actions">
          <button
            className={`btn ${course.status === "PUBLISHED" ? "btn-secondary" : "btn-success"}`}
            onClick={handlePublishCourse}
          >
            {course.status === "PUBLISHED" ? (
              <><ToggleRight size={16} /> Unpublish</>
            ) : (
              <><ToggleLeft size={16} /> Publish Course</>
            )}
          </button>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 20 }}>
        <div className="card-header"><span className="card-title">Payment Options</span></div>
        <div className="card-body">
          <label style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 14, fontWeight: 500, cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={emiEnabled}
              onChange={(event) => setEmiEnabled(event.target.checked)}
              disabled={savingEmi}
              style={{ width: 16, height: 16, accentColor: "var(--primary)", cursor: "pointer" }}
            />
            Enable EMI for this course
          </label>
          <div className="form-hint" style={{ marginTop: 8 }}>
            When enabled, eligible students may see supported EMI payment options at checkout. Availability depends on Razorpay, the payment provider and customer eligibility.
          </div>
          <button
            className="btn btn-primary btn-sm"
            style={{ marginTop: 14 }}
            onClick={handleSaveEmi}
            disabled={savingEmi || emiEnabled === course.emiEnabled}
          >
            {savingEmi ? "Saving..." : "Save EMI setting"}
          </button>
        </div>
      </div>

      {/* Curriculum Builder */}
      <div className="card">
        <div className="card-header">
          <span className="card-title">Course Curriculum</span>
          <button
            className="btn btn-primary btn-sm"
            onClick={() => setShowAddSection(true)}
          >
            <Plus size={14} /> Add Section
          </button>
        </div>

        <div style={{ padding: "16px" }}>
          {/* Add Section form */}
          {showAddSection && (
            <div
              style={{
                background: "var(--primary-50)",
                border: "2px dashed var(--primary-light)",
                borderRadius: "var(--radius-md)",
                padding: 16,
                marginBottom: 12,
                display: "flex",
                gap: 10,
              }}
            >
              <input
                className="form-control"
                placeholder="Section title e.g., Introduction to HTML"
                value={addingSectionTitle}
                onChange={(e) => setAddingSectionTitle(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleAddSection()}
                autoFocus
              />
              <button className="btn btn-primary btn-sm" onClick={handleAddSection}>Add</button>
              <button className="btn btn-secondary btn-sm" onClick={() => setShowAddSection(false)}>Cancel</button>
            </div>
          )}

          {course.sections.length === 0 && !showAddSection ? (
            <div className="empty-state" style={{ padding: "48px 24px" }}>
              <div className="empty-state-icon">📖</div>
              <div className="empty-state-title">No sections yet</div>
              <div className="empty-state-text">
                Start building your course curriculum by adding sections.
              </div>
              <button className="btn btn-primary" onClick={() => setShowAddSection(true)}>
                <Plus size={16} /> Add First Section
              </button>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {course.sections.sort((a, b) => a.order - b.order).map((section, si) => (
                <div key={section.id} className="accordion-item">
                  {/* Section header */}
                  <div className="accordion-header">
                    <div style={{ display: "flex", alignItems: "center", gap: 10, flex: 1 }}>
                      <GripVertical size={16} color="var(--gray-300)" style={{ cursor: "grab" }} />
                      <span style={{ fontSize: 13, color: "var(--gray-400)", fontWeight: 500 }}>
                        Section {si + 1}
                      </span>
                      <span style={{ fontWeight: 600, fontSize: 14 }}>{section.title}</span>
                      <span style={{ fontSize: 12, color: "var(--gray-400)", marginLeft: 4 }}>
                        ({section.contents.length} lessons)
                      </span>
                      {!section.isPublished && (
                        <span className="badge badge-warning" style={{ fontSize: 10 }}>Draft</span>
                      )}
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <button
                        className="btn btn-ghost btn-icon btn-sm"
                        onClick={() => handleToggleSectionPublish(section.id, section.isPublished)}
                        title={section.isPublished ? "Unpublish" : "Publish"}
                      >
                        {section.isPublished ? <Unlock size={14} color="var(--success)" /> : <Lock size={14} />}
                      </button>
                      <button
                        className="btn btn-ghost btn-icon btn-sm"
                        onClick={() => handleDeleteSection(section.id)}
                        title="Delete section"
                      >
                        <Trash2 size={14} color="var(--danger)" />
                      </button>
                      <button
                        className="btn btn-ghost btn-icon btn-sm"
                        onClick={() => toggleSection(section.id)}
                      >
                        {expandedSections.has(section.id) ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                      </button>
                    </div>
                  </div>

                  {/* Section contents */}
                  {expandedSections.has(section.id) && (
                    <div className="accordion-body" style={{ maxHeight: "none", overflow: "visible" }}>
                      {section.contents.sort((a, b) => a.order - b.order).map((content, ci) => (
                        <div
                          key={content.id}
                          className="accordion-lesson"
                          style={{ flexWrap: "wrap", gap: 10, alignItems: "flex-start" }}
                        >
                          <GripVertical size={14} color="var(--gray-300)" style={{ cursor: "grab", flexShrink: 0, marginTop: 2 }} />
                          <div className={`lesson-type-icon ${contentTypeClass[content.type]}`}>
                            {contentTypeIcon(content.type)}
                          </div>
                          <div style={{ flex: 1, minWidth: 200 }}>
                            <div style={{ fontSize: 13, fontWeight: 500, color: "var(--gray-800)" }}>
                              {content.title}
                              {content.isFree && (
                                <span className="badge badge-success" style={{ marginLeft: 8, fontSize: 10 }}>Free Preview</span>
                              )}
                              {content.duration && (
                                <span style={{ fontSize: 11, color: "var(--gray-400)", marginLeft: 8 }}>
                                  {formatDuration(content.duration)}
                                </span>
                              )}
                            </div>
                          </div>

                          {content.type === "QUIZ" && (
                            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                              {content.assessment ? (
                                <>
                                  {!content.assessment.isPublished && (
                                    <span className="badge badge-warning" style={{ fontSize: 10 }}>Quiz is draft</span>
                                  )}
                                  <Link href={`/admin/quizzes/${content.assessment.id}`}>
                                    <button type="button" className="btn btn-secondary btn-sm" style={{ fontSize: 12 }}>
                                      <HelpCircle size={12} /> {content.assessment.title}
                                    </button>
                                  </Link>
                                </>
                              ) : (
                                <span className="badge badge-danger" style={{ fontSize: 10 }}>No quiz linked</span>
                              )}
                            </div>
                          )}

                          {/* Upload actions for Video/PDF */}
                          {(content.type === "VIDEO" || content.type === "PDF" || content.type === "DOCUMENT") && (
                            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                              {uploadProgress[content.id] !== undefined ? (
                                <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: "var(--primary)" }}>
                                  <div className="progress-bar" style={{ width: 100 }}>
                                    <div className="progress-fill" style={{ width: `${uploadProgress[content.id]}%` }} />
                                  </div>
                                  {uploadProgress[content.id] >= 90 && uploadProgress[content.id] < 100
                                    ? "Saving to AWS…"
                                    : `${uploadProgress[content.id]}%`}
                                </div>
                              ) : (
                                <>
                                  {content.cloudFrontUrl ? (
                                    <span className="badge badge-success" style={{ fontSize: 10 }}>✓ Uploaded</span>
                                  ) : null}
                                  <label
                                    style={{ cursor: "pointer" }}
                                    title={content.type === "VIDEO" ? "Upload video" : "Upload document"}
                                  >
                                    <button
                                      type="button"
                                      className="btn btn-secondary btn-sm"
                                      onClick={() => document.getElementById(`file-input-${content.id}`)?.click()}
                                      style={{ fontSize: 12 }}
                                    >
                                      <Upload size={12} />
                                      {content.cloudFrontUrl ? "Replace" : "Upload"}
                                    </button>
                                    <input
                                      id={`file-input-${content.id}`}
                                      type="file"
                                      style={{ display: "none" }}
                                      accept={content.type === "VIDEO" ? "video/*" : ".pdf,.doc,.docx,.ppt,.pptx"}
                                      onChange={(e) => {
                                        const file = e.target.files?.[0];
                                        if (!file) return;
                                        if (content.type === "VIDEO") {
                                          handleVideoUpload(content.id, file);
                                        } else {
                                          handleDocumentUpload(content.id, file);
                                        }
                                      }}
                                    />
                                  </label>
                                </>
                              )}
                            </div>
                          )}

                          <button
                            className="btn btn-ghost btn-icon btn-sm"
                            onClick={() => handleDeleteContent(content.id)}
                            disabled={uploadProgress[content.id] !== undefined}
                            title={uploadProgress[content.id] !== undefined ? "Uploading..." : "Delete"}
                          >
                            <Trash2 size={13} color={uploadProgress[content.id] !== undefined ? "var(--gray-300)" : "var(--danger)"} />
                          </button>
                        </div>
                      ))}

                      {/* Add content */}
                      {addingContent?.sectionId === section.id ? (
                        <div style={{ padding: "12px 18px", background: "var(--gray-50)", borderTop: "1px solid var(--gray-100)" }}>
                          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                            <select
                              className="form-control"
                              style={{ width: 140 }}
                              value={addingContent.type}
                              onChange={(e) => setAddingContent({ ...addingContent, type: e.target.value as ContentType, assessmentId: undefined })}
                            >
                              <option value="VIDEO">📹 Video</option>
                              <option value="PDF">📄 PDF</option>
                              <option value="DOCUMENT">📝 Document</option>
                              <option value="QUIZ">🎯 Quiz</option>
                              <option value="LINK">🔗 Link</option>
                            </select>
                            {addingContent.type === "QUIZ" && (
                              <select
                                className="form-control"
                                style={{ flex: 1, minWidth: 200 }}
                                value={addingContent.assessmentId || ""}
                                onChange={(e) => setAddingContent({ ...addingContent, assessmentId: e.target.value || undefined })}
                              >
                                <option value="">{quizzes === null ? "Loading quizzes…" : quizzes.length === 0 ? "No quizzes — create one first" : "Select a quiz…"}</option>
                                {(quizzes || []).map((q) => (
                                  <option key={q.id} value={q.id}>
                                    {q.title} ({q._count.questions} Q{q.isPublished ? "" : ", draft"})
                                  </option>
                                ))}
                              </select>
                            )}
                            <input
                              className="form-control"
                              style={{ flex: 1, minWidth: 200 }}
                              placeholder={addingContent.type === "QUIZ" ? "Lesson title (defaults to quiz name)" : "Content title"}
                              value={addingContent.title}
                              onChange={(e) => setAddingContent({ ...addingContent, title: e.target.value })}
                              onKeyDown={(e) => e.key === "Enter" && handleAddContent()}
                              autoFocus
                            />
                            <button className="btn btn-primary btn-sm" onClick={handleAddContent}>Add</button>
                            <button className="btn btn-secondary btn-sm" onClick={() => setAddingContent(null)}>Cancel</button>
                          </div>
                          {addingContent.type === "QUIZ" && (
                            <div className="form-hint" style={{ marginTop: 6 }}>
                              Quizzes are managed in <Link href="/admin/quizzes" style={{ color: "var(--primary)" }}>Quizzes</Link>.
                            </div>
                          )}
                        </div>
                      ) : (
                        <div style={{ padding: "10px 18px", borderTop: "1px solid var(--gray-100)" }}>
                          <button
                            className="btn btn-ghost btn-sm"
                            style={{ color: "var(--primary)", fontSize: 13 }}
                            onClick={() => setAddingContent({ sectionId: section.id, title: "", type: "VIDEO" })}
                          >
                            <Plus size={14} /> Add Content
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  );
}
