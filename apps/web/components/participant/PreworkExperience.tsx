"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import { ActivityDTO, ProgramDetailDTO } from "@/lib/programs-api";
import { AssetDTO, contentApi } from "@/lib/content-api";
import { activityProgressApi, ActivityProgressDTO } from "@/lib/activity-progress-api";
import {
  studyCompanionApi,
  StudyCompanionMode,
  StudyCompanionResponseDTO,
} from "@/lib/study-companion-api";

const NAVY = "#1C2551";
const ORANGE = "#EF4E24";
const GREEN = "#22c55e";
const PAGE = "#F5F7FB";
const BORDER = "#EAECF4";
const MUTED = "#8b90a7";
const SHADOW = "0 1px 4px rgba(28,37,81,0.07)";

// Activity types that are "content modules" a participant consumes (as opposed
// to submittable artefacts). These are what the Pre-Work grid renders.
const CONTENT_TYPES = ["video", "pdf", "case_study", "content"];

type ProgressMap = Record<string, ActivityProgressDTO | undefined>;

interface Props {
  program: ProgramDetailDTO | null;
  orgId: string | null;
}

export default function PreworkExperience({ program, orgId }: Props) {
  const [progress, setProgress] = useState<ProgressMap>({});
  const [loading, setLoading] = useState(true);
  // Set when the participant opens a module — replaces the module grid with
  // a full-page view (content pane + Note-Taking + AI Study Companion), not
  // a modal, so there's real room for both the document and the companion.
  const [viewer, setViewer] = useState<ActivityDTO | null>(null);

  const modules = useMemo(() => contentActivities(program), [program]);

  const reloadProgress = useCallback(async () => {
    if (!program) return;
    try {
      const res = await activityProgressApi.listMine(program.id);
      const map: ProgressMap = {};
      (res.data ?? []).forEach((p) => { map[p.activity_id] = p; });
      setProgress(map);
    } catch {
      setProgress({});
    }
  }, [program]);

  useEffect(() => {
    let cancelled = false;
    void Promise.resolve().then(() => {
      if (cancelled) return;
      setLoading(true);
      reloadProgress().finally(() => { if (!cancelled) setLoading(false); });
    });
    return () => { cancelled = true; };
  }, [reloadProgress]);

  const doneCount = modules.filter((m) => progress[m.id]?.status === "completed").length;
  const overallPct = modules.length ? Math.round((doneCount / modules.length) * 100) : 0;
  // Estimated remaining = sum of durations for not-completed modules.
  const remainingMins = modules
    .filter((m) => progress[m.id]?.status !== "completed")
    .reduce((sum, m) => sum + (m.duration_mins || 0), 0);

  // AI recommendation: pick the first not-completed mandatory module, else first open one.
  const recommended = modules.find((m) => progress[m.id]?.status !== "completed" && m.is_mandatory)
    ?? modules.find((m) => progress[m.id]?.status !== "completed");

  function onProgressSaved(p: ActivityProgressDTO) {
    setProgress((prev) => ({ ...prev, [p.activity_id]: p }));
  }

  if (viewer && orgId) {
    return (
      <div style={{ padding: 24, fontFamily: "Poppins, sans-serif", background: PAGE, minHeight: "100%" }}>
        <ModuleView
          activity={viewer}
          orgId={orgId}
          existing={progress[viewer.id]}
          onBack={() => setViewer(null)}
          onSaved={onProgressSaved}
        />
      </div>
    );
  }
  if (viewer && !orgId) {
    return (
      <div style={{ padding: 24, fontFamily: "Poppins, sans-serif", background: PAGE, minHeight: "100%" }}>
        <SoftEmpty label="Your organisation context is missing — please re-login to view content." />
      </div>
    );
  }

  return (
    <div style={{ padding: 24, display: "flex", flexDirection: "column", gap: 16, fontFamily: "Poppins, sans-serif", background: PAGE }}>
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) 300px", gap: 16 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {loading && <SoftEmpty label="Loading your pre-work..." />}
          {!loading && modules.map((activity) => (
            <ModuleCard
              key={activity.id}
              activity={activity}
              progress={progress[activity.id]}
              onOpen={() => setViewer(activity)}
            />
          ))}
          {!loading && modules.length === 0 && (
            <EmptyCard title="Pre-work is being prepared" body="Once your Program Manager publishes video, PDF, or case-study content, it will show up here." />
          )}
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <Card>
            <SectionTitle title="Module Progress" />
            <div style={{ fontSize: 32, fontWeight: 800, color: ORANGE, marginBottom: 4 }}>{doneCount}/{modules.length}</div>
            <div style={{ fontSize: 11, color: MUTED, marginBottom: 12 }}>Modules completed</div>
            <ProgressBar pct={overallPct} color={program?.color || ORANGE} />
            <div style={{ marginTop: 16, fontSize: 12, color: MUTED }}>
              Estimated remaining: <strong style={{ color: NAVY }}>{formatDuration(remainingMins)}</strong>
            </div>
          </Card>

          <Card style={{ background: "rgba(239,78,36,0.03)", border: "1px solid rgba(239,78,36,0.15)" }}>
            <div style={{ fontSize: 11, fontWeight: 800, color: ORANGE, marginBottom: 8 }}>✦ AI Recommendation</div>
            <div style={{ fontSize: 12, color: NAVY, lineHeight: 1.6 }}>
              {recommended
                ? <>Continue with <strong>{recommended.title}</strong> next{recommended.is_mandatory ? " — it's a required module." : "."} Working through pre-work before your live session keeps you on track.</>
                : "All pre-work modules are complete. You're fully prepared for the next live session."}
            </div>
            {recommended && (
              <button style={{ ...actionButton, marginTop: 12 }} onClick={() => setViewer(recommended)}>
                {progress[recommended.id]?.status === "in_progress" ? "Resume" : "Start"} →
              </button>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}

// ── Module card (icon / duration / progress / Start·Resume·Done) ──────────────
function ModuleCard({ activity, progress, onOpen }: { activity: ActivityDTO; progress?: ActivityProgressDTO; onOpen: () => void }) {
  const pct = progress?.progress_pct ?? 0;
  const done = progress?.status === "completed";
  const started = progress?.status === "in_progress" || (pct > 0 && !done);
  return (
    <Card style={{ cursor: "pointer", border: `1px solid ${BORDER}` }}>
      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
        <div style={{ width: 44, height: 44, borderRadius: 10, background: done ? "rgba(28,37,81,0.06)" : "rgba(239,78,36,0.08)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, flexShrink: 0 }}>
          {iconForType(activity.type)}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 600, fontSize: 13, color: NAVY, marginBottom: 4 }}>{activity.title}</div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
            <Badge label={labelForType(activity.type)} color={NAVY} />
            <span style={{ fontSize: 11, color: MUTED }}>⏱ {activity.duration_mins || 30} min</span>
            {activity.is_mandatory && <Badge label="Required" color={ORANGE} />}
          </div>
          {pct > 0 && !done && <div style={{ marginTop: 8 }}><ProgressBar pct={pct} /></div>}
        </div>
        <div style={{ flexShrink: 0 }}>
          {done
            ? <span style={{ color: GREEN, fontWeight: 700, fontSize: 13 }}>✓ Done</span>
            : <button style={actionButton} onClick={onOpen}>{started ? "Resume" : "Start"}</button>}
        </div>
      </div>
    </Card>
  );
}

// ── Content viewer modal (player/iframe + note-taking) ────────────────────────
// ── Module full-page view: content pane (collapsible) + Note-Taking +
// inline AI Study Companion. Replaces the old modal — this is the whole
// Pre-Work page's main area while a module is open, so there's real room
// for both the document and the companion; no popup at all. ──────────────
const STUDY_MODES: { key: StudyCompanionMode; label: string; icon: string; blurb: string }[] = [
  { key: "practice_questions", label: "Practice Questions", icon: "✎", blurb: "Test your understanding with short-answer questions and model answers." },
  { key: "scenario_simulation", label: "Scenarios", icon: "◆", blurb: "Realistic workplace situations grounded in this module, with suggested guidance." },
  { key: "concept_explanation", label: "Key Concepts", icon: "◈", blurb: "The most important ideas from this module, explained in plain language." },
  { key: "summary", label: "Summary", icon: "▤", blurb: "A condensed, section-by-section summary of this module's content." },
];

function ModuleView({ activity, orgId, existing, onBack, onSaved }: {
  activity: ActivityDTO; orgId: string; existing?: ActivityProgressDTO;
  onBack: () => void; onSaved: (p: ActivityProgressDTO) => void;
}) {
  const [asset, setAsset] = useState<AssetDTO | null>(null);
  const [assetLoading, setAssetLoading] = useState(true);
  const [contentOpen, setContentOpen] = useState(true);
  const [notes, setNotes] = useState(existing?.notes ?? "");
  const [notesSaving, setNotesSaving] = useState(false);
  const [notesSaved, setNotesSaved] = useState(false);
  const [marking, setMarking] = useState(false);
  const [companionAvailable, setCompanionAvailable] = useState(false);
  const lastSentPct = useRef(existing?.progress_pct ?? 0);
  const done = existing?.status === "completed";

  const assetId = activity.config?.asset_id;

  useEffect(() => {
    let cancelled = false;
    studyCompanionApi.availability(activity.id)
      .then((res) => { if (!cancelled) setCompanionAvailable(!!res.data?.available); })
      .catch(() => { if (!cancelled) setCompanionAvailable(false); });
    return () => { cancelled = true; };
  }, [activity.id]);

  useEffect(() => {
    let cancelled = false;
    void Promise.resolve().then(() => {
      if (cancelled) return;
      if (!assetId) { setAssetLoading(false); return; }
      setAssetLoading(true);
      contentApi.get(orgId, assetId)
        .then((res) => { if (!cancelled) setAsset(res.data); })
        .catch(() => { if (!cancelled) setAsset(null); })
        .finally(() => { if (!cancelled) setAssetLoading(false); });
    });
    return () => { cancelled = true; };
  }, [assetId, orgId]);

  const save = useCallback(async (payload: { progress_pct?: number; last_position?: number; notes?: string; completed?: boolean }) => {
    const res = await activityProgressApi.upsert({ activity_id: activity.id, ...payload });
    onSaved(res.data);
    return res.data;
  }, [activity.id, onSaved]);

  // Throttle video progress writes: only send when watched % advances by >=5.
  const handleTimeUpdate = useCallback((el: HTMLVideoElement) => {
    if (!el.duration) return;
    const pct = Math.min(100, Math.round((el.currentTime / el.duration) * 100));
    if (pct - lastSentPct.current >= 5 || (pct >= 95 && lastSentPct.current < 95)) {
      lastSentPct.current = pct;
      void save({ progress_pct: pct, last_position: Math.floor(el.currentTime) });
    }
  }, [save]);

  async function saveNotes() {
    setNotesSaving(true); setNotesSaved(false);
    try { await save({ notes }); setNotesSaved(true); setTimeout(() => setNotesSaved(false), 1800); }
    finally { setNotesSaving(false); }
  }

  async function markComplete() {
    setMarking(true);
    try { await save({ completed: true, notes }); onBack(); }
    finally { setMarking(false); }
  }

  function appendToNotes(text: string) {
    setNotes((prev) => (prev.trim() ? `${prev.trim()}\n\n${text}` : text));
  }

  const fileUrl = assetId && asset?.has_file ? contentApi.fileUrl(assetId, orgId) : null;
  const externalUrl = asset?.video_url || null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16 }}>
        <div>
          <button onClick={onBack} style={{ ...ff, background: "none", border: "none", cursor: "pointer", color: MUTED, fontSize: 12, fontWeight: 600, padding: 0, marginBottom: 6, display: "flex", alignItems: "center", gap: 4 }}>
            ← Back to Pre-Work
          </button>
          <div style={{ fontSize: 17, fontWeight: 700, color: NAVY }}>{activity.title}</div>
          <div style={{ fontSize: 11.5, color: MUTED, marginTop: 2 }}>{labelForType(activity.type)} · {activity.duration_mins || 30} min</div>
        </div>
        <button onClick={markComplete} disabled={marking || done} style={{ ...primaryButton, background: done ? GREEN : ORANGE, opacity: marking ? 0.7 : 1, flexShrink: 0 }}>
          {done ? "✓ Completed" : marking ? "Saving..." : "Mark as Complete"}
        </button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: contentOpen ? "minmax(0,1fr) 420px" : "44px minmax(0,1fr)", gap: 16, alignItems: "start", transition: "grid-template-columns 0.2s ease" }}>
        {/* Content pane — collapsible so the companion can take the freed-up width */}
        {contentOpen ? (
          <div style={{ minWidth: 0 }}>
            <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 8 }}>
              <button onClick={() => setContentOpen(false)} style={secondaryButton}>« Hide content</button>
            </div>
            {assetLoading && <SoftEmpty label="Loading content..." />}
            {!assetLoading && !assetId && <SoftEmpty label="No content is attached to this module yet." />}
            {!assetLoading && assetId && (
              <ContentBody asset={asset} fileUrl={fileUrl} externalUrl={externalUrl} type={activity.type} onTimeUpdate={handleTimeUpdate} />
            )}
            {activity.description && <div style={{ marginTop: 14, fontSize: 12, color: MUTED, lineHeight: 1.6 }}>{activity.description}</div>}
          </div>
        ) : (
          <button
            onClick={() => setContentOpen(true)}
            title="Show content"
            style={{ ...ff, width: 44, height: 120, border: `1px solid ${BORDER}`, borderRadius: 10, background: "#fff", color: MUTED, cursor: "pointer", fontSize: 13, writingMode: "vertical-rl", textOrientation: "mixed" }}
          >
            » Show content
          </button>
        )}

        {/* Right column — Note-Taking + AI Study Companion, always full-height */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16, minWidth: 0 }}>
          <Card>
            <SectionTitle title="Note-Taking" />
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Capture your key insights..."
              style={{ width: "100%", height: 110, border: `1px solid ${BORDER}`, borderRadius: 8, padding: 10, fontSize: 12, fontFamily: "Poppins, sans-serif", resize: "vertical", boxSizing: "border-box", color: NAVY }}
            />
            <button onClick={saveNotes} disabled={notesSaving} style={{ ...secondaryButton, marginTop: 8, width: "100%", justifyContent: "center", opacity: notesSaving ? 0.7 : 1 }}>
              {notesSaving ? "Saving..." : notesSaved ? "✓ Saved" : "Save Note"}
            </button>
          </Card>

          {companionAvailable && (
            <AIStudyCompanionPanel activityId={activity.id} onCopyToNotes={appendToNotes} />
          )}
        </div>
      </div>
    </div>
  );
}

