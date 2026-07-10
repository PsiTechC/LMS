"use client";

import { useCallback, useEffect, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import {
  feedback360Api, CycleDTO, QuorumDTO, CompetencyScoreDTO, AddRaterPayload,
} from "@/lib/feedback360-api";

const NAVY = "#1C2551";
const ORANGE = "#EF4E24";
const INDIGO = "#6B73BF";
const GREEN = "#22c55e";
const AMBER = "#f59e0b";
const PAGE = "#F5F7FB";
const BORDER = "#EAECF4";
const MUTED = "#8b90a7";
const SHADOW = "0 1px 4px rgba(28,37,81,0.07)";

type Tab = "results" | "raters" | "tracker";

const REL_LABEL: Record<string, string> = {
  manager: "Manager", peer: "Peer", direct_report: "Direct Report",
  skip_level: "Skip Level", others: "Others",
};
const REL_COLOR: Record<string, string> = {
  manager: NAVY, peer: INDIGO, direct_report: GREEN,
  skip_level: ORANGE, others: MUTED,
};
// Relationships a participant may nominate. 'self' is seeded by the system.
const NOMINABLE = ["manager", "peer", "direct_report", "skip_level", "others"] as const;

// relLabel resolves a relationship's participant-facing name. The admin can
// rename the "Others" category (e.g. "Customers"); the server sends that name on
// each quorum row, so prefer it over the static default.
function relLabel(rel: string, quorum: QuorumDTO[]): string {
  const q = quorum.find((x) => x.relationship === rel);
  return q?.label?.trim() || REL_LABEL[rel] || rel;
}

export default function Feedback360Experience({ programId }: { programId?: string }) {
  const [cycle, setCycle] = useState<CycleDTO | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>("results");

  const load = useCallback(async () => {
    try {
      const res = await feedback360Api.myCycle(programId);
      setCycle(normalizeCycle(res.data));
    } catch {
      setCycle(null); // 404 = not assigned to a cycle
    }
  }, [programId]);

  useEffect(() => {
    let cancelled = false;
    void Promise.resolve().then(() => {
      if (cancelled) return;
      setLoading(true);
      load().finally(() => { if (!cancelled) setLoading(false); });
    });
    return () => { cancelled = true; };
  }, [load]);

  if (loading) return <Page><SoftEmpty label="Loading your 360° feedback..." /></Page>;

  // 360° cycles are created and assigned by an administrator — a participant can
  // no longer start their own. Without an assignment there is nothing to show.
  if (!cycle) {
    return (
      <Page>
        <EmptyCard
          title="No 360° feedback cycle yet"
          body="Your programme administrator will assign you to a 360° feedback cycle. When they do, you'll get a notification here and by email, and you'll be able to nominate your reviewers from this page."
        />
      </Page>
    );
  }

  const pct = cycle.raters_invited ? Math.round((cycle.raters_submitted / cycle.raters_invited) * 100) : 0;
  const allQuorumMet = cycle.quorum.length > 0 && cycle.quorum.every((q) => q.met);

  return (
    <Page>
      {/* Summary row */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 12 }}>
        <Metric label="Raters Invited" value={String(cycle.raters_invited)} sub="Total nominated" color={NAVY} />
        <Metric label="Submitted" value={String(cycle.raters_submitted)} sub={`${cycle.raters_submitted}/${cycle.raters_invited} received`} color={GREEN} />
        <Metric label="Pending" value={String(cycle.raters_invited - cycle.raters_submitted)} sub="Awaiting response" color={AMBER} />
        <Metric label="Quorum" value={allQuorumMet ? "Met" : "Incomplete"} sub={allQuorumMet ? "All categories filled" : "Min raters needed"} color={allQuorumMet ? GREEN : ORANGE} />
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 8 }}>
        {([["results", "360 Results"], ["raters", "Manage Raters"], ["tracker", "Response Tracker"]] as [Tab, string][]).map(([key, label]) => (
          <button key={key} onClick={() => setTab(key)} style={{ ...tabStyle, ...(tab === key ? tabActiveStyle : {}) }}>{label}</button>
        ))}
      </div>

      {tab === "results" && <ResultsTab cycle={cycle} />}
      {tab === "raters" && <RatersTab cycle={cycle} onChange={(c) => setCycle(normalizeCycle(c))} />}
      {tab === "tracker" && <TrackerTab cycle={cycle} onChange={(c) => setCycle(normalizeCycle(c))} completionPct={pct} />}
    </Page>
  );
}

