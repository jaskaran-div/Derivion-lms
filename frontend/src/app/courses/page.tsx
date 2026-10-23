"use client";

import { Suspense, useEffect, useState, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import AppLayout from "@/components/layout/AppLayout";
import { coursesAPI } from "@/lib/api";
import Link from "next/link";
import { Search, Users, Clock } from "lucide-react";
import CourseShareMenu from "@/components/courses/CourseShareMenu";

interface Course {
  id: string;
  title: string;
  slug: string;
  shortDesc?: string;
  description: string;
  price: number;
  discountPrice?: number;
  isFree: boolean;
  thumbnail?: string;
  level: string;
  rating: number;
  totalRatings: number;
  totalStudents: number;
  totalDuration: number;
  totalLessons: number;
  category: { name: string };
  tags: string[];
}

interface Category {
  id: string;
  name: string;
}

// The header search sends people to /courses?search=…; a new term remounts the list with it
export default function CoursesPage() {
  return (
    <Suspense fallback={null}>
      <CoursesFromUrl />
    </Suspense>
  );
}

function CoursesFromUrl() {
  const term = useSearchParams().get("search") || "";
  return <CoursesCatalog key={term} initialSearch={term} />;
}

function CoursesCatalog({ initialSearch }: { initialSearch: string }) {
  const [courses, setCourses] = useState<Course[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const limit = 12;

  // Filters
  const [search, setSearch] = useState(initialSearch);
  const [categoryId, setCategoryId] = useState("");
  const [level, setLevel] = useState("");
  const [sortBy, setSortBy] = useState("createdAt");
  const [priceFilter, setPriceFilter] = useState(""); // "free" | "paid" | ""

  const fetchCourses = useCallback(() => {
    const params: Record<string, string | number> = { page, limit, sortBy, sortOrder: sortBy === "price" ? "asc" : "desc" };
    if (search) params.search = search;
    if (categoryId) params.categoryId = categoryId;
    if (level) params.level = level;
    if (priceFilter === "free") params.isFree = "true";
    return coursesAPI.getAll(params)
      .then((res) => {
        setCourses(res.data.data.courses);
        setTotal(res.data.data.pagination.total);
      })
      .catch(() => {
        setCourses([]);
        setTotal(0);
      })
      .finally(() => {
        setLoading(false);
      });
  }, [page, search, categoryId, level, sortBy, priceFilter]);

  useEffect(() => { fetchCourses(); }, [fetchCourses]);

  useEffect(() => {
    coursesAPI.getCategories().then((res) => setCategories(res.data.data)).catch(() => {});
  }, []);

  const formatDuration = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    if (h > 0) return `${h}h ${m}m`;
    return `${m}m`;
  };

  const formatPrice = (price: number, discountPrice?: number, isFree?: boolean) => {
    if (isFree || price === 0) return <span className="course-price free">Free</span>;
    return (
      <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
        <span className="course-price">
          ₹{(discountPrice || price).toLocaleString("en-IN")}
        </span>
        {discountPrice && (
          <span className="course-price-original">₹{price.toLocaleString("en-IN")}</span>
        )}
      </div>
    );
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    fetchCourses();
  };

  return (
    <AppLayout allowGuest>
      {/* Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Browse Courses</h1>
          <p className="page-subtitle">
            {total} course{total !== 1 ? "s" : ""} available
          </p>
        </div>
      </div>

      {/* Search & Filters */}
      <div className="card" style={{ padding: "16px 20px", marginBottom: 24 }}>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
          <form onSubmit={handleSearch} style={{ flex: 1, minWidth: 240 }}>
            <div className="search-bar">
              <Search size={16} color="var(--gray-400)" />
              <input
                type="text"
                placeholder="Search courses, topics, skills..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </form>

          <select
            className="form-control"
            style={{ width: 180 }}
            value={categoryId}
            onChange={(e) => { setCategoryId(e.target.value); setPage(1); }}
          >
            <option value="">All Categories</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>

          <select
            className="form-control"
            style={{ width: 140 }}
            value={level}
            onChange={(e) => { setLevel(e.target.value); setPage(1); }}
          >
            <option value="">All Levels</option>
            <option>Beginner</option>
            <option>Intermediate</option>
            <option>Advanced</option>
          </select>

          <select
            className="form-control"
            style={{ width: 140 }}
            value={priceFilter}
            onChange={(e) => { setPriceFilter(e.target.value); setPage(1); }}
          >
            <option value="">All Prices</option>
            <option value="free">Free</option>
            <option value="paid">Paid</option>
          </select>

          <select
            className="form-control"
            style={{ width: 150 }}
            value={sortBy}
            onChange={(e) => { setSortBy(e.target.value); setPage(1); }}
          >
            <option value="createdAt">Newest</option>
            <option value="totalStudents">Most Popular</option>
            <option value="price">Price: Low to High</option>
          </select>
        </div>

        {/* Active filters */}
        {(categoryId || level || priceFilter || search) && (
          <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
            {search && (
              <span className="badge badge-primary" style={{ gap: 6 }}>
                🔍 {search}
                <button style={{ background: "none", border: "none", cursor: "pointer", lineHeight: 1 }} onClick={() => setSearch("")}>×</button>
              </span>
            )}
            {categoryId && (
              <span className="badge badge-blue" style={{ gap: 6 }}>
                {categories.find(c => c.id === categoryId)?.name}
                <button style={{ background: "none", border: "none", cursor: "pointer", lineHeight: 1 }} onClick={() => setCategoryId("")}>×</button>
              </span>
            )}
            {level && (
              <span className="badge badge-gray" style={{ gap: 6 }}>
                {level}
                <button style={{ background: "none", border: "none", cursor: "pointer", lineHeight: 1 }} onClick={() => setLevel("")}>×</button>
              </span>
            )}
          </div>
        )}
      </div>

      {/* Course Grid */}
      {loading ? (
        <div className="grid-courses">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="card" style={{ overflow: "hidden" }}>
              <div className="skeleton" style={{ height: 180 }} />
              <div style={{ padding: 18 }}>
                <div className="skeleton" style={{ height: 14, width: "50%", marginBottom: 8 }} />
                <div className="skeleton" style={{ height: 18, width: "90%", marginBottom: 6 }} />
                <div className="skeleton" style={{ height: 18, width: "70%", marginBottom: 16 }} />
                <div className="skeleton" style={{ height: 36 }} />
              </div>
            </div>
          ))}
        </div>
      ) : courses.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">🔍</div>
          <div className="empty-state-title">No courses found</div>
          <div className="empty-state-text">
            Try adjusting your search or filters to find what you&apos;re looking for.
          </div>
          <button
            className="btn btn-secondary"
            onClick={() => { setSearch(""); setCategoryId(""); setLevel(""); setPriceFilter(""); }}
          >
            Clear All Filters
          </button>
        </div>
      ) : (
        <div className="grid-courses">
          {courses.map((course) => (
            <div key={course.id}>
              <Link href={`/courses/${course.slug}`}>
                <div className="course-card">
                <div
                  className="course-card-image"
                  style={{
                    background: course.thumbnail
                      ? `url(${course.thumbnail}) center/cover`
                      : "linear-gradient(135deg, var(--primary-100), var(--primary-50))",
                  }}
                >
                  {!course.thumbnail && <span style={{ fontSize: 48 }}>📚</span>}
                </div>
                <div className="course-card-body">
                  <div className="course-card-category">{course.category?.name}</div>
                  <div className="course-card-title">{course.title}</div>

                  {course.shortDesc && (
                    <div style={{ fontSize: 12, color: "var(--gray-500)", marginBottom: 8, lineHeight: 1.5 }}>
                      {course.shortDesc.slice(0, 80)}...
                    </div>
                  )}

                  <div className="course-card-meta">
                    <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                      <Users size={12} /> {course.totalStudents.toLocaleString()}
                    </span>
                    {course.totalDuration > 0 && (
                      <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                        <Clock size={12} /> {formatDuration(course.totalDuration)}
                      </span>
                    )}
                    <span className="badge badge-gray" style={{ fontSize: 10, padding: "2px 6px" }}>
                      {course.level}
                    </span>
                  </div>

                  <div className="course-card-footer">
                    {formatPrice(
                      parseFloat(String(course.price)),
                      course.discountPrice ? parseFloat(String(course.discountPrice)) : undefined,
                      course.isFree
                    )}
                    <span className="btn btn-dark btn-sm">View course</span>
                  </div>
                </div>
                </div>
              </Link>
              <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 8 }}>
                <CourseShareMenu slug={course.slug} title={course.title} />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Pagination */}
      {total > limit && (
        <div
          style={{
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            gap: 8,
            marginTop: 28,
          }}
        >
          <button
            className="btn btn-secondary"
            disabled={page === 1}
            onClick={() => setPage((p) => p - 1)}
          >
            ← Previous
          </button>
          {Array.from({ length: Math.min(5, Math.ceil(total / limit)) }, (_, i) => {
            const p = i + 1;
            return (
              <button
                key={p}
                className={`btn ${page === p ? "btn-primary" : "btn-secondary"}`}
                onClick={() => setPage(p)}
                style={{ width: 40 }}
              >
                {p}
              </button>
            );
          })}
          <button
            className="btn btn-secondary"
            disabled={page >= Math.ceil(total / limit)}
            onClick={() => setPage((p) => p + 1)}
          >
            Next →
          </button>
        </div>
      )}
    </AppLayout>
  );
}
