"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { apiErrorMessage, certificateAPI, certificatePdfUrl } from "@/lib/api";
import { Award, CheckCircle, XCircle, Shield, GraduationCap, Calendar } from "lucide-react";
import Link from "next/link";

interface CertData {
  certificateNo: string;
  certificateId?: string;
  recipientName: string;
  courseTitle: string;
  courseLevel: string;
  issuedAt: string;
  isValid: boolean;
}

export default function CertificateVerifyPage() {
  const { id } = useParams<{ id: string }>();
  const [cert, setCert] = useState<CertData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    certificateAPI.verify(id)
      .then((res) => { if (!cancelled) setCert(res.data.data); })
      .catch((err) => { if (!cancelled) setError(apiErrorMessage(err, "Certificate not found or invalid.")); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [id]);

  const formatDate = (d: string) =>
    new Date(d).toLocaleDateString("en-IN", {
      day: "2-digit", month: "long", year: "numeric",
    });

  return (
    <div className="verify-page">
      {/* Background */}
      <div className="verify-bg" />

      <div className="verify-container">
        {/* Brand */}
        <div className="verify-brand">
          <GraduationCap size={28} />
          <span>Derivion LMS</span>
        </div>

        <div className="verify-card">
          {loading ? (
            <div className="verify-loading">
              <div className="spinner" />
              <p>Verifying certificate...</p>
            </div>
          ) : error ? (
            <div className="verify-invalid">
              <div className="verify-icon verify-icon--invalid">
                <XCircle size={40} />
              </div>
              <h2>Certificate Not Found</h2>
              <p>{error}</p>
              <div className="verify-warning">
                <Shield size={16} />
                This certificate ID does not match any issued certificate in our system.
                If you believe this is an error, contact the issuing institution.
              </div>
            </div>
          ) : cert ? (
            <div className="verify-valid">
              <div className="verify-icon verify-icon--valid">
                <CheckCircle size={40} />
              </div>

              <div className="verify-valid-badge">
                <Shield size={14} />
                Verified & Authentic
              </div>

              <h2 className="verify-heading">Certificate Verified</h2>
              <p className="verify-desc">
                This certificate was legitimately issued by <strong>Derivion LMS</strong> and is authentic.
              </p>

              <div className="cert-detail-card">
                <div className="cert-detail-header">
                  <Award size={20} />
                  <span>Certificate of Completion</span>
                </div>

                <div className="cert-details">
                  <div className="cert-detail-row">
                    <span className="cert-detail-label">Recipient</span>
                    <span className="cert-detail-value cert-recipient">{cert.recipientName}</span>
                  </div>
                  <div className="cert-detail-row">
                    <span className="cert-detail-label">Course</span>
                    <span className="cert-detail-value">{cert.courseTitle}</span>
                  </div>
                  <div className="cert-detail-row">
                    <span className="cert-detail-label">Level</span>
                    <span className="cert-detail-value">
                      <span className="cert-level-badge">{cert.courseLevel}</span>
                    </span>
                  </div>
                  <div className="cert-detail-row">
                    <span className="cert-detail-label">Date Issued</span>
                    <span className="cert-detail-value">
                      <Calendar size={14} />
                      {formatDate(cert.issuedAt)}
                    </span>
                  </div>
                  <div className="cert-detail-row">
                    <span className="cert-detail-label">Certificate No.</span>
                    <span className="cert-detail-value cert-no">{cert.certificateNo}</span>
                  </div>
                </div>
                {cert.certificateId && (
                  <div style={{ display: "flex", gap: 10, justifyContent: "center", marginTop: 20, flexWrap: "wrap" }}>
                    <a href={certificatePdfUrl(cert.certificateId)} target="_blank" rel="noreferrer" className="btn btn-dark btn-sm">View certificate</a>
                    <a href={certificatePdfUrl(cert.certificateId, true)} className="btn btn-secondary btn-sm">Download PDF</a>
                  </div>
                )}
              </div>

              <div className="cert-authenticity-note">
                <Shield size={14} />
                This verification was performed against the Derivion LMS database in real-time.
                The certificate details above are official and have not been altered.
              </div>
            </div>
          ) : null}
        </div>

        <div className="verify-footer">
          <p>© {new Date().getFullYear()} Derivion LMS · Certificate Verification System</p>
          <Link href="/" className="verify-home-link">Go to platform →</Link>
        </div>
      </div>

      <style jsx>{`
        .verify-page {
          min-height: 100vh; display: flex; align-items: center; justify-content: center;
          padding: 2rem; position: relative; background: #0f172a; font-family: 'Inter', sans-serif;
        }
        .verify-bg {
          position: fixed; inset: 0; z-index: 0;
          background: radial-gradient(ellipse at 20% 50%, rgba(29, 78, 216,0.15) 0%, transparent 50%),
                      radial-gradient(ellipse at 80% 20%, rgba(139,92,246,0.12) 0%, transparent 50%);
        }
        .verify-container {
          position: relative; z-index: 1; width: 100%; max-width: 540px;
          display: flex; flex-direction: column; align-items: center; gap: 1.5rem;
        }
        .verify-brand {
          display: flex; align-items: center; gap: 0.6rem;
          color: white; font-size: 1.2rem; font-weight: 700; opacity: 0.9;
        }
        .verify-card {
          width: 100%; background: rgba(30,41,59,0.8); backdrop-filter: blur(16px);
          border: 1px solid rgba(255,255,255,0.08); border-radius: 20px;
          padding: 2.5rem; box-shadow: 0 25px 60px rgba(0,0,0,0.4);
        }

        .verify-loading {
          display: flex; flex-direction: column; align-items: center; gap: 1rem;
          padding: 2rem; color: #94a3b8;
        }
        .spinner {
          width: 40px; height: 40px; border: 3px solid rgba(29, 78, 216,0.2);
          border-top-color: #1d4ed8; border-radius: 50%; animation: spin 0.8s linear infinite;
        }
        @keyframes spin { to { transform: rotate(360deg); } }

        .verify-icon {
          width: 76px; height: 76px; border-radius: 50%; margin: 0 auto 1.25rem;
          display: flex; align-items: center; justify-content: center;
        }
        .verify-icon--valid { background: rgba(16,185,129,0.15); color: #10b981; border: 2px solid rgba(16,185,129,0.3); }
        .verify-icon--invalid { background: rgba(239,68,68,0.15); color: #ef4444; border: 2px solid rgba(239,68,68,0.3); }

        .verify-invalid { text-align: center; }
        .verify-invalid h2 { font-size: 1.3rem; font-weight: 700; color: #f1f5f9; margin-bottom: 0.5rem; }
        .verify-invalid p { color: #94a3b8; margin-bottom: 1.25rem; }
        .verify-warning {
          display: flex; align-items: flex-start; gap: 0.5rem;
          background: rgba(239,68,68,0.1); border: 1px solid rgba(239,68,68,0.2);
          border-radius: 10px; padding: 0.9rem 1rem; font-size: 0.83rem;
          color: #fca5a5; text-align: left;
        }

        .verify-valid { text-align: center; }
        .verify-valid-badge {
          display: inline-flex; align-items: center; gap: 0.35rem; margin-bottom: 1rem;
          background: rgba(16,185,129,0.12); color: #10b981;
          border: 1px solid rgba(16,185,129,0.25); border-radius: 20px;
          padding: 0.3rem 0.85rem; font-size: 0.8rem; font-weight: 700;
        }
        .verify-heading { font-size: 1.4rem; font-weight: 800; color: #f1f5f9; margin-bottom: 0.5rem; }
        .verify-desc { color: #94a3b8; font-size: 0.9rem; margin-bottom: 1.5rem; }

        .cert-detail-card {
          background: rgba(15,23,42,0.5); border: 1px solid rgba(255,255,255,0.07);
          border-radius: 14px; overflow: hidden; text-align: left; margin-bottom: 1.25rem;
        }
        .cert-detail-header {
          display: flex; align-items: center; gap: 0.65rem;
          padding: 0.9rem 1.25rem; background: rgba(29, 78, 216,0.12);
          border-bottom: 1px solid rgba(255,255,255,0.06);
          color: #a5b4fc; font-weight: 700; font-size: 0.9rem;
        }
        .cert-details { padding: 0.5rem 0; }
        .cert-detail-row {
          display: flex; align-items: flex-start; gap: 1rem;
          padding: 0.7rem 1.25rem; border-bottom: 1px solid rgba(255,255,255,0.04);
        }
        .cert-detail-row:last-child { border-bottom: none; }
        .cert-detail-label {
          min-width: 120px; font-size: 0.78rem; font-weight: 600;
          color: #64748b; text-transform: uppercase; letter-spacing: 0.04em; padding-top: 2px;
        }
        .cert-detail-value {
          font-size: 0.9rem; color: #e2e8f0; font-weight: 500;
          display: flex; align-items: center; gap: 0.4rem;
        }
        .cert-recipient { font-size: 1.05rem; font-weight: 700; color: #f1f5f9; }
        .cert-level-badge {
          background: rgba(29, 78, 216,0.15); color: #a5b4fc;
          border: 1px solid rgba(29, 78, 216,0.25); padding: 0.15rem 0.55rem;
          border-radius: 6px; font-size: 0.78rem; font-weight: 700;
        }
        .cert-no { font-family: monospace; font-size: 0.85rem; color: #94a3b8; }

        .cert-authenticity-note {
          display: flex; align-items: flex-start; gap: 0.5rem;
          background: rgba(16,185,129,0.08); border: 1px solid rgba(16,185,129,0.2);
          border-radius: 10px; padding: 0.85rem 1rem; font-size: 0.8rem;
          color: #6ee7b7; text-align: left;
        }

        .verify-footer {
          display: flex; flex-direction: column; align-items: center; gap: 0.35rem;
          color: #475569; font-size: 0.8rem;
        }
        .verify-home-link { color: #1d4ed8; text-decoration: none; font-weight: 500; }
        .verify-home-link:hover { text-decoration: underline; }
      `}</style>
    </div>
  );
}
