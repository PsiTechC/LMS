"use client";

// L1–L4 Feedback — UI scaffolding only. Blocked on the Survey module (Group 2,
// deferred), which will capture the underlying reaction/learning/behavior/results
// responses. NO scores, percentages, or rows are populated here — everything is a
// static shell with an empty state until real survey data exists.

// ── Slate / Admin design tokens (FRONTEND_CLAUDE.md) ────────────────────────
const C = {
  navy: "#1C2551", slate: "#334155", slateL: "#64748b", orange: "#EF4E24",
  page: "#F5F7FB", card: "#FFFFFF", alt: "#F0F1F7", border: "#EAECF4",
  muted: "#8b90a7", green: "#22c55e", indigo: "#6B73BF",
};
const ff = { fontFamily: "Poppins, sans-serif" } as const;

const LEVELS = [
  { tag: "L1", title: "Reaction", sub: "Avg rating / 5",        color: C.indigo },
  { tag: "L2", title: "Learning", sub: "Avg knowledge gain",    color: "#0891B2" },
  { tag: "L3", title: "Behavior", sub: "Applying on job (90d)", color: C.green },
  { tag: "L4", title: "Results",  sub: "Business impact (180d)", color: C.orange },
];

const TABLE_COLS = [
  "Faculty", "L1 Reaction (/5)", "L2 Learning (%)", "L3 Behavior (%)", "L4 Results (%)", "Sessions", "Status",
];

export default function FacultyFeedback() {
  return (
    <div style={{ ...ff, padding: 24, display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Kirkpatrick explainer banner — static, no AI */}
      <div style={{ background: C.navy, borderRadius: 12, padding: "16px 20px", color: "#fff" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
          <span style={{ color: C.orange, fontWeight: 700 }}>✦</span>
          <span style={{ fontSize: 14, fontWeight: 700 }}>Kirkpatrick 4-Level Feedback Model</span>
        </div>
        <div style={{ fontSize: 12, color: "rgba(255,255,255,0.75)", lineHeight: 1.7 }}>
          <strong style={{ color: "#fff" }}>L1 Reaction</strong> — how participants felt about the session.{" "}
          <strong style={{ color: "#fff" }}>L2 Learning</strong> — knowledge gained.{" "}
          <strong style={{ color: "#fff" }}>L3 Behavior</strong> — on-the-job application (90 days).{" "}
          <strong style={{ color: "#fff" }}>L4 Results</strong> — business impact (180 days).
        </div>
      </div>

      {/* Four summary cards — empty (awaiting Survey module) */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16 }}>
        {LEVELS.map((lv) => (
          <div key={lv.tag} style={card.plain}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: lv.color, background: `${lv.color}18`, borderRadius: 6, padding: "3px 8px" }}>{lv.tag}</span>
              <span style={{ fontSize: 11, fontWeight: 600, color: C.muted }}>{lv.title}</span>
            </div>
            <div style={{ fontSize: 30, fontWeight: 800, color: C.border, lineHeight: 1.1 }}>—</div>
            <div style={{ fontSize: 11, color: C.muted, marginTop: 4 }}>{lv.sub}</div>
            {/* Empty progress track (no fill — no data) */}
            <div style={{ height: 6, background: C.alt, borderRadius: 99, marginTop: 12 }} />
          </div>
        ))}
      </div>

      {/* Per-faculty breakdown table structure — empty state */}
      <div style={card.table}>
        <div style={{ fontSize: 13, fontWeight: 700, color: C.navy, padding: "14px 18px" }}>Per-Faculty L1–L4 Breakdown</div>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ background: C.page }}>
              {TABLE_COLS.map((h, i) => (
                <th key={h} style={{ ...th, textAlign: i === 0 ? "left" : "center" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr style={{ borderTop: `1px solid ${C.border}` }}>
              <td colSpan={TABLE_COLS.length} style={{ padding: "56px 18px", textAlign: "center" }}>
                <div style={{ fontSize: 30, marginBottom: 12, color: C.border }}>◱</div>
                <div style={{ fontSize: 14, fontWeight: 600, color: C.slateL }}>
                  L1-L4 feedback data will appear here once the Survey module is live.
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

const th: React.CSSProperties = { padding: "11px 16px", fontSize: 11, fontWeight: 700, color: C.muted, letterSpacing: 0.5, whiteSpace: "nowrap" };
const card = {
  table: { background: C.card, borderRadius: 12, border: `1px solid ${C.border}`, boxShadow: "0 1px 4px rgba(28,37,81,0.07)", overflow: "hidden" } as React.CSSProperties,
  plain: { background: C.card, borderRadius: 12, border: `1px solid ${C.border}`, boxShadow: "0 1px 4px rgba(28,37,81,0.07)", padding: 18 } as React.CSSProperties,
};
