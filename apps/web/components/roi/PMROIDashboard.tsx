"use client";

import React, { useState, useEffect, useCallback } from "react";
import { analyticsApi, ROIResponse, CompetencyImprovementRow } from "@/lib/analytics-api";
import { cohortsApi, CohortDTO } from "@/lib/cohorts-api";

// ── Design tokens ─────────────────────────────────────────────────
const NAVY   = "var(--xa-navy)";
const ORANGE = "var(--xa-primary)";
const INDIGO = "#4A5573";
const BG     = "var(--xa-bg)";
const BORDER = "#E6DED0";
const MUTED  = "var(--xa-muted)";
const GREEN  = "#22c55e";

// ── Types for local features ──────────────────────────────────────
interface ImpactStory {
  id: string;
  author: string;
  role: string;
  text: string;
  date: string;
}

// ── Main component ────────────────────────────────────────────────
export default function PMROIDashboard({ orgId }: { orgId: string }) {
  const [cohorts,       setCohorts]       = useState<CohortDTO[]>([]);
  const [selectedCohort, setSelectedCohort] = useState("");
  const [roi,           setRoi]           = useState<ROIResponse | null>(null);
  const [loading,       setLoading]       = useState(false);

  // Manager satisfaction — stored locally (no backend table yet)
  const [managerScore,  setManagerScore]  = useState<number | null>(null);
  const [managerTotal,  setManagerTotal]  = useState<number>(5.0);
  const [editingMgr,    setEditingMgr]    = useState(false);
  const [mgrtInput,     setMgrtInput]     = useState("");

  // Business impact stories — stored locally
  const [stories,       setStories]       = useState<ImpactStory[]>([]);
  const [addingStory,   setAddingStory]   = useState(false);
  const [storyForm,     setStoryForm]     = useState({ author: "", role: "", text: "" });

  // AI narrative
  const [narrative,     setNarrative]     = useState<string | null>(null);

  const loadCohorts = useCallback(async () => {
    try {
      const res = await cohortsApi.list(orgId);
      const list = res.data ?? [];
      setCohorts(list);
      if (list.length > 0 && !selectedCohort) setSelectedCohort(list[0].id);
    } catch { /* ignore */ }
  }, [orgId, selectedCohort]);

  useEffect(() => { loadCohorts(); }, [loadCohorts]);

  useEffect(() => {
    if (!selectedCohort) return;
    setLoading(true);
    setRoi(null);
    analyticsApi.roi(selectedCohort)
      .then(res => { setRoi(res.data ?? null); buildNarrative(res.data); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [selectedCohort]);

  function buildNarrative(data: ROIResponse | null) {
    if (!data || !data.competencies?.length) { setNarrative(null); return; }
    const cohort = cohorts.find(c => c.id === data.cohort_id);
    const name   = cohort?.name ?? "this cohort";
    const avg    = data.avg_improvement.toFixed(0);
    const top    = [...data.competencies].sort((a, b) => b.improvement_abs - a.improvement_abs)[0];
    const mgr    = managerScore !== null ? ` Manager satisfaction scored ${managerScore}/${managerTotal}.` : "";
    const st     = stories.length > 0 ? ` ${stories.length} business impact ${stories.length === 1 ? "story" : "stories"} submitted.` : "";
    setNarrative(
      `Participants in ${name} showed a +${avg} point average competency improvement across ${data.competencies.length} leadership dimensions.` +
      (top ? ` Highest gain in ${top.title} (+${top.improvement_abs.toFixed(0)} pts).` : "") +
      mgr + st +
      (data.avg_improvement > 0 ? ` Estimated ROI: ${(data.avg_improvement / 8).toFixed(1)}x program investment based on performance improvement metrics.` : "")
    );
  }

  function handleSaveManagerScore() {
    const v = parseFloat(mgrtInput);
    if (!isNaN(v) && v >= 0 && v <= managerTotal) {
      setManagerScore(v);
      setEditingMgr(false);
    }
  }

  function handleAddStory() {
    if (!storyForm.text.trim()) return;
    const s: ImpactStory = {
      id:     Date.now().toString(),
      author: storyForm.author || "Anonymous",
      role:   storyForm.role   || "Participant",
      text:   storyForm.text,
      date:   new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }),
    };
    setStories(prev => [s, ...prev]);
    setStoryForm({ author: "", role: "", text: "" });
    setAddingStory(false);
  }

  function handleDeleteStory(id: string) {
    setStories(prev => prev.filter(s => s.id !== id));
  }

  // Derived stats
  const avgImprovement = roi?.avg_improvement ?? 0;
  const sortedComps    = roi ? [...(roi.competencies ?? [])].sort((a, b) => b.improvement_abs - a.improvement_abs) : [];
  const improving      = sortedComps.filter(c => c.improvement_abs > 0).length;
  const maxAbs         = sortedComps[0]?.improvement_abs ?? 1;

  return (
    <div style={{ padding: 24, display: "flex", flexDirection: "column", gap: 20, fontFamily: "Poppins,sans-serif" }}>

      {/* Cohort selector */}
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: MUTED, letterSpacing: 0.5 }}>COHORT</div>
        <select value={selectedCohort} onChange={e => setSelectedCohort(e.target.value)}
          style={{ border: `1px solid ${BORDER}`, borderRadius: 8, padding: "7px 12px", fontSize: 13, fontFamily: "Poppins,sans-serif", color: NAVY, background: "#fff", minWidth: 240 }}>
          {cohorts.length === 0
            ? <option value="">No cohorts</option>
            : cohorts.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        {loading && <span style={{ fontSize: 11, color: MUTED }}>Loading…</span>}
      </div>

      {/* ── Row 1: KPI cards ──────────────────────────────────────── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16 }}>
        {/* Pre/Post Competency Lift */}
        <div style={card}>
          <div style={cardLabel}>Pre/Post Competency Lift</div>
          <div style={{ fontSize: 38, fontWeight: 800, color: ORANGE, lineHeight: 1.1, marginTop: 8 }}>
            {avgImprovement > 0 ? `+${avgImprovement.toFixed(0)}` : loading ? "—" : "0"} <span style={{ fontSize: 20 }}>pts avg</span>
          </div>
          <div style={cardSub}>vs. baseline assessment</div>
          {improving > 0 && (
            <div style={{ marginTop: 10, fontSize: 11, color: GREEN, fontWeight: 600 }}>
              {improving} of {sortedComps.length} competencies improving
            </div>
          )}
        </div>

        {/* Manager Satisfaction */}
        <div style={card}>
          <div style={cardLabel}>Manager Satisfaction</div>
          {managerScore !== null ? (
            <>
              <div style={{ fontSize: 38, fontWeight: 800, color: NAVY, lineHeight: 1.1, marginTop: 8 }}>
                {managerScore.toFixed(1)}<span style={{ fontSize: 20, color: MUTED }}>/{managerTotal.toFixed(1)}</span>
              </div>
              <div style={cardSub}>from post-program survey</div>
              <button onClick={() => { setEditingMgr(true); setMgrtInput(String(managerScore)); }}
                style={{ marginTop: 10, fontSize: 11, color: INDIGO, background: "none", border: "none", cursor: "pointer", fontFamily: "Poppins,sans-serif", padding: 0 }}>
                Edit score
              </button>
            </>
          ) : editingMgr ? (
            <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 8 }}>
              <div style={{ fontSize: 11, color: MUTED }}>Enter score (out of {managerTotal})</div>
              <input type="number" min={0} max={managerTotal} step={0.1} value={mgrtInput}
                onChange={e => setMgrtInput(e.target.value)}
                placeholder={`0 – ${managerTotal}`}
                style={{ border: `1px solid ${BORDER}`, borderRadius: 6, padding: "7px 10px", fontSize: 13, fontFamily: "Poppins,sans-serif", color: NAVY, outline: "none", width: 100 }} />
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={handleSaveManagerScore}
                  style={{ background: NAVY, color: "#fff", border: "none", borderRadius: 6, padding: "6px 14px", fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "Poppins,sans-serif" }}>
                  Save
                </button>
                <button onClick={() => setEditingMgr(false)}
                  style={{ background: "none", border: `1px solid ${BORDER}`, borderRadius: 6, padding: "6px 12px", fontSize: 11, cursor: "pointer", fontFamily: "Poppins,sans-serif" }}>
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <>
              <div style={{ fontSize: 28, fontWeight: 700, color: MUTED, marginTop: 12 }}>—</div>
              <div style={cardSub}>No score entered yet</div>
              <button onClick={() => { setEditingMgr(true); setMgrtInput(""); }}
                style={{ marginTop: 10, fontSize: 11, color: ORANGE, fontWeight: 600, background: `${ORANGE}10`, border: `1px solid ${ORANGE}30`, borderRadius: 6, padding: "5px 12px", cursor: "pointer", fontFamily: "Poppins,sans-serif" }}>
                + Enter Score
              </button>
            </>
          )}
        </div>

        {/* Business Impact Stories */}
        <div style={card}>
          <div style={cardLabel}>Business Impact Stories</div>
          <div style={{ fontSize: 38, fontWeight: 800, color: INDIGO, lineHeight: 1.1, marginTop: 8 }}>
            {stories.length}
          </div>
          <div style={cardSub}>submitted by participants</div>
          <button onClick={() => setAddingStory(true)}
            style={{ marginTop: 10, fontSize: 11, color: ORANGE, fontWeight: 600, background: `${ORANGE}10`, border: `1px solid ${ORANGE}30`, borderRadius: 6, padding: "5px 12px", cursor: "pointer", fontFamily: "Poppins,sans-serif" }}>
            + Add Story
          </button>
        </div>
      </div>

      {/* ── Row 2: AI Narrative + Competency bars ─────────────────── */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 420px", gap: 16, alignItems: "start" }}>

        {/* AI Narrative */}
        <div style={{ ...card, background: `${ORANGE}05`, border: `1px solid ${ORANGE}20` }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: ORANGE, marginBottom: 12, display: "flex", alignItems: "center", gap: 6 }}>
            <span>✦</span> AI-Generated ROI Narrative
          </div>
          {narrative ? (
            <p style={{ fontSize: 13, color: NAVY, lineHeight: 1.8, margin: 0 }}>
              {narrative.split(/(\*\*.*?\*\*)/).map((chunk, i) =>
                chunk.startsWith("**") && chunk.endsWith("**")
                  ? <strong key={i}>{chunk.slice(2, -2)}</strong>
                  : <span key={i}>{chunk}</span>
              )}
            </p>
          ) : (
            <p style={{ fontSize: 13, color: MUTED, lineHeight: 1.8, margin: 0 }}>
              {loading ? "Generating narrative…" : selectedCohort ? "No competency data available for this cohort yet. Add pre/post scores in the Analytics tab to generate a narrative." : "Select a cohort to generate an AI narrative."}
            </p>
          )}
          {narrative && (
            <button style={{ marginTop: 16, background: ORANGE, color: "#fff", border: "none", borderRadius: 8, padding: "9px 20px", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "Poppins,sans-serif" }}>
              Export ROI Report
            </button>
          )}
        </div>

        {/* Competency Improvement */}
        <div style={card}>
          <div style={{ fontSize: 14, fontWeight: 700, color: NAVY, marginBottom: 16 }}>Competency Improvement</div>
          {loading ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {[1,2,3,4,5].map(i => (
                <div key={i} className="xa-skeleton" style={{ height: 24, borderRadius: 6, background: "#EFE9DC" }} />
              ))}
            </div>
          ) : sortedComps.length === 0 ? (
            <div style={{ fontSize: 12, color: MUTED, padding: "20px 0" }}>No competency data for this cohort.</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {sortedComps.map(c => <CompetencyBar key={c.competency_id} comp={c} max={maxAbs} />)}
            </div>
          )}
        </div>
      </div>

      {/* ── Impact Stories section ─────────────────────────────────── */}
      {(stories.length > 0 || addingStory) && (
        <div style={card}>
          <div style={{ fontSize: 14, fontWeight: 700, color: NAVY, marginBottom: 16 }}>Business Impact Stories</div>

          {addingStory && (
            <div style={{ background: BG, borderRadius: 10, padding: 16, border: `1px solid ${BORDER}`, marginBottom: 16, display: "flex", flexDirection: "column", gap: 10 }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <div>
                  <div style={fieldLabel}>Participant Name</div>
                  <input value={storyForm.author} onChange={e => setStoryForm(f => ({ ...f, author: e.target.value }))}
                    placeholder="e.g. Priya Sharma" style={inputStyle} />
                </div>
                <div>
                  <div style={fieldLabel}>Role / Department</div>
                  <input value={storyForm.role} onChange={e => setStoryForm(f => ({ ...f, role: e.target.value }))}
                    placeholder="e.g. Senior Manager, Finance" style={inputStyle} />
                </div>
              </div>
              <div>
                <div style={fieldLabel}>Impact Story *</div>
                <textarea value={storyForm.text} onChange={e => setStoryForm(f => ({ ...f, text: e.target.value }))}
                  placeholder="Describe the business impact or outcome achieved as a result of the program…"
                  rows={3}
                  style={{ ...inputStyle, resize: "vertical" }} />
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={handleAddStory} disabled={!storyForm.text.trim()}
                  style={{ background: NAVY, color: "#fff", border: "none", borderRadius: 7, padding: "8px 18px", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "Poppins,sans-serif", opacity: storyForm.text.trim() ? 1 : 0.4 }}>
                  Save Story
                </button>
                <button onClick={() => { setAddingStory(false); setStoryForm({ author: "", role: "", text: "" }); }}
                  style={{ background: "none", border: `1px solid ${BORDER}`, borderRadius: 7, padding: "8px 14px", fontSize: 12, cursor: "pointer", fontFamily: "Poppins,sans-serif" }}>
                  Cancel
                </button>
              </div>
            </div>
          )}

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))", gap: 14 }}>
            {stories.map((s, i) => (
              <div key={s.id} style={{ background: BG, borderRadius: 10, padding: 16, border: `1px solid ${BORDER}`, position: "relative" }}>
                <button onClick={() => handleDeleteStory(s.id)}
                  style={{ position: "absolute", top: 10, right: 10, background: "none", border: "none", cursor: "pointer", fontSize: 14, color: MUTED }}>
                  ×
                </button>
                {/* Story number badge */}
                <div style={{ width: 28, height: 28, borderRadius: 8, background: `${INDIGO}14`, color: INDIGO, fontSize: 12, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 10 }}>
                  {i + 1}
                </div>
                <p style={{ fontSize: 13, color: NAVY, lineHeight: 1.7, margin: "0 0 10px" }}>
                  &ldquo;{s.text}&rdquo;
                </p>
                <div style={{ fontSize: 11, fontWeight: 600, color: MUTED }}>
                  — {s.author} <span style={{ fontWeight: 400 }}>· {s.role}</span>
                </div>
                <div style={{ fontSize: 10, color: MUTED, marginTop: 4 }}>{s.date}</div>
              </div>
            ))}
          </div>

          {stories.length > 0 && (
            <button onClick={() => setAddingStory(true)} style={{ marginTop: 14, fontSize: 12, color: ORANGE, fontWeight: 600, background: "none", border: "none", cursor: "pointer", fontFamily: "Poppins,sans-serif", padding: 0 }}>
              + Add another story
            </button>
          )}
        </div>
      )}

      {/* ── Pre/Post detail table ──────────────────────────────────── */}
      {sortedComps.length > 0 && (
        <div style={{ ...card, overflow: "hidden", padding: 0 }}>
          <div style={{ padding: "14px 20px", borderBottom: `1px solid ${BORDER}`, fontSize: 13, fontWeight: 700, color: NAVY }}>
            Competency Detail — Pre vs Post
          </div>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: BG }}>
                {["COMPETENCY", "CATEGORY", "BASELINE", "CURRENT", "IMPROVEMENT", "TREND"].map(h => (
                  <th key={h} style={{ padding: "9px 16px", textAlign: "left", fontSize: 10, fontWeight: 700, color: MUTED, letterSpacing: 0.5, whiteSpace: "nowrap" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sortedComps.map(c => {
                const pos = c.improvement_abs > 0;
                return (
                  <tr key={c.competency_id} style={{ borderTop: `1px solid ${BORDER}` }}>
                    <td style={{ padding: "11px 16px", fontWeight: 600, color: NAVY, fontSize: 13 }}>{c.title}</td>
                    <td style={{ padding: "11px 16px" }}>
                      <span style={{ background: `${INDIGO}12`, color: INDIGO, fontSize: 10, fontWeight: 700, borderRadius: 20, padding: "3px 9px" }}>
                        {c.category || "General"}
                      </span>
                    </td>
                    <td style={{ padding: "11px 16px", fontSize: 13, color: MUTED }}>{c.pre_program_pct.toFixed(0)}%</td>
                    <td style={{ padding: "11px 16px", fontSize: 13, color: NAVY, fontWeight: 600 }}>{c.current_pct.toFixed(0)}%</td>
                    <td style={{ padding: "11px 16px" }}>
                      <span style={{ background: pos ? "#22c55e14" : "#ef444414", color: pos ? GREEN : "#ef4444", fontSize: 12, fontWeight: 700, borderRadius: 6, padding: "3px 8px" }}>
                        {pos ? "+" : ""}{c.improvement_abs.toFixed(0)} pts
                      </span>
                    </td>
                    <td style={{ padding: "11px 16px" }}>
                      <MiniBar pre={c.pre_program_pct} post={c.current_pct} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

    </div>
  );
}

// ── Competency horizontal bar ─────────────────────────────────────
function CompetencyBar({ comp, max }: { comp: CompetencyImprovementRow; max: number }) {
  const pct = max > 0 ? (comp.improvement_abs / max) * 100 : 0;
  const pos = comp.improvement_abs >= 0;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <div style={{ fontSize: 12, color: NAVY, width: 140, flexShrink: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={comp.title}>
        {comp.title}
      </div>
      <div style={{ flex: 1, height: 8, background: "#EFE9DC", borderRadius: 99, overflow: "hidden" }}>
        <div className="xa-progress-fill" style={{ width: `${Math.max(pct, 2)}%`, height: "100%", background: pos ? ORANGE : "#ef4444", borderRadius: 99 }} />
      </div>
      <div style={{ fontSize: 12, fontWeight: 700, color: pos ? GREEN : "#ef4444", width: 36, textAlign: "right", flexShrink: 0 }}>
        {pos ? "+" : ""}{comp.improvement_abs.toFixed(0)}
      </div>
    </div>
  );
}

// ── Mini pre/post bar for table ───────────────────────────────────
function MiniBar({ pre, post }: { pre: number; post: number }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 2, width: 100 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
        <div style={{ fontSize: 9, color: MUTED, width: 18 }}>Pre</div>
        <div style={{ flex: 1, height: 5, background: "#EFE9DC", borderRadius: 99, overflow: "hidden" }}>
          <div style={{ width: `${pre}%`, height: "100%", background: `${MUTED}60`, borderRadius: 99 }} />
        </div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
        <div style={{ fontSize: 9, color: ORANGE, width: 18 }}>Post</div>
        <div style={{ flex: 1, height: 5, background: "#EFE9DC", borderRadius: 99, overflow: "hidden" }}>
          <div style={{ width: `${post}%`, height: "100%", background: ORANGE, borderRadius: 99 }} />
        </div>
      </div>
    </div>
  );
}

// ── Style helpers ─────────────────────────────────────────────────
const card: React.CSSProperties = {
  background: "#fff", borderRadius: 12, border: `1px solid ${BORDER}`,
  boxShadow: "0 1px 4px rgba(24, 40, 72,0.07)", padding: 20,
};
const cardLabel: React.CSSProperties = {
  fontSize: 11, fontWeight: 600, color: MUTED,
};
const cardSub: React.CSSProperties = {
  fontSize: 11, color: MUTED, marginTop: 4,
};
const fieldLabel: React.CSSProperties = {
  fontSize: 10, fontWeight: 700, color: MUTED, letterSpacing: 0.5,
  textTransform: "uppercase", marginBottom: 6,
};
const inputStyle: React.CSSProperties = {
  border: `1px solid ${BORDER}`, borderRadius: 8, padding: "9px 12px",
  fontSize: 13, fontFamily: "Poppins,sans-serif", color: NAVY,
  width: "100%", boxSizing: "border-box", outline: "none",
};
