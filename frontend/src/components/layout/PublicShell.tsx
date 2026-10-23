"use client";

import Link from "next/link";
import { GraduationCap } from "lucide-react";

// Header + canvas for visitors who are not logged in (landing page, public catalog, public course pages)
export default function PublicShell({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ minHeight: "100vh", background: "var(--bg-card)", display: "flex", flexDirection: "column" }}>
      <header className="public-header">
        <Link href="/" className="public-brand" aria-label="Derivion home">
          <span className="sidebar-logo-icon"><GraduationCap size={22} /></span>
          <span className="sidebar-logo-text">Derivion</span>
        </Link>
        <nav className="public-nav" aria-label="Main">
          <Link href="/courses">Courses</Link>
          <Link href="/login" className="btn btn-dark btn-sm">Log in</Link>
        </nav>
      </header>
      <main className="app-content" style={{ borderTopRightRadius: 28 }}>{children}</main>
    </div>
  );
}
