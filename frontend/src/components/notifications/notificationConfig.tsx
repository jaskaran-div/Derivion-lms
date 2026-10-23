import {
  Info, CheckCircle2, AlertTriangle, AlertCircle, Radio, GraduationCap, Shield, Users,
} from "lucide-react";

// Static options for the notification composer (types, audiences, quick templates)

export const notifTypes = [
  {
    value: "INFO",
    label: "Information",
    desc: "Platform updates, tips, announcements",
    icon: <Info size={16} />,
    color: "#2563eb",
    bg: "#eff6ff",
    border: "#bfdbfe",
    glow: "rgba(37, 99, 235, 0.15)",
  },
  {
    value: "SUCCESS",
    label: "Success",
    desc: "Completions, rewards, achievements",
    icon: <CheckCircle2 size={16} />,
    color: "#059669",
    bg: "#ecfdf5",
    border: "#a7f3d0",
    glow: "rgba(5, 150, 105, 0.15)",
  },
  {
    value: "WARNING",
    label: "Notice / Alert",
    desc: "Deadlines, pending actions, reminders",
    icon: <AlertTriangle size={16} />,
    color: "#d97706",
    bg: "#fffbeb",
    border: "#fde68a",
    glow: "rgba(217, 119, 6, 0.15)",
  },
  {
    value: "ERROR",
    label: "Urgent",
    desc: "Critical alerts, account action needed",
    icon: <AlertCircle size={16} />,
    color: "#dc2626",
    bg: "#fef2f2",
    border: "#fecaca",
    glow: "rgba(220, 38, 38, 0.15)",
  },
];

export const adminAudienceOptions = [
  {
    value: "ALL",
    title: "All Users",
    desc: "Every registered student, teacher, and admin",
    icon: <Radio size={18} />,
  },
  {
    value: "STUDENTS",
    title: "Students Only",
    desc: "All learners currently enrolled across the platform",
    icon: <GraduationCap size={18} />,
  },
  {
    value: "TEACHERS",
    title: "Teachers Only",
    desc: "Instructor and faculty accounts exclusively",
    icon: <Shield size={18} />,
  },
];

export const teacherAudienceOptions = [
  {
    value: "ALL",
    title: "All Students",
    desc: "Broadcast notification to all student accounts",
    icon: <Radio size={18} />,
  },
  {
    value: "MY_STUDENTS",
    title: "My Students",
    desc: "Students created by or enrolled in your courses",
    icon: <Users size={18} />,
  },
];

export const adminTemplates = [
  {
    title: "Welcome to Derivion LMS! 🎓",
    message:
      "We're thrilled to welcome you to our learning community. Explore courses, track your lessons, and boost your skills today!",
    type: "SUCCESS",
    link: "/courses",
  },
  {
    title: "Exciting New Course Released 🚀",
    message:
      "Check out our newest curriculum modules now available in the course catalog. Enroll now to start learning!",
    type: "INFO",
    link: "/courses",
  },
  {
    title: "Scheduled Maintenance Window ⚙️",
    message:
      "We will be deploying server optimizations tonight. You may experience brief intermittent pauses for approximately 10 minutes.",
    type: "WARNING",
    link: "/dashboard",
  },
  {
    title: "Exclusive Enrollment Perk 🎉",
    message:
      "Special opportunity for active learners! Take advantage of newly released study materials and certification pathways.",
    type: "SUCCESS",
    link: "/dashboard",
  },
];

export const teacherTemplates = [
  {
    title: "New Assignment & Lesson Ready 📝",
    message:
      "A new lesson and quiz have been published. Please review your dashboard and complete the activities before the upcoming deadline.",
    type: "INFO",
    link: "/dashboard",
  },
  {
    title: "Great Job on Recent Assessment! 🌟",
    message:
      "Outstanding performance on your recent coursework and quizzes! Keep up the brilliant momentum.",
    type: "SUCCESS",
    link: "/dashboard",
  },
  {
    title: "Reminder: Review Session Tomorrow ⏰",
    message:
      "Don't forget our upcoming live review session tomorrow. Please come prepared with your questions and notes.",
    type: "WARNING",
    link: "/dashboard",
  },
];
