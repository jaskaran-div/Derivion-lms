"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import AppLayout from "@/components/layout/AppLayout";
import { chatAPI, apiErrorMessage, displayLogin } from "@/lib/api";
import toast from "react-hot-toast";
import { ArrowLeft, Send, KeyRound } from "lucide-react";

interface ThreadPerson {
  firstName: string;
  lastName: string;
  role: string;
}

interface ThreadAccount extends ThreadPerson {
  id: string;
  email: string;
  username?: string | null;
  phone?: string | null;
  guardianEmail?: string | null;
  guardianPhone?: string | null;
  isActive: boolean;
  lastLogin?: string | null;
  createdAt: string;
  createdBy?: { firstName: string; lastName: string; email: string } | null;
}

interface SupportThread {
  id: string;
  status: string;
  user: ThreadAccount | null;
  messages: { id: string; body: string; createdAt: string; sender?: ThreadPerson | null }[];
}

export default function AdminSupportThreadPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [thread, setThread] = useState<SupportThread | null>(null);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [resetPassword, setResetPassword] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const load = () => {
    return chatAPI.adminGet(id)
      .then((res) => {
        setThread(res.data.data);
      })
      .catch(() => {
        toast.error("Failed to load chat.");
      });
  };

  useEffect(() => {
    if (id) load();
    const t = setInterval(() => { if (id) load(); }, 8000);
    return () => clearInterval(t);
  }, [id]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [thread?.messages?.length]);

  const send = async () => {
    const body = text.trim();
    if (!body) return;
    setSending(true);
    try {
      await chatAPI.adminReply(id, body);
      setText("");
      load();
    } catch (err) {
      toast.error(apiErrorMessage(err, "Failed to reply."));
    } finally {
      setSending(false);
    }
  };

  const resetPwd = async () => {
    if (!confirm("Generate a new one-time password for this student?")) return;
    try {
      const res = await chatAPI.adminResetPassword(id);
      setResetPassword(res.data.data.password);
      toast.success("Password reset. Copy it now.");
      load();
    } catch (err) {
      toast.error(apiErrorMessage(err, "Reset failed."));
    }
  };

  const u = thread?.user;

  return (
    <AppLayout requiredRole="ADMIN">
      <div className="page-header">
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <button className="btn btn-ghost btn-icon" onClick={() => router.push("/admin/support")}>
            <ArrowLeft size={20} />
          </button>
          <div>
            <h1 className="page-title">
              {u ? `${u.firstName} ${u.lastName}` : "Chat"}
            </h1>
            <p className="page-subtitle">Conversation with account details</p>
          </div>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "minmax(240px, 320px) 1fr", gap: 16 }}>
        <div className="card">
          <div className="card-header"><span className="card-title">Account</span></div>
          <div className="card-body" style={{ fontSize: 13, lineHeight: 1.7 }}>
            {!u ? "Loading…" : (
              <>
                <div><strong>Role:</strong> {u.role}</div>
                <div><strong>Login:</strong> {displayLogin(u)}</div>
                {u.username && <div><strong>Student ID:</strong> {u.username}</div>}
                {u.phone && <div><strong>Phone:</strong> {u.phone}</div>}
                {u.guardianEmail && <div><strong>Guardian email:</strong> {u.guardianEmail}</div>}
                {u.guardianPhone && <div><strong>Guardian phone:</strong> {u.guardianPhone}</div>}
                <div><strong>Status:</strong> {u.isActive ? "Active" : "Inactive"}</div>
                {u.createdBy && (
                  <div><strong>Created by teacher:</strong> {u.createdBy.firstName} {u.createdBy.lastName}</div>
                )}
                <div><strong>Last login:</strong> {u.lastLogin ? new Date(u.lastLogin).toLocaleString("en-IN") : "Never"}</div>
                {u.role === "STUDENT" && (
                  <button className="btn btn-secondary w-full" style={{ marginTop: 16 }} onClick={resetPwd}>
                    <KeyRound size={14} /> Reset student password
                  </button>
                )}
                {resetPassword && (
                  <div className="alert alert-info" style={{ marginTop: 12, fontSize: 12 }}>
                    New password (copy now): <code>{resetPassword}</code>
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        <div className="card" style={{ display: "flex", flexDirection: "column", minHeight: 480 }}>
          <div className="card-header"><span className="card-title">Messages</span></div>
          <div style={{ flex: 1, overflowY: "auto", padding: 16, display: "flex", flexDirection: "column", gap: 10 }}>
            {(thread?.messages || []).map((m) => {
              const admin = m.sender?.role === "ADMIN";
              return (
                <div key={m.id} style={{ display: "flex", justifyContent: admin ? "flex-end" : "flex-start" }}>
                  <div
                    style={{
                      maxWidth: "80%",
                      background: admin ? "var(--primary)" : "var(--gray-100)",
                      color: admin ? "white" : "var(--gray-800)",
                      padding: "10px 14px",
                      borderRadius: 14,
                      fontSize: 14,
                      whiteSpace: "pre-wrap",
                    }}
                  >
                    <div style={{ fontSize: 11, opacity: 0.8, marginBottom: 4 }}>
                      {m.sender?.firstName} {m.sender?.lastName} · {m.sender?.role}
                    </div>
                    {m.body}
                  </div>
                </div>
              );
            })}
            <div ref={bottomRef} />
          </div>
          <div style={{ padding: 16, borderTop: "1px solid var(--border-color)", display: "flex", gap: 8 }}>
            <input
              className="form-control"
              placeholder="Reply as admin…"
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && send()}
            />
            <button className="btn btn-primary" onClick={send} disabled={sending}><Send size={16} /></button>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
