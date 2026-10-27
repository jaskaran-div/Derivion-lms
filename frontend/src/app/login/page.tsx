"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import toast from "react-hot-toast";
import { Eye, EyeOff, Mail, Lock, ArrowRight } from "lucide-react";
import { apiErrorMessage, authAPI, settingsAPI } from "@/lib/api";
import { homePathFor, useAuthStore, type User } from "@/store/authStore";
import BrandLogo from "@/components/layout/BrandLogo";
import EmailOtpStep, { type OtpChallenge } from "@/components/auth/EmailOtpStep";

// Only same-site relative paths are allowed as post-login destinations
const safeNext = () => {
  if (typeof window === "undefined") return null;
  const next = new URLSearchParams(window.location.search).get("next");
  return next && next.startsWith("/") && !next.startsWith("//") ? next : null;
};

const schema = z.object({
  email: z.string().min(1, "Email or Learner ID is required"),
  password: z.string().min(1, "Password is required"),
});

type FormData = z.infer<typeof schema>;

export default function LoginPage() {
  const router = useRouter();
  const { setUser, setTokens } = useAuthStore();
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  // Individual learners confirm their email with a 6-digit code after the password step
  const [otp, setOtp] = useState<OtpChallenge | null>(null);
  // Sign-up link only when the admin allows learners to create accounts
  const [signupOpen, setSignupOpen] = useState(false);
  useEffect(() => {
    settingsAPI.getPublic().then((res) => setSignupOpen(res.data.data.allowSelfRegistration)).catch(() => {});
  }, []);
  // Signed out because the same learner account signed in on another device
  const [replacedSession] = useState(
    () => typeof window !== "undefined" && new URLSearchParams(window.location.search).get("reason") === "other-device"
  );

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormData>({ resolver: zodResolver(schema) });

  const finishLogin = (data: { user: User; accessToken: string }) => {
    setTokens(data.accessToken);
    setUser(data.user);
    toast.success(`Welcome back, ${data.user.firstName}! 👋`);
    router.push(safeNext() || homePathFor(data.user.role));
  };

  const onSubmit = async (data: FormData) => {
    setLoading(true);
    try {
      const res = await authAPI.login(data);
      if (res.data.data.otpRequired) {
        setOtp({ token: res.data.data.otpToken, email: res.data.data.email });
        toast.success(res.data.message);
        return;
      }
      finishLogin(res.data.data);
    } catch (err) {
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
          <div style={{ display: "flex", justifyContent: "center", marginBottom: 28 }}>
            <BrandLogo variant="light" height={44} />
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
          <div className="auth-mobile-logo" style={{ marginBottom: 20 }}>
            <BrandLogo height={30} />
          </div>
          <div className="auth-title">{otp ? "Verify your email" : "Welcome back 👋"}</div>
          <p className="auth-subtitle">
            {otp ? `Enter the 6-digit code we sent to ${otp.email}` : "Sign in to your account to continue"}
          </p>

          {replacedSession && !otp && (
            <div className="alert alert-warning" style={{ marginBottom: 20, display: "block" }}>
              You were signed out because your account was signed in on another device. A learner account can be used on one device at a time.
            </div>
          )}

          {otp ? (
            <EmailOtpStep challenge={otp} onChallengeChange={setOtp} onVerified={finishLogin} onCancel={() => setOtp(null)} />
          ) : (
          <form onSubmit={handleSubmit(onSubmit)}>
            <div className="form-group">
              <label className="form-label required">Email or Learner ID</label>
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
          )}

          {signupOpen && !otp && (
            <p style={{ marginTop: 20, fontSize: 14, color: "var(--gray-600)", textAlign: "center" }}>
              New to Derivion? <Link href="/register" style={{ color: "var(--primary)", fontWeight: 600 }}>Create an account</Link>
            </p>
          )}
          <p style={{ marginTop: 12, fontSize: 13, color: "var(--gray-500)", textAlign: "center" }}>
            Learning through a school? Use the Learner ID your teacher gave you — your school creates and resets school accounts.
          </p>
        </div>
      </div>
    </div>
  );
}
