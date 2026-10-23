"use client";

import { useState } from "react";
import toast from "react-hot-toast";
import { KeyRound } from "lucide-react";
import { apiErrorMessage, authAPI } from "@/lib/api";
import { useAuthStore } from "@/store/authStore";

// Blocking dialog shown while the account still uses a one-time password from a teacher or admin
export default function ForcePasswordChange() {
  const { setTokens, updateUser, logout } = useAuthStore();
  const [form, setForm] = useState({ current: "", next: "", confirm: "" });
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (form.next.length < 8) return setError("Use at least 8 characters for your new password.");
    if (form.next !== form.confirm) return setError("The new passwords do not match.");
    setSaving(true);
    try {
      const res = await authAPI.changePassword({ currentPassword: form.current, newPassword: form.next });
      if (res.data.data?.accessToken) setTokens(res.data.data.accessToken);
      updateUser({ mustChangePassword: false });
      toast.success("Password updated. Welcome!");
    } catch (err) {
      setError(apiErrorMessage(err, "Could not update your password."));
    } finally {
      setSaving(false);
    }
  };

  const field = (key: keyof typeof form, label: string, autoComplete: string) => (
    <div className="form-group">
      <label className="form-label required" htmlFor={`fpc-${key}`}>{label}</label>
      <input
        id={`fpc-${key}`}
        type="password"
        className="form-control"
        autoComplete={autoComplete}
        value={form[key]}
        onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
        required
      />
    </div>
  );

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="fpc-title" style={{ zIndex: 400 }}>
      <form className="modal" style={{ maxWidth: 440 }} onSubmit={submit}>
        <div className="modal-header">
          <h2 className="modal-title" id="fpc-title" style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <KeyRound size={20} color="var(--primary)" /> Set your own password
          </h2>
        </div>
        <div className="modal-body">
          <p style={{ color: "var(--gray-600)", fontSize: 14, marginBottom: 18 }}>
            You signed in with a one-time password. Choose a new password to continue.
          </p>
          {error && <div className="alert alert-danger" style={{ marginBottom: 16 }}>{error}</div>}
          {field("current", "One-time password", "current-password")}
          {field("next", "New password", "new-password")}
          {field("confirm", "Confirm new password", "new-password")}
        </div>
        <div className="modal-footer" style={{ justifyContent: "space-between" }}>
          <button type="button" className="btn btn-ghost" onClick={() => { logout(); window.location.href = "/login"; }}>
            Log out
          </button>
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? "Saving…" : "Save password"}
          </button>
        </div>
      </form>
    </div>
  );
}
