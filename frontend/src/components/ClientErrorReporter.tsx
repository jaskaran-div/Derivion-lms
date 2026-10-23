"use client";

import { useEffect } from "react";
import { reportClientError } from "@/lib/reportError";

// Reports uncaught errors that happen outside React rendering (event handlers, async code)
export default function ClientErrorReporter() {
  useEffect(() => {
    const onError = (e: ErrorEvent) => reportClientError(e.error || e.message);
    const onRejection = (e: PromiseRejectionEvent) => {
      // Failed API calls are already handled and shown to the user
      if ((e.reason as { isAxiosError?: boolean })?.isAxiosError) return;
      reportClientError(e.reason);
    };
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, []);
  return null;
}
