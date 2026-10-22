"use client";

import { useEffect, useState, useRef, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import AppLayout from "@/components/layout/AppLayout";
import { coursesAPI, paymentsAPI } from "@/lib/api";
import { useAuthStore } from "@/store/authStore";
import toast from "react-hot-toast";
import CustomVideoPlayer from "@/components/player/CustomVideoPlayer";
import LearnerContentProtection from "@/components/content/LearnerContentProtection";
import CourseShareMenu from "@/components/courses/CourseShareMenu";
import {
  Users, Clock, BookOpen, CheckCircle2, Play, FileText,
  HelpCircle, Lock, ChevronDown, ChevronUp,
  Award, Globe,
  Bookmark, Search, MoreVertical, MessageSquare,
  Sparkles, PlayCircle
} from "lucide-react";

interface Content {
  id: string;
  title: string;
  type: string;
  duration?: number;
  isFree: boolean;
  isPublished: boolean;
  s3Key?: string;
  cloudFrontUrl?: string;
  externalUrl?: string;
  assessmentId?: string | null;
  mimeType?: string | null;
  isCompleted?: boolean;
}

interface Section {
  id: string;
  title: string;
  contents: Content[];
}

interface Course {
  id: string;
  title: string;
  slug: string;
  description: string;
  shortDesc?: string;
  thumbnail?: string;
  price: number;
  discountPrice?: number;
  isFree: boolean;
  level: string;
  language: string;
  totalDuration: number;
  totalLessons: number;
  rating: number;
  totalRatings: number;
  totalStudents: number;
  requirements: string[];
  objectives: string[];
  tags: string[];
  category: { name: string };
  sections: Section[];
  isEnrolled: boolean;
  assessments: any[];
  updatedAt?: string;
}

interface Note {
  id: string;
  timestamp: number;
  contentId: string;
  text: string;
  createdAt: string;
}

export default function CourseDetailPage() {
  const { slug } = useParams<{ slug: string }>();
  const router = useRouter();
  const { user, isAuthenticated } = useAuthStore();
  const [course, setCourse] = useState<Course | null>(null);
  const [loading, setLoading] = useState(true);
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set());
  const [activeContent, setActiveContent] = useState<Content | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [paying, setPaying] = useState(false);
  const [activeTab, setActiveTab] = useState<"overview" | "notes" | "announcements">("overview");

  // Dynamic lesson durations map (contentId -> durationInSeconds)
  const [durationsMap, setDurationsMap] = useState<Record<string, number>>({});

  // Interactions state
  const [bookmarked, setBookmarked] = useState(false);
  const [showOptions, setShowOptions] = useState(false);

  // Notes state
  const [notes, setNotes] = useState<Note[]>([]);
  const [newNoteText, setNewNoteText] = useState("");
  const [currentVideoTime, setCurrentVideoTime] = useState(0);

  // Completed content IDs set
  const [completedIds, setCompletedIds] = useState<Set<string>>(new Set());

  const noteInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (slug) loadCourse();
  }, [slug]);

  // Load saved notes from local storage
  useEffect(() => {
    if (course?.id) {
      try {
        const saved = localStorage.getItem(`course_notes_${course.id}`);
        if (saved) setNotes(JSON.parse(saved));
      } catch {}
    }
  }, [course?.id]);

  // Preload video durations dynamically for accurate calculation
  const preloadDurations = (sections: Section[]) => {
    sections.forEach((section) => {
      section.contents?.forEach((c) => {
        const videoSrc = c.cloudFrontUrl || c.externalUrl;
        if (c.type !== "VIDEO") return;
        if (videoSrc && (!c.duration || c.duration <= 0)) {
          const v = document.createElement("video");
          v.preload = "metadata";
          v.src = videoSrc;
          v.onloadedmetadata = () => {
            const detected = Math.round(v.duration);
            if (detected > 0) {
              setDurationsMap((prev) => ({ ...prev, [c.id]: detected }));
              coursesAPI.syncDuration(c.id, detected).catch(() => {});
            }
          };
        } else if (c.duration && c.duration > 0) {
          setDurationsMap((prev) => ({ ...prev, [c.id]: c.duration || 0 }));
        }
      });
    });
  };

  const loadCourse = async () => {
    try {
      const res = await coursesAPI.getBySlug(slug as string);
      const data: Course = res.data.data;
      setCourse(data);

      // Track completed items
      const doneSet = new Set<string>();
      data.sections?.forEach((s) => {
        s.contents?.forEach((c) => {
          if (c.isCompleted) doneSet.add(c.id);
        });
      });
      setCompletedIds(doneSet);

      // Auto-expand all sections
      if (data.sections?.length > 0) {
        setExpandedSections(new Set(data.sections.map((s) => s.id)));

        // Select first content as default active
        const firstLesson = data.sections[0]?.contents?.[0];
        if (firstLesson) {
          setActiveContent(firstLesson);
        }

        // Detect real video durations dynamically
        preloadDurations(data.sections);
      }
    } catch {
      toast.error("Course not found.");
      router.push("/courses");
    } finally {
      setLoading(false);
    }
  };

  // Compute dynamic total lessons and total duration using detected durations
  const allContents = useMemo(() => {
    return (course?.sections || []).flatMap((s) => s.contents || []);
  }, [course]);

  const dynamicTotalLessons = allContents.length || course?.totalLessons || 0;

  const dynamicTotalDuration = useMemo(() => {
    const sum = allContents.reduce((acc, c) => {
      const dur = durationsMap[c.id] ?? c.duration ?? 0;
      return acc + dur;
    }, 0);
    return sum || course?.totalDuration || 0;
  }, [allContents, durationsMap, course?.totalDuration]);

  const completedCount = allContents.filter((c) => completedIds.has(c.id)).length;
  const progressPercent =
    dynamicTotalLessons > 0 ? Math.round((completedCount / dynamicTotalLessons) * 100) : 0;

  const handleEnroll = async () => {
    if (!isAuthenticated) {
      toast.error("Please login to enroll.");
      router.push("/login");
      return;
    }
    if (!course) return;

    if (course.isFree || parseFloat(String(course.price)) === 0) {
      setPaying(true);
      try {
        await paymentsAPI.createOrder(course.id);
        toast.success("Enrolled successfully! 🎉");
        await loadCourse();
        setIsPlaying(true);
      } catch (err: any) {
        toast.error(err.response?.data?.message || "Enrollment failed.");
      } finally {
        setPaying(false);
      }
      return;
    }

    setPaying(true);
    try {
      const res = await paymentsAPI.createOrder(course.id);
      const { orderId, amount, amountInPaise, currency, keyId, checkoutConfigId, prefill } = res.data.data;

      const loadScript = () => {
        return new Promise<boolean>((resolve) => {
          if ((window as any).Razorpay) return resolve(true);
          const script = document.createElement("script");
          script.src = "https://checkout.razorpay.com/v1/checkout.js";
          script.onload = () => resolve(true);
          script.onerror = () => resolve(false);
          document.body.appendChild(script);
        });
      };

      const loaded = await loadScript();
      if (!loaded) {
        toast.error("Razorpay checkout SDK failed to load. Are you online?");
        setPaying(false);
        return;
      }

      const razorpayKey = keyId || process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID;
      if (!razorpayKey || razorpayKey === "your_razorpay_key_id") {
        toast.error("Razorpay Key ID is not configured. Please add your key in .env.");
        setPaying(false);
        return;
      }

      const options = {
        key: razorpayKey,
        amount: amountInPaise || Math.round(amount * 100),
        currency: currency || "INR",
        checkout_config_id: checkoutConfigId,
        name: "Derivion LMS",
        description: course.title,
        order_id: orderId,
        prefill: {
          name: prefill?.name || `${user?.firstName || ""} ${user?.lastName || ""}`.trim(),
          email: prefill?.email || user?.email || "",
          contact: prefill?.contact || (user as any)?.phone || "",
        },
        theme: {
          color: "#1e40af",
        },
        handler: async function (response: any) {
          try {
            const verifyRes = await paymentsAPI.verifyPayment({
              razorpay_order_id: response.razorpay_order_id,
              razorpay_payment_id: response.razorpay_payment_id,
              razorpay_signature: response.razorpay_signature,
            });
            if (verifyRes.data.success) {
              toast.success("Payment successful! You are now enrolled. 🎉");
              await loadCourse();
              setIsPlaying(true);
            } else {
              toast.error(verifyRes.data.message || "Payment verification failed.");
            }
          } catch (verifyErr: any) {
            toast.error(verifyErr.response?.data?.message || "Failed to verify payment.");
          } finally {
            setPaying(false);
          }
        },
        modal: {
          ondismiss: function () {
            setPaying(false);
          },
        },
      };

      const rzp = new (window as any).Razorpay(options);
      rzp.on("payment.failed", function (response: any) {
        toast.error(response?.error?.description || "Payment failed.");
        setPaying(false);
      });
      rzp.open();
    } catch (err: any) {
      toast.error(err.response?.data?.message || "Payment failed to initiate.");
      setPaying(false);
    }
  };

  const handleContentClick = async (content: Content) => {
    if (!content.isFree && !course?.isEnrolled && user?.role !== "ADMIN") {
      toast.error("Please enroll in this course to access this lesson.");
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
      const loadedData = res.data.data;
      setActiveContent({ ...content, ...loadedData });
      setIsPlaying(true);
    } catch {
      setActiveContent(content);
      setIsPlaying(true);
    }
  };

  const toggleComplete = async (contentId: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (!course?.isEnrolled && user?.role !== "ADMIN") {
      toast.error("Please enroll to track progress.");
      return;
    }

    const isCurrentlyDone = completedIds.has(contentId);
    const newStatus = !isCurrentlyDone;

    setCompletedIds((prev) => {
      const next = new Set(prev);
      if (newStatus) next.add(contentId);
      else next.delete(contentId);
      return next;
    });

    try {
      await coursesAPI.updateProgress(contentId, { isCompleted: newStatus });
      if (newStatus) {
        toast.success("Lesson marked as complete! 🎉");
      }
    } catch {
      setCompletedIds((prev) => {
        const next = new Set(prev);
        if (isCurrentlyDone) next.add(contentId);
        else next.delete(contentId);
        return next;
      });
      toast.error("Failed to update progress.");
    }
  };

  // Next lecture determination
  const nextContent = useMemo(() => {
    if (!activeContent || !course?.sections) return null;
    let foundCurrent = false;
    for (const section of course.sections) {
      for (const c of section.contents) {
        if (foundCurrent) return c;
        if (c.id === activeContent.id) foundCurrent = true;
      }
    }
    return null;
  }, [activeContent, course?.sections]);

  const handleVideoEnded = () => {
    if (!activeContent) return;
    toggleComplete(activeContent.id);

    if (nextContent) {
      toast("Up next: " + nextContent.title, { icon: "▶️" });
      handleContentClick(nextContent);
    }
  };

  const toggleSection = (id: string) => {
    setExpandedSections((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const expandAll = () => {
    if (course?.sections) {
      setExpandedSections(new Set(course.sections.map((s) => s.id)));
    }
    setShowOptions(false);
  };

  const collapseAll = () => {
    setExpandedSections(new Set());
    setShowOptions(false);
  };

  const handleSaveNote = () => {
    if (!newNoteText.trim() || !activeContent) return;
    const note: Note = {
      id: Date.now().toString(),
      timestamp: Math.floor(currentVideoTime),
      contentId: activeContent.id,
      text: newNoteText.trim(),
      createdAt: new Date().toLocaleDateString(),
    };
    const updated = [note, ...notes];
    setNotes(updated);
    setNewNoteText("");
    if (course?.id) {
      localStorage.setItem(`course_notes_${course.id}`, JSON.stringify(updated));
    }
    toast.success("Note saved successfully! 📝");
  };

  const deleteNote = (noteId: string) => {
    const updated = notes.filter((n) => n.id !== noteId);
    setNotes(updated);
    if (course?.id) {
      localStorage.setItem(`course_notes_${course.id}`, JSON.stringify(updated));
    }
  };

  const formatDuration = (seconds?: number) => {
    if (!seconds || seconds <= 0) return "0m";
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    if (h > 0) return `${h}h ${m > 0 ? `${m}m` : ""}`;
    if (m > 0) return `${m}m ${s > 0 ? `${s}s` : ""}`;
    return `${s}s`;
  };

  const formatVideoTime = (totalSeconds: number) => {
    const mins = Math.floor(totalSeconds / 60);
    const secs = Math.floor(totalSeconds % 60);
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  const formatRelativeTime = (dateStr?: string) => {
    if (!dateStr) return "3d ago";
    const diff = Date.now() - new Date(dateStr).getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    if (days <= 0) return "Today";
    if (days === 1) return "1d ago";
    if (days < 30) return `${days}d ago`;
    const months = Math.floor(days / 30);
    return `${months}mo ago`;
  };

  if (loading) {
    return (
      <AppLayout>
        <LearnerContentProtection>
          <div style={{ maxWidth: 1200, margin: "20px auto", padding: "0 16px" }}>
            <div className="skeleton" style={{ height: 42, width: "60%", borderRadius: 8, marginBottom: 14 }} />
            <div className="skeleton" style={{ height: 20, width: "40%", borderRadius: 6, marginBottom: 28 }} />
            <div style={{ display: "grid", gridTemplateColumns: "1fr 360px", gap: 24 }}>
              <div className="skeleton" style={{ height: 440, borderRadius: 18 }} />
              <div className="skeleton" style={{ height: 440, borderRadius: 18 }} />
            </div>
          </div>
        </LearnerContentProtection>
      </AppLayout>
    );
  }

  if (!course) return null;

  const effectivePrice = course.discountPrice
    ? parseFloat(String(course.discountPrice))
    : parseFloat(String(course.price));

  const activeVideoUrl = activeContent?.cloudFrontUrl || activeContent?.externalUrl;

  return (
    <AppLayout>
      <LearnerContentProtection>
      <div className="player-page-container">
        {/* Course Header */}
        <div className="player-header">
          <h1 className="player-title">{course.title}</h1>
          <div className="player-meta-row">
            <div className="player-meta-item">
              <Users size={16} color="var(--gray-500)" />
              <strong>{(course.totalStudents || 321195).toLocaleString()}</strong>
              <span>Students Enrolled</span>
            </div>
            <div className="player-meta-item">
              <Clock size={16} color="var(--gray-500)" />
              <strong>{formatDuration(dynamicTotalDuration)}</strong>
              <span>Total Duration</span>
            </div>
            <div className="player-meta-item">
              <Clock size={16} color="var(--gray-500)" />
              <strong>{formatRelativeTime(course.updatedAt)}</strong>
              <span>Last Updated</span>
            </div>
            <div className="player-meta-item">
              <Globe size={16} color="var(--gray-500)" />
              <strong>{course.language || "English"}</strong>
            </div>
          </div>
        </div>

        {/* Main Grid: Player + Content Sidebar */}
        <div className="player-layout">
          {/* LEFT COLUMN: Custom Video Player, Actions, Tabs */}
          <div>
            {/* Custom Video Player with Custom Controls */}
            {isPlaying && activeVideoUrl && activeContent && (activeContent.type === "PDF" || activeContent.type === "DOCUMENT") ? (
              <DocumentViewer content={activeContent} url={activeVideoUrl} />
            ) : isPlaying && activeVideoUrl ? (
              <CustomVideoPlayer
                src={activeVideoUrl}
                title={activeContent ? activeContent.title : course.title}
                thumbnail={course.thumbnail}
                disablePictureInPicture={user?.role === "STUDENT"}
                autoPlay={true}
                onTimeUpdate={(curr) => {
                  setCurrentVideoTime(curr);
                  const sec = Math.floor(curr);
                  if (sec > 0 && sec % 10 === 0 && activeContent) {
                    coursesAPI.updateProgress(activeContent.id, { watchedSeconds: sec });
                  }
                }}
                onDurationDetected={(dur) => {
                  if (activeContent) {
                    setDurationsMap((prev) => ({ ...prev, [activeContent.id]: dur }));
                    coursesAPI.syncDuration(activeContent.id, dur).catch(() => {});
                  }
                }}
                onEnded={handleVideoEnded}
                hasNext={!!nextContent}
                onNext={() => nextContent && handleContentClick(nextContent)}
              />
            ) : (
              <div
                className="player-screen-box"
                onClick={() => {
                  if (activeContent) {
                    handleContentClick(activeContent);
                  } else if (allContents.length > 0) {
                    handleContentClick(allContents[0]);
                  }
                }}
              >
                {course.thumbnail ? (
                  <img
                    src={course.thumbnail}
                    alt={course.title}
                    style={{ width: "100%", height: "100%", objectFit: "cover" }}
                  />
                ) : (
                  <div
                    style={{
                      width: "100%",
                      height: "100%",
                      background: "linear-gradient(135deg, #172554, #1e3a8a, #1e40af)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: 64,
                    }}
                  >
                    🎓
                  </div>
                )}

                <div className="player-play-overlay">
                  <div className="player-play-btn-circle">
                    <Play size={32} fill="#111827" />
                  </div>
                </div>
              </div>
            )}

            {/* Action Bar (Download & Save Note removed as requested) */}
            <div className="player-action-bar" style={{ justifyContent: "flex-end", marginTop: 12 }}>
              <div className="player-action-group">
                <CourseShareMenu slug={course.slug} title={course.title} />
                <button
                  className={`player-action-btn ${bookmarked ? "active" : ""}`}
                  onClick={() => {
                    setBookmarked(!bookmarked);
                    toast.success(bookmarked ? "Removed from bookmarks" : "Saved to bookmarks! 📌");
                  }}
                  title="Bookmark course"
                >
                  <Bookmark size={16} fill={bookmarked ? "currentColor" : "none"} />
                </button>
              </div>
            </div>

            {/* Navigation Tabs Bar */}
            <div className="player-tabs-bar">
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginRight: 8, color: "var(--gray-400)" }}>
                <Search size={16} />
              </div>
              <button
                className={`player-tab-item ${activeTab === "overview" ? "active" : ""}`}
                onClick={() => setActiveTab("overview")}
              >
                Overview
              </button>
              <button
                className={`player-tab-item ${activeTab === "notes" ? "active" : ""}`}
                onClick={() => setActiveTab("notes")}
              >
                Notes {notes.length > 0 && <span className="badge badge-primary" style={{ fontSize: 11 }}>{notes.length}</span>}
              </button>
              <button
                className={`player-tab-item ${activeTab === "announcements" ? "active" : ""}`}
                onClick={() => setActiveTab("announcements")}
              >
                Announcements
              </button>
            </div>

            {/* TAB CONTENT: Overview */}
            {activeTab === "overview" && (
              <div>
                <h3 className="overview-summary-heading">Summary</h3>
                <p className="overview-summary-text">
                  {course.description || course.shortDesc || "Master key concepts with structured video lectures, real-world examples, and step-by-step guidance designed to build your practical mastery."}
                </p>

                {/* 2-Column Info Grid matching user reference image */}
                <div className="course-specs-grid">
                  <div className="course-spec-row">
                    <span className="spec-icon"><BookOpen size={16} /></span>
                    <span>Skill Level: <strong>{course.level || "All Levels"}</strong></span>
                  </div>
                  <div className="course-spec-row">
                    <span className="spec-icon"><PlayCircle size={16} /></span>
                    <span>Lectures: <strong>{dynamicTotalLessons}</strong></span>
                  </div>
                  <div className="course-spec-row">
                    <span className="spec-icon"><Users size={16} /></span>
                    <span>Students: <strong>{(course.totalStudents || 215118).toLocaleString()}</strong></span>
                  </div>
                  <div className="course-spec-row">
                    <span className="spec-icon"><Clock size={16} /></span>
                    <span>Duration: <strong>{formatDuration(dynamicTotalDuration)}</strong></span>
                  </div>
                  <div className="course-spec-row">
                    <span className="spec-icon"><Globe size={16} /></span>
                    <span>Languages: <strong>{course.language || "EN, HI"}</strong></span>
                  </div>
                  <div className="course-spec-row">
                    <span className="spec-icon"><Award size={16} /></span>
                    <span>Certification: <strong>Yes</strong></span>
                  </div>
                  <div className="course-spec-row">
                    <span className="spec-icon"><MessageSquare size={16} /></span>
                    <span>Captions: <strong>Yes</strong></span>
                  </div>
                  <div className="course-spec-row">
                    <span className="spec-icon"><Sparkles size={16} /></span>
                    <span>App Support: <strong>Yes</strong></span>
                  </div>
                </div>

                {/* What you'll learn */}
                {course.objectives && course.objectives.length > 0 && (
                  <div style={{ marginBottom: 28 }}>
                    <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 14 }}>What you&apos;ll learn</h3>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                      {course.objectives.map((obj, i) => (
                        <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 10, fontSize: 14, color: "var(--gray-700)" }}>
                          <CheckCircle2 size={16} color="var(--success)" style={{ flexShrink: 0, marginTop: 2 }} />
                          <span>{obj}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Requirements */}
                {course.requirements && course.requirements.length > 0 && (
                  <div>
                    <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 12 }}>Requirements</h3>
                    <ul style={{ paddingLeft: 20, color: "var(--gray-600)", fontSize: 14, lineHeight: 1.8 }}>
                      {course.requirements.map((req, i) => (
                        <li key={i}>{req}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}

            {/* TAB CONTENT: Notes */}
            {activeTab === "notes" && (
              <div>
                <div style={{ background: "#f8fafc", padding: 18, borderRadius: 14, border: "1px solid var(--gray-200)", marginBottom: 24 }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: "var(--gray-700)" }}>
                      Create note at <span className="badge badge-primary">{formatVideoTime(currentVideoTime)}</span>
                    </span>
                  </div>
                  <div style={{ display: "flex", gap: 10 }}>
                    <input
                      ref={noteInputRef}
                      type="text"
                      className="input"
                      style={{ flex: 1 }}
                      placeholder="Type your study note here..."
                      value={newNoteText}
                      onChange={(e) => setNewNoteText(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleSaveNote();
                      }}
                    />
                    <button className="btn btn-primary" onClick={handleSaveNote}>
                      Save Note
                    </button>
                  </div>
                </div>

                {notes.length === 0 ? (
                  <div style={{ textAlign: "center", padding: "40px 20px", color: "var(--gray-400)" }}>
                    <Bookmark size={36} style={{ margin: "0 auto 12px", opacity: 0.5 }} />
                    <p style={{ fontSize: 14 }}>No notes taken yet. Capture your insights while watching!</p>
                  </div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                    {notes.map((n) => (
                      <div
                        key={n.id}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          padding: "12px 16px",
                          background: "#ffffff",
                          border: "1px solid var(--gray-200)",
                          borderRadius: 10,
                        }}
                      >
                        <div style={{ display: "flex", alignItems: "center", gap: 12, flex: 1 }}>
                          <span
                            className="badge badge-blue"
                            style={{ display: "flex", alignItems: "center", gap: 4 }}
                          >
                            <Play size={10} fill="currentColor" /> {formatVideoTime(n.timestamp)}
                          </span>
                          <span style={{ fontSize: 14, color: "var(--gray-800)" }}>{n.text}</span>
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                          <span style={{ fontSize: 12, color: "var(--gray-400)" }}>{n.createdAt}</span>
                          <button
                            onClick={() => deleteNote(n.id)}
                            style={{ background: "none", border: "none", color: "var(--gray-400)", cursor: "pointer", fontSize: 13 }}
                          >
                            ✕
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* TAB CONTENT: Announcements */}
            {activeTab === "announcements" && (
              <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                <div style={{ padding: 18, background: "#f8fafc", borderRadius: 12, border: "1px solid var(--gray-200)" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                    <div style={{ width: 36, height: 36, borderRadius: "50%", background: "var(--primary-100)", color: "var(--primary-dark)", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700 }}>
                      IN
                    </div>
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 700, color: "var(--gray-900)" }}>Course Instructor</div>
                      <div style={{ fontSize: 12, color: "var(--gray-400)" }}>Posted 3 days ago</div>
                    </div>
                  </div>
                  <h4 style={{ fontSize: 15, fontWeight: 600, marginBottom: 6 }}>Welcome to {course.title}!</h4>
                  <p style={{ fontSize: 14, color: "var(--gray-600)", lineHeight: 1.6 }}>
                    Welcome to the course! Make sure to watch all lectures in sequence, take notes along the way, and practice each concept. Let us know in the forum if you have any questions.
                  </p>
                </div>
              </div>
            )}

          </div>

          {/* RIGHT COLUMN: Course Content Sidebar */}
          <div>
            {/* Enrollment prompt if not enrolled */}
            {!course.isEnrolled && user?.role !== "ADMIN" && (
              <div
                style={{
                  background: "linear-gradient(135deg, #f5f3ff, #ede9fe)",
                  border: "1px solid #ddd6fe",
                  borderRadius: 16,
                  padding: "18px 20px",
                  marginBottom: 16,
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: "#6d28d9" }}>
                    {course.isFree ? "Free Course" : "Unlock Full Access"}
                  </span>
                  <span style={{ fontSize: 20, fontWeight: 800, color: "#4c1d95" }}>
                    {course.isFree ? "Free" : `₹${effectivePrice.toLocaleString("en-IN")}`}
                  </span>
                </div>
                <button
                  className="btn btn-primary w-full"
                  style={{ justifyContent: "center", background: "#7c3aed" }}
                  disabled={paying}
                  onClick={handleEnroll}
                >
                  {paying ? "Processing..." : course.isFree ? "Enroll for Free →" : "Enroll Now →"}
                </button>
              </div>
            )}

            {/* Course Content Accordion Card */}
            <div className="sidebar-content-card">
              {/* Sidebar Header */}
              <div className="sidebar-content-header">
                <span className="sidebar-content-title">Course Content</span>
                <div style={{ position: "relative" }}>
                  <button
                    onClick={() => setShowOptions(!showOptions)}
                    style={{ background: "none", border: "none", color: "var(--gray-500)", cursor: "pointer", padding: 4 }}
                  >
                    <MoreVertical size={18} />
                  </button>
                  {showOptions && (
                    <div
                      style={{
                        position: "absolute",
                        right: 0,
                        top: "100%",
                        background: "#fff",
                        border: "1px solid var(--gray-200)",
                        borderRadius: 8,
                        boxShadow: "0 8px 20px rgba(0,0,0,0.1)",
                        zIndex: 10,
                        minWidth: 140,
                        overflow: "hidden",
                      }}
                    >
                      <button
                        onClick={expandAll}
                        style={{ width: "100%", padding: "8px 12px", textAlign: "left", background: "none", border: "none", fontSize: 13, cursor: "pointer" }}
                      >
                        Expand All
                      </button>
                      <button
                        onClick={collapseAll}
                        style={{ width: "100%", padding: "8px 12px", textAlign: "left", background: "none", border: "none", fontSize: 13, cursor: "pointer" }}
                      >
                        Collapse All
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* Progress Summary if enrolled */}
              {(course.isEnrolled || user?.role === "ADMIN") && (
                <div style={{ padding: "12px 20px", background: "#fafafa", borderBottom: "1px solid var(--gray-100)" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, marginBottom: 6 }}>
                    <span style={{ color: "var(--gray-600)" }}>Your Progress</span>
                    <strong style={{ color: "#7c3aed" }}>
                      {completedCount}/{dynamicTotalLessons} completed ({progressPercent}%)
                    </strong>
                  </div>
                  <div className="progress-bar" style={{ height: 6 }}>
                    <div className="progress-fill" style={{ width: `${progressPercent}%`, background: "#7c3aed" }} />
                  </div>
                </div>
              )}

              {/* Sections List */}
              <div>
                {course.sections && course.sections.length > 0 ? (
                  course.sections.map((section) => {
                    const totalSecLessons = section.contents?.length || 0;
                    const completedSecLessons =
                      section.contents?.filter((c) => completedIds.has(c.id)).length || 0;
                    const secDuration =
                      section.contents?.reduce((d, c) => {
                        const dur = durationsMap[c.id] ?? c.duration ?? 0;
                        return d + dur;
                      }, 0) || 0;
                    const isExpanded = expandedSections.has(section.id);

                    return (
                      <div key={section.id} className="sidebar-section-item">
                        {/* Section Header Accordion */}
                        <div className="sidebar-section-header" onClick={() => toggleSection(section.id)}>
                          <div>
                            <div className="sidebar-section-title">{section.title}</div>
                            <div className="sidebar-section-sub">
                              {completedSecLessons}/{totalSecLessons} · {formatDuration(secDuration)} Total
                            </div>
                          </div>
                          <div>
                            {isExpanded ? (
                              <ChevronUp size={18} color="var(--gray-400)" />
                            ) : (
                              <ChevronDown size={18} color="var(--gray-400)" />
                            )}
                          </div>
                        </div>

                        {/* Lectures inside Section */}
                        {isExpanded && (
                          <div>
                            {section.contents && section.contents.length > 0 ? (
                              section.contents.map((content, cIndex) => {
                                const isActive = activeContent?.id === content.id;
                                const isDone = completedIds.has(content.id);
                                const isLocked = !content.isFree && !course.isEnrolled && user?.role !== "ADMIN";
                                const lectureNumber = String(cIndex + 1).padStart(2, "0");
                                const effectiveContentDuration = durationsMap[content.id] ?? content.duration;

                                return (
                                  <div
                                    key={content.id}
                                    className={`sidebar-lecture-row ${isActive ? "active" : ""}`}
                                    onClick={() => handleContentClick(content)}
                                  >
                                    <div className="lecture-main-info">
                                      <div className="lecture-title">
                                        {lectureNumber}: {content.title}
                                      </div>
                                      <div className="lecture-meta">
                                        {isDone ? (
                                          <span style={{ color: "#7c3aed", fontWeight: 600 }}>Completed</span>
                                        ) : effectiveContentDuration && effectiveContentDuration > 0 ? (
                                          <span>{formatDuration(effectiveContentDuration)}</span>
                                        ) : (
                                          <span>{lessonTypeLabel(content.type)}</span>
                                        )}
                                        {content.isFree && !course.isEnrolled && (
                                          <span className="badge badge-success" style={{ fontSize: 10, padding: "1px 6px" }}>Preview</span>
                                        )}
                                      </div>
                                    </div>

                                    {/* Action / Status Icon */}
                                    <div className="lecture-status-icon">
                                      {isDone ? (
                                        <button
                                          onClick={(e) => toggleComplete(content.id, e)}
                                          style={{ background: "none", border: "none", cursor: "pointer", padding: 0 }}
                                          title="Mark as uncompleted"
                                        >
                                          <CheckCircle2 size={20} color="#7c3aed" fill="#ede9fe" />
                                        </button>
                                      ) : isLocked ? (
                                        <Lock size={15} color="var(--gray-400)" />
                                      ) : isActive ? (
                                        <LessonTypeIcon type={content.type} size={20} color="var(--violet)" />
                                      ) : (
                                        <button
                                          onClick={(e) => toggleComplete(content.id, e)}
                                          style={{ background: "none", border: "none", cursor: "pointer", padding: 0 }}
                                          title="Mark as completed"
                                        >
                                          <LessonTypeIcon type={content.type} size={18} color="var(--gray-400)" />
                                        </button>
                                      )}
                                    </div>
                                  </div>
                                );
                              })
                            ) : (
                              <div style={{ padding: "12px 20px", fontSize: 13, color: "var(--gray-400)" }}>
                                No content in this section yet.
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })
                ) : (
                  <div style={{ padding: "30px 20px", textAlign: "center", color: "var(--gray-400)" }}>
                    <p style={{ fontSize: 14 }}>No course content available yet.</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
      </LearnerContentProtection>
    </AppLayout>
  );
}

// PDF lessons are shown inline with the browser viewer toolbar (download / print) hidden.
// Word / PowerPoint files cannot be previewed in the browser without a third-party service.
function DocumentViewer({ content, url }: { content: Content; url: string }) {
  const isPdf =
    content.type === "PDF" ||
    content.mimeType === "application/pdf" ||
    /\.pdf($|\?)/i.test(url);
  const [loaded, setLoaded] = useState(false);

  if (!isPdf) {
    return (
      <div className="player-screen-box" style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 10, background: "#0f172a", color: "white", textAlign: "center", padding: 24, cursor: "default" }}>
        <div style={{ fontSize: 40 }}>📄</div>
        <div style={{ fontWeight: 700 }}>{content.title}</div>
        <div style={{ fontSize: 13, opacity: 0.7, maxWidth: 420 }}>
          This document type can&apos;t be previewed here. Ask your instructor to upload it as a PDF.
        </div>
      </div>
    );
  }

  return (
    <div style={{ position: "relative", width: "100%", height: "min(80vh, 760px)", borderRadius: 18, overflow: "hidden", background: "#525659", boxShadow: "0 14px 34px -4px rgba(0,0,0,0.25)" }}>
      {!loaded && (
        <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12, color: "white", fontSize: 13 }}>
          <div className="custom-player-spinner" />
          Loading document…
        </div>
      )}
      <iframe
        key={url}
        src={`${url}#toolbar=0&navpanes=0&view=FitH`}
        title={content.title}
        onLoad={() => setLoaded(true)}
        style={{ width: "100%", height: "100%", border: 0, opacity: loaded ? 1 : 0 }}
      />
    </div>
  );
}

const lessonTypeLabel = (type: string) =>
  ({ VIDEO: "Video", PDF: "PDF document", DOCUMENT: "Document", QUIZ: "Quiz", LINK: "Link", ASSIGNMENT: "Assignment" } as Record<string, string>)[type] || "Lesson";

function LessonTypeIcon({ type, size, color }: { type: string; size: number; color: string }) {
  if (type === "PDF" || type === "DOCUMENT") return <FileText size={size} color={color} />;
  if (type === "QUIZ") return <HelpCircle size={size} color={color} />;
  return <PlayCircle size={size} color={color} />;
}
