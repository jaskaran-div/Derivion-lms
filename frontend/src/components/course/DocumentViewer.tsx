"use client";

import { useState } from "react";
import type { Content } from "./types";

// PDF lessons are shown inline with the browser viewer toolbar (download / print) hidden.
// Word / PowerPoint files cannot be previewed in the browser without a third-party service.
export default function DocumentViewer({ content, url }: { content: Content; url: string }) {
  const isPdf = content.type === "PDF" || content.mimeType === "application/pdf" || /\.pdf($|\?)/i.test(url);
  const [loadedUrl, setLoadedUrl] = useState<string | null>(null);
  const loaded = loadedUrl === url;

  if (!isPdf) {
    return (
      <div className="player-screen-box" style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 10, background: "#0f172a", color: "white", textAlign: "center", padding: 24, cursor: "default" }}>
        <div style={{ fontSize: 40 }}>📄</div>
        <div style={{ fontWeight: 700 }}>{content.title}</div>
        <div style={{ fontSize: 13, opacity: 0.7, maxWidth: 420 }}>
          This document type can&apos;t be previewed here. Ask your instructor to upload it as a PDF.
        </div>
      </div>
    );
  }

  return (
    <div style={{ position: "relative", width: "100%", height: "min(80vh, 760px)", borderRadius: "var(--radius-lg)", overflow: "hidden", background: "#525659", boxShadow: "0 14px 34px -4px rgba(0,0,0,0.25)" }}>
      {!loaded && (
        <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12, color: "white", fontSize: 13 }}>
          <div className="custom-player-spinner" />
          Loading document…
        </div>
      )}
      <iframe
        key={url}
        src={`${url}#toolbar=0&navpanes=0&view=FitH`}
        title={content.title}
        onLoad={() => setLoadedUrl(url)}
        style={{ width: "100%", height: "100%", border: 0, opacity: loaded ? 1 : 0 }}
      />
    </div>
  );
}