// ── Results tab: radar + bars + AI narrative ──────────────────────────────────
function ResultsTab({ cycle }: { cycle: CycleDTO }) {
  const comps = cycle.competencies ?? [];
  const hasScores = comps.some((c) => c.others_score != null || c.self_score != null);

  return (
    <div style={{ display: "grid", gridTemplateColumns: "300px minmax(0,1fr)", gap: 16 }}>
      <Card>
        <SectionTitle title="Competency Radar" />
        {hasScores ? <Radar comps={comps} /> : <AwaitingBlock label="No responses yet" body="The self-vs-others radar appears once you and your raters submit ratings." />}
        {hasScores && (
          <div style={{ display: "flex", gap: 12, justifyContent: "center", marginTop: 8 }}>
            <Legend color={ORANGE} label="Self" />
            <Legend color={NAVY} label="Others" />
          </div>
        )}
      </Card>

      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <Card style={{ background: "rgba(239,78,36,0.03)", border: "1px solid rgba(239,78,36,0.15)" }}>
          <div style={{ fontSize: 11, fontWeight: 800, color: ORANGE, marginBottom: 8 }}>✦ AI Narrative Summary</div>
          <div style={{ fontSize: 12, color: NAVY, lineHeight: 1.7 }}>
            {cycle.ai_summary
              ? cycle.ai_summary
              : "Your developmental narrative — strengths, blind spots, and recommended focus areas — is generated automatically once raters submit their feedback."}
          </div>
        </Card>

        <Card>
          <SectionTitle title="Competency Scores — Self vs Others" />
          {hasScores ? comps.map((c) => <CompetencyBar key={c.competency_id} comp={c} />) : <AwaitingBlock label="Awaiting scores" body="Per-competency comparison appears here as responses arrive." />}
        </Card>

        <button style={{ ...primaryButton, alignSelf: "flex-start" }} onClick={() => window.print()}>Download PDF Report</button>
      </div>
    </div>
  );
}

function Radar({ comps }: { comps: CompetencyScoreDTO[] }) {
  const items = comps.slice(0, 8);
  const n = Math.max(items.length, 3);
  const W = 260, H = 240, cx = 130, cy = 120, r = 88, max = 5;
  const toXY = (i: number, val: number) => {
    const a = (i / n) * 2 * Math.PI - Math.PI / 2, rad = (val / max) * r;
    return { x: cx + rad * Math.cos(a), y: cy + rad * Math.sin(a) };
  };
  const labelXY = (i: number) => {
    const a = (i / n) * 2 * Math.PI - Math.PI / 2;
    return { x: cx + (r + 20) * Math.cos(a), y: cy + (r + 20) * Math.sin(a) };
  };
  const poly = (key: "self_score" | "others_score") =>
    items.map((c, i) => { const p = toXY(i, c[key] ?? 0); return `${p.x},${p.y}`; }).join(" ");

  return (
    <svg width={W} height={H} style={{ maxWidth: "100%" }}>
      {[1, 2, 3, 4, 5].map((lvl) => {
        const pts = Array.from({ length: n }).map((_, i) => {
          const a = (i / n) * 2 * Math.PI - Math.PI / 2, rad = (lvl / 5) * r;
          return `${cx + rad * Math.cos(a)},${cy + rad * Math.sin(a)}`;
        }).join(" ");
        return <polygon key={lvl} points={pts} fill="none" stroke={BORDER} strokeWidth="1" />;
      })}
      {Array.from({ length: n }).map((_, i) => {
        const a = (i / n) * 2 * Math.PI - Math.PI / 2;
        return <line key={i} x1={cx} y1={cy} x2={cx + r * Math.cos(a)} y2={cy + r * Math.sin(a)} stroke={BORDER} strokeWidth="1" />;
      })}
      <polygon points={poly("others_score")} fill="rgba(28,37,81,0.12)" stroke={NAVY} strokeWidth="2" />
      <polygon points={poly("self_score")} fill="rgba(239,78,36,0.15)" stroke={ORANGE} strokeWidth="2" />
      {items.map((c, i) => { const lp = labelXY(i); return <text key={c.competency_id} x={lp.x} y={lp.y} textAnchor="middle" dominantBaseline="middle" fontSize="8" fill={MUTED}>{c.title.split(" ")[0]}</text>; })}
    </svg>
  );
}

