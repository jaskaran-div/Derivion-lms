"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { Bookmark, CheckCircle2, ChevronRight, Clock, Globe, Play, Users } from "lucide-react";
import AppLayout from "@/components/layout/AppLayout";
import CustomVideoPlayer from "@/components/player/CustomVideoPlayer";
import LearnerContentProtection from "@/components/content/LearnerContentProtection";
import CourseShareMenu from "@/components/courses/CourseShareMenu";
import CourseContentList from "@/components/course/CourseContentList";
import CourseNotes from "@/components/course/CourseNotes";
import CourseOverview from "@/components/course/CourseOverview";
import DocumentViewer from "@/components/course/DocumentViewer";
import { useCourseCheckout } from "@/components/course/useCourseCheckout";
import { formatDuration, formatRelativeTime } from "@/components/course/format";
import type { Content, Course } from "@/components/course/types";
import { apiErrorMessage, coursesAPI, learnerAPI } from "@/lib/api";
import { useAuthStore } from "@/store/authStore";

// How often watch position is reported to the server while a video plays
const PROGRESS_INTERVAL_SECONDS = 30;

export default function CourseDetailPage() {
  const { slug } = useParams<{ slug: string }>();
  const router = useRouter();
  const { user, isAuthenticated } = useAuthStore();
  const [course, setCourse] = useState<Course | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeContent, setActiveContent] = useState<Content | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [activeTab, setActiveTab] = useState<"overview" | "notes">("overview");
  const [bookmarked, setBookmarked] = useState(false);
  const [completedIds, setCompletedIds] = useState<Set<string>>(new Set());
  const [currentTime, setCurrentTime] = useState(0);
  const lastReported = useRef<{ id: string; sec: number }>({ id: "", sec: 0 });

  const isStaff = user?.role === "ADMIN" || user?.role === "TEACHER";
  const canAccess = Boolean(course?.isEnrolled) || user?.role === "ADMIN";

  const loadCourse = useCallback(() => {
    return coursesAPI.getBySlug(slug)
      .then((res) => {
        const data: Course = res.data.data;
        setCourse(data);
        setBookmarked(Boolean(data.isBookmarked));
        setCompletedIds(new Set(data.sections.flatMap((s) => s.contents).filter((c) => c.isCompleted).map((c) => c.id)));
        setActiveContent((prev) => prev ?? data.sections[0]?.contents[0] ?? null);
      })
      .catch(() => {
        toast.error("Course not found.");
        router.push("/courses");
      })
      .finally(() => {
        setLoading(false);
      });
  }, [slug, router]);

  useEffect(() => {
    if (slug) loadCourse();
  }, [slug, loadCourse]);

  const { paying, enroll } = useCourseCheckout(course, user, async () => {
    await loadCourse();
    setIsPlaying(true);
  });

  const allContents = useMemo(() => (course?.sections || []).flatMap((s) => s.contents), [course]);
  const totalLessons = allContents.length || course?.totalLessons || 0;
  const totalDuration = allContents.reduce((acc, c) => acc + (c.duration || 0), 0) || course?.totalDuration || 0;

  const nextContent = useMemo(() => {
    if (!activeContent) return null;
    const i = allContents.findIndex((c) => c.id === activeContent.id);
    return i >= 0 ? allContents[i + 1] ?? null : null;
  }, [activeContent, allContents]);

  const goToLogin = () => router.push(`/login?next=${encodeURIComponent(`/courses/${slug}`)}`);

  const openContent = async (content: Content) => {
    if (!content.isFree && !canAccess) {
      if (!isAuthenticated) {
        toast("Log in and enroll to open this lesson.", { icon: "🔒" });
        goToLogin();
      } else {
        toast.error("Enroll in this course to access this lesson.");
      }
      return;
    }
    if (!isAuthenticated) {
      goToLogin();
      return;
    }
    if (content.type === "QUIZ") {
      if (!content.assessmentId) {
        toast.error("This quiz is not available yet.");
        return;
      }
      router.push(`/assessments/${content.assessmentId}?content=${content.id}`);
      return;
    }
    try {
      const res = await coursesAPI.getContent(content.id);
      setActiveContent({ ...content, ...res.data.data });
      setIsPlaying(true);
    } catch (err) {
      toast.error(apiErrorMessage(err, "Could not open this lesson."));
    }
  };

  // Fresh signed URL for the current lesson (the previous one may have expired)
  const refreshActiveSource = async () => {
    if (!activeContent) return;
    try {
      const res = await coursesAPI.getContent(activeContent.id);
      setActiveContent((prev) => (prev && prev.id === activeContent.id ? { ...prev, ...res.data.data } : prev));
    } catch {
      /* the player shows its error state */
    }
  };

  const setCompleted = (id: string, done: boolean) =>
    setCompletedIds((prev) => {
      const next = new Set(prev);
      if (done) next.add(id);
      else next.delete(id);
      return next;
    });

  const toggleComplete = async (content: Content, forceDone?: boolean) => {
    if (!canAccess || content.type === "QUIZ") return;
    const wasDone = completedIds.has(content.id);
    const done = forceDone ?? !wasDone;
    if (done === wasDone) return;
    setCompleted(content.id, done);
    try {
      const res = await coursesAPI.updateProgress(content.id, { isCompleted: done });
      if (res.data.data?.certificateIssued) toast.success("Course complete! Your certificate is ready. 🎓", { duration: 6000 });
      else if (done) toast.success("Lesson marked as complete! 🎉");
    } catch (err) {
      setCompleted(content.id, wasDone);
      toast.error(apiErrorMessage(err, "Failed to update progress."));
    }
  };

  const reportWatchTime = (seconds: number) => {
    if (!activeContent || !canAccess || user?.role === "ADMIN") return;
    const last = lastReported.current;
    if (last.id === activeContent.id && seconds - last.sec < PROGRESS_INTERVAL_SECONDS) return;
    lastReported.current = { id: activeContent.id, sec: seconds };
    coursesAPI.updateProgress(activeContent.id, { watchedSeconds: seconds, lastPosition: seconds }).catch(() => {});
  };

  const handleVideoEnded = () => {
    if (!activeContent) return;
    toggleComplete(activeContent, true);
    if (nextContent) {
      toast(`Up next: ${nextContent.title}`, { icon: "▶️" });
      openContent(nextContent);
    }
  };

  const toggleBookmark = async () => {
    if (!course) return;
    if (!isAuthenticated) return goToLogin();
    const before = bookmarked;
    setBookmarked(!before);
    try {
      const res = await learnerAPI.toggleBookmark(course.id);
      setBookmarked(res.data.data.bookmarked);
      toast.success(res.data.data.bookmarked ? "Saved to your courses" : "Removed from saved courses");
    } catch {
      setBookmarked(before);
      toast.error("Could not update bookmark.");
    }
  };

  if (loading) {
    return (
      <AppLayout allowGuest>
        <div style={{ maxWidth: 1200, margin: "20px auto" }}>
          <div className="skeleton" style={{ height: 42, width: "60%", borderRadius: 8, marginBottom: 14 }} />
          <div className="skeleton" style={{ height: 20, width: "40%", borderRadius: 6, marginBottom: 28 }} />
          <div className="player-layout">
            <div className="skeleton" style={{ height: 440, borderRadius: 18 }} />
            <div className="skeleton" style={{ height: 440, borderRadius: 18 }} />
          </div>
        </div>
      </AppLayout>
    );
  }

  if (!course) return null;

  const effectivePrice = Number(course.discountPrice || course.price);
  const mediaUrl = activeContent?.cloudFrontUrl || activeContent?.externalUrl;
  const isDocument = activeContent?.type === "PDF" || activeContent?.type === "DOCUMENT";

  return (
    <AppLayout allowGuest>
      <LearnerContentProtection>
        <div className="player-page-container">
          <div className="player-header">
            <h1 className="player-title">{course.title}</h1>
            <div className="player-meta-row">
              <div className="player-meta-item">
                <Users size={16} color="var(--gray-500)" aria-hidden="true" />
                <strong>{(course.totalStudents || 0).toLocaleString("en-IN")}</strong>
                <span>{course.totalStudents === 1 ? "Learner" : "Learners"} enrolled</span>
              </div>
              {totalDuration > 0 && (
                <div className="player-meta-item">
                  <Clock size={16} color="var(--gray-500)" aria-hidden="true" />
                  <strong>{formatDuration(totalDuration)}</strong>
                  <span>Total duration</span>
                </div>
              )}
              <div className="player-meta-item">
                <Clock size={16} color="var(--gray-500)" aria-hidden="true" />
                <strong>{formatRelativeTime(course.updatedAt)}</strong>
                <span>Last updated</span>
              </div>
              <div className="player-meta-item">
                <Globe size={16} color="var(--gray-500)" aria-hidden="true" />
                <strong>{course.language || "English"}</strong>
              </div>
            </div>
          </div>

          <div className="player-layout">
            {/* LEFT: player, actions, tabs */}
            <div style={{ minWidth: 0 }}>
              {isPlaying && mediaUrl && activeContent && isDocument ? (
                <>
                  <DocumentViewer content={activeContent} url={mediaUrl} />
                  {/* Documents have no "ended" event, so learners mark them complete themselves */}
                  {course.isEnrolled && (
                    <div className="doc-complete-bar">
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontWeight: 600, color: "var(--gray-900)" }}>
                          {completedIds.has(activeContent.id) ? "You've completed this document" : "Finished reading?"}
                        </div>
                        <div style={{ fontSize: 13, color: "var(--gray-500)" }}>
                          {completedIds.has(activeContent.id)
                            ? "It counts towards your course progress."
                            : "Mark it as complete to update your course progress."}
                        </div>
                      </div>
                      <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
                        {completedIds.has(activeContent.id) ? (
                          <button className="btn btn-secondary" onClick={() => toggleComplete(activeContent, false)}>
                            <CheckCircle2 size={16} color="var(--success)" /> Completed
                          </button>
                        ) : (
                          <button className="btn btn-primary" onClick={() => toggleComplete(activeContent, true)}>
                            <CheckCircle2 size={16} /> Mark as complete
                          </button>
                        )}
                        {nextContent && completedIds.has(activeContent.id) && (
                          <button className="btn btn-dark" onClick={() => openContent(nextContent)}>
                            Next lesson <ChevronRight size={16} />
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </>
              ) : isPlaying && mediaUrl && activeContent ? (
                <CustomVideoPlayer
                  src={mediaUrl}
                  title={activeContent.title}
                  thumbnail={course.thumbnail}
                  disablePictureInPicture={user?.role === "STUDENT"}
                  autoPlay
                  onTimeUpdate={(curr) => {
                    setCurrentTime(curr);
                    reportWatchTime(Math.floor(curr));
                  }}
                  onDurationDetected={(dur) => {
                    // Only staff may correct a lesson's stored length
                    if (isStaff && activeContent && dur > 0 && dur !== activeContent.duration) {
                      coursesAPI.syncDuration(activeContent.id, dur).catch(() => {});
                    }
                  }}
                  onSourceError={refreshActiveSource}
                  onEnded={handleVideoEnded}
                  hasNext={Boolean(nextContent)}
                  onNext={() => nextContent && openContent(nextContent)}
                />
              ) : (
                <button
                  type="button"
                  className="player-screen-box"
                  style={{ border: 0, padding: 0, cursor: "pointer", display: "block" }}
                  onClick={() => (activeContent ? openContent(activeContent) : allContents[0] && openContent(allContents[0]))}
                  aria-label={activeContent ? `Play ${activeContent.title}` : "Start course"}
                >
                  {course.thumbnail ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={course.thumbnail} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                  ) : (
                    <div style={{ width: "100%", height: "100%", background: "linear-gradient(135deg, #172554, #1e3a8a, #1e40af)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 64 }}>
                      🎓
                    </div>
                  )}
                  <div className="player-play-overlay">
                    <div className="player-play-btn-circle"><Play size={32} fill="#111827" /></div>
                  </div>
                </button>
              )}

              <div className="player-action-bar" style={{ justifyContent: "flex-end", marginTop: 12 }}>
                <div className="player-action-group">
                  <CourseShareMenu slug={course.slug} title={course.title} />
                  <button
                    className={`player-action-btn ${bookmarked ? "active" : ""}`}
                    onClick={toggleBookmark}
                    aria-pressed={bookmarked}
                    title={bookmarked ? "Remove from saved courses" : "Save course"}
                  >
                    <Bookmark size={16} fill={bookmarked ? "currentColor" : "none"} /> {bookmarked ? "Saved" : "Save"}
                  </button>
                </div>
              </div>

              <div className="player-tabs-bar" role="tablist">
                <button role="tab" aria-selected={activeTab === "overview"} className={`player-tab-item ${activeTab === "overview" ? "active" : ""}`} onClick={() => setActiveTab("overview")}>
                  Overview
                </button>
                <button role="tab" aria-selected={activeTab === "notes"} className={`player-tab-item ${activeTab === "notes" ? "active" : ""}`} onClick={() => setActiveTab("notes")}>
                  Notes
                </button>
              </div>

              {activeTab === "overview" ? (
                <CourseOverview course={course} totalLessons={totalLessons} totalDuration={totalDuration} />
              ) : (
                <CourseNotes courseId={course.id} canAccess={canAccess && isAuthenticated} activeContent={activeContent} currentTime={currentTime} />
              )}
            </div>

            {/* RIGHT: enroll prompt + content list */}
            <div style={{ minWidth: 0 }}>
              {!canAccess && (
                <div className="hero-course-card" style={{ marginBottom: 16, gap: 12 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ fontSize: 14, fontWeight: 600, color: "var(--gray-800)" }}>
                      {course.isFree ? "Free course" : "Unlock full access"}
                    </span>
                    <span style={{ fontSize: 24, fontWeight: 600, color: "var(--gray-900)" }}>
                      {course.isFree || effectivePrice === 0 ? "Free" : `₹${effectivePrice.toLocaleString("en-IN")}`}
                    </span>
                  </div>
                  <button className="btn btn-dark w-full" disabled={paying} onClick={isAuthenticated ? enroll : goToLogin}>
                    {paying ? "Processing…" : !isAuthenticated ? "Log in to enroll" : course.isFree ? "Enroll for free" : "Enroll now"}
                  </button>
                </div>
              )}

              <CourseContentList
                course={course}
                canAccess={canAccess}
                activeId={activeContent?.id}
                completedIds={completedIds}
                onOpen={openContent}
                onToggleComplete={(c) => toggleComplete(c)}
              />
            </div>
          </div>
        </div>
      </LearnerContentProtection>
    </AppLayout>
  );
}
