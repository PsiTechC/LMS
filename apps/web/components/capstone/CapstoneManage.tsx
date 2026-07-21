"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { CSSProperties } from "react";
import {
  capstoneManageApi, ConfigDTO, ConfigDetailDTO, ManagedTeamDTO,
  RubricCriterion, ResourceLink, MilestoneDTO, CriterionScore,
} from "@/lib/capstone-api";
import { ReferenceFile } from "@/lib/capstone-api";
import { cohortsApi } from "@/lib/cohorts-api";
import { programsApi } from "@/lib/programs-api";
import { uploadFile, fetchFileBlob } from "@/lib/faculty-api";

const NAVY = "var(--xa-navy)", ORANGE = "var(--xa-primary)", INDIGO = "var(--xa-muted)", GREEN = "#22c55e";
const AMBER = "#f59e0b", PAGE = "var(--xa-bg)", BORDER = "#E6DED0", MUTED = "var(--xa-muted)";
const ff = { fontFamily: "Poppins, sans-serif" } as const;

// CapstoneManage is the shared Faculty/SA authoring & management surface.
// SA sees all orgs (org switcher upstream passes orgId); Faculty is scoped
// server-side to their programs. Master (config list) + detail (editor/grading).
export default function CapstoneManage({ orgId }: { orgId?: string }) {
  const [configs, setConfigs] = useState<ConfigDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [err, setErr] = useState("");
  const [createOpen, setCreateOpen] = useState(false);

  const load = useCallback(() => {
    setLoading(true); setErr("");
    capstoneManageApi.list(orgId || undefined)
      .then((r) => {
        const items = r.data ?? [];
        setConfigs(items);
        setSelectedId((prev) => (prev && items.some((c) => c.id === prev)) ? prev : (items[0]?.id ?? null));
      })
      .catch((e) => setErr(e instanceof Error ? e.message : "Failed to load capstones"))
      .finally(() => setLoading(false));
  }, [orgId]);
  useEffect(() => { load(); }, [load]);

  const selected = configs.find((c) => c.id === selectedId) ?? null;

  // Single-capstone mode: when there's 0 or 1 capstone, skip the list rail and
  // show the detail (or empty state) full-width - a list is pointless for one.
  const single = configs.length <= 1;

  if (single) {
    return (
      <div style={{ padding: 24, ...ff }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <div style={{ fontSize: 12, color: MUTED }}>{configs.length === 1 ? "Your capstone for the selected program." : ""}</div>
          <button onClick={() => setCreateOpen(true)} style={{ ...btnGhost, display: "inline-flex", alignItems: "center", gap: 6 }}>+ New Capstone</button>
        </div>
        {loading ? <div style={{ ...card(), padding: 40, textAlign: "center", color: MUTED, fontSize: 13 }}>Loading…</div>
          : err ? <div style={{ ...card(), padding: 24, color: "#ef4444", fontSize: 13 }}>{err}</div>
          : selected ? <ConfigDetail key={selected.id} configId={selected.id} onChanged={load} />
          : (
            <div style={{ ...card(), padding: "60px 24px", textAlign: "center" }}>
              <div style={{ width: 64, height: 64, borderRadius: 16, background: "rgba(74, 85, 115,0.1)", color: INDIGO, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 28, margin: "0 auto 16px" }}>▲</div>
              <div style={{ fontSize: 15, fontWeight: 700, color: NAVY, marginBottom: 6 }}>No capstone yet</div>
              <div style={{ fontSize: 12, color: MUTED, maxWidth: 400, margin: "0 auto 18px", lineHeight: 1.6 }}>
                Create a capstone to define its brief and rubric, split teams, set milestones, then grade and release - or attach one from Program Design.
              </div>
              <button onClick={() => setCreateOpen(true)} style={btnPrim}>+ New Capstone</button>
            </div>
          )}
        {createOpen && (
          <CreateCapstoneModal orgId={orgId} onClose={() => setCreateOpen(false)} onCreated={(id) => { setCreateOpen(false); load(); setSelectedId(id); }} />
        )}
      </div>
    );
  }

  return (
    <div style={{ padding: 24, ...ff }}>
      <div style={{ display: "grid", gridTemplateColumns: "300px 1fr", gap: 16, alignItems: "start" }}>
        {/* Left rail - config list */}
        <div style={card()}>
          <div style={{ padding: "12px 16px", borderBottom: `1px solid ${BORDER}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: NAVY }}>Capstones</span>
            <button onClick={() => setCreateOpen(true)} style={{ ...ff, fontSize: 11, fontWeight: 700, color: ORANGE, background: "rgba(200, 168, 96,0.08)", border: "1px solid rgba(200, 168, 96,0.2)", borderRadius: 6, padding: "4px 10px", cursor: "pointer" }}>+ New</button>
          </div>
          {loading ? <Empty label="Loading…" />
            : err ? <div style={{ padding: 16, fontSize: 12, color: "#ef4444" }}>{err}</div>
            : configs.length === 0 ? <Empty label="No capstones yet. Create one, or attach from Program Design." />
            : (
              <div style={{ maxHeight: "calc(100vh - 200px)", overflowY: "auto" }}>
                {configs.map((c) => {
                  const on = c.id === selectedId;
                  return (
                    <button key={c.id} onClick={() => setSelectedId(c.id)} style={{
                      ...ff, display: "flex", gap: 11, width: "100%", textAlign: "left", cursor: "pointer",
                      padding: "12px 14px", borderBottom: `1px solid #EFE9DC`, background: on ? "rgba(74, 85, 115,0.07)" : "#fff",
                      borderLeft: `3px solid ${on ? INDIGO : "transparent"}`, borderTop: "none", borderRight: "none", alignItems: "flex-start",
                    }}>
                      <div style={{ width: 30, height: 30, borderRadius: 8, background: on ? INDIGO : "rgba(74, 85, 115,0.12)", color: on ? "#fff" : INDIGO, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, flexShrink: 0, marginTop: 1 }}>▲</div>
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center" }}>
                          <span style={{ fontSize: 12, fontWeight: 700, color: NAVY, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.title}</span>
                          <StatusPill status={c.status} />
                        </div>
                        <div style={{ fontSize: 11, color: MUTED, marginTop: 3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {c.program}{c.org ? ` · ${c.org}` : ""}
                        </div>
                        <div style={{ fontSize: 10, color: MUTED, marginTop: 3, display: "flex", alignItems: "center", gap: 5 }}>
                          <span>{c.team_structure === "individual" ? "👤" : "👥"}</span>{c.team_count} team{c.team_count === 1 ? "" : "s"}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
        </div>

        {/* Right - detail */}
        {selected
          ? <ConfigDetail key={selected.id} configId={selected.id} onChanged={load} />
          : <div style={{ ...card(), padding: "56px 24px", textAlign: "center" }}>
              <div style={{ width: 64, height: 64, borderRadius: 16, background: "rgba(74, 85, 115,0.1)", color: INDIGO, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 28, margin: "0 auto 16px" }}>▲</div>
              <div style={{ fontSize: 15, fontWeight: 700, color: NAVY, marginBottom: 6 }}>{configs.length === 0 ? "No capstones yet" : "Select a capstone"}</div>
              <div style={{ fontSize: 12, color: MUTED, maxWidth: 380, margin: "0 auto 16px", lineHeight: 1.6 }}>
                {configs.length === 0
                  ? "Create a capstone to define its brief and rubric, split teams, set milestones, then grade and release."
                  : "Pick one from the list to configure the brief and rubric, split teams, add milestones, then grade and release."}
              </div>
              {configs.length === 0 && <button onClick={() => setCreateOpen(true)} style={btnPrim}>+ New Capstone</button>}
            </div>}
      </div>

      {createOpen && (
        <CreateCapstoneModal orgId={orgId} onClose={() => setCreateOpen(false)} onCreated={(id) => { setCreateOpen(false); load(); setSelectedId(id); }} />
      )}
    </div>
  );
}

// ── Create modal - pick a program, create a draft capstone config ───────────
function CreateCapstoneModal({ orgId, onClose, onCreated }: { orgId?: string; onClose: () => void; onCreated: (id: string) => void }) {
  const [programs, setPrograms] = useState<{ id: string; title: string }[]>([]);
  const [programId, setProgramId] = useState("");
  const [title, setTitle] = useState("Capstone Project");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    if (!orgId) { setPrograms([]); setLoading(false); return; }
    setLoading(true);
    programsApi.list(orgId)
      .then((r) => {
        const list = (r.data ?? []).map((p) => ({ id: p.id, title: p.title }));
        setPrograms(list);
        if (list[0]) setProgramId(list[0].id);
      })
      .catch(() => setPrograms([]))
      .finally(() => setLoading(false));
  }, [orgId]);

  async function create() {
    if (!programId) { setErr("Select a program."); return; }
    setBusy(true); setErr("");
    try {
      const r = await capstoneManageApi.create({ program_id: programId, title: title.trim() || "Capstone Project" });
      onCreated(r.data.id);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to create");
    } finally { setBusy(false); }
  }

  return (
    <Overlay onClose={onClose}>
      <div style={modal}>
        <ModalHead icon="▲" title="New Capstone Project" subtitle="Attach to a program, then configure the brief, rubric and teams." onClose={onClose} />
        <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 14 }}>
          <Field label="Title"><input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Leadership Turnaround Challenge" style={inp} /></Field>
          <Field label="Program">
            {loading ? <div style={{ fontSize: 12, color: MUTED, padding: "8px 0" }}>Loading programs…</div>
              : <select value={programId} onChange={(e) => setProgramId(e.target.value)} style={sel}>
                  {programs.length === 0 && <option value="">{orgId ? "No programs in this org" : "Select an org first (SA)"}</option>}
                  {programs.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
                </select>}
          </Field>
          {err && <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "9px 12px", borderRadius: 8, fontSize: 12, fontWeight: 600, background: "rgba(239,68,68,0.08)", color: "#ef4444" }}><span>⚠</span>{err}</div>}
        </div>
        <div style={{ padding: "12px 20px", borderTop: `1px solid ${BORDER}`, display: "flex", gap: 8, justifyContent: "flex-end", background: "#FAFBFC" }}>
          <button onClick={onClose} style={btnGhost}>Cancel</button>
          <button onClick={create} disabled={busy || !programId} style={{ ...btnPrim, opacity: busy || !programId ? 0.5 : 1 }}>{busy ? "Creating…" : "Create Capstone →"}</button>
        </div>
      </div>
    </Overlay>
  );
}

