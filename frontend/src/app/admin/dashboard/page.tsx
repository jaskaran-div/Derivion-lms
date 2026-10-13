"use client";

import { useEffect, useState } from "react";
import AppLayout from "@/components/layout/AppLayout";
import { usersAPI } from "@/lib/api";
import {
  Users,
  BookOpen,
  CreditCard,
  TrendingUp,
  ArrowUpRight,
  ArrowDownRight,
  Eye,
  CheckCircle,
  Clock,
  Star,
} from "lucide-react";
import Link from "next/link";

interface DashboardData {
  stats: {
    totalUsers: number;
    totalCourses: number;
    totalEnrollments: number;
    totalRevenue: number;
  };
  recentUsers: any[];
  recentEnrollments: any[];
  popularCourses: any[];
  revenueByMonth: any[];
}

export default function AdminDashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadDashboard();
  }, []);

  const loadDashboard = async () => {
    try {
      const res = await usersAPI.getDashboard();
      setData(res.data.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
      maximumFractionDigits: 0,
    }).format(amount);

  const formatDate = (dateStr: string) =>
    new Date(dateStr).toLocaleDateString("en-IN", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });

  if (loading) {
    return (
      <AppLayout requiredRole="ADMIN">
        <div className="stats-grid">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="stat-card" style={{ height: 120 }}>
              <div className="skeleton" style={{ height: 20, width: "60%", marginBottom: 12 }} />
              <div className="skeleton" style={{ height: 36, width: "40%" }} />
            </div>
          ))}
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout requiredRole="ADMIN">
      {/* Stats */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Admin Dashboard</h1>
          <p className="page-subtitle">
            Welcome back! Here&apos;s what&apos;s happening with your LMS today.
          </p>
        </div>
        <div className="page-actions">
          <Link href="/admin/courses/new">
            <button className="btn btn-primary">+ Add Course</button>
          </Link>
        </div>
      </div>

      <div className="stats-grid">
        <div className="stat-card blue">
          <div className="stat-icon blue">
            <Users size={22} />
          </div>
          <div className="stat-value">
            {data?.stats.totalUsers.toLocaleString() || 0}
          </div>
          <div className="stat-label">Total Students</div>
          <div className="stat-change up">
            <ArrowUpRight size={14} /> 12% this month
          </div>
        </div>

        <div className="stat-card green">
          <div className="stat-icon green">
            <BookOpen size={22} />
          </div>
          <div className="stat-value">{data?.stats.totalCourses || 0}</div>
          <div className="stat-label">Published Courses</div>
          <div className="stat-change up">
            <ArrowUpRight size={14} /> 3 new this week
          </div>
        </div>

        <div className="stat-card yellow">
          <div className="stat-icon yellow">
            <TrendingUp size={22} />
          </div>
          <div className="stat-value">
            {data?.stats.totalEnrollments.toLocaleString() || 0}
          </div>
          <div className="stat-label">Total Enrollments</div>
          <div className="stat-change up">
            <ArrowUpRight size={14} /> 8% this month
          </div>
        </div>

        <div className="stat-card purple">
          <div className="stat-icon purple">
            <CreditCard size={22} />
          </div>
          <div className="stat-value">
            {formatCurrency(data?.stats.totalRevenue || 0)}
          </div>
          <div className="stat-label">Total Revenue</div>
          <div className="stat-change up">
            <ArrowUpRight size={14} /> 15% this month
          </div>
        </div>
      </div>

      {/* Content grid */}
      <div className="grid-2">
        {/* Recent Users */}
        <div className="card">
          <div className="card-header">
            <span className="card-title">Recent Registrations</span>
            <Link href="/admin/users">
              <button className="btn btn-ghost btn-sm" style={{ color: "var(--primary)" }}>
                View all →
              </button>
            </Link>
          </div>
          <div>
            {data?.recentUsers.length === 0 ? (
              <div className="empty-state" style={{ padding: "32px 24px" }}>
                <div className="empty-state-icon">👤</div>
                <p className="empty-state-title">No users yet</p>
              </div>
            ) : (
              <table style={{ width: "100%" }}>
                <tbody>
                  {data?.recentUsers.map((user) => (
                    <tr key={user.id}>
                      <td>
                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                          <div className="avatar avatar-sm">
                            {user.firstName[0]}{user.lastName[0]}
                          </div>
                          <div>
                            <div style={{ fontWeight: 600, fontSize: 13 }}>
                              {user.firstName} {user.lastName}
                            </div>
                            <div style={{ fontSize: 12, color: "var(--gray-400)" }}>
                              {user.email}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td style={{ textAlign: "right" }}>
                        <div style={{ fontSize: 12, color: "var(--gray-400)" }}>
                          {formatDate(user.createdAt)}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* Popular Courses */}
        <div className="card">
          <div className="card-header">
            <span className="card-title">Popular Courses</span>
            <Link href="/admin/courses">
              <button className="btn btn-ghost btn-sm" style={{ color: "var(--primary)" }}>
                View all →
              </button>
            </Link>
          </div>
          <div>
            {data?.popularCourses.map((course, i) => (
              <div
                key={course.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  padding: "12px 24px",
                  borderBottom:
                    i < (data?.popularCourses.length || 0) - 1
                      ? "1px solid var(--gray-100)"
                      : "none",
                }}
              >
                <div
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: 8,
                    background: "var(--primary-50)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 14,
                    fontWeight: 700,
                    color: "var(--primary)",
                    flexShrink: 0,
                  }}
                >
                  #{i + 1}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      fontSize: 13,
                      fontWeight: 600,
                      color: "var(--gray-800)",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {course.title}
                  </div>
                  <div style={{ fontSize: 12, color: "var(--gray-400)" }}>
                    {course.totalStudents} students •{" "}
                    {new Intl.NumberFormat("en-IN", {
                      style: "currency",
                      currency: "INR",
                      maximumFractionDigits: 0,
                    }).format(course.price)}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Recent Enrollments */}
        <div className="card" style={{ gridColumn: "1 / -1" }}>
          <div className="card-header">
            <span className="card-title">Recent Enrollments</span>
          </div>
          <div className="table-container" style={{ border: "none", borderRadius: 0, boxShadow: "none" }}>
            <table>
              <thead>
                <tr>
                  <th>Student</th>
                  <th>Course</th>
                  <th>Enrolled On</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {data?.recentEnrollments.map((enrollment) => (
                  <tr key={enrollment.id}>
                    <td>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <div className="avatar avatar-sm">
                          {enrollment.user.firstName[0]}{enrollment.user.lastName[0]}
                        </div>
                        <div>
                          <div style={{ fontWeight: 600, fontSize: 13 }}>
                            {enrollment.user.firstName} {enrollment.user.lastName}
                          </div>
                          <div style={{ fontSize: 12, color: "var(--gray-400)" }}>
                            {enrollment.user.email}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td>
                      <div style={{ fontSize: 13, fontWeight: 500 }}>
                        {enrollment.course.title}
                      </div>
                    </td>
                    <td>
                      <div style={{ fontSize: 13, color: "var(--gray-500)" }}>
                        {formatDate(enrollment.enrolledAt)}
                      </div>
                    </td>
                    <td>
                      <span
                        className={`badge ${
                          enrollment.status === "ACTIVE"
                            ? "badge-success"
                            : enrollment.status === "COMPLETED"
                            ? "badge-primary"
                            : "badge-gray"
                        }`}
                      >
                        {enrollment.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
