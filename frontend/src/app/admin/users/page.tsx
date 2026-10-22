"use client";

import { useEffect, useState, useCallback } from "react";
import AppLayout from "@/components/layout/AppLayout";
import { usersAPI } from "@/lib/api";
import Link from "next/link";
import toast from "react-hot-toast";
import { Plus, Search, Edit, Trash2, UserCheck, UserX, Shield, User, MoreVertical } from "lucide-react";

interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  phone?: string;
  role: string;
  isActive: boolean;
  createdAt: string;
  lastLogin?: string;
  _count: { enrollments: number; certificates: number };
}

export default function AdminUsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [role, setRole] = useState("");
  const [isActive, setIsActive] = useState("");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const limit = 20;

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    try {
      const params: any = { page, limit };
      if (search) params.search = search;
      if (role) params.role = role;
      if (isActive !== "") params.isActive = isActive;
      const res = await usersAPI.getAll(params);
      setUsers(res.data.data.users);
      setTotal(res.data.data.pagination.total);
    } catch {
      toast.error("Failed to load users.");
    } finally {
      setLoading(false);
    }
  }, [page, search, role, isActive]);

  useEffect(() => { fetchUsers(); }, [fetchUsers]);

  // Summary strip: totals per role/status from the same users endpoint
  const [counts, setCounts] = useState<{ students: number; teachers: number; inactive: number } | null>(null);
  useEffect(() => {
    const totalOf = (params: object) => usersAPI.getAll({ ...params, limit: 1 }).then((r) => r.data.data.pagination.total as number);
    Promise.all([totalOf({ role: "STUDENT" }), totalOf({ role: "TEACHER" }), totalOf({ isActive: "false" })])
      .then(([students, teachers, inactive]) => setCounts({ students, teachers, inactive }))
      .catch(() => {});
  }, []);

  const timeAgo = (dateStr?: string) => {
    if (!dateStr) return "Never";
    const mins = Math.floor((Date.now() - new Date(dateStr).getTime()) / 60000);
    if (mins < 1) return "Just now";
    if (mins < 60) return `${mins} minute${mins > 1 ? "s" : ""} ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    if (days === 1) return "Yesterday";
    if (days < 30) return `${days} days ago`;
    return formatDate(dateStr);
  };

  const handleToggleActive = async (id: string, currentStatus: boolean) => {
    try {
      await usersAPI.update(id, { isActive: !currentStatus });
      toast.success(`User ${currentStatus ? "deactivated" : "activated"}.`);
      fetchUsers();
    } catch {
      toast.error("Failed to update user.");
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Delete user "${name}"? This cannot be undone.`)) return;
    try {
      await usersAPI.delete(id);
      toast.success("User deleted.");
      fetchUsers();
    } catch (err: any) {
      toast.error(err.response?.data?.message || "Failed to delete user.");
    }
  };

  function formatDate(dateStr?: string) {
    if (!dateStr) return "Never";
    return new Date(dateStr).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
  }

  return (
    <AppLayout requiredRole="ADMIN">
      <div className="panel">
      <div className="panel-head">
        <div>
          <h1 className="page-title" style={{ fontSize: 26 }}>Users</h1>
          <p className="page-subtitle">Manage students, teachers and admins, and monitor their activity.</p>
        </div>
        <div className="page-actions">
          <Link href="/admin/users/new">
            <button className="btn btn-primary">
              <Plus size={16} /> Add User
            </button>
          </Link>
        </div>
      </div>

      <div className="panel-stats">
        {[
          [total, (role || isActive || search) ? "Matching Users" : "Users"],
          [counts?.students ?? "—", "Students"],
          [counts?.teachers ?? "—", "Teachers"],
          [counts?.inactive ?? "—", "Inactive"],
        ].map(([value, label]) => (
          <div key={String(label)}>
            <div className="panel-stat-value">{value}</div>
            <div className="panel-stat-label">{label}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="panel-filters">
          <div className="search-bar" style={{ flex: 1, minWidth: 220, maxWidth: 360, padding: "9px 16px" }}>
            <Search size={16} color="var(--gray-400)" />
            <input
              placeholder="Search by name or email..."
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            />
          </div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <select className="form-control pill" value={role} onChange={(e) => { setRole(e.target.value); setPage(1); }}>
            <option value="">All Roles</option>
            <option value="STUDENT">Student</option>
            <option value="TEACHER">Teacher</option>
            <option value="ADMIN">Admin</option>
          </select>
          <select className="form-control pill" value={isActive} onChange={(e) => { setIsActive(e.target.value); setPage(1); }}>
            <option value="">All Status</option>
            <option value="true">Active</option>
            <option value="false">Inactive</option>
          </select>
          </div>
      </div>

      {/* Table */}
      <div className="table-container flush">
        <table>
          <thead>
            <tr>
              <th>User</th>
              <th>Role</th>
              <th>Courses</th>
              <th>Joined</th>
              <th>Last Login</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              [1,2,3,4,5].map((i) => (
                <tr key={i}>
                  {[1,2,3,4,5,6,7].map((j) => (
                    <td key={j}><div className="skeleton" style={{ height: 16, width: "80%" }} /></td>
                  ))}
                </tr>
              ))
            ) : users.length === 0 ? (
              <tr>
                <td colSpan={7}>
                  <div className="empty-state">
                    <div className="empty-state-icon">👤</div>
                    <div className="empty-state-title">No users found</div>
                    <div className="empty-state-text">Try adjusting your search filters</div>
                  </div>
                </td>
              </tr>
            ) : (
              users.map((user) => (
                <tr key={user.id}>
                  <td>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <div className="avatar">
                        {user.firstName[0]}{user.lastName[0]}
                      </div>
                      <div>
                        <div style={{ fontWeight: 600, fontSize: 14, color: "var(--gray-900)" }}>
                          {user.firstName} {user.lastName}
                        </div>
                        <div style={{ fontSize: 12, color: "var(--gray-400)" }}>{user.email}</div>
                        {user.phone && (
                          <div style={{ fontSize: 11, color: "var(--gray-400)" }}>{user.phone}</div>
                        )}
                      </div>
                    </div>
                  </td>
                  <td>
                    <span className={`badge ${user.role === "ADMIN" ? "badge-primary" : user.role === "TEACHER" ? "badge-success" : "badge-gray"}`}>
                      {user.role === "ADMIN" ? <><Shield size={10} /> Admin</> : user.role === "TEACHER" ? "Teacher" : <><User size={10} /> Student</>}
                    </span>
                  </td>
                  <td>
                    <div style={{ fontSize: 13 }}>
                      {user._count.enrollments} enrolled
                      <div style={{ fontSize: 11, color: "var(--gray-400)" }}>
                        {user._count.certificates} certificates
                      </div>
                    </div>
                  </td>
                  <td>
                    <div style={{ fontSize: 13, color: "var(--gray-500)" }}>
                      {formatDate(user.createdAt)}
                    </div>
                  </td>
                  <td>
                    <div style={{ fontSize: 13, color: "var(--gray-500)" }}>
                      {timeAgo(user.lastLogin)}
                    </div>
                  </td>
                  <td>
                    <span className={`badge badge-dot ${user.isActive ? "badge-success" : "badge-danger"}`}>
                      {user.isActive ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td>
                    <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                      <Link href={`/admin/users/${user.id}`}>
                        <button className="btn btn-ghost btn-icon btn-sm" title="View/Edit">
                          <Edit size={15} />
                        </button>
                      </Link>
                      <button
                        className="btn btn-ghost btn-icon btn-sm"
                        title={user.isActive ? "Deactivate" : "Activate"}
                        onClick={() => handleToggleActive(user.id, user.isActive)}
                      >
                        {user.isActive
                          ? <UserX size={15} color="var(--danger)" />
                          : <UserCheck size={15} color="var(--success)" />
                        }
                      </button>
                      <button
                        className="btn btn-ghost btn-icon btn-sm"
                        title="Delete"
                        onClick={() => handleDelete(user.id, `${user.firstName} ${user.lastName}`)}
                      >
                        <Trash2 size={15} color="var(--danger)" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      </div>

      {/* Pagination */}
      {total > limit && (
        <div style={{ display: "flex", justifyContent: "center", gap: 8, marginTop: 20 }}>
          <button className="btn btn-secondary btn-sm" disabled={page === 1} onClick={() => setPage(p => p - 1)}>← Prev</button>
          <span style={{ fontSize: 13, color: "var(--gray-500)", padding: "7px 0" }}>
            Page {page} of {Math.ceil(total / limit)}
          </span>
          <button className="btn btn-secondary btn-sm" disabled={page >= Math.ceil(total / limit)} onClick={() => setPage(p => p + 1)}>Next →</button>
        </div>
      )}
    </AppLayout>
  );
}
