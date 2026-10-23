"use client";

import { RefreshCw, Search, Trash2, Users } from "lucide-react";
import { notifTypes } from "./notificationConfig";

export interface SentNotification {
  id: string;
  title: string;
  message: string;
  type: string;
  link?: string | null;
  isRead: boolean;
  createdAt: string;
  user?: { id: string; firstName: string; lastName: string; email: string } | null;
}

interface Props {
  items: SentNotification[];
  loading: boolean;
  search: string;
  onSearchChange: (value: string) => void;
  onRefresh: () => void;
  onDelete: (id: string) => void;
  formatTime: (iso: string) => string;
}

// "Sent notifications" log with search, refresh and delete
export default function NotificationHistory({ items, loading, search, onSearchChange, onRefresh, onDelete, formatTime }: Props) {
  return (
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
                value={search}
                onChange={(e) => onSearchChange(e.target.value)}
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
              onClick={onRefresh}
              disabled={loading}
              style={{ height: 36, padding: "0 12px", fontSize: 12 }}
            >
              <RefreshCw size={13} className={loading ? "animate-spin" : ""} /> Refresh
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
              {loading ? (
                <tr>
                  <td colSpan={7} style={{ textAlign: "center", padding: "40px 0", color: "#94a3b8" }}>
                    Loading sent history…
                  </td>
                </tr>
              ) : items.length === 0 ? (
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
                items.map((item) => {
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
                          {formatTime(item.createdAt)}
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
                          onClick={() => onDelete(item.id)}
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
  );
}
