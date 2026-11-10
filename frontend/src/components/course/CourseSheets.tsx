"use client";

import { useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { FileSpreadsheet, Pencil, Plus, Trash2, X } from "lucide-react";
import { apiErrorMessage, sheetsAPI, type CourseSheet, type SheetColumn, type SheetRow } from "@/lib/api";

// Learner: their own copy of each course sheet (e.g. a daily diary). Only they and admins see their rows.
const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const blankRow = (columns: SheetColumn[]) =>
  Object.fromEntries(columns.map((c) => [c.key, c.type === "date" ? today() : ""])) as Record<string, string>;
const formatWhen = (iso: string) => new Date(iso).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });

function SheetEditor({ sheet }: { sheet: CourseSheet }) {
  const [rows, setRows] = useState<SheetRow[] | null>(null);
  const [draft, setDraft] = useState<Record<string, string>>(() => blankRow(sheet.columns));
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    sheetsAPI.myRows(sheet.id)
      .then((res) => !cancelled && setRows(res.data.data.rows))
      .catch((err) => {
        if (cancelled) return;
        setRows([]);
        toast.error(apiErrorMessage(err, "Could not load your sheet."));
      });
    return () => {
      cancelled = true;
    };
  }, [sheet.id]);

  // Newest entries first, as in a diary
  const ordered = useMemo(() => [...(rows || [])].reverse(), [rows]);

  const resetDraft = () => {
    setEditingId(null);
    setDraft(blankRow(sheet.columns));
  };

  const save = async () => {
    if (!Object.values(draft).some((v) => v.trim() !== "")) return toast.error("Fill in at least one field.");
    setSaving(true);
    try {
      if (editingId) {
        const res = await sheetsAPI.updateRow(sheet.id, editingId, draft);
        setRows((prev) => (prev || []).map((r) => (r.id === editingId ? res.data.data : r)));
        toast.success("Entry updated.");
      } else {
        const res = await sheetsAPI.addRow(sheet.id, draft);
        setRows((prev) => [...(prev || []), res.data.data]);
        toast.success("Entry saved.");
      }
      resetDraft();
    } catch (err) {
      toast.error(apiErrorMessage(err, "Could not save the entry."));
    } finally {
      setSaving(false);
    }
  };

  const startEdit = (row: SheetRow) => {
    setEditingId(row.id);
    setDraft(Object.fromEntries(sheet.columns.map((c) => [c.key, row.data?.[c.key] ?? ""])));
    if (typeof window !== "undefined") document.getElementById(`sheet-form-${sheet.id}`)?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  };

  const remove = async (row: SheetRow) => {
    if (!confirm("Delete this entry?")) return;
    try {
      await sheetsAPI.deleteRow(sheet.id, row.id);
      setRows((prev) => (prev || []).filter((r) => r.id !== row.id));
      if (editingId === row.id) resetDraft();
      toast.success("Entry deleted.");
    } catch (err) {
      toast.error(apiErrorMessage(err, "Could not delete the entry."));
    }
  };

  return (
    <div style={{ display: "grid", gap: 14 }}>
      {sheet.description && <div style={{ fontSize: 14, color: "var(--gray-600)", whiteSpace: "pre-wrap" }}>{sheet.description}</div>}

      <div id={`sheet-form-${sheet.id}`} className="sheet-entry-form">
        <div style={{ fontWeight: 600, color: "var(--gray-900)", display: "flex", alignItems: "center", gap: 6 }}>
          {editingId ? <><Pencil size={15} /> Edit entry</> : <><Plus size={15} /> New entry</>}
        </div>
        <div className="sheet-entry-grid">
          {sheet.columns.map((c) => (
            <label key={c.key} style={{ display: "grid", gap: 4, minWidth: 0 }}>
              <span className="form-label" style={{ margin: 0 }}>{c.label}</span>
              {c.type === "date" ? (
                <input type="date" className="form-control" value={draft[c.key] || ""} onChange={(e) => setDraft({ ...draft, [c.key]: e.target.value })} />
              ) : (
                <textarea className="form-control" rows={2} maxLength={5000} value={draft[c.key] || ""} onChange={(e) => setDraft({ ...draft, [c.key]: e.target.value })} />
              )}
            </label>
          ))}
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn btn-primary btn-sm" onClick={save} disabled={saving}>
            {saving ? "Saving…" : editingId ? "Save changes" : "Add entry"}
          </button>
          {editingId && (
            <button className="btn btn-secondary btn-sm" onClick={resetDraft} disabled={saving}>
              <X size={14} /> Cancel
            </button>
          )}
        </div>
      </div>

      {rows === null ? (
        <div className="skeleton" style={{ height: 120, borderRadius: 12 }} />
      ) : rows.length === 0 ? (
        <div style={{ fontSize: 13, color: "var(--gray-500)", textAlign: "center", padding: 16 }}>No entries yet. Your first entry will appear here.</div>
      ) : (
        <div className="sheet-viewer">
          <div className="sheet-scroll">
            <table className="sheet-table">
              <thead>
                <tr>
                  {sheet.columns.map((c) => <th key={c.key}>{c.label}</th>)}
                  <th>Saved</th>
                  <th aria-label="Actions" />
                </tr>
              </thead>
              <tbody>
                {ordered.map((r) => (
                  <tr key={r.id} style={editingId === r.id ? { outline: "2px solid var(--primary)", outlineOffset: -2 } : undefined}>
                    {sheet.columns.map((c) => <td key={c.key}>{r.data?.[c.key] || ""}</td>)}
                    <td style={{ whiteSpace: "nowrap", color: "var(--gray-500)" }}>{formatWhen(r.createdAt)}</td>
                    <td style={{ whiteSpace: "nowrap" }}>
                      <button className="btn btn-ghost btn-icon btn-sm" onClick={() => startEdit(r)} title="Edit" aria-label="Edit entry"><Pencil size={13} /></button>
                      <button className="btn btn-ghost btn-icon btn-sm" onClick={() => remove(r)} title="Delete" aria-label="Delete entry"><Trash2 size={13} color="var(--danger)" /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

export default function CourseSheets({ sheets }: { sheets: CourseSheet[] }) {
  const [activeId, setActiveId] = useState<string>(sheets[0]?.id || "");
  const active = sheets.find((s) => s.id === activeId) || sheets[0];
  if (!active) return null;

  return (
    <div style={{ paddingTop: 16, display: "grid", gap: 14 }}>
      {sheets.length > 1 && (
        <div className="tabs" role="tablist" style={{ marginBottom: 0 }}>
          {sheets.map((s) => (
            <button key={s.id} role="tab" aria-selected={s.id === active.id} className={`tab ${s.id === active.id ? "active" : ""}`} onClick={() => setActiveId(s.id)} style={{ border: 0 }}>
              <FileSpreadsheet size={14} style={{ verticalAlign: -2, marginRight: 4 }} /> {s.title}
            </button>
          ))}
        </div>
      )}
      {sheets.length === 1 && (
        <div style={{ fontWeight: 600, fontSize: 16, color: "var(--gray-900)", display: "flex", alignItems: "center", gap: 6 }}>
          <FileSpreadsheet size={18} color="var(--success)" /> {active.title}
        </div>
      )}
      <SheetEditor key={active.id} sheet={active} />
    </div>
  );
}
