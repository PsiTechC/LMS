"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import {
  surveysAdminApi,
  AdminSurveyDTO,
  SurveyResultsDTO,
  QuestionResultDTO,
} from "@/lib/surveys-admin-api";

// ── Slate / Admin design tokens (FRONTEND_CLAUDE.md) ────────────────────────
const C = {
  navy: "#1C2551", slate: "#334155", slateL: "#64748b", orange: "#EF4E24",
  page: "#F5F7FB", card: "#FFFFFF", alt: "#F0F1F7", border: "#EAECF4",
  muted: "#8b90a7", green: "#22c55e", indigo: "#6B73BF",
};
const ff = { fontFamily: "Poppins, sans-serif" } as const;

const TYPE_LABEL: Record<string, string> = {
  pre: "Pre", mid: "Mid", post: "Post", pulse: "Pulse", session: "Session",
};

export default function SurveysAdmin({ orgId }: { orgId?: string }) {
  const [surveys, setSurveys] = useState<AdminSurveyDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr]         = useState("");
  const [typeFilter, setTypeFilter] = useState("All");
  const [resultsFor, setResultsFor] = useState<AdminSurveyDTO | null>(null);
  const [reminding, setReminding]   = useState<string>("");       // activity_id in-flight
  const [reminded, setReminded]     = useState<Record<string, number>>({}); // activity_id → sent count

  const load = useCallback(() => {
    setLoading(true); setErr("");
    surveysAdminApi.list(orgId || undefined)
      .then((r) => setSurveys(r.data ?? []))
      .catch((e) => setErr(e.message))
      .finally(() => setLoading(false));
  }, [orgId]);

  useEffect(() => { load(); }, [load]);

  const sendReminder = useCallback((s: AdminSurveyDTO) => {
    setReminding(s.activity_id); setErr("");
    surveysAdminApi.remind(s.activity_id)
      .then((r) => setReminded((m) => ({ ...m, [s.activity_id]: r.data?.sent ?? 0 })))
      .catch((e) => setErr(e.message))
      .finally(() => setReminding(""));
  }, []);

  const types = useMemo(
    () => ["All", ...Array.from(new Set(surveys.map((s) => s.survey_type)))],
    [surveys],
  );
  const filtered = useMemo(
    () => surveys.filter((s) => typeFilter === "All" || s.survey_type === typeFilter),
    [surveys, typeFilter],
  );

  // Summary cards — computed from the real list (matches the reference).
  const activeCount = filtered.filter((s) => s.status === "active").length;
  const totalResponses = filtered.reduce((a, s) => a + s.responses, 0);
  const avgCompletion = filtered.length
    ? Math.round(filtered.reduce((a, s) => a + s.completion, 0) / filtered.length)
    : 0;
  const typeCount = types.length - 1;

  const cards: { label: string; value: string; color: string }[] = [
    { label: "Active Surveys",  value: String(activeCount),        color: C.navy },
    { label: "Total Responses", value: totalResponses.toLocaleString(), color: C.orange },
    { label: "Avg Completion",  value: `${avgCompletion}%`,        color: C.green },
    { label: "Survey Types",    value: String(typeCount),          color: C.indigo },
  ];

  return (
    <div style={{ ...ff, padding: 24, display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Summary cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14 }}>
        {cards.map((c) => (
          <div key={c.label} style={card.plain}>
            <div style={{ fontSize: 11, color: C.muted, marginBottom: 5 }}>{c.label}</div>
            <div style={{ fontSize: 26, fontWeight: 800, color: c.color }}>{loading ? "—" : c.value}</div>
          </div>
        ))}
      </div>

      {/* Type filter pills */}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {types.map((t) => {
          const on = typeFilter === t;
          return (
            <button key={t} onClick={() => setTypeFilter(t)} style={{
              ...ff, padding: "6px 14px", borderRadius: 8, fontSize: 11, cursor: "pointer",
              fontWeight: on ? 700 : 500,
              background: on ? C.navy : "#fff", color: on ? "#fff" : C.muted,
              border: `1px solid ${on ? C.navy : C.border}`,
            }}>
              {t === "All" ? "All" : TYPE_LABEL[t] ?? t}
            </button>
          );
        })}
      </div>

      {err && <div style={banner.err}>{err}</div>}

      {/* Survey card list */}
      {loading ? (
        <div style={card.empty}>Loading surveys…</div>
      ) : filtered.length === 0 ? (
        <div style={{ ...card.plain, ...card.empty }}>No surveys found for this scope.</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {filtered.map((s) => (
            <SurveyCard
              key={s.activity_id}
              s={s}
              onViewResults={() => setResultsFor(s)}
              onSendReminder={() => sendReminder(s)}
              reminding={reminding === s.activity_id}
              remindedCount={reminded[s.activity_id]}
            />
          ))}
        </div>
      )}

      {resultsFor && (
        <ResultsModal survey={resultsFor} onClose={() => setResultsFor(null)} />
      )}
    </div>
  );
}

