"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import AppLayout from "@/components/layout/AppLayout";
import UniversalChat from "@/components/chat/UniversalChat";
import { chatAPI, displayLogin } from "@/lib/api";
import toast from "react-hot-toast";
import { MessageSquare, ListFilter } from "lucide-react";

interface Thread {
  id: string;
  status: string;
  lastMessageAt: string;
  unreadAdmin: number;
  user: {
    firstName: string;
    lastName: string;
    email: string;
    username?: string;
    role: string;
    phone?: string;
    guardianEmail?: string;
  };
  messages: { body: string }[];
}

export default function AdminSupportInboxPage() {
  const [activeTab, setActiveTab] = useState<"chat" | "table">("chat");
  const [threads, setThreads] = useState<Thread[]>([]);
  const [loading, setLoading] = useState(true);

  const load = () => {
    return chatAPI.adminList()
      .then((res) => {
        setThreads(res.data.data || []);
      })
      .catch(() => {
        toast.error("Failed to load chats.");
      })
      .finally(() => {
        setLoading(false);
      });
  };

  useEffect(() => {
    if (activeTab === "table") {
      load();
      const t = setInterval(load, 8000);
      return () => clearInterval(t);
    }
  }, [activeTab]);

  return (
    <AppLayout requiredRole="ADMIN">
      <div
        className="page-header"
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: 12,
          marginBottom: 16,
        }}
      >
        <div>
          <h1 className="page-title">Support & Messages</h1>
          <p className="page-subtitle">
            Chat directly with students, teachers, and users or review support inbox inquiries.
          </p>
        </div>

        {/* Tab switcher */}
        <div style={{ display: "flex", gap: 8 }}>
          <button
            type="button"
            className={`btn ${activeTab === "chat" ? "btn-primary" : "btn-secondary"}`}
            onClick={() => setActiveTab("chat")}
            style={{ display: "flex", alignItems: "center", gap: 6 }}
          >
            <MessageSquare size={16} /> Live Chat
          </button>
          <button
            type="button"
            className={`btn ${activeTab === "table" ? "btn-primary" : "btn-secondary"}`}
            onClick={() => setActiveTab("table")}
            style={{ display: "flex", alignItems: "center", gap: 6 }}
          >
            <ListFilter size={16} /> Inquiries Table
          </button>
        </div>
      </div>

      {activeTab === "chat" ? (
        <UniversalChat />
      ) : (
        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>From</th>
                <th>Account</th>
                <th>Latest message</th>
                <th>Updated</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={5}>Loading…</td>
                </tr>
              ) : threads.length === 0 ? (
                <tr>
                  <td colSpan={5}>
                    <div className="empty-state">
                      <div className="empty-state-title">No chats yet</div>
                    </div>
                  </td>
                </tr>
              ) : (
                threads.map((t) => (
                  <tr key={t.id}>
                    <td>
                      <div style={{ fontWeight: 600 }}>
                        {t.user?.firstName} {t.user?.lastName}
                        {t.unreadAdmin > 0 && (
                          <span className="badge badge-danger" style={{ marginLeft: 8 }}>
                            {t.unreadAdmin} new
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: 12, color: "var(--gray-400)" }}>{t.user?.role}</div>
                    </td>
                    <td>
                      <div style={{ fontSize: 13 }}>{displayLogin(t.user)}</div>
                      {t.user?.username && <div style={{ fontSize: 12 }}>ID: {t.user.username}</div>}
                      {(t.user?.phone || t.user?.guardianEmail) && (
                        <div style={{ fontSize: 12, color: "var(--gray-400)" }}>
                          {t.user.guardianEmail || t.user.phone}
                        </div>
                      )}
                    </td>
                    <td
                      style={{
                        maxWidth: 280,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {t.messages?.[0]?.body || "—"}
                    </td>
                    <td>{new Date(t.lastMessageAt).toLocaleString("en-IN")}</td>
                    <td>
                      <Link href={`/admin/support/${t.id}`}>
                        <button className="btn btn-secondary btn-sm">Open</button>
                      </Link>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </AppLayout>
  );
}
