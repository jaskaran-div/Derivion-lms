import type { Metadata } from "next";
import "./globals.css";
import { Toaster } from "react-hot-toast";

export const metadata: Metadata = {
  title: {
    default: "Derivion LMS - Learn. Grow. Succeed.",
    template: "%s | Derivion LMS",
  },
  description:
    "Derivion LMS is a comprehensive learning management system with courses, assessments, and certificates to accelerate your career.",
  keywords: ["LMS", "online learning", "courses", "education", "e-learning"],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      </head>
      <body>
        {children}
        <Toaster
          position="top-right"
          toastOptions={{
            duration: 4000,
            style: {
              fontFamily: "Outfit, sans-serif",
              fontSize: "14px",
              borderRadius: "14px",
              boxShadow: "0 10px 25px rgba(0,0,0,0.1)",
            },
            success: {
              iconTheme: { primary: "#16a34a", secondary: "white" },
            },
            error: {
              iconTheme: { primary: "#e5484d", secondary: "white" },
            },
          }}
        />
      </body>
    </html>
  );
}
