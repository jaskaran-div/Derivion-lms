"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Lock, KeyRound } from "lucide-react";
import AuthCard, { AuthIcon } from "@/components/auth/AuthCard";
import { apiErrorMessage, authAPI } from "@/lib/api";

const schema = z
  .object({
    password: z.string().min(8, "Use at least 8 characters"),
    confirm: z.string(),
  })
  .refine((d) => d.password === d.confirm, { message: "Passwords do not match", path: ["confirm"] });

type FormData = z.infer<typeof schema>;

function ResetPasswordForm() {
  const token = useSearchParams().get("token") || "";
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { register, handleSubmit, formState: { errors } } = useForm<FormData>({ resolver: zodResolver(schema) });

  const onSubmit = async (data: FormData) => {
    setLoading(true);
    setError(null);
    try {
      await authAPI.resetPassword({ token, password: data.password });
      setDone(true);
    } catch (err) {
      setError(apiErrorMessage(err, "Could not reset your password. Please try again."));
    } finally {
      setLoading(false);
    }
  };

  if (!token) {
    return (
      <div style={{ textAlign: "center" }}>
        <AuthIcon tone="danger">⚠️</AuthIcon>
        <h1 style={{ fontSize: 22, fontWeight: 600, marginBottom: 8 }}>Invalid reset link</h1>
        <p style={{ color: "var(--gray-500)", fontSize: 14, marginBottom: 24 }}>This link is missing its reset code. Ask your teacher or administrator to reset your password.</p>
        <Link href="/login" className="btn btn-dark w-full">Back to login</Link>
      </div>
    );
  }

  if (done) {
    return (
      <div style={{ textAlign: "center" }}>
        <AuthIcon tone="success">✅</AuthIcon>
        <h1 style={{ fontSize: 22, fontWeight: 600, marginBottom: 8 }}>Password updated</h1>
        <p style={{ color: "var(--gray-500)", fontSize: 14, marginBottom: 24 }}>
          You&apos;ve been signed out of all devices. Log in with your new password.
        </p>
        <Link href="/login" className="btn btn-dark w-full">Go to login</Link>
      </div>
    );
  }

  return (
    <>
      <div style={{ textAlign: "center", marginBottom: 28 }}>
        <AuthIcon><KeyRound size={28} color="var(--primary)" /></AuthIcon>
        <h1 style={{ fontSize: 24, fontWeight: 600, color: "var(--gray-900)", marginBottom: 8 }}>Set a new password</h1>
        <p style={{ color: "var(--gray-500)", fontSize: 14 }}>Choose a password with at least 8 characters.</p>
      </div>

      {error && (
        <div className="alert alert-danger" style={{ marginBottom: 16, display: "block" }}>
          {error} Ask your teacher or administrator to reset your password.
        </div>
      )}

      <form onSubmit={handleSubmit(onSubmit)}>
        <div className="form-group">
          <label className="form-label required" htmlFor="password">New password</label>
          <div className="input-group">
            <Lock size={16} className="input-group-icon" />
            <input id="password" type="password" autoComplete="new-password" autoFocus {...register("password")} className={`form-control ${errors.password ? "error" : ""}`} />
          </div>
          {errors.password && <div className="form-error">{errors.password.message}</div>}
        </div>
        <div className="form-group">
          <label className="form-label required" htmlFor="confirm">Confirm password</label>
          <div className="input-group">
            <Lock size={16} className="input-group-icon" />
            <input id="confirm" type="password" autoComplete="new-password" {...register("confirm")} className={`form-control ${errors.confirm ? "error" : ""}`} />
          </div>
          {errors.confirm && <div className="form-error">{errors.confirm.message}</div>}
        </div>
        <button type="submit" className="btn btn-primary w-full" disabled={loading} style={{ height: 46 }}>
          {loading ? "Saving…" : "Update password"}
        </button>
      </form>
    </>
  );
}

export default function ResetPasswordPage() {
  return (
    <AuthCard>
      <Suspense fallback={<div className="skeleton" style={{ height: 240 }} />}>
        <ResetPasswordForm />
      </Suspense>
    </AuthCard>
  );
}
