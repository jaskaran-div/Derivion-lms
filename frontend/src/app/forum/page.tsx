"use client";

import { useEffect, useState } from "react";
import AppLayout from "@/components/layout/AppLayout";
import { usersAPI, forumAPI } from "@/lib/api";
import Link from "next/link";
import toast from "react-hot-toast";
import { MessageSquare, Plus, Eye, Clock, Pin, Search } from "lucide-react";

interface ForumPost {
  id: string;
  title: string;
  content: string;
  isPinned: boolean;
  views: number;
  createdAt: string;
  user: { firstName: string; lastName: string; avatar?: string };
  course: { title: string; slug: string };
  _count: { replies: number };
}

export default function ForumPage() {
  const [posts, setPosts] = useState<ForumPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [enrollments, setEnrollments] = useState<any[]>([]);
  const [selectedCourse, setSelectedCourse] = useState("");
  const [search, setSearch] = useState("");
  const [showNewPost, setShowNewPost] = useState(false);
  const [newPost, setNewPost] = useState({ title: "", content: "", courseId: "" });
  const [posting, setPosting] = useState(false);

  useEffect(() => {
    loadEnrollments();
  }, []);

  useEffect(() => {
    if (selectedCourse) loadPosts(selectedCourse);
  }, [selectedCourse]);

  const loadEnrollments = async () => {
    try {
      const res = await usersAPI.getEnrollments();
      const enrolls = res.data.data;
      setEnrollments(enrolls);
      if (enrolls.length > 0) {
        setSelectedCourse(enrolls[0].course.id);
        setNewPost(prev => ({ ...prev, courseId: enrolls[0].course.id }));
      }
    } catch {}
  };

  const loadPosts = async (courseId: string) => {
    setLoading(true);
    try {
      const res = await forumAPI.getPosts(courseId);
      setPosts(res.data.data.posts);
    } catch {
      toast.error("Failed to load posts.");
    } finally {
      setLoading(false);
    }
  };

  const handleCreatePost = async () => {
    if (!newPost.title.trim() || !newPost.content.trim() || !newPost.courseId) {
      toast.error("Please fill all fields.");
      return;
    }
    setPosting(true);
    try {
      await forumAPI.createPost(newPost.courseId, { title: newPost.title, content: newPost.content });
      toast.success("Post created!");
      setNewPost({ title: "", content: "", courseId: selectedCourse });
      setShowNewPost(false);
      loadPosts(selectedCourse);
    } catch {
      toast.error("Failed to create post.");
    } finally {
      setPosting(false);
    }
  };

  const filteredPosts = posts.filter(p =>
    p.title.toLowerCase().includes(search.toLowerCase()) ||
    p.content.toLowerCase().includes(search.toLowerCase())
  );

  const formatDate = (dateStr: string) => {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return `${Math.floor(hrs / 24)}d ago`;
  };

  return (
    <AppLayout>
      <div className="page-header">
        <div>
          <h1 className="page-title">Discussion Forum</h1>
          <p className="page-subtitle">Ask questions, share insights, connect with fellow learners</p>
        </div>
        <div className="page-actions">
          <button className="btn btn-primary" onClick={() => setShowNewPost(true)}>
            <Plus size={16} /> New Post
          </button>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "240px 1fr", gap: 24, alignItems: "start" }}>
        {/* Left: Course selector */}
        <div className="card" style={{ padding: "12px 8px" }}>
          <div style={{ padding: "4px 12px 12px", fontSize: 12, fontWeight: 600, color: "var(--gray-400)", textTransform: "uppercase", letterSpacing: 0.5 }}>
            My Courses
          </div>
          {enrollments.length === 0 ? (
            <div style={{ padding: "12px 14px", fontSize: 13, color: "var(--gray-400)" }}>
              No enrolled courses. <Link href="/courses" style={{ color: "var(--primary)" }}>Browse courses →</Link>
            </div>
          ) : (
            enrollments.map(e => (
              <div
                key={e.course.id}
                className={`sidebar-nav-item ${selectedCourse === e.course.id ? "active" : ""}`}
                onClick={() => { setSelectedCourse(e.course.id); setNewPost(prev => ({ ...prev, courseId: e.course.id })); }}
                style={{ fontSize: 13 }}
              >
                <span className="sidebar-nav-icon"><MessageSquare size={14} /></span>
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {e.course.title}
                </span>
              </div>
            ))
          )}
        </div>

        {/* Right: Posts */}
        <div>
          {/* New Post Form */}
          {showNewPost && (
            <div className="card" style={{ marginBottom: 20, border: "2px solid var(--primary-light)" }}>
              <div className="card-header">
                <span className="card-title">Create New Post</span>
                <button className="btn btn-ghost btn-sm" onClick={() => setShowNewPost(false)}>✕</button>
              </div>
              <div className="card-body">
                <div className="form-group">
                  <label className="form-label required">Course</label>
                  <select
                    className="form-control"
                    value={newPost.courseId}
                    onChange={e => setNewPost({ ...newPost, courseId: e.target.value })}
                  >
                    {enrollments.map(e => (
                      <option key={e.course.id} value={e.course.id}>{e.course.title}</option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label required">Title</label>
                  <input
                    className="form-control"
                    placeholder="What's your question or topic?"
                    value={newPost.title}
                    onChange={e => setNewPost({ ...newPost, title: e.target.value })}
                    autoFocus
                  />
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label required">Content</label>
                  <textarea
                    className="form-control"
                    rows={4}
                    placeholder="Describe your question or share your thoughts..."
                    value={newPost.content}
                    onChange={e => setNewPost({ ...newPost, content: e.target.value })}
                  />
                </div>
                <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 16 }}>
                  <button className="btn btn-secondary" onClick={() => setShowNewPost(false)}>Cancel</button>
                  <button className="btn btn-primary" onClick={handleCreatePost} disabled={posting}>
                    {posting ? "Posting..." : "Post Question"}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Search */}
          {selectedCourse && (
            <div className="search-bar" style={{ marginBottom: 16 }}>
              <Search size={16} color="var(--gray-400)" />
              <input
                placeholder="Search discussions..."
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>
          )}

          {/* Posts List */}
          {!selectedCourse ? (
            <div className="empty-state">
              <div className="empty-state-icon">📚</div>
              <div className="empty-state-title">Enroll in a course to join discussions</div>
              <Link href="/courses"><button className="btn btn-primary">Browse Courses</button></Link>
            </div>
          ) : loading ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {[1, 2, 3].map(i => (
                <div key={i} className="card" style={{ padding: 20 }}>
                  <div className="skeleton" style={{ height: 18, width: "70%", marginBottom: 10 }} />
                  <div className="skeleton" style={{ height: 14, marginBottom: 8 }} />
                  <div className="skeleton" style={{ height: 14, width: "50%" }} />
                </div>
              ))}
            </div>
          ) : filteredPosts.length === 0 ? (
            <div className="empty-state">
              <div className="empty-state-icon">💬</div>
              <div className="empty-state-title">No discussions yet</div>
              <div className="empty-state-text">Be the first to start a discussion in this course!</div>
              <button className="btn btn-primary" onClick={() => setShowNewPost(true)}>
                <Plus size={16} /> Start Discussion
              </button>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {filteredPosts.map(post => (
                <Link href={`/forum/${post.id}`} key={post.id}>
                  <div
                    className="card"
                    style={{
                      padding: 20,
                      transition: "transform 0.15s, box-shadow 0.15s",
                      cursor: "pointer",
                      borderLeft: post.isPinned ? "4px solid var(--primary)" : "1px solid var(--border-color)",
                    }}
                    onMouseEnter={e => {
                      (e.currentTarget as HTMLDivElement).style.transform = "translateX(4px)";
                      (e.currentTarget as HTMLDivElement).style.boxShadow = "var(--shadow-md)";
                    }}
                    onMouseLeave={e => {
                      (e.currentTarget as HTMLDivElement).style.transform = "";
                      (e.currentTarget as HTMLDivElement).style.boxShadow = "";
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                          {post.isPinned && (
                            <span style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, color: "var(--primary)", fontWeight: 600 }}>
                              <Pin size={11} /> Pinned
                            </span>
                          )}
                          <h3 style={{ fontSize: 15, fontWeight: 600, color: "var(--gray-900)" }}>{post.title}</h3>
                        </div>
                        <p style={{ fontSize: 13, color: "var(--gray-500)", lineHeight: 1.5, marginBottom: 10 }}>
                          {post.content.slice(0, 140)}{post.content.length > 140 ? "..." : ""}
                        </p>
                        <div style={{ display: "flex", alignItems: "center", gap: 16, fontSize: 12, color: "var(--gray-400)" }}>
                          <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                            <div className="avatar" style={{ width: 18, height: 18, fontSize: 9 }}>
                              {post.user.firstName[0]}{post.user.lastName[0]}
                            </div>
                            {post.user.firstName} {post.user.lastName}
                          </span>
                          <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                            <Clock size={12} /> {formatDate(post.createdAt)}
                          </span>
                          <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                            <Eye size={12} /> {post.views}
                          </span>
                          <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                            <MessageSquare size={12} /> {post._count.replies} replies
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  );
}
