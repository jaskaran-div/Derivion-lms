"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/store/authStore";
import Sidebar from "./Sidebar";
import Header from "./Header";

interface AppLayoutProps {
  children: React.ReactNode;
  title?: string;
  requiredRole?: "ADMIN" | "TEACHER" | "STUDENT" | "ANY";
}

export default function AppLayout({
  children,
  title,
  requiredRole = "ANY",
}: AppLayoutProps) {
  const router = useRouter();
  const { isAuthenticated, user, setLoading } = useAuthStore();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted) return;
    if (!isAuthenticated) {
      router.replace("/login");
      return;
    }
    if (requiredRole === "ADMIN" && user?.role !== "ADMIN") {
      if (user?.role === "TEACHER") router.replace("/teacher/dashboard");
      else router.replace("/dashboard");
      return;
    }
    if (requiredRole === "TEACHER" && user?.role !== "TEACHER") {
      if (user?.role === "ADMIN") router.replace("/admin/dashboard");
      else router.replace("/dashboard");
      return;
    }
    if (requiredRole === "STUDENT" && user?.role !== "STUDENT") {
      if (user?.role === "ADMIN") router.replace("/admin/dashboard");
      else if (user?.role === "TEACHER") router.replace("/teacher/dashboard");
    }
  }, [mounted, isAuthenticated, user, requiredRole]);

  if (!mounted) return null;
  if (!isAuthenticated) return null;

  return (
    <div className="app-layout">
      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.5)",
            zIndex: 99,
          }}
          onClick={() => setMobileOpen(false)}
        />
      )}

      <Sidebar
        mobileOpen={mobileOpen}
        onClose={() => setMobileOpen(false)}
      />

      <main className="app-main">
        <Header
          title={title}
          onMobileMenuToggle={() => setMobileOpen(!mobileOpen)}
        />
        <div className="app-content">{children}</div>
      </main>
    </div>
  );
}
