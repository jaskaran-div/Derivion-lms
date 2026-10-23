import type { Metadata } from "next";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000/api";

interface PublicCourse {
  title: string;
  shortDesc?: string;
  description?: string;
  thumbnail?: string;
  category?: { name: string };
}

// Title, description and preview image for shared links and search engines
export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  try {
    const res = await fetch(`${API}/courses/${encodeURIComponent(slug)}`, { next: { revalidate: 300 } });
    if (!res.ok) return { title: "Course" };
    const course: PublicCourse = (await res.json()).data;
    const description = (course.shortDesc || course.description || "").replace(/\s+/g, " ").slice(0, 160);
    return {
      title: course.title,
      description,
      openGraph: {
        title: course.title,
        description,
        type: "website",
        ...(course.thumbnail && { images: [{ url: course.thumbnail }] }),
      },
      twitter: { card: course.thumbnail ? "summary_large_image" : "summary", title: course.title, description },
    };
  } catch {
    return { title: "Course" };
  }
}

export default function CourseLayout({ children }: { children: React.ReactNode }) {
  return children;
}
