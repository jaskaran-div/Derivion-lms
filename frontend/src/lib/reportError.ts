import { API_BASE_URL } from "./api";

const sent = new Set<string>();

// Send a crash report to the backend log (deduplicated, never throws)
export const reportClientError = (error: unknown, extra?: { digest?: string }) => {
  if (typeof window === "undefined") return;
  const err = error instanceof Error ? error : new Error(String(error));
  const key = `${err.message}|${window.location.pathname}`;
  if (sent.has(key)) return;
  sent.add(key);
  const body = JSON.stringify({
    message: err.message,
    stack: err.stack,
    url: window.location.href,
    digest: extra?.digest,
  });
  try {
    // keepalive lets the report finish even if the page is navigating away (JSON needs CORS, so no sendBeacon)
    fetch(`${API_BASE_URL}/client-errors`, { method: "POST", body, headers: { "Content-Type": "application/json" }, keepalive: true }).catch(() => {});
  } catch {
    /* reporting must never break the page */
  }
};
