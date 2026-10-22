"use client";

import { useRef, useState } from "react";
import { quizAPI } from "@/lib/api";
import { isAxiosError } from "axios";
import toast from "react-hot-toast";
import { Upload, Download, FileText, CheckCircle, AlertTriangle, ArrowLeft } from "lucide-react";

export const SAMPLE_FORMAT = `Q1. What does HTML stand for?
A) Hyper Text Markup Language
B) High Tech Modern Language
C) Home Tool Markup Language
D) Hyperlinks and Text Markup Language
Answer: A
Explanation: HTML is the standard markup language for web pages.
Marks: 1

Q2. Which tag is used to create a hyperlink?
A) <img>
B) <a>
C) <link>
D) <href>
Answer: B

Q3. CSS is used for styling web pages.
A) True
B) False
Answer: A
Marks: 2`;

interface ParsedQuestion {
  text: string;
  options: string[];
  correctAnswer: number;
  explanation: string;
  points: number;
}

interface ParseError {
  question: string;
  text: string;
  message: string;
}

const letter = (i: number) => String.fromCharCode(65 + i);

const errMsg = (err: unknown, fallback: string) =>
  (isAxiosError<{ message?: string }>(err) && err.response?.data?.message) || fallback;

export default function QuizImportModal({ quizId, onClose, onImported }: { quizId: string; onClose: () => void; onImported: () => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState("");
  const [reading, setReading] = useState(false);
  const [parsed, setParsed] = useState<{ questions: ParsedQuestion[]; errors: ParseError[] } | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [importing, setImporting] = useState(false);

  const downloadSample = () => {
    const blob = new Blob([SAMPLE_FORMAT.replace(/\n/g, "\r\n")], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "quiz-sample-format.txt";
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleFile = async (file: File) => {
    setFileName(file.name);
    setReading(true);
    try {
      const res = await quizAPI.previewImport(quizId, file);
      const data = res.data.data;
      setParsed(data);
      setSelected(new Set(data.questions.map((_: ParsedQuestion, i: number) => i)));
    } catch (err) {
      toast.error(errMsg(err, "Could not read the document."));
    } finally {
      setReading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const handleImport = async () => {
    if (!parsed) return;
    const chosen = parsed.questions.filter((_, i) => selected.has(i));
    if (chosen.length === 0) return toast.error("Select at least one question.");
    setImporting(true);
    try {
      const res = await quizAPI.bulkAddQuestions(quizId, chosen);
      toast.success(`${res.data.data.count} question${res.data.data.count !== 1 ? "s" : ""} imported.`);
      onImported();
      onClose();
    } catch (err) {
      toast.error(errMsg(err, "Import failed."));
    } finally {
      setImporting(false);
    }
  };

  const toggle = (i: number) =>
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(i)) n.delete(i);
      else n.add(i);
      return n;
    });

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 760 }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="modal-title">Import questions from document</h2>
          <button className="btn btn-ghost btn-icon" onClick={onClose}>✕</button>
        </div>

        <div className="modal-body">
          {!parsed ? (
            <>
              <div
                onClick={() => !reading && fileRef.current?.click()}
                style={{
                  border: "2px dashed var(--primary-light)", background: "var(--primary-50)", borderRadius: "var(--radius-md)",
                  padding: "28px 16px", textAlign: "center", cursor: reading ? "wait" : "pointer", marginBottom: 20,
                }}
              >
                <Upload size={28} color="var(--primary)" />
                <div style={{ fontWeight: 600, marginTop: 8 }}>{reading ? `Reading ${fileName}…` : "Click to upload a Word (.docx) or text (.txt) file"}</div>
                <div style={{ fontSize: 12, color: "var(--gray-500)", marginTop: 4 }}>Max 5 MB. You will review the questions before they are added.</div>
                <input
                  ref={fileRef}
                  type="file"
                  accept=".docx,.txt"
                  style={{ display: "none" }}
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
                />
              </div>

              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                <div style={{ fontWeight: 700, display: "flex", alignItems: "center", gap: 6 }}><FileText size={16} /> Required format</div>
                <button className="btn btn-secondary btn-sm" onClick={downloadSample}><Download size={14} /> Download sample</button>
              </div>
              <pre
                style={{
                  background: "var(--gray-50)", border: "1px solid var(--border-color)", borderRadius: 8, padding: 14,
                  fontSize: 13, lineHeight: 1.6, maxHeight: 260, overflow: "auto", whiteSpace: "pre-wrap", margin: 0,
                }}
              >
                {SAMPLE_FORMAT}
              </pre>
              <ul style={{ fontSize: 13, color: "var(--gray-600)", lineHeight: 1.8, paddingLeft: 18, marginBottom: 0 }}>
                <li>Start each question with <code>Q1.</code>, <code>1.</code> or <code>1)</code>.</li>
                <li>Options start with <code>A)</code>, <code>B)</code>… (also <code>a.</code> or <code>(A)</code>). 2–6 options per question.</li>
                <li><code>Answer: B</code> gives the correct option. You can also write the option text, or put <code>*</code> before the correct option.</li>
                <li><code>Explanation:</code> and <code>Marks:</code> are optional (marks default to 1).</li>
                <li>Works the same in Word: type it like this, one item per line.</li>
              </ul>
            </>
          ) : (
            <>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12, flexWrap: "wrap", gap: 8 }}>
                <div style={{ fontSize: 14 }}>
                  <strong>{fileName}</strong>: found <strong>{parsed.questions.length}</strong> question{parsed.questions.length !== 1 ? "s" : ""}
                  {parsed.errors.length > 0 && <span style={{ color: "var(--danger)" }}>, {parsed.errors.length} skipped</span>}
                </div>
                <label style={{ fontSize: 13, display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
                  <input
                    type="checkbox"
                    checked={selected.size === parsed.questions.length && parsed.questions.length > 0}
                    onChange={(e) => setSelected(e.target.checked ? new Set(parsed.questions.map((_, i) => i)) : new Set())}
                  />
                  Select all
                </label>
              </div>

              {parsed.errors.length > 0 && (
                <div className="alert alert-warning" style={{ marginBottom: 12, display: "block" }}>
                  <div style={{ fontWeight: 600, display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                    <AlertTriangle size={15} /> These could not be read and will be skipped:
                  </div>
                  <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13 }}>
                    {parsed.errors.map((e, i) => (
                      <li key={i}><strong>{e.question}</strong> “{e.text.slice(0, 60)}{e.text.length > 60 ? "…" : ""}”: {e.message}</li>
                    ))}
                  </ul>
                </div>
              )}

              <div style={{ display: "flex", flexDirection: "column", gap: 10, maxHeight: 420, overflow: "auto" }}>
                {parsed.questions.map((q, i) => (
                  <label
                    key={i}
                    className="card"
                    style={{ padding: 14, display: "flex", gap: 12, cursor: "pointer", opacity: selected.has(i) ? 1 : 0.5 }}
                  >
                    <input type="checkbox" checked={selected.has(i)} onChange={() => toggle(i)} style={{ marginTop: 3 }} />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 600, fontSize: 14, whiteSpace: "pre-wrap" }}>
                        {i + 1}. {q.text}
                        <span style={{ fontWeight: 400, fontSize: 12, color: "var(--gray-400)", marginLeft: 6 }}>{q.points} mark{q.points !== 1 ? "s" : ""}</span>
                      </div>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4, marginTop: 6 }}>
                        {q.options.map((o, oi) => (
                          <div
                            key={oi}
                            style={{
                              fontSize: 13, padding: "4px 8px", borderRadius: 6, display: "flex", alignItems: "center", gap: 4,
                              background: oi === q.correctAnswer ? "var(--success-light, #dcfce7)" : "var(--gray-50)",
                            }}
                          >
                            <strong>{letter(oi)}.</strong> {o}
                            {oi === q.correctAnswer && <CheckCircle size={13} color="var(--success)" style={{ marginLeft: "auto" }} />}
                          </div>
                        ))}
                      </div>
                      {q.explanation && <div style={{ fontSize: 12, color: "var(--gray-500)", marginTop: 6 }}>💡 {q.explanation}</div>}
                    </div>
                  </label>
                ))}
              </div>
            </>
          )}
        </div>

        <div className="modal-footer">
          {parsed ? (
            <>
              <button className="btn btn-secondary" onClick={() => setParsed(null)}><ArrowLeft size={14} /> Upload another file</button>
              <button className="btn btn-primary" onClick={handleImport} disabled={importing || selected.size === 0}>
                {importing ? "Importing…" : `Import ${selected.size} question${selected.size !== 1 ? "s" : ""}`}
              </button>
            </>
          ) : (
            <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
          )}
        </div>
      </div>
    </div>
  );
}
