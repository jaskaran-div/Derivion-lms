"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import toast from "react-hot-toast";
import { Eye, EyeOff, FileSpreadsheet, Pencil, Plus, Trash2, Upload, Users } from "lucide-react";
import { apiErrorMessage, sheetsAPI, type CourseSheet } from "@/lib/api";

// Admin: sheet templates on a course. Each enrolled learner fills their own copy;
// the header row of the uploaded Excel/CSV file becomes the columns.
export default function CourseSheetsAdmin({ courseId }: { courseId: string }) {
  const [sheets, setSheets] = useState<CourseSheet[] | null>(null);
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [typedColumns, setTypedColumns] = useState("");
  const [saving, setSaving] = useState(false);
  const replaceInput = useRef<HTMLInputElement>(null);
  const [replacing, setReplacing] = useState<CourseSheet | null>(null);

  const load = useCallback(() => {
    sheetsAPI.list(courseId)
      .then((res) => setSheets(res.data.data))
      .catch(() => setSheets([]));
  }, [courseId]);

  useEffect(() => {
    load();
  }, [load]);

  const resetForm = () => {
    setAdding(false);
    setTitle("");
    setDescription("");
    setFile(null);
    setTypedColumns("");
  };

  const create = async () => {
    if (!file && !typedColumns.trim()) return toast.error("Upload a template file or type the column names.");
    setSaving(true);
    try {
      await sheetsAPI.create(courseId, {
        title: title.trim() || undefined,
        description: description.trim() || undefined,
        columns: file ? undefined : typedColumns,
      }, file);
      toast.success("Sheet added. Enrolled learners can start filling it.");
      resetForm();
      load();
    } catch (err) {
      toast.error(apiErrorMessage(err, "Failed to add the sheet."));
    } finally {
      setSaving(false);
    }
  };

  const update = async (sheet: CourseSheet, fields: Parameters<typeof sheetsAPI.update>[1], newFile?: File, okMessage = "Sheet updated.") => {
    try {
      await sheetsAPI.update(sheet.id, fields, newFile);
      toast.success(okMessage);
      load();
    } catch (err) {
      toast.error(apiErrorMessage(err, "Failed to update the sheet."));
    }
  };

  const rename = (sheet: CourseSheet) => {
    const next = window.prompt("Sheet name", sheet.title);
    if (next && next.trim() && next.trim() !== sheet.title) update(sheet, { title: next.trim() }, undefined, "Sheet renamed.");
  };

  const remove = async (sheet: CourseSheet) => {
    const warning = sheet.rowCount
      ? `Delete "${sheet.title}"? This also deletes ${sheet.rowCount} row(s) learners have filled in. This cannot be undone.`
      : `Delete "${sheet.title}"?`;
    if (!confirm(warning)) return;
    try {
      await sheetsAPI.remove(sheet.id);
      toast.success("Sheet deleted.");
      load();
    } catch (err) {
      toast.error(apiErrorMessage(err, "Failed to delete the sheet."));
    }
  };

  return (
    <div className="card" style={{ marginTop: 20 }}>
      <div className="card-header">
        <span className="card-title">Course Sheets</span>
        {!adding && (
          <button className="btn btn-primary btn-sm" onClick={() => setAdding(true)}>
            <Plus size={14} /> Add Sheet
          </button>
        )}
      </div>
      <div className="card-body">
        <p className="form-hint" style={{ marginTop: 0, marginBottom: 14 }}>
          Upload a sheet template (for example a daily diary). Every enrolled learner gets their own copy in the course and fills in rows; you can see each learner&apos;s entries and download them as Excel.
        </p>

        {adding && (
          <div style={{ padding: 16, border: "1px solid var(--border-color)", borderRadius: "var(--radius-lg)", background: "var(--gray-50)", marginBottom: 16, display: "grid", gap: 12 }}>
            <div>
              <label className="form-label">Template file (.xlsx or .csv)</label>
              <input type="file" accept=".xlsx,.csv" className="form-control" onChange={(e) => setFile(e.target.files?.[0] || null)} />
              <div className="form-hint">The first row with text becomes the column names, e.g. Date | Market view | Trade taken | Notes.</div>
            </div>
            {!file && (
              <div>
                <label className="form-label">…or type the column names</label>
                <input className="form-control" placeholder="Date, Market view, Trade taken, Notes" value={typedColumns} onChange={(e) => setTypedColumns(e.target.value)} />
                <div className="form-hint">Separate columns with commas. A column named “Date” gets a date picker.</div>
              </div>
            )}
            <div>
              <label className="form-label">Sheet name</label>
              <input className="form-control" placeholder={file ? file.name.replace(/\.(xlsx|csv)$/i, "") : "Daily Diary"} value={title} onChange={(e) => setTitle(e.target.value)} maxLength={150} />
            </div>
            <div>
              <label className="form-label">Instructions for learners (optional)</label>
              <textarea className="form-control" rows={2} placeholder="Fill one row at the end of every trading day." value={description} onChange={(e) => setDescription(e.target.value)} maxLength={2000} />
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button className="btn btn-primary btn-sm" onClick={create} disabled={saving}>{saving ? "Adding…" : "Add sheet"}</button>
              <button className="btn btn-secondary btn-sm" onClick={resetForm} disabled={saving}>Cancel</button>
            </div>
          </div>
        )}

        {sheets === null ? (
          <div className="skeleton" style={{ height: 64, borderRadius: 12 }} />
        ) : sheets.length === 0 ? (
          !adding && <div style={{ fontSize: 13, color: "var(--gray-500)" }}>No sheets on this course yet.</div>
        ) : (
          <div style={{ display: "grid", gap: 10 }}>
            {sheets.map((sheet) => (
              <div key={sheet.id} style={{ display: "flex", alignItems: "flex-start", gap: 12, padding: 14, border: "1px solid var(--border-color)", borderRadius: "var(--radius-lg)", flexWrap: "wrap" }}>
                <FileSpreadsheet size={22} color="var(--success)" style={{ flexShrink: 0, marginTop: 2 }} />
                <div style={{ flex: 1, minWidth: 220 }}>
                  <div style={{ fontWeight: 600, color: "var(--gray-900)", display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                    {sheet.title}
                    {!sheet.isPublished && <span className="badge badge-warning" style={{ fontSize: 10 }}>Hidden from learners</span>}
                  </div>
                  <div style={{ fontSize: 12, color: "var(--gray-500)", marginTop: 2 }}>
                    {sheet.learnerCount || 0} learner(s) filling · {sheet.rowCount || 0} row(s)
                  </div>
                  <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginTop: 8 }}>
                    {sheet.columns.map((c) => <span key={c.key} className="badge badge-gray" style={{ fontSize: 11 }}>{c.label}</span>)}
                  </div>
                </div>
                <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                  <Link href={`/admin/courses/${courseId}/sheets/${sheet.id}`} className="btn btn-primary btn-sm">
                    <Users size={13} /> Learner entries
                  </Link>
                  <button className="btn btn-secondary btn-sm" onClick={() => { setReplacing(sheet); replaceInput.current?.click(); }} title="Upload a new template. Columns with the same name keep learners' data.">
                    <Upload size={13} /> Replace template
                  </button>
                  <button className="btn btn-ghost btn-icon btn-sm" onClick={() => rename(sheet)} title="Rename" aria-label={`Rename ${sheet.title}`}>
                    <Pencil size={13} />
                  </button>
                  <button
                    className="btn btn-ghost btn-icon btn-sm"
                    onClick={() => update(sheet, { isPublished: !sheet.isPublished }, undefined, sheet.isPublished ? "Sheet hidden from learners." : "Sheet visible to learners.")}
                    title={sheet.isPublished ? "Hide from learners" : "Show to learners"}
                    aria-label={sheet.isPublished ? `Hide ${sheet.title}` : `Show ${sheet.title}`}
                  >
                    {sheet.isPublished ? <Eye size={13} color="var(--success)" /> : <EyeOff size={13} />}
                  </button>
                  <button className="btn btn-ghost btn-icon btn-sm" onClick={() => remove(sheet)} title="Delete" aria-label={`Delete ${sheet.title}`}>
                    <Trash2 size={13} color="var(--danger)" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
        <input
          ref={replaceInput}
          type="file"
          accept=".xlsx,.csv"
          style={{ display: "none" }}
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (f && replacing) update(replacing, {}, f, "Template replaced. Columns with the same name kept their data.");
            setReplacing(null);
          }}
        />
      </div>
    </div>
  );
}
