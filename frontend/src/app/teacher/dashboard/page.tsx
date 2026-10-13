"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import AppLayout from "@/components/layout/AppLayout";
import { teacherAPI } from "@/lib/api";
import { useAuthStore } from "@/store/authStore";
import { GraduationCap, UserCheck, Plus } from "lucide-react";

export default function TeacherDashboardPage() {
  const { user } = useAuthStore();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    teacherAPI.dashboard().then((res) => setData(res.data.data)).finally(() => setLoading(false));
  }, []);

  return (
    <AppLayout requiredRole="TEACHER">
      <div className="page-header">
        <div>
          <h1 className="page-title">Welcome, {user?.firstName}</h1>
          <p className="page-subtitle">Manage school students and issue one-time login credentials.</p>
        </div>
        <Link href="/teacher/students">
          <button className="btn btn-primary"><Plus size={16} /> Add student</button>
        </Link>
      </div>

      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-icon" style={{ background: "var(--primary-50)", color: "var(--primary)" }}>
            <GraduationCap size={20} />
          </div>
          <div className="stat-value">{loading ? "—" : data?.stats?.totalStudents ?? 0}</div>
          <div className="stat-label">Total students</div>
        </div>
        <div className="stat-card">
          <div className="stat-icon" style={{ background: "#ecfdf5", color: "#059669" }}>
            <UserCheck size={20} />
          </div>
          <div className="stat-value">{loading ? "—" : data?.stats?.activeStudents ?? 0}</div>
          <div className="stat-label">Active students</div>
        </div>
      </div>

      <div className="card" style={{ marginTop: 20 }}>
        <div className="card-header">
          <span className="card-title">Recently added</span>
        </div>
        <div className="card-body">
          {!data?.recentStudents?.length ? (
            <div className="empty-state">
              <div className="empty-state-title">No students yet</div>
              <div className="empty-state-text">Create student IDs using guardian email or phone.</div>
            </div>
          ) : (
            <div className="table-container" style={{ boxShadow: "none", border: 0 }}>
              <table>
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Student ID</th>
                    <th>Guardian</th>
                    <th>Courses</th>
                  </tr>
                </thead>
                <tbody>
                  {data.recentStudents.map((s: any) => (
                    <tr key={s.id}>
                      <td>{s.firstName} {s.lastName}</td>
                      <td><code>{s.username}</code></td>
                      <td>{s.guardianEmail || s.guardianPhone || "—"}</td>
                      <td>{s._count?.enrollments ?? 0}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  );
}