// ── Detail: config editor + milestones + teams/grading ──────────────────────
function ConfigDetail({ configId, onChanged }: { configId: string; onChanged: () => void }) {
  const [detail, setDetail] = useState<ConfigDetailDTO | null>(null);
  const [tab, setTab] = useState<"brief" | "milestones" | "teams">("brief");
  const [err, setErr] = useState("");

  const reload = useCallback(() => {
    capstoneManageApi.get(configId).then((r) => setDetail(r.data)).catch(() => setErr("Failed to load"));
  }, [configId]);
  useEffect(() => { reload(); }, [reload]);

  if (err) return <div style={{ ...card(), padding: 24, color: "#ef4444", fontSize: 13 }}>{err}</div>;
  if (!detail) return <div style={{ ...card(), padding: 40, textAlign: "center", color: MUTED, fontSize: 13 }}>Loading…</div>;

  const c = detail.config;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {/* Gradient header banner */}
      <div style={{ background: "linear-gradient(135deg,#182848,#2d3a7c)", borderRadius: 14, padding: "18px 22px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 14, boxShadow: "0 2px 10px rgba(24, 40, 72,0.14)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14, minWidth: 0 }}>
          <div style={{ width: 46, height: 46, borderRadius: 12, background: "rgba(200, 168, 96,0.9)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, color: "#fff", flexShrink: 0 }}>▲</div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 17, fontWeight: 800, color: "#fff", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.title}</div>
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.6)", marginTop: 3, display: "flex", gap: 6, flexWrap: "wrap" }}>
              <span>{c.program}</span>{c.org && <><span>·</span><span>{c.org}</span></>}
              <span>·</span><span style={{ textTransform: "capitalize" }}>{c.team_structure}</span>
              <span>·</span><span>pass ≥ {c.passing_threshold}/10</span>
            </div>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexShrink: 0 }}>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 22, fontWeight: 800, color: "#fff" }}>{c.team_count}</div>
            <div style={{ fontSize: 9, color: "rgba(255,255,255,0.5)", textTransform: "uppercase", letterSpacing: 0.5 }}>Teams</div>
          </div>
          <span style={{ background: c.status === "assigned" ? "rgba(34,197,94,0.9)" : c.status === "closed" ? "rgba(255,255,255,0.2)" : "rgba(255,255,255,0.15)", color: "#fff", fontSize: 11, fontWeight: 700, borderRadius: 20, padding: "5px 13px", textTransform: "capitalize", ...ff }}>{c.status}</span>
        </div>
      </div>

      {/* Sub-tabs */}
      <div style={{ display: "flex", gap: 6 }}>
        {([["brief", "◆", "Brief & Rubric"], ["milestones", "◷", "Milestones"], ["teams", "◉", "Teams & Grading"]] as const).map(([id, icon, label]) => {
          const on = tab === id;
          return (
            <button key={id} onClick={() => setTab(id)} style={{
              ...ff, padding: "8px 16px", borderRadius: 8, fontSize: 12, cursor: "pointer", display: "flex", alignItems: "center", gap: 6,
              fontWeight: on ? 700 : 500, background: on ? NAVY : "#fff", color: on ? "#fff" : MUTED,
              border: `1px solid ${on ? NAVY : BORDER}`, boxShadow: on ? "0 2px 8px rgba(24, 40, 72,0.18)" : "none",
            }}><span style={{ opacity: on ? 1 : 0.6 }}>{icon}</span>{label}</button>
          );
        })}
      </div>

      {tab === "brief" && <BriefEditor detail={detail} onSaved={() => { reload(); onChanged(); }} />}
      {tab === "milestones" && <MilestonesEditor configId={configId} milestones={detail.milestones} onChanged={reload} />}
      {tab === "teams" && <TeamsGrading detail={detail} onChanged={() => { reload(); onChanged(); }} />}
    </div>
  );
}

