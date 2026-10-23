"use client";

import { useEffect, useState } from "react";
import AppLayout from "@/components/layout/AppLayout";
import { analyticsAPI } from "@/lib/api";
import {
  Users, BookOpen, Award, TrendingUp, BarChart3, AlertTriangle, Download, RefreshCw, CheckCircle, GraduationCap, DollarSign, Activity, Clock,
} from "lucide-react";

interface OverviewData {
  summary: {
    totalStudents: number;
    totalTeachers: number;
    totalSchools: number;
    totalCourses: number;
    totalEnrollments: number;
    completedEnrollments: number;
    completionRate: string;
    totalRevenue: number;
    avgAssessmentScore: string;
    notStartedStudents: number;
  };
  enrollmentsByMonth: { month: string; count: number | string }[];
  revenueByMonth: { month: string; revenue: number }[];
  popularCourses: { id: string; title: string; totalStudents: number; thumbnail?: string; level?: string }[];
}

interface CourseAnalytics {
  id: string;
  title: string;
  thumbnail?: string;
  level?: string;
  totalStudents: number;
  completedStudents: number;
  completionRate: string | number;
  assessmentCount: number;
  sectionCount: number;
}

interface AtRiskStudent {
  id: string;
  user: { firstName: string; lastName: string; username: string; guardianEmail: string };
  course: { title: string; thumbnail: string };
  progressPercent: string;
  enrolledAt: string;
}

type Tab = "overview" | "courses" | "at-risk";

