"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { authAPI, clearAuth } from "@/lib/api";

export interface User {
  id: string;
  email: string;
  username?: string;
  firstName: string;
  lastName: string;
  role: "ADMIN" | "TEACHER" | "STUDENT";
  avatar?: string;
  mustChangePassword?: boolean;
  isEmailVerified?: boolean;
  // Learners only: SCHOOL (added by a school/teacher) or INDIVIDUAL
  learnerType?: "SCHOOL" | "INDIVIDUAL" | null;
}

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  setUser: (user: User) => void;
  updateUser: (patch: Partial<User>) => void;
  // The refresh token lives in an httpOnly cookie; only the short-lived access token is kept here
  setTokens: (accessToken: string) => void;
  logout: () => void;
  setLoading: (loading: boolean) => void;
  isAdmin: () => boolean;
  isTeacher: () => boolean;
}

export const homePathFor = (role?: User["role"]) =>
  role === "ADMIN" ? "/admin/dashboard" : role === "TEACHER" ? "/teacher/dashboard" : "/dashboard";

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      isAuthenticated: false,
      isLoading: false,

      setUser: (user) => set({ user, isAuthenticated: true }),

      updateUser: (patch) => {
        const user = get().user;
        if (user) set({ user: { ...user, ...patch } });
      },

      setTokens: (accessToken) => {
        if (typeof window !== "undefined") localStorage.setItem("access_token", accessToken);
      },

      logout: () => {
        // Revoke the refresh cookie on the server (best effort), then clear local state
        authAPI.logout().catch(() => {});
        clearAuth();
        set({ user: null, isAuthenticated: false });
      },

      setLoading: (isLoading) => set({ isLoading }),

      isAdmin: () => get().user?.role === "ADMIN",
      isTeacher: () => get().user?.role === "TEACHER",
    }),
    {
      name: "auth-store",
      partialize: (state) => ({
        user: state.user,
        isAuthenticated: state.isAuthenticated,
      }),
    }
  )
);

// The API client signals an ended session (refresh failed) — reset the store everywhere
if (typeof window !== "undefined") {
  window.addEventListener("lms:logged-out", () => {
    useAuthStore.setState({ user: null, isAuthenticated: false });
  });
}
