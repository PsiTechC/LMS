"use client";

import { Question } from "@/lib/content-api";
import { NAVY, MUTED, INDIGO, ORANGE, BG, BORDER } from "./shared";

const TYPE_LABELS: Record<string, string> = {
  mcq: "Multiple Choice",
  true_false: "True / False",
  matching: "Matching",
  open: "Open-Ended",
  scale: "Scale",
};

// Read-only rendering of a question list — used both for the manual builder's
// live summary and for the AI draft review screen.
export default function QuestionListPreview({ questions }: { questions: Question[] }) {
  if (questions.length === 0) {
    return <div style={{ padding: "24px 0", textAlign: "center", fontSize: 12, color: MUTED }}>No questions yet.</div>;
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {questions.map((q, i) => (
        <div key={q.id} style={{ border: `1px solid ${BORDER}`, borderRadius: 10, padding: "12px 14px", background: "#fff" }}>
          <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
            <div style={{ width: 22, height: 22, borderRadius: 6, background: "rgba(24, 40, 72,0.06)", color: NAVY, fontWeight: 700, fontSize: 10, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{i + 1}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: NAVY, lineHeight: 1.4, marginBottom: 6 }}>{q.text || <span style={{ color: MUTED, fontStyle: "italic" }}>Untitled question</span>}</div>
              <span style={{ fontSize: 9, fontWeight: 700, background: `${INDIGO}14`, color: INDIGO, borderRadius: 10, padding: "2px 8px" }}>{TYPE_LABELS[q.type] ?? q.type}</span>

              {q.type === "mcq" && q.options && (
                <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 4 }}>
                  {q.options.map((o, oi) => (
                    <div key={oi} style={{ fontSize: 11, color: oi === q.correct_index ? "#16a34a" : NAVY, background: oi === q.correct_index ? "rgba(34,197,94,0.08)" : BG, borderRadius: 6, padding: "4px 10px", fontWeight: oi === q.correct_index ? 700 : 400 }}>
                      {String.fromCharCode(65 + oi)}. {o} {oi === q.correct_index && "✓"}
                    </div>
                  ))}
                </div>
              )}

              {q.type === "true_false" && (
                <div style={{ marginTop: 8, display: "flex", gap: 6 }}>
                  {["True", "False"].map((o, oi) => (
                    <span key={o} style={{ fontSize: 11, color: oi === q.correct_index ? "#16a34a" : NAVY, background: oi === q.correct_index ? "rgba(34,197,94,0.08)" : BG, borderRadius: 6, padding: "4px 10px", fontWeight: oi === q.correct_index ? 700 : 400 }}>
                      {o} {oi === q.correct_index && "✓"}
                    </span>
                  ))}
                </div>
              )}

              {q.type === "matching" && q.match_pairs && (
                <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 4 }}>
                  {q.match_pairs.map((p, pi) => (
                    <div key={pi} style={{ fontSize: 11, color: NAVY, display: "flex", gap: 8, alignItems: "center" }}>
                      <span style={{ background: BG, borderRadius: 6, padding: "4px 10px", flex: 1 }}>{p.left}</span>
                      <span style={{ color: MUTED }}>→</span>
                      <span style={{ background: BG, borderRadius: 6, padding: "4px 10px", flex: 1 }}>{p.right}</span>
                    </div>
                  ))}
                </div>
              )}

              {q.type === "scale" && (
                <div style={{ marginTop: 8, display: "flex", gap: 5, flexWrap: "wrap" }}>
                  {(q.scale_labels?.length ? q.scale_labels : Array.from({ length: (q.scale_max ?? 5) - (q.scale_min ?? 1) + 1 }, (_, i2) => String((q.scale_min ?? 1) + i2))).map((label, li) => (
                    <span key={li} style={{ fontSize: 10, color: NAVY, background: BG, borderRadius: 6, padding: "4px 9px" }}>{li + (q.scale_min ?? 1)}. {label}</span>
                  ))}
                </div>
              )}

              {q.type === "open" && q.correct_text && (
                <div style={{ marginTop: 8, fontSize: 11, color: MUTED, fontStyle: "italic" }}>Model answer: {q.correct_text}</div>
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