// ── Brief & rubric editor + assign ──────────────────────────────────────────
function BriefEditor({ detail, onSaved }: { detail: ConfigDetailDTO; onSaved: () => void }) {
  const c = detail.config;
  const [title, setTitle] = useState(c.title);
  const [theme, setTheme] = useState(c.theme ?? "");
  const [problem, setProblem] = useState(c.problem_statement ?? "");
  const [objectives, setObjectives] = useState(c.objectives ?? "");
  const [formats, setFormats] = useState<string[]>(c.deliverable_format ?? []);
  const [rubric, setRubric] = useState<RubricCriterion[]>(c.rubric?.length ? c.rubric : [{ criterion: "", weight: 0 }]);
  const [resources, setResources] = useState<ResourceLink[]>(c.resources ?? []);
  const [refFiles, setRefFiles] = useState<ReferenceFile[]>(c.reference_files ?? []);
  const [uploadingRef, setUploadingRef] = useState(false);
  const [structure, setStructure] = useState<"individual" | "group">(c.team_structure);
  const [threshold, setThreshold] = useState(String(c.passing_threshold));
  const [deadline, setDeadline] = useState(c.deadline ?? "");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const [assignOpen, setAssignOpen] = useState(false);

  async function addRefFile(f: File) {
    setUploadingRef(true); setErr("");
    try {
      const up = await uploadFile(f);
      setRefFiles((p) => [...p, { title: f.name, content_id: up.data.content_id }]);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Upload failed");
    } finally { setUploadingRef(false); }
  }

  const rubricSum = rubric.reduce((s, r) => s + (Number(r.weight) || 0), 0);
  const FORMATS = ["Report", "Deck", "Prototype", "Video", "Presentation"];

  async function save() {
    if (rubric.some((r) => r.criterion.trim()) && Math.abs(rubricSum - 100) > 0.5) {
      setErr(`Rubric weights must sum to 100 (currently ${rubricSum}).`); return;
    }
    setSaving(true); setErr("");
    try {
      await capstoneManageApi.update(c.id, {
        title, theme, problem_statement: problem, objectives,
        deliverable_format: formats,
        rubric: rubric.filter((r) => r.criterion.trim()),
        resources: resources.filter((r) => r.title.trim() && r.url.trim()),
        reference_files: refFiles,
        team_structure: structure,
        passing_threshold: Number(threshold) || 0,
        deadline: deadline || "",
      });
      onSaved();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to save");
    } finally { setSaving(false); }
  }

  return (
    <div style={{ ...card(), padding: 20, display: "flex", flexDirection: "column", gap: 16 }}>
      <Field label="Title"><input value={title} onChange={(e) => setTitle(e.target.value)} style={inp} /></Field>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <Field label="Theme / Track"><input value={theme} onChange={(e) => setTheme(e.target.value)} placeholder="Tied to program outcomes" style={inp} /></Field>
        <Field label="Deadline"><input type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} style={inp} /></Field>
      </div>
      <Field label="Problem statement / theme"><textarea value={problem} onChange={(e) => setProblem(e.target.value)} style={ta} /></Field>
      <Field label="Objectives"><textarea value={objectives} onChange={(e) => setObjectives(e.target.value)} style={ta} /></Field>

      <Field label="Deliverable format">
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {FORMATS.map((f) => {
            const on = formats.includes(f);
            return (
              <button key={f} onClick={() => setFormats((p) => on ? p.filter((x) => x !== f) : [...p, f])} style={{
                ...ff, display: "inline-flex", alignItems: "center", gap: 5, padding: "6px 13px", borderRadius: 20, fontSize: 11, fontWeight: 700, cursor: "pointer",
                background: on ? "rgba(74, 85, 115,0.12)" : "#fff", color: on ? INDIGO : MUTED,
                border: `1.5px solid ${on ? "rgba(74, 85, 115,0.4)" : BORDER}`,
              }}>{on && <span style={{ fontSize: 9 }}>✓</span>}{f}</button>
            );
          })}
        </div>
      </Field>

      {/* Rubric builder */}
      <div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
          <label style={microLabel}>RUBRIC (WEIGHTS SUM TO 100)</label>
          <span style={{ fontSize: 11, fontWeight: 700, color: Math.abs(rubricSum - 100) < 0.5 ? GREEN : AMBER }}>Σ {rubricSum}</span>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {rubric.map((r, i) => (
            <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr 90px 28px", gap: 8, alignItems: "center" }}>
              <input value={r.criterion} onChange={(e) => setRubric((p) => p.map((x, j) => j === i ? { ...x, criterion: e.target.value } : x))} placeholder="Criterion (e.g. Strategic Thinking)" style={inp} />
              <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <input type="number" min={0} max={100} value={r.weight} onChange={(e) => setRubric((p) => p.map((x, j) => j === i ? { ...x, weight: Number(e.target.value) || 0 } : x))} style={{ ...inp, textAlign: "center" }} />
                <span style={{ fontSize: 11, color: MUTED }}>%</span>
              </div>
              <button onClick={() => setRubric((p) => p.filter((_, j) => j !== i))} style={iconBtn}>✕</button>
            </div>
          ))}
        </div>
        <button onClick={() => setRubric((p) => [...p, { criterion: "", weight: 0 }])} style={{ ...linkBtn, marginTop: 8 }}>+ Add criterion</button>
      </div>

      {/* Resources */}
      <div>
        <label style={microLabel}>REFERENCE RESOURCES</label>
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 8 }}>
          {resources.map((r, i) => (
            <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr 1fr 28px", gap: 8 }}>
              <input value={r.title} onChange={(e) => setResources((p) => p.map((x, j) => j === i ? { ...x, title: e.target.value } : x))} placeholder="Title" style={inp} />
              <input value={r.url} onChange={(e) => setResources((p) => p.map((x, j) => j === i ? { ...x, url: e.target.value } : x))} placeholder="https://…" style={inp} />
              <button onClick={() => setResources((p) => p.filter((_, j) => j !== i))} style={iconBtn}>✕</button>
            </div>
          ))}
        </div>
        <button onClick={() => setResources((p) => [...p, { title: "", url: "" }])} style={{ ...linkBtn, marginTop: 8 }}>+ Add link</button>
      </div>

      {/* Reference files (uploaded) */}
      <div>
        <label style={microLabel}>REFERENCE FILES</label>
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 8 }}>
          {refFiles.map((r, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", background: PAGE, borderRadius: 8 }}>
              <span style={{ fontSize: 16 }}>📎</span>
              <span style={{ flex: 1, minWidth: 0, fontSize: 12, fontWeight: 600, color: NAVY, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.title}</span>
              <RefDownload contentId={r.content_id} />
              <button onClick={() => setRefFiles((p) => p.filter((_, j) => j !== i))} style={iconBtn}>✕</button>
            </div>
          ))}
        </div>
        <label style={{ cursor: uploadingRef ? "default" : "pointer", display: "inline-block", marginTop: 8 }}>
          <input type="file" style={{ display: "none" }} disabled={uploadingRef} onChange={(e) => { const f = e.target.files?.[0]; if (f) addRefFile(f); }} />
          <span style={{ ...linkBtn }}>{uploadingRef ? "Uploading…" : "+ Upload reference file"}</span>
        </label>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <Field label="Team structure">
          <div style={{ display: "flex", gap: 8 }}>
            {(["group", "individual"] as const).map((s) => (
              <button key={s} onClick={() => setStructure(s)} style={{
                ...ff, flex: 1, padding: "8px", borderRadius: 8, fontSize: 12, cursor: "pointer",
                fontWeight: structure === s ? 700 : 500, textTransform: "capitalize",
                background: structure === s ? "rgba(74, 85, 115,0.1)" : "#fff", color: structure === s ? INDIGO : MUTED,
                border: `1px solid ${structure === s ? "rgba(74, 85, 115,0.3)" : BORDER}`,
              }}>{s}</button>
            ))}
          </div>
        </Field>
        <Field label="Passing threshold (/10)"><input type="number" min={0} max={10} step={0.5} value={threshold} onChange={(e) => setThreshold(e.target.value)} style={inp} /></Field>
      </div>

      {err && <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "9px 12px", borderRadius: 8, fontSize: 12, fontWeight: 600, background: "rgba(239,68,68,0.08)", color: "#ef4444" }}><span>⚠</span>{err}</div>}
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", paddingTop: 4, borderTop: `1px solid ${BORDER}`, marginTop: 2 }}>
        <button onClick={() => setAssignOpen(true)} style={{ ...btnGhost, display: "inline-flex", alignItems: "center", gap: 6 }}>👥 Assign to Teams</button>
        <button onClick={save} disabled={saving} style={{ ...btnPrim, opacity: saving ? 0.6 : 1 }}>{saving ? "Saving…" : "Save Changes"}</button>
      </div>

      {assignOpen && <AssignModal configId={c.id} orgId={c.org_id} programId={c.program_id} structure={structure} onClose={() => setAssignOpen(false)} onAssigned={onSaved} />}
    </div>
  );
}

