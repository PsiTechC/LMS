"use client";

import { useState, useCallback } from "react";
import { programsApi, ProgramDetailDTO, PhaseDTO, ActivityDTO } from "@/lib/programs-api";

// ── Activity type catalogue ────────────────────────────────────────
const ACTIVITY_TYPES = [
  { id: "video",       label: "Video Module",      icon: "▶", color: "#EF4E24" },
  { id: "pdf",         label: "PDF / Document",    icon: "📄", color: "#1C2551" },
  { id: "case_study",  label: "Case Study",        icon: "📋", color: "#6B73BF" },
  { id: "assessment",  label: "Assessment",        icon: "✦",  color: "#EF4E24" },
  { id: "survey",      label: "Survey",            icon: "≡",  color: "#8b90a7" },
  { id: "live_session",label: "Live Session",      icon: "⬡",  color: "#1C2551" },
  { id: "coaching",    label: "Coaching",          icon: "◇",  color: "#6B73BF" },
  { id: "journal",     label: "Reflection Journal",icon: "◎",  color: "#EF4E24" },
  { id: "assignment",  label: "Assignment",        icon: "◈",  color: "#1C2551" },
  { id: "peer_review", label: "Peer Review",       icon: "◆",  color: "#22c55e" },
] as const;

const PHASE_COLORS = [
  "#6B73BF", "#1C2551", "#EF4E24", "#22c55e",
  "#8b90a7", "#f59e0b", "#0ea5e9", "#d946ef",
];

// ── Types ─────────────────────────────────────────────────────────
interface AddActivityForm {
  type: string;
  title: string;
  duration: number;
  mode: string;
  desc: string;
  dueOffset: number;
}

interface Props {
  program: ProgramDetailDTO;
  onBack: () => void;
  onProgramUpdated: (p: ProgramDetailDTO) => void;
}