function CompetencyBar({ comp }: { comp: CompetencyScoreDTO }) {
  const self = comp.self_score ?? 0, others = comp.others_score ?? 0;
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
        <span style={{ fontSize: 12, color: NAVY, fontWeight: 500 }}>{comp.title}</span>
        <span style={{ fontSize: 11 }}>
          <span style={{ color: ORANGE, fontWeight: 700 }}>Self: {comp.self_score != null ? self : "—"}</span>
          <span style={{ color: MUTED }}> / Others: {comp.others_score != null ? others : "—"}</span>
        </span>
      </div>
      <div style={{ position: "relative", height: 7, background: "#F0F1F7", borderRadius: 99 }}>
        <div style={{ position: "absolute", height: "100%", width: `${(others / 5) * 100}%`, background: "rgba(28,37,81,0.25)", borderRadius: 99 }} />
        <div style={{ position: "absolute", height: "100%", width: `${(self / 5) * 100}%`, background: ORANGE, borderRadius: 99, opacity: 0.8 }} />
      </div>
    </div>
  );
}

// ── Manage Raters tab ─────────────────────────────────────────────────────────
function RatersTab({ cycle, onChange }: { cycle: CycleDTO; onChange: (c: CycleDTO) => void }) {
  const [addOpen, setAddOpen] = useState(false);
  const [form, setForm] = useState<AddRaterPayload>({ name: "", email: "", relationship: "peer" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function addRater() {
    if (!form.name.trim() || !form.email.trim()) { setError("Name and email are required."); return; }
    setBusy(true); setError("");
    try {
      const res = await feedback360Api.addRater(cycle.id, form);
      onChange(res.data);
      setForm({ name: "", email: "", relationship: "peer" });
      setAddOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to add rater");
    } finally { setBusy(false); }
  }

  async function remove(raterId: string) {
    const res = await feedback360Api.removeRater(cycle.id, raterId);
    onChange(res.data);
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {/* Quorum — one card per relationship category from this cycle's admin-set
          config. A minimum of 0 still shows: the category accepts nominations,
          it just isn't required for quorum. */}
      <Card>
        <SectionTitle title="Minimum Quorum Requirements" />
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10 }}>
          {cycle.quorum.map((q) => <QuorumCard key={q.relationship} q={q} />)}
        </div>
      </Card>

      {/* Add rater */}
      {addOpen ? (
        <Card style={{ background: "rgba(239,78,36,0.03)", border: "1px solid rgba(239,78,36,0.15)" }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: ORANGE, marginBottom: 14 }}>Add a Rater</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 12 }}>
            <Field label="Full Name"><input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="e.g. Vikram Singh" style={inputStyle} /></Field>
            <Field label="Work Email"><input value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} placeholder="name@company.com" style={inputStyle} /></Field>
            <Field label="Relationship">
              <select value={form.relationship} onChange={(e) => setForm((f) => ({ ...f, relationship: e.target.value as AddRaterPayload["relationship"] }))} style={{ ...inputStyle, background: "#fff" }}>
                {NOMINABLE.map((o) => <option key={o} value={o}>{relLabel(o, cycle.quorum)}</option>)}
              </select>
            </Field>
          </div>
          {error && <div style={{ color: "#ef4444", fontSize: 12, fontWeight: 600, marginBottom: 10 }}>{error}</div>}
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={addRater} disabled={busy} style={{ ...primaryButton, opacity: busy ? 0.7 : 1 }}>{busy ? "Adding..." : "Add & Send Invite"}</button>
            <button onClick={() => { setAddOpen(false); setError(""); }} style={secondaryButton}>Cancel</button>
          </div>
        </Card>
      ) : (
        <button onClick={() => setAddOpen(true)} style={dashedButton}>+ Nominate a Rater</button>
      )}

      {/* Rater list */}
      <Card>
        <SectionTitle title={`Nominated Raters (${cycle.raters.length})`} />
        {cycle.raters.length === 0 && <SoftEmpty label="No raters nominated yet. Add managers, peers, and direct reports above." />}
        {cycle.raters.map((r) => (
          <div key={r.id} style={{ display: "flex", gap: 12, padding: "10px 0", borderBottom: `1px solid ${BORDER}`, alignItems: "center" }}>
            <div style={{ width: 34, height: 34, borderRadius: "50%", background: REL_COLOR[r.relationship] || NAVY, color: "#fff", fontWeight: 800, fontSize: 11, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              {initials(r.name)}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: NAVY }}>{r.name}</div>
              <div style={{ fontSize: 10, color: MUTED }}>{r.email} · <span style={{ color: REL_COLOR[r.relationship], fontWeight: 600 }}>{relLabel(r.relationship, cycle.quorum)}</span></div>
            </div>
            <Badge label={r.status === "submitted" ? "Submitted" : "Pending"} color={r.status === "submitted" ? GREEN : AMBER} />
            <button onClick={() => remove(r.id)} style={{ fontSize: 12, color: "#D0D3E0", background: "none", border: "none", cursor: "pointer", flexShrink: 0 }}>✕</button>
          </div>
        ))}
      </Card>
    </div>
  );
}

