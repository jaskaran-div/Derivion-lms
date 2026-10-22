"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useAuthStore } from "@/store/authStore";
import { ShieldAlert } from "lucide-react";

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

type ShieldReason = "capture" | "away" | null;

// Browsers cannot block OS-level screenshots or screen recorders. This is a deterrent:
// content is blacked out the instant a screenshot shortcut starts (Win / Cmd+Shift / PrintScreen)
// and whenever the page loses focus (snipping tools and recorders take focus), and videos pause.
export default function LearnerContentProtection({
  children,
}: LearnerContentProtectionProps) {
  const user = useAuthStore((state) => state.user);
  const isStudent = user?.role === "STUDENT";
  const [shield, setShield] = useState<ShieldReason>(null);
  const [portalTarget, setPortalTarget] = useState<Element | null>(null);
  const releaseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const raise = useCallback((reason: Exclude<ShieldReason, null>) => {
    if (releaseTimer.current) clearTimeout(releaseTimer.current);
    setShield((current) => (current === "capture" ? current : reason));
    document.querySelectorAll("video").forEach((v) => { if (!v.paused) v.pause(); });
  }, []);

  const releaseSoon = useCallback((ms: number) => {
    if (releaseTimer.current) clearTimeout(releaseTimer.current);
    releaseTimer.current = setTimeout(() => {
      // Stay hidden while the page is still unfocused (e.g. the snipping overlay is open)
      if (document.visibilityState === "visible" && document.hasFocus()) setShield(null);
      else setShield("away");
    }, ms);
  }, []);

  useEffect(() => {
    if (!isStudent) return;

    // The shield must render inside the fullscreen element, otherwise fullscreen video stays visible
    const updateTarget = () => setPortalTarget(document.fullscreenElement ?? document.body);
    updateTarget();

    const onKeyDown = (event: KeyboardEvent) => {
      const key = event.key;
      // Windows key (Win+Shift+S, Win+PrtSc, Win+G) and Mac Cmd+Shift (3/4/5) screenshot shortcuts
      if (key === "Meta" || key === "OS" || (event.metaKey && event.shiftKey)) {
        raise("capture");
        return;
      }
      if (key === "PrintScreen") {
        raise("capture");
        return;
      }
      // Developer tools / view source / save / print / select-all / copy
      const lower = key.toLowerCase();
      const devtools = key === "F12" || ((event.ctrlKey || event.metaKey) && event.shiftKey && ["i", "j", "c", "k", "s"].includes(lower));
      const blocked = !isEditableTarget(event.target) && (event.ctrlKey || event.metaKey) && ["a", "c", "p", "s", "u"].includes(lower);
      if (devtools || blocked) event.preventDefault();
    };

    const onKeyUp = (event: KeyboardEvent) => {
      if (event.key === "PrintScreen") {
        // Windows copies the screenshot to the clipboard on key-up; overwrite it
        navigator.clipboard?.writeText("").catch(() => {});
        releaseSoon(1500);
      } else if (event.key === "Meta" || event.key === "OS") {
        releaseSoon(700);
      }
    };

    const onBlur = () => {
      // Clicking into an embedded PDF moves focus to the iframe; that is not leaving the page
      if (document.activeElement?.tagName === "IFRAME") return;
      raise("away");
    };
    const onFocus = () => releaseSoon(150);
    const onVisibility = () => {
      if (document.visibilityState === "hidden") raise("away");
      else releaseSoon(150);
    };

    window.addEventListener("keydown", onKeyDown, true);
    window.addEventListener("keyup", onKeyUp, true);
    window.addEventListener("blur", onBlur);
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibility);
    document.addEventListener("fullscreenchange", updateTarget);
    return () => {
      window.removeEventListener("keydown", onKeyDown, true);
      window.removeEventListener("keyup", onKeyUp, true);
      window.removeEventListener("blur", onBlur);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibility);
      document.removeEventListener("fullscreenchange", updateTarget);
      if (releaseTimer.current) clearTimeout(releaseTimer.current);
    };
  }, [isStudent, raise, releaseSoon]);

  if (!isStudent) return <>{children}</>;

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
      {shield && portalTarget &&
        createPortal(
          <div
            className="learner-capture-shield"
            onClick={() => {
              if (document.hasFocus()) setShield(null);
            }}
          >
            <ShieldAlert size={40} />
            <div style={{ fontSize: 18, fontWeight: 700, marginTop: 12 }}>
              {shield === "capture" ? "Screen capture is not allowed" : "Content hidden"}
            </div>
            <div style={{ fontSize: 14, opacity: 0.75, marginTop: 6, maxWidth: 360, textAlign: "center" }}>
              {shield === "capture"
                ? "Course content is protected and cannot be screenshotted or recorded."
                : "Course content is hidden while this window is not active. Click here to continue."}
            </div>
          </div>,
          portalTarget
        )}
    </div>
  );
}
