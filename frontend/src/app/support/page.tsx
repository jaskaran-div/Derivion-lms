"use client";

import AppLayout from "@/components/layout/AppLayout";
import UniversalChat from "@/components/chat/UniversalChat";

export default function StudentSupportPage() {
  return (
    <AppLayout requiredRole="STUDENT">
      <div className="page-header" style={{ marginBottom: 16 }}>
        <div>
          <h1 className="page-title">Messages & Support</h1>
          <p className="page-subtitle">
            Search any user by email or username to chat, or continue conversations from your history.
          </p>
        </div>
      </div>
      <UniversalChat />
    </AppLayout>
  );
}