// QuorumCard shows one relationship category. A minimum of 0 means the category
// is optional — reviewers can still be nominated, but none are required, so it
// reads "Optional" rather than a meaningless "0/0".
function QuorumCard({ q }: { q: QuorumDTO }) {
  const optional = q.min === 0;
  const accent = optional ? MUTED : q.met ? GREEN : ORANGE;
  const bg = optional ? "rgba(139,144,167,0.05)" : q.met ? "rgba(34,197,94,0.06)" : "rgba(239,78,36,0.04)";
  const bd = optional ? "rgba(139,144,167,0.18)" : q.met ? "rgba(34,197,94,0.2)" : "rgba(239,78,36,0.15)";

  return (
    <div style={{ padding: "12px 14px", background: bg, border: `1px solid ${bd}`, borderRadius: 10 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: REL_COLOR[q.relationship] || NAVY, marginBottom: 4 }}>{q.label?.trim() || REL_LABEL[q.relationship]}</div>
      <div style={{ fontSize: 20, fontWeight: 800, color: accent }}>
        {optional ? `${q.submitted}` : `${q.submitted}/${q.min}`}
      </div>
      <div style={{ fontSize: 10, color: MUTED, marginTop: 2 }}>
        {q.nominated} nominated · {optional ? "Optional" : `Min ${q.min} response${q.min > 1 ? "s" : ""}`}
      </div>
      <div style={{ height: 4, background: "#E0E3EF", borderRadius: 99, marginTop: 6 }}>
        <div style={{ height: "100%", width: optional ? "100%" : `${Math.min(q.submitted / Math.max(q.min, 1), 1) * 100}%`, background: accent, borderRadius: 99, opacity: optional ? 0.35 : 1 }} />
      </div>
    </div>
  );
}

