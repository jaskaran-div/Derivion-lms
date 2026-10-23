"use client";

import { useEffect, useState } from "react";

// Current time for "x minutes ago" labels: read once, then refreshed on an interval (keeps render pure)
export function useNow(intervalMs = 60_000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}
