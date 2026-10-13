"use client";

import { useEffect, useState } from "react";
import AppLayout from "@/components/layout/AppLayout";
import { usersAPI } from "@/lib/api";
import Link from "next/link";
import { Award, Download, ExternalLink, BookOpen } from "lucide-react";

interface Certificate {
  id: string;
  certificateId: string;
  cloudFrontUrl?: string;
  issuedAt: string;
  course: { title: string; thumbnail?: string };
}

export default function CertificatesPage() {
  const [certificates, setCertificates] = useState<Certificate[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    usersAPI.getCertificates().then((res) => {
      setCertificates(res.data.data);
    }).finally(() => setLoading(false));
  }, []);

  const formatDate = (dateStr: string) =>
    new Date(dateStr).toLocaleDateString("en-IN", {
      day: "numeric", month: "long", year: "numeric",
    });

  return (
    <AppLayout>
      <div className="page-header">
        <div>
          <h1 className="page-title">My Certificates</h1>
          <p className="page-subtitle">{certificates.length} certificate{certificates.length !== 1 ? "s" : ""} earned</p>
        </div>
      </div>

      {loading ? (
        <div className="grid-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="card" style={{ padding: 24 }}>
              <div className="skeleton" style={{ height: 120, borderRadius: 12, marginBottom: 16 }} />
              <div className="skeleton" style={{ height: 18, width: "80%", marginBottom: 8 }} />
              <div className="skeleton" style={{ height: 14, width: "50%" }} />
            </div>
          ))}
        </div>
      ) : certificates.length === 0 ? (
        <div className="card">
          <div className="empty-state" style={{ padding: "64px 24px" }}>
            <div className="empty-state-icon">🏆</div>
            <div className="empty-state-title">No certificates yet</div>
            <div className="empty-state-text">
              Complete a course to earn your first certificate!
            </div>
            <Link href="/courses">
              <button className="btn btn-primary btn-lg">
                <BookOpen size={16} /> Browse Courses
              </button>
            </Link>
          </div>
        </div>
      ) : (
        <div className="grid-3">
          {certificates.map((cert) => (
            <div
              key={cert.id}
              className="card"
              style={{ overflow: "hidden", transition: "transform 0.2s", cursor: "default" }}
            >
              {/* Certificate preview */}
              <div
                style={{
                  background: "linear-gradient(135deg, var(--primary-dark) 0%, var(--primary) 60%, var(--secondary) 100%)",
                  padding: "32px 24px",
                  textAlign: "center",
                  color: "white",
                  position: "relative",
                }}
              >
                <div
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    background: "radial-gradient(circle at top right, rgba(255,255,255,0.1), transparent 60%)",
                  }}
                />
                <div style={{ position: "relative", zIndex: 1 }}>
                  <div style={{ fontSize: 40, marginBottom: 8 }}>🏆</div>
                  <div style={{ fontSize: 12, opacity: 0.8, letterSpacing: 2, textTransform: "uppercase", marginBottom: 4 }}>
                    Certificate of Completion
                  </div>
                  <div style={{ fontSize: 11, opacity: 0.6 }}>ID: {cert.certificateId.slice(0, 8).toUpperCase()}</div>
                </div>
              </div>

              <div className="card-body">
                <h3 style={{ fontSize: 15, fontWeight: 700, color: "var(--gray-900)", marginBottom: 6, lineHeight: 1.4 }}>
                  {cert.course.title}
                </h3>
                <p style={{ fontSize: 13, color: "var(--gray-500)", marginBottom: 16 }}>
                  Issued on {formatDate(cert.issuedAt)}
                </p>

                <div style={{ display: "flex", gap: 8 }}>
                  {cert.cloudFrontUrl && (
                    <>
                      <a href={cert.cloudFrontUrl} download target="_blank" rel="noreferrer">
                        <button className="btn btn-primary btn-sm">
                          <Download size={13} /> Download
                        </button>
                      </a>
                      <a href={cert.cloudFrontUrl} target="_blank" rel="noreferrer">
                        <button className="btn btn-secondary btn-sm">
                          <ExternalLink size={13} /> View
                        </button>
                      </a>
                    </>
                  )}
                  {!cert.cloudFrontUrl && (
                    <span style={{ fontSize: 13, color: "var(--gray-400)" }}>Certificate being generated...</span>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </AppLayout>
  );
}