// ── AddActivityModal ──────────────────────────────────────────────
function AddActivityModal({ phase, onClose, onAdd }: {
  phase: PhaseDTO;
  onClose: () => void;
  onAdd: (form: AddActivityForm) => void;
}) {
  const [form, setForm] = useState<AddActivityForm>({
    type: "", title: "", duration: 30, mode: "self_paced", desc: "", dueOffset: 7,
  });
  const set = (k: keyof AddActivityForm, v: string | number) =>
    setForm((f) => ({ ...f, [k]: v }));

  const selected = ACTIVITY_TYPES.find((t) => t.id === form.type);
  const canSave = form.type && form.title.trim();

  return (
    <div
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{
        position: "fixed", inset: 0, background: "rgba(28,37,81,0.45)",
        zIndex: 2000, display: "flex", alignItems: "center", justifyContent: "center",
        padding: 24, fontFamily: "Poppins, sans-serif",
      }}
    >
      <div style={{
        background: "#fff", borderRadius: 16, width: "100%", maxWidth: 540,
        maxHeight: "88vh", display: "flex", flexDirection: "column",
        overflow: "hidden", boxShadow: "0 24px 64px rgba(28,37,81,0.22)",
      }}>
        {/* Header */}
        <div style={{ padding: "18px 24px", borderBottom: "1px solid #EAECF4", flexShrink: 0 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <div style={{ fontSize: 15, fontWeight: 700, color: "#1C2551" }}>Add Activity</div>
              <div style={{ fontSize: 11, color: "#8b90a7", marginTop: 2 }}>
                <span style={{ fontWeight: 600, color: phase.color }}>{phase.title}</span>
              </div>
            </div>
            <button onClick={onClose} style={{
              width: 28, height: 28, border: "1px solid #EAECF4", borderRadius: "50%",
              background: "#fff", cursor: "pointer", fontSize: 13, color: "#8b90a7",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>✕</button>
          </div>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: "auto", padding: "18px 24px", display: "flex", flexDirection: "column", gap: 16 }}>
          {/* Type picker */}
          <div>
            <label style={lbl}>ACTIVITY TYPE *</label>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(5,1fr)", gap: 8 }}>
              {ACTIVITY_TYPES.map((t) => (
                <div
                  key={t.id}
                  onClick={() => set("type", t.id)}
                  style={{
                    padding: "8px 4px", border: `1.5px solid ${form.type === t.id ? t.color : "#EAECF4"}`,
                    borderRadius: 10, background: form.type === t.id ? `${t.color}12` : "#fff",
                    cursor: "pointer", textAlign: "center", display: "flex",
                    flexDirection: "column", alignItems: "center", gap: 4,
                  }}
                >
                  <span style={{ fontSize: 16 }}>{t.icon}</span>
                  <span style={{
                    fontSize: 9, lineHeight: 1.2,
                    color: form.type === t.id ? t.color : "#8b90a7",
                    fontWeight: form.type === t.id ? 700 : 400,
                  }}>{t.label}</span>
                </div>
              ))}
            </div>
          </div>

          {form.type && (
            <>
              <div>
                <label style={lbl}>ACTIVITY TITLE *</label>
                <input
                  style={inp}
                  placeholder={`e.g. ${selected?.label} on Leadership`}
                  value={form.title}
                  onChange={(e) => set("title", e.target.value)}
                />
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div>
                  <label style={lbl}>DURATION (MINUTES)</label>
                  <input type="number" style={inp} value={form.duration}
                    onChange={(e) => set("duration", Number(e.target.value))} min={5} max={240} />
                </div>
                <div>
                  <label style={lbl}>DUE (DAYS FROM PHASE START)</label>
                  <input type="number" style={inp} value={form.dueOffset}
                    onChange={(e) => set("dueOffset", Number(e.target.value))} min={1} max={90} />
                </div>
              </div>
              <div>
                <label style={lbl}>DELIVERY MODE</label>
                <div style={{ display: "flex", gap: 8 }}>
                  {[
                    { v: "self_paced", l: "Self-Paced" },
                    { v: "live",       l: "Live" },
                    { v: "async",      l: "Async" },
                  ].map(({ v, l }) => (
                    <button key={v} onClick={() => set("mode", v)} style={{
                      flex: 1, padding: "8px", cursor: "pointer",
                      border: `1.5px solid ${form.mode === v ? phase.color : "#EAECF4"}`,
                      borderRadius: 8, background: form.mode === v ? `${phase.color}12` : "#fff",
                      color: form.mode === v ? phase.color : "#8b90a7",
                      fontSize: 11, fontWeight: form.mode === v ? 700 : 400, fontFamily: "Poppins, sans-serif",
                    }}>{l}</button>
                  ))}
                </div>
              </div>
              <div>
                <label style={lbl}>DESCRIPTION (OPTIONAL)</label>
                <textarea style={{ ...inp, height: 64, resize: "none" }}
                  placeholder="Brief description for participants…"
                  value={form.desc}
                  onChange={(e) => set("desc", e.target.value)} />
              </div>
              <div style={{
                padding: "10px 12px", background: "rgba(239,78,36,0.04)",
                border: "1px solid rgba(239,78,36,0.15)", borderRadius: 8,
              }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: "#EF4E24", marginBottom: 4 }}>✦ AI Suggestion</div>
                <div style={{ fontSize: 11, color: "#1C2551", lineHeight: 1.6 }}>
                  For <strong>{phase.title}</strong>, a <strong>{selected?.label}</strong> activity works best
                  when tied to a real-world application challenge. Consider adding a reflection prompt after completion.
                </div>
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div style={{
          padding: "16px 24px", borderTop: "1px solid #EAECF4",
          display: "flex", justifyContent: "space-between", gap: 10,
        }}>
          <button onClick={onClose} style={{
            padding: "9px 18px", background: "#fff", border: "1px solid #EAECF4",
            borderRadius: 8, cursor: "pointer", fontSize: 12, fontWeight: 600,
            color: "#1C2551", fontFamily: "Poppins, sans-serif",
          }}>Cancel</button>
          <button
            disabled={!canSave}
            onClick={() => { if (canSave) { onAdd(form); onClose(); } }}
            style={{
              padding: "9px 22px", background: canSave ? phase.color : "#D0D3E0",
              border: "none", borderRadius: 8, cursor: canSave ? "pointer" : "default",
              fontSize: 12, fontWeight: 700, color: "#fff", fontFamily: "Poppins, sans-serif",
            }}
          >+ Add to {phase.title}</button>
        </div>
      </div>
    </div>
  );
}

// ── PublishChecklist ───────────────────────────────────────────────
function PublishChecklist({ program, onClose, onPublish, publishing }: {
  program: ProgramDetailDTO;
  onClose: () => void;
  onPublish: () => void;
  publishing: boolean;
}) {
  const hasPhases = program.phases.length > 0;
  const allPhasesHaveActivities = program.phases.every((p) => p.activities.length > 0);
  const checks = [
    { label: "Program has a title",          ok: !!program.title },
    { label: "At least one phase created",   ok: hasPhases },
    { label: "All phases have activities",   ok: hasPhases && allPhasesHaveActivities },
  ];
  const canPublish = checks.every((c) => c.ok);

  return (
    <div
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{
        position: "fixed", inset: 0, background: "rgba(28,37,81,0.45)",
        zIndex: 2000, display: "flex", alignItems: "center", justifyContent: "center",
        padding: 24, fontFamily: "Poppins, sans-serif",
      }}
    >
      <div style={{
        background: "#fff", borderRadius: 16, width: "100%", maxWidth: 460,
        overflow: "hidden", boxShadow: "0 24px 64px rgba(28,37,81,0.22)",
      }}>
        <div style={{ padding: "20px 24px", borderBottom: "1px solid #EAECF4" }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: "#1C2551" }}>Publish Program</div>
          <div style={{ fontSize: 12, color: "#8b90a7", marginTop: 4 }}>
            Review the checklist before publishing to participants.
          </div>
        </div>
        <div style={{ padding: "20px 24px", display: "flex", flexDirection: "column", gap: 12 }}>
          {checks.map((c, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{
                width: 22, height: 22, borderRadius: "50%", flexShrink: 0,
                background: c.ok ? "rgba(34,197,94,0.1)" : "rgba(239,78,36,0.1)",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 11, color: c.ok ? "#22c55e" : "#EF4E24",
              }}>
                {c.ok ? "✓" : "✕"}
              </div>
              <span style={{ fontSize: 13, color: c.ok ? "#1C2551" : "#8b90a7" }}>{c.label}</span>
            </div>
          ))}
          {!canPublish && (
            <div style={{
              marginTop: 8, padding: "10px 14px", background: "rgba(239,78,36,0.05)",
              borderRadius: 8, border: "1px solid rgba(239,78,36,0.15)", fontSize: 12, color: "#EF4E24",
            }}>
              Complete all checklist items before publishing.
            </div>
          )}
        </div>
        <div style={{
          padding: "16px 24px", borderTop: "1px solid #EAECF4",
          display: "flex", gap: 10, justifyContent: "flex-end",
        }}>
          <button onClick={onClose} style={{
            padding: "9px 20px", background: "#fff", border: "1px solid #EAECF4",
            borderRadius: 8, cursor: "pointer", fontSize: 12, fontWeight: 600,
            color: "#1C2551", fontFamily: "Poppins, sans-serif",
          }}>Cancel</button>
          <button
            onClick={onPublish}
            disabled={!canPublish || publishing}
            style={{
              padding: "9px 24px", background: canPublish && !publishing ? "#22c55e" : "#D0D3E0",
              border: "none", borderRadius: 8,
              cursor: canPublish && !publishing ? "pointer" : "default",
              fontSize: 12, fontWeight: 700, color: "#fff", fontFamily: "Poppins, sans-serif",
            }}
          >{publishing ? "Publishing…" : "Publish Program"}</button>
        </div>
      </div>
    </div>
  );
}

