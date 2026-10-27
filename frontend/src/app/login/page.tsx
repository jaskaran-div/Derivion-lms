"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import toast from "react-hot-toast";
import { Eye, EyeOff, Mail, Lock, ArrowRight } from "lucide-react";
import { apiErrorMessage, authAPI } from "@/lib/api";
import { homePathFor, useAuthStore } from "@/store/authStore";
import { isAxiosError } from "axios";

// Only same-site relative paths are allowed as post-login destinations
const safeNext = () => {
  if (typeof window === "undefined") return null;
  const next = new URLSearchParams(window.location.search).get("next");
  return next && next.startsWith("/") && !next.startsWith("//") ? next : null;
};

const schema = z.object({
  email: z.string().min(1, "Email or Student ID is required"),
  password: z.string().min(1, "Password is required"),
});

type FormData = z.infer<typeof schema>;

export default function LoginPage() {
  const router = useRouter();
  const { setUser, setTokens } = useAuthStore();
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [unverifiedEmail, setUnverifiedEmail] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormData>({ resolver: zodResolver(schema) });

  const onSubmit = async (data: FormData) => {
    setLoading(true);
    try {
      setUnverifiedEmail(null);
      const res = await authAPI.login(data);
      const { user, accessToken } = res.data.data;
      setTokens(accessToken);
      setUser(user);
      toast.success(`Welcome back, ${user.firstName}! 👋`);
      router.push(safeNext() || homePathFor(user.role));
    } catch (err) {
      if (isAxiosError<{ code?: string }>(err) && err.response?.data?.code === "EMAIL_NOT_VERIFIED") {
        setUnverifiedEmail(data.email);
      }
      toast.error(apiErrorMessage(err, "Login failed. Please try again."));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page">
      {/* Left panel */}
      <div className="auth-left">
        <div style={{ position: "relative", zIndex: 1, textAlign: "center" }}>
          <div
            style={{
              width: 72,
              height: 72,
              background: "rgba(255,255,255,0.2)",
              backdropFilter: "blur(10px)",
              borderRadius: 20,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              margin: "0 auto 24px",
              fontSize: 36,
              border: "1px solid rgba(255,255,255,0.3)",
            }}
          >
            🎓
          </div>
          <h1
            style={{
              fontSize: 36,
              fontWeight: 800,
              marginBottom: 16,
              fontFamily: "var(--font-display)",
              lineHeight: 1.2,
            }}
          >
            Learn Without
            <br />
            Limits
          </h1>
          <p
            style={{
              fontSize: 16,
              opacity: 0.85,
              lineHeight: 1.7,
              maxWidth: 340,
              margin: "0 auto 40px",
            }}
          >
            Access thousands of expert-led courses. Learn at your own pace and
            earn certificates to advance your career.
          </p>

          {/* Features */}
          {[
            "📚 Expert-curated course content",
            "🎯 Progress tracking & assessments",
            "🏆 Earn recognized certificates",
            "💬 Community discussions & Q&A",
          ].map((feat) => (
            <div
              key={feat}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                marginBottom: 12,
                fontSize: 14,
                opacity: 0.9,
                background: "rgba(255,255,255,0.1)",
                padding: "10px 16px",
                borderRadius: 10,
                backdropFilter: "blur(10px)",
              }}
            >
              {feat}
            </div>
          ))}
        </div>
      </div>

      {/* Right panel */}
      <div className="auth-right">
        <div className="auth-form-container">
          <div className="auth-title">Welcome back 👋</div>
          <p className="auth-subtitle">Sign in to your account to continue</p>

          {unverifiedEmail && (
            <div className="alert alert-warning" style={{ marginBottom: 20, display: "block" }}>
              Your email address isn&apos;t verified yet. Check your inbox for the verification link.{" "}
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                style={{ padding: "2px 6px", textDecoration: "underline" }}
                onClick={async () => {
                  await authAPI.resendVerification(unverifiedEmail).catch(() => {});
                  toast.success("If the account needs verification, a new link has been sent.");
                }}
              >
                Resend link
              </button>
            </div>
          )}

          <form onSubmit={handleSubmit(onSubmit)}>
            <div className="form-group">
              <label className="form-label required">Email or Student ID</label>
              <div className="input-group">
                <Mail size={16} className="input-group-icon" />
                <input
                  {...register("email")}
                  type="text"
                  className={`form-control ${errors.email ? "error" : ""}`}
                  placeholder="you@example.com or manvi@09"
                  autoComplete="username"
                />
              </div>
              {errors.email && (
                <div className="form-error">{errors.email.message}</div>
              )}
            </div>

            <div className="form-group">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                <label className="form-label required" style={{ marginBottom: 0 }}>
                  Password
                </label>
              </div>
              <div className="input-group" style={{ position: "relative" }}>
                <Lock size={16} className="input-group-icon" />
                <input
                  {...register("password")}
                  type={showPassword ? "text" : "password"}
                  className={`form-control ${errors.password ? "error" : ""}`}
                  placeholder="••••••••"
                  autoComplete="current-password"
                  style={{ paddingRight: 44 }}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  style={{
                    position: "absolute",
                    right: 14,
                    top: "50%",
                    transform: "translateY(-50%)",
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    color: "var(--gray-400)",
                    padding: 0,
                    display: "flex",
                  }}
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
              {errors.password && (
                <div className="form-error">{errors.password.message}</div>
              )}
            </div>

            <button
              type="submit"
              className="btn btn-primary w-full"
              disabled={loading}
              style={{ justifyContent: "center", marginTop: 8, height: 46, fontSize: 15 }}
            >
              {loading ? (
                <span className="animate-spin" style={{ fontSize: 18 }}>⏳</span>
              ) : (
                <>
                  Sign In <ArrowRight size={16} />
                </>
              )}
            </button>
          </form>

          <p style={{ marginTop: 20, fontSize: 13, color: "var(--gray-500)", textAlign: "center" }}>
            Accounts are created by your school or administrator. Forgot your password? Ask your teacher or administrator to reset it.
          </p>
        </div>
      </div>
    </div>
  );
}
