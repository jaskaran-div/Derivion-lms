"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/store/authStore";

export default function HomePage() {
  const router = useRouter();
  const { isAuthenticated, user } = useAuthStore();

  useEffect(() => {
    if (isAuthenticated && user) {
      router.replace(user.role === "ADMIN" ? "/admin/dashboard" : "/dashboard");
    } else {
      router.replace("/login");
    }
  }, [isAuthenticated, user]);

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "var(--bg-body)",
      }}
    >
      <div style={{ textAlign: "center" }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>🎓</div>
        <div style={{ fontSize: 18, fontWeight: 600, color: "var(--gray-700)" }}>
          Loading Derivion LMS...
        </div>
      </div>
    </div>
  );
}
