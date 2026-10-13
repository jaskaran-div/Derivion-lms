"use client";

import { useEffect } from "react";
import { useAuthStore } from "@/store/authStore";

interface LearnerContentProtectionProps {
  children: React.ReactNode;
}

function isEditableTarget(target: EventTarget | null) {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable ||
      target.tagName === "INPUT" ||
      target.tagName === "TEXTAREA" ||
      target.tagName === "SELECT")
  );
}

export default function LearnerContentProtection({
  children,
}: LearnerContentProtectionProps) {
  const user = useAuthStore((state) => state.user);
  const isStudent = user?.role === "STUDENT";

  useEffect(() => {
    if (!isStudent) return;

    const preventRestrictedShortcuts = (event: KeyboardEvent) => {
      if (isEditableTarget(event.target) || !(event.ctrlKey || event.metaKey)) return;

      if (["a", "c", "p", "s", "u"].includes(event.key.toLowerCase())) {
        event.preventDefault();
      }
    };

    document.addEventListener("keydown", preventRestrictedShortcuts, true);
    return () =>
      document.removeEventListener("keydown", preventRestrictedShortcuts, true);
  }, [isStudent]);

  if (!isStudent) return <>{children}</>;

  const learnerName = [user.firstName, user.lastName].filter(Boolean).join(" ");
  const watermark = [learnerName, user.email].filter(Boolean).join(" · ") || "Learner";

  const allowEditing = (event: React.SyntheticEvent) =>
    isEditableTarget(event.target);

  return (
    <div
      className="learner-content-protection"
      onContextMenu={(event) => {
        if (!allowEditing(event)) event.preventDefault();
      }}
      onCopy={(event) => {
        if (!allowEditing(event)) event.preventDefault();
      }}
      onCut={(event) => {
        if (!allowEditing(event)) event.preventDefault();
      }}
      onDragStart={(event) => {
        if (!allowEditing(event)) event.preventDefault();
      }}
    >
      {children}
      <div className="learner-content-watermark" aria-hidden="true">
        {Array.from({ length: 12 }, (_, index) => (
          <span key={index}>{watermark}</span>
        ))}
      </div>
    </div>
  );
}
