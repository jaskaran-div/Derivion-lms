"use client";

import { Fragment, useCallback, useEffect, useState } from "react";
import AppLayout from "@/components/layout/AppLayout";
import { apiErrorMessage, auditAPI, downloadBlob, displayLogin } from "@/lib/api";
import toast from "react-hot-toast";
import {
  ScrollText, Search, Filter, ChevronDown, ChevronUp,
  LogIn, LogOut, Shield, Users, BookOpen, Award,
  Building2, Upload, CreditCard, Key, MousePointerClick, Download, AlertTriangle, RefreshCw,
} from "lucide-react";

const ACTION_LABELS: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  LOGIN: { label: "Login", color: "#10b981", icon: <LogIn size={13} /> },
  LOGOUT: { label: "Logout", color: "#6b7280", icon: <LogOut size={13} /> },
  ACTIVITY: { label: "User Activity", color: "#0ea5e9", icon: <MousePointerClick size={13} /> },
  PASSWORD_CHANGE: { label: "Password Changed", color: "#f59e0b", icon: <Key size={13} /> },
  ROLE_CHANGE: { label: "Role Changed", color: "#8b5cf6", icon: <Shield size={13} /> },
  USER_CREATED: { label: "User Created", color: "#1d4ed8", icon: <Users size={13} /> },
  USER_DELETED: { label: "User Deleted", color: "#ef4444", icon: <Users size={13} /> },
  STUDENT_IMPORTED: { label: "Student Imported", color: "#06b6d4", icon: <Upload size={13} /> },
  ENROLLMENT_CREATED: { label: "Enrollment Created", color: "#10b981", icon: <BookOpen size={13} /> },
  PAYMENT_VERIFIED: { label: "Payment Verified", color: "#10b981", icon: <CreditCard size={13} /> },
  CERTIFICATE_ISSUED: { label: "Certificate Issued", color: "#f59e0b", icon: <Award size={13} /> },
  SCHOOL_CREATED: { label: "School Created", color: "#1d4ed8", icon: <Building2 size={13} /> },
  CLASS_ASSIGNED: { label: "Class Assigned", color: "#8b5cf6", icon: <Building2 size={13} /> },
  BULK_IMPORT: { label: "Bulk Import", color: "#06b6d4", icon: <Upload size={13} /> },
  ADMIN_ACTION: { label: "Admin Action", color: "#ef4444", icon: <Shield size={13} /> },
};

const ALL_ACTIONS = Object.keys(ACTION_LABELS);

// What a user did, for ACTIVITY entries (details.event)
const EVENT_LABELS: Record<string, string> = {
  PAGE_VIEW: "Visited page",
  CLICK: "Clicked",
  DOWNLOAD: "Downloaded",
  LESSON_OPENED: "Opened lesson",
  LESSON_COMPLETED: "Completed lesson",
  LESSON_UNMARKED: "Unmarked lesson",
  QUIZ_STARTED: "Started quiz",
  QUIZ_SUBMITTED: "Submitted quiz",
  FORUM_POST: "Posted in forum",
  FORUM_REPLY: "Replied in forum",
  EMAIL_VERIFIED: "Verified email",
};

type Details = Record<string, unknown> & { event?: string };

interface AuditLogRow {
  id: string;
  action: string;
  targetId?: string | null;
  targetType?: string | null;
  details?: Details | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  createdAt: string;
  user?: { firstName: string; lastName: string; role: string; email?: string; username?: string | null } | null;
}

// One readable line for an entry: "Opened lesson: Intro to Options", "Login failed — wrong password"…
const summarize = (log: AuditLogRow) => {
  const d = log.details || {};
  if (log.action === "LOGIN") return d.success === false ? `Failed — ${String(d.reason || "unknown reason")}` : "Signed in";
  if (log.action === "ACTIVITY") {
    const label = EVENT_LABELS[d.event || ""] || d.event || "Activity";
    const what = d.lesson || d.quiz || d.title || d.label || d.path;
    const extra = d.event === "QUIZ_SUBMITTED" && d.score !== undefined ? ` (${Math.round(Number(d.score))}%, ${d.passed ? "passed" : "not passed"})` : "";
    return `${label}${what ? `: ${String(what)}` : ""}${extra}`;
  }
  const action = d.action ? String(d.action).replace(/_/g, " ").toLowerCase() : "";
  return action ? action.charAt(0).toUpperCase() + action.slice(1) : "";
};

