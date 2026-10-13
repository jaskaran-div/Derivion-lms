"use client";

import { useCallback, useEffect, useState } from "react";
import AppLayout from "@/components/layout/AppLayout";
import { teacherAPI } from "@/lib/api";
import toast from "react-hot-toast";
import { Plus, Pencil, Trash2, Copy, X } from "lucide-react";

interface Student {
  id: string;
  firstName: string;
  lastName: string;
  username: string;
  guardianEmail?: string;
  guardianPhone?: string;
  isActive: boolean;
  lastLogin?: string;
  _count: { enrollments: number };
  enrollments?: { course: { id: string; title: string } }[];
}

interface Course {
  id: string;
  title: string;
}

export default function TeacherStudentsPage() {
  const [students, setStudents] = useState<Student[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Student | null>(null);
  const [credentials, setCredentials] = useState<{ studentId: string; password: string; name: string } | null>(null);
  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    guardianEmail: "",
    guardianPhone: "",
    courseIds: [] as string[],
    isActive: true,
  });
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [s, c] = await Promise.all([
        teacherAPI.listStudents({ search }),
        teacherAPI.listCourses(),
      ]);
      setStudents(s.data.data);
      setCourses(c.data.data);
    } catch {
      toast.error("Failed to load students.");
    } finally {
      setLoading(false);
    }
  }, [search]);

  useEffect(() => { load(); }, [load]);

  const openCreate = () => {
    setEditing(null);
    setForm({ firstName: "", lastName: "", guardianEmail: "", guardianPhone: "", courseIds: [], isActive: true });
    setShowForm(true);
  };

  const openEdit = (s: Student) => {
    setEditing(s);
    setForm({
      firstName: s.firstName,
      lastName: s.lastName,
      guardianEmail: s.guardianEmail || "",
      guardianPhone: s.guardianPhone || "",
      courseIds: [],
      isActive: s.isActive,
    });
    setShowForm(true);
  };

  const save = async () => {
    if (!form.firstName.trim() || !form.lastName.trim()) {
      toast.error("First and last name are required.");
      return;
    }
    if (!editing && !form.guardianEmail.trim() && !form.guardianPhone.trim()) {
      toast.error("Add guardian email or contact number.");
      return;
    }
    setSaving(true);
    try {
      if (editing) {
        await teacherAPI.updateStudent(editing.id, {
          firstName: form.firstName,
          lastName: form.lastName,
          guardianEmail: form.guardianEmail || null,
          guardianPhone: form.guardianPhone || null,
          isActive: form.isActive,
        });
        toast.success("Student updated.");
      } else {
        const res = await teacherAPI.createStudent({
          firstName: form.firstName,
          lastName: form.lastName,
          guardianEmail: form.guardianEmail || undefined,
          guardianPhone: form.guardianPhone || undefined,
          courseIds: form.courseIds,
        });
        const creds = res.data.data.credentials;
        setCredentials({
          studentId: creds.studentId,
          password: creds.password,
          name: `${form.firstName} ${form.lastName}`,
        });
        toast.success("Student created. Copy the password now — it cannot be shown again.");
      }
      setShowForm(false);
      load();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || "Save failed.");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (s: Student) => {
    if (!confirm(`Delete ${s.firstName} ${s.lastName}? They will no longer be able to log in.`)) return;
    try {
      await teacherAPI.deleteStudent(s.id);
      toast.success("Student deleted.");
      load();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || "Delete failed.");
    }
  };

  const copyText = async (value: string, label: string) => {
    await navigator.clipboard.writeText(value);
    toast.success(`${label} copied`);
  };

  return (
    <AppLayout requiredRole="TEACHER">
      <div className="page-header">
        <div>
          <h1 className="page-title">Students</h1>
          <p className="page-subtitle">Create login IDs from guardian email or phone. Passwords are shown only once.</p>
        </div>
        <button className="btn btn-primary" onClick={openCreate}><Plus size={16} /> Add student</button>
      </div>

      <div className="card" style={{ padding: "16px 20px", marginBottom: 20 }}>
        <input
          className="form-control"
          placeholder="Search by name, student ID, or guardian contact"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <div className="table-container">
        <table>
          <thead>
            <tr>
              <th>Student</th>
              <th>Student ID</th>
              <th>Guardian</th>
              <th>Courses</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6}>Loading…</td></tr>
            ) : students.length === 0 ? (
              <tr>
                <td colSpan={6}>
                  <div className="empty-state">
                    <div className="empty-state-title">No students yet</div>
                  </div>
                </td>
              </tr>
            ) : (
              students.map((s) => (
                <tr key={s.id}>
                  <td>
                    <div style={{ fontWeight: 600 }}>{s.firstName} {s.lastName}</div>
                    <div style={{ fontSize: 12, color: "var(--gray-400)" }}>
                      Last login: {s.lastLogin ? new Date(s.lastLogin).toLocaleDateString("en-IN") : "Never"}
                    </div>
                  </td>
                  <td><code>{s.username}</code></td>
                  <td>
                    <div>{s.guardianEmail || "—"}</div>
                    <div style={{ fontSize: 12, color: "var(--gray-400)" }}>{s.guardianPhone || ""}</div>
                  </td>
                  <td>{s._count?.enrollments ?? 0}</td>
                  <td>
                    <span className={`badge ${s.isActive ? "badge-success" : "badge-danger"}`}>
                      {s.isActive ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td>
                    <button className="btn btn-ghost btn-icon" onClick={() => openEdit(s)} title="Edit">
                      <Pencil size={14} />
                    </button>
                    <button className="btn btn-ghost btn-icon" onClick={() => remove(s)} title="Delete">
                      <Trash2 size={14} color="var(--danger)" />
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {showForm && (
        <div className="modal-overlay" onClick={() => setShowForm(false)}>
          <div className="card" style={{ width: 520, maxWidth: "92vw" }} onClick={(e) => e.stopPropagation()}>
            <div className="card-header">
              <span className="card-title">{editing ? "Edit student" : "Add student"}</span>
              <button className="btn btn-ghost btn-icon" onClick={() => setShowForm(false)}><X size={16} /></button>
            </div>
            <div className="card-body">
              <div className="grid-2">
                <div className="form-group">
                  <label className="form-label required">First name</label>
                  <input className="form-control" value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} />
                </div>
                <div className="form-group">
                  <label className="form-label required">Last name</label>
                  <input className="form-control" value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} />
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Guardian email</label>
                <input className="form-control" value={form.guardianEmail} onChange={(e) => setForm({ ...form, guardianEmail: e.target.value })} />
              </div>
              <div className="form-group">
                <label className="form-label">Guardian contact</label>
                <input className="form-control" value={form.guardianPhone} onChange={(e) => setForm({ ...form, guardianPhone: e.target.value })} />
              </div>
              {!editing && (
                <div className="form-group">
                  <label className="form-label">Enroll in courses</label>
                  <select
                    className="form-control"
                    multiple
                    value={form.courseIds}
                    onChange={(e) =>
                      setForm({ ...form, courseIds: Array.from(e.target.selectedOptions).map((o) => o.value) })
                    }
                    style={{ minHeight: 90 }}
                  >
                    {courses.map((c) => (
                      <option key={c.id} value={c.id}>{c.title}</option>
                    ))}
                  </select>
                  <div className="form-hint">Hold Ctrl/Cmd to select multiple courses.</div>
                </div>
              )}
              {editing && (
                <label style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 16 }}>
                  <input type="checkbox" checked={form.isActive} onChange={(e) => setForm({ ...form, isActive: e.target.checked })} />
                  Active account
                </label>
              )}
              <div className="alert alert-info" style={{ fontSize: 12 }}>
                {editing
                  ? "Passwords cannot be changed here. Use Support Chat to ask admin for a reset."
                  : "A Student ID and password will be generated. Copy the password immediately — it is shown only once."}
              </div>
              <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
                <button className="btn btn-secondary" onClick={() => setShowForm(false)}>Cancel</button>
                <button className="btn btn-primary" onClick={save} disabled={saving}>{saving ? "Saving…" : "Save"}</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {credentials && (
        <div className="modal-overlay" onClick={() => setCredentials(null)}>
          <div className="card" style={{ width: 440, maxWidth: "92vw" }} onClick={(e) => e.stopPropagation()}>
            <div className="card-header">
              <span className="card-title">One-time credentials</span>
            </div>
            <div className="card-body">
              <p style={{ fontSize: 14, marginBottom: 12 }}>
                Share these with <strong>{credentials.name}</strong> / their guardian. This password will not be shown again.
              </p>
              <div className="form-group">
                <label className="form-label">Student ID</label>
                <div style={{ display: "flex", gap: 8 }}>
                  <input className="form-control" readOnly value={credentials.studentId} />
                  <button className="btn btn-secondary" onClick={() => copyText(credentials.studentId, "Student ID")}><Copy size={14} /></button>
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Password</label>
                <div style={{ display: "flex", gap: 8 }}>
                  <input className="form-control" readOnly value={credentials.password} />
                  <button className="btn btn-secondary" onClick={() => copyText(credentials.password, "Password")}><Copy size={14} /></button>
                </div>
              </div>
              <button className="btn btn-primary w-full" onClick={() => setCredentials(null)}>I have saved these</button>
            </div>
          </div>
        </div>
      )}

      <style jsx>{`
        .modal-overlay {
          position: fixed;
          inset: 0;
          background: rgba(0,0,0,0.45);
          z-index: 300;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 16px;
        }
      `}</style>
    </AppLayout>
  );
}
