import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Browse courses",
  description: "Explore video courses with notes, quizzes, live mentor sessions and verified certificates.",
};

export default function CoursesLayout({ children }: { children: React.ReactNode }) {
  return children;
}
