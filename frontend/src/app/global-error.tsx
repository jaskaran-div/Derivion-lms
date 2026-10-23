"use client";

import { useEffect } from "react";
import { reportClientError } from "@/lib/reportError";

// Replaces the root layout when it crashes, so it must render its own document and styles
export default function GlobalError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    reportClientError(error, { digest: error.digest });
  }, [error]);

  return (
    <html lang="en">
      <body style={{ margin: 0, fontFamily: "system-ui, sans-serif", background: "#f4f5f8", color: "#111318" }}>
        <title>Something went wrong</title>
        <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
          <div style={{ background: "#fff", borderRadius: 24, padding: 32, maxWidth: 420, textAlign: "center", border: "1px solid #eceef2" }}>
            <h1 style={{ fontSize: 22, margin: "0 0 8px" }}>Something went wrong</h1>
            <p style={{ color: "#6b7280", fontSize: 14, margin: "0 0 24px" }}>The problem has been reported. Please try again.</p>
            <button
              onClick={() => retry()}
              style={{ background: "#0f1115", color: "#fff", border: 0, borderRadius: 999, padding: "12px 24px", fontSize: 15, cursor: "pointer" }}
            >
              Try again
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}
