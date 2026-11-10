"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import toast from "react-hot-toast";
import { ChevronDown, ChevronUp, Download, Search } from "lucide-react";
import { apiErrorMessage, courseEnrollmentsAPI, downloadBlob, type CourseEnrollmentRow } from "@/lib/api";

const formatDate = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "—";

const STATUS_BADGE: Record<string, string> = { ACTIVE: "badge-primary", COMPLETED: "badge-success", REFUNDED: "badge-danger" };

// Admin: everyone enrolled in this course, with their login ID and progress
export default function CourseLearnersAdmin({ courseId, courseSlug }: { courseId: string; courseSlug: string }) {
  const [rows, setRows] = useState<CourseEnrollmentRow[] | null>(null);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("ALL");
  const [open, setOpen] = useState(true);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    courseEnrollmentsAPI.list(courseId)
      .then((res) => !cancelled && setRows(res.data.data))
      .catch((err) => {
        if (cancelled) return;
        setRows([]);
        toast.error(apiErrorMessage(err, "Could not load enrolled learners."));
      });
    return () => {
      cancelled = true;
    };
  }, [courseId]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (rows || []).filter((r) =>
      (status === "ALL" || r.status === status)
      && (!q || [r.name, r.email, r.username, r.phone, r.userId].some((v) => v?.toLowerCase().includes(q))));
  }, [rows, query, status]);

  const exportCsv = async () => {
    setExporting(true);
    try {
      const res = await courseEnrollmentsAPI.exportCsv(courseId);
      downloadBlob(res.data, `${courseSlug}-learners.csv`);
    } catch (err) {
      toast.error(apiErrorMessage(err, "Download failed."));
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="card" style={{ marginTop: 20 }}>
      <div className="card-header">
        <button type="button" onClick={() => setOpen((v) => !v)} style={{ border: 0, background: "none", padding: 0, cursor: "pointer", display: "flex", alignItems: "center", gap: 8 }} aria-expanded={open}>
          <span className="card-title">Enrolled Learners</span>
          <span className="badge badge-gray">{rows ? rows.length : "…"}</span>
          {open ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </button>
        <button className="btn btn-secondary btn-sm" onClick={exportCsv} disabled={exporting || !rows?.length}>
          <Download size={14} /> {exporting ? "Preparing…" : "Download CSV"}
        </button>
      </div>

      {open && (
        <div className="card-body">
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
            <label className="sheet-search" style={{ flex: 1, minWidth: 220 }}>
              <Search size={14} color="var(--gray-400)" />
              <input placeholder="Search name, email, login ID or phone…" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search enrolled learners" />
            </label>
            <select className="form-control" style={{ width: 160 }} value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Filter by status">
              <option value="ALL">All statuses</option>
              <option value="ACTIVE">Active</option>
              <option value="COMPLETED">Completed</option>
              <option value="REFUNDED">Refunded</option>
            </select>
          </div>

          {rows === null ? (
            <div className="skeleton" style={{ height: 120, borderRadius: 12 }} />
          ) : rows.length === 0 ? (
            <div style={{ fontSize: 13, color: "var(--gray-500)" }}>No learners are enrolled in this course yet.</div>
          ) : (
            <div className="sheet-viewer">
              <div className="sheet-scroll">
                <table className="sheet-table">
                  <thead>
                    <tr>
                      <th style={{ width: 40, minWidth: 40 }}>#</th>
                      <th>Learner</th>
                      <th>Login ID</th>
                      <th>Phone</th>
                      <th>Enrolled</th>
                      <th>Progress</th>
                      <th>Status</th>
                      <th>Last active</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visible.length === 0 ? (
                      <tr><td colSpan={8} style={{ textAlign: "center", color: "var(--gray-500)" }}>No learners match.</td></tr>
                    ) : (
                      visible.map((r, i) => (
                        <tr key={r.enrollmentId}>
                          <td style={{ color: "var(--gray-400)", minWidth: 40 }}>{i + 1}</td>
                          <td>
                            <Link href={`/admin/users/${r.userId}`} style={{ color: "var(--primary)", fontWeight: 500 }}>{r.name || "—"}</Link>
                            {!r.isActive && <span className="badge badge-warning" style={{ fontSize: 10, marginLeft: 6 }}>Deactivated</span>}
                          </td>
                          <td style={{ whiteSpace: "nowrap" }}>
                            {r.username || r.email || "—"}
                            {r.username && r.email && <div style={{ fontSize: 11, color: "var(--gray-500)" }}>{r.email}</div>}
                          </td>
                          <td style={{ whiteSpace: "nowrap" }}>{r.phone || "—"}</td>
                          <td style={{ whiteSpace: "nowrap" }}>{formatDate(r.enrolledAt)}</td>
                          <td style={{ whiteSpace: "nowrap" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                              <div className="progress-bar" style={{ width: 70 }}>
                                <div className="progress-fill" style={{ width: `${Math.min(100, r.progressPercent)}%` }} />
                              </div>
                              {Math.round(r.progressPercent)}%
                            </div>
                          </td>
                          <td><span className={`badge ${STATUS_BADGE[r.status] || "badge-gray"}`} style={{ fontSize: 11 }}>{r.status.toLowerCase()}</span></td>
                          <td style={{ whiteSpace: "nowrap" }}>{formatDate(r.lastAccessedAt)}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
