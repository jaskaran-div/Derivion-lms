"use client";

import { useState, useEffect, useCallback } from "react";
import AppLayout from "@/components/layout/AppLayout";
import { usersAPI, chatAPI } from "@/lib/api";
import toast from "react-hot-toast";
import {
  Send,
  Bell,
  Users,
  User,
  Search,
  CheckCircle2,
  AlertTriangle,
  Info,
  AlertCircle,
  X,
  Sparkles,
  Shield,
  GraduationCap,
  History,
  Trash2,
  RefreshCw,
  Clock,
  ArrowRight,
  ExternalLink,
  CheckCheck,
  Radio,
  Layers,
} from "lucide-react";

interface UserProfile {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  username?: string | null;
  role: "ADMIN" | "TEACHER" | "STUDENT";
  avatar?: string | null;
}

interface SentNotification {
  id: string;
  title: string;
  message: string;
  type: string;
  link?: string | null;
  isRead: boolean;
  createdAt: string;
  user?: UserProfile;
}

interface NotificationManagerProps {
  requiredRole: "ADMIN" | "TEACHER";
}

export default function NotificationManager({ requiredRole }: NotificationManagerProps) {
  const [activeTab, setActiveTab] = useState<"COMPOSE" | "HISTORY">("COMPOSE");
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<"BULK" | "INDIVIDUAL">("BULK");

  const [formData, setFormData] = useState({
    title: "",
    message: "",
    type: "INFO",
    target: "ALL",
    link: "/dashboard",
  });

  // Individual recipient selection
  const [searchQuery, setSearchQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<UserProfile[]>([]);
  const [selectedRecipient, setSelectedRecipient] = useState<UserProfile | null>(null);

  // Sent History
  const [history, setHistory] = useState<SentNotification[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [historySearch, setHistorySearch] = useState("");

  // Check URL query parameters for pre-selected recipient (e.g. from user table)
  useEffect(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const recId = params.get("recipientId");
      if (recId) {
        setMode("INDIVIDUAL");
        chatAPI
          .searchUsers(recId)
          .then((res) => {
            const found =
              res.data.data?.find((u: any) => u.id === recId) || res.data.data?.[0];
            if (found) setSelectedRecipient(found);
          })
          .catch(() => {});
      }
    }
  }, []);

  // Search users debounce
  useEffect(() => {
    if (mode !== "INDIVIDUAL") return;
    const q = searchQuery.trim();
    if (!q) {
      setSearchResults([]);
      setSearching(false);
      return;
    }

    setSearching(true);
    const timer = setTimeout(async () => {
      try {
        const res = await chatAPI.searchUsers(q);
        setSearchResults(res.data.data || []);
      } catch (err) {
        console.error("Search failed:", err);
      } finally {
        setSearching(false);
      }
    }, 280);

    return () => clearTimeout(timer);
  }, [searchQuery, mode]);

  // Load sent history
  const loadHistory = useCallback(async () => {
    setLoadingHistory(true);
    try {
      const res = await usersAPI.getNotificationHistory();
      setHistory(res.data.data || []);
    } catch (err) {
      console.error("Failed to load notification history:", err);
    } finally {
      setLoadingHistory(false);
    }
  }, []);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  const handleSend = async () => {
    if (!formData.title.trim()) {
      toast.error("Please enter a notification title.");
      return;
    }
    if (!formData.message.trim()) {
      toast.error("Please write a notification message.");
      return;
    }

    if (mode === "INDIVIDUAL" && !selectedRecipient) {
      toast.error("Please select a recipient before sending.");
      return;
    }

    setLoading(true);
    try {
      const payload: any = {
        title: formData.title.trim(),
        message: formData.message.trim(),
        type: formData.type,
        link: formData.link.trim() || "/dashboard",
        mode,
      };

      if (mode === "INDIVIDUAL") {
        payload.recipientId = selectedRecipient?.id;
      } else {
        payload.target = formData.target;
      }

      const res = await usersAPI.broadcastNotification(payload);
      toast.success(res.data.message || "Notification sent successfully! 🔔");

      // Reset form
      setFormData({
        title: "",
        message: "",
        type: "INFO",
        target: "ALL",
        link: "/dashboard",
      });
      setSelectedRecipient(null);
      setSearchQuery("");

      // Refresh sent history
      loadHistory();
    } catch (err: any) {
      toast.error(err.response?.data?.message || "Failed to send notification.");
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteNotification = async (id: string) => {
    if (!confirm("Are you sure you want to delete this notification record?")) return;
    try {
      await usersAPI.deleteNotification(id);
      toast.success("Notification deleted.");
      setHistory((prev) => prev.filter((n) => n.id !== id));
    } catch {
      toast.error("Failed to delete notification.");
    }
  };

  const notifTypes = [
    {
      value: "INFO",
      label: "Information",
      desc: "Platform updates, tips, announcements",
      icon: <Info size={16} />,
      color: "#2563eb",
      bg: "#eff6ff",
      border: "#bfdbfe",
      glow: "rgba(37, 99, 235, 0.15)",
    },
    {
      value: "SUCCESS",
      label: "Success",
      desc: "Completions, rewards, achievements",
      icon: <CheckCircle2 size={16} />,
      color: "#059669",
      bg: "#ecfdf5",
      border: "#a7f3d0",
      glow: "rgba(5, 150, 105, 0.15)",
    },
    {
      value: "WARNING",
      label: "Notice / Alert",
      desc: "Deadlines, pending actions, reminders",
      icon: <AlertTriangle size={16} />,
      color: "#d97706",
      bg: "#fffbeb",
      border: "#fde68a",
      glow: "rgba(217, 119, 6, 0.15)",
    },
    {
      value: "ERROR",
      label: "Urgent",
      desc: "Critical alerts, account action needed",
      icon: <AlertCircle size={16} />,
      color: "#dc2626",
      bg: "#fef2f2",
      border: "#fecaca",
      glow: "rgba(220, 38, 38, 0.15)",
    },
  ];

  const adminAudienceOptions = [
    {
      value: "ALL",
      title: "All Users",
      desc: "Every registered student, teacher, and admin",
      icon: <Radio size={18} />,
    },
    {
      value: "STUDENTS",
      title: "Students Only",
      desc: "All learners currently enrolled across the platform",
      icon: <GraduationCap size={18} />,
    },
    {
      value: "TEACHERS",
      title: "Teachers Only",
      desc: "Instructor and faculty accounts exclusively",
      icon: <Shield size={18} />,
    },
  ];

  const teacherAudienceOptions = [
    {
      value: "ALL",
      title: "All Students",
      desc: "Broadcast notification to all student accounts",
      icon: <Radio size={18} />,
    },
    {
      value: "MY_STUDENTS",
      title: "My Students",
      desc: "Students created by or enrolled in your courses",
      icon: <Users size={18} />,
    },
  ];

  const audienceOptions =
    requiredRole === "TEACHER" ? teacherAudienceOptions : adminAudienceOptions;

  const adminTemplates = [
    {
      title: "Welcome to Derivion LMS! 🎓",
      message:
        "We're thrilled to welcome you to our learning community. Explore courses, track your lessons, and boost your skills today!",
      type: "SUCCESS",
      link: "/courses",
    },
    {
      title: "Exciting New Course Released 🚀",
      message:
        "Check out our newest curriculum modules now available in the course catalog. Enroll now to start learning!",
      type: "INFO",
      link: "/courses",
    },
    {
      title: "Scheduled Maintenance Window ⚙️",
      message:
        "We will be deploying server optimizations tonight. You may experience brief intermittent pauses for approximately 10 minutes.",
      type: "WARNING",
      link: "/dashboard",
    },
    {
      title: "Exclusive Enrollment Perk 🎉",
      message:
        "Special opportunity for active learners! Take advantage of newly released study materials and certification pathways.",
      type: "SUCCESS",
      link: "/dashboard",
    },
  ];

  const teacherTemplates = [
    {
      title: "New Assignment & Lesson Ready 📝",
      message:
        "A new lesson and quiz have been published. Please review your dashboard and complete the activities before the upcoming deadline.",
      type: "INFO",
      link: "/dashboard",
    },
    {
      title: "Great Job on Recent Assessment! 🌟",
      message:
        "Outstanding performance on your recent coursework and quizzes! Keep up the brilliant momentum.",
      type: "SUCCESS",
      link: "/dashboard",
    },
    {
      title: "Reminder: Review Session Tomorrow ⏰",
      message:
        "Don't forget our upcoming live review session tomorrow. Please come prepared with your questions and notes.",
      type: "WARNING",
      link: "/dashboard",
    },
  ];

  const templates = requiredRole === "TEACHER" ? teacherTemplates : adminTemplates;

  const currentTypeConfig =
    notifTypes.find((t) => t.value === formData.type) || notifTypes[0];

  const formatRelativeTime = (dateStr: string) => {
    try {
      const diff = Date.now() - new Date(dateStr).getTime();
      const mins = Math.floor(diff / 60000);
      if (mins < 1) return "Just now";
      if (mins < 60) return `${mins}m ago`;
      const hrs = Math.floor(mins / 60);
      if (hrs < 24) return `${hrs}h ago`;
      const days = Math.floor(hrs / 24);
      return `${days}d ago`;
    } catch {
      return "Recently";
    }
  };

  const filteredHistory = history.filter((item) => {
    if (!historySearch.trim()) return true;
    const q = historySearch.toLowerCase();
    const titleMatch = item.title?.toLowerCase().includes(q);
    const msgMatch = item.message?.toLowerCase().includes(q);
    const userMatch = item.user
      ? `${item.user.firstName} ${item.user.lastName} ${item.user.email} ${item.user.username}`
          .toLowerCase()
          .includes(q)
      : false;
    return titleMatch || msgMatch || userMatch;
  });

  return (
    <AppLayout requiredRole={requiredRole}>
      {/* Top Banner Header */}
      <div
        style={{
          background: "linear-gradient(135deg, #1e293b 0%, #0f172a 100%)",
          borderRadius: 20,
          padding: "28px 32px",
          color: "white",
          marginBottom: 24,
          boxShadow: "0 10px 25px -5px rgba(15, 23, 42, 0.3)",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: 16,
          position: "relative",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            position: "absolute",
            top: -20,
            right: 80,
            width: 180,
            height: 180,
            borderRadius: "50%",
            background: "radial-gradient(circle, rgba(29, 78, 216, 0.15) 0%, transparent 70%)",
            pointerEvents: "none",
          }}
        />

        <div style={{ position: "relative", zIndex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 5,
                background: "rgba(29, 78, 216, 0.25)",
                color: "#c7d2fe",
                fontSize: 12,
                fontWeight: 600,
                padding: "3px 10px",
                borderRadius: 20,
                border: "1px solid rgba(165, 180, 252, 0.3)",
              }}
            >
              <Bell size={13} /> Notification Dispatch Center
            </span>
            <span
              style={{
                fontSize: 12,
                color: "#94a3b8",
                fontWeight: 500,
              }}
            >
              Role: {requiredRole === "ADMIN" ? "Administrator" : "Instructor / Teacher"}
            </span>
          </div>

          <h1 style={{ fontSize: 26, fontWeight: 800, margin: 0, letterSpacing: "-0.5px" }}>
            Send Alerts &amp; Announcements
          </h1>
          <p
            style={{
              fontSize: 14,
              color: "#94a3b8",
              margin: "6px 0 0 0",
              maxWidth: 620,
              lineHeight: 1.5,
            }}
          >
            {requiredRole === "ADMIN"
              ? "Notify individual students, teachers, or broadcast announcements across the entire platform in real-time."
              : "Keep your students updated with instant individual feedback or group announcements directly in their notification tray."}
          </p>
        </div>

        {/* Tab switch */}
        <div
          style={{
            display: "inline-flex",
            background: "rgba(255, 255, 255, 0.08)",
            padding: 4,
            borderRadius: 12,
            border: "1px solid rgba(255, 255, 255, 0.12)",
            position: "relative",
            zIndex: 1,
          }}
        >
          <button
            type="button"
            onClick={() => setActiveTab("COMPOSE")}
            style={{
              padding: "8px 16px",
              fontSize: 13,
              fontWeight: 600,
              borderRadius: 8,
              border: "none",
              cursor: "pointer",
              background: activeTab === "COMPOSE" ? "white" : "transparent",
              color: activeTab === "COMPOSE" ? "#0f172a" : "#cbd5e1",
              boxShadow: activeTab === "COMPOSE" ? "0 2px 6px rgba(0,0,0,0.2)" : "none",
              display: "flex",
              alignItems: "center",
              gap: 8,
              transition: "all 0.15s ease",
            }}
          >
            <Send size={15} /> Compose
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("HISTORY")}
            style={{
              padding: "8px 16px",
              fontSize: 13,
              fontWeight: 600,
              borderRadius: 8,
              border: "none",
              cursor: "pointer",
              background: activeTab === "HISTORY" ? "white" : "transparent",
              color: activeTab === "HISTORY" ? "#0f172a" : "#cbd5e1",
              boxShadow: activeTab === "HISTORY" ? "0 2px 6px rgba(0,0,0,0.2)" : "none",
              display: "flex",
              alignItems: "center",
              gap: 8,
              transition: "all 0.15s ease",
            }}
          >
            <History size={15} /> Sent History
            {history.length > 0 && (
              <span
                style={{
                  background: activeTab === "HISTORY" ? "#e2e8f0" : "rgba(255, 255, 255, 0.2)",
                  color: activeTab === "HISTORY" ? "#0f172a" : "white",
                  fontSize: 11,
                  padding: "1px 6px",
                  borderRadius: 10,
                  fontWeight: 700,
                }}
              >
                {history.length}
              </span>
            )}
          </button>
        </div>
      </div>

      {activeTab === "COMPOSE" ? (
        /* ================= COMPOSE VIEW ================= */
        <div style={{ display: "grid", gridTemplateColumns: "1fr 360px", gap: 24, alignItems: "start" }}>
          {/* Main Card */}
          <div
            style={{
              background: "#ffffff",
              borderRadius: 16,
              border: "1px solid #e2e8f0",
              boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.05), 0 2px 4px -1px rgba(0, 0, 0, 0.03)",
              overflow: "hidden",
            }}
          >
            {/* Header with Mode Toggle */}
            <div
              style={{
                padding: "20px 24px",
                borderBottom: "1px solid #f1f5f9",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                flexWrap: "wrap",
                gap: 12,
                background: "#fafafa",
              }}
            >
              <div>
                <h2 style={{ fontSize: 16, fontWeight: 700, margin: 0, color: "#0f172a" }}>
                  Compose Dispatch
                </h2>
                <p style={{ fontSize: 12, color: "#64748b", margin: "2px 0 0 0" }}>
                  Choose delivery target, message type, and enter details below.
                </p>
              </div>

              {/* Delivery Mode Pills */}
              <div
                style={{
                  display: "inline-flex",
                  background: "#f1f5f9",
                  padding: 3,
                  borderRadius: 10,
                  border: "1px solid #e2e8f0",
                }}
              >
                <button
                  type="button"
                  onClick={() => setMode("BULK")}
                  style={{
                    padding: "7px 14px",
                    fontSize: 12,
                    fontWeight: 600,
                    borderRadius: 7,
                    border: "none",
                    cursor: "pointer",
                    background: mode === "BULK" ? "#ffffff" : "transparent",
                    color: mode === "BULK" ? "var(--primary)" : "#64748b",
                    boxShadow: mode === "BULK" ? "0 1px 3px rgba(0,0,0,0.1)" : "none",
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    transition: "all 0.15s ease",
                  }}
                >
                  <Users size={14} /> Bulk Audience
                </button>

                <button
                  type="button"
                  onClick={() => setMode("INDIVIDUAL")}
                  style={{
                    padding: "7px 14px",
                    fontSize: 12,
                    fontWeight: 600,
                    borderRadius: 7,
                    border: "none",
                    cursor: "pointer",
                    background: mode === "INDIVIDUAL" ? "#ffffff" : "transparent",
                    color: mode === "INDIVIDUAL" ? "var(--primary)" : "#64748b",
                    boxShadow: mode === "INDIVIDUAL" ? "0 1px 3px rgba(0,0,0,0.1)" : "none",
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    transition: "all 0.15s ease",
                  }}
                >
                  <User size={14} /> Individual User
                </button>
              </div>
            </div>

            <div style={{ padding: "24px" }}>
              {/* Delivery Target Section */}
              {mode === "BULK" ? (
                <div style={{ marginBottom: 24 }}>
                  <label
                    style={{
                      display: "block",
                      fontSize: 13,
                      fontWeight: 700,
                      color: "#1e293b",
                      marginBottom: 10,
                    }}
                  >
                    Select Target Cohort
                  </label>

                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: `repeat(${audienceOptions.length}, 1fr)`,
                      gap: 12,
                    }}
                  >
                    {audienceOptions.map((opt) => {
                      const isSelected = formData.target === opt.value;
                      return (
                        <div
                          key={opt.value}
                          onClick={() => setFormData({ ...formData, target: opt.value })}
                          style={{
                            padding: "14px 16px",
                            borderRadius: 12,
                            border: `2px solid ${isSelected ? "var(--primary)" : "#e2e8f0"}`,
                            background: isSelected ? "var(--primary-50)" : "#ffffff",
                            cursor: "pointer",
                            transition: "all 0.15s ease",
                            display: "flex",
                            flexDirection: "column",
                            gap: 6,
                            position: "relative",
                          }}
                        >
                          <div
                            style={{
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "space-between",
                            }}
                          >
                            <div
                              style={{
                                color: isSelected ? "var(--primary)" : "#64748b",
                                display: "flex",
                                alignItems: "center",
                                gap: 8,
                                fontWeight: 700,
                                fontSize: 14,
                              }}
                            >
                              {opt.icon}
                              <span>{opt.title}</span>
                            </div>
                            {isSelected && (
                              <div
                                style={{
                                  width: 18,
                                  height: 18,
                                  borderRadius: "50%",
                                  background: "var(--primary)",
                                  color: "white",
                                  display: "flex",
                                  alignItems: "center",
                                  justifyContent: "center",
                                }}
                              >
                                <CheckCheck size={12} />
                              </div>
                            )}
                          </div>
                          <span style={{ fontSize: 12, color: "#64748b", lineHeight: 1.4 }}>
                            {opt.desc}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : (
                /* Individual Recipient Selector */
                <div style={{ marginBottom: 24 }}>
                  <label
                    style={{
                      display: "block",
                      fontSize: 13,
                      fontWeight: 700,
                      color: "#1e293b",
                      marginBottom: 10,
                    }}
                  >
                    Select Individual Recipient
                  </label>

                  {selectedRecipient ? (
                    <div
                      style={{
                        padding: "16px 20px",
                        background: "linear-gradient(135deg, #f8fafc 0%, #eff6ff 100%)",
                        border: "2px solid #bfdbfe",
                        borderRadius: 14,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        boxShadow: "0 2px 4px rgba(37, 99, 235, 0.05)",
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                        <div
                          style={{
                            width: 44,
                            height: 44,
                            borderRadius: "50%",
                            background: "linear-gradient(135deg, var(--primary) 0%, #1e40af 100%)",
                            color: "white",
                            fontWeight: 800,
                            fontSize: 16,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            boxShadow: "0 2px 6px rgba(79, 70, 229, 0.3)",
                          }}
                        >
                          {selectedRecipient.firstName?.charAt(0) || "U"}
                        </div>

                        <div>
                          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <span style={{ fontWeight: 700, fontSize: 15, color: "#0f172a" }}>
                              {selectedRecipient.firstName} {selectedRecipient.lastName}
                            </span>
                            <span
                              style={{
                                fontSize: 10,
                                fontWeight: 700,
                                padding: "2px 8px",
                                borderRadius: 12,
                                background:
                                  selectedRecipient.role === "ADMIN"
                                    ? "#fee2e2"
                                    : selectedRecipient.role === "TEACHER"
                                    ? "#dcfce7"
                                    : "#dbe6ff",
                                color:
                                  selectedRecipient.role === "ADMIN"
                                    ? "#b91c1c"
                                    : selectedRecipient.role === "TEACHER"
                                    ? "#15803d"
                                    : "#1e40af",
                              }}
                            >
                              {selectedRecipient.role}
                            </span>
                          </div>
                          <div style={{ fontSize: 13, color: "#64748b", marginTop: 2 }}>
                            {selectedRecipient.email}{" "}
                            {selectedRecipient.username && (
                              <span style={{ color: "#94a3b8" }}>
                                (@{selectedRecipient.username})
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => setSelectedRecipient(null)}
                        style={{
                          background: "#ffffff",
                          border: "1px solid #cbd5e1",
                          color: "#64748b",
                          padding: "6px 12px",
                          borderRadius: 8,
                          fontSize: 12,
                          fontWeight: 600,
                          cursor: "pointer",
                          display: "flex",
                          alignItems: "center",
                          gap: 6,
                          transition: "all 0.15s",
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.borderColor = "#ef4444";
                          e.currentTarget.style.color = "#ef4444";
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.borderColor = "#cbd5e1";
                          e.currentTarget.style.color = "#64748b";
                        }}
                      >
                        <X size={14} /> Change
                      </button>
                    </div>
                  ) : (
                    <div style={{ position: "relative" }}>
                      <div style={{ position: "relative" }}>
                        <Search
                          size={16}
                          style={{
                            position: "absolute",
                            left: 14,
                            top: "50%",
                            transform: "translateY(-50%)",
                            color: "#94a3b8",
                          }}
                        />
                        <input
                          type="text"
                          className="input"
                          placeholder="Search recipient by name, email, or @username…"
                          value={searchQuery}
                          onChange={(e) => setSearchQuery(e.target.value)}
                          style={{
                            paddingLeft: 40,
                            height: 44,
                            fontSize: 14,
                            borderRadius: 10,
                            border: "1px solid #cbd5e1",
                          }}
                          autoFocus
                        />
                      </div>

                      {/* Dropdown list */}
                      {searchQuery.trim().length > 0 && (
                        <div
                          style={{
                            position: "absolute",
                            top: "calc(100% + 6px)",
                            left: 0,
                            right: 0,
                            background: "#ffffff",
                            border: "1px solid #cbd5e1",
                            borderRadius: 12,
                            maxHeight: 260,
                            overflowY: "auto",
                            boxShadow: "0 10px 25px -5px rgba(0, 0, 0, 0.1)",
                            zIndex: 60,
                          }}
                        >
                          {searching ? (
                            <div style={{ padding: "16px", color: "#94a3b8", fontSize: 13, textAlign: "center" }}>
                              Searching users database…
                            </div>
                          ) : searchResults.length === 0 ? (
                            <div style={{ padding: "16px", color: "#94a3b8", fontSize: 13, textAlign: "center" }}>
                              No users found for &quot;{searchQuery}&quot;
                            </div>
                          ) : (
                            searchResults.map((u) => (
                              <div
                                key={u.id}
                                onClick={() => {
                                  setSelectedRecipient(u);
                                  setSearchQuery("");
                                  setSearchResults([]);
                                }}
                                style={{
                                  padding: "12px 16px",
                                  display: "flex",
                                  alignItems: "center",
                                  gap: 12,
                                  cursor: "pointer",
                                  borderBottom: "1px solid #f1f5f9",
                                  transition: "background 0.15s",
                                }}
                                onMouseEnter={(e) => (e.currentTarget.style.background = "#f8fafc")}
                                onMouseLeave={(e) => (e.currentTarget.style.background = "#ffffff")}
                              >
                                <div
                                  style={{
                                    width: 36,
                                    height: 36,
                                    borderRadius: "50%",
                                    background: "#dbe6ff",
                                    color: "var(--primary)",
                                    fontWeight: 700,
                                    fontSize: 14,
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    flexShrink: 0,
                                  }}
                                >
                                  {u.firstName?.charAt(0) || "U"}
                                </div>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                    <span style={{ fontWeight: 600, fontSize: 14, color: "#0f172a" }}>
                                      {u.firstName} {u.lastName}
                                    </span>
                                    <span
                                      style={{
                                        fontSize: 10,
                                        fontWeight: 700,
                                        padding: "1px 6px",
                                        borderRadius: 8,
                                        background:
                                          u.role === "ADMIN"
                                            ? "#fee2e2"
                                            : u.role === "TEACHER"
                                            ? "#dcfce7"
                                            : "#f1f5f9",
                                        color:
                                          u.role === "ADMIN"
                                            ? "#b91c1c"
                                            : u.role === "TEACHER"
                                            ? "#15803d"
                                            : "#475569",
                                      }}
                                    >
                                      {u.role}
                                    </span>
                                  </div>
                                  <div style={{ fontSize: 12, color: "#64748b" }}>
                                    {u.email} {u.username && `(@${u.username})`}
                                  </div>
                                </div>
                                <span
                                  style={{
                                    fontSize: 12,
                                    color: "var(--primary)",
                                    fontWeight: 600,
                                    display: "flex",
                                    alignItems: "center",
                                    gap: 2,
                                  }}
                                >
                                  Select <ArrowRight size={13} />
                                </span>
                              </div>
                            ))
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Notification Category Type Selection */}
              <div style={{ marginBottom: 20 }}>
                <label
                  style={{
                    display: "block",
                    fontSize: 13,
                    fontWeight: 700,
                    color: "#1e293b",
                    marginBottom: 10,
                  }}
                >
                  Notification Type &amp; Tone
                </label>

                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(4, 1fr)",
                    gap: 10,
                  }}
                >
                  {notifTypes.map((t) => {
                    const isSelected = formData.type === t.value;
                    return (
                      <button
                        key={t.value}
                        type="button"
                        onClick={() => setFormData({ ...formData, type: t.value })}
                        style={{
                          padding: "10px 12px",
                          borderRadius: 10,
                          border: `1.5px solid ${isSelected ? t.color : "#e2e8f0"}`,
                          background: isSelected ? t.bg : "#ffffff",
                          color: isSelected ? t.color : "#475569",
                          cursor: "pointer",
                          display: "flex",
                          alignItems: "center",
                          gap: 8,
                          justifyContent: "center",
                          fontWeight: 600,
                          fontSize: 13,
                          boxShadow: isSelected ? `0 2px 8px ${t.glow}` : "none",
                          transition: "all 0.15s ease",
                        }}
                      >
                        {t.icon}
                        <span>{t.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Title Input */}
              <div style={{ marginBottom: 18 }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                  <label style={{ fontSize: 13, fontWeight: 700, color: "#1e293b" }}>
                    Notification Title <span style={{ color: "#ef4444" }}>*</span>
                  </label>
                  <span style={{ fontSize: 12, color: "#94a3b8" }}>
                    {formData.title.length}/100
                  </span>
                </div>
                <input
                  type="text"
                  className="input"
                  placeholder="e.g. Important Assessment Scheduled"
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  maxLength={100}
                  style={{ height: 44, borderRadius: 10, fontSize: 14 }}
                />
              </div>

              {/* Message Input */}
              <div style={{ marginBottom: 18 }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                  <label style={{ fontSize: 13, fontWeight: 700, color: "#1e293b" }}>
                    Message Content <span style={{ color: "#ef4444" }}>*</span>
                  </label>
                  <span style={{ fontSize: 12, color: "#94a3b8" }}>
                    {formData.message.length}/500
                  </span>
                </div>
                <textarea
                  className="input"
                  rows={4}
                  placeholder="Type clear and concise message to be sent to recipient(s)..."
                  value={formData.message}
                  onChange={(e) => setFormData({ ...formData, message: e.target.value })}
                  maxLength={500}
                  style={{
                    padding: "12px 14px",
                    borderRadius: 10,
                    fontSize: 14,
                    lineHeight: 1.5,
                    resize: "vertical",
                  }}
                />
              </div>

              {/* Link Input & Quick Presets */}
              <div style={{ marginBottom: 26 }}>
                <label style={{ display: "block", fontSize: 13, fontWeight: 700, color: "#1e293b", marginBottom: 6 }}>
                  Action Link URL (Optional)
                </label>
                <div style={{ position: "relative", marginBottom: 8 }}>
                  <input
                    type="text"
                    className="input"
                    placeholder="e.g. /dashboard or /courses"
                    value={formData.link}
                    onChange={(e) => setFormData({ ...formData, link: e.target.value })}
                    style={{ height: 42, borderRadius: 10, fontSize: 14 }}
                  />
                </div>

                {/* Quick link chips */}
                <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                  <span style={{ fontSize: 11, color: "#94a3b8", fontWeight: 600 }}>Presets:</span>
                  {["/dashboard", "/courses", "/support", "/settings"].map((path) => (
                    <button
                      key={path}
                      type="button"
                      onClick={() => setFormData({ ...formData, link: path })}
                      style={{
                        padding: "3px 8px",
                        fontSize: 11,
                        borderRadius: 6,
                        border: "1px solid #e2e8f0",
                        background: formData.link === path ? "var(--primary-50)" : "#ffffff",
                        color: formData.link === path ? "var(--primary)" : "#64748b",
                        fontWeight: 500,
                        cursor: "pointer",
                      }}
                    >
                      {path}
                    </button>
                  ))}
                </div>
              </div>

              {/* Live Preview Card */}
              <div style={{ marginBottom: 24 }}>
                <div
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    textTransform: "uppercase",
                    letterSpacing: "0.5px",
                    color: "#94a3b8",
                    marginBottom: 8,
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                  }}
                >
                  <Sparkles size={12} color="var(--primary)" /> Recipient Live Bell Tray Preview
                </div>

                <div
                  style={{
                    background: "#ffffff",
                    border: `1.5px solid ${currentTypeConfig.border}`,
                    borderRadius: 14,
                    padding: "16px 18px",
                    display: "flex",
                    gap: 14,
                    alignItems: "flex-start",
                    boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.05)",
                  }}
                >
                  <div
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: 10,
                      background: currentTypeConfig.bg,
                      color: currentTypeConfig.color,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flexShrink: 0,
                      marginTop: 2,
                    }}
                  >
                    {currentTypeConfig.icon}
                  </div>

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                      <span style={{ fontWeight: 700, fontSize: 14, color: "#0f172a" }}>
                        {formData.title || "Your Notification Title"}
                      </span>
                      <span
                        style={{
                          width: 8,
                          height: 8,
                          borderRadius: "50%",
                          background: currentTypeConfig.color,
                        }}
                      />
                    </div>

                    <div style={{ fontSize: 13, color: "#475569", lineHeight: 1.5, marginTop: 4, whiteSpace: "pre-wrap" }}>
                      {formData.message || "This is how your message will appear in the recipient's notification tray."}
                    </div>

                    <div
                      style={{
                        fontSize: 11,
                        color: "#94a3b8",
                        marginTop: 8,
                        display: "flex",
                        alignItems: "center",
                        gap: 10,
                      }}
                    >
                      <span style={{ display: "flex", alignItems: "center", gap: 3 }}>
                        <Clock size={11} /> Just now
                      </span>
                      {formData.link && (
                        <span style={{ color: "var(--primary)", fontWeight: 600 }}>
                          Action: {formData.link} →
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Submit Button */}
              <button
                type="button"
                className="btn btn-primary"
                onClick={handleSend}
                disabled={loading || !formData.title.trim() || !formData.message.trim()}
                style={{
                  width: "100%",
                  height: 48,
                  justifyContent: "center",
                  fontSize: 15,
                  fontWeight: 700,
                  borderRadius: 12,
                  boxShadow: "0 4px 12px rgba(79, 70, 229, 0.25)",
                }}
              >
                {loading ? (
                  "Sending Notification…"
                ) : (
                  <>
                    <Send size={16} /> Send Notification Now
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Sidebar / Presets */}
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            {/* Quick Templates Card */}
            <div
              style={{
                background: "#ffffff",
                borderRadius: 16,
                border: "1px solid #e2e8f0",
                boxShadow: "0 2px 4px rgba(0, 0, 0, 0.03)",
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  padding: "16px 20px",
                  borderBottom: "1px solid #f1f5f9",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  background: "#fafafa",
                }}
              >
                <span style={{ fontWeight: 700, fontSize: 14, color: "#0f172a" }}>
                  Quick Templates
                </span>
                <span style={{ fontSize: 11, color: "var(--primary)", fontWeight: 600 }}>
                  1-Click Insert
                </span>
              </div>

              <div style={{ padding: "16px", display: "flex", flexDirection: "column", gap: 10 }}>
                {templates.map((tpl, i) => (
                  <div
                    key={i}
                    onClick={() =>
                      setFormData({
                        ...formData,
                        title: tpl.title,
                        message: tpl.message,
                        type: tpl.type,
                        link: tpl.link || "/dashboard",
                      })
                    }
                    style={{
                      background: "#f8fafc",
                      border: "1px solid #e2e8f0",
                      borderRadius: 12,
                      padding: "12px 14px",
                      cursor: "pointer",
                      transition: "all 0.15s ease",
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.borderColor = "var(--primary)";
                      e.currentTarget.style.background = "var(--primary-50)";
                      e.currentTarget.style.transform = "translateY(-1px)";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.borderColor = "#e2e8f0";
                      e.currentTarget.style.background = "#f8fafc";
                      e.currentTarget.style.transform = "translateY(0)";
                    }}
                  >
                    <div style={{ fontSize: 13, fontWeight: 700, color: "#0f172a", marginBottom: 3 }}>
                      {tpl.title}
                    </div>
                    <div
                      style={{
                        fontSize: 12,
                        color: "#64748b",
                        lineHeight: 1.4,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        display: "-webkit-box",
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: "vertical",
                      }}
                    >
                      {tpl.message}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Info Box */}
            <div
              style={{
                background: "linear-gradient(135deg, #eff6ff 0%, #f5f3ff 100%)",
                border: "1px solid #c7d2fe",
                borderRadius: 16,
                padding: "20px",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                <Sparkles size={16} color="var(--primary)" />
                <span style={{ fontWeight: 700, fontSize: 13, color: "#1e3a8a" }}>
                  Delivery Insights
                </span>
              </div>
              <ul
                style={{
                  paddingLeft: 18,
                  fontSize: 12,
                  lineHeight: 1.8,
                  color: "#475569",
                  margin: 0,
                }}
              >
                <li>
                  Notifications trigger the <strong>red badge counter</strong> on the recipient&apos;s header bell icon.
                </li>
                <li>
                  Individual messages are ideal for 1-on-1 feedback, grade notices, and assignment notes.
                </li>
                <li>
                  Bulk notifications are delivered instantly to all accounts matching the selected audience criteria.
                </li>
              </ul>
            </div>
          </div>
        </div>
      ) : (
        /* ================= SENT HISTORY VIEW ================= */
        <div
          style={{
            background: "#ffffff",
            borderRadius: 16,
            border: "1px solid #e2e8f0",
            boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.05)",
            overflow: "hidden",
          }}
        >
          {/* Header */}
          <div
            style={{
              padding: "20px 24px",
              borderBottom: "1px solid #f1f5f9",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              flexWrap: "wrap",
              gap: 12,
              background: "#fafafa",
            }}
          >
            <div>
              <h2 style={{ fontSize: 16, fontWeight: 700, margin: 0, color: "#0f172a" }}>
                Sent Notifications Log
              </h2>
              <p style={{ fontSize: 12, color: "#64748b", margin: "2px 0 0 0" }}>
                Recent notifications delivered to users on the platform.
              </p>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ position: "relative" }}>
                <Search
                  size={14}
                  style={{
                    position: "absolute",
                    left: 10,
                    top: "50%",
                    transform: "translateY(-50%)",
                    color: "#94a3b8",
                  }}
                />
                <input
                  type="text"
                  placeholder="Filter notifications…"
                  value={historySearch}
                  onChange={(e) => setHistorySearch(e.target.value)}
                  style={{
                    paddingLeft: 30,
                    height: 36,
                    fontSize: 12,
                    borderRadius: 8,
                    border: "1px solid #cbd5e1",
                    width: 200,
                  }}
                />
              </div>

              <button
                type="button"
                className="btn btn-secondary"
                onClick={loadHistory}
                disabled={loadingHistory}
                style={{ height: 36, padding: "0 12px", fontSize: 12 }}
              >
                <RefreshCw size={13} className={loadingHistory ? "animate-spin" : ""} /> Refresh
              </button>
            </div>
          </div>

          {/* History Table */}
          <div className="table-container" style={{ margin: 0, border: "none", boxShadow: "none" }}>
            <table>
              <thead>
                <tr>
                  <th>Recipient / Audience</th>
                  <th>Type</th>
                  <th>Notification Details</th>
                  <th>Link</th>
                  <th>Time Sent</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {loadingHistory ? (
                  <tr>
                    <td colSpan={7} style={{ textAlign: "center", padding: "40px 0", color: "#94a3b8" }}>
                      Loading sent history…
                    </td>
                  </tr>
                ) : filteredHistory.length === 0 ? (
                  <tr>
                    <td colSpan={7} style={{ textAlign: "center", padding: "48px 0" }}>
                      <div className="empty-state">
                        <div className="empty-state-icon">🔔</div>
                        <div className="empty-state-title">No notifications sent yet</div>
                        <div className="empty-state-text">
                          Use the &quot;Compose&quot; tab to send your first platform notification.
                        </div>
                      </div>
                    </td>
                  </tr>
                ) : (
                  filteredHistory.map((item) => {
                    const typeCfg =
                      notifTypes.find((t) => t.value === item.type) || notifTypes[0];

                    return (
                      <tr key={item.id}>
                        {/* Recipient */}
                        <td>
                          {item.user ? (
                            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                              <div
                                style={{
                                  width: 32,
                                  height: 32,
                                  borderRadius: "50%",
                                  background: "#dbe6ff",
                                  color: "var(--primary)",
                                  fontWeight: 700,
                                  fontSize: 12,
                                  display: "flex",
                                  alignItems: "center",
                                  justifyContent: "center",
                                }}
                              >
                                {item.user.firstName?.charAt(0) || "U"}
                              </div>
                              <div>
                                <div style={{ fontWeight: 600, fontSize: 13, color: "#0f172a" }}>
                                  {item.user.firstName} {item.user.lastName}
                                </div>
                                <div style={{ fontSize: 11, color: "#64748b" }}>
                                  {item.user.email}
                                </div>
                              </div>
                            </div>
                          ) : (
                            <div style={{ display: "flex", alignItems: "center", gap: 6, color: "#64748b", fontSize: 13 }}>
                              <Users size={14} />
                              <span>Platform Recipient</span>
                            </div>
                          )}
                        </td>

                        {/* Type badge */}
                        <td>
                          <span
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              gap: 4,
                              padding: "3px 8px",
                              borderRadius: 8,
                              fontSize: 11,
                              fontWeight: 700,
                              background: typeCfg.bg,
                              color: typeCfg.color,
                            }}
                          >
                            {typeCfg.icon}
                            {item.type}
                          </span>
                        </td>

                        {/* Title & Message */}
                        <td style={{ maxWidth: 320 }}>
                          <div style={{ fontWeight: 600, fontSize: 13, color: "#0f172a", marginBottom: 2 }}>
                            {item.title}
                          </div>
                          <div
                            style={{
                              fontSize: 12,
                              color: "#64748b",
                              lineHeight: 1.4,
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap",
                            }}
                          >
                            {item.message}
                          </div>
                        </td>

                        {/* Link */}
                        <td>
                          {item.link ? (
                            <code style={{ fontSize: 11, background: "#f1f5f9", padding: "2px 6px", borderRadius: 4 }}>
                              {item.link}
                            </code>
                          ) : (
                            <span style={{ color: "#94a3b8", fontSize: 12 }}>—</span>
                          )}
                        </td>

                        {/* Time */}
                        <td>
                          <span style={{ fontSize: 12, color: "#64748b" }}>
                            {formatRelativeTime(item.createdAt)}
                          </span>
                        </td>

                        {/* Read Status */}
                        <td>
                          <span
                            style={{
                              fontSize: 11,
                              fontWeight: 600,
                              padding: "2px 8px",
                              borderRadius: 10,
                              background: item.isRead ? "#f1f5f9" : "#dbe6ff",
                              color: item.isRead ? "#64748b" : "var(--primary)",
                            }}
                          >
                            {item.isRead ? "Read" : "Unread"}
                          </span>
                        </td>

                        {/* Delete action */}
                        <td>
                          <button
                            type="button"
                            className="btn btn-ghost btn-icon btn-sm"
                            onClick={() => handleDeleteNotification(item.id)}
                            title="Delete notification"
                          >
                            <Trash2 size={14} color="#ef4444" />
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </AppLayout>
  );
}
