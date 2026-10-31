"use client";

import { useCallback, useEffect, useState } from "react";
import AppLayout from "@/components/layout/AppLayout";
import { apiErrorMessage, emailsAPI } from "@/lib/api";
import toast from "react-hot-toast";
import { Mail, RefreshCw, RotateCcw, ChevronLeft, ChevronRight } from "lucide-react";

type Tab = "emails" | "sync";

interface EmailRow {
  id: string; template: string; toEmail: string; subject?: string | null; status: "PENDING" | "SENDING" | "SENT" | "FAILED";
  attempts: number; lastError?: string | null; sentAt?: string | null; nextAttemptAt: string; createdAt: string;
}
interface SyncRow {
  id: string; eventId: string; type: string; status: "PENDING" | "PROCESSING" | "SENT" | "DEAD"; attempts: number;
  lastError?: string | null; nextAttemptAt: string; sentAt?: string | null; createdAt: string;
}
interface Page { page: number; pages: number; total: number }

const COLORS: Record<string, [string, string]> = {
  SENT: ["#ecfdf5", "#065f46"], FAILED: ["#fef2f2", "#991b1b"], DEAD: ["#fef2f2", "#991b1b"],
  PENDING: ["#fff7ed", "#9a3412"], SENDING: ["#eef2ff", "#3730a3"], PROCESSING: ["#eef2ff", "#3730a3"],
};

const Badge = ({ value }: { value: string }) => {
  const [bg, fg] = COLORS[value] || ["#f3f4f6", "#374151"];
  return <span style={{ background: bg, color: fg, padding: "3px 10px", borderRadius: 999, fontSize: 12, fontWeight: 600 }}>{value}</span>;
};

const when = (v?: string | null) => (v ? new Date(v).toLocaleString() : "—");

