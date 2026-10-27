"use client";

import { useCallback, useEffect, useState } from "react";
import { activityAPI, usersAPI, type NavIndicators } from "@/lib/api";

const POLL_MS = 45_000;

// When the user last opened each menu page, kept per user in this browser
const seenKey = (userId: string) => `lms:nav-seen:${userId}`;

const readSeen = (userId: string): Record<string, number> | null => {
  try {
    const raw = localStorage.getItem(seenKey(userId));
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};

const writeSeen = (userId: string, patch: Record<string, number>) => {
  try {
    localStorage.setItem(seenKey(userId), JSON.stringify({ ...readSeen(userId), ...patch }));
  } catch {
    /* private mode / storage full: dots just won't remember visits */
  }
};

// First visit on this browser: start counting from now so old activity doesn't light up every item
const initialSeen = (userId: string | undefined, hrefs: string[]) => {
  if (!userId || typeof window === "undefined") return {};
  const stored = readSeen(userId);
  if (stored) return stored;
  const now = Date.now();
  const initial = Object.fromEntries(hrefs.map((h) => [h, now]));
  writeSeen(userId, initial);
  return initial;
};

const linkMatches = (link: string, href: string) =>
  link === href || link.startsWith(`${href}/`) || link.startsWith(`${href}?`);

/**
 * Which sidebar items have something new: unread chats or notifications pointing at the page,
 * or a change there since the user last opened it. Opening a page clears its dot.
 */
export function useNavIndicators(userId: string | undefined, pathname: string, hrefs: string[]) {
  const [data, setData] = useState<NavIndicators | null>(null);
  const [seen, setSeen] = useState<Record<string, number>>(() => initialSeen(userId, hrefs));

  const load = useCallback(() => {
    if (!userId) return;
    activityAPI.indicators().then((res) => setData(res.data.data)).catch(() => {});
  }, [userId]);

  useEffect(() => {
    load();
    const timer = setInterval(load, POLL_MS);
    return () => clearInterval(timer);
  }, [load, pathname]);

  const activeHref = hrefs.find((h) => pathname === h || pathname.startsWith(`${h}/`));

  // Remember the visit (read back when the sidebar mounts again) and read the notifications pointing here
  useEffect(() => {
    if (!userId || !activeHref) return;
    writeSeen(userId, { [activeHref]: Date.now() });
    const unread = data && Object.entries(data.unreadByLink).some(([link, n]) => n > 0 && linkMatches(link, activeHref));
    if (unread) usersAPI.markReadByLink(activeHref).then(load).catch(() => {});
  }, [userId, activeHref, data, load]);

  // Called when a menu link is clicked: the page being left and the one being opened are both seen now
  const markSeen = useCallback(
    (href: string) => {
      if (!userId) return;
      const now = Date.now();
      const patch = { [href]: now, ...(activeHref && { [activeHref]: now }) };
      writeSeen(userId, patch);
      setSeen((prev) => ({ ...prev, ...patch }));
    },
    [userId, activeHref]
  );

  const hasUpdate = (href: string) => {
    if (!data) return false;
    const item = data.items[href];
    if (item?.count && item.count > 0) return true;
    if (Object.entries(data.unreadByLink).some(([link, n]) => n > 0 && linkMatches(link, href))) return true;
    if (href === activeHref || !item?.latestAt) return false;
    return new Date(item.latestAt).getTime() > (seen[href] ?? 0);
  };

  return { hasUpdate, markSeen };
}