function SurveyCard({
  s, onViewResults, onSendReminder, reminding, remindedCount,
}: {
  s: AdminSurveyDTO;
  onViewResults: () => void;
  onSendReminder: () => void;
  reminding: boolean;
  remindedCount?: number;
}) {
  const active = s.status === "active";
  return (
    <div style={{ ...card.plain, padding: "16px 18px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12, gap: 12 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: C.navy, marginBottom: 2 }}>{displayTitle(s)}</div>
          <div style={{ fontSize: 11, color: C.muted }}>
            {s.program} · {s.org}{s.close_date ? ` · Closes ${fmtDate(s.close_date)}` : ""}
          </div>
          <div style={{ fontSize: 10, color: C.muted, marginTop: 3, display: "flex", gap: 10, flexWrap: "wrap" }}>
            <span>👥 {s.total_enrolled} participant{s.total_enrolled === 1 ? "" : "s"}</span>
            <span>🎓 {s.faculty} faculty</span>
            <span>🗂 {s.cohorts} cohort{s.cohorts === 1 ? "" : "s"}</span>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexShrink: 0 }}>
          <span style={pill(active ? C.green : C.indigo)}>{active ? "ACTIVE" : "CLOSED"}</span>
          <span style={pill(C.slate)}>{(TYPE_LABEL[s.survey_type] ?? s.survey_type).toUpperCase()}</span>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr 1fr", gap: 14, alignItems: "end" }}>
        {/* Response rate */}
        <div>
          <div style={{ fontSize: 10, color: C.muted, marginBottom: 4 }}>Response Rate</div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ flex: 1, height: 6, background: C.alt, borderRadius: 99, overflow: "hidden" }}>
              <div style={{ height: "100%", width: `${Math.min(100, s.completion)}%`, background: C.green, borderRadius: 99 }} />
            </div>
            <span style={{ fontSize: 12, fontWeight: 700, color: C.green }}>{s.completion}%</span>
          </div>
          <div style={{ fontSize: 10, color: C.muted, marginTop: 2 }}>{s.responses} of {s.total_enrolled} responded</div>
        </div>

        {/* Avg score */}
        <div>
          <div style={{ fontSize: 10, color: C.muted, marginBottom: 4 }}>Avg Score</div>
          <div style={{ fontSize: 20, fontWeight: 800, color: C.orange }}>{s.responses > 0 ? s.avg_score : "—"}</div>
          <div style={{ fontSize: 10, color: C.muted }}>mean of responses</div>
        </div>

        {/* Actions */}
        <div style={{ display: "flex", flexDirection: "column", gap: 4, alignItems: "stretch" }}>
          <div style={{ display: "flex", gap: 6 }}>
            <button
              onClick={onViewResults}
              style={{ ...ff, flex: 1, padding: "7px 0", background: C.page, border: `1px solid ${C.border}`, borderRadius: 7, fontSize: 11, fontWeight: 600, color: C.navy, cursor: "pointer" }}
            >
              View Results
            </button>
            {active && (
              <button
                onClick={onSendReminder}
                disabled={reminding}
                style={{ ...ff, flex: 1, padding: "7px 0", background: C.navy, border: "none", borderRadius: 7, fontSize: 11, fontWeight: 700, color: "#fff", cursor: reminding ? "default" : "pointer", opacity: reminding ? 0.6 : 1 }}
              >
                {reminding ? "Sending…" : "Send Reminder"}
              </button>
            )}
          </div>
          {remindedCount !== undefined && (
            <div style={{ fontSize: 10, fontWeight: 600, color: C.green, textAlign: "right" }}>
              {remindedCount > 0
                ? `✓ Reminder sent to ${remindedCount} participant${remindedCount === 1 ? "" : "s"}`
                : "✓ Everyone has already responded"}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── View Results modal ──────────────────────────────────────────────────────

function ResultsModal({ survey, onClose }: { survey: AdminSurveyDTO; onClose: () => void }) {
  const [data, setData]   = useState<SurveyResultsDTO | null>(null);
  const [loading, setLoad] = useState(true);
  const [err, setErr]     = useState("");

  useEffect(() => {
    setLoad(true); setErr("");
    surveysAdminApi.results(survey.activity_id)
      .then((r) => setData(r.data ?? null))
      .catch((e) => setErr(e.message))
      .finally(() => setLoad(false));
  }, [survey.activity_id]);

  return (
    <div style={modal.overlay} onClick={onClose}>
      <div style={modal.container} onClick={(e) => e.stopPropagation()}>
        {/* Header strip */}
        <div style={modal.header}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: C.navy }}>{displayTitle(survey)}</div>
            <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>{survey.program} · {survey.org}</div>
          </div>
          <button onClick={onClose} style={modal.close} aria-label="Close">✕</button>
        </div>

        {/* Body */}
        <div style={modal.body}>
          {loading ? (
            <div style={{ padding: 24, textAlign: "center", color: C.muted, fontSize: 13 }}>Loading results…</div>
          ) : err ? (
            <div style={banner.err}>{err}</div>
          ) : !data ? (
            <div style={{ padding: 24, textAlign: "center", color: C.muted, fontSize: 13 }}>No results.</div>
          ) : (
            <>
              {/* Summary strip */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginBottom: 18 }}>
                <MiniStat label="Responses" value={String(data.responses)} color={C.orange} />
                <MiniStat label="Enrolled" value={String(data.total_enrolled)} color={C.navy} />
                <MiniStat label="Response Rate" value={`${data.completion}%`} color={C.green} />
              </div>

              {/* Faculty */}
              <SectionLabel>Faculty ({data.faculty.length})</SectionLabel>
              <div style={{ marginBottom: 16 }}>
                {data.faculty.length === 0 ? (
                  <div style={{ fontSize: 12, color: C.muted }}>No faculty enrolled in this program.</div>
                ) : (
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {data.faculty.map((f) => <span key={f} style={pill(C.indigo)}>{f}</span>)}
                  </div>
                )}
              </div>

              {/* Enrolled participants roster */}
              <SectionLabel>Enrolled Participants ({data.roster.length})</SectionLabel>
              <div style={{ marginBottom: 18, border: `1px solid ${C.border}`, borderRadius: 10, overflow: "hidden" }}>
                {data.roster.length === 0 ? (
                  <div style={{ fontSize: 12, color: C.muted, padding: 12 }}>No participants enrolled.</div>
                ) : (
                  data.roster.map((r, i) => (
                    <div key={r.email || i} style={{
                      display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10,
                      padding: "9px 12px", borderTop: i === 0 ? "none" : `1px solid ${C.border}`,
                    }}>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 12, fontWeight: 600, color: C.navy, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r.name}</div>
                        <div style={{ fontSize: 10, color: C.muted }}>{r.email}{r.cohort ? ` · ${r.cohort}` : ""}</div>
                      </div>
                      <span style={pill(r.responded ? C.green : C.muted)}>{r.responded ? "RESPONDED" : "PENDING"}</span>
                    </div>
                  ))
                )}
              </div>

              <SectionLabel>Question Breakdown</SectionLabel>
              <div style={{ marginBottom: 4 }} />

              {data.questions.length === 0 ? (
                <div style={{ ...card.plain, ...card.empty, padding: 28 }}>
                  This survey has no questions authored yet.
                </div>
              ) : data.responses === 0 ? (
                <div style={{ ...card.plain, ...card.empty, padding: 28 }}>
                  No responses submitted yet.
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                  {data.questions.map((q, i) => (
                    <QuestionResult key={q.id} q={q} index={i + 1} />
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: 10, fontWeight: 700, color: C.muted, letterSpacing: 0.5, textTransform: "uppercase", marginBottom: 8 }}>
      {children}
    </div>
  );
}

function MiniStat({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div style={{ background: C.page, border: `1px solid ${C.border}`, borderRadius: 10, padding: "10px 12px" }}>
      <div style={{ fontSize: 10, color: C.muted, marginBottom: 3, textTransform: "uppercase", letterSpacing: 0.5, fontWeight: 700 }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 800, color }}>{value}</div>
    </div>
  );
}

function QuestionResult({ q, index }: { q: QuestionResultDTO; index: number }) {
  const maxCount = Math.max(1, ...(q.distribution?.map((d) => d.count) ?? [1]));
  return (
    <div style={{ ...card.plain, padding: "14px 16px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, marginBottom: 10 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: C.navy }}>
          <span style={{ color: C.muted, marginRight: 6 }}>Q{index}.</span>{q.text}
        </div>
        <span style={pill(C.slate)}>{q.type.toUpperCase()}</span>
      </div>

      {/* Numeric average */}
      {q.average !== undefined && (
        <div style={{ fontSize: 11, color: C.muted, marginBottom: 8 }}>
          Average: <strong style={{ color: C.orange, fontSize: 13 }}>{q.average}</strong>
          <span style={{ marginLeft: 10 }}>{q.response_count} response{q.response_count === 1 ? "" : "s"}</span>
        </div>
      )}

      {/* Distribution bars (numeric + mcq) */}
      {q.distribution && q.distribution.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {q.distribution.map((d) => (
            <div key={d.label} style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{ width: 90, fontSize: 11, color: C.navy, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }} title={d.label}>{d.label}</div>
              <div style={{ flex: 1, height: 14, background: C.alt, borderRadius: 99, overflow: "hidden" }}>
                <div style={{ height: "100%", width: `${(d.count / maxCount) * 100}%`, background: C.indigo, borderRadius: 99 }} />
              </div>
              <div style={{ width: 24, fontSize: 11, fontWeight: 700, color: C.navy, textAlign: "right" }}>{d.count}</div>
            </div>
          ))}
        </div>
      )}

      {/* Open-text answers */}
      {q.type === "open" && (
        q.text_answers && q.text_answers.length > 0 ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {q.text_answers.map((t, i) => (
              <div key={i} style={{ fontSize: 12, color: C.navy, background: C.page, border: `1px solid ${C.border}`, borderRadius: 8, padding: "8px 10px" }}>
                “{t}”
              </div>
            ))}
          </div>
        ) : (
          <div style={{ fontSize: 11, color: C.muted }}>No text responses yet.</div>
        )
      )}
    </div>
  );
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { day: "numeric", month: "short" });
}

