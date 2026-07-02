"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import { ActivityDTO, ProgramDetailDTO } from "@/lib/programs-api";
import { AssetDTO, contentApi } from "@/lib/content-api";
import { activityProgressApi, ActivityProgressDTO } from "@/lib/activity-progress-api";

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

      {viewer && orgId && (
        <ContentViewer
          activity={viewer}
          orgId={orgId}
          existing={progress[viewer.id]}
          onClose={() => setViewer(null)}
          onSaved={onProgressSaved}
        />
      )}
      {viewer && !orgId && (
        <ViewerShell title={viewer.title} onClose={() => setViewer(null)}>
          <SoftEmpty label="Your organisation context is missing — please re-login to view content." />
        </ViewerShell>
      )}
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
function ContentViewer({ activity, orgId, existing, onClose, onSaved }: {
  activity: ActivityDTO; orgId: string; existing?: ActivityProgressDTO;
  onClose: () => void; onSaved: (p: ActivityProgressDTO) => void;
}) {
  const [asset, setAsset] = useState<AssetDTO | null>(null);
  const [assetLoading, setAssetLoading] = useState(true);
  const [notes, setNotes] = useState(existing?.notes ?? "");
  const [notesSaving, setNotesSaving] = useState(false);
  const [notesSaved, setNotesSaved] = useState(false);
  const [marking, setMarking] = useState(false);
  const lastSentPct = useRef(existing?.progress_pct ?? 0);
  const done = existing?.status === "completed";

  const assetId = activity.config?.asset_id;

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
    try { await save({ completed: true, notes }); onClose(); }
    finally { setMarking(false); }
  }

  const fileUrl = assetId && asset?.has_file ? contentApi.fileUrl(assetId, orgId) : null;
  const externalUrl = asset?.video_url || null;

  return (
    <ViewerShell title={activity.title} subtitle={`${labelForType(activity.type)} · ${activity.duration_mins || 30} min`} onClose={onClose}>
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) 280px", gap: 16 }}>
        <div style={{ minWidth: 0 }}>
          {assetLoading && <SoftEmpty label="Loading content..." />}
          {!assetLoading && !assetId && <SoftEmpty label="No content is attached to this module yet." />}
          {!assetLoading && assetId && (
            <ContentBody asset={asset} fileUrl={fileUrl} externalUrl={externalUrl} type={activity.type} onTimeUpdate={handleTimeUpdate} />
          )}
          {activity.description && <div style={{ marginTop: 14, fontSize: 12, color: MUTED, lineHeight: 1.6 }}>{activity.description}</div>}
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <Card>
            <SectionTitle title="Note-Taking" />
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Capture your key insights..."
              style={{ width: "100%", height: 140, border: `1px solid ${BORDER}`, borderRadius: 8, padding: 10, fontSize: 12, fontFamily: "Poppins, sans-serif", resize: "vertical", boxSizing: "border-box", color: NAVY }}
            />
            <button onClick={saveNotes} disabled={notesSaving} style={{ ...secondaryButton, marginTop: 8, width: "100%", justifyContent: "center", opacity: notesSaving ? 0.7 : 1 }}>
              {notesSaving ? "Saving..." : notesSaved ? "✓ Saved" : "Save Note"}
            </button>
          </Card>
          <button onClick={markComplete} disabled={marking || done} style={{ ...primaryButton, width: "100%", justifyContent: "center", background: done ? GREEN : ORANGE, opacity: marking ? 0.7 : 1 }}>
            {done ? "✓ Completed" : marking ? "Saving..." : "Mark as Complete"}
          </button>
        </div>
      </div>
    </ViewerShell>
  );
}

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

function ViewerShell({ title, subtitle, onClose, children }: { title: string; subtitle?: string; onClose: () => void; children: ReactNode }) {
  return (
    <div style={modalOverlay} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div style={{ ...modalCard, maxWidth: 900 }}>
        <div style={{ padding: "18px 24px", borderBottom: `1px solid ${BORDER}`, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16 }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: NAVY }}>{title}</div>
            {subtitle && <div style={{ fontSize: 11, color: MUTED, marginTop: 2 }}>{subtitle}</div>}
          </div>
          <button onClick={onClose} style={iconButton}>✕</button>
        </div>
        <div style={{ padding: 24, overflowY: "auto" }}>{children}</div>
      </div>
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
    default: return "📖";
  }
}
function labelForType(type: string): string {
  switch (type) {
    case "video": return "Video";
    case "pdf": return "PDF";
    case "case_study": return "Case Study";
    case "content": return "Content";
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
const iconButton: CSSProperties = { width: 30, height: 30, border: `1px solid ${BORDER}`, borderRadius: "50%", background: "#fff", color: MUTED, cursor: "pointer", fontFamily: "Poppins, sans-serif", flexShrink: 0 };
const modalOverlay: CSSProperties = { position: "fixed", inset: 0, background: "rgba(28,37,81,0.55)", zIndex: 2000, display: "flex", alignItems: "center", justifyContent: "center", padding: 24, fontFamily: "Poppins, sans-serif" };
const modalCard: CSSProperties = { background: "#fff", borderRadius: 16, width: "100%", maxHeight: "90vh", overflow: "hidden", boxShadow: "0 24px 64px rgba(28,37,81,0.22)", display: "flex", flexDirection: "column" };
