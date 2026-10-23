"use client";

import { useEffect } from "react";
import Link from "next/link";
import { reportClientError } from "@/lib/reportError";

export default function Error({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    reportClientError(error, { digest: error.digest });
  }, [error]);

  return (
    <div style={{ minHeight: "60vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div className="card" style={{ maxWidth: 440, width: "100%", padding: 32, textAlign: "center" }}>
        <div className="empty-state-icon" style={{ margin: "0 auto 16px" }}>⚠️</div>
        <h1 style={{ fontSize: 22, fontWeight: 600, marginBottom: 8 }}>Something went wrong</h1>
        <p style={{ color: "var(--gray-500)", fontSize: 14, marginBottom: 24 }}>
          The problem has been reported. You can try again, or go back to your dashboard.
        </p>
        <div style={{ display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap" }}>
          <button className="btn btn-dark" onClick={() => retry()}>Try again</button>
          <Link href="/" className="btn btn-secondary">Go home</Link>
        </div>
      </div>
    </div>
  );
}
