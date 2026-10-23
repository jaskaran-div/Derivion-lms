import Link from "next/link";
import { ArrowLeft } from "lucide-react";

// Centered card used by the small account pages (forgot / reset password, verify email)
export default function AuthCard({ children, backHref = "/login" }: { children: React.ReactNode; backHref?: string }) {
  return (
    <div style={{ minHeight: "100vh", background: "var(--bg-body)", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div
        style={{
          background: "var(--bg-card)",
          borderRadius: "var(--radius-xl)",
          padding: "clamp(28px, 6vw, 48px)",
          maxWidth: 440,
          width: "100%",
          boxShadow: "var(--shadow-xl)",
          border: "1px solid var(--border-color)",
        }}
      >
        <Link href={backHref} className="btn btn-ghost btn-sm" style={{ marginBottom: 24, color: "var(--gray-500)" }}>
          <ArrowLeft size={16} /> Back to login
        </Link>
        {children}
      </div>
    </div>
  );
}

export function AuthIcon({ children, tone = "primary" }: { children: React.ReactNode; tone?: "primary" | "success" | "danger" }) {
  const bg = tone === "success" ? "var(--success-light)" : tone === "danger" ? "var(--danger-light)" : "var(--primary-50)";
  return (
    <div style={{ width: 64, height: 64, borderRadius: "50%", background: bg, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 20px", fontSize: 30 }}>
      {children}
    </div>
  );
}