// ── Response Tracker tab ──────────────────────────────────────────────────────
function TrackerTab({ cycle, onChange, completionPct }: { cycle: CycleDTO; onChange: (c: CycleDTO) => void; completionPct: number }) {
  const [remindedIds, setRemindedIds] = useState<string[]>(() => cycle.raters.filter((r) => r.reminded_at).map((r) => r.id));
  const pending = cycle.raters.filter((r) => r.status === "pending");

  async function remind(raterId: string) {
    const res = await feedback360Api.remindRater(cycle.id, raterId);
    onChange(res.data);
    setRemindedIds((prev) => [...prev, raterId]);
  }
  async function remindAll() {
    for (const r of pending) {
      // sequential to keep server state consistent; small N
      const res = await feedback360Api.remindRater(cycle.id, r.id);
      onChange(res.data);
    }
    setRemindedIds((prev) => [...prev, ...pending.map((r) => r.id)]);
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <Card>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <div style={{ fontWeight: 700, fontSize: 13, color: NAVY }}>Overall Completion</div>
          <div style={{ fontSize: 14, fontWeight: 800, color: ORANGE }}>{completionPct}%</div>
        </div>
        <div style={{ height: 10, background: "#F0F1F7", borderRadius: 99, marginBottom: 8 }}>
          <div style={{ height: "100%", width: `${completionPct}%`, background: GREEN, borderRadius: 99, transition: "width 0.4s" }} />
        </div>
        <div style={{ fontSize: 11, color: MUTED }}>
          {cycle.raters_submitted} of {cycle.raters_invited} raters responded{cycle.deadline ? ` · Deadline: ${formatDate(cycle.deadline)}` : ""}
        </div>
      </Card>

      {/* Per-category — count varies with the cycle's quorum config. */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 12 }}>
        {cycle.quorum.map((q) => (
          <Card key={q.relationship} style={{ padding: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: NAVY }}>{q.label?.trim() || REL_LABEL[q.relationship]}</span>
              <span style={{ fontSize: 13, fontWeight: 800, color: REL_COLOR[q.relationship] || NAVY }}>{q.submitted}/{q.nominated}</span>
            </div>
            <div style={{ height: 6, background: "#F0F1F7", borderRadius: 99, marginBottom: 6 }}>
              <div style={{ height: "100%", width: q.nominated > 0 ? `${(q.submitted / q.nominated) * 100}%` : "0%", background: REL_COLOR[q.relationship] || NAVY, borderRadius: 99 }} />
            </div>
            <div style={{ fontSize: 10, color: MUTED }}>Min required: {q.min}</div>
          </Card>
        ))}
      </div>

      {/* Individual status */}
      <Card>
        <SectionTitle title="Individual Rater Status" />
        {cycle.raters.length === 0 && <SoftEmpty label="No raters to track yet." />}
        {cycle.raters.map((r) => (
          <div key={r.id} style={{ display: "flex", gap: 12, padding: "10px 0", borderBottom: `1px solid ${BORDER}`, alignItems: "center" }}>
            <div style={{ width: 8, height: 8, borderRadius: "50%", background: r.status === "submitted" ? GREEN : AMBER, flexShrink: 0 }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: NAVY }}>{r.name}</span>
              <span style={{ fontSize: 10, color: MUTED, marginLeft: 8 }}>{relLabel(r.relationship, cycle.quorum)}</span>
            </div>
            <Badge label={r.status === "submitted" ? "Responded" : "Awaiting"} color={r.status === "submitted" ? GREEN : AMBER} />
            {r.status === "pending" && (
              <button onClick={() => remind(r.id)} style={{ padding: "4px 10px", border: `1.5px solid ${remindedIds.includes(r.id) ? GREEN : "#D0D3E0"}`, borderRadius: 6, background: "#fff", color: remindedIds.includes(r.id) ? GREEN : MUTED, fontSize: 10, fontWeight: 700, cursor: "pointer", fontFamily: "Poppins, sans-serif", flexShrink: 0 }}>
                {remindedIds.includes(r.id) ? "✓ Reminded" : "Remind"}
              </button>
            )}
          </div>
        ))}
        {pending.length > 0 && (
          <button onClick={remindAll} style={{ marginTop: 12, width: "100%", padding: 9, border: "none", borderRadius: 8, background: NAVY, color: "#fff", fontWeight: 700, fontSize: 12, cursor: "pointer", fontFamily: "Poppins, sans-serif" }}>
            Send Reminder to All Pending ({pending.length})
          </button>
        )}
      </Card>
    </div>
  );
}