export default function AnalyticsPage() {
  const [tab, setTab] = useState<Tab>("overview");
  const [overview, setOverview] = useState<OverviewData | null>(null);
  const [courseData, setCourseData] = useState<CourseAnalytics[]>([]);
  const [atRisk, setAtRisk] = useState<AtRiskStudent[]>([]);
  // The tab whose data is on screen; anything else means that tab is still loading
  const [loadedTab, setLoadedTab] = useState<Tab | null>(null);
  const loading = loadedTab !== tab;
  const [exporting, setExporting] = useState(false);


  const loadTab = (t: Tab) => {
    const request =
      t === "overview"
        ? analyticsAPI.getOverview().then((res) => setOverview(res.data.data))
        : t === "courses"
          ? analyticsAPI.getCourses({ limit: 50 }).then((res) => setCourseData(res.data.data.courses))
          : analyticsAPI.getAtRisk().then((res) => setAtRisk(res.data.data));
    return request.catch((err) => console.error(err)).finally(() => setLoadedTab(t));
  };

  useEffect(() => {
    loadTab(tab);
  }, [tab]);

  const handleExport = async () => {
    setExporting(true);
    try {
      const res = await analyticsAPI.exportStudents();
      const url = URL.createObjectURL(new Blob([res.data], { type: "text/csv" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = `students_export_${Date.now()}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {}
    setExporting(false);
  };

  const formatCurrency = (n: number) =>
    new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(n);

  const formatDate = (d: string) => new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });

  const s = overview?.summary;

  return (
    <AppLayout>
      <div className="analytics-page">
        {/* Header */}
        <div className="analytics-header">
          <div className="analytics-title-area">
            <div className="analytics-icon">
              <BarChart3 size={26} />
            </div>
            <div>
              <h1 className="analytics-title">Analytics & Reports</h1>
              <p className="analytics-subtitle">Platform-wide learning insights and performance data</p>
            </div>
          </div>
          <div className="analytics-actions">
            <button className="btn-refresh" onClick={() => loadTab(tab)}>
              <RefreshCw size={15} />
              Refresh
            </button>
            <button className="btn-export" onClick={handleExport} disabled={exporting}>
              <Download size={15} />
              {exporting ? "Exporting..." : "Export Students CSV"}
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="analytics-tabs">
          {(["overview", "courses", "at-risk"] as Tab[]).map((t) => (
            <button
              key={t}
              className={`analytics-tab ${tab === t ? "analytics-tab--active" : ""}`}
              onClick={() => setTab(t)}
            >
              {t === "overview" && <TrendingUp size={15} />}
              {t === "courses" && <BookOpen size={15} />}
              {t === "at-risk" && <AlertTriangle size={15} />}
              {t === "overview" ? "Overview" : t === "courses" ? "Course Analytics" : "At-Risk Students"}
              {t === "at-risk" && atRisk.length > 0 && (
                <span className="tab-badge">{atRisk.length}</span>
              )}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="analytics-loading">
            {[1,2,3,4,5,6].map((i) => <div key={i} className="skeleton-card" />)}
          </div>
        ) : (
          <>
            {/* OVERVIEW TAB */}
            {tab === "overview" && s && (
              <div className="overview-content">
                {/* KPI Cards */}
                <div className="kpi-grid">
                  <div className="kpi-card kpi-blue">
                    <div className="kpi-icon"><Users size={22} /></div>
                    <div className="kpi-body">
                      <div className="kpi-value">{s.totalStudents.toLocaleString()}</div>
                      <div className="kpi-label">Total Students</div>
                      <div className="kpi-sub">{s.notStartedStudents} haven&apos;t started yet</div>
                    </div>
                  </div>
                  <div className="kpi-card kpi-purple">
                    <div className="kpi-icon"><GraduationCap size={22} /></div>
                    <div className="kpi-body">
                      <div className="kpi-value">{s.totalTeachers}</div>
                      <div className="kpi-label">Teachers</div>
                      <div className="kpi-sub">{s.totalSchools} schools</div>
                    </div>
                  </div>
                  <div className="kpi-card kpi-green">
                    <div className="kpi-icon"><BookOpen size={22} /></div>
                    <div className="kpi-body">
                      <div className="kpi-value">{s.totalEnrollments.toLocaleString()}</div>
                      <div className="kpi-label">Enrollments</div>
                      <div className="kpi-sub">{s.completionRate}% completion rate</div>
                    </div>
                  </div>
                  <div className="kpi-card kpi-orange">
                    <div className="kpi-icon"><DollarSign size={22} /></div>
                    <div className="kpi-body">
                      <div className="kpi-value">{formatCurrency(s.totalRevenue)}</div>
                      <div className="kpi-label">Total Revenue</div>
                      <div className="kpi-sub">{s.totalCourses} published courses</div>
                    </div>
                  </div>
                  <div className="kpi-card kpi-teal">
                    <div className="kpi-icon"><Award size={22} /></div>
                    <div className="kpi-body">
                      <div className="kpi-value">{s.completedEnrollments.toLocaleString()}</div>
                      <div className="kpi-label">Completions</div>
                      <div className="kpi-sub">{s.completionRate}% of all enrollments</div>
                    </div>
                  </div>
                  <div className="kpi-card kpi-pink">
                    <div className="kpi-icon"><Activity size={22} /></div>
                    <div className="kpi-body">
                      <div className="kpi-value">{s.avgAssessmentScore}%</div>
                      <div className="kpi-label">Avg Assessment Score</div>
                      <div className="kpi-sub">across all assessments</div>
                    </div>
                  </div>
                </div>

                {/* At-Risk highlight */}
                {s.notStartedStudents > 0 && (
                  <div className="atRisk-banner">
                    <AlertTriangle size={18} />
                    <div>
                      <strong>{s.notStartedStudents} students</strong> are enrolled but haven&apos;t started any lesson yet.
                    </div>
                    <button className="atRisk-btn" onClick={() => setTab("at-risk")}>
                      View At-Risk Students →
                    </button>
                  </div>
                )}

                {/* Popular Courses */}
                {overview.popularCourses.length > 0 && (
                  <div className="section-card">
                    <h3 className="section-title">Most Popular Courses</h3>
                    <div className="popular-courses-list">
                      {overview.popularCourses.map((c, i) => (
                        <div key={c.id} className="popular-course-row">
                          <div className="popular-rank">#{i + 1}</div>
                          {c.thumbnail && (
                            <img src={c.thumbnail} alt={c.title} className="popular-thumb" />
                          )}
                          <div className="popular-info">
                            <div className="popular-title">{c.title}</div>
                            <div className="popular-level">{c.level}</div>
                          </div>
                          <div className="popular-students">
                            <Users size={14} />
                            <span>{c.totalStudents.toLocaleString()} students</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Enrollment by month */}
                {overview.enrollmentsByMonth.length > 0 && (
                  <div className="section-card">
                    <h3 className="section-title">Enrollments (Last 6 Months)</h3>
                    <div className="month-chart">
                      {overview.enrollmentsByMonth.map((m) => {
                        const max = Math.max(...overview.enrollmentsByMonth.map((x) => Number(x.count)));
                        const pct = max > 0 ? (Number(m.count) / max) * 100 : 0;
                        return (
                          <div key={m.month} className="month-bar-wrap">
                            <div className="month-count">{Number(m.count)}</div>
                            <div className="month-bar-bg">
                              <div className="month-bar-fill" style={{ height: `${pct}%` }} />
                            </div>
                            <div className="month-label">{m.month}</div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* COURSES TAB */}
            {tab === "courses" && (
              <div className="section-card">
                <h3 className="section-title">Course Completion Rates</h3>
                {courseData.length === 0 ? (
                  <div className="empty-state">No course data available.</div>
                ) : (
                  <div className="courses-analytics-table-wrap">
                    <table className="analytics-table">
                      <thead>
                        <tr>
                          <th>Course</th>
                          <th>Enrolled</th>
                          <th>Completed</th>
                          <th>Completion Rate</th>
                          <th>Assessments</th>
                        </tr>
                      </thead>
                      <tbody>
                        {courseData.map((c) => (
                          <tr key={c.id}>
                            <td className="course-cell">
                              <div className="course-name-text">{c.title}</div>
                            </td>
                            <td>{c.totalStudents.toLocaleString()}</td>
                            <td>{c.completedStudents.toLocaleString()}</td>
                            <td>
                              <div className="completion-bar-wrap">
                                <div className="completion-bar">
                                  <div
                                    className="completion-bar-fill"
                                    style={{
                                      width: `${c.completionRate}%`,
                                      background: Number(c.completionRate) >= 70 ? "#10b981" : Number(c.completionRate) >= 40 ? "#f59e0b" : "#ef4444",
                                    }}
                                  />
                                </div>
                                <span className="completion-pct">{c.completionRate}%</span>
                              </div>
                            </td>
                            <td>{c.assessmentCount}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {/* AT-RISK TAB */}
            {tab === "at-risk" && (
              <div className="section-card">
                <div className="at-risk-header">
                  <h3 className="section-title">At-Risk Students</h3>
                  <p className="at-risk-desc">
                    Students enrolled for over 14 days with less than 10% progress
                  </p>
                </div>
                {atRisk.length === 0 ? (
                  <div className="empty-state success-empty">
                    <CheckCircle size={40} />
                    <p>No at-risk students found. Great work!</p>
                  </div>
                ) : (
                  <div className="at-risk-table-wrap">
                    <table className="analytics-table">
                      <thead>
                        <tr>
                          <th>Student</th>
                          <th>Course</th>
                          <th>Progress</th>
                          <th>Enrolled</th>
                          <th>Guardian Email</th>
                        </tr>
                      </thead>
                      <tbody>
                        {atRisk.map((item) => (
                          <tr key={item.id}>
                            <td>
                              <div className="student-cell">
                                <div className="student-avatar">
                                  {item.user.firstName[0]}{item.user.lastName[0]}
                                </div>
                                <div>
                                  <div className="student-name">{item.user.firstName} {item.user.lastName}</div>
                                  <div className="student-id">@{item.user.username}</div>
                                </div>
                              </div>
                            </td>
                            <td className="course-cell">
                              <div className="course-name-text">{item.course.title}</div>
                            </td>
                            <td>
                              <div className="progress-cell">
                                <div className="mini-progress-bar">
                                  <div className="mini-progress-fill" style={{ width: `${item.progressPercent}%` }} />
                                </div>
                                <span>{parseFloat(item.progressPercent).toFixed(1)}%</span>
                              </div>
                            </td>
                            <td className="date-cell">
                              <Clock size={13} />
                              {formatDate(item.enrolledAt)}
                            </td>
                            <td className="guardian-cell">
                              {item.user.guardianEmail || "—"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </>
        )}

        <style jsx>{`
          .analytics-page { padding: 0; }
          .analytics-header {
            display: flex; align-items: center; justify-content: space-between;
            margin-bottom: 1.75rem; gap: 1rem; flex-wrap: wrap;
          }
          .analytics-title-area { display: flex; align-items: center; gap: 1rem; }
          .analytics-icon {
            width: 50px; height: 50px; border-radius: 14px;
            background: linear-gradient(135deg, #8b5cf6, #1d4ed8);
            display: flex; align-items: center; justify-content: center; color: white;
            box-shadow: 0 4px 15px rgba(139,92,246,0.35);
          }
          .analytics-title { font-size: 1.5rem; font-weight: 700; color: var(--text-primary); margin: 0; }
          .analytics-subtitle { color: var(--text-secondary); font-size: 0.875rem; margin: 0; }
          .analytics-actions { display: flex; gap: 0.75rem; flex-wrap: wrap; }
          .btn-refresh, .btn-export {
            display: flex; align-items: center; gap: 0.45rem;
            padding: 0.6rem 1.1rem; border-radius: 10px;
            font-size: 0.875rem; font-weight: 500; cursor: pointer;
            border: 1px solid var(--border); transition: all 0.15s;
          }
          .btn-refresh { background: none; color: var(--text-primary); }
          .btn-refresh:hover { background: var(--hover); }
          .btn-export {
            background: linear-gradient(135deg, #8b5cf6, #1d4ed8); color: white; border: none;
            box-shadow: 0 4px 12px rgba(29, 78, 216,0.3);
          }
          .btn-export:disabled { opacity: 0.65; cursor: not-allowed; }

          .analytics-tabs {
            display: flex; gap: 0.5rem; margin-bottom: 1.5rem;
            border-bottom: 1px solid var(--border); padding-bottom: 0;
          }
          .analytics-tab {
            display: flex; align-items: center; gap: 0.4rem;
            padding: 0.6rem 1.1rem; background: none; border: none;
            font-size: 0.875rem; font-weight: 500; cursor: pointer;
            color: var(--text-secondary); border-bottom: 2px solid transparent;
            margin-bottom: -1px; transition: all 0.15s; border-radius: 6px 6px 0 0;
          }
          .analytics-tab:hover { color: var(--text-primary); background: var(--hover); }
          .analytics-tab--active { color: #8b5cf6; border-bottom-color: #8b5cf6; font-weight: 600; }
          .tab-badge {
            background: #ef4444; color: white; font-size: 0.7rem; font-weight: 700;
            padding: 0.1rem 0.4rem; border-radius: 20px; min-width: 18px; text-align: center;
          }

          .analytics-loading {
            display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 1rem;
          }
          .skeleton-card {
            height: 120px; border-radius: 12px; background: var(--card-bg);
            border: 1px solid var(--border);
            background: linear-gradient(90deg, var(--card-bg) 25%, var(--border) 50%, var(--card-bg) 75%);
            background-size: 200% 100%; animation: shimmer 1.5s infinite;
          }
          @keyframes shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }

          .overview-content { display: flex; flex-direction: column; gap: 1.25rem; }

          .kpi-grid {
            display: grid; grid-template-columns: repeat(auto-fill, minmax(210px, 1fr)); gap: 1rem;
          }
          .kpi-card {
            background: var(--card-bg); border: 1px solid var(--border);
            border-radius: 14px; padding: 1.25rem;
            display: flex; align-items: flex-start; gap: 1rem;
            transition: transform 0.2s, box-shadow 0.2s;
          }
          .kpi-card:hover { transform: translateY(-2px); box-shadow: 0 8px 20px rgba(0,0,0,0.1); }
          .kpi-icon {
            width: 44px; height: 44px; border-radius: 12px;
            display: flex; align-items: center; justify-content: center;
            flex-shrink: 0; color: white;
          }
          .kpi-blue .kpi-icon { background: linear-gradient(135deg, #1d4ed8, #1e40af); }
          .kpi-purple .kpi-icon { background: linear-gradient(135deg, #8b5cf6, #7c3aed); }
          .kpi-green .kpi-icon { background: linear-gradient(135deg, #10b981, #059669); }
          .kpi-orange .kpi-icon { background: linear-gradient(135deg, #f59e0b, #d97706); }
          .kpi-teal .kpi-icon { background: linear-gradient(135deg, #06b6d4, #0891b2); }
          .kpi-pink .kpi-icon { background: linear-gradient(135deg, #ec4899, #db2777); }
          .kpi-value { font-size: 1.6rem; font-weight: 800; color: var(--text-primary); line-height: 1; margin-bottom: 0.2rem; }
          .kpi-label { font-size: 0.82rem; font-weight: 600; color: var(--text-secondary); }
          .kpi-sub { font-size: 0.75rem; color: var(--text-secondary); opacity: 0.7; margin-top: 0.25rem; }

          .atRisk-banner {
            display: flex; align-items: center; gap: 0.75rem;
            background: rgba(239,68,68,0.08); border: 1px solid rgba(239,68,68,0.25);
            padding: 1rem 1.25rem; border-radius: 12px; color: #ef4444;
            font-size: 0.9rem; flex-wrap: wrap;
          }
          .atRisk-btn {
            margin-left: auto; padding: 0.4rem 0.85rem; background: #ef4444;
            color: white; border: none; border-radius: 8px; cursor: pointer;
            font-size: 0.82rem; font-weight: 600; white-space: nowrap;
          }

          .section-card {
            background: var(--card-bg); border: 1px solid var(--border);
            border-radius: 14px; padding: 1.5rem;
          }
          .section-title { font-size: 1rem; font-weight: 700; color: var(--text-primary); margin: 0 0 1.25rem; }
          .empty-state { text-align: center; padding: 2rem; color: var(--text-secondary); }
          .success-empty { color: #10b981; }
          .success-empty p { color: var(--text-secondary); margin-top: 0.5rem; }

          .popular-courses-list { display: flex; flex-direction: column; gap: 0.75rem; }
          .popular-course-row {
            display: flex; align-items: center; gap: 0.85rem;
            padding: 0.75rem; border-radius: 10px; border: 1px solid var(--border);
            transition: background 0.15s;
          }
          .popular-course-row:hover { background: var(--hover); }
          .popular-rank { font-size: 1rem; font-weight: 800; color: var(--text-secondary); min-width: 28px; }
          .popular-thumb { width: 44px; height: 44px; border-radius: 8px; object-fit: cover; flex-shrink: 0; }
          .popular-info { flex: 1; }
          .popular-title { font-size: 0.9rem; font-weight: 600; color: var(--text-primary); }
          .popular-level { font-size: 0.75rem; color: var(--text-secondary); }
          .popular-students {
            display: flex; align-items: center; gap: 0.35rem;
            font-size: 0.82rem; color: var(--text-secondary); flex-shrink: 0;
          }

          .month-chart {
            display: flex; align-items: flex-end; gap: 1rem;
            height: 150px; padding: 0.5rem 0;
          }
          .month-bar-wrap {
            display: flex; flex-direction: column; align-items: center;
            gap: 0.35rem; flex: 1;
          }
          .month-count { font-size: 0.75rem; font-weight: 600; color: var(--text-secondary); }
          .month-bar-bg {
            width: 100%; flex: 1; background: var(--hover); border-radius: 6px;
            display: flex; align-items: flex-end; overflow: hidden;
          }
          .month-bar-fill {
            width: 100%; border-radius: 6px;
            background: linear-gradient(180deg, #8b5cf6, #1d4ed8);
            transition: height 0.3s ease; min-height: 4px;
          }
          .month-label { font-size: 0.72rem; color: var(--text-secondary); white-space: nowrap; }

          /* Tables */
          .courses-analytics-table-wrap,
          .at-risk-table-wrap { overflow-x: auto; }
          .analytics-table {
            width: 100%; border-collapse: collapse; font-size: 0.875rem;
          }
          .analytics-table th {
            text-align: left; padding: 0.65rem 0.85rem;
            background: var(--hover); font-weight: 600;
            color: var(--text-secondary); font-size: 0.78rem;
            text-transform: uppercase; letter-spacing: 0.03em;
            border-bottom: 1px solid var(--border);
          }
          .analytics-table td {
            padding: 0.7rem 0.85rem; border-bottom: 1px solid var(--border);
            color: var(--text-primary); vertical-align: middle;
          }
          .analytics-table tbody tr:hover { background: var(--hover); }

          .course-cell { max-width: 260px; }
          .course-name-text {
            font-weight: 500; white-space: nowrap; overflow: hidden;
            text-overflow: ellipsis; max-width: 240px;
          }
          .completion-bar-wrap { display: flex; align-items: center; gap: 0.6rem; }
          .completion-bar {
            flex: 1; height: 8px; background: var(--hover);
            border-radius: 4px; overflow: hidden; min-width: 60px;
          }
          .completion-bar-fill { height: 100%; border-radius: 4px; transition: width 0.3s; }
          .completion-pct { font-size: 0.82rem; font-weight: 600; min-width: 38px; }

          .student-cell { display: flex; align-items: center; gap: 0.65rem; }
          .student-avatar {
            width: 32px; height: 32px; border-radius: 50%;
            background: linear-gradient(135deg, #1d4ed8, #8b5cf6);
            color: white; display: flex; align-items: center; justify-content: center;
            font-size: 0.72rem; font-weight: 700; flex-shrink: 0;
          }
          .student-name { font-size: 0.875rem; font-weight: 600; color: var(--text-primary); }
          .student-id { font-size: 0.75rem; color: var(--text-secondary); }
          .progress-cell { display: flex; align-items: center; gap: 0.5rem; font-size: 0.82rem; }
          .mini-progress-bar {
            width: 60px; height: 6px; background: var(--hover);
            border-radius: 3px; overflow: hidden; flex-shrink: 0;
          }
          .mini-progress-fill { height: 100%; background: #ef4444; border-radius: 3px; }
          .date-cell { display: flex; align-items: center; gap: 0.35rem; font-size: 0.82rem; color: var(--text-secondary); }
          .guardian-cell { font-size: 0.8rem; color: var(--text-secondary); }
          .at-risk-header { margin-bottom: 0.75rem; }
          .at-risk-desc { color: var(--text-secondary); font-size: 0.85rem; margin: 0.25rem 0 1rem; }
        `}</style>
      </div>
    </AppLayout>
  );
}