export default function EmailsAndSyncPage() {
  const [tab, setTab] = useState<Tab>("emails");
  const [status, setStatus] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [emails, setEmails] = useState<EmailRow[]>([]);
  const [events, setEvents] = useState<SyncRow[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [pagination, setPagination] = useState<Page>({ page: 1, pages: 1, total: 0 });
  // The query whose results are on screen; anything else means the table is still loading
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const key = `${tab}|${status}|${search}|${page}`;
  const loading = loadedKey !== key;

  const load = useCallback(() => {
    const params = { status: status || undefined, search: search.trim() || undefined, page, limit: 20 };
    const request = tab === "emails" ? emailsAPI.listEmails(params) : emailsAPI.listOutbox(params);
    return request
      .then((res) => {
        const data = res.data.data;
        if (tab === "emails") setEmails(data.emails);
        else setEvents(data.events);
        setCounts(data.counts);
        setPagination(data.pagination);
      })
      .catch((error) => toast.error(apiErrorMessage(error, "Failed to load.")))
      .finally(() => setLoadedKey(key));
  }, [tab, status, search, page, key]);

  useEffect(() => {
    load();
  }, [load]);

  const retry = async (id: string) => {
    try {
      setBusy(id);
      const res = tab === "emails" ? await emailsAPI.retryEmail(id) : await emailsAPI.retryOutbox(id);
      toast.success(res.data.message || "Queued again.");
      await load();
    } catch (error) {
      toast.error(apiErrorMessage(error, "Could not retry."));
    } finally {
      setBusy(null);
    }
  };

  const switchTab = (t: Tab) => { setTab(t); setStatus(""); setSearch(""); setPage(1); };
  const statuses = tab === "emails" ? ["PENDING", "SENDING", "SENT", "FAILED"] : ["PENDING", "PROCESSING", "SENT", "DEAD"];

  return (
    <AppLayout requiredRole="ADMIN">
      <div style={{ maxWidth: 1200, margin: "0 auto", padding: "24px 16px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12, marginBottom: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <Mail size={24} />
            <div>
              <h1 style={{ margin: 0, fontSize: 22 }}>Emails &amp; Operations sync</h1>
              <p style={{ margin: "4px 0 0", color: "#6b7280", fontSize: 14 }}>Delivery status of purchase and onboarding emails, and events sent to Operations.</p>
            </div>
          </div>
          <button onClick={load} className="page-btn" title="Refresh"><RefreshCw size={16} /></button>
        </div>

        <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
          {(["emails", "sync"] as Tab[]).map((t) => (
            <button key={t} onClick={() => switchTab(t)} style={{ padding: "8px 16px", borderRadius: 999, border: "1px solid #d1d5db", background: tab === t ? "#0f1115" : "#fff", color: tab === t ? "#fff" : "#111", cursor: "pointer", fontWeight: 600 }}>
              {t === "emails" ? "Emails" : "Sync events"}
            </button>
          ))}
        </div>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 12, alignItems: "center" }}>
          {statuses.map((s) => (
            <button key={s} onClick={() => { setStatus(status === s ? "" : s); setPage(1); }} style={{ padding: "6px 12px", borderRadius: 8, border: "1px solid #e5e7eb", background: status === s ? "#eef2ff" : "#fff", cursor: "pointer" }}>
              {s} <strong>{counts[s] || 0}</strong>
            </button>
          ))}
          {tab === "emails" && (
            <input value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} placeholder="Search recipient…" style={{ padding: "8px 12px", border: "1px solid #d1d5db", borderRadius: 8, minWidth: 220 }} />
          )}
        </div>

        <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 12, overflowX: "auto" }}>
          {loading ? (
            <div style={{ padding: 40, textAlign: "center", color: "#6b7280" }}>Loading…</div>
          ) : (tab === "emails" ? emails.length === 0 : events.length === 0) ? (
            <div style={{ padding: 40, textAlign: "center", color: "#6b7280" }}>Nothing to show.</div>
          ) : tab === "emails" ? (
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
              <thead><tr style={{ textAlign: "left", background: "#f9fafb" }}>
                {["Created", "To", "Template", "Status", "Tries", "Detail", ""].map((h) => <th key={h} style={{ padding: "10px 12px" }}>{h}</th>)}
              </tr></thead>
              <tbody>
                {emails.map((e) => (
                  <tr key={e.id} style={{ borderTop: "1px solid #f0f1f4" }}>
                    <td style={{ padding: "10px 12px", whiteSpace: "nowrap" }}>{when(e.createdAt)}</td>
                    <td style={{ padding: "10px 12px" }}>{e.toEmail}</td>
                    <td style={{ padding: "10px 12px" }}>{e.template}</td>
                    <td style={{ padding: "10px 12px" }}><Badge value={e.status} /></td>
                    <td style={{ padding: "10px 12px" }}>{e.attempts}</td>
                    <td style={{ padding: "10px 12px", fontSize: 12.5, color: e.lastError ? "#991b1b" : "#6b7280", maxWidth: 320 }}>
                      {e.status === "SENT" ? `Sent ${when(e.sentAt)}` : e.status === "PENDING" ? `Next attempt ${when(e.nextAttemptAt)}${e.lastError ? ` · ${e.lastError}` : ""}` : e.lastError || "—"}
                    </td>
                    <td style={{ padding: "10px 12px", textAlign: "right" }}>
                      {e.status === "FAILED" && (
                        <button disabled={busy === e.id} onClick={() => retry(e.id)} className="page-btn" style={{ gap: 6, display: "inline-flex" }}><RotateCcw size={14} /> Retry</button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
              <thead><tr style={{ textAlign: "left", background: "#f9fafb" }}>
                {["Created", "Event", "Status", "Tries", "Detail", ""].map((h) => <th key={h} style={{ padding: "10px 12px" }}>{h}</th>)}
              </tr></thead>
              <tbody>
                {events.map((e) => (
                  <tr key={e.id} style={{ borderTop: "1px solid #f0f1f4" }}>
                    <td style={{ padding: "10px 12px", whiteSpace: "nowrap" }}>{when(e.createdAt)}</td>
                    <td style={{ padding: "10px 12px" }}>{e.type}</td>
                    <td style={{ padding: "10px 12px" }}><Badge value={e.status} /></td>
                    <td style={{ padding: "10px 12px" }}>{e.attempts}</td>
                    <td style={{ padding: "10px 12px", fontSize: 12.5, color: e.lastError ? "#991b1b" : "#6b7280", maxWidth: 360 }}>
                      {e.status === "SENT" ? `Delivered ${when(e.sentAt)}` : e.status === "PENDING" ? `Next attempt ${when(e.nextAttemptAt)}${e.lastError ? ` · ${e.lastError}` : ""}` : e.lastError || "—"}
                    </td>
                    <td style={{ padding: "10px 12px", textAlign: "right" }}>
                      {e.status === "DEAD" && (
                        <button disabled={busy === e.id} onClick={() => retry(e.id)} className="page-btn" style={{ gap: 6, display: "inline-flex" }}><RotateCcw size={14} /> Retry</button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {pagination.pages > 1 && (
          <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 12, marginTop: 14 }}>
            <button className="page-btn" disabled={page <= 1} onClick={() => setPage(page - 1)}><ChevronLeft size={16} /></button>
            <span>Page {pagination.page} of {pagination.pages}</span>
            <button className="page-btn" disabled={page >= pagination.pages} onClick={() => setPage(page + 1)}><ChevronRight size={16} /></button>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
