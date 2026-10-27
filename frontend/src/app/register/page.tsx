"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import toast from "react-hot-toast";
import { isAxiosError } from "axios";
import { ArrowRight, Eye, EyeOff, Lock, Mail, Phone, User as UserIcon } from "lucide-react";
import { apiErrorMessage, authAPI, settingsAPI } from "@/lib/api";
import { homePathFor, useAuthStore, type User } from "@/store/authStore";
import BrandLogo from "@/components/layout/BrandLogo";
import EmailOtpStep, { type OtpChallenge } from "@/components/auth/EmailOtpStep";

const schema = z
  .object({
    firstName: z.string().trim().min(1, "First name is required").max(100),
    lastName: z.string().trim().min(1, "Last name is required").max(100),
    email: z.string().trim().email("Enter a valid email address"),
    phone: z.string().trim().regex(/^$|^[+\d][\d\s-]{6,19}$/, "Enter a valid phone number").optional(),
    password: z.string().min(8, "Use at least 8 characters"),
    confirmPassword: z.string(),
  })
  .refine((d) => d.password === d.confirmPassword, { message: "Passwords don't match", path: ["confirmPassword"] });

type FormData = z.infer<typeof schema>;

// Individual learners create their own account here; the email is confirmed with a 6-digit code.
// School learners don't sign up — their school issues their login.
export default function RegisterPage() {
  const router = useRouter();
  const { setUser, setTokens, isAuthenticated, user } = useAuthStore();
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [otp, setOtp] = useState<OtpChallenge | null>(null);
  const [pendingEmail, setPendingEmail] = useState(false);
  const [signupOpen, setSignupOpen] = useState<boolean | null>(null);

  useEffect(() => {
    settingsAPI.getPublic().then((res) => setSignupOpen(res.data.data.allowSelfRegistration)).catch(() => setSignupOpen(true));
  }, []);

  // Already signed in: nothing to do here
  useEffect(() => {
    if (isAuthenticated && user) router.replace(homePathFor(user.role));
  }, [isAuthenticated, user, router]);

  const { register, handleSubmit, formState: { errors } } = useForm<FormData>({ resolver: zodResolver(schema) });

  const onSubmit = async (data: FormData) => {
    setLoading(true);
    setPendingEmail(false);
    try {
      const res = await authAPI.register({
        firstName: data.firstName,
        lastName: data.lastName,
        email: data.email,
        phone: data.phone || undefined,
        password: data.password,
      });
      setOtp({ token: res.data.data.otpToken, email: res.data.data.email });
      toast.success(res.data.message);
    } catch (err) {
      if (isAxiosError<{ code?: string }>(err) && err.response?.data?.code === "VERIFICATION_PENDING") setPendingEmail(true);
      toast.error(apiErrorMessage(err, "Could not create your account."));
    } finally {
      setLoading(false);
    }
  };

  const finishSignup = (data: { user: User; accessToken: string }) => {
    setTokens(data.accessToken);
    setUser(data.user);
    toast.success(`Welcome to Derivion, ${data.user.firstName}! 🎉`);
    router.push(homePathFor(data.user.role));
  };

  const field = (name: keyof FormData) => `form-control ${errors[name] ? "error" : ""}`;

  return (
    <div className="auth-page">
      <div className="auth-left">
        <div style={{ position: "relative", zIndex: 1, textAlign: "center" }}>
          <div style={{ display: "flex", justifyContent: "center", marginBottom: 28 }}>
            <BrandLogo variant="light" height={44} />
          </div>
          <h1 style={{ fontSize: 34, fontWeight: 800, marginBottom: 16, fontFamily: "var(--font-display)", lineHeight: 1.2 }}>
            Start learning
            <br />
            today
          </h1>
          <p style={{ fontSize: 16, opacity: 0.85, lineHeight: 1.7, maxWidth: 340, margin: "0 auto 32px" }}>
            Create your free account to browse courses, learn at your own pace and earn certificates.
          </p>
          {["📚 Expert-curated courses", "🎯 Track your progress", "🏆 Earn certificates"].map((feat) => (
            <div
              key={feat}
              style={{ marginBottom: 12, fontSize: 14, opacity: 0.9, background: "rgba(255,255,255,0.1)", padding: "10px 16px", borderRadius: 10 }}
            >
              {feat}
            </div>
          ))}
        </div>
      </div>

      <div className="auth-right">
        <div className="auth-form-container">
          <div className="auth-mobile-logo" style={{ marginBottom: 20 }}>
            <BrandLogo height={30} />
          </div>
          <div className="auth-title">{otp ? "Verify your email" : "Create your account"}</div>
          <p className="auth-subtitle">
            {otp ? `Enter the 6-digit code we sent to ${otp.email}` : "For individual learners. We'll send a code to confirm your email."}
          </p>

          {signupOpen === false ? (
            <div className="alert alert-info" style={{ display: "block" }}>
              Sign-up is currently turned off. If you learn through a school, ask your teacher for your Learner ID.
              <div style={{ marginTop: 12 }}><Link href="/login" className="btn btn-primary btn-sm">Go to login</Link></div>
            </div>
          ) : otp ? (
            <EmailOtpStep
              challenge={otp}
              onChallengeChange={setOtp}
              onVerified={finishSignup}
              onCancel={() => router.push("/login")}
              cancelLabel="Verify later"
            />
          ) : (
            <form onSubmit={handleSubmit(onSubmit)} noValidate>
              {pendingEmail && (
                <div className="alert alert-warning" style={{ display: "block", marginBottom: 16 }}>
                  This email is waiting for verification. <Link href="/login" style={{ fontWeight: 600 }}>Log in</Link> with the password you chose to get a new code.
                </div>
              )}
              <div className="grid-2">
                <div className="form-group">
                  <label className="form-label required" htmlFor="su-first">First name</label>
                  <div className="input-group">
                    <UserIcon size={16} className="input-group-icon" />
                    <input id="su-first" {...register("firstName")} className={field("firstName")} autoComplete="given-name" />
                  </div>
                  {errors.firstName && <div className="form-error">{errors.firstName.message}</div>}
                </div>
                <div className="form-group">
                  <label className="form-label required" htmlFor="su-last">Last name</label>
                  <input id="su-last" {...register("lastName")} className={field("lastName")} autoComplete="family-name" />
                  {errors.lastName && <div className="form-error">{errors.lastName.message}</div>}
                </div>
              </div>

              <div className="form-group">
                <label className="form-label required" htmlFor="su-email">Email</label>
                <div className="input-group">
                  <Mail size={16} className="input-group-icon" />
                  <input id="su-email" type="email" {...register("email")} className={field("email")} placeholder="you@example.com" autoComplete="email" />
                </div>
                {errors.email && <div className="form-error">{errors.email.message}</div>}
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="su-phone">Phone (optional)</label>
                <div className="input-group">
                  <Phone size={16} className="input-group-icon" />
                  <input id="su-phone" type="tel" {...register("phone")} className={field("phone")} placeholder="+91 98765 43210" autoComplete="tel" />
                </div>
                {errors.phone && <div className="form-error">{errors.phone.message}</div>}
              </div>

              <div className="form-group">
                <label className="form-label required" htmlFor="su-pass">Password</label>
                <div className="input-group" style={{ position: "relative" }}>
                  <Lock size={16} className="input-group-icon" />
                  <input
                    id="su-pass"
                    type={showPassword ? "text" : "password"}
                    {...register("password")}
                    className={field("password")}
                    placeholder="At least 8 characters"
                    autoComplete="new-password"
                    style={{ paddingRight: 44 }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    aria-label={showPassword ? "Hide password" : "Show password"}
                    style={{ position: "absolute", right: 14, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: "var(--gray-400)", padding: 0, display: "flex" }}
                  >
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
                {errors.password && <div className="form-error">{errors.password.message}</div>}
              </div>

              <div className="form-group">
                <label className="form-label required" htmlFor="su-confirm">Confirm password</label>
                <div className="input-group">
                  <Lock size={16} className="input-group-icon" />
                  <input id="su-confirm" type={showPassword ? "text" : "password"} {...register("confirmPassword")} className={field("confirmPassword")} autoComplete="new-password" />
                </div>
                {errors.confirmPassword && <div className="form-error">{errors.confirmPassword.message}</div>}
              </div>

              <button
                type="submit"
                className="btn btn-primary w-full"
                disabled={loading || signupOpen === null}
                style={{ justifyContent: "center", marginTop: 8, height: 46, fontSize: 15 }}
              >
                {loading ? "Creating account…" : <>Create account <ArrowRight size={16} /></>}
              </button>
            </form>
          )}

          {!otp && (
            <>
              <p style={{ marginTop: 20, fontSize: 14, color: "var(--gray-600)", textAlign: "center" }}>
                Already have an account? <Link href="/login" style={{ color: "var(--primary)", fontWeight: 600 }}>Log in</Link>
              </p>
              <p style={{ marginTop: 8, fontSize: 13, color: "var(--gray-500)", textAlign: "center" }}>
                Learning through a school? Don&apos;t sign up — use the Learner ID your teacher gave you.
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