// ── Assign modal - pick a cohort; group → als_team groups, individual → per participant
function AssignModal({ configId, orgId, programId, structure, onClose, onAssigned }: { configId: string; orgId: string; programId: string; structure: "individual" | "group"; onClose: () => void; onAssigned: () => void }) {
  const [cohorts, setCohorts] = useState<{ id: string; name: string }[]>([]);
  const [cohortId, setCohortId] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    cohortsApi.list(orgId, programId).then((r) => {
      const list = (r.data ?? []).map((c) => ({ id: c.id, name: c.name }));
      setCohorts(list);
      if (list[0]) setCohortId(list[0].id);
    }).catch(() => setCohorts([]));
  }, [orgId, programId]);

  async function assign() {
    if (!cohortId) return;
    setBusy(true); setMsg("");
    try {
      const r = await capstoneManageApi.assign(configId, { cohort_id: cohortId });
      setMsg(`Assigned to ${r.data?.assigned_teams ?? 0} team(s).`);
      onAssigned();
      setTimeout(onClose, 900);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Assign failed");
    } finally { setBusy(false); }
  }

  const isIndividual = structure === "individual";
  return (
    <Overlay onClose={onClose}>
      <div style={modal}>
        <ModalHead icon="▲" title="Assign Capstone"
          subtitle={isIndividual ? "Creates one individual capstone per participant in the cohort." : "Creates one team capstone per ALS team in the cohort."}
          onClose={onClose} />
        <div style={{ padding: 20 }}>
          {/* Structure summary chip */}
          <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", background: "rgba(74, 85, 115,0.06)", border: "1px solid rgba(74, 85, 115,0.2)", borderRadius: 10, marginBottom: 16 }}>
            <div style={{ width: 30, height: 30, borderRadius: 8, background: "rgba(74, 85, 115,0.15)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15, flexShrink: 0 }}>{isIndividual ? "👤" : "👥"}</div>
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, color: NAVY }}>{isIndividual ? "Individual capstone" : "Group capstone"}</div>
              <div style={{ fontSize: 11, color: MUTED }}>{isIndividual ? "Each participant works solo." : "Members grouped by the cohort's ALS teams."}</div>
            </div>
          </div>
          <Field label={isIndividual ? "Cohort (its participants)" : "Cohort (its ALS teams)"}>
            <select value={cohortId} onChange={(e) => setCohortId(e.target.value)} style={sel}>
              {cohorts.length === 0 && <option value="">No cohorts in this program</option>}
              {cohorts.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </Field>
          {msg && (
            <div style={{ marginTop: 12, display: "flex", alignItems: "center", gap: 8, padding: "9px 12px", borderRadius: 8, fontSize: 12, fontWeight: 600, background: msg.includes("Assigned") ? "rgba(34,197,94,0.08)" : "rgba(239,68,68,0.08)", color: msg.includes("Assigned") ? GREEN : "#ef4444" }}>
              <span>{msg.includes("Assigned") ? "✓" : "⚠"}</span>{msg}
            </div>
          )}
        </div>
        <div style={{ padding: "12px 20px", borderTop: `1px solid ${BORDER}`, display: "flex", gap: 8, justifyContent: "flex-end", background: "#FAFBFC" }}>
          <button onClick={onClose} style={btnGhost}>Cancel</button>
          <button onClick={assign} disabled={busy || !cohortId} style={{ ...btnPrim, opacity: busy || !cohortId ? 0.5 : 1 }}>{busy ? "Assigning…" : isIndividual ? "Assign to participants →" : "Assign to teams →"}</button>
        </div>
      </div>
    </Overlay>
  );
}

