"use client";

import AppLayout from "@/components/layout/AppLayout";
import UniversalChat from "@/components/chat/UniversalChat";

export default function TeacherSupportPage() {
  return (
    <AppLayout requiredRole="TEACHER">
      <div className="page-header" style={{ marginBottom: 16 }}>
        <div>
          <h1 className="page-title">Messages & Support</h1>
          <p className="page-subtitle">
            Chat with students, teachers, or administrators. Search users by email or username to start new discussions.
          </p>
        </div>
      </div>
      <UniversalChat hint="To request a student password reset, include the student ID (e.g. manvi@09) and name in your chat with Admin." />
    </AppLayout>
  );
}
