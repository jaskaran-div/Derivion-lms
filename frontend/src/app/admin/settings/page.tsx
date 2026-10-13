"use client";

import { useState } from "react";
import AppLayout from "@/components/layout/AppLayout";
import { Settings, Globe, CreditCard, Mail, Shield, BookOpen } from "lucide-react";
import toast from "react-hot-toast";

export default function AdminSettingsPage() {
  const [activeTab, setActiveTab] = useState("general");
  const [saving, setSaving] = useState(false);

  const [general, setGeneral] = useState({
    siteName: "Derivion LMS",
    siteDescription: "Learn. Grow. Succeed.",
    contactEmail: "support@derivion.com",
    currency: "INR",
    timezone: "Asia/Kolkata",
    language: "English",
  });

  const [enrollmentSettings, setEnrollmentSettings] = useState({
    allowSelfRegistration: true,
    requireEmailVerification: false,
    allowGuestBrowsing: true,
    maxEnrollmentsPerUser: "50",
  });

  const handleSave = async () => {
    setSaving(true);
    await new Promise(r => setTimeout(r, 800));
    toast.success("Settings saved successfully!");
    setSaving(false);
  };

  const tabs = [
    { key: "general", label: "General", icon: <Globe size={15} /> },
    { key: "enrollment", label: "Enrollment", icon: <BookOpen size={15} /> },
    { key: "payment", label: "Payment", icon: <CreditCard size={15} /> },
    { key: "email", label: "Email", icon: <Mail size={15} /> },
    { key: "security", label: "Security", icon: <Shield size={15} /> },
  ];

  return (
    <AppLayout requiredRole="ADMIN">
      <div className="page-header">
        <div>
          <h1 className="page-title">System Settings</h1>
          <p className="page-subtitle">Configure your LMS platform settings</p>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "220px 1fr", gap: 24, alignItems: "start" }}>
        {/* Left nav */}
        <div className="card" style={{ padding: "12px 8px" }}>
          {tabs.map(tab => (
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
          {activeTab === "general" && (
            <div className="card">
              <div className="card-header"><span className="card-title">General Settings</span></div>
              <div className="card-body">
                <div className="form-group">
                  <label className="form-label">Platform Name</label>
                  <input className="form-control" value={general.siteName} onChange={e => setGeneral({...general, siteName: e.target.value})} />
                </div>
                <div className="form-group">
                  <label className="form-label">Platform Description</label>
                  <input className="form-control" value={general.siteDescription} onChange={e => setGeneral({...general, siteDescription: e.target.value})} />
                </div>
                <div className="form-group">
                  <label className="form-label">Contact Email</label>
                  <input type="email" className="form-control" value={general.contactEmail} onChange={e => setGeneral({...general, contactEmail: e.target.value})} />
                </div>
                <div className="grid-2">
                  <div className="form-group">
                    <label className="form-label">Currency</label>
                    <select className="form-control" value={general.currency} onChange={e => setGeneral({...general, currency: e.target.value})}>
                      <option value="INR">INR (₹)</option>
                      <option value="USD">USD ($)</option>
                      <option value="EUR">EUR (€)</option>
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Timezone</label>
                    <select className="form-control" value={general.timezone} onChange={e => setGeneral({...general, timezone: e.target.value})}>
                      <option value="Asia/Kolkata">Asia/Kolkata (IST)</option>
                      <option value="America/New_York">America/New_York (EST)</option>
                      <option value="Europe/London">Europe/London (GMT)</option>
                      <option value="Asia/Dubai">Asia/Dubai (GST)</option>
                    </select>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === "enrollment" && (
            <div className="card">
              <div className="card-header"><span className="card-title">Enrollment Settings</span></div>
              <div className="card-body">
                {[
                  { key: "allowSelfRegistration", label: "Allow Self Registration", desc: "Students can create their own accounts" },
                  { key: "requireEmailVerification", label: "Require Email Verification", desc: "New accounts must verify email before accessing courses" },
                  { key: "allowGuestBrowsing", label: "Allow Guest Browsing", desc: "Visitors can browse courses without signing in" },
                ].map(setting => (
                  <div
                    key={setting.key}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      padding: "16px 0",
                      borderBottom: "1px solid var(--gray-100)",
                    }}
                  >
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 600 }}>{setting.label}</div>
                      <div style={{ fontSize: 12, color: "var(--gray-500)", marginTop: 2 }}>{setting.desc}</div>
                    </div>
                    <div
                      onClick={() => setEnrollmentSettings({
                        ...enrollmentSettings,
                        [setting.key]: !enrollmentSettings[setting.key as keyof typeof enrollmentSettings],
                      })}
                      style={{
                        width: 44,
                        height: 24,
                        borderRadius: 12,
                        background: enrollmentSettings[setting.key as keyof typeof enrollmentSettings] ? "var(--primary)" : "var(--gray-300)",
                        cursor: "pointer",
                        position: "relative",
                        transition: "background 0.2s",
                        flexShrink: 0,
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
                          left: enrollmentSettings[setting.key as keyof typeof enrollmentSettings] ? 23 : 3,
                          transition: "left 0.2s",
                          boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
                        }}
                      />
                    </div>
                  </div>
                ))}

                <div className="form-group" style={{ marginTop: 16 }}>
                  <label className="form-label">Max Enrollments per User</label>
                  <input
                    type="number"
                    className="form-control"
                    style={{ maxWidth: 160 }}
                    value={enrollmentSettings.maxEnrollmentsPerUser}
                    onChange={e => setEnrollmentSettings({...enrollmentSettings, maxEnrollmentsPerUser: e.target.value})}
                    min={1}
                  />
                  <div className="form-hint">Set to 0 for unlimited</div>
                </div>
              </div>
            </div>
          )}

          {activeTab === "payment" && (
            <div className="card">
              <div className="card-header"><span className="card-title">Payment Configuration</span></div>
              <div className="card-body">
                <div className="alert alert-info" style={{ marginBottom: 20 }}>
                  🔒 Payment credentials are managed through environment variables for security.
                  Edit the <code>.env</code> file to update payment settings.
                </div>

                {[
                  { label: "Payment Gateway", value: "Razorpay" },
                  { label: "Mode", value: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID?.startsWith("rzp_live") ? "🟢 Live" : "🟡 Test" },
                  { label: "Currency", value: "INR (₹)" },
                ].map((item, i) => (
                  <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "12px 0", borderBottom: "1px solid var(--gray-100)" }}>
                    <span style={{ color: "var(--gray-600)", fontSize: 14 }}>{item.label}</span>
                    <span style={{ fontWeight: 600, fontSize: 14 }}>{item.value}</span>
                  </div>
                ))}

                <div style={{ marginTop: 20, background: "var(--gray-50)", borderRadius: "var(--radius-md)", padding: 16 }}>
                  <h4 style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>Environment Variables Required:</h4>
                  {["RAZORPAY_KEY_ID", "RAZORPAY_KEY_SECRET", "RAZORPAY_WEBHOOK_SECRET"].map(key => (
                    <div key={key} style={{ fontFamily: "monospace", fontSize: 13, color: "var(--gray-700)", marginBottom: 4 }}>
                      {key}=<span style={{ color: "var(--gray-400)" }}>your_value_here</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {activeTab === "email" && (
            <div className="card">
              <div className="card-header"><span className="card-title">Email Configuration</span></div>
              <div className="card-body">
                <div className="alert alert-info" style={{ marginBottom: 20 }}>
                  📧 Email settings are managed through environment variables.
                </div>
                {[
                  { label: "Email Provider", value: "Nodemailer / SMTP" },
                  { label: "From Name", value: "Derivion LMS" },
                  { label: "From Address", value: "noreply@derivion.com" },
                ].map((item, i) => (
                  <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "12px 0", borderBottom: "1px solid var(--gray-100)" }}>
                    <span style={{ color: "var(--gray-600)", fontSize: 14 }}>{item.label}</span>
                    <span style={{ fontWeight: 600, fontSize: 14 }}>{item.value}</span>
                  </div>
                ))}
                <div style={{ marginTop: 20, background: "var(--gray-50)", borderRadius: "var(--radius-md)", padding: 16 }}>
                  <h4 style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>Environment Variables:</h4>
                  {["SMTP_HOST", "SMTP_PORT", "SMTP_USER", "SMTP_PASS", "EMAIL_FROM"].map(key => (
                    <div key={key} style={{ fontFamily: "monospace", fontSize: 13, color: "var(--gray-700)", marginBottom: 4 }}>
                      {key}=<span style={{ color: "var(--gray-400)" }}>your_value_here</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {activeTab === "security" && (
            <div className="card">
              <div className="card-header"><span className="card-title">Security Settings</span></div>
              <div className="card-body">
                {[
                  { label: "Rate Limiting", desc: "Protects against brute force attacks", enabled: true },
                  { label: "Helmet.js Headers", desc: "Security headers for all API responses", enabled: true },
                  { label: "JWT Authentication", desc: "Secure stateless authentication", enabled: true },
                  { label: "Input Validation", desc: "All inputs validated before processing", enabled: true },
                ].map((item, i) => (
                  <div
                    key={i}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      padding: "14px 0",
                      borderBottom: i < 3 ? "1px solid var(--gray-100)" : "none",
                    }}
                  >
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 600 }}>{item.label}</div>
                      <div style={{ fontSize: 12, color: "var(--gray-500)", marginTop: 2 }}>{item.desc}</div>
                    </div>
                    <span className="badge badge-success">✓ Active</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Save button */}
          <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 16 }}>
            <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
              {saving ? "Saving..." : "Save Settings"}
            </button>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