// ── Milestones ──────────────────────────────────────────────────────────────
function MilestonesEditor({ configId, milestones, onChanged }: { configId: string; milestones: MilestoneDTO[]; onChanged: () => void }) {
  const [title, setTitle] = useState("");
  const [due, setDue] = useState("");
  const [busy, setBusy] = useState(false);

  async function add() {
    if (!title.trim()) return;
    setBusy(true);
    try { await capstoneManageApi.addMilestone(configId, { title: title.trim(), due_date: due || undefined }); setTitle(""); setDue(""); onChanged(); }
    finally { setBusy(false); }
  }
  async function setStatus(m: MilestoneDTO, status: string) {
    await capstoneManageApi.updateMilestone(configId, m.id, {}, status); onChanged();
  }
  async function del(m: MilestoneDTO) { await capstoneManageApi.deleteMilestone(configId, m.id); onChanged(); }

  return (
    <div style={{ ...card(), padding: 20 }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 160px auto", gap: 8, marginBottom: 16 }}>
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Milestone title" style={inp} />
        <input type="date" value={due} onChange={(e) => setDue(e.target.value)} style={inp} />
        <button onClick={add} disabled={busy} style={btnPrim}>Add</button>
      </div>
      {milestones.length === 0 ? <Empty label="No milestones yet." /> : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {milestones.map((m) => (
            <div key={m.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 12px", background: PAGE, borderRadius: 8 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: NAVY }}>{m.title}</div>
                {m.due_date && <div style={{ fontSize: 11, color: MUTED }}>Due {m.due_date}</div>}
              </div>
              <select value={m.status} onChange={(e) => setStatus(m, e.target.value)} style={{ ...sel, width: 130, padding: "5px 8px", fontSize: 11 }}>
                {["upcoming", "open", "overdue", "done"].map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
              <button onClick={() => del(m)} style={iconBtn}>✕</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Teams & grading ─────────────────────────────────────────────────────────
function TeamsGrading({ detail, onChanged }: { detail: ConfigDetailDTO; onChanged: () => void }) {
  const [releasing, setReleasing] = useState(false);
  const anyUnreleased = detail.teams.some((t) => t.team_grade && !t.team_grade.released);

  async function release() {
    setReleasing(true);
    try { await capstoneManageApi.release(detail.config.id); onChanged(); }
    finally { setReleasing(false); }
  }

  if (detail.teams.length === 0) {
    return <div style={{ ...card(), padding: 40, textAlign: "center", color: MUTED, fontSize: 13 }}>No teams yet - assign the capstone from the Brief tab.</div>;
  }
  const gradedCount = detail.teams.filter((t) => t.team_grade).length;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ ...card(), padding: "12px 18px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <div style={{ fontSize: 12, color: MUTED }}>
          <span style={{ fontWeight: 700, color: NAVY }}>{gradedCount}/{detail.teams.length}</span> graded ·{" "}
          {anyUnreleased ? <span style={{ color: AMBER, fontWeight: 600 }}>grades held from participants</span> : <span style={{ color: GREEN, fontWeight: 600 }}>all released</span>}
        </div>
        <button onClick={release} disabled={releasing || !anyUnreleased} style={{ ...btnPrim, opacity: releasing || !anyUnreleased ? 0.5 : 1 }}>
          {releasing ? "Releasing…" : anyUnreleased ? "🔓 Release Grades" : "✓ Released"}
        </button>
      </div>
      {detail.teams.map((t) => (
        <TeamGradeCard key={t.team_id} configId={detail.config.id} team={t} rubric={detail.config.rubric} threshold={detail.config.passing_threshold} onChanged={onChanged} />
      ))}
    </div>
  );
}

function TeamGradeCard({ configId, team, rubric, threshold, onChanged }: {
  configId: string; team: ManagedTeamDTO; rubric: RubricCriterion[]; threshold: number; onChanged: () => void;
}) {
  const [open, setOpen] = useState(false);
  const g = team.team_grade;
  const submitted = team.submission_status === "submitted";
  const locked = !!g?.released; // released grades can't be re-graded
  const canGrade = submitted && !locked;
  const initials = (team.members[0]?.name ?? team.name).split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase();
  return (
    <div style={card()}>
      <div style={{ padding: "14px 18px", display: "flex", alignItems: "center", gap: 14 }}>
        <div style={{ width: 38, height: 38, borderRadius: team.is_individual ? "50%" : 10, background: g ? (g.score >= threshold ? "rgba(34,197,94,0.15)" : "rgba(245,158,11,0.15)") : "rgba(74, 85, 115,0.12)", color: g ? (g.score >= threshold ? GREEN : AMBER) : INDIGO, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 800, flexShrink: 0 }}>{team.is_individual ? initials : "👥"}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: NAVY }}>{team.name}{team.is_individual ? " · Individual" : ""}</div>
          <div style={{ fontSize: 11, color: MUTED, marginTop: 2, display: "flex", alignItems: "center", gap: 5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {team.members.map((m) => m.name).join(", ") || "No members"}
            <span style={{ color: submitted ? GREEN : AMBER, fontWeight: 600 }}>· {submitted ? "Submitted" : "Not submitted"}</span>
          </div>
        </div>
        {team.file_url && <SubmissionDownloadButton contentId={team.file_url} label={team.file_name || "View submission"} />}
        {team.completion_status === "complete" && <Badge label="✓ Complete" color={GREEN} />}
        {g && <span style={{ fontSize: 15, fontWeight: 800, color: g.score >= threshold ? GREEN : AMBER }}>{g.score}<span style={{ fontSize: 11, color: MUTED }}>/10</span>{g.released ? "" : <span style={{ fontSize: 9, color: AMBER, marginLeft: 4 }}>held</span>}</span>}
        {locked
          ? <span style={{ fontSize: 11, fontWeight: 700, color: GREEN, whiteSpace: "nowrap" }}>🔒 Released</span>
          : !submitted
            ? <span style={{ fontSize: 11, color: MUTED, fontWeight: 600, whiteSpace: "nowrap" }}>Awaiting submission</span>
            : <button onClick={() => setOpen((o) => !o)} style={{ ...btnGhost, ...(open || g ? {} : { background: NAVY, color: "#fff", border: "none" }) }}>{open ? "Close" : g ? "Edit" : "Grade"}</button>}
      </div>
      {open && canGrade && (
        <GradeForm configId={configId} teamId={team.team_id} members={team.members} rubric={rubric}
          existingTeam={team.team_grade} existingMembers={team.member_grades ?? []}
          onSaved={() => { setOpen(false); onChanged(); }} />
      )}
    </div>
  );
}

function GradeForm({ configId, teamId, members, rubric, existingTeam, existingMembers, onSaved }: {
  configId: string; teamId: string; members: { user_id: string; name: string }[]; rubric: RubricCriterion[];
  existingTeam?: ManagedTeamDTO["team_grade"]; existingMembers: NonNullable<ManagedTeamDTO["member_grades"]>;
  onSaved: () => void;
}) {
  // target: "team" or a participant user_id
  const [target, setTarget] = useState<string>("team");
  const seed = target === "team" ? existingTeam : existingMembers.find((m) => m.participant_id === target);
  const [score, setScore] = useState(String(seed?.score ?? ""));
  const [comments, setComments] = useState(seed?.comments ?? "");
  const [crit, setCrit] = useState<CriterionScore[]>(
    rubric.map((r) => seed?.per_criterion?.find((p) => p.criterion === r.criterion) ?? { criterion: r.criterion, score: 0 })
  );
  // Overall score auto-tracks the rubric's weighted average once criteria are
  // scored; faculty can still type over it (e.g. no rubric configured), which
  // flips it into manual mode until the target/criteria change again.
  const [overallEdited, setOverallEdited] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const weightedScore = useMemo(() => {
    if (!rubric.length) return null;
    const totalWeight = rubric.reduce((sum, r) => sum + r.weight, 0);
    if (totalWeight <= 0) return null;
    const weighted = crit.reduce((sum, c, i) => sum + c.score * (rubric[i]?.weight ?? 0), 0);
    return Math.round((weighted / totalWeight) * 10) / 10; // 1 decimal, 0-10 scale
  }, [crit, rubric]);

  // re-seed when target changes
  useEffect(() => {
    const s = target === "team" ? existingTeam : existingMembers.find((m) => m.participant_id === target);
    setScore(String(s?.score ?? ""));
    setComments(s?.comments ?? "");
    setCrit(rubric.map((r) => s?.per_criterion?.find((p) => p.criterion === r.criterion) ?? { criterion: r.criterion, score: 0 }));
    setOverallEdited(false);
  }, [target, existingTeam, existingMembers, rubric]);

  // keep "Overall" synced to the weighted rubric average until faculty
  // manually overrides it.
  useEffect(() => {
    if (!overallEdited && weightedScore !== null) setScore(String(weightedScore));
  }, [weightedScore, overallEdited]);

  async function save() {
    const sc = Number(score);
    if (isNaN(sc) || sc < 0 || sc > 10) { setErr("Score must be 0-10."); return; }
    setBusy(true); setErr("");
    try {
      await capstoneManageApi.grade(configId, {
        team_id: teamId,
        participant_id: target === "team" ? undefined : target,
        score: sc, per_criterion: rubric.length ? crit : undefined, comments,
      });
      onSaved();
    } catch (e) { setErr(e instanceof Error ? e.message : "Failed to save"); }
    finally { setBusy(false); }
  }

  return (
    <div style={{ padding: "8px 20px 18px", borderTop: `1px solid ${BORDER}`, background: "#EFE9DC" }}>
      <div style={{ display: "flex", gap: 6, margin: "10px 0", flexWrap: "wrap" }}>
        <TargetBtn label="Whole team" active={target === "team"} onClick={() => setTarget("team")} />
        {members.map((m) => <TargetBtn key={m.user_id} label={m.name} active={target === m.user_id} onClick={() => setTarget(m.user_id)} />)}
      </div>
      {rubric.length > 0 && (
        <div style={{ marginBottom: 10 }}>
          {rubric.map((r, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
              <span style={{ flex: 1, fontSize: 12, color: NAVY }}>{r.criterion} <span style={{ color: MUTED }}>({r.weight}%)</span></span>
              <input type="number" min={0} max={10} step={0.5} value={crit[i]?.score ?? 0}
                onChange={(e) => setCrit((p) => p.map((x, j) => j === i ? { ...x, score: Number(e.target.value) || 0 } : x))}
                style={{ ...inp, width: 64, textAlign: "center", padding: "5px 8px" }} />
              <span style={{ fontSize: 11, color: MUTED }}>/10</span>
            </div>
          ))}
        </div>
      )}
      <div style={{ display: "grid", gridTemplateColumns: "120px 1fr", gap: 12, alignItems: "start" }}>
        <Field label={rubric.length ? "Overall (auto)" : "Overall (/10)"}>
          <input type="number" min={0} max={10} step={0.5} value={score}
            onChange={(e) => { setScore(e.target.value); setOverallEdited(true); }}
            style={inp} />
          {rubric.length > 0 && !overallEdited && <div style={{ fontSize: 10, color: MUTED, marginTop: 4 }}>Weighted average of criteria above</div>}
        </Field>
        <Field label="Comments"><textarea value={comments} onChange={(e) => setComments(e.target.value)} style={{ ...ta, minHeight: 56 }} /></Field>
      </div>
      {err && <div style={{ color: "#ef4444", fontSize: 12, fontWeight: 600, marginBottom: 8 }}>{err}</div>}
      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <button onClick={save} disabled={busy} style={btnPrim}>{busy ? "Saving…" : "Save grade (held)"}</button>
      </div>
    </div>
  );
}

// ── primitives ──────────────────────────────────────────────────────────────
function card(): CSSProperties { return { background: "#fff", borderRadius: 12, border: `1px solid ${BORDER}`, boxShadow: "0 1px 4px rgba(24, 40, 72,0.06)" }; }
function Empty({ label }: { label: string }) { return <div style={{ padding: "36px 20px", textAlign: "center", color: MUTED, fontSize: 12, ...ff }}>{label}</div>; }
function RefDownload({ contentId }: { contentId: string }) {
  const [busy, setBusy] = useState(false);
  async function open() {
    setBusy(true);
    try { const { blobUrl } = await fetchFileBlob(contentId, "preview"); window.open(blobUrl, "_blank"); }
    catch { /* ignore */ } finally { setBusy(false); }
  }
  return <button onClick={open} disabled={busy} style={{ ...btnGhost, padding: "4px 10px", fontSize: 10 }}>{busy ? "…" : "Open"}</button>;
}
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><label style={microLabel}>{label.toUpperCase()}</label><div style={{ marginTop: 6 }}>{children}</div></div>;
}
function Badge({ label, color }: { label: string; color: string }) {
  return <span style={{ background: `${color}14`, color, fontSize: 10, fontWeight: 700, borderRadius: 20, padding: "3px 9px", whiteSpace: "nowrap" }}>{label}</span>;
}
function StatusPill({ status, big }: { status: string; big?: boolean }) {
  const map: Record<string, string> = { draft: "#4A5573", assigned: GREEN, closed: "#182848" };
  const color = map[status] ?? "#4A5573";
  return <span style={{ background: `${color}18`, color, fontSize: big ? 11 : 9, fontWeight: 700, borderRadius: 20, padding: big ? "4px 12px" : "2px 8px", textTransform: "capitalize", whiteSpace: "nowrap", ...ff }}>{status}</span>;
}
function TargetBtn({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return <button onClick={onClick} style={{
    ...ff, padding: "5px 12px", borderRadius: 20, fontSize: 11, fontWeight: active ? 700 : 500, cursor: "pointer",
    background: active ? "rgba(200, 168, 96,0.1)" : "#fff", color: active ? ORANGE : MUTED,
    border: `1px solid ${active ? "rgba(200, 168, 96,0.3)" : BORDER}`,
  }}>{label}</button>;
}
function Overlay({ onClose, children }: { onClose: () => void; children: React.ReactNode }) {
  return <div onClick={(e) => { if (e.target === e.currentTarget) onClose(); }} style={{ position: "fixed", inset: 0, background: "rgba(24, 40, 72,0.55)", zIndex: 2000, display: "flex", alignItems: "center", justifyContent: "center", padding: 24, backdropFilter: "blur(2px)", ...ff }}>{children}</div>;
}

// ModalHead - navy-gradient header strip with an icon + title + close (matches
// the app-wide modal chrome instead of a plain text row).
function ModalHead({ icon, title, subtitle, onClose }: { icon: string; title: string; subtitle?: string; onClose: () => void }) {
  return (
    <div style={{ background: "linear-gradient(135deg,#182848,#2d3a7c)", padding: "18px 22px", display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 14 }}>
      <div style={{ display: "flex", gap: 12, alignItems: "center", minWidth: 0 }}>
        <div style={{ width: 40, height: 40, borderRadius: 10, background: "rgba(255,255,255,0.12)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, flexShrink: 0 }}>{icon}</div>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: "#fff" }}>{title}</div>
          {subtitle && <div style={{ fontSize: 11, color: "rgba(255,255,255,0.6)", marginTop: 2, lineHeight: 1.5 }}>{subtitle}</div>}
        </div>
      </div>
      <button onClick={onClose} style={{ width: 28, height: 28, borderRadius: "50%", border: "1px solid rgba(255,255,255,0.2)", background: "transparent", color: "rgba(255,255,255,0.75)", cursor: "pointer", fontSize: 13, flexShrink: 0, ...ff }}>✕</button>
    </div>
  );
}

const microLabel: CSSProperties = { fontSize: 10, fontWeight: 700, color: MUTED, letterSpacing: 0.5, textTransform: "uppercase" };
const inp: CSSProperties = { width: "100%", border: `1.5px solid ${BORDER}`, borderRadius: 8, padding: "10px 12px", fontSize: 13, color: NAVY, outline: "none", boxSizing: "border-box", background: "#fff", ...ff };
const sel: CSSProperties = {
  ...inp, cursor: "pointer", appearance: "none", WebkitAppearance: "none", MozAppearance: "none",
  backgroundImage: "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%234A5573' stroke-width='3'><path d='M6 9l6 6 6-6'/></svg>\")",
  backgroundRepeat: "no-repeat", backgroundPosition: "right 12px center", paddingRight: 34,
};
const ta: CSSProperties = { ...inp, minHeight: 70, resize: "vertical", lineHeight: 1.6 };
const btnPrim: CSSProperties = { ...ff, padding: "10px 20px", background: ORANGE, border: "none", borderRadius: 8, color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap", boxShadow: "0 2px 8px rgba(200, 168, 96,0.28)" };
const btnGhost: CSSProperties = { ...ff, padding: "9px 16px", background: "#fff", border: `1.5px solid ${BORDER}`, borderRadius: 8, color: NAVY, fontSize: 12, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap" };

// Fetches the submitted file as an authenticated blob and opens it - mirrors
// CapstoneExperience.tsx's participant-side DownloadButton so faculty can
// actually see what was submitted while grading.
function SubmissionDownloadButton({ contentId, label }: { contentId: string; label: string }) {
  const [busy, setBusy] = useState(false);
  async function open() {
    setBusy(true);
    try { const { blobUrl } = await fetchFileBlob(contentId, "preview"); window.open(blobUrl, "_blank"); }
    catch { /* ignore */ } finally { setBusy(false); }
  }
  return <button onClick={open} disabled={busy} style={{ ...btnGhost, padding: "6px 14px", fontSize: 11, flexShrink: 0, overflow: "hidden", textOverflow: "ellipsis", maxWidth: 160 }}>{busy ? "…" : `📄 ${label}`}</button>;
}
const linkBtn: CSSProperties = { ...ff, background: "none", border: "none", color: ORANGE, fontSize: 11, fontWeight: 700, cursor: "pointer", padding: 0 };
const iconBtn: CSSProperties = { ...ff, width: 30, height: 30, border: `1px solid ${BORDER}`, borderRadius: 7, background: "#fff", color: MUTED, cursor: "pointer", fontSize: 12, display: "flex", alignItems: "center", justifyContent: "center" };
const modal: CSSProperties = { background: "#fff", borderRadius: 16, width: "100%", maxWidth: 480, boxShadow: "0 24px 64px rgba(24, 40, 72,0.28)", overflow: "hidden" };
