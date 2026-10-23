"use client";

import { useState, useEffect } from "react";
import AppLayout from "@/components/layout/AppLayout";
import { useAuthStore } from "@/store/authStore";
import { authAPI, usersAPI, apiErrorMessage } from "@/lib/api";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import toast from "react-hot-toast";
import { User, Lock, Bell, Camera, CreditCard } from "lucide-react";

const profileSchema = z.object({
  firstName: z.string().min(2),
  lastName: z.string().min(2),
  phone: z.string().optional(),
});

const passwordSchema = z.object({
  currentPassword: z.string().min(1, "Current password required"),
  newPassword: z.string().min(8, "Min 8 characters"),
  confirmPassword: z.string(),
}).refine(d => d.newPassword === d.confirmPassword, {
  message: "Passwords don't match",
  path: ["confirmPassword"],
});

type ProfileForm = z.infer<typeof profileSchema>;
type PasswordForm = z.infer<typeof passwordSchema>;

export default function SettingsPage() {
  const { user, setUser } = useAuthStore();
  const [activeTab, setActiveTab] = useState("profile");
  const [loadingProfile, setLoadingProfile] = useState(false);
  const [loadingPassword, setLoadingPassword] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [payments, setPayments] = useState<{ id: string; amount: string | number; status: string; createdAt: string; course: { title: string } | null }[]>([]);

  const { register: regProfile, handleSubmit: submitProfile, formState: { errors: errProfile } } = useForm<ProfileForm>({
    resolver: zodResolver(profileSchema),
    defaultValues: { firstName: user?.firstName || "", lastName: user?.lastName || "" },
  });

  const { register: regPwd, handleSubmit: submitPwd, formState: { errors: errPwd }, reset: resetPwd } = useForm<PasswordForm>({
    resolver: zodResolver(passwordSchema),
  });

  useEffect(() => {
    if (activeTab === "payments") {
      usersAPI.getPaymentHistory().then(res => setPayments(res.data.data));
    }
  }, [activeTab]);

  const onProfileSubmit = async (data: ProfileForm) => {
    setLoadingProfile(true);
    try {
      const res = await authAPI.updateProfile(data);
      setUser({ ...user!, ...res.data.data });
      toast.success("Profile updated!");
    } catch {
      toast.error("Failed to update profile.");
    } finally {
      setLoadingProfile(false);
    }
  };

  const onPasswordSubmit = async (data: PasswordForm) => {
    setLoadingPassword(true);
    try {
      const res = await authAPI.changePassword({ currentPassword: data.currentPassword, newPassword: data.newPassword });
      if (res.data.data?.accessToken) useAuthStore.getState().setTokens(res.data.data.accessToken);
      toast.success("Password changed. Other devices have been signed out.");
      resetPwd();
    } catch (err) {
      toast.error(apiErrorMessage(err, "Failed to change password."));
    } finally {
      setLoadingPassword(false);
    }
  };

  const handleAvatarUpload = async (file: File) => {
    setUploadingAvatar(true);
    try {
      const res = await usersAPI.uploadAvatar(file);
      setUser({ ...user!, avatar: res.data.data.avatar });
      toast.success("Avatar updated!");
    } catch {
      toast.error("Failed to upload avatar.");
    } finally {
      setUploadingAvatar(false);
    }
  };

  const getInitials = () => user ? `${user.firstName[0]}${user.lastName[0]}`.toUpperCase() : "U";

  const formatDate = (dateStr: string) =>
    new Date(dateStr).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });

  return (
    <AppLayout>
      <div className="page-header">
        <div>
          <h1 className="page-title">Settings</h1>
          <p className="page-subtitle">Manage your account preferences</p>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "220px 1fr", gap: 24, alignItems: "start" }}>
        {/* Left nav */}
        <div className="card" style={{ padding: "12px 8px" }}>
          {[
            { key: "profile", label: "Profile", icon: <User size={16} /> },
            { key: "security", label: "Security", icon: <Lock size={16} /> },
            { key: "payments", label: "Payment History", icon: <CreditCard size={16} /> },
            { key: "notifications", label: "Notifications", icon: <Bell size={16} /> },
          ].map(tab => (
            <div
              key={tab.key}
              className={`sidebar-nav-item ${activeTab === tab.key ? "active" : ""}`}
              onClick={() => setActiveTab(tab.key)}
            >
              <span className="sidebar-nav-icon">{tab.icon}</span>
              {tab.label}
            </div>
          ))}
        </div>

        {/* Right content */}
        <div>
          {activeTab === "profile" && (
            <div className="card">
              <div className="card-header"><span className="card-title">Profile Information</span></div>
              <div className="card-body">
                {/* Avatar */}
                <div style={{ display: "flex", alignItems: "center", gap: 20, marginBottom: 28, paddingBottom: 24, borderBottom: "1px solid var(--border-color)" }}>
                  <div style={{ position: "relative" }}>
                    {user?.avatar ? (
                      <img src={user.avatar} alt="Avatar" className="avatar avatar-lg" />
                    ) : (
                      <div className="avatar avatar-lg">{getInitials()}</div>
                    )}
                    <label
                      style={{
                        position: "absolute",
                        bottom: -4,
                        right: -4,
                        width: 26,
                        height: 26,
                        borderRadius: "50%",
                        background: "var(--primary)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        cursor: "pointer",
                        border: "2px solid white",
                      }}
                    >
                      <Camera size={12} color="white" />
                      <input
                        type="file"
                        accept="image/*"
                        style={{ display: "none" }}
                        onChange={e => e.target.files?.[0] && handleAvatarUpload(e.target.files[0])}
                      />
                    </label>
                  </div>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 16 }}>{user?.firstName} {user?.lastName}</div>
                    <div style={{ color: "var(--gray-500)", fontSize: 14 }}>{user?.email}</div>
                    <div style={{ color: "var(--gray-400)", fontSize: 12, marginTop: 2 }}>
                      {uploadingAvatar ? "Uploading..." : "Click camera to update photo"}
                    </div>
                  </div>
                </div>

                <form onSubmit={submitProfile(onProfileSubmit)}>
                  <div className="grid-2">
                    <div className="form-group">
                      <label className="form-label required">First Name</label>
                      <input {...regProfile("firstName")} className={`form-control ${errProfile.firstName ? "error" : ""}`} />
                      {errProfile.firstName && <div className="form-error">{errProfile.firstName.message}</div>}
                    </div>
                    <div className="form-group">
                      <label className="form-label required">Last Name</label>
                      <input {...regProfile("lastName")} className={`form-control ${errProfile.lastName ? "error" : ""}`} />
                      {errProfile.lastName && <div className="form-error">{errProfile.lastName.message}</div>}
                    </div>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Email Address</label>
                    <input value={user?.email || ""} disabled className="form-control" style={{ background: "var(--gray-50)", color: "var(--gray-500)" }} />
                    <div className="form-hint">Email cannot be changed. Contact support if needed.</div>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Phone Number</label>
                    <input {...regProfile("phone")} className="form-control" placeholder="+91 99999 99999" />
                  </div>
                  <div style={{ display: "flex", justifyContent: "flex-end" }}>
                    <button type="submit" className="btn btn-primary" disabled={loadingProfile}>
                      {loadingProfile ? "Saving..." : "Save Changes"}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}

          {activeTab === "security" && (
            <div className="card">
              <div className="card-header"><span className="card-title">Change Password</span></div>
              <div className="card-body">
                <form onSubmit={submitPwd(onPasswordSubmit)}>
                  <div className="form-group">
                    <label className="form-label required">Current Password</label>
                    <input {...regPwd("currentPassword")} type="password" className={`form-control ${errPwd.currentPassword ? "error" : ""}`} placeholder="••••••••" />
                    {errPwd.currentPassword && <div className="form-error">{errPwd.currentPassword.message}</div>}
                  </div>
                  <div className="form-group">
                    <label className="form-label required">New Password</label>
                    <input {...regPwd("newPassword")} type="password" className={`form-control ${errPwd.newPassword ? "error" : ""}`} placeholder="Min 8 characters" />
                    {errPwd.newPassword && <div className="form-error">{errPwd.newPassword.message}</div>}
                  </div>
                  <div className="form-group">
                    <label className="form-label required">Confirm New Password</label>
                    <input {...regPwd("confirmPassword")} type="password" className={`form-control ${errPwd.confirmPassword ? "error" : ""}`} placeholder="Repeat new password" />
                    {errPwd.confirmPassword && <div className="form-error">{errPwd.confirmPassword.message}</div>}
                  </div>
                  <div style={{ display: "flex", justifyContent: "flex-end" }}>
                    <button type="submit" className="btn btn-primary" disabled={loadingPassword}>
                      {loadingPassword ? "Updating..." : "Update Password"}
                    </button>
                  </div>
                </form>

                <div style={{ marginTop: 28, paddingTop: 24, borderTop: "1px solid var(--border-color)" }}>
                  <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 8 }}>Security Tips</h3>
                  <ul style={{ color: "var(--gray-600)", fontSize: 14, lineHeight: 2, paddingLeft: 20 }}>
                    <li>Use a unique password not used on other sites</li>
                    <li>Include uppercase letters, numbers, and symbols</li>
                    <li>Change your password periodically</li>
                    <li>Never share your password with anyone</li>
                  </ul>
                </div>
              </div>
            </div>
          )}

          {activeTab === "payments" && (
            <div className="card">
              <div className="card-header"><span className="card-title">Payment History</span></div>
              <div>
                {payments.length === 0 ? (
                  <div className="empty-state">
                    <div className="empty-state-icon">💳</div>
                    <div className="empty-state-title">No payment history</div>
                    <div className="empty-state-text">Your payment history will appear here once you purchase a course.</div>
                  </div>
                ) : (
                  <table style={{ width: "100%" }}>
                    <thead>
                      <tr>
                        <th>Course</th>
                        <th>Amount</th>
                        <th>Status</th>
                        <th>Date</th>
                      </tr>
                    </thead>
                    <tbody>
                      {payments.map(p => (
                        <tr key={p.id}>
                          <td style={{ fontSize: 14, fontWeight: 500 }}>{p.course?.title || "Deleted course"}</td>
                          <td style={{ fontWeight: 700 }}>₹{parseFloat(String(p.amount)).toLocaleString("en-IN")}</td>
                          <td>
                            <span className={`badge ${p.status === "SUCCESS" ? "badge-success" : p.status === "PENDING" ? "badge-warning" : "badge-danger"}`}>
                              {p.status}
                            </span>
                          </td>
                          <td style={{ fontSize: 13, color: "var(--gray-500)" }}>{formatDate(p.createdAt)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          )}

          {activeTab === "notifications" && (
            <div className="card">
              <div className="card-header"><span className="card-title">Notification Preferences</span></div>
              <div className="card-body">
                <div className="alert alert-info" style={{ marginBottom: 20 }}>
                  ℹ️ Email notifications are sent for key events like enrollments, course completions, and system updates.
                </div>
                {[
                  { label: "Enrollment confirmations", desc: "When you successfully enroll in a course", enabled: true },
                  { label: "Assessment results", desc: "When you complete a quiz or assignment", enabled: true },
                  { label: "New course announcements", desc: "When new courses in your interest are added", enabled: false },
                  { label: "Certificate issued", desc: "When you earn a new certificate", enabled: true },
                  { label: "Payment receipts", desc: "When a payment is processed", enabled: true },
                ].map((pref, i) => (
                  <div
                    key={i}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      padding: "14px 0",
                      borderBottom: i < 4 ? "1px solid var(--gray-100)" : "none",
                    }}
                  >
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 600 }}>{pref.label}</div>
                      <div style={{ fontSize: 12, color: "var(--gray-500)", marginTop: 2 }}>{pref.desc}</div>
                    </div>
                    <div
                      style={{
                        width: 42,
                        height: 24,
                        borderRadius: 12,
                        background: pref.enabled ? "var(--primary)" : "var(--gray-300)",
                        cursor: "pointer",
                        position: "relative",
                        transition: "background 0.2s",
                      }}
                    >
                      <div
                        style={{
                          width: 18,
                          height: 18,
                          borderRadius: "50%",
                          background: "white",
                          position: "absolute",
                          top: 3,
                          left: pref.enabled ? 21 : 3,
                          transition: "left 0.2s",
                          boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  );
}