// "Chrome on Windows" from a user-agent string
const device = (ua?: string | null) => {
  if (!ua) return "—";
  const browser = /Edg\//.test(ua) ? "Edge" : /OPR\//.test(ua) ? "Opera" : /Chrome\//.test(ua) ? "Chrome" : /Firefox\//.test(ua) ? "Firefox" : /Safari\//.test(ua) ? "Safari" : "Browser";
  const os = /Android/.test(ua) ? "Android" : /iPhone|iPad/.test(ua) ? "iOS" : /Windows/.test(ua) ? "Windows" : /Mac OS X/.test(ua) ? "macOS" : /Linux/.test(ua) ? "Linux" : "";
  return os ? `${browser} on ${os}` : browser;
};

export default function AuditLogsPage() {
  const [logs, setLogs] = useState<AuditLogRow[]>([]);
  const [total, setTotal] = useState(0);
  const [retention, setRetention] = useState<{ days: number; warningDays: number; expiringSoon: number } | null>(null);
  const [page, setPage] = useState(1);
  // The query whose results are on screen; anything else means the table is still loading
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [actionFilter, setActionFilter] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [expandedLog, setExpandedLog] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  const LIMIT = 50;

  // Search runs on the server, a moment after typing stops
  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedSearch(search.trim());
      setPage(1);
    }, 350);
    return () => clearTimeout(t);
  }, [search]);

  const filters = useCallback(
    () => ({
      action: actionFilter || undefined,
      role: roleFilter || undefined,
      search: debouncedSearch || undefined,
      startDate: startDate || undefined,
      endDate: endDate || undefined,
    }),
    [actionFilter, roleFilter, debouncedSearch, startDate, endDate]
  );

  const queryKey = JSON.stringify({ page, ...filters() });
  const loading = loadedKey !== queryKey;

  const loadLogs = useCallback(() => {
    const key = JSON.stringify({ page, ...filters() });
    return auditAPI
      .list({ page, limit: LIMIT, ...filters() })
      .then((res) => {
        setLogs(res.data.data.logs);
        setTotal(res.data.data.pagination.total);
        setRetention(res.data.data.retention);
      })
      .catch((err) => toast.error(apiErrorMessage(err, "Failed to load audit logs.")))
      .finally(() => setLoadedKey(key));
  }, [page, filters]);

  useEffect(() => {
    loadLogs();
  }, [loadLogs]);

  const handleExport = async () => {
    setExporting(true);
    try {
      const res = await auditAPI.export(filters());
      downloadBlob(res.data, `audit-logs_${new Date().toISOString().split("T")[0]}.csv`);
      toast.success("Audit logs exported.");
    } catch (err) {
      toast.error(apiErrorMessage(err, "Export failed."));
    } finally {
      setExporting(false);
    }
  };

  const setFilter = (fn: () => void) => {
    fn();
    setPage(1);
  };

  const totalPages = Math.ceil(total / LIMIT);

  const formatDate = (d: string) =>
    new Date(d).toLocaleString("en-IN", {
      day: "2-digit", month: "short", year: "numeric",
      hour: "2-digit", minute: "2-digit", second: "2-digit",
    });

  const getActionMeta = (action: string) =>
    ACTION_LABELS[action] || { label: action, color: "#6b7280", icon: <Shield size={13} /> };

  return (
    <AppLayout requiredRole="ADMIN">
      <div className="audit-page">
        {/* Header */}
        <div className="audit-header">
          <div className="audit-title-area">
            <div className="audit-icon">
              <ScrollText size={24} />
            </div>
            <div>
              <h1 className="audit-title">Audit Logs</h1>
              <p className="audit-subtitle">
                Sign-ins, admin actions and what users did after signing in — {total.toLocaleString()} matching events
              </p>
            </div>
          </div>
          <div className="audit-header-actions">
            <button className="page-btn" onClick={() => loadLogs()} title="Refresh">
              <RefreshCw size={14} /> Refresh
            </button>
            <button className="btn-export-audit" onClick={handleExport} disabled={exporting}>
              <Download size={14} /> {exporting ? "Exporting…" : "Export CSV"}
            </button>
          </div>
        </div>

        {retention && (
          retention.expiringSoon > 0 ? (
            <div className="audit-retention audit-retention--warn" role="status">
              <AlertTriangle size={17} />
              <div>
                <strong>{retention.expiringSoon.toLocaleString()} entries will be deleted within {retention.warningDays} days.</strong>{" "}
                Logs are kept for {retention.days} days. Export them now if you need a copy.
              </div>
              <button className="btn-export-audit" onClick={handleExport} disabled={exporting}>
                <Download size={14} /> Export
              </button>
            </div>
          ) : (
            <div className="audit-retention">
              Logs are kept for {retention.days} days and then deleted automatically. You&apos;ll get a notification {retention.warningDays} days before entries are removed.
            </div>
          )
        )}

        {/* Filters */}
        <div className="audit-filters">
          <div className="audit-search-wrap">
            <Search size={16} className="audit-search-icon" />
            <input
              className="audit-search"
              placeholder="Search by name, email or login ID…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="audit-filter-wrap">
            <Filter size={15} className="filter-icon" />
            <select
              className="audit-select"
              value={actionFilter}
              onChange={(e) => setFilter(() => setActionFilter(e.target.value))}
              aria-label="Action"
            >
              <option value="">All Actions</option>
              {ALL_ACTIONS.map((a) => (
                <option key={a} value={a}>{ACTION_LABELS[a].label}</option>
              ))}
            </select>
          </div>
          <select className="audit-select audit-select--plain" value={roleFilter} onChange={(e) => setFilter(() => setRoleFilter(e.target.value))} aria-label="Role">
            <option value="">All Roles</option>
            <option value="STUDENT">Learners</option>
            <option value="TEACHER">Teachers</option>
            <option value="ADMIN">Admins</option>
          </select>
          <label className="audit-date">
            From
            <input type="date" value={startDate} max={endDate || undefined} onChange={(e) => setFilter(() => setStartDate(e.target.value))} />
          </label>
          <label className="audit-date">
            To
            <input type="date" value={endDate} min={startDate || undefined} onChange={(e) => setFilter(() => setEndDate(e.target.value))} />
          </label>
        </div>

        {/* Table */}
        <div className="audit-card">
          {loading ? (
            <div className="audit-loading">
              {[1,2,3,4,5].map((i) => <div key={i} className="log-skeleton" />)}
            </div>
          ) : logs.length === 0 ? (
            <div className="audit-empty">
              <ScrollText size={40} className="empty-icon" />
              <p>No audit logs found for the selected filters.</p>
            </div>
          ) : (
            <div className="audit-table-wrap">
              <table className="audit-table">
                <thead>
                  <tr>
                    <th>Timestamp</th>
                    <th>User</th>
                    <th>Action</th>
                    <th>What happened</th>
                    <th>IP / Device</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map((log) => {
                    const meta = getActionMeta(log.action);
                    const isExpanded = expandedLog === log.id;
                    return (
                      <Fragment key={log.id}>
                        <tr className="audit-row" onClick={() => setExpandedLog(isExpanded ? null : log.id)}>
                          <td className="audit-time">{formatDate(log.createdAt)}</td>
                          <td>
                            {log.user ? (
                              <div className="audit-user">
                                <div className="audit-avatar">
                                  {log.user.firstName?.[0]}{log.user.lastName?.[0]}
                                </div>
                                <div>
                                  <div className="audit-user-name">
                                    {log.user.firstName} {log.user.lastName}
                                  </div>
                                  <div className="audit-user-role">{log.user.role === "STUDENT" ? "LEARNER" : log.user.role} · {displayLogin(log.user)}</div>
                                </div>
                              </div>
                            ) : (
                              <span className="audit-system">System / unknown</span>
                            )}
                          </td>
                          <td>
                            <span className="audit-action-badge" style={{ color: meta.color, background: `${meta.color}18`, borderColor: `${meta.color}30` }}>
                              {meta.icon}
                              {meta.label}
                            </span>
                          </td>
                          <td className="audit-summary">
                            {summarize(log) || (log.targetType ? <span className="audit-target-type">{log.targetType}</span> : "—")}
                          </td>
                          <td className="audit-ip">
                            <div>{log.ipAddress || "—"}</div>
                            <div className="audit-device">{device(log.userAgent)}</div>
                          </td>
                          <td>
                            <button className="audit-expand-btn" aria-label={isExpanded ? "Hide details" : "Show details"}>
                              {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                            </button>
                          </td>
                        </tr>
                        {isExpanded && (
                          <tr className="audit-details-row">
                            <td colSpan={6}>
                              <pre className="audit-details-json">
                                {JSON.stringify(
                                  {
                                    ...(log.targetType && { target: `${log.targetType} ${log.targetId || ""}`.trim() }),
                                    ...(log.details || {}),
                                    ...(log.userAgent && { userAgent: log.userAgent }),
                                  },
                                  null,
                                  2
                                )}
                              </pre>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="audit-pagination">
              <button
                className="page-btn"
                disabled={page === 1}
                onClick={() => setPage((p) => p - 1)}
              >
                ← Previous
              </button>
              <span className="page-info">Page {page} of {totalPages}</span>
              <button
                className="page-btn"
                disabled={page === totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                Next →
              </button>
            </div>
          )}
        </div>

        <style jsx>{`
          .audit-page { padding: 0; }
          .audit-header {
            display: flex; align-items: center; justify-content: space-between;
            margin-bottom: 1.5rem; gap: 1rem;
          }
          .audit-title-area { display: flex; align-items: center; gap: 1rem; }
          .audit-icon {
            width: 48px; height: 48px; border-radius: 13px;
            background: linear-gradient(135deg, #1e293b, #334155);
            display: flex; align-items: center; justify-content: center; color: #94a3b8;
            border: 1px solid #334155;
          }
          .audit-title { font-size: 1.5rem; font-weight: 700; color: var(--text-primary); margin: 0; }
          .audit-subtitle { color: var(--text-secondary); font-size: 0.875rem; margin: 0; }

          .audit-filters {
            display: flex; gap: 0.75rem; margin-bottom: 1rem; flex-wrap: wrap;
          }
          .audit-search-wrap {
            position: relative; flex: 1; min-width: 200px;
          }
          .audit-search-icon {
            position: absolute; left: 0.85rem; top: 50%; transform: translateY(-50%);
            color: var(--text-secondary);
          }
          .audit-search {
            width: 100%; padding: 0.6rem 0.85rem 0.6rem 2.5rem;
            background: var(--card-bg); border: 1px solid var(--border);
            border-radius: 9px; color: var(--text-primary); font-size: 0.875rem; outline: none;
          }
          .audit-search:focus { border-color: #1d4ed8; }
          .audit-filter-wrap { position: relative; }
          .filter-icon {
            position: absolute; left: 0.85rem; top: 50%; transform: translateY(-50%);
            color: var(--text-secondary); pointer-events: none;
          }
          .audit-select {
            padding: 0.6rem 1rem 0.6rem 2.3rem; background: var(--card-bg);
            border: 1px solid var(--border); border-radius: 9px;
            color: var(--text-primary); font-size: 0.875rem; outline: none;
            cursor: pointer; appearance: none; min-width: 160px;
          }

          .audit-card {
            background: var(--card-bg); border: 1px solid var(--border); border-radius: 14px; overflow: hidden;
          }
          .audit-loading { padding: 1rem; display: flex; flex-direction: column; gap: 0.5rem; }
          .log-skeleton {
            height: 52px; border-radius: 8px; background: var(--hover);
            background: linear-gradient(90deg, var(--card-bg) 25%, var(--border) 50%, var(--card-bg) 75%);
            background-size: 200% 100%; animation: shimmer 1.5s infinite;
          }
          @keyframes shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }
          .audit-empty {
            text-align: center; padding: 3rem; color: var(--text-secondary);
          }
          .empty-icon { margin-bottom: 0.75rem; opacity: 0.3; }

          .audit-table-wrap { overflow-x: auto; }
          .audit-table {
            width: 100%; border-collapse: collapse; font-size: 0.845rem;
          }
          .audit-table th {
            text-align: left; padding: 0.7rem 1rem;
            background: var(--hover); font-weight: 600;
            color: var(--text-secondary); font-size: 0.75rem; text-transform: uppercase;
            border-bottom: 1px solid var(--border); white-space: nowrap;
          }
          .audit-table td { padding: 0.65rem 1rem; border-bottom: 1px solid var(--border); vertical-align: middle; }
          .audit-row { cursor: pointer; transition: background 0.12s; }
          .audit-row:hover { background: var(--hover); }

          .audit-time { font-size: 0.78rem; color: var(--text-secondary); white-space: nowrap; }
          .audit-user { display: flex; align-items: center; gap: 0.6rem; }
          .audit-avatar {
            width: 30px; height: 30px; border-radius: 50%;
            background: linear-gradient(135deg, #1d4ed8, #8b5cf6);
            color: white; display: flex; align-items: center; justify-content: center;
            font-size: 0.65rem; font-weight: 700; flex-shrink: 0;
          }
          .audit-user-name { font-weight: 600; color: var(--text-primary); font-size: 0.84rem; }
          .audit-user-role { font-size: 0.72rem; color: var(--text-secondary); }
          .audit-system { color: var(--text-secondary); font-style: italic; font-size: 0.82rem; }
          .audit-action-badge {
            display: inline-flex; align-items: center; gap: 0.35rem;
            padding: 0.22rem 0.6rem; border-radius: 20px; font-size: 0.77rem; font-weight: 600;
            border: 1px solid transparent; white-space: nowrap;
          }
          .audit-target { display: flex; flex-direction: column; gap: 0.2rem; }
          .audit-target-type {
            font-size: 0.72rem; font-weight: 700; color: var(--text-secondary);
            text-transform: uppercase; letter-spacing: 0.04em;
          }
          .audit-target-id { font-size: 0.75rem; font-family: monospace; color: var(--text-secondary); }
          .audit-ip { font-size: 0.78rem; font-family: monospace; color: var(--text-secondary); }
          .audit-expand-btn {
            background: none; border: 1px solid var(--border); border-radius: 5px;
            padding: 0.2rem 0.4rem; cursor: pointer; color: var(--text-secondary);
            display: flex; align-items: center;
          }
          .audit-expand-btn:hover { background: var(--hover); }
          .audit-details-row td { padding: 0; background: var(--hover); }
          .audit-details-json {
            margin: 0; padding: 0.85rem 1rem;
            font-size: 0.78rem; font-family: monospace;
            color: var(--text-secondary); overflow-x: auto;
            border-top: 1px solid var(--border);
          }

          .audit-pagination {
            display: flex; align-items: center; justify-content: center; gap: 1rem;
            padding: 1rem; border-top: 1px solid var(--border);
          }
          .page-btn {
            padding: 0.5rem 1rem; border: 1px solid var(--border);
            background: none; border-radius: 8px; cursor: pointer;
            color: var(--text-primary); font-size: 0.875rem;
            transition: all 0.15s;
          }
          .page-btn:hover:not(:disabled) { background: var(--hover); }
          .page-btn:disabled { opacity: 0.4; cursor: not-allowed; }
          .page-info { font-size: 0.875rem; color: var(--text-secondary); }
        
          .audit-header-actions { display: flex; gap: 0.5rem; align-items: center; }
          .btn-export-audit {
            display: inline-flex; align-items: center; gap: 0.4rem; padding: 0.5rem 1rem;
            background: #0f1115; color: #fff; border: none; border-radius: 8px; cursor: pointer;
            font-size: 0.85rem; font-weight: 600; white-space: nowrap;
          }
          .btn-export-audit:disabled { opacity: 0.5; cursor: not-allowed; }
          .page-btn { display: inline-flex; align-items: center; gap: 0.35rem; }
          .audit-retention {
            display: flex; align-items: center; gap: 0.75rem; padding: 0.7rem 1rem; margin-bottom: 1rem;
            border-radius: 10px; font-size: 0.85rem; color: var(--text-secondary);
            background: var(--hover); border: 1px solid var(--border);
          }
          .audit-retention--warn { background: #fffbeb; border-color: #fcd34d; color: #92400e; }
          .audit-retention--warn > div { flex: 1; }
          .audit-select--plain { padding-left: 0.85rem; min-width: 130px; }
          .audit-date {
            display: inline-flex; align-items: center; gap: 0.4rem; font-size: 0.8rem; color: var(--text-secondary);
          }
          .audit-date input {
            padding: 0.5rem 0.6rem; background: var(--card-bg); border: 1px solid var(--border);
            border-radius: 9px; color: var(--text-primary); font-size: 0.85rem;
          }
          .audit-summary { max-width: 360px; color: var(--text-primary); font-size: 0.83rem; word-break: break-word; }
          .audit-device { font-family: inherit; font-size: 0.72rem; margin-top: 2px; }
          @media (max-width: 720px) {
            .audit-header { flex-direction: column; align-items: flex-start; }
          }
        `}</style>
      </div>
    </AppLayout>
  );
}
