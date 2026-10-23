"use client";

import { useEffect, useState } from "react";
import { quizAPI } from "@/lib/api";

interface QuestionStat {
  questionId: string;
  text: string;
  options: string[];
  correct: number;
  answered: number;
  correctCount: number;
  skipped: number;
  optionCounts: number[];
  correctRate: number;
}

interface Analytics {
  attempts: number;
  passRate: number;
  averageScore: number;
  questions: QuestionStat[];
}

const letter = (i: number) => String.fromCharCode(65 + i);

// Per-question performance across all submitted attempts: hardest questions first
export default function QuizAnalytics({ quizId }: { quizId: string }) {
  const [data, setData] = useState<Analytics | null>(null);

  useEffect(() => {
    let cancelled = false;
    quizAPI.analytics(quizId).then((res) => { if (!cancelled) setData(res.data.data); }).catch(() => {});
    return () => { cancelled = true; };
  }, [quizId]);

  if (!data || data.attempts === 0) return null;

  const hardestFirst = [...data.questions].sort((a, b) => a.correctRate - b.correctRate);

  return (
    <div className="card" style={{ padding: 20, marginBottom: 16 }}>
      <div className="panel-stats" style={{ marginBottom: 16 }}>
        <div><div className="panel-stat-value">{data.attempts}</div><div className="panel-stat-label">Submissions</div></div>
        <div><div className="panel-stat-value">{data.passRate.toFixed(0)}%</div><div className="panel-stat-label">Pass rate</div></div>
        <div><div className="panel-stat-value">{data.averageScore.toFixed(1)}%</div><div className="panel-stat-label">Average score</div></div>
      </div>

      <div style={{ fontWeight: 600, marginBottom: 10 }}>Question performance <span style={{ fontWeight: 400, color: "var(--gray-500)", fontSize: 13 }}>(hardest first)</span></div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {hardestFirst.map((q) => {
          const rate = Math.round(q.correctRate);
          const tone = rate >= 70 ? "var(--success)" : rate >= 40 ? "var(--warning)" : "var(--danger)";
          // Most-picked wrong answer: a hint that the question or an option is misleading
          const wrong = q.optionCounts.map((n, i) => ({ n, i })).filter((o) => o.i !== q.correct).sort((a, b) => b.n - a.n)[0];
          return (
            <div key={q.questionId} style={{ border: "1px solid var(--border-color)", borderRadius: 12, padding: "12px 14px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start" }}>
                <div style={{ fontSize: 14, fontWeight: 500, color: "var(--gray-900)" }}>{q.text}</div>
                <div style={{ fontWeight: 600, color: tone, whiteSpace: "nowrap" }}>{rate}% correct</div>
              </div>
              <div className="progress-bar" style={{ marginTop: 8 }} role="progressbar" aria-valuenow={rate} aria-valuemin={0} aria-valuemax={100} aria-label="Correct answers">
                <div className="progress-fill" style={{ width: `${rate}%`, background: tone }} />
              </div>
              <div style={{ fontSize: 12.5, color: "var(--gray-600)", marginTop: 6, display: "flex", gap: 14, flexWrap: "wrap" }}>
                <span>Correct: <strong>{letter(q.correct)}</strong></span>
                {wrong && wrong.n > 0 && <span>Most chosen wrong: <strong>{letter(wrong.i)}</strong> ({wrong.n})</span>}
                {q.skipped > 0 && <span>Skipped: {q.skipped}</span>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
