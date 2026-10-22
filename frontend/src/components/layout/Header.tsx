"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { Bell, Menu, Search, X, ChevronRight, ChevronDown, Settings, LogOut, CheckCheck, CheckCircle2, AlertTriangle, AlertCircle, Info, Sparkles } from "lucide-react";
import { useAuthStore } from "@/store/authStore";
import { usersAPI } from "@/lib/api";
import Link from "next/link";

interface HeaderProps {
  title?: string;
  onMobileMenuToggle?: () => void;
}

interface Notification {
  id: string;
  title: string;
  message: string;
  type: string;
  isRead: boolean;
  link?: string;
  createdAt: string;
}

export default function Header({ title, onMobileMenuToggle }: HeaderProps) {
  const router = useRouter();
  const { user } = useAuthStore();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [showNotifications, setShowNotifications] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const notifRef = useRef<HTMLDivElement>(null);
  const userRef = useRef<HTMLDivElement>(null);

  const unreadCount = notifications.filter((n) => !n.isRead).length;

  useEffect(() => {
    fetchNotifications();
  }, []);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) {
        setShowNotifications(false);
      }
      if (userRef.current && !userRef.current.contains(e.target as Node)) {
        setShowUserMenu(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const fetchNotifications = async () => {
    try {
      const { data } = await usersAPI.getNotifications();
      setNotifications(data.data);
    } catch {}
  };

  const markAllRead = async () => {
    try {
      await usersAPI.markAllRead();
      setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
    } catch {}
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      router.push(`/courses?search=${encodeURIComponent(searchQuery.trim())}`);
      setSearchQuery("");
    }
  };

  const getInitials = () => {
    if (!user) return "U";
    return `${user.firstName[0]}${user.lastName[0]}`.toUpperCase();
  };

  const formatTime = (dateStr: string) => {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return `${Math.floor(hrs / 24)}d ago`;
  };

  return (
    <header className="app-header">
      {/* Mobile menu toggle */}
      <button
        className="header-icon-btn mobile-menu-btn"
        onClick={onMobileMenuToggle}
        aria-label="Open menu"
      >
        <Menu size={20} />
      </button>

      {/* Page title or search */}
      {title ? (
        <h1 style={{ fontSize: 18, fontWeight: 600, color: "var(--gray-900)" }}>
          {title}
        </h1>
      ) : (
        <form onSubmit={handleSearch} className="header-search" style={{ flex: 1, maxWidth: 380 }}>
          <div className="search-bar">
            <Search size={17} color="var(--gray-500)" />
            <input
              type="text"
              placeholder="Search here..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </form>
      )}

      <div style={{ flex: 1 }} />

      {/* Notifications */}
      <div ref={notifRef} style={{ position: "relative" }}>
        <button
          className={`header-icon-btn ${showNotifications ? "active" : ""}`}
          onClick={() => {
            setShowNotifications(!showNotifications);
            setShowUserMenu(false);
          }}
          title="Notifications"
          aria-label="Notifications"
        >
          <Bell size={19} />
          {unreadCount > 0 && (
            <span
              style={{
                position: "absolute",
                top: 6,
                right: 6,
                minWidth: unreadCount > 9 ? 18 : 10,
                height: 10,
                padding: unreadCount > 9 ? "0 3px" : 0,
                borderRadius: 9,
                background: "#ef4444",
                border: "2px solid white",
              }}
              title={`${unreadCount} unread`}
            />
          )}
        </button>

        {showNotifications && (
          <div
            style={{
              position: "absolute",
              top: "calc(100% + 10px)",
              right: 0,
              width: 390,
              maxWidth: "92vw",
              background: "#ffffff",
              border: "1px solid rgba(226, 232, 240, 0.8)",
              borderRadius: 16,
              boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04), 0 0 0 1px rgba(0, 0, 0, 0.05)",
              zIndex: 300,
              overflow: "hidden",
              animation: "slideUp 0.18s cubic-bezier(0.16, 1, 0.3, 1)",
            }}
          >
            {/* Header */}
            <div
              style={{
                padding: "14px 18px",
                borderBottom: "1px solid var(--gray-100)",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                background: "linear-gradient(to bottom, #ffffff, #fafafa)",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontWeight: 700, fontSize: 15, color: "var(--gray-900)" }}>
                  Notifications
                </span>
                {unreadCount > 0 && (
                  <span
                    style={{
                      background: "var(--primary-50)",
                      color: "var(--primary)",
                      fontWeight: 700,
                      fontSize: 11,
                      padding: "2px 8px",
                      borderRadius: 10,
                    }}
                  >
                    {unreadCount} new
                  </span>
                )}
              </div>

              {unreadCount > 0 && (
                <button
                  onClick={markAllRead}
                  style={{
                    fontSize: 12,
                    color: "var(--primary)",
                    fontWeight: 600,
                    cursor: "pointer",
                    background: "none",
                    border: "none",
                    display: "flex",
                    alignItems: "center",
                    gap: 4,
                    padding: "4px 8px",
                    borderRadius: 6,
                    transition: "background 0.15s",
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = "var(--primary-50)")}
                  onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                >
                  <CheckCheck size={14} /> Mark all read
                </button>
              )}
            </div>

            {/* List */}
            <div style={{ maxHeight: 380, overflowY: "auto" }}>
              {notifications.length === 0 ? (
                <div
                  style={{
                    padding: "44px 24px",
                    textAlign: "center",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    gap: 10,
                  }}
                >
                  <div
                    style={{
                      width: 52,
                      height: 52,
                      borderRadius: "50%",
                      background: "var(--gray-100)",
                      color: "var(--gray-400)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <Bell size={24} />
                  </div>
                  <div style={{ fontWeight: 600, fontSize: 14, color: "var(--gray-700)" }}>
                    No notifications yet
                  </div>
                  <div style={{ fontSize: 12, color: "var(--gray-400)", maxWidth: 220, lineHeight: 1.4 }}>
                    We&apos;ll notify you when announcements, course updates, or messages arrive.
                  </div>
                </div>
              ) : (
                notifications.map((notif) => {
                  const typeColors: Record<string, { bg: string; color: string; icon: any }> = {
                    SUCCESS: {
                      bg: "#ecfdf5",
                      color: "#059669",
                      icon: <CheckCircle2 size={15} />,
                    },
                    WARNING: {
                      bg: "#fffbeb",
                      color: "#d97706",
                      icon: <AlertTriangle size={15} />,
                    },
                    ERROR: {
                      bg: "#fef2f2",
                      color: "#dc2626",
                      icon: <AlertCircle size={15} />,
                    },
                    INFO: {
                      bg: "#eff6ff",
                      color: "#2563eb",
                      icon: <Info size={15} />,
                    },
                  };

                  const currentType = typeColors[notif.type] || typeColors.INFO;

                  return (
                    <div
                      key={notif.id}
                      style={{
                        padding: "13px 18px",
                        borderBottom: "1px solid var(--gray-100)",
                        background: notif.isRead ? "white" : "rgba(239, 246, 255, 0.45)",
                        cursor: "pointer",
                        position: "relative",
                        transition: "all 0.15s ease",
                        display: "flex",
                        gap: 12,
                        alignItems: "flex-start",
                      }}
                      onClick={async () => {
                        if (!notif.isRead) {
                          try {
                            await usersAPI.markNotificationRead(notif.id);
                            setNotifications((prev) =>
                              prev.map((n) => (n.id === notif.id ? { ...n, isRead: true } : n))
                            );
                          } catch {}
                        }
                        if (notif.link) {
                          setShowNotifications(false);
                          router.push(notif.link);
                        }
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = notif.isRead
                          ? "var(--gray-50)"
                          : "rgba(239, 246, 255, 0.8)";
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = notif.isRead
                          ? "white"
                          : "rgba(239, 246, 255, 0.45)";
                      }}
                    >
                      {/* Left icon badge */}
                      <div
                        style={{
                          width: 32,
                          height: 32,
                          borderRadius: 8,
                          background: currentType.bg,
                          color: currentType.color,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          flexShrink: 0,
                          marginTop: 2,
                        }}
                      >
                        {currentType.icon}
                      </div>

                      {/* Content */}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6 }}>
                          <span
                            style={{
                              fontSize: 13,
                              fontWeight: notif.isRead ? 600 : 700,
                              color: "var(--gray-900)",
                              lineHeight: 1.3,
                            }}
                          >
                            {notif.title}
                          </span>
                          {!notif.isRead && (
                            <span
                              style={{
                                width: 7,
                                height: 7,
                                borderRadius: "50%",
                                background: "var(--primary)",
                                flexShrink: 0,
                              }}
                            />
                          )}
                        </div>

                        <div
                          style={{
                            fontSize: 12,
                            color: "var(--gray-600)",
                            lineHeight: 1.45,
                            marginTop: 3,
                            wordBreak: "break-word",
                          }}
                        >
                          {notif.message}
                        </div>

                        <div
                          style={{
                            fontSize: 11,
                            color: "var(--gray-400)",
                            marginTop: 5,
                            display: "flex",
                            alignItems: "center",
                            gap: 10,
                          }}
                        >
                          <span>{formatTime(notif.createdAt)}</span>
                          {notif.link && (
                            <span
                              style={{
                                color: "var(--primary)",
                                display: "inline-flex",
                                alignItems: "center",
                                gap: 2,
                                fontWeight: 500,
                              }}
                            >
                              Open <ChevronRight size={10} />
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Dismiss button */}
                      <button
                        type="button"
                        onClick={async (e) => {
                          e.stopPropagation();
                          try {
                            await usersAPI.deleteNotification(notif.id);
                            setNotifications((prev) => prev.filter((n) => n.id !== notif.id));
                          } catch {}
                        }}
                        style={{
                          background: "none",
                          border: "none",
                          color: "var(--gray-400)",
                          cursor: "pointer",
                          padding: 4,
                          borderRadius: 4,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          opacity: 0.6,
                          transition: "all 0.15s",
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.color = "var(--danger)";
                          e.currentTarget.style.opacity = "1";
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.color = "var(--gray-400)";
                          e.currentTarget.style.opacity = "0.6";
                        }}
                        title="Dismiss"
                      >
                        <X size={13} />
                      </button>
                    </div>
                  );
                })
              )}
            </div>

            {/* Role-based footer shortcut for Admin and Teacher ONLY */}
            {(user?.role === "ADMIN" || user?.role === "TEACHER") && (
              <div
                style={{
                  padding: "10px 16px",
                  background: "var(--gray-50)",
                  borderTop: "1px solid var(--gray-100)",
                  display: "flex",
                  justifyContent: "center",
                }}
              >
                <Link
                  href={user.role === "ADMIN" ? "/admin/notifications" : "/teacher/notifications"}
                  onClick={() => setShowNotifications(false)}
                  style={{
                    fontSize: 12,
                    fontWeight: 600,
                    color: "var(--primary)",
                    textDecoration: "none",
                    display: "flex",
                    alignItems: "center",
                    gap: 5,
                  }}
                >
                  <Sparkles size={13} /> Compose &amp; Send Notifications →
                </Link>
              </div>
            )}
          </div>
        )}
      </div>

      {/* User menu */}
      <div ref={userRef} style={{ position: "relative" }}>
        <button
          className="header-user-btn"
          onClick={() => {
            setShowUserMenu(!showUserMenu);
            setShowNotifications(false);
          }}
        >
          {user?.avatar ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={user.avatar} alt="" className="avatar" />
          ) : (
            <div className="avatar">{getInitials()}</div>
          )}
          <div className="header-user-meta" style={{ minWidth: 0, maxWidth: 200 }}>
            <div className="header-user-name truncate">{user?.firstName} {user?.lastName}</div>
            <div className="header-user-email truncate">{user?.email}</div>
          </div>
          <ChevronDown size={16} color="var(--gray-500)" />
        </button>

        {showUserMenu && (
          <div className="header-dropdown" style={{ width: 230 }}>
            <div style={{ padding: "14px 16px", borderBottom: "1px solid var(--border-color)" }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: "var(--gray-900)" }}>
                {user?.firstName} {user?.lastName}
              </div>
              <div style={{ fontSize: 12, color: "var(--gray-500)", marginTop: 2, wordBreak: "break-all" }}>
                {user?.email}
              </div>
            </div>
            <div style={{ padding: 8 }}>
              <Link
                href={user?.role === "ADMIN" ? "/admin/settings" : "/settings"}
                onClick={() => setShowUserMenu(false)}
                className="sidebar-nav-item plain"
                style={{ padding: "9px 10px", marginBottom: 0 }}
              >
                <Settings size={16} /> Settings
              </Link>
              <button
                onClick={() => {
                  useAuthStore.getState().logout();
                  router.push("/login");
                }}
                className="sidebar-nav-item plain"
                style={{ width: "100%", padding: "9px 10px", color: "var(--danger)", marginBottom: 0 }}
              >
                <LogOut size={16} /> Logout
              </button>
            </div>
          </div>
        )}
      </div>
    </header>
  );
}
