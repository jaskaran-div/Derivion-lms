"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import AppLayout from "@/components/layout/AppLayout";
import { usersAPI, apiErrorMessage, displayLogin } from "@/lib/api";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import toast from "react-hot-toast";
import { ArrowLeft } from "lucide-react";

const schema = z.object({
  firstName: z.string().min(2, "First name required"),
  lastName: z.string().min(2, "Last name required"),
  phone: z.string().optional(),
  role: z.enum(["STUDENT", "ADMIN", "TEACHER"]),
  isActive: z.boolean(),
});

type FormData = z.infer<typeof schema>;

interface UserDetail {
  id: string;
  email: string;
  username?: string;
  firstName: string;
  lastName: string;
  phone?: string;
  role: "STUDENT" | "ADMIN" | "TEACHER";
  isActive: boolean;
  createdAt: string;
  lastLogin?: string;
  guardianEmail?: string;
  guardianPhone?: string;
  enrollments: { id: string; status: string; enrolledAt: string; progressPercent: string | number; course: { title: string } }[];
  payments: { id: string; amount: string | number; currency: string; status: string; createdAt: string; course?: { title: string } | null }[];
  certificates: { id: string; certificateNo: string; issuedAt: string; course: { title: string } }[];
}

const formatDate = (dateStr?: string) =>
  dateStr ? new Date(dateStr).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "Never";

