"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import toast from "react-hot-toast";
import { ArrowLeft, CheckCircle2, Clock, Eye, Lock, MessageSquare, Pin, Send } from "lucide-react";
import AppLayout from "@/components/layout/AppLayout";
import { apiErrorMessage, forumAPI } from "@/lib/api";
import { useAuthStore } from "@/store/authStore";
import { useNow } from "@/lib/useNow";

interface Author {
  firstName: string;
  lastName: string;
  avatar?: string | null;
  role?: "ADMIN" | "TEACHER" | "STUDENT";
}

interface Reply {
  id: string;
  content: string;
  isAnswer: boolean;
  createdAt: string;
  user: Author;
}

interface Post {
  id: string;
  title: string;
  content: string;
  isPinned: boolean;
  isLocked: boolean;
  views: number;
  createdAt: string;
  user: Author;
  course?: { id: string; title: string; slug: string } | null;
  replies: Reply[];
}

const initials = (u: Author) => `${u.firstName?.[0] || ""}${u.lastName?.[0] || ""}`.toUpperCase();

function AuthorBadge({ user }: { user: Author }) {
  if (user.role === "ADMIN") return <span className="badge badge-danger" style={{ fontSize: 10 }}>Admin</span>;
  if (user.role === "TEACHER") return <span className="badge badge-blue" style={{ fontSize: 10 }}>Teacher</span>;
  return null;
}

export default function ForumPostPage() {
  const { id } = useParams<{ id: string }>();
  const now = useNow();
  const { user } = useAuthStore();
  const [post, setPost] = useState<Post | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);

  const load = useCallback(
    () =>
      forumAPI
        .getPost(id)
        .then((res) => setPost(res.data.data))
        .catch((err) => setError(apiErrorMessage(err, "This discussion could not be loaded.")))
        .finally(() => setLoading(false)),
    [id]
  );

  useEffect(() => {
    if (id) load();
  }, [id, load]);

  const timeAgo = (iso: string) => {
    const mins = Math.max(0, Math.floor((now - new Date(iso).getTime()) / 60000));
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
  };

  const sendReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reply.trim() || !post) return;
    setSending(true);
    try {
      const res = await forumAPI.addReply(post.id, reply.trim());
      setPost((prev) => (prev ? { ...prev, replies: [...prev.replies, res.data.data] } : prev));
      setReply("");
      toast.success("Reply posted.");
    } catch (err) {
      toast.error(apiErrorMessage(err, "Could not post your reply."));
    } finally {
      setSending(false);
    }
  };

  const locked = Boolean(post?.isLocked) && user?.role === "STUDENT";

  return (
    <AppLayout>
      <div style={{ maxWidth: 860, margin: "0 auto" }}>
        <Link href="/forum" className="btn btn-ghost btn-sm" style={{ marginBottom: 16, display: "inline-flex" }}>
          <ArrowLeft size={16} /> Back to forum
        </Link>

        {loading ? (
          <div className="card" style={{ padding: 24 }}>
            <div className="skeleton" style={{ height: 24, width: "60%", marginBottom: 14 }} />
            <div className="skeleton" style={{ height: 14, marginBottom: 8 }} />
            <div className="skeleton" style={{ height: 14, width: "80%" }} />
          </div>
        ) : !post ? (
          <div className="empty-state">
            <div className="empty-state-icon">💬</div>
            <div className="empty-state-title">Discussion not available</div>
            <div className="empty-state-text">{error || "It may have been removed, or you may not be enrolled in its course."}</div>
            <Link href="/forum"><button className="btn btn-primary">Back to forum</button></Link>
          </div>
        ) : (
          <>
            <article className="card" style={{ padding: 24, marginBottom: 20 }}>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", marginBottom: 10, fontSize: 12 }}>
                {post.course && <span className="badge badge-blue">{post.course.title}</span>}
                {post.isPinned && (
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 4, color: "var(--primary)", fontWeight: 600 }}>
                    <Pin size={12} /> Pinned
                  </span>
                )}
                {post.isLocked && (
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 4, color: "var(--gray-500)", fontWeight: 600 }}>
                    <Lock size={12} /> Locked
                  </span>
                )}
              </div>
              <h1 style={{ fontSize: 22, fontWeight: 700, color: "var(--gray-900)", marginBottom: 12 }}>{post.title}</h1>
              <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 14, fontSize: 13, color: "var(--gray-500)", marginBottom: 18 }}>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                  <span className="avatar" style={{ width: 26, height: 26, fontSize: 11 }}>{initials(post.user)}</span>
                  <strong style={{ color: "var(--gray-800)" }}>{post.user.firstName} {post.user.lastName}</strong>
                  <AuthorBadge user={post.user} />
                </span>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}><Clock size={13} /> {timeAgo(post.createdAt)}</span>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}><Eye size={13} /> {post.views} views</span>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}><MessageSquare size={13} /> {post.replies.length} replies</span>
              </div>
              <div style={{ fontSize: 15, lineHeight: 1.7, color: "var(--gray-700)", whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
                {post.content}
              </div>
            </article>

            <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 12 }}>
              {post.replies.length ? `${post.replies.length} ${post.replies.length === 1 ? "reply" : "replies"}` : "No replies yet"}
            </h2>

            <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 20 }}>
              {post.replies.map((r) => (
                <div
                  key={r.id}
                  className="card"
                  style={{ padding: 18, borderLeft: r.isAnswer ? "4px solid var(--success)" : undefined }}
                >
                  <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8, fontSize: 13, marginBottom: 8 }}>
                    <span className="avatar" style={{ width: 24, height: 24, fontSize: 10 }}>{initials(r.user)}</span>
                    <strong style={{ color: "var(--gray-800)" }}>{r.user.firstName} {r.user.lastName}</strong>
                    <AuthorBadge user={r.user} />
                    <span style={{ color: "var(--gray-400)" }}>· {timeAgo(r.createdAt)}</span>
                    {r.isAnswer && (
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 4, color: "var(--success)", fontWeight: 600, marginLeft: "auto" }}>
                        <CheckCircle2 size={14} /> Accepted answer
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: 14, lineHeight: 1.65, color: "var(--gray-700)", whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
                    {r.content}
                  </div>
                </div>
              ))}
            </div>

            {locked ? (
              <div className="alert alert-info" style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <Lock size={15} /> This discussion is locked. New replies are turned off.
              </div>
            ) : (
              <form className="card" style={{ padding: 18 }} onSubmit={sendReply}>
                <label className="form-label" htmlFor="forum-reply">Your reply</label>
                <textarea
                  id="forum-reply"
                  className="form-control"
                  rows={4}
                  placeholder="Share an answer or follow-up question…"
                  value={reply}
                  onChange={(e) => setReply(e.target.value)}
                  maxLength={10000}
                />
                <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 12 }}>
                  <button type="submit" className="btn btn-primary" disabled={sending || !reply.trim()}>
                    <Send size={15} /> {sending ? "Posting…" : "Post reply"}
                  </button>
                </div>
              </form>
            )}
          </>
        )}
      </div>
    </AppLayout>
  );
}