// ── primitives ────────────────────────────────────────────────────────────────
function Page({ children }: { children: ReactNode }) {
  return <div style={{ padding: 24, display: "flex", flexDirection: "column", gap: 16, fontFamily: "Poppins, sans-serif", background: PAGE }}>{children}</div>;
}
function Card({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return <div style={{ background: "#fff", borderRadius: 12, border: `1px solid ${BORDER}`, boxShadow: SHADOW, padding: 20, ...style }}>{children}</div>;
}
function SectionTitle({ title }: { title: string }) {
  return <div style={{ fontSize: 13, fontWeight: 700, color: NAVY, marginBottom: 12 }}>{title}</div>;
}
function Metric({ label, value, sub, color }: { label: string; value: string; sub: string; color: string }) {
  return (
    <Card style={{ padding: "14px 16px" }}>
      <div style={{ display: "flex", justifyContent: "space-between" }}>
        <div><div style={{ fontSize: 11, color: MUTED, marginBottom: 4 }}>{label}</div><div style={{ fontSize: 24, fontWeight: 800, color }}>{value}</div><div style={{ fontSize: 10, color: MUTED, marginTop: 3 }}>{sub}</div></div>
      </div>
    </Card>
  );
}
function Badge({ label, color = ORANGE }: { label: string; color?: string }) {
  return <span style={{ background: `${color}14`, color, fontSize: 10, fontWeight: 700, borderRadius: 20, padding: "3px 9px", whiteSpace: "nowrap" }}>{label}</span>;
}
function Legend({ color, label }: { color: string; label: string }) {
  return <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, color: MUTED }}><span style={{ width: 12, height: 3, background: color, display: "inline-block", borderRadius: 2 }} />{label}</div>;
}
function Field({ label, children }: { label: string; children: ReactNode }) {
  return <div><label style={{ fontSize: 10, fontWeight: 700, color: MUTED, letterSpacing: 0.5, display: "block", marginBottom: 5, textTransform: "uppercase" }}>{label}</label>{children}</div>;
}
function AwaitingBlock({ label, body }: { label: string; body: string }) {
  return (
    <div style={{ padding: "18px 16px", background: "#F9FAFB", border: `1px dashed ${BORDER}`, borderRadius: 10 }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: NAVY, marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 11, color: MUTED, lineHeight: 1.6 }}>{body}</div>
    </div>
  );
}
function SoftEmpty({ label }: { label: string }) {
  return <div style={{ padding: "24px 0", textAlign: "center", color: MUTED, fontSize: 12 }}>{label}</div>;
}
function EmptyCard({ title, body, action }: { title: string; body: string; action?: ReactNode }) {
  return (
    <Card style={{ padding: 48, textAlign: "center" }}>
      <div style={{ fontSize: 18, fontWeight: 800, color: NAVY, marginBottom: 8 }}>{title}</div>
      <div style={{ fontSize: 13, color: MUTED, lineHeight: 1.65, maxWidth: 520, margin: "0 auto 18px" }}>{body}</div>
      {action}
    </Card>
  );
}

// normalizeCycle guarantees array fields are never null (Go marshals empty
// slices as null), so every tab can safely map/filter/some over them.
function normalizeCycle(c: CycleDTO): CycleDTO {
  return { ...c, raters: c.raters ?? [], quorum: c.quorum ?? [], competencies: c.competencies ?? [] };
}

function initials(name: string) { return name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase(); }
function formatDate(iso: string) { return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }); }

const tabStyle: CSSProperties = { padding: "8px 18px", border: `1px solid ${BORDER}`, borderRadius: 20, background: "#fff", color: MUTED, fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "Poppins, sans-serif" };
const tabActiveStyle: CSSProperties = { background: "rgba(239,78,36,0.08)", color: ORANGE, border: `1.5px solid ${ORANGE}`, fontWeight: 700 };
const primaryButton: CSSProperties = { padding: "9px 20px", background: ORANGE, border: "none", borderRadius: 8, color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "Poppins, sans-serif", whiteSpace: "nowrap" };
const secondaryButton: CSSProperties = { padding: "9px 16px", border: `1px solid ${BORDER}`, borderRadius: 8, background: "#fff", color: MUTED, fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "Poppins, sans-serif" };
const dashedButton: CSSProperties = { padding: "10px 22px", border: `1.5px dashed #D0D3E0`, borderRadius: 10, background: "#FAFBFC", color: MUTED, fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "Poppins, sans-serif", width: "100%" };
const inputStyle: CSSProperties = { width: "100%", border: `1.5px solid ${BORDER}`, borderRadius: 8, padding: "8px 10px", fontSize: 12, fontFamily: "Poppins, sans-serif", color: NAVY, outline: "none", boxSizing: "border-box" };