export default function EditUserPage() {
  const router = useRouter();
  const { id } = useParams<{ id: string }>();
  const [user, setUser] = useState<UserDetail | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [saving, setSaving] = useState(false);

  const { register, handleSubmit, reset, formState: { errors, isDirty } } = useForm<FormData>({
    resolver: zodResolver(schema),
  });

  useEffect(() => {
    usersAPI.getById(id)
      .then((res) => {
        const u: UserDetail = res.data.data;
        setUser(u);
        reset({ firstName: u.firstName, lastName: u.lastName, phone: u.phone || "", role: u.role, isActive: u.isActive });
      })
      .catch((err) => {
        if (err?.response?.status === 404) setNotFound(true);
        else toast.error(apiErrorMessage(err, "Failed to load user."));
      });
  }, [id, reset]);

  const onSubmit = async (data: FormData) => {
    setSaving(true);
    try {
      await usersAPI.update(id, data);
      toast.success("User updated.");
      reset(data);
    } catch (err) {
      toast.error(apiErrorMessage(err, "Failed to update user."));
    } finally {
      setSaving(false);
    }
  };

  return (
    <AppLayout requiredRole="ADMIN">
      <div className="page-header">
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <button className="btn btn-ghost btn-icon" onClick={() => router.push("/admin/users")}>
            <ArrowLeft size={20} />
          </button>
          <div>
            <h1 className="page-title">{user ? `${user.firstName} ${user.lastName}` : "User"}</h1>
            <p className="page-subtitle">
              {user ? `${displayLogin(user)} · Joined ${formatDate(user.createdAt)} · Last login ${formatDate(user.lastLogin)}` : "View and edit account details"}
            </p>
          </div>
        </div>
      </div>

      {notFound ? (
        <div className="card">
          <div className="empty-state">
            <div className="empty-state-icon">👤</div>
            <div className="empty-state-title">User not found</div>
            <div className="empty-state-text">This account may have been deleted.</div>
          </div>
        </div>
      ) : !user ? (
        <div className="card"><div className="card-body"><div className="skeleton" style={{ height: 200 }} /></div></div>
      ) : (
        <div style={{ display: "grid", gap: 20, maxWidth: 900 }}>
          <div className="card">
            <div className="card-header">
              <span className="card-title">User Details</span>
            </div>
            <div className="card-body">
              <form onSubmit={handleSubmit(onSubmit)}>
                <div className="grid-2">
                  <div className="form-group">
                    <label className="form-label required">First Name</label>
                    <input {...register("firstName")} className={`form-control ${errors.firstName ? "error" : ""}`} />
                    {errors.firstName && <div className="form-error">{errors.firstName.message}</div>}
                  </div>
                  <div className="form-group">
                    <label className="form-label required">Last Name</label>
                    <input {...register("lastName")} className={`form-control ${errors.lastName ? "error" : ""}`} />
                    {errors.lastName && <div className="form-error">{errors.lastName.message}</div>}
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label">Email / Login</label>
                  <input className="form-control" value={displayLogin(user)} disabled />
                </div>

                <div className="form-group">
                  <label className="form-label">Phone Number</label>
                  <input {...register("phone")} type="tel" className="form-control" placeholder="+91 99999 99999" />
                </div>

                {(user.guardianEmail || user.guardianPhone) && (
                  <div className="form-group">
                    <label className="form-label">Guardian</label>
                    <input className="form-control" value={[user.guardianEmail, user.guardianPhone].filter(Boolean).join(" · ")} disabled />
                  </div>
                )}

                <div className="grid-2">
                  <div className="form-group">
                    <label className="form-label required">Role</label>
                    <select {...register("role")} className="form-control">
                      <option value="STUDENT">Student</option>
                      <option value="TEACHER">Teacher</option>
                      <option value="ADMIN">Admin</option>
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Status</label>
                    <label style={{ display: "flex", alignItems: "center", gap: 8, paddingTop: 10, fontSize: 14 }}>
                      <input type="checkbox" {...register("isActive")} /> Account active
                    </label>
                  </div>
                </div>

                <div style={{ display: "flex", gap: 12, justifyContent: "flex-end" }}>
                  <button type="button" className="btn btn-secondary" onClick={() => router.push("/admin/users")}>
                    Back
                  </button>
                  <button type="submit" className="btn btn-primary" disabled={saving || !isDirty}>
                    {saving ? "Saving..." : "Save Changes"}
                  </button>
                </div>
              </form>
            </div>
          </div>

          <div className="card">
            <div className="card-header">
              <span className="card-title">Enrollments ({user.enrollments.length})</span>
            </div>
            <div className="table-container flush">
              <table>
                <thead>
                  <tr><th>Course</th><th>Progress</th><th>Status</th><th>Enrolled</th></tr>
                </thead>
                <tbody>
                  {user.enrollments.length === 0 ? (
                    <tr><td colSpan={4} style={{ color: "var(--gray-400)", fontSize: 13 }}>Not enrolled in any courses.</td></tr>
                  ) : user.enrollments.map((e) => (
                    <tr key={e.id}>
                      <td>{e.course.title}</td>
                      <td>{Math.round(Number(e.progressPercent))}%</td>
                      <td><span className="badge badge-gray">{e.status}</span></td>
                      <td>{formatDate(e.enrolledAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="grid-2">
            <div className="card">
              <div className="card-header">
                <span className="card-title">Certificates ({user.certificates.length})</span>
              </div>
              <div className="card-body">
                {user.certificates.length === 0 ? (
                  <div style={{ color: "var(--gray-400)", fontSize: 13 }}>No certificates yet.</div>
                ) : user.certificates.map((c) => (
                  <div key={c.id} style={{ fontSize: 13, padding: "6px 0" }}>
                    <div style={{ fontWeight: 600 }}>{c.course.title}</div>
                    <div style={{ color: "var(--gray-400)" }}>{c.certificateNo} · {formatDate(c.issuedAt)}</div>
                  </div>
                ))}
              </div>
            </div>
            <div className="card">
              <div className="card-header">
                <span className="card-title">Recent Payments</span>
              </div>
              <div className="card-body">
                {user.payments.length === 0 ? (
                  <div style={{ color: "var(--gray-400)", fontSize: 13 }}>No payments.</div>
                ) : user.payments.map((p) => (
                  <div key={p.id} style={{ fontSize: 13, padding: "6px 0" }}>
                    <div style={{ fontWeight: 600 }}>{p.course?.title ?? "Deleted course"}</div>
                    <div style={{ color: "var(--gray-400)" }}>{p.currency} {Number(p.amount).toFixed(2)} · {p.status} · {formatDate(p.createdAt)}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  );
}
