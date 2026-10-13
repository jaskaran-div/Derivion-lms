"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import toast from "react-hot-toast";
import { Eye, EyeOff, Mail, Lock, ArrowRight, GraduationCap } from "lucide-react";
import { authAPI } from "@/lib/api";
import { useAuthStore } from "@/store/authStore";

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

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors },
  } = useForm<FormData>({ resolver: zodResolver(schema) });

  const onSubmit = async (data: FormData) => {
    setLoading(true);
    try {
      const res = await authAPI.login(data);
      const { user, accessToken, refreshToken } = res.data.data;
      setUser(user);
      setTokens(accessToken, refreshToken);
      toast.success(`Welcome back, ${user.firstName}! 👋`);
      if (user.role === "ADMIN") router.push("/admin/dashboard");
      else if (user.role === "TEACHER") router.push("/teacher/dashboard");
      else router.push("/dashboard");
    } catch (err: any) {
      toast.error(err.response?.data?.message || "Login failed. Please try again.");
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

          <form onSubmit={handleSubmit(onSubmit)}>
            <div className="form-group">
              <label className="form-label required">Email or Student ID</label>
              <div className="input-group">
                <Mail size={16} className="input-group-icon" />
                <input
                  {...register("email")}
                  type="text"
                  className={`form-control ${errors.email ? "error" : ""}`}
                  placeholder="you@example.com or drv123456"
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
                <Link
                  href="/forgot-password"
                  style={{
                    fontSize: 13,
                    color: "var(--primary)",
                    fontWeight: 500,
                  }}
                >
                  Forgot password?
                </Link>
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

          <div className="auth-divider">
            <span>Don&apos;t have an account?</span>
          </div>

          <Link href="/register">
            <button className="btn btn-secondary w-full" style={{ height: 44, justifyContent: "center" }}>
              Create an account
            </button>
          </Link>

          {/* Demo credentials hint */}
          <div
            className="alert alert-info"
            style={{ marginTop: 20, fontSize: 12 }}
          >
            <div style={{ width: "100%" }}>
              <div style={{ fontWeight: 600, marginBottom: 6 }}>Quick Fill Demo Accounts:</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <button
                  type="button"
                  onClick={() => {
                    setValue("email", "admin@derivion.com");
                    setValue("password", "Admin@123");
                  }}
                  style={{
                    background: "none",
                    border: "none",
                    padding: 0,
                    textAlign: "left",
                    cursor: "pointer",
                    color: "inherit",
                    textDecoration: "underline",
                  }}
                >
                  <strong>Admin:</strong> admin@derivion.com / Admin@123
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setValue("email", "teacher@derivion.com");
                    setValue("password", "Teacher@123");
                  }}
                  style={{
                    background: "none",
                    border: "none",
                    padding: 0,
                    textAlign: "left",
                    cursor: "pointer",
                    color: "inherit",
                    textDecoration: "underline",
                  }}
                >
                  <strong>Teacher:</strong> teacher@derivion.com / Teacher@123
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setValue("email", "student@derivion.com");
                    setValue("password", "Student@123");
                  }}
                  style={{
                    background: "none",
                    border: "none",
                    padding: 0,
                    textAlign: "left",
                    cursor: "pointer",
                    color: "inherit",
                    textDecoration: "underline",
                  }}
                >
                  <strong>Student:</strong> student@derivion.com / Student@123
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
