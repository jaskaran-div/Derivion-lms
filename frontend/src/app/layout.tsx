import type { Metadata } from "next";
import { Outfit } from "next/font/google";
import "./globals.css";
import { Toaster } from "react-hot-toast";
import ClientErrorReporter from "@/components/ClientErrorReporter";

export const metadata: Metadata = {
  title: {
    default: "Derivion LMS - Learn. Grow. Succeed.",
    template: "%s | Derivion LMS",
  },
  description:
    "Derivion LMS is a comprehensive learning management system with courses, assessments, and certificates to accelerate your career.",
  keywords: ["LMS", "online learning", "courses", "education", "e-learning"],
};

// Self-hosted by Next (no render-blocking request to Google)
const outfit = Outfit({ subsets: ["latin"], weight: ["300", "400", "500", "600", "700", "800"], variable: "--font-outfit", display: "swap" });

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={outfit.variable}>
      <body>
        <a href="#main-content" className="skip-link">Skip to content</a>
        <ClientErrorReporter />
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
