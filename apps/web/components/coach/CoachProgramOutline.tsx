"use client";

import { useEffect, useMemo, useState } from "react";
import { coachApi, type CoachingEngagementDTO, type CoachGoalDTO, type CoachDocumentDTO } from "@/lib/coach-api";
import { programsApi, type ProgramDetailDTO, type PhaseDTO } from "@/lib/programs-api";

// ── Design tokens ─────────────────────────────────────────────────
const ff = { fontFamily: "Poppins, sans-serif" } as const;
const NAVY = "#1C2551";
const ORANGE = "#EF4E24";
const COACH = "#0891B2";
const INDIGO = "#6B73BF";
const GREEN = "#22c55e";
const CARD = "#fff";
const BORDER = "#EAECF4";
const PAGE = "#F5F7FB";
const MUTED = "#8b90a7";
const TRACK = "#F0F1F7";

const AVATAR_COLORS = [ORANGE, GREEN, INDIGO, COACH, "#8b5cf6", "#f59e0b"];

function initials(name: string): string {
  return name.split(" ").map((n) => n[0]).slice(0, 2).join("").toUpperCase();
}
function pct(done: number, total: number): number {
  return total ? Math.round((done / total) * 100) : 0;
}
function progressColor(p: number): string {
  if (p >= 60) return GREEN;
  if (p >= 40) return ORANGE;
  return INDIGO;
}
function shortDate(iso: string): string {
  return new Date(iso).toLocaleDateString([], { month: "short", day: "numeric" });
}
function individualName(e: CoachingEngagementDTO): string {
  return e.participants[0]?.name ?? e.name;
}

