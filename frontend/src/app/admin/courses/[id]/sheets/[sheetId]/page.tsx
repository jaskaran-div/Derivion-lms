"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { ArrowLeft, Download, Search } from "lucide-react";
import AppLayout from "@/components/layout/AppLayout";
import {
  XLSX_TYPE, apiErrorMessage, downloadBlob, sheetsAPI,
  type CourseSheet, type SheetLearner, type SheetRow,
} from "@/lib/api";

const formatWhen = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" }) : "—";

const filenameFrom = (disposition: string | undefined, fallback: string) =>
  disposition?.match(/filename="([^"]+)"/)?.[1] || fallback;

// Admin: one course sheet, a tab per learner showing only that learner's rows
export default function AdminCourseSheetPage() {
  const { id: courseId, sheetId } = useParams<{ id: string; sheetId: string }>();
  const router = useRouter();
  const [sheet, setSheet] = useState<(CourseSheet & { course: { id: string; title: string } }) | null>(null);
  const [learners, setLearners] = useState<SheetLearner[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [rows, setRows] = useState<SheetRow[] | null>(null);
  const [query, setQuery] = useState("");
  const [onlyWithEntries, setOnlyWithEntries] = useState(false);
  const [downloading, setDownloading] = useState<string | null>(null);

  useEffect(() => {
    sheetsAPI.get(sheetId)
      .then((res) => {
        setSheet(res.data.data.sheet);
        setLearners(res.data.data.learners);
        setSelected((prev) => prev ?? res.data.data.learners[0]?.id ?? null);
      })
      .catch((err) => {
        toast.error(apiErrorMessage(err, "Sheet not found."));
        router.push(`/admin/courses/${courseId}`);
      });
  }, [sheetId, courseId, router]);

  useEffect(() => {
    if (!selected) return;
    let cancelled = false;
    sheetsAPI.learnerRows(sheetId, selected)
      .then((res) => !cancelled && setRows(res.data.data))
      .catch(() => !cancelled && setRows([]));
    return () => {
      cancelled = true;
    };
  }, [sheetId, selected]);

  const visibleLearners = useMemo(() => {
    const q = query.trim().toLowerCase();
    return learners.filter((l) => (!onlyWithEntries || l.rowCount > 0) && (!q || l.name.toLowerCase().includes(q) || l.login.toLowerCase().includes(q)));
  }, [learners, query, onlyWithEntries]);

  const current = learners.find((l) => l.id === selected) || null;

  const download = async (userId?: string) => {
    setDownloading(userId || "all");
    try {
      const res = await sheetsAPI.export(sheetId, userId);
      downloadBlob(res.data, filenameFrom(res.headers["content-disposition"], "sheet.xlsx"), XLSX_TYPE);
    } catch (err) {
      toast.error(apiErrorMessage(err, "Download failed."));
    } finally {
      setDownloading(null);
    }
  };

  const selectLearner = (id: string) => {
    if (id === selected) return;
    setRows(null);
    setSelected(id);
  };

  return (
    <AppLayout requiredRole="ADMIN">
      <div className="page-header">
        <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
          <button className="btn btn-ghost btn-icon" onClick={() => router.push(`/admin/courses/${courseId}`)} aria-label="Back to course">
            <ArrowLeft size={20} />
          </button>
          <div style={{ minWidth: 0 }}>
            <h1 className="page-title">{sheet?.title || "Course sheet"}</h1>
            <div style={{ fontSize: 13, color: "var(--gray-500)", marginTop: 4 }}>
              {sheet ? `${sheet.course.title} · ${learners.length} learner(s) · ${learners.filter((l) => l.rowCount > 0).length} with entries` : "Loading…"}
            </div>
          </div>
        </div>
        <div className="page-actions">
          <button className="btn btn-primary" onClick={() => download()} disabled={!sheet || downloading !== null}>
            <Download size={16} /> {downloading === "all" ? "Preparing…" : "Download all (Excel)"}
          </button>
        </div>
      </div>

      <div className="sheet-admin-layout">
        {/* Learner tabs */}
        <div className="card" style={{ padding: 0, overflow: "hidden" }}>
          <div style={{ padding: 12, borderBottom: "1px solid var(--border-color)", display: "grid", gap: 8 }}>
            <label className="sheet-search">
              <Search size={14} color="var(--gray-400)" />
              <input placeholder="Search learners…" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search learners" />
            </label>
            <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--gray-600)" }}>
              <input type="checkbox" checked={onlyWithEntries} onChange={(e) => setOnlyWithEntries(e.target.checked)} />
              Only learners with entries
            </label>
          </div>
          <div className="sheet-learner-list" role="tablist" aria-label="Learners">
            {!sheet ? (
              <div className="skeleton" style={{ height: 120, margin: 12, borderRadius: 10 }} />
            ) : visibleLearners.length === 0 ? (
              <div style={{ padding: 16, fontSize: 13, color: "var(--gray-500)" }}>
                {learners.length === 0 ? "No learners are enrolled in this course yet." : "No learners match."}
              </div>
            ) : (
              visibleLearners.map((l) => (
                <button
                  key={l.id}
                  type="button"
                  role="tab"
                  aria-selected={l.id === selected}
                  className={`sheet-learner-tab ${l.id === selected ? "active" : ""}`}
                  onClick={() => selectLearner(l.id)}
                >
                  <span style={{ minWidth: 0 }}>
                    <span className="sheet-learner-name">{l.name}</span>
                    <span className="sheet-learner-meta">{l.lastEntryAt ? `Last entry ${formatWhen(l.lastEntryAt)}` : "No entries yet"}</span>
                  </span>
                  <span className={`badge ${l.rowCount ? "badge-primary" : "badge-gray"}`} style={{ fontSize: 11, flexShrink: 0 }}>{l.rowCount}</span>
                </button>
              ))
            )}
          </div>
        </div>

        {/* Selected learner's rows */}
        <div className="card" style={{ padding: 0, overflow: "hidden", minWidth: 0 }}>
          {!current || !sheet ? (
            <div className="empty-state">
              <div className="empty-state-icon">📒</div>
              <div className="empty-state-title">Select a learner</div>
              <div className="empty-state-text">Pick a learner on the left to see only their entries.</div>
            </div>
          ) : (
            <>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap", padding: "14px 16px", borderBottom: "1px solid var(--border-color)" }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 600, color: "var(--gray-900)" }}>{current.name}</div>
                  <div style={{ fontSize: 12, color: "var(--gray-500)" }}>
                    {current.login}
                    {current.enrollmentStatus && current.enrollmentStatus !== "ACTIVE" && ` · enrollment ${current.enrollmentStatus.toLowerCase()}`}
                    {!current.enrollmentStatus && " · no longer enrolled"}
                  </div>
                </div>
                <button className="btn btn-secondary btn-sm" onClick={() => download(current.id)} disabled={downloading !== null}>
                  <Download size={14} /> {downloading === current.id ? "Preparing…" : "Download Excel"}
                </button>
              </div>
              {rows === null ? (
                <div className="skeleton" style={{ height: 200, margin: 16, borderRadius: 10 }} />
              ) : rows.length === 0 ? (
                <div className="empty-state">
                  <div className="empty-state-icon">📝</div>
                  <div className="empty-state-title">No entries yet</div>
                  <div className="empty-state-text">{current.name} hasn&apos;t filled in this sheet.</div>
                </div>
              ) : (
                <div className="sheet-scroll">
                  <table className="sheet-table">
                    <thead>
                      <tr>
                        <th style={{ width: 40 }}>#</th>
                        {sheet.columns.map((c) => <th key={c.key}>{c.label}</th>)}
                        <th>Added on</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((r, i) => (
                        <tr key={r.id}>
                          <td style={{ color: "var(--gray-400)" }}>{i + 1}</td>
                          {sheet.columns.map((c) => <td key={c.key}>{r.data?.[c.key] || ""}</td>)}
                          <td style={{ whiteSpace: "nowrap", color: "var(--gray-500)" }}>
                            {formatWhen(r.createdAt)}
                            {r.updatedAt !== r.createdAt && new Date(r.updatedAt).getTime() - new Date(r.createdAt).getTime() > 60000 && (
                              <div style={{ fontSize: 11 }}>edited {formatWhen(r.updatedAt)}</div>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </AppLayout>
  );
}
