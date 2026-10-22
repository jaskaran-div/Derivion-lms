"use client";

import { useEffect, useState, useRef } from "react";
import AppLayout from "@/components/layout/AppLayout";
import { bulkImportAPI, teacherAPI } from "@/lib/api";
import {
  Upload, Download, CheckCircle, XCircle, AlertCircle,
  Users, FileText, SkipForward, RefreshCw, Eye, ChevronDown, ChevronUp,
} from "lucide-react";

interface ImportRow {
  line: number;
  status: "success" | "failed" | "skipped" | "valid" | "invalid";
  reason?: string;
  errors?: string[];
  data: { firstName: string; lastName: string; guardianEmail?: string };
  studentId?: string;
  password?: string;
}

interface ImportJob {
  id: string;
  status: string;
  totalRows: number;
  successCount: number;
  failedCount: number;
  skippedCount: number;
  createdAt: string;
  completedAt?: string;
}

type Step = "upload" | "validate" | "results";

export default function BulkImportPage() {
  const [step, setStep] = useState<Step>("upload");
  const [csvText, setCsvText] = useState("");
  const [courses, setCourses] = useState<any[]>([]);
  const [selectedCourses, setSelectedCourses] = useState<string[]>([]);
  const [validationResults, setValidationResults] = useState<ImportRow[]>([]);
  const [importResults, setImportResults] = useState<ImportRow[]>([]);
  const [importSummary, setImportSummary] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [jobs, setJobs] = useState<ImportJob[]>([]);
  const [showJobs, setShowJobs] = useState(false);
  const [expandedResults, setExpandedResults] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadCourses();
    loadJobs();
  }, []);

  const loadCourses = async () => {
    try {
      const res = await teacherAPI.listCourses();
      setCourses(res.data.data);
    } catch {}
  };

  const loadJobs = async () => {
    try {
      const res = await bulkImportAPI.listJobs();
      setJobs(res.data.data);
    } catch {}
  };

  const downloadTemplate = async () => {
    try {
      const res = await bulkImportAPI.getTemplate();
      const url = URL.createObjectURL(new Blob([res.data], { type: "text/csv" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = "student_import_template.csv";
      a.click();
      URL.revokeObjectURL(url);
    } catch {}
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      setCsvText(ev.target?.result as string);
    };
    reader.readAsText(file);
  };

  const handleValidate = async () => {
    if (!csvText.trim()) return;
    setLoading(true);
    try {
      const res = await bulkImportAPI.validate(csvText);
      setValidationResults(res.data.data.results);
      setStep("validate");
    } catch (err: any) {
      alert(err.response?.data?.message || "Validation failed.");
    } finally {
      setLoading(false);
    }
  };

  const handleImport = async () => {
    if (!confirm(`Proceed to create ${validationResults.filter((r) => r.status === "valid").length} student accounts?`)) return;
    setLoading(true);
    try {
      const res = await bulkImportAPI.import({
        csvData: csvText,
        courseIds: selectedCourses,
      });
      setImportResults(res.data.data.results);
      setImportSummary({
        successCount: res.data.data.successCount,
        failedCount: res.data.data.failedCount,
        skippedCount: res.data.data.skippedCount,
        totalRows: res.data.data.totalRows,
        jobId: res.data.data.jobId,
      });
      setStep("results");
      loadJobs();
    } catch (err: any) {
      alert(err.response?.data?.message || "Import failed.");
    } finally {
      setLoading(false);
    }
  };

  const downloadResults = () => {
    const rows = importResults.filter((r) => r.status === "success");
    const csv = [
      "firstName,lastName,studentId,password",
      ...rows.map((r) => `${r.data.firstName},${r.data.lastName},${r.studentId},${r.password}`),
    ].join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `import_credentials_${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const resetImport = () => {
    setCsvText("");
    setValidationResults([]);
    setImportResults([]);
    setImportSummary(null);
    setSelectedCourses([]);
    setStep("upload");
    if (fileRef.current) fileRef.current.value = "";
  };

  const validCount = validationResults.filter((r) => r.status === "valid").length;
  const invalidCount = validationResults.filter((r) => r.status === "invalid").length;

  return (
    <AppLayout>
      <div className="bulk-import-page">
        {/* Header */}
        <div className="import-header">
          <div className="import-title-area">
            <div className="import-icon-wrap">
              <Users size={26} />
            </div>
            <div>
              <h1 className="import-title">Bulk Student Import</h1>
              <p className="import-subtitle">
                Upload a CSV to create hundreds of student accounts at once
              </p>
            </div>
          </div>
          <button className="template-btn" onClick={downloadTemplate}>
            <Download size={16} />
            Download Template
          </button>
        </div>

        {/* Steps indicator */}
        <div className="steps-bar">
          {(["upload", "validate", "results"] as Step[]).map((s, i) => (
            <div key={s} className={`step-item ${step === s ? "step-active" : i < ["upload", "validate", "results"].indexOf(step) ? "step-done" : "step-pending"}`}>
              <div className="step-num">{i + 1}</div>
              <span className="step-label">{s.charAt(0).toUpperCase() + s.slice(1)}</span>
              {i < 2 && <div className="step-line" />}
            </div>
          ))}
        </div>

        {/* Step 1: Upload */}
        {step === "upload" && (
          <div className="import-card">
            <h2 className="import-card-title">Upload Student CSV</h2>

            <div
              className="drop-zone"
              onClick={() => fileRef.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const file = e.dataTransfer.files[0];
                if (file) {
                  const reader = new FileReader();
                  reader.onload = (ev) => setCsvText(ev.target?.result as string);
                  reader.readAsText(file);
                }
              }}
            >
              <Upload size={36} className="drop-icon" />
              <p className="drop-text">Drag & drop your CSV here, or <span className="drop-link">browse</span></p>
              <p className="drop-hint">Supports .csv files • Maximum 5,000 rows</p>
              <input ref={fileRef} type="file" accept=".csv" hidden onChange={handleFileUpload} />
            </div>

            {csvText && (
              <div className="csv-preview">
                <div className="csv-preview-header">
                  <FileText size={16} />
                  <span>CSV loaded — {csvText.split("\n").filter(Boolean).length - 1} data rows detected</span>
                </div>
                <textarea
                  className="csv-textarea"
                  value={csvText}
                  onChange={(e) => setCsvText(e.target.value)}
                  rows={6}
                  placeholder="Or paste CSV data here..."
                />
              </div>
            )}

            {!csvText && (
              <textarea
                className="csv-textarea csv-textarea--standalone"
                value={csvText}
                onChange={(e) => setCsvText(e.target.value)}
                rows={8}
                placeholder="Or paste CSV data directly here...
firstName,lastName,guardianEmail,guardianPhone,courseIds
John,Doe,parent@example.com,9876543210,"
              />
            )}

            {/* Course selection */}
            {courses.length > 0 && (
              <div className="course-selection">
                <h3 className="course-selection-title">Enroll students in courses (optional)</h3>
                <div className="course-checkboxes">
                  {courses.map((c) => (
                    <label key={c.id} className="course-checkbox-item">
                      <input
                        type="checkbox"
                        checked={selectedCourses.includes(c.id)}
                        onChange={(e) => {
                          if (e.target.checked) setSelectedCourses((prev) => [...prev, c.id]);
                          else setSelectedCourses((prev) => prev.filter((id) => id !== c.id));
                        }}
                      />
                      <span>{c.title}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}

            <div className="import-actions">
              <button
                className="btn-validate"
                onClick={handleValidate}
                disabled={!csvText.trim() || loading}
              >
                {loading ? (
                  <><RefreshCw size={16} className="spin" /> Validating...</>
                ) : (
                  <><CheckCircle size={16} /> Validate CSV</>
                )}
              </button>
            </div>
          </div>
        )}

        {/* Step 2: Validate */}
        {step === "validate" && (
          <div className="import-card">
            <h2 className="import-card-title">Validation Results</h2>

            <div className="validation-summary">
              <div className="val-stat val-stat--success">
                <CheckCircle size={20} />
                <div>
                  <div className="val-count">{validCount}</div>
                  <div className="val-label">Valid rows</div>
                </div>
              </div>
              <div className="val-stat val-stat--error">
                <XCircle size={20} />
                <div>
                  <div className="val-count">{invalidCount}</div>
                  <div className="val-label">Invalid rows</div>
                </div>
              </div>
              <div className="val-stat val-stat--total">
                <Users size={20} />
                <div>
                  <div className="val-count">{validationResults.length}</div>
                  <div className="val-label">Total rows</div>
                </div>
              </div>
            </div>

            {invalidCount > 0 && (
              <div className="validation-warnings">
                <AlertCircle size={16} />
                <span>{invalidCount} row(s) have errors and will be skipped during import. Fix the CSV and re-validate, or proceed to import only the valid rows.</span>
              </div>
            )}

            {/* Validation table */}
            <div className="validation-table-wrap">
              <table className="validation-table">
                <thead>
                  <tr>
                    <th>Line</th>
                    <th>Name</th>
                    <th>Guardian Email</th>
                    <th>Status</th>
                    <th>Issues</th>
                  </tr>
                </thead>
                <tbody>
                  {(expandedResults ? validationResults : validationResults.slice(0, 15)).map((row) => (
                    <tr key={row.line} className={`val-row-${row.status}`}>
                      <td className="val-line">#{row.line}</td>
                      <td>{row.data.firstName} {row.data.lastName}</td>
                      <td>{row.data.guardianEmail || "—"}</td>
                      <td>
                        <span className={`val-badge val-badge--${row.status}`}>
                          {row.status === "valid" ? <CheckCircle size={12} /> : <XCircle size={12} />}
                          {row.status}
                        </span>
                      </td>
                      <td className="val-errors">{row.errors?.join(", ") || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {validationResults.length > 15 && (
                <button className="expand-btn" onClick={() => setExpandedResults(!expandedResults)}>
                  {expandedResults ? <><ChevronUp size={15} /> Show less</> : <><ChevronDown size={15} /> Show all {validationResults.length} rows</>}
                </button>
              )}
            </div>

            <div className="import-actions">
              <button className="btn-back" onClick={resetImport}>
                Start Over
              </button>
              <button
                className="btn-import"
                onClick={handleImport}
                disabled={validCount === 0 || loading}
              >
                {loading ? (
                  <><RefreshCw size={16} className="spin" /> Importing...</>
                ) : (
                  <><Upload size={16} /> Import {validCount} Students</>
                )}
              </button>
            </div>
          </div>
        )}

        {/* Step 3: Results */}
        {step === "results" && importSummary && (
          <div className="import-card">
            <h2 className="import-card-title">Import Complete</h2>

            <div className="results-summary">
              <div className="result-stat result-stat--success">
                <CheckCircle size={24} />
                <div className="result-count">{importSummary.successCount}</div>
                <div className="result-label">Created</div>
              </div>
              <div className="result-stat result-stat--skip">
                <SkipForward size={24} />
                <div className="result-count">{importSummary.skippedCount}</div>
                <div className="result-label">Skipped</div>
              </div>
              <div className="result-stat result-stat--fail">
                <XCircle size={24} />
                <div className="result-count">{importSummary.failedCount}</div>
                <div className="result-label">Failed</div>
              </div>
            </div>

            <div className="results-actions">
              <button className="btn-download-creds" onClick={downloadResults}>
                <Download size={16} />
                Download Credentials CSV
              </button>
              <button className="btn-back" onClick={resetImport}>
                <RefreshCw size={16} />
                New Import
              </button>
            </div>

            <div className="creds-notice">
              <AlertCircle size={16} />
              <span>
                <strong>Important:</strong> Student credentials are shown only once.
                Download and share them securely. Students should change passwords on first login.
              </span>
            </div>

            {/* Results table */}
            <div className="validation-table-wrap" style={{ marginTop: "1rem" }}>
              <table className="validation-table">
                <thead>
                  <tr>
                    <th>Line</th>
                    <th>Name</th>
                    <th>Student ID</th>
                    <th>Password</th>
                    <th>Status</th>
                    <th>Note</th>
                  </tr>
                </thead>
                <tbody>
                  {importResults.map((row) => (
                    <tr key={row.line} className={`val-row-${row.status}`}>
                      <td className="val-line">#{row.line}</td>
                      <td>{row.data.firstName} {row.data.lastName}</td>
                      <td className="credential-cell">{row.studentId || "—"}</td>
                      <td className="credential-cell">{row.password || "—"}</td>
                      <td>
                        <span className={`val-badge val-badge--${row.status}`}>
                          {row.status}
                        </span>
                      </td>
                      <td className="val-errors">{row.reason || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Past import jobs */}
        <div className="jobs-section">
          <button className="jobs-toggle" onClick={() => setShowJobs(!showJobs)}>
            <Eye size={16} />
            Past Import Jobs ({jobs.length})
            {showJobs ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </button>

          {showJobs && jobs.length > 0 && (
            <div className="jobs-list">
              {jobs.map((job) => (
                <div key={job.id} className="job-row">
                  <div className="job-info">
                    <span className={`job-status job-status--${job.status.toLowerCase()}`}>{job.status}</span>
                    <span className="job-date">{new Date(job.createdAt).toLocaleString("en-IN")}</span>
                  </div>
                  <div className="job-counts">
                    <span className="job-count success">{job.successCount} created</span>
                    <span className="job-count skip">{job.skippedCount} skipped</span>
                    <span className="job-count fail">{job.failedCount} failed</span>
                    <span className="job-total">/ {job.totalRows} total</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <style jsx>{`
          .bulk-import-page { padding: 0; }
          .import-header {
            display: flex; align-items: center; justify-content: space-between;
            margin-bottom: 2rem; gap: 1rem; flex-wrap: wrap;
          }
          .import-title-area { display: flex; align-items: center; gap: 1rem; }
          .import-icon-wrap {
            width: 50px; height: 50px; border-radius: 14px;
            background: linear-gradient(135deg, #10b981, #059669);
            display: flex; align-items: center; justify-content: center; color: white;
            box-shadow: 0 4px 15px rgba(16,185,129,0.35);
          }
          .import-title { font-size: 1.6rem; font-weight: 700; color: var(--text-primary); margin: 0; }
          .import-subtitle { color: var(--text-secondary); font-size: 0.875rem; margin: 0; }
          .template-btn {
            display: flex; align-items: center; gap: 0.5rem;
            padding: 0.6rem 1.2rem; background: none;
            border: 1px solid var(--border); border-radius: 10px;
            color: var(--text-primary); cursor: pointer; font-weight: 500; font-size: 0.9rem;
            transition: all 0.15s;
          }
          .template-btn:hover { background: var(--hover); }

          .steps-bar {
            display: flex; align-items: center; gap: 0; margin-bottom: 2rem;
            background: var(--card-bg); border: 1px solid var(--border);
            border-radius: 12px; padding: 1rem 1.5rem;
          }
          .step-item { display: flex; align-items: center; gap: 0.5rem; }
          .step-num {
            width: 28px; height: 28px; border-radius: 50%;
            display: flex; align-items: center; justify-content: center;
            font-size: 0.8rem; font-weight: 700; border: 2px solid var(--border);
            color: var(--text-secondary); background: var(--card-bg);
          }
          .step-active .step-num { border-color: #10b981; color: #10b981; background: rgba(16,185,129,0.1); }
          .step-done .step-num { border-color: #10b981; background: #10b981; color: white; }
          .step-label { font-size: 0.85rem; font-weight: 600; color: var(--text-secondary); }
          .step-active .step-label, .step-done .step-label { color: var(--text-primary); }
          .step-line { flex: 1; height: 2px; background: var(--border); margin: 0 1rem; min-width: 30px; }
          .step-done .step-line { background: #10b981; }

          .import-card {
            background: var(--card-bg); border: 1px solid var(--border);
            border-radius: 16px; padding: 1.75rem; margin-bottom: 1.5rem;
          }
          .import-card-title { font-size: 1.1rem; font-weight: 700; color: var(--text-primary); margin: 0 0 1.25rem; }

          .drop-zone {
            border: 2px dashed var(--border); border-radius: 12px;
            padding: 2.5rem; text-align: center; cursor: pointer;
            transition: all 0.2s; margin-bottom: 1.25rem;
          }
          .drop-zone:hover { border-color: #10b981; background: rgba(16,185,129,0.04); }
          .drop-icon { color: var(--text-secondary); margin-bottom: 0.75rem; opacity: 0.6; }
          .drop-text { color: var(--text-secondary); font-size: 0.95rem; margin-bottom: 0.35rem; }
          .drop-link { color: #10b981; font-weight: 600; }
          .drop-hint { color: var(--text-secondary); font-size: 0.8rem; opacity: 0.7; margin: 0; }

          .csv-preview { margin-bottom: 1rem; }
          .csv-preview-header {
            display: flex; align-items: center; gap: 0.5rem;
            font-size: 0.85rem; font-weight: 600; color: #10b981; margin-bottom: 0.5rem;
          }
          .csv-textarea {
            width: 100%; padding: 0.75rem; background: var(--hover);
            border: 1px solid var(--border); border-radius: 8px;
            color: var(--text-primary); font-family: monospace; font-size: 0.8rem;
            resize: vertical; outline: none; box-sizing: border-box;
          }
          .csv-textarea--standalone { margin-bottom: 1rem; }

          .course-selection { margin-bottom: 1.25rem; }
          .course-selection-title { font-size: 0.9rem; font-weight: 600; color: var(--text-primary); margin-bottom: 0.75rem; }
          .course-checkboxes { display: flex; flex-direction: column; gap: 0.5rem; max-height: 180px; overflow-y: auto; }
          .course-checkbox-item {
            display: flex; align-items: center; gap: 0.6rem;
            font-size: 0.875rem; color: var(--text-primary); cursor: pointer;
          }
          .course-checkbox-item input { accent-color: #10b981; }

          .import-actions { display: flex; justify-content: flex-end; gap: 0.75rem; margin-top: 1.5rem; }
          .btn-validate, .btn-import {
            display: flex; align-items: center; gap: 0.5rem;
            padding: 0.65rem 1.5rem; border: none; border-radius: 10px;
            font-weight: 600; cursor: pointer; font-size: 0.9rem;
            background: linear-gradient(135deg, #10b981, #059669); color: white;
            box-shadow: 0 4px 12px rgba(16,185,129,0.35);
          }
          .btn-validate:disabled, .btn-import:disabled { opacity: 0.65; cursor: not-allowed; }
          .btn-back {
            display: flex; align-items: center; gap: 0.5rem;
            padding: 0.65rem 1.2rem; border: 1px solid var(--border);
            background: none; border-radius: 10px; color: var(--text-primary);
            cursor: pointer; font-size: 0.9rem; font-weight: 500;
          }
          .spin { animation: spin 1s linear infinite; }
          @keyframes spin { to { transform: rotate(360deg); } }

          .validation-summary {
            display: grid; grid-template-columns: repeat(3, 1fr);
            gap: 1rem; margin-bottom: 1.25rem;
          }
          .val-stat {
            display: flex; align-items: center; gap: 0.75rem;
            padding: 1rem; border-radius: 10px; border: 1px solid transparent;
          }
          .val-stat--success { background: rgba(16,185,129,0.08); color: #10b981; border-color: rgba(16,185,129,0.2); }
          .val-stat--error { background: rgba(239,68,68,0.08); color: #ef4444; border-color: rgba(239,68,68,0.2); }
          .val-stat--total { background: rgba(29, 78, 216,0.08); color: #1d4ed8; border-color: rgba(29, 78, 216,0.2); }
          .val-count { font-size: 1.5rem; font-weight: 700; line-height: 1; }
          .val-label { font-size: 0.78rem; opacity: 0.8; }

          .validation-warnings {
            display: flex; align-items: flex-start; gap: 0.6rem;
            background: rgba(245,158,11,0.08); border: 1px solid rgba(245,158,11,0.25);
            padding: 0.85rem 1rem; border-radius: 8px; margin-bottom: 1rem;
            font-size: 0.875rem; color: #f59e0b;
          }

          .validation-table-wrap { overflow-x: auto; }
          .validation-table {
            width: 100%; border-collapse: collapse; font-size: 0.845rem;
          }
          .validation-table th {
            text-align: left; padding: 0.65rem 0.75rem;
            background: var(--hover); font-weight: 600;
            color: var(--text-secondary); font-size: 0.78rem; text-transform: uppercase;
            border-bottom: 1px solid var(--border);
          }
          .validation-table td { padding: 0.6rem 0.75rem; border-bottom: 1px solid var(--border); color: var(--text-primary); }
          .val-row-invalid td, .val-row-failed td { background: rgba(239,68,68,0.03); }
          .val-row-success td { background: rgba(16,185,129,0.03); }
          .val-line { font-family: monospace; color: var(--text-secondary); }
          .val-errors { color: #ef4444; font-size: 0.8rem; }
          .val-badge {
            display: inline-flex; align-items: center; gap: 0.3rem;
            padding: 0.18rem 0.55rem; border-radius: 20px; font-size: 0.75rem; font-weight: 600;
          }
          .val-badge--valid, .val-badge--success { background: rgba(16,185,129,0.1); color: #10b981; }
          .val-badge--invalid, .val-badge--failed { background: rgba(239,68,68,0.1); color: #ef4444; }
          .val-badge--skipped { background: rgba(245,158,11,0.1); color: #f59e0b; }
          .expand-btn {
            display: flex; align-items: center; gap: 0.4rem;
            width: 100%; padding: 0.6rem; background: none; border: none;
            border-top: 1px solid var(--border); cursor: pointer;
            color: var(--text-secondary); font-size: 0.85rem; justify-content: center;
          }
          .expand-btn:hover { color: var(--text-primary); background: var(--hover); }

          .results-summary {
            display: grid; grid-template-columns: repeat(3, 1fr);
            gap: 1rem; margin-bottom: 1.5rem; text-align: center;
          }
          .result-stat {
            padding: 1.25rem; border-radius: 12px; border: 1px solid transparent;
          }
          .result-stat--success { background: rgba(16,185,129,0.08); color: #10b981; border-color: rgba(16,185,129,0.2); }
          .result-stat--skip { background: rgba(245,158,11,0.08); color: #f59e0b; border-color: rgba(245,158,11,0.2); }
          .result-stat--fail { background: rgba(239,68,68,0.08); color: #ef4444; border-color: rgba(239,68,68,0.2); }
          .result-count { font-size: 2rem; font-weight: 800; margin: 0.4rem 0 0.2rem; }
          .result-label { font-size: 0.82rem; opacity: 0.8; }

          .results-actions { display: flex; gap: 0.75rem; margin-bottom: 1rem; flex-wrap: wrap; }
          .btn-download-creds {
            display: flex; align-items: center; gap: 0.5rem;
            padding: 0.65rem 1.4rem;
            background: linear-gradient(135deg, #1d4ed8, #8b5cf6);
            color: white; border: none; border-radius: 10px; cursor: pointer;
            font-weight: 600; font-size: 0.9rem;
          }
          .creds-notice {
            display: flex; align-items: flex-start; gap: 0.6rem;
            background: rgba(29, 78, 216,0.08); border: 1px solid rgba(29, 78, 216,0.25);
            padding: 0.85rem 1rem; border-radius: 8px; font-size: 0.875rem; color: #1d4ed8;
          }
          .credential-cell { font-family: monospace; font-size: 0.82rem; font-weight: 600; }

          .jobs-section { margin-top: 0.5rem; }
          .jobs-toggle {
            display: flex; align-items: center; gap: 0.5rem;
            background: none; border: 1px solid var(--border); border-radius: 10px;
            padding: 0.6rem 1rem; cursor: pointer; color: var(--text-secondary);
            font-size: 0.875rem; font-weight: 500; margin-bottom: 0.75rem;
            transition: all 0.15s;
          }
          .jobs-toggle:hover { background: var(--hover); color: var(--text-primary); }
          .jobs-list { display: flex; flex-direction: column; gap: 0.5rem; }
          .job-row {
            display: flex; align-items: center; justify-content: space-between;
            padding: 0.75rem 1rem; background: var(--card-bg); border: 1px solid var(--border);
            border-radius: 10px; gap: 1rem; flex-wrap: wrap;
          }
          .job-info { display: flex; align-items: center; gap: 0.75rem; }
          .job-status {
            padding: 0.2rem 0.6rem; border-radius: 20px; font-size: 0.75rem; font-weight: 700;
          }
          .job-status--completed { background: rgba(16,185,129,0.1); color: #10b981; }
          .job-status--processing { background: rgba(245,158,11,0.1); color: #f59e0b; }
          .job-status--failed { background: rgba(239,68,68,0.1); color: #ef4444; }
          .job-date { font-size: 0.8rem; color: var(--text-secondary); }
          .job-counts { display: flex; gap: 0.75rem; font-size: 0.82rem; }
          .job-count.success { color: #10b981; }
          .job-count.skip { color: #f59e0b; }
          .job-count.fail { color: #ef4444; }
          .job-total { color: var(--text-secondary); }
        `}</style>
      </div>
    </AppLayout>
  );
}