// displayTitle falls back to a descriptive label when the survey activity still
// carries the placeholder name "Survey" (i.e. it was never titled in the Studio).
function displayTitle(s: { title: string; survey_type: string; program: string }) {
  const t = (s.title || "").trim();
  if (t && t.toLowerCase() !== "survey") return t;
  const type = TYPE_LABEL[s.survey_type] ?? s.survey_type;
  return `${type} Survey · ${s.program}`;
}

const pill = (color: string): React.CSSProperties => ({
  display: "inline-block", background: `${color}18`, color,
  fontSize: 9, fontWeight: 700, borderRadius: 10, padding: "3px 8px", whiteSpace: "nowrap",
});
const card = {
  plain: { background: C.card, borderRadius: 12, border: `1px solid ${C.border}`, boxShadow: "0 1px 4px rgba(28,37,81,0.06)", padding: "16px 18px" } as React.CSSProperties,
  empty: { padding: 40, textAlign: "center", color: C.muted, fontSize: 13 } as React.CSSProperties,
};
const banner = {
  err: { background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.25)", borderRadius: 8, padding: "10px 14px", fontSize: 12, color: "#ef4444" } as React.CSSProperties,
};
const modal = {
  overlay: { position: "fixed", inset: 0, background: "rgba(28,37,81,0.5)", zIndex: 2000, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 } as React.CSSProperties,
  container: { ...ff, background: "#fff", borderRadius: 16, maxWidth: 620, width: "100%", maxHeight: "88vh", overflow: "hidden", boxShadow: "0 24px 64px rgba(28,37,81,0.22)", display: "flex", flexDirection: "column" } as React.CSSProperties,
  header: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, padding: "18px 24px", borderBottom: `1px solid ${C.border}` } as React.CSSProperties,
  close: { ...ff, background: C.page, border: `1px solid ${C.border}`, borderRadius: 6, width: 28, height: 28, fontSize: 13, color: C.muted, cursor: "pointer", flexShrink: 0 } as React.CSSProperties,
  body: { padding: 24, overflowY: "auto" } as React.CSSProperties,
};
