"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { homePathFor, useAuthStore } from "@/store/authStore";
import { authAPI, settingsAPI } from "@/lib/api";
import Sidebar from "./Sidebar";
import Header from "./Header";
import PublicShell from "./PublicShell";
import ForcePasswordChange from "./ForcePasswordChange";
import KeyboardClickables from "./KeyboardClickables";

interface AppLayoutProps {
  children: React.ReactNode;
  title?: string;
  requiredRole?: "ADMIN" | "TEACHER" | "STUDENT" | "ANY";
  // Public pages (catalog, course detail) render for visitors inside the public shell
  allowGuest?: boolean;
}

// True after the first client render (the persisted auth store only exists in the browser)
const useHydrated = () =>
  useSyncExternalStore(
    () => () => {},
    () => true,
    () => false
  );

let profileSynced = false;

export default function AppLayout({ children, title, requiredRole = "ANY", allowGuest = false }: AppLayoutProps) {
  const router = useRouter();
  const hydrated = useHydrated();
  const { isAuthenticated, user, updateUser } = useAuthStore();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [guestAllowed, setGuestAllowed] = useState<boolean | null>(allowGuest ? null : false);

  // Guests may browse only if the admin allows it
  useEffect(() => {
    if (!hydrated || isAuthenticated || !allowGuest) return;
    let cancelled = false;
    settingsAPI.getPublic()
      .then((res) => { if (!cancelled) setGuestAllowed(res.data.data.allowGuestBrowsing); })
      .catch(() => { if (!cancelled) setGuestAllowed(true); });
    return () => { cancelled = true; };
  }, [hydrated, isAuthenticated, allowGuest]);

  // Route protection
  useEffect(() => {
    if (!hydrated) return;
    if (!isAuthenticated) {
      if (allowGuest && guestAllowed !== false) return;
      const here = window.location.pathname + window.location.search;
      router.replace(`/login?next=${encodeURIComponent(here)}`);
      return;
    }
    const role = user?.role;
    if (requiredRole !== "ANY" && role !== requiredRole) router.replace(homePathFor(role));
  }, [hydrated, isAuthenticated, user, requiredRole, allowGuest, guestAllowed, router]);

  // Refresh the profile once per page load (picks up forced password changes, new avatar, etc.)
  useEffect(() => {
    if (!hydrated || !isAuthenticated || profileSynced) return;
    profileSynced = true;
    authAPI.getMe()
      .then((res) => {
        const me = res.data.data;
        updateUser({ mustChangePassword: me.mustChangePassword, isEmailVerified: me.isEmailVerified, avatar: me.avatar, firstName: me.firstName, lastName: me.lastName });
      })
      .catch(() => {});
  }, [hydrated, isAuthenticated, updateUser]);

  // The API reports a pending forced password change
  useEffect(() => {
    const onMustChange = () => updateUser({ mustChangePassword: true });
    window.addEventListener("lms:must-change-password", onMustChange);
    return () => window.removeEventListener("lms:must-change-password", onMustChange);
  }, [updateUser]);

  if (!hydrated) return null;

  if (!isAuthenticated) {
    if (!allowGuest || guestAllowed !== true) return null;
    return (
      <PublicShell>
        <KeyboardClickables />
        {children}
      </PublicShell>
    );
  }

  return (
    <div className="app-layout">
      <KeyboardClickables />
      {mobileOpen && (
        <div
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 99 }}
          onClick={() => setMobileOpen(false)}
          aria-hidden="true"
        />
      )}

      <Sidebar mobileOpen={mobileOpen} onClose={() => setMobileOpen(false)} />

      <main className="app-main" id="main-content">
        <Header title={title} onMobileMenuToggle={() => setMobileOpen(!mobileOpen)} />
        <div className="app-content">{children}</div>
      </main>

      {user?.mustChangePassword && <ForcePasswordChange />}
    </div>
  );
}