// ── ParticipantPreview ─────────────────────────────────────────────
function ParticipantPreview({ program, onClose }: { program: ProgramDetailDTO; onClose: () => void }) {
  return (
    <div
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{
        position: "fixed", inset: 0, background: "rgba(28,37,81,0.5)",
        zIndex: 2000, display: "flex", alignItems: "center", justifyContent: "center",
        padding: 24, fontFamily: "Poppins, sans-serif",
      }}
    >
      <div style={{
        background: "#F8F9FC", borderRadius: 20, width: "100%", maxWidth: 680,
        maxHeight: "90vh", display: "flex", flexDirection: "column",
        overflow: "hidden", boxShadow: "0 32px 80px rgba(28,37,81,0.28)",
      }}>
        {/* Preview header */}
        <div style={{
          background: "#1C2551", padding: "16px 24px",
          display: "flex", justifyContent: "space-between", alignItems: "center",
        }}>
          <div>
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.6)", letterSpacing: 1, marginBottom: 4 }}>
              ◈ PARTICIPANT VIEW
            </div>
            <div style={{ fontSize: 16, fontWeight: 700, color: "#fff" }}>{program.title}</div>
          </div>
          <button onClick={onClose} style={{
            width: 32, height: 32, border: "1px solid rgba(255,255,255,0.2)",
            borderRadius: "50%", background: "transparent", cursor: "pointer",
            color: "#fff", fontSize: 14, display: "flex", alignItems: "center", justifyContent: "center",
          }}>✕</button>
        </div>

        {/* Program meta */}
        <div style={{
          background: "#fff", padding: "16px 24px", borderBottom: "1px solid #EAECF4",
          display: "flex", gap: 24, flexShrink: 0,
        }}>
          <div>
            <div style={{ fontSize: 10, color: "#8b90a7", fontWeight: 700, letterSpacing: 0.5 }}>DURATION</div>
            <div style={{ fontSize: 14, fontWeight: 700, color: "#1C2551", marginTop: 2 }}>
              {program.duration_weeks} weeks
            </div>
          </div>
          <div>
            <div style={{ fontSize: 10, color: "#8b90a7", fontWeight: 700, letterSpacing: 0.5 }}>PHASES</div>
            <div style={{ fontSize: 14, fontWeight: 700, color: "#1C2551", marginTop: 2 }}>
              {program.phases.length}
            </div>
          </div>
          <div>
            <div style={{ fontSize: 10, color: "#8b90a7", fontWeight: 700, letterSpacing: 0.5 }}>ACTIVITIES</div>
            <div style={{ fontSize: 14, fontWeight: 700, color: "#1C2551", marginTop: 2 }}>
              {program.phases.reduce((s, p) => s + p.activities.length, 0)}
            </div>
          </div>
        </div>

        {/* Phase timeline */}
        <div style={{ flex: 1, overflowY: "auto", padding: 24, display: "flex", flexDirection: "column", gap: 16 }}>
          {program.phases.length === 0 ? (
            <div style={{ textAlign: "center", color: "#8b90a7", padding: 40, fontSize: 13 }}>
              No phases added yet.
            </div>
          ) : (
            program.phases.map((ph, i) => (
              <div key={ph.id} style={{
                background: "#fff", borderRadius: 12, overflow: "hidden",
                border: "1px solid #EAECF4",
              }}>
                <div style={{
                  background: ph.color, padding: "12px 18px",
                  display: "flex", justifyContent: "space-between", alignItems: "center",
                }}>
                  <div>
                    <div style={{ fontSize: 10, color: "rgba(255,255,255,0.7)", fontWeight: 700, letterSpacing: 1 }}>
                      PHASE {i + 1}
                    </div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: "#fff" }}>{ph.title}</div>
                  </div>
                  {ph.week_label && (
                    <div style={{
                      background: "rgba(255,255,255,0.15)", borderRadius: 20,
                      padding: "4px 10px", fontSize: 11, color: "#fff",
                    }}>{ph.week_label}</div>
                  )}
                </div>
                <div style={{ padding: "12px 18px", display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {ph.activities.length === 0 ? (
                    <span style={{ fontSize: 12, color: "#8b90a7" }}>No activities yet</span>
                  ) : ph.activities.map((a) => {
                    const type = ACTIVITY_TYPES.find((t) => t.id === a.type);
                    return (
                      <div key={a.id} style={{
                        display: "flex", alignItems: "center", gap: 6,
                        background: type ? `${type.color}12` : "#F8F9FC",
                        border: `1px solid ${type ? `${type.color}25` : "#EAECF4"}`,
                        borderRadius: 20, padding: "4px 10px", fontSize: 12,
                        color: type?.color ?? "#1C2551",
                      }}>
                        <span style={{ fontSize: 11 }}>{type?.icon}</span>
                        <span style={{ fontWeight: 500 }}>{a.title}</span>
                        <span style={{ color: "#8b90a7", fontSize: 10 }}>{a.duration_mins}m</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

// ── Main Studio Component ──────────────────────────────────────────
export default function PMDesignStudio({ program: initialProgram, onBack, onProgramUpdated }: Props) {
  const [program, setProgram] = useState<ProgramDetailDTO>(initialProgram);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [addActivityPhaseId, setAddActivityPhaseId] = useState<string | null>(null);
  const [showPublishModal, setShowPublishModal] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [editingPhaseId, setEditingPhaseId] = useState<string | null>(null);
  const [phaseMenuId, setPhaseMenuId] = useState<string | null>(null);
  const [titleEdit, setTitleEdit] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const res = await programsApi.get(program.id);
    if (res.data) {
      setProgram(res.data);
      onProgramUpdated(res.data);
    }
  }, [program.id, onProgramUpdated]);

  // ── Add Phase ──────────────────────────────────────────────────
  async function handleAddPhase() {
    const nextNum = program.phases.length;
    const color = PHASE_COLORS[nextNum % PHASE_COLORS.length];
    setSaving(true);
    try {
      await programsApi.createPhase(program.id, {
        title: `Phase ${nextNum + 1}`,
        phase_number: nextNum,
        color,
        week_label: `Wk ${nextNum * 2 + 1}–${nextNum * 2 + 2}`,
      });
      await refresh();
    } finally {
      setSaving(false);
    }
  }

  // ── Rename Phase ───────────────────────────────────────────────
  async function handleRenamePhase(ph: PhaseDTO, newTitle: string) {
    if (!newTitle.trim() || newTitle === ph.title) {
      setEditingPhaseId(null);
      return;
    }
    await programsApi.updatePhase(program.id, ph.id, { title: newTitle });
    await refresh();
    setEditingPhaseId(null);
  }

  // ── Delete Phase ───────────────────────────────────────────────
  async function handleDeletePhase(ph: PhaseDTO) {
    if (!window.confirm(`Delete phase "${ph.title}"? All activities in it will be removed.`)) return;
    await programsApi.deletePhase(program.id, ph.id);
    await refresh();
    setPhaseMenuId(null);
  }

  // ── Add Activity ───────────────────────────────────────────────
  async function handleAddActivity(phaseId: string, form: AddActivityForm) {
    await programsApi.createActivity(program.id, {
      phase_id: phaseId,
      title: form.title,
      description: form.desc,
      type: form.type,
      delivery_mode: form.mode,
      duration_mins: form.duration,
      due_day_offset: form.dueOffset,
      is_mandatory: true,
    });
    await refresh();
  }

  // ── Delete Activity ────────────────────────────────────────────
  async function handleDeleteActivity(actId: string) {
    await programsApi.deleteActivity(program.id, actId);
    await refresh();
  }

  // ── Publish ────────────────────────────────────────────────────
  async function handlePublish() {
    setPublishing(true);
    try {
      const res = await programsApi.publish(program.id);
      if (res.data) {
        await refresh();
        setShowPublishModal(false);
      }
    } catch (e: unknown) {
      alert((e as Error).message || "Publish failed");
    } finally {
      setPublishing(false);
    }
  }

  // ── Rename program title inline ────────────────────────────────
  async function handleRenameTitle(v: string) {
    if (!v.trim() || v === program.title) { setTitleEdit(null); return; }
    await programsApi.update(program.id, { title: v });
    await refresh();
    setTitleEdit(null);
  }

  const isPublished = program.status !== "draft";

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", fontFamily: "Poppins, sans-serif" }}>
      {/* ── Studio Top Bar ─────────────────────────────────────── */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "12px 20px", borderBottom: "1px solid #EAECF4",
        background: "#fff", flexShrink: 0, gap: 16,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <button
            onClick={onBack}
            style={{
              width: 32, height: 32, borderRadius: "50%", border: "1px solid #EAECF4",
              background: "#fff", cursor: "pointer", fontSize: 14, display: "flex",
              alignItems: "center", justifyContent: "center", color: "#1C2551",
            }}
          >←</button>

          {titleEdit !== null ? (
            <input
              autoFocus
              value={titleEdit}
              onChange={(e) => setTitleEdit(e.target.value)}
              onBlur={(e) => handleRenameTitle(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") handleRenameTitle(titleEdit); }}
              style={{
                fontSize: 16, fontWeight: 700, color: "#1C2551", border: "none",
                borderBottom: "2px solid #EF4E24", outline: "none", background: "transparent",
                fontFamily: "Poppins, sans-serif", width: 280,
              }}
            />
          ) : (
            <div
              onClick={() => setTitleEdit(program.title)}
              style={{
                fontSize: 16, fontWeight: 700, color: "#1C2551",
                cursor: "text", display: "flex", alignItems: "center", gap: 8,
              }}
            >
              {program.title}
              <span style={{ fontSize: 11, color: "#8b90a7" }}>✎</span>
            </div>
          )}

          <span style={{
            background: program.status === "draft" ? "rgba(139,144,167,0.12)" : "rgba(34,197,94,0.1)",
            color: program.status === "draft" ? "#8b90a7" : "#22c55e",
            border: `1px solid ${program.status === "draft" ? "#EAECF4" : "rgba(34,197,94,0.3)"}`,
            borderRadius: 20, padding: "3px 10px", fontSize: 10, fontWeight: 700, letterSpacing: 0.5,
          }}>{program.status.toUpperCase()}</span>
        </div>

        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <span style={{ fontSize: 12, color: "#8b90a7" }}>
            {program.phases.length} phases · {program.phases.reduce((s, p) => s + p.activities.length, 0)} activities
          </span>
          <button
            onClick={() => setShowPreview(true)}
            style={{
              padding: "8px 16px", border: "1px solid #EAECF4", borderRadius: 8,
              background: "#fff", cursor: "pointer", fontSize: 12, fontWeight: 600,
              color: "#1C2551", fontFamily: "Poppins, sans-serif",
            }}
          >◎ Preview</button>
          {!isPublished && (
            <button
              onClick={() => setShowPublishModal(true)}
              style={{
                padding: "8px 18px", border: "none", borderRadius: 8,
                background: "#22c55e", cursor: "pointer", fontSize: 12, fontWeight: 700,
                color: "#fff", fontFamily: "Poppins, sans-serif",
              }}
            >Publish Program</button>
          )}
        </div>
      </div>

      {/* ── Canvas ─────────────────────────────────────────────── */}
      <div style={{
        flex: 1, overflowY: "auto", padding: 24,
        background: "#F8F9FC", display: "flex", flexDirection: "column", gap: 16,
      }}>
        {program.phases.length === 0 && (
          <div style={{
            padding: 48, textAlign: "center", color: "#8b90a7",
            border: "2px dashed #EAECF4", borderRadius: 16, background: "#fff",
          }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>▤</div>
            <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 6, color: "#1C2551" }}>
              Start designing your program
            </div>
            <div style={{ fontSize: 13, marginBottom: 20 }}>
              Add phases to structure your leadership journey.
            </div>
            <button
              onClick={handleAddPhase}
              style={{
                padding: "10px 24px", border: "none", borderRadius: 10,
                background: "#1C2551", color: "#fff", cursor: "pointer",
                fontSize: 13, fontWeight: 700, fontFamily: "Poppins, sans-serif",
              }}
            >+ Add First Phase</button>
          </div>
        )}

        {program.phases.map((ph) => {
          const isEditing = editingPhaseId === ph.id;
          return (
            <div key={ph.id} style={{
              background: "#fff", borderRadius: 14, border: "1px solid #EAECF4",
              overflow: "hidden", boxShadow: "0 1px 4px rgba(28,37,81,0.05)",
            }}>
              {/* Phase header */}
              <div style={{
                background: ph.color, padding: "12px 18px",
                display: "flex", justifyContent: "space-between", alignItems: "center",
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12, flex: 1 }}>
                  <div style={{
                    background: "rgba(255,255,255,0.2)", borderRadius: 8,
                    padding: "2px 8px", fontSize: 10, color: "#fff", fontWeight: 700,
                  }}>
                    Phase {ph.phase_number + 1}
                  </div>
                  {isEditing ? (
                    <input
                      autoFocus
                      defaultValue={ph.title}
                      onBlur={(e) => handleRenamePhase(ph, e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleRenamePhase(ph, (e.target as HTMLInputElement).value);
                        if (e.key === "Escape") setEditingPhaseId(null);
                      }}
                      style={{
                        background: "rgba(255,255,255,0.2)", border: "none", outline: "none",
                        color: "#fff", fontSize: 14, fontWeight: 700,
                        fontFamily: "Poppins, sans-serif", borderBottom: "2px solid rgba(255,255,255,0.6)",
                        minWidth: 180,
                      }}
                    />
                  ) : (
                    <div
                      onClick={() => !isPublished && setEditingPhaseId(ph.id)}
                      style={{
                        fontSize: 14, fontWeight: 700, color: "#fff",
                        cursor: isPublished ? "default" : "text",
                      }}
                    >{ph.title}</div>
                  )}
                  {ph.week_label && (
                    <div style={{
                      background: "rgba(255,255,255,0.15)", borderRadius: 20,
                      padding: "2px 10px", fontSize: 11, color: "#fff",
                    }}>{ph.week_label}</div>
                  )}
                </div>
                {!isPublished && (
                  <div style={{ position: "relative" }}>
                    <button
                      onClick={() => setPhaseMenuId(phaseMenuId === ph.id ? null : ph.id)}
                      style={{
                        width: 28, height: 28, borderRadius: "50%",
                        background: "rgba(255,255,255,0.15)", border: "none",
                        cursor: "pointer", color: "#fff", fontSize: 14,
                        display: "flex", alignItems: "center", justifyContent: "center",
                      }}
                    >⋮</button>
                    {phaseMenuId === ph.id && (
                      <div style={{
                        position: "absolute", right: 0, top: 36,
                        background: "#fff", borderRadius: 10, boxShadow: "0 8px 32px rgba(28,37,81,0.18)",
                        border: "1px solid #EAECF4", zIndex: 100, minWidth: 140, overflow: "hidden",
                      }}>
                        {[
                          { label: "✎ Rename", action: () => { setEditingPhaseId(ph.id); setPhaseMenuId(null); } },
                          { label: "🗑 Delete", action: () => handleDeletePhase(ph) },
                        ].map(({ label, action }) => (
                          <button key={label} onClick={action} style={{
                            display: "block", width: "100%", padding: "10px 14px",
                            background: "none", border: "none", cursor: "pointer",
                            fontSize: 12, color: "#1C2551", textAlign: "left",
                            fontFamily: "Poppins, sans-serif",
                          }}>{label}</button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Activities */}
              <div style={{ padding: "14px 18px", display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center" }}>
                {ph.activities.map((a) => {
                  const type = ACTIVITY_TYPES.find((t) => t.id === a.type);
                  return (
                    <div key={a.id} style={{
                      display: "flex", alignItems: "center", gap: 8,
                      background: type ? `${type.color}10` : "#F8F9FC",
                      border: `1px solid ${type ? `${type.color}25` : "#EAECF4"}`,
                      borderRadius: 22, padding: "6px 12px",
                    }}>
                      <span style={{ fontSize: 13 }}>{type?.icon}</span>
                      <div>
                        <div style={{ fontSize: 12, fontWeight: 600, color: "#1C2551" }}>{a.title}</div>
                        <div style={{ fontSize: 10, color: "#8b90a7" }}>
                          {a.duration_mins}m · {a.delivery_mode.replace("_", " ")}
                        </div>
                      </div>
                      {!isPublished && (
                        <button
                          onClick={() => handleDeleteActivity(a.id)}
                          style={{
                            width: 18, height: 18, border: "none", background: "none",
                            cursor: "pointer", color: "#8b90a7", fontSize: 12,
                            display: "flex", alignItems: "center", justifyContent: "center",
                          }}
                        >×</button>
                      )}
                    </div>
                  );
                })}
                {!isPublished && (
                  <button
                    onClick={() => setAddActivityPhaseId(ph.id)}
                    style={{
                      display: "flex", alignItems: "center", gap: 6, padding: "6px 14px",
                      border: `1.5px dashed ${ph.color}60`, borderRadius: 22, background: "none",
                      cursor: "pointer", fontSize: 12, color: ph.color, fontWeight: 600,
                      fontFamily: "Poppins, sans-serif",
                    }}
                  >+ Add Activity</button>
                )}
              </div>
            </div>
          );
        })}

        {/* Add phase button */}
        {!isPublished && program.phases.length > 0 && (
          <button
            onClick={handleAddPhase}
            disabled={saving}
            style={{
              display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
              padding: "14px", border: "2px dashed #EAECF4", borderRadius: 14,
              background: "none", cursor: "pointer", fontSize: 13, color: "#8b90a7",
              fontFamily: "Poppins, sans-serif", fontWeight: 600,
            }}
          >{saving ? "Adding…" : "+ Add Phase"}</button>
        )}
      </div>

      {/* ── Modals ─────────────────────────────────────────────── */}
      {addActivityPhaseId && (() => {
        const ph = program.phases.find((p) => p.id === addActivityPhaseId);
        if (!ph) return null;
        return (
          <AddActivityModal
            phase={ph}
            onClose={() => setAddActivityPhaseId(null)}
            onAdd={(form) => handleAddActivity(addActivityPhaseId, form)}
          />
        );
      })()}

      {showPublishModal && (
        <PublishChecklist
          program={program}
          onClose={() => setShowPublishModal(false)}
          onPublish={handlePublish}
          publishing={publishing}
        />
      )}

      {showPreview && (
        <ParticipantPreview
          program={program}
          onClose={() => setShowPreview(false)}
        />
      )}
    </div>
  );
}

// ── Shared styles ─────────────────────────────────────────────────
const lbl: React.CSSProperties = {
  fontSize: 10, fontWeight: 700, color: "#8b90a7",
  letterSpacing: 0.5, display: "block", marginBottom: 6,
};

const inp: React.CSSProperties = {
  width: "100%", border: "1px solid #EAECF4", borderRadius: 8,
  padding: "9px 12px", fontSize: 13, fontFamily: "Poppins, sans-serif",
  color: "#1C2551", boxSizing: "border-box",
};
