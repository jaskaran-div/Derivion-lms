"use client";

import NotificationManager from "@/components/notifications/NotificationManager";

export default function AdminNotificationsPage() {
  return <NotificationManager requiredRole="ADMIN" />;
}
