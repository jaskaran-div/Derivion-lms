"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import AuthCard, { AuthIcon } from "@/components/auth/AuthCard";
import { apiErrorMessage, authAPI } from "@/lib/api";

function VerifyEmail() {
  const token = useSearchParams().get("token") || "";
  const [state, setState] = useState<{ status: "working" | "done" | "error"; message?: string }>(
    token ? { status: "working" } : { status: "error", message: "This verification link is incomplete." }
  );
  const ran = useRef(false);

  useEffect(() => {
    if (!token || ran.current) return;
    ran.current = true; // verification tokens are single-use; never call twice
    authAPI
      .verifyEmail(token)
      .then(() => setState({ status: "done" }))
      .catch((err) => setState({ status: "error", message: apiErrorMessage(err, "This verification link is invalid or has expired.") }));
  }, [token]);

  if (state.status === "working") {
    return (
      <div style={{ textAlign: "center", padding: "24px 0" }}>
        <div className="custom-player-spinner" style={{ margin: "0 auto 16px", borderColor: "var(--gray-200)", borderTopColor: "var(--primary)" }} />
        <p style={{ color: "var(--gray-500)" }}>Verifying your email…</p>
      </div>
    );
  }

  if (state.status === "done") {
    return (
      <div style={{ textAlign: "center" }}>
        <AuthIcon tone="success">✅</AuthIcon>
        <h1 style={{ fontSize: 22, fontWeight: 600, marginBottom: 8 }}>Email verified</h1>
        <p style={{ color: "var(--gray-500)", fontSize: 14, marginBottom: 24 }}>Your account is active. You can log in now.</p>
        <Link href="/login" className="btn btn-dark w-full">Go to login</Link>
      </div>
    );
  }

  return (
    <div style={{ textAlign: "center" }}>
      <AuthIcon tone="danger">⚠️</AuthIcon>
      <h1 style={{ fontSize: 22, fontWeight: 600, marginBottom: 8 }}>Couldn&apos;t verify</h1>
      <p style={{ color: "var(--gray-500)", fontSize: 14, marginBottom: 24 }}>
        {state.message} Try logging in; you can request a new link from there.
      </p>
      <Link href="/login" className="btn btn-dark w-full">Go to login</Link>
    </div>
  );
}

export default function VerifyEmailPage() {
  return (
    <AuthCard>
      <Suspense fallback={<div className="skeleton" style={{ height: 160 }} />}>
        <VerifyEmail />
      </Suspense>
    </AuthCard>
  );
}
