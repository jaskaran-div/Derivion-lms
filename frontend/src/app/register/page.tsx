"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import toast from "react-hot-toast";
import { Eye, EyeOff, Mail, Lock, User, Phone, ArrowRight } from "lucide-react";
import { apiErrorMessage, authAPI, settingsAPI } from "@/lib/api";
import { useAuthStore } from "@/store/authStore";

const schema = z.object({
  firstName: z.string().min(2, "First name must be at least 2 characters"),
  lastName: z.string().min(2, "Last name must be at least 2 characters"),
  email: z.string().email("Enter a valid email"),
  phone: z.string().optional(),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .regex(/[A-Z]/, "Must contain an uppercase letter")
    .regex(/[0-9]/, "Must contain a number"),
  confirmPassword: z.string(),
}).refine((d) => d.password === d.confirmPassword, {
  message: "Passwords don't match",
  path: ["confirmPassword"],
});

type FormData = z.infer<typeof schema>;

export default function RegisterPage() {
  const router = useRouter();
  const { setUser, setTokens } = useAuthStore();
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [registrationOpen, setRegistrationOpen] = useState(true);
  const [sentTo, setSentTo] = useState<string | null>(null);

  useEffect(() => {
    settingsAPI.getPublic()
      .then((res) => setRegistrationOpen(res.data.data.allowSelfRegistration))
      .catch(() => {});
  }, []);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormData>({ resolver: zodResolver(schema) });

  const onSubmit = async (data: FormData) => {
    setLoading(true);
    try {
      const { confirmPassword: _confirm, ...payload } = data;
      const res = await authAPI.register(payload);
      if (res.data.data?.requiresVerification) {
        setSentTo(payload.email);
        return;
      }
      const { user, accessToken } = res.data.data;
      setTokens(accessToken);
      setUser(user);
      toast.success("Account created successfully! Welcome to Derivion! 🎉");
      router.push("/dashboard");
    } catch (err) {
      toast.error(apiErrorMessage(err, "Registration failed."));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-left">
        <div style={{ position: "relative", zIndex: 1, textAlign: "center" }}>
          <div style={{ fontSize: 60, marginBottom: 24 }}>🚀</div>
          <h1 style={{ fontSize: 32, fontWeight: 800, marginBottom: 16, lineHeight: 1.2 }}>
            Start Your
            <br />
            Learning Journey
          </h1>
          <p style={{ fontSize: 15, opacity: 0.85, lineHeight: 1.7, maxWidth: 320, margin: "0 auto" }}>
            Join thousands of learners who are transforming their careers with
            Derivion LMS.
          </p>

          <div style={{ marginTop: 40, display: "flex", flexDirection: "column", gap: 12 }}>
            {[
              { emoji: "🎯", text: "Access 500+ premium courses" },
              { emoji: "🏆", text: "Industry-recognized certificates" },
              { emoji: "📱", text: "Learn anywhere, anytime" },
              { emoji: "💼", text: "Boost your career prospects" },
            ].map(({ emoji, text }) => (
              <div
                key={text}
                style={{
                  background: "rgba(255,255,255,0.12)",
                  backdropFilter: "blur(10px)",
                  borderRadius: 10,
                  padding: "12px 18px",
                  fontSize: 14,
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                }}
              >
                <span style={{ fontSize: 20 }}>{emoji}</span>
                {text}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="auth-right">
        <div className="auth-form-container" style={{ maxWidth: 460 }}>
          <div className="auth-title">Create your account</div>
          <p className="auth-subtitle">Free to join. Start learning today.</p>

          {sentTo && (
            <div className="alert alert-success" style={{ marginBottom: 20, display: "block" }}>
              <strong>Check your inbox.</strong> We sent a verification link to {sentTo}. Open it to activate your account, then{" "}
              <Link href="/login" style={{ fontWeight: 600, textDecoration: "underline" }}>log in</Link>.
            </div>
          )}

          {!registrationOpen && (
            <div className="alert alert-warning" style={{ marginBottom: 20, display: "block" }}>
              Self registration is currently closed. Please contact your school or administrator for an account.
            </div>
          )}

          <form onSubmit={handleSubmit(onSubmit)}>
            <div className="grid-2">
              <div className="form-group">
                <label className="form-label required">First Name</label>
                <div className="input-group">
                  <User size={16} className="input-group-icon" />
                  <input
                    {...register("firstName")}
                    className={`form-control ${errors.firstName ? "error" : ""}`}
                    placeholder="John"
                  />
                </div>
                {errors.firstName && (
                  <div className="form-error">{errors.firstName.message}</div>
                )}
              </div>

              <div className="form-group">
                <label className="form-label required">Last Name</label>
                <div className="input-group">
                  <User size={16} className="input-group-icon" />
                  <input
                    {...register("lastName")}
                    className={`form-control ${errors.lastName ? "error" : ""}`}
                    placeholder="Doe"
                  />
                </div>
                {errors.lastName && (
                  <div className="form-error">{errors.lastName.message}</div>
                )}
              </div>
            </div>

            <div className="form-group">
              <label className="form-label required">Email Address</label>
              <div className="input-group">
                <Mail size={16} className="input-group-icon" />
                <input
                  {...register("email")}
                  type="email"
                  className={`form-control ${errors.email ? "error" : ""}`}
                  placeholder="you@example.com"
                />
              </div>
              {errors.email && (
                <div className="form-error">{errors.email.message}</div>
              )}
            </div>

            <div className="form-group">
              <label className="form-label">Phone (Optional)</label>
              <div className="input-group">
                <Phone size={16} className="input-group-icon" />
                <input
                  {...register("phone")}
                  type="tel"
                  className="form-control"
                  placeholder="+91 99999 99999"
                />
              </div>
            </div>

            <div className="form-group">
              <label className="form-label required">Password</label>
              <div className="input-group" style={{ position: "relative" }}>
                <Lock size={16} className="input-group-icon" />
                <input
                  {...register("password")}
                  type={showPassword ? "text" : "password"}
                  className={`form-control ${errors.password ? "error" : ""}`}
                  placeholder="Min 8 chars, 1 uppercase, 1 number"
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

            <div className="form-group">
              <label className="form-label required">Confirm Password</label>
              <div className="input-group">
                <Lock size={16} className="input-group-icon" />
                <input
                  {...register("confirmPassword")}
                  type="password"
                  className={`form-control ${errors.confirmPassword ? "error" : ""}`}
                  placeholder="Repeat your password"
                />
              </div>
              {errors.confirmPassword && (
                <div className="form-error">{errors.confirmPassword.message}</div>
              )}
            </div>

            <button
              type="submit"
              className="btn btn-primary w-full"
              disabled={loading || !registrationOpen || Boolean(sentTo)}
              style={{ height: 46, fontSize: 15, justifyContent: "center" }}
            >
              {loading ? (
                <span className="animate-spin">⏳</span>
              ) : (
                <>
                  Create Account <ArrowRight size={16} />
                </>
              )}
            </button>
          </form>

          <div className="auth-divider">
            <span>Already have an account?</span>
          </div>

          <Link href="/login">
            <button className="btn btn-secondary w-full" style={{ height: 44, justifyContent: "center" }}>
              Sign in instead
            </button>
          </Link>

          <p
            style={{
              fontSize: 12,
              color: "var(--gray-400)",
              textAlign: "center",
              marginTop: 16,
              lineHeight: 1.6,
            }}
          >
            By creating an account, you agree to our Terms of Service and Privacy
            Policy.
          </p>
        </div>
      </div>
    </div>
  );
}
