"use client";

import NotificationManager from "@/components/notifications/NotificationManager";

export default function TeacherNotificationsPage() {
  return <NotificationManager requiredRole="TEACHER" />;
}
