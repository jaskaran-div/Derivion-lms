"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, BookOpen, Award, Video, ShieldCheck, Users, Clock } from "lucide-react";
import PublicShell from "@/components/layout/PublicShell";
import { coursesAPI } from "@/lib/api";
import { homePathFor, useAuthStore } from "@/store/authStore";

interface CourseCard {
  id: string;
  title: string;
  slug: string;
  thumbnail?: string;
  shortDesc?: string;
  price: number | string;
  discountPrice?: number | string | null;
  isFree: boolean;
  level?: string;
  totalStudents: number;
  totalDuration: number;
  category?: { name: string };
}

const FEATURES = [
  { icon: <Video size={22} />, title: "Live mentor sessions", text: "Join live classes with mentors and catch up on recordings later." },
  { icon: <BookOpen size={22} />, title: "Structured courses", text: "Video lessons, PDFs and quizzes organised into clear units." },
  { icon: <Award size={22} />, title: "Verified certificates", text: "Finish a course and download a certificate anyone can verify." },
  { icon: <ShieldCheck size={22} />, title: "Built for schools", text: "Teachers create student logins and track progress for their class." },
];

const useHydrated = () => useSyncExternalStore(() => () => {}, () => true, () => false);

const priceLabel = (c: CourseCard) => {
  if (c.isFree || Number(c.price) === 0) return "Free";
  const value = Number(c.discountPrice || c.price);
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(value);
};

export default function HomePage() {
  const router = useRouter();
  const hydrated = useHydrated();
  const { isAuthenticated, user } = useAuthStore();
  const [courses, setCourses] = useState<CourseCard[] | null>(null);

  useEffect(() => {
    if (!hydrated) return;
    if (isAuthenticated && user) {
      router.replace(homePathFor(user.role));
      return;
    }
    coursesAPI.getAll({ limit: 6, sortBy: "totalStudents" })
      .then((res) => setCourses(res.data.data.courses))
      .catch(() => setCourses([]));
  }, [hydrated, isAuthenticated, user, router]);

  if (!hydrated || isAuthenticated) return null;

  return (
    <PublicShell>
      {/* Hero */}
      <section className="landing-hero">
        <div>
          <span className="badge badge-violet" style={{ marginBottom: 16 }}>Learn. Grow. Succeed.</span>
          <h1 className="landing-title">Courses, live mentors and certificates in one place</h1>
          <p className="landing-sub">
            Learn at your own pace with video lessons, notes and quizzes, join live sessions with mentors,
            and earn certificates you can share.
          </p>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            <Link href="/courses" className="btn btn-dark btn-lg">Browse courses <ArrowRight size={18} /></Link>
            <Link href="/register" className="btn btn-secondary btn-lg">Create free account</Link>
          </div>
        </div>
        <div className="landing-hero-art" aria-hidden="true">
          <div className="hero-course-card" style={{ maxWidth: 360, marginLeft: "auto" }}>
            <div className="hero-course-inner">
              <div className="hero-course-thumb">🎓</div>
              <div>
                <div style={{ fontWeight: 600 }}>Your next course</div>
                <div style={{ fontSize: 13, color: "var(--gray-600)" }}>Video · PDF · Quiz</div>
              </div>
            </div>
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 6 }}>
                <span>Progress</span><span>72%</span>
              </div>
              <div className="progress-bar" style={{ background: "rgba(255,255,255,0.7)" }}>
                <div className="progress-fill" style={{ width: "72%" }} />
              </div>
            </div>
            <span className="btn btn-pill-white" style={{ pointerEvents: "none" }}>Continue Learning</span>
          </div>
        </div>
      </section>

      {/* Popular courses */}
      <section style={{ marginTop: 48 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 12, marginBottom: 18, flexWrap: "wrap" }}>
          <h2 className="section-title">Popular courses</h2>
          <Link href="/courses" style={{ fontWeight: 500, color: "var(--primary)" }}>View all courses →</Link>
        </div>
        {courses === null ? (
          <div className="grid-courses">
            {[1, 2, 3].map((i) => <div key={i} className="skeleton" style={{ height: 280, borderRadius: 18 }} />)}
          </div>
        ) : courses.length === 0 ? (
          <div className="card"><div className="empty-state"><div className="empty-state-title">New courses are coming soon</div></div></div>
        ) : (
          <div className="grid-courses">
            {courses.map((c) => (
              <Link key={c.id} href={`/courses/${c.slug}`} className="course-card">
                <div
                  className="course-card-image"
                  style={c.thumbnail ? { background: `url(${c.thumbnail}) center/cover` } : undefined}
                  role="img"
                  aria-label={c.title}
                >
                  {!c.thumbnail && "📚"}
                </div>
                <div className="course-card-body">
                  {c.category?.name && <span className="course-card-category">{c.category.name}</span>}
                  <div className="course-card-title">{c.title}</div>
                  <div className="course-card-meta">
                    <span style={{ display: "flex", alignItems: "center", gap: 4 }}><Users size={13} /> {c.totalStudents}</span>
                    {c.totalDuration > 0 && (
                      <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                        <Clock size={13} /> {Math.round(c.totalDuration / 60)} min
                      </span>
                    )}
                    {c.level && <span className="badge badge-gray">{c.level}</span>}
                  </div>
                  <div className="course-card-footer">
                    <span className={`course-price ${priceLabel(c) === "Free" ? "free" : ""}`}>{priceLabel(c)}</span>
                    <span className="btn btn-dark btn-sm">View course</span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>

      {/* Features */}
      <section style={{ marginTop: 48 }}>
        <h2 className="section-title" style={{ marginBottom: 18 }}>Why learn with Derivion</h2>
        <div className="grid-4">
          {FEATURES.map((f) => (
            <div key={f.title} className="card" style={{ padding: 22 }}>
              <div className="stat-icon" style={{ marginBottom: 14 }}>{f.icon}</div>
              <div style={{ fontWeight: 600, fontSize: 16, marginBottom: 6 }}>{f.title}</div>
              <div style={{ fontSize: 14, color: "var(--gray-600)" }}>{f.text}</div>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="hero-course-card" style={{ marginTop: 48, padding: "clamp(24px, 5vw, 40px)", textAlign: "center", alignItems: "center" }}>
        <h2 className="section-title">Ready to start?</h2>
        <p style={{ color: "var(--gray-700)", maxWidth: 480 }}>Create a free account and enroll in your first course in minutes.</p>
        <Link href="/register" className="btn btn-dark btn-lg">Get started <ArrowRight size={18} /></Link>
      </section>

      <footer style={{ marginTop: 40, padding: "20px 0", textAlign: "center", fontSize: 13, color: "var(--gray-500)" }}>
        © {new Date().getFullYear()} Derivion LMS · <Link href="/login">Log in</Link>
      </footer>
    </PublicShell>
  );
}
