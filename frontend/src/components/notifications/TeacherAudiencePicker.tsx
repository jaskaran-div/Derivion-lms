"use client";

import { useEffect, useState } from "react";
import { Check, Search, Users, UserCheck, X } from "lucide-react";
import { teacherAPI } from "@/lib/api";

export interface PickedStudent {
  id: string;
  firstName: string;
  lastName: string;
  username?: string | null;
}

/**
 * Teacher notification audience: all of the teacher's students, or hand-picked ones
 * (search by name or login ID, several can be selected).
 */
export default function TeacherAudiencePicker({
  audience,
  onAudienceChange,
  selected,
  onSelectedChange,
}: {
  audience: "ALL" | "SELECTED";
  onAudienceChange: (a: "ALL" | "SELECTED") => void;
  selected: PickedStudent[];
  onSelectedChange: (s: PickedStudent[]) => void;
}) {
  const [query, setQuery] = useState("");
  // Results are tagged with their query so a stale response never replaces a newer one
  const [results, setResults] = useState<{ q: string; students: PickedStudent[] }>({ q: "\u0000", students: [] });
  const trimmed = query.trim();
  const loading = audience === "SELECTED" && results.q !== trimmed;

  useEffect(() => {
    if (audience !== "SELECTED") return;
    const q = trimmed;
    const timer = setTimeout(() => {
      teacherAPI
        .listStudents(q ? { search: q } : {})
        .then((res) => setResults({ q, students: res.data.data }))
        .catch(() => setResults({ q, students: [] }));
    }, 250);
    return () => clearTimeout(timer);
  }, [trimmed, audience]);

  const isSelected = (id: string) => selected.some((s) => s.id === id);
  const toggle = (s: PickedStudent) =>
    onSelectedChange(isSelected(s.id) ? selected.filter((x) => x.id !== s.id) : [...selected, s]);
  const addAllShown = () =>
    onSelectedChange([...selected, ...results.students.filter((s) => !isSelected(s.id))]);

  const option = (value: "ALL" | "SELECTED", title: string, desc: string, icon: React.ReactNode) => (
    <button
      type="button"
      onClick={() => onAudienceChange(value)}
      aria-pressed={audience === value}
      style={{
        textAlign: "left",
        padding: "14px 16px",
        borderRadius: 12,
        border: audience === value ? "2px solid var(--primary)" : "1px solid #e2e8f0",
        background: audience === value ? "var(--primary-50)" : "#fff",
        cursor: "pointer",
        display: "flex",
        gap: 10,
        alignItems: "flex-start",
      }}
    >
      <span style={{ color: audience === value ? "var(--primary)" : "#64748b", marginTop: 2 }}>{icon}</span>
      <span>
        <span style={{ display: "block", fontWeight: 700, fontSize: 14, color: "#0f172a" }}>{title}</span>
        <span style={{ display: "block", fontSize: 12, color: "#64748b", marginTop: 2 }}>{desc}</span>
      </span>
    </button>
  );

  return (
    <div style={{ marginBottom: 24 }}>
      <label style={{ display: "block", fontSize: 13, fontWeight: 700, color: "#1e293b", marginBottom: 10 }}>Send to</label>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12, marginBottom: 14 }}>
        {option("ALL", "All my students", "Every active student in your student list", <Users size={18} />)}
        {option("SELECTED", "Choose students", "Search by name or login ID and pick one or more", <UserCheck size={18} />)}
      </div>

      {audience === "SELECTED" && (
        <div style={{ border: "1px solid #e2e8f0", borderRadius: 12, overflow: "hidden" }}>
          {selected.length > 0 && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, padding: 12, borderBottom: "1px solid #e2e8f0", background: "#f8fafc" }}>
              {selected.map((s) => (
                <span key={s.id} className="badge badge-blue" style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 12 }}>
                  {s.firstName} {s.lastName}
                  <button
                    type="button"
                    onClick={() => toggle(s)}
                    aria-label={`Remove ${s.firstName} ${s.lastName}`}
                    style={{ background: "none", border: 0, padding: 0, cursor: "pointer", color: "inherit", display: "flex" }}
                  >
                    <X size={12} />
                  </button>
                </span>
              ))}
              <button type="button" className="btn btn-ghost btn-sm" style={{ fontSize: 12 }} onClick={() => onSelectedChange([])}>Clear all</button>
            </div>
          )}

          <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 12px", borderBottom: "1px solid #e2e8f0" }}>
            <Search size={15} color="#94a3b8" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Type a name or login ID (e.g. manvi@09)…"
              aria-label="Search your students"
              style={{ flex: 1, border: 0, outline: "none", fontSize: 14, background: "transparent" }}
            />
            {results.students.length > 1 && !loading && (
              <button type="button" className="btn btn-ghost btn-sm" style={{ fontSize: 12 }} onClick={addAllShown}>Select all shown</button>
            )}
          </div>

          <div style={{ maxHeight: 260, overflowY: "auto" }}>
            {loading ? (
              <div style={{ padding: 16, fontSize: 13, color: "#64748b" }}>Searching…</div>
            ) : results.students.length === 0 ? (
              <div style={{ padding: 16, fontSize: 13, color: "#64748b" }}>{trimmed ? "No students match your search." : "You have no students yet."}</div>
            ) : (
              results.students.map((s) => {
                const on = isSelected(s.id);
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => toggle(s)}
                    aria-pressed={on}
                    style={{
                      width: "100%",
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      padding: "10px 14px",
                      border: 0,
                      borderBottom: "1px solid #f1f5f9",
                      background: on ? "var(--primary-50)" : "#fff",
                      cursor: "pointer",
                      textAlign: "left",
                    }}
                  >
                    <span
                      style={{
                        width: 18, height: 18, borderRadius: 5, flexShrink: 0,
                        border: on ? "none" : "1.5px solid #cbd5e1",
                        background: on ? "var(--primary)" : "#fff",
                        display: "flex", alignItems: "center", justifyContent: "center", color: "#fff",
                      }}
                    >
                      {on && <Check size={12} />}
                    </span>
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ display: "block", fontWeight: 600, fontSize: 14, color: "#0f172a" }}>{s.firstName} {s.lastName}</span>
                      {s.username && <span style={{ display: "block", fontSize: 12, color: "#64748b" }}>{s.username}</span>}
                    </span>
                  </button>
                );
              })
            )}
          </div>
          <div style={{ padding: "8px 12px", fontSize: 12, color: "#64748b", background: "#f8fafc" }}>
            {selected.length} student{selected.length === 1 ? "" : "s"} selected
          </div>
        </div>
      )}
    </div>
  );
}