function AIStudyCompanionPanel({ activityId, onCopyToNotes }: { activityId: string; onCopyToNotes: (text: string) => void }) {
  const [mode, setMode] = useState<StudyCompanionMode>("practice_questions");
  const [result, setResult] = useState<StudyCompanionResponseDTO | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [copiedAll, setCopiedAll] = useState(false);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const generatedOnce = useRef(false);

  const generate = useCallback(async (nextMode: StudyCompanionMode) => {
    setMode(nextMode);
    setLoading(true);
    setError("");
    setResult(null);
    try {
      const res = await studyCompanionApi.generate(activityId, nextMode);
      setResult(res.data ?? null);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Couldn't generate study material right now.");
    } finally {
      setLoading(false);
    }
  }, [activityId]);

  useEffect(() => {
    if (generatedOnce.current) return;
    generatedOnce.current = true;
    void generate("practice_questions");
  }, [generate]);

  function copyText(text: string, index: number | "all") {
    onCopyToNotes(text);
    if (index === "all") {
      setCopiedAll(true);
      setTimeout(() => setCopiedAll(false), 1500);
    } else {
      setCopiedIndex(index);
      setTimeout(() => setCopiedIndex((cur) => (cur === index ? null : cur)), 1500);
    }
  }

  function allAsText(): string {
    if (!result) return "";
    switch (result.mode) {
      case "practice_questions":
        return (result.questions ?? []).map((q) => `${q.question}\n${q.model_answer}`).join("\n\n");
      case "scenario_simulation":
        return (result.scenarios ?? []).map((s) => `${s.scenario}\n${s.guidance}`).join("\n\n");
      case "concept_explanation":
        return (result.concepts ?? []).map((c) => `${c.term}: ${c.explanation}`).join("\n\n");
      case "summary":
        return (result.summary ?? []).map((s) => `${s.heading}\n${s.body}`).join("\n\n");
      default:
        return "";
    }
  }

  const activeModeInfo = STUDY_MODES.find((m) => m.key === mode);
  const isEmpty = result && !error &&
    !(result.questions?.length || result.scenarios?.length || result.concepts?.length || result.summary?.length);

  return (
    <Card style={{ background: "rgba(239,78,36,0.02)", border: "1px solid rgba(239,78,36,0.15)" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
        <div style={{ fontSize: 13, fontWeight: 800, color: ORANGE, display: "flex", alignItems: "center", gap: 6 }}>
          ✦ AI Study Companion
        </div>
        {result && !loading && (
          <button
            onClick={() => copyText(allAsText(), "all")}
            style={{ ...ff, fontSize: 10.5, fontWeight: 700, color: copiedAll ? GREEN : ORANGE, background: "none", border: "none", cursor: allAsText() ? "pointer" : "default", padding: 0, opacity: allAsText() ? 1 : 0.4 }}
            disabled={!allAsText()}
          >
            {copiedAll ? "✓ Added to Notes" : "⧉ Copy all to Notes"}
          </button>
        )}
      </div>

      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 6 }}>
        {STUDY_MODES.map((m) => (
          <button
            key={m.key}
            onClick={() => generate(m.key)}
            disabled={loading}
            style={{
              ...ff, fontSize: 11, fontWeight: 700, padding: "6px 10px", borderRadius: 8, cursor: loading ? "default" : "pointer",
              border: `1px solid ${mode === m.key ? ORANGE : BORDER}`,
              background: mode === m.key ? "rgba(239,78,36,0.08)" : "#fff",
              color: mode === m.key ? ORANGE : NAVY,
              opacity: loading && mode !== m.key ? 0.5 : 1,
            }}
          >
            {m.icon} {m.label}
          </button>
        ))}
      </div>
      {activeModeInfo && <div style={{ fontSize: 11, color: MUTED, marginBottom: 10 }}>{activeModeInfo.blurb}</div>}

      {loading && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, padding: "36px 0" }}>
          <span className="xa-typing-dot" style={dotStyle} />
          <span className="xa-typing-dot" style={dotStyle} />
          <span className="xa-typing-dot" style={dotStyle} />
          <span style={{ fontSize: 11.5, color: MUTED, marginLeft: 4 }}>Generating...</span>
        </div>
      )}

      {!loading && error && (
        <div style={{ textAlign: "center", padding: "20px 0" }}>
          <div style={{ fontSize: 12, color: "#ef4444", marginBottom: 10 }}>{error}</div>
          <button onClick={() => generate(mode)} style={secondaryButton}>Try again</button>
        </div>
      )}

      {!loading && !error && isEmpty && (
        <div style={{ fontSize: 11.5, color: MUTED, padding: "12px 0" }}>No material could be generated for this module.</div>
      )}

      {!loading && !error && result?.mode === "practice_questions" && (
        <QAList
          items={(result.questions ?? []).map((q) => ({ prompt: q.question, answer: q.model_answer, difficulty: q.difficulty }))}
          onCopy={copyText}
          copiedIndex={copiedIndex}
        />
      )}
      {!loading && !error && result?.mode === "scenario_simulation" && (
        <QAList
          items={(result.scenarios ?? []).map((s) => ({ prompt: s.scenario, answer: s.guidance, difficulty: s.difficulty }))}
          onCopy={copyText}
          copiedIndex={copiedIndex}
        />
      )}

      {!loading && !error && result?.mode === "concept_explanation" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {(result.concepts ?? []).map((c, i) => (
            <div key={i} style={{ paddingBottom: 12, borderBottom: i < (result.concepts?.length ?? 0) - 1 ? `1px solid ${BORDER}` : "none", background: "#fff", borderRadius: 8, padding: 11, border: `1px solid ${BORDER}` }}>
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: NAVY }}>{c.term}</div>
                <CopyButton onClick={() => copyText(`${c.term}: ${c.explanation}`, i)} copied={copiedIndex === i} />
              </div>
              <div style={{ fontSize: 12, color: MUTED, lineHeight: 1.6, marginTop: 4 }}>{c.explanation}</div>
            </div>
          ))}
        </div>
      )}

      {!loading && !error && result?.mode === "summary" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {(result.summary ?? []).map((s, i) => (
            <div key={i} style={{ background: "#fff", borderRadius: 8, padding: 11, border: `1px solid ${BORDER}` }}>
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10 }}>
                <div style={{ fontSize: 12.5, fontWeight: 700, color: NAVY }}>{s.heading}</div>
                <CopyButton onClick={() => copyText(`${s.heading}\n${s.body}`, i)} copied={copiedIndex === i} />
              </div>
              <div style={{ fontSize: 12.5, color: NAVY, lineHeight: 1.7, marginTop: 5 }}>{s.body}</div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

// Shared list rendering for practice_questions / scenario_simulation — both
// are genuine Q&A pairs (question+answer, scenario+guidance), just with
// different field names on the wire; normalized to {prompt, answer} here.
function QAList({ items, onCopy, copiedIndex }: {
  items: { prompt: string; answer: string; difficulty: string }[];
  onCopy: (text: string, index: number) => void;
  copiedIndex: number | null;
}) {
  const [openIndex, setOpenIndex] = useState<number | null>(0);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {items.map((it, i) => (
        <div key={i} style={{ border: `1px solid ${BORDER}`, borderRadius: 10, overflow: "hidden" }}>
          <button
            onClick={() => setOpenIndex(openIndex === i ? null : i)}
            style={{
              ...ff, width: "100%", textAlign: "left", background: openIndex === i ? "#FAFBFC" : "#fff", border: "none", cursor: "pointer",
              padding: "13px 16px", fontSize: 13.5, color: NAVY, fontWeight: 600, display: "flex", gap: 10, alignItems: "flex-start",
            }}
          >
            <span style={{ flex: 1, lineHeight: 1.5 }}>{it.prompt}</span>
            {it.difficulty && <DifficultyBadge level={it.difficulty} />}
            <span style={{ color: MUTED, fontSize: 11, flexShrink: 0, marginTop: 2 }}>{openIndex === i ? "▲" : "▼"}</span>
          </button>
          {openIndex === i && (
            <div style={{ padding: "0 16px 14px", borderTop: `1px solid ${BORDER}`, paddingTop: 12 }}>
              <div style={{ fontSize: 12.5, color: MUTED, lineHeight: 1.7, marginBottom: 10 }}>{it.answer}</div>
              <CopyButton onClick={() => onCopy(`${it.prompt}\n${it.answer}`, i)} copied={copiedIndex === i} />
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function DifficultyBadge({ level }: { level: string }) {
  const color = level === "hard" ? "#ef4444" : level === "medium" ? "#f59e0b" : GREEN;
  return <Badge label={level} color={color} />;
}

function CopyButton({ onClick, copied }: { onClick: () => void; copied: boolean }) {
  return (
    <button
      onClick={onClick}
      style={{
        ...ff, fontSize: 11, fontWeight: 700, padding: "6px 11px", borderRadius: 6, cursor: "pointer",
        border: `1px solid ${copied ? GREEN : BORDER}`,
        background: copied ? "rgba(34,197,94,0.08)" : "#fff",
        color: copied ? GREEN : NAVY,
      }}
    >
      {copied ? "✓ Added to Notes" : "⧉ Copy to Notes"}
    </button>
  );
}

const ff = { fontFamily: "Poppins, sans-serif" } as const;
const dotStyle: CSSProperties = { width: 6, height: 6, borderRadius: "50%", background: MUTED, display: "inline-block" };

function ContentBody({ asset, fileUrl, externalUrl, type, onTimeUpdate }: {
  asset: AssetDTO | null; fileUrl: string | null; externalUrl: string | null; type: string;
  onTimeUpdate: (el: HTMLVideoElement) => void;
}) {
  const mime = asset?.mime_type ?? "";
  const isVideo = type === "video" || mime.startsWith("video/");
  const isPdf = mime === "application/pdf" || asset?.file_name?.toLowerCase().endsWith(".pdf");

  if (isVideo && fileUrl) {
    return (
      <video src={fileUrl} controls style={{ width: "100%", borderRadius: 10, background: "#000", maxHeight: 420 }}
        onTimeUpdate={(e) => onTimeUpdate(e.currentTarget)} />
    );
  }
  if (isVideo && externalUrl) {
    return <EmbeddedLink url={externalUrl} label="Open video (hosted externally)" />;
  }
  if (isPdf && fileUrl) {
    return <iframe src={fileUrl} title="content" style={{ width: "100%", height: 480, border: `1px solid ${BORDER}`, borderRadius: 10 }} />;
  }
  if (fileUrl) {
    // Generic file (pptx/doc/etc.) — browsers can't inline these reliably.
    return <EmbeddedLink url={fileUrl} label={`Open ${asset?.file_name ?? "file"}`} />;
  }
  if (externalUrl) {
    return <EmbeddedLink url={externalUrl} label="Open resource" />;
  }
  return <SoftEmpty label="This module has no viewable file. Mark complete once you've reviewed the material." />;
}

function EmbeddedLink({ url, label }: { url: string; label: string }) {
  return (
    <div style={{ border: `2px dashed ${BORDER}`, borderRadius: 12, padding: 32, textAlign: "center", background: "#FAFBFC" }}>
      <div style={{ fontSize: 28, marginBottom: 8, opacity: 0.4 }}>▶</div>
      <a href={url} target="_blank" rel="noreferrer" style={{ ...primaryButton, display: "inline-block", textDecoration: "none" }}>{label}</a>
    </div>
  );
}

// ── helpers & primitives (aligned to design tokens) ───────────────────────────
function contentActivities(program: ProgramDetailDTO | null): ActivityDTO[] {
  if (!program) return [];
  const all = (program.phases ?? []).flatMap((phase) => {
    const direct = phase.activities ?? [];
    const moduled = (phase.modules ?? []).flatMap((m) => [...(m.pre ?? []), ...(m.post ?? [])]);
    return [...direct, ...moduled];
  });
  // De-dupe (an activity can appear both directly and via module join in some shapes).
  const seen = new Set<string>();
  return all.filter((a) => {
    if (!CONTENT_TYPES.includes(a.type) || seen.has(a.id)) return false;
    seen.add(a.id);
    return true;
  });
}

function iconForType(type: string): string {
  switch (type) {
    case "video": return "▶";
    case "pdf": return "📄";
    case "case_study": return "📋";
    case "content": return "▤";
    default: return "📖";
  }
}
function labelForType(type: string): string {
  switch (type) {
    case "video": return "Video";
    case "pdf": return "PDF";
    case "case_study": return "Case Study";
    case "content": return "eLearning";
    default: return type.replace(/_/g, " ");
  }
}
function formatDuration(mins: number): string {
  if (mins <= 0) return "0m";
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function Card({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return <div style={{ background: "#fff", borderRadius: 12, border: `1px solid ${BORDER}`, boxShadow: SHADOW, padding: 20, ...style }}>{children}</div>;
}
function SectionTitle({ title }: { title: string }) {
  return <div style={{ fontSize: 13, fontWeight: 700, color: NAVY, marginBottom: 12 }}>{title}</div>;
}
function Badge({ label, color = ORANGE }: { label: string; color?: string }) {
  return <span style={{ background: `${color}14`, color, fontSize: 10, fontWeight: 700, borderRadius: 20, padding: "3px 9px", whiteSpace: "nowrap" }}>{label}</span>;
}
function ProgressBar({ pct, color = ORANGE }: { pct: number; color?: string }) {
  return <div style={{ height: 6, background: "#F0F1F7", borderRadius: 99 }}><div style={{ height: "100%", width: `${Math.max(0, Math.min(100, pct))}%`, background: color, borderRadius: 99 }} /></div>;
}
function SoftEmpty({ label }: { label: string }) {
  return <div style={{ padding: "24px 0", textAlign: "center", color: MUTED, fontSize: 12 }}>{label}</div>;
}
function EmptyCard({ title, body }: { title: string; body: string }) {
  return (
    <Card style={{ padding: 40, textAlign: "center" }}>
      <div style={{ fontSize: 16, fontWeight: 800, color: NAVY, marginBottom: 8 }}>{title}</div>
      <div style={{ fontSize: 13, color: MUTED, lineHeight: 1.6, maxWidth: 460, margin: "0 auto" }}>{body}</div>
    </Card>
  );
}

const actionButton: CSSProperties = { padding: "8px 14px", background: ORANGE, border: "none", borderRadius: 8, color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "Poppins, sans-serif", whiteSpace: "nowrap" };
const primaryButton: CSSProperties = { ...actionButton, padding: "10px 20px", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 };
const secondaryButton: CSSProperties = { padding: "8px 16px", border: `1px solid ${BORDER}`, borderRadius: 8, background: "#fff", color: NAVY, fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "Poppins, sans-serif", display: "flex", alignItems: "center" };
