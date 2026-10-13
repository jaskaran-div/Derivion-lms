"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import toast from "react-hot-toast";
import { Mail, ArrowLeft, Send } from "lucide-react";
import { authAPI } from "@/lib/api";

const schema = z.object({
  email: z.string().email("Enter a valid email address"),
});

type FormData = z.infer<typeof schema>;

export default function ForgotPasswordPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const { register, handleSubmit, formState: { errors }, getValues } = useForm<FormData>({
    resolver: zodResolver(schema),
  });

  const onSubmit = async (data: FormData) => {
    setLoading(true);
    try {
      await authAPI.forgotPassword(data.email);
      setSent(true);
    } catch {
      toast.error("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "var(--bg-body)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
      }}
    >
      <div
        style={{
          background: "white",
          borderRadius: "var(--radius-xl)",
          padding: "48px",
          maxWidth: 440,
          width: "100%",
          boxShadow: "var(--shadow-xl)",
          border: "1px solid var(--border-color)",
        }}
      >
        <Link href="/login">
          <button className="btn btn-ghost btn-sm" style={{ marginBottom: 24, color: "var(--gray-500)" }}>
            <ArrowLeft size={16} /> Back to login
          </button>
        </Link>

        {!sent ? (
          <>
            <div style={{ textAlign: "center", marginBottom: 32 }}>
              <div
                style={{
                  width: 64,
                  height: 64,
                  borderRadius: "50%",
                  background: "var(--primary-50)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  margin: "0 auto 20px",
                }}
              >
                <Mail size={28} color="var(--primary)" />
              </div>
              <h1 style={{ fontSize: 24, fontWeight: 800, color: "var(--gray-900)", marginBottom: 8 }}>
                Forgot Password?
              </h1>
              <p style={{ color: "var(--gray-500)", fontSize: 14, lineHeight: 1.6 }}>
                Enter your email address and we&apos;ll send you a link to reset your password.
              </p>
            </div>

            <form onSubmit={handleSubmit(onSubmit)}>
              <div className="form-group">
                <label className="form-label required">Email Address</label>
                <div className="input-group">
                  <Mail size={16} className="input-group-icon" />
                  <input
                    {...register("email")}
                    type="email"
                    className={`form-control ${errors.email ? "error" : ""}`}
                    placeholder="you@example.com"
                    autoFocus
                  />
                </div>
                {errors.email && <div className="form-error">{errors.email.message}</div>}
              </div>

              <button
                type="submit"
                className="btn btn-primary w-full"
                disabled={loading}
                style={{ height: 46, justifyContent: "center", fontSize: 15 }}
              >
                {loading ? "Sending..." : <><Send size={16} /> Send Reset Link</>}
              </button>
            </form>
          </>
        ) : (
          <div style={{ textAlign: "center" }}>
            <div
              style={{
                width: 72,
                height: 72,
                borderRadius: "50%",
                background: "var(--success-light)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                margin: "0 auto 24px",
                fontSize: 36,
              }}
            >
              📬
            </div>
            <h1 style={{ fontSize: 22, fontWeight: 800, color: "var(--gray-900)", marginBottom: 12 }}>
              Check your email!
            </h1>
            <p style={{ color: "var(--gray-500)", fontSize: 14, lineHeight: 1.7, marginBottom: 28 }}>
              We&apos;ve sent a password reset link to <strong>{getValues("email")}</strong>. 
              The link expires in 1 hour.
            </p>
            <p style={{ fontSize: 13, color: "var(--gray-400)", marginBottom: 24 }}>
              Didn&apos;t receive it? Check your spam folder.
            </p>
            <Link href="/login">
              <button className="btn btn-primary w-full" style={{ justifyContent: "center", height: 44 }}>
                Back to Login
              </button>
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
