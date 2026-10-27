"use client";

import { useState } from "react";
import toast from "react-hot-toast";
import { isAxiosError } from "axios";
import { ArrowRight, ShieldCheck } from "lucide-react";
import { apiErrorMessage, authAPI } from "@/lib/api";
import type { User } from "@/store/authStore";

export interface OtpChallenge {
  token: string;
  email: string;
}

/**
 * Asks for the 6-digit code emailed to an individual learner (after sign-up, or at the first login).
 * On success the server signs the learner in and onVerified receives the session.
 */
export default function EmailOtpStep({
  challenge,
  onChallengeChange,
  onVerified,
  onCancel,
  cancelLabel = "Use a different account",
}: {
  challenge: OtpChallenge;
  onChallengeChange: (c: OtpChallenge | null) => void;
  onVerified: (data: { user: User; accessToken: string }) => void;
  onCancel: () => void;
  cancelLabel?: string;
}) {
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (code.length !== 6) return;
    setLoading(true);
    try {
      const res = await authAPI.verifyOtp(challenge.token, code);
      onVerified(res.data.data);
    } catch (err) {
      if (isAxiosError<{ code?: string }>(err) && err.response?.data?.code === "OTP_SESSION_EXPIRED") onChallengeChange(null);
      toast.error(apiErrorMessage(err, "Could not verify the code."));
    } finally {
      setLoading(false);
    }
  };

  const resend = async () => {
    setResending(true);
    try {
      const res = await authAPI.resendOtp(challenge.token);
      onChallengeChange({ token: res.data.data.otpToken, email: res.data.data.email });
      setCode("");
      toast.success("A new code is on its way.");
    } catch (err) {
      toast.error(apiErrorMessage(err, "Could not send a new code."));
    } finally {
      setResending(false);
    }
  };

  return (
    <form onSubmit={submit}>
      <div className="form-group">
        <label className="form-label required" htmlFor="otp-code">Verification code</label>
        <div className="input-group">
          <ShieldCheck size={16} className="input-group-icon" />
          <input
            id="otp-code"
            className="form-control"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            placeholder="000000"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
            style={{ letterSpacing: 6, fontSize: 18, fontWeight: 600 }}
            autoFocus
          />
        </div>
        <div className="form-hint">The code expires in 10 minutes. Check your spam folder if you can&apos;t find it.</div>
      </div>
      <button
        type="submit"
        className="btn btn-primary w-full"
        disabled={loading || code.length !== 6}
        style={{ justifyContent: "center", marginTop: 8, height: 46, fontSize: 15 }}
      >
        {loading ? "Verifying…" : <>Verify &amp; continue <ArrowRight size={16} /></>}
      </button>
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 14, fontSize: 13 }}>
        <button type="button" className="btn btn-ghost btn-sm" onClick={onCancel}>{cancelLabel}</button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={resend} disabled={resending}>
          {resending ? "Sending…" : "Resend code"}
        </button>
      </div>
    </form>
  );
}
