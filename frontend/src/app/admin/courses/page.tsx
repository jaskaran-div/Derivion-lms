"use client";

import { useEffect, useState, useCallback } from "react";
import AppLayout from "@/components/layout/AppLayout";
import { coursesAPI } from "@/lib/api";
import Link from "next/link";
import toast from "react-hot-toast";
import {
  Plus, Search, Edit, Trash2, ToggleLeft, ToggleRight, Users,
} from "lucide-react";

interface Course {
  id: string;
  title: string;
  slug: string;
  status: string;
  price: number;
  level: string;
  category: { name: string };
  _count: { enrollments: number; sections: number };
  createdAt: string;
  thumbnail?: string;
}

export default function AdminCoursesPage() {
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const limit = 15;

  const fetchCourses = useCallback(() => {
    return coursesAPI.adminGetAll({ page, limit, search, status })
      .then((res) => {
        setCourses(res.data.data.courses);
        setTotal(res.data.data.pagination.total);
      })
      .catch(() => {
        toast.error("Failed to load courses.");
      })
      .finally(() => {
        setLoading(false);
      });
  }, [page, search, status]);

  useEffect(() => { fetchCourses(); }, [fetchCourses]);

  const handleDelete = async (id: string, title: string) => {
    if (!confirm(`Delete "${title}"? This action cannot be undone.`)) return;
    try {
      await coursesAPI.delete(id);
      toast.success("Course deleted.");
      fetchCourses();
    } catch {
      toast.error("Failed to delete course.");
    }
  };

  const handleTogglePublish = async (id: string, currentStatus: string) => {
    try {
      await coursesAPI.togglePublish(id);
      toast.success(`Course ${currentStatus === "PUBLISHED" ? "unpublished" : "published"}.`);
      fetchCourses();
    } catch {
      toast.error("Failed to update status.");
    }
  };

  const getStatusBadge = (status: string) => {
    if (status === "PUBLISHED") return <span className="badge badge-success">Published</span>;
    if (status === "DRAFT") return <span className="badge badge-warning">Draft</span>;
    return <span className="badge badge-gray">Archived</span>;
  };

  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(amount);

  return (
    <AppLayout requiredRole="ADMIN">
      <div className="page-header">
        <div>
          <h1 className="page-title">Courses</h1>
          <p className="page-subtitle">
            {total} course{total !== 1 ? "s" : ""} in total
          </p>
        </div>
        <div className="page-actions">
          <Link href="/admin/courses/new">
            <button className="btn btn-primary">
              <Plus size={16} /> Add Course
            </button>
          </Link>
        </div>
      </div>

      {/* Filters */}
      <div
        className="card"
        style={{ padding: "16px 20px", marginBottom: 20 }}
      >
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
          <div className="search-bar" style={{ flex: 1, minWidth: 240, maxWidth: 400 }}>
            <Search size={16} color="var(--gray-400)" />
            <input
              type="text"
              placeholder="Search courses..."
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            />
          </div>
          <select
            className="form-control"
            style={{ width: 160 }}
            value={status}
            onChange={(e) => { setStatus(e.target.value); setPage(1); }}
          >
            <option value="">All Status</option>
            <option value="PUBLISHED">Published</option>
            <option value="DRAFT">Draft</option>
            <option value="ARCHIVED">Archived</option>
          </select>
        </div>
      </div>

      {/* Table */}
      <div className="table-container">
        <table>
          <thead>
            <tr>
              <th>Course</th>
              <th>Category</th>
              <th>Price</th>
              <th>Students</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              [1, 2, 3, 4, 5].map((i) => (
                <tr key={i}>
                  {[1, 2, 3, 4, 5, 6].map((j) => (
                    <td key={j}>
                      <div className="skeleton" style={{ height: 16, width: "80%" }} />
                    </td>
                  ))}
                </tr>
              ))
            ) : courses.length === 0 ? (
              <tr>
                <td colSpan={6}>
                  <div className="empty-state">
                    <div className="empty-state-icon">📚</div>
                    <div className="empty-state-title">No courses found</div>
                    <div className="empty-state-text">
                      Create your first course to get started
                    </div>
                    <Link href="/admin/courses/new">
                      <button className="btn btn-primary">
                        <Plus size={16} /> Add Course
                      </button>
                    </Link>
                  </div>
                </td>
              </tr>
            ) : (
              courses.map((course) => (
                <tr key={course.id}>
                  <td>
                    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                      <div
                        style={{
                          width: 44,
                          height: 44,
                          borderRadius: 8,
                          background: course.thumbnail
                            ? `url(${course.thumbnail}) center/cover`
                            : "var(--primary-50)",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          fontSize: 20,
                          flexShrink: 0,
                        }}
                      >
                        {!course.thumbnail && "📚"}
                      </div>
                      <div>
                        <div style={{ fontWeight: 600, fontSize: 13, maxWidth: 260, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {course.title}
                        </div>
                        <div style={{ fontSize: 12, color: "var(--gray-400)" }}>
                          {course._count.sections} sections • {course.level}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td>
                    <span className="badge badge-blue">{course.category?.name}</span>
                  </td>
                  <td>
                    <span style={{ fontWeight: 700, color: "var(--gray-800)" }}>
                      {parseFloat(String(course.price)) === 0
                        ? <span style={{ color: "var(--success)" }}>Free</span>
                        : formatCurrency(parseFloat(String(course.price)))}
                    </span>
                  </td>
                  <td>
                    <div style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 13 }}>
                      <Users size={14} color="var(--gray-400)" />
                      {course._count.enrollments.toLocaleString()}
                    </div>
                  </td>
                  <td>{getStatusBadge(course.status)}</td>
                  <td>
                    <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                      <Link href={`/admin/courses/${course.id}`}>
                        <button className="btn btn-ghost btn-icon btn-sm" title="Edit">
                          <Edit size={15} />
                        </button>
                      </Link>
                      <button
                        className="btn btn-ghost btn-icon btn-sm"
                        title={course.status === "PUBLISHED" ? "Unpublish" : "Publish"}
                        onClick={() => handleTogglePublish(course.id, course.status)}
                        style={{ color: course.status === "PUBLISHED" ? "var(--success)" : "var(--gray-400)" }}
                      >
                        {course.status === "PUBLISHED" ? <ToggleRight size={18} /> : <ToggleLeft size={18} />}
                      </button>
                      <button
                        className="btn btn-ghost btn-icon btn-sm"
                        title="Delete"
                        onClick={() => handleDelete(course.id, course.title)}
                        style={{ color: "var(--danger)" }}
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {total > limit && (
        <div
          style={{
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            gap: 8,
            marginTop: 20,
          }}
        >
          <button
            className="btn btn-secondary btn-sm"
            disabled={page === 1}
            onClick={() => setPage((p) => p - 1)}
          >
            ← Previous
          </button>
          <span style={{ fontSize: 13, color: "var(--gray-500)" }}>
            Page {page} of {Math.ceil(total / limit)}
          </span>
          <button
            className="btn btn-secondary btn-sm"
            disabled={page >= Math.ceil(total / limit)}
            onClick={() => setPage((p) => p + 1)}
          >
            Next →
          </button>
        </div>
      )}
    </AppLayout>
  );
}