export default function CoachProgramOutline() {
  const [engagements, setEngagements] = useState<CoachingEngagementDTO[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [program, setProgram] = useState<ProgramDetailDTO | null>(null);
  const [goals, setGoals] = useState<CoachGoalDTO[]>([]);
  const [docs, setDocs] = useState<CoachDocumentDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      try {
        const r = await coachApi.engagements();
        if (!alive) return;
        const data = r.data ?? [];
        setEngagements(data);
        const firstIndividual = data.find((e) => e.assignment_type === "individual");
        setSelectedId((prev) => prev ?? firstIndividual?.id ?? data[0]?.id ?? null);
      } catch {
        if (alive) setEngagements([]);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  const individuals = useMemo(() => engagements.filter((e) => e.assignment_type === "individual"), [engagements]);
  const groups = useMemo(() => engagements.filter((e) => e.assignment_type === "group"), [engagements]);
  const selected = engagements.find((e) => e.id === selectedId) ?? null;
  const participantId = selected?.participants[0]?.id ?? null;

  // Load the selected engagement's program + (for individuals) goals & documents.
  useEffect(() => {
    if (!selected) return;
    let alive = true;
    setDetailLoading(true);
    const jobs: Promise<void>[] = [
      programsApi.get(selected.program_id).then((r) => { if (alive) setProgram(r.data ?? null); }).catch(() => { if (alive) setProgram(null); }),
    ];
    if (selected.assignment_type === "individual" && participantId) {
      jobs.push(coachApi.goals(participantId).then((r) => { if (alive) setGoals(r.data ?? []); }).catch(() => { if (alive) setGoals([]); }));
      jobs.push(coachApi.documents(participantId).then((r) => { if (alive) setDocs(r.data ?? []); }).catch(() => { if (alive) setDocs([]); }));
    } else {
      setGoals([]); setDocs([]);
    }
    Promise.all(jobs).finally(() => { if (alive) setDetailLoading(false); });
    return () => { alive = false; };
  }, [selected?.id]);

  const phases = useMemo(() => [...(program?.phases ?? [])].sort((a, b) => a.phase_number - b.phase_number), [program]);
  const overall = selected ? pct(selected.completed_sessions, selected.total_sessions) : 0;

  return (
    <div style={{ padding: 24, display: "flex", gap: 20, height: "100%", overflow: "hidden", background: PAGE }}>
      {/* ── Left: coachee + group list ── */}
      <div style={{ width: 330, minWidth: 300, display: "flex", flexDirection: "column", gap: 6, overflowY: "auto" }}>
        {loading ? (
          <div style={{ ...ff, fontSize: 13, color: MUTED, padding: 12 }}>Loading…</div>
        ) : (
          <>
            <SectionLabel>Individual Coachees</SectionLabel>
            {individuals.length === 0 && <Empty text="No 1:1 coachees." />}
            {individuals.map((e, i) => {
              const p = pct(e.completed_sessions, e.total_sessions);
              const active = e.id === selectedId;
              return (
                <button key={e.id} onClick={() => setSelectedId(e.id)}
                  style={{ ...ff, textAlign: "left", background: CARD, border: `${active ? 2 : 1}px solid ${active ? COACH : BORDER}`, borderRadius: 12, padding: "14px 16px", cursor: "pointer", marginBottom: 6, boxShadow: "0 1px 4px rgba(28,37,81,0.05)" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <Avatar name={individualName(e)} color={AVATAR_COLORS[i % AVATAR_COLORS.length]} />
                    <div style={{ minWidth: 0 }}>
                      <div style={{ ...ff, fontSize: 13, fontWeight: 700, color: NAVY }}>{individualName(e)}</div>
                      <div style={{ ...ff, fontSize: 11, color: MUTED, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{e.program_title}</div>
                    </div>
                  </div>
                  <div style={{ height: 5, background: TRACK, borderRadius: 99, marginTop: 12 }}>
                    <div style={{ height: 5, width: `${p}%`, background: progressColor(p), borderRadius: 99 }} />
                  </div>
                  <div style={{ ...ff, fontSize: 11, color: MUTED, marginTop: 6 }}>{p}% progress</div>
                </button>
              );
            })}

            <SectionLabel style={{ marginTop: 12 }}>Group Engagements</SectionLabel>
            {groups.length === 0 && <Empty text="No group engagements." />}
            {groups.map((e) => {
              const active = e.id === selectedId;
              return (
                <button key={e.id} onClick={() => setSelectedId(e.id)}
                  style={{ ...ff, textAlign: "left", background: CARD, border: `${active ? 2 : 1}px solid ${active ? COACH : BORDER}`, borderRadius: 12, padding: "14px 16px", cursor: "pointer", marginBottom: 6, boxShadow: "0 1px 4px rgba(28,37,81,0.05)" }}>
                  <div style={{ ...ff, fontSize: 13, fontWeight: 700, color: NAVY }}>{e.name}</div>
                  <div style={{ ...ff, fontSize: 11, color: MUTED, marginTop: 2 }}>{e.participants.length} participants</div>
                  <span style={{ ...ff, display: "inline-block", marginTop: 8, fontSize: 9, fontWeight: 700, color: e.status === "active" ? GREEN : ORANGE, background: `${e.status === "active" ? GREEN : ORANGE}14`, borderRadius: 20, padding: "3px 10px" }}>
                    {e.status.toUpperCase()}
                  </span>
                </button>
              );
            })}
          </>
        )}
      </div>

      {/* ── Right: selected detail ── */}
      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 16, overflowY: "auto" }}>
        {!selected ? (
          <Empty text="Select a coachee to view their program." card />
        ) : (
          <>
            {/* Header */}
            <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 12, boxShadow: "0 1px 4px rgba(28,37,81,0.07)", padding: "18px 24px", display: "flex", alignItems: "center", gap: 18 }}>
              <Avatar name={selected.assignment_type === "group" ? selected.name : individualName(selected)} color={GREEN} large />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ ...ff, fontSize: 20, fontWeight: 700, color: NAVY }}>{selected.assignment_type === "group" ? selected.name : individualName(selected)}</div>
                <div style={{ ...ff, fontSize: 13, color: MUTED, marginTop: 2 }}>{selected.program_title}</div>
                {selected.cohort_name && <div style={{ ...ff, fontSize: 12, color: MUTED, marginTop: 1 }}>{selected.cohort_name}</div>}
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ ...ff, fontSize: 30, fontWeight: 800, color: progressColor(overall) }}>{overall}%</div>
                <div style={{ ...ff, fontSize: 11, color: MUTED }}>Overall Progress</div>
              </div>
            </div>

            {detailLoading ? (
              <Empty text="Loading program…" card />
            ) : (
              <>
                {/* Program Phases */}
                <Panel title="Program Phases">
                  {phases.length === 0 ? (
                    <div style={{ ...ff, fontSize: 12, color: MUTED }}>No phases defined.</div>
                  ) : (
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
                      {phases.map((ph, i) => <PhasePill key={ph.id} phase={ph} index={i} count={phases.length} overall={overall} />)}
                    </div>
                  )}
                </Panel>

                {/* Coaching Goals (individual only) */}
                {selected.assignment_type === "individual" && (
                  <Panel title="Coaching Goals">
                    {goals.length === 0 ? (
                      <div style={{ ...ff, fontSize: 12, color: MUTED }}>No goals set yet.</div>
                    ) : (
                      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                        {goals.map((g) => (
                          <div key={g.id}>
                            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                              <span style={{ ...ff, fontSize: 13, fontWeight: 500, color: NAVY }}>{g.title}</span>
                              <span style={{ ...ff, fontSize: 13, fontWeight: 800, color: progressColor(g.progress) }}>{g.progress}%</span>
                            </div>
                            <div style={{ height: 6, background: TRACK, borderRadius: 99 }}>
                              <div style={{ height: 6, width: `${g.progress}%`, background: progressColor(g.progress), borderRadius: 99 }} />
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </Panel>
                )}

                {/* Psychometric Reports (individual only) */}
                {selected.assignment_type === "individual" && (
                  <Panel title="Psychometric Reports" right={docs.length > 0 ? `Uploaded by ${[...new Set(docs.map((d) => d.uploaded_by).filter(Boolean))].join(" · ")}` : undefined}>
                    {docs.length === 0 ? (
                      <div style={{ ...ff, fontSize: 12, color: MUTED }}>No reports uploaded yet.</div>
                    ) : (
                      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                        {docs.map((d) => <ReportCard key={d.id} doc={d} />)}
                      </div>
                    )}
                  </Panel>
                )}
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────
function SectionLabel({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return <div style={{ ...ff, fontSize: 10, fontWeight: 700, color: MUTED, letterSpacing: 0.5, textTransform: "uppercase", margin: "0 0 8px 4px", ...style }}>{children}</div>;
}
function Empty({ text, card }: { text: string; card?: boolean }) {
  return <div style={{ ...ff, fontSize: 13, color: MUTED, padding: card ? 40 : 12, textAlign: card ? "center" : "left", background: card ? CARD : "transparent", border: card ? `1px solid ${BORDER}` : "none", borderRadius: 12 }}>{text}</div>;
}
function Avatar({ name, color, large }: { name: string; color: string; large?: boolean }) {
  const s = large ? 56 : 38;
  return (
    <div style={{ width: s, height: s, minWidth: s, borderRadius: "50%", background: `${color}22`, color, display: "flex", alignItems: "center", justifyContent: "center", ...ff, fontSize: large ? 18 : 12, fontWeight: 700, flexShrink: 0 }}>
      {initials(name)}
    </div>
  );
}
function Panel({ title, right, children }: { title: string; right?: string; children: React.ReactNode }) {
  return (
    <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 12, boxShadow: "0 1px 4px rgba(28,37,81,0.07)", padding: "18px 22px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <div style={{ ...ff, fontSize: 15, fontWeight: 700, color: NAVY }}>{title}</div>
        {right && <div style={{ ...ff, fontSize: 11, color: MUTED }}>{right}</div>}
      </div>
      {children}
    </div>
  );
}

function PhasePill({ phase, index, count, overall }: { phase: PhaseDTO; index: number; count: number; overall: number }) {
  // Sequentially derive per-phase status from the coachee's overall progress.
  const start = (index / count) * 100;
  const end = ((index + 1) / count) * 100;
  let status: "done" | "active" | "todo" = "todo";
  let inner = 0;
  if (overall >= end) status = "done";
  else if (overall > start) { status = "active"; inner = Math.round(((overall - start) / (end - start)) * 100); }
  const color = status === "todo" ? MUTED : GREEN;
  const bg = status === "todo" ? "#F0F1F7" : `${GREEN}14`;
  return (
    <span style={{ ...ff, display: "inline-flex", alignItems: "center", gap: 7, fontSize: 12, fontWeight: 600, color, background: bg, borderRadius: 20, padding: "6px 14px" }}>
      <span style={{ width: 7, height: 7, borderRadius: "50%", background: color }} />
      {phase.title}
      {status === "done" && <span style={{ fontWeight: 800 }}>✓</span>}
      {status === "active" && <span style={{ fontSize: 10, fontWeight: 800 }}>{inner}%</span>}
    </span>
  );
}

function ReportCard({ doc }: { doc: CoachDocumentDTO }) {
  return (
    <div style={{ border: `1px solid ${BORDER}`, borderRadius: 10, overflow: "hidden" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 14px" }}>
        <div style={{ width: 34, height: 34, borderRadius: 8, background: `${COACH}14`, color: COACH, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15 }}>◎</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ ...ff, fontSize: 14, fontWeight: 700, color: NAVY }}>{doc.title}</div>
          <div style={{ ...ff, fontSize: 11, color: MUTED, marginTop: 1 }}>Uploaded {shortDate(doc.created_at)}{doc.uploaded_by ? ` by ${doc.uploaded_by}` : ""}</div>
        </div>
        {doc.is_shared && <span style={{ ...ff, fontSize: 9, fontWeight: 700, color: GREEN, background: `${GREEN}14`, borderRadius: 20, padding: "3px 10px" }}>SHARED</span>}
        {doc.url ? (
          <a href={doc.url} target="_blank" rel="noreferrer" style={{ ...ff, textDecoration: "none", background: CARD, border: `1px solid ${BORDER}`, borderRadius: 8, padding: "6px 16px", fontSize: 12, fontWeight: 600, color: NAVY }}>View</a>
        ) : (
          <button onClick={() => alert("No file attached")} style={{ ...ff, background: CARD, border: `1px solid ${BORDER}`, borderRadius: 8, padding: "6px 16px", fontSize: 12, fontWeight: 600, color: NAVY, cursor: "pointer" }}>View</button>
        )}
      </div>
      {doc.coach_summary && (
        <div style={{ borderTop: `1px solid ${BORDER}`, background: PAGE, padding: "12px 14px" }}>
          <div style={{ ...ff, fontSize: 12, fontWeight: 700, color: COACH, marginBottom: 4 }}>✦ Coach Summary</div>
          <div style={{ ...ff, fontSize: 13, color: "#4a5568", lineHeight: 1.5 }}>{doc.coach_summary}</div>
        </div>
      )}
    </div>
  );
}
