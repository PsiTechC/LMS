"use client";

import { useEffect, useMemo, useState } from "react";
import ReactDOM from "react-dom";
import { programsApi, ProgramDetailDTO, PhaseDTO, ModuleDTO, ActivityDTO, FacultyAssignmentDTO, ProgramDTO } from "@/lib/programs-api";
import { UserDTO } from "@/lib/api";
import { AssetDTO, contentApi } from "@/lib/content-api";

const ff: React.CSSProperties = { fontFamily: "Poppins, sans-serif" };
const C = { navy: "#182848", orange: "#C8A860", indigo: "#4A5573", green: "#22c55e", muted: "#4A5573", border: "#E6DED0", page: "#F7F5F0", inactive: "#C9BFA8" };

interface Props {
  user: UserDTO;
}

interface JourneyStep {
  phase: PhaseDTO;
  module: ModuleDTO;
  slot: "pre" | "in" | "post";
}

function localDay(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!match) return null;
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

function startOfToday(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

// Faculty should see one timeline step at a time. Program Design supplies a
// module session date, so the sequence is: pre-work before that date, the
// module's phase activities on that date, then post-work until the next module.
function buildJourney(program: ProgramDetailDTO): JourneyStep[] {
  const modules = (program.phases ?? [])
    .flatMap(phase => (phase.modules ?? []).map(module => ({ phase, module, date: module.session_date ? localDay(module.session_date) : null })))
    .filter((entry): entry is { phase: PhaseDTO; module: ModuleDTO; date: Date } => entry.date !== null)
    .sort((a, b) => a.date.getTime() - b.date.getTime() || a.module.sort_order - b.module.sort_order);

  if (modules.length === 0) return [];

  const today = startOfToday();
  for (let index = 0; index < modules.length; index++) {
    const current = modules[index];
    if (today.getTime() < current.date.getTime()) {
      const previous = modules[index - 1];
      if (previous?.module.post.length) return [{ phase: previous.phase, module: previous.module, slot: "post" }];
      return [{ phase: current.phase, module: current.module, slot: "pre" }];
    }
    if (today.getTime() === current.date.getTime()) {
      return [{ phase: current.phase, module: current.module, slot: "in" }];
    }
  }

  const last = modules[modules.length - 1];
  return [{ phase: last.phase, module: last.module, slot: "post" }];
}

export default function ProgramJourneyPanel({ user }: Props) {
  const [programList, setProgramList] = useState<{ id: string; title: string }[]>([]);
  const [selectedId, setSelectedId] = useState<string>("");
  const [detail, setDetail] = useState<ProgramDetailDTO | null>(null);
  const [loading, setLoading] = useState(true);
  const [viewer, setViewer] = useState<ActivityDTO | null>(null);

  // Load the program list for this user.
  useEffect(() => {
    let active = true;
    setLoading(true);
    (async () => {
      let progs: { id: string; title: string }[] = [];
      if (user.role === "faculty") {
        const r = await programsApi.getFacultyAssignments(user.id).catch(() => ({ data: [] as FacultyAssignmentDTO[] }));
        const seen = new Set<string>();
        (r.data ?? []).forEach(a => { if (!seen.has(a.program_id)) { seen.add(a.program_id); progs.push({ id: a.program_id, title: a.program_title }); } });
      } else if (user.org_id) {
        const r = await programsApi.list(user.org_id).catch(() => ({ data: [] as ProgramDTO[] }));
        progs = (r.data ?? []).filter(p => p.status === "active" || p.status === "upcoming").map(p => ({ id: p.id, title: p.title }));
      }
      if (!active) return;
      setProgramList(progs);
      setSelectedId(prev => prev || progs[0]?.id || "");
      if (!progs.length) setLoading(false);
    })();
    return () => { active = false; };
  }, [user.id, user.role, user.org_id]);

  // Load the selected program's detail (phases/modules).
  useEffect(() => {
    if (!selectedId) { setDetail(null); return; }
    let active = true;
    setLoading(true);
    programsApi.get(selectedId)
      .then(r => { if (active) setDetail(r.data ?? null); })
      .catch(() => { if (active) setDetail(null); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [selectedId]);

  const journey = useMemo(() => (detail ? buildJourney(detail) : []), [detail]);

  if (loading && !detail) {
    return (
      <div style={{ ...ff, background: "#fff", borderRadius: 12, border: `1px solid ${C.border}`, padding: "18px 20px", marginBottom: 16, fontSize: 12, color: C.muted }}>
        Loading program journey…
      </div>
    );
  }

  if (!detail) {
    return null; // no programs for this user — silently hide the panel
  }

  return (
    <div style={{ ...ff, background: "#fff", borderRadius: 12, border: `1px solid ${C.border}`, marginBottom: 16, overflow: "hidden" }}>
      {/* Header */}
      <div style={{ padding: "14px 20px", borderBottom: `1px solid ${C.border}`, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: C.navy }}>Program Journey</div>
        {programList.length > 1 && (
          <select value={selectedId} onChange={e => setSelectedId(e.target.value)}
            style={{ ...ff, fontSize: 12, border: `1px solid ${C.border}`, borderRadius: 8, padding: "6px 10px", color: C.navy, background: "#fff", cursor: "pointer", maxWidth: 260 }}>
            {programList.map(p => <option key={p.id} value={p.id}>{p.title}</option>)}
          </select>
        )}
      </div>

      {/* Curriculum timeline — each module owns its own pre-work/post-work. */}
      <div style={{ padding: "14px 16px", display: "flex", flexDirection: "column", gap: 16 }}>
        {journey.length === 0 && (
          <div style={{ fontSize: 12, color: C.muted, padding: "8px 4px" }}>This program has no assets assigned yet.</div>
        )}
        {journey.map(({ phase, module, slot }) => (
          <PhaseJourney key={module.id} phase={phase} module={module} slot={slot} onOpen={setViewer} />
        ))}
      </div>

      {viewer && (
        <AssetViewer activity={viewer} orgId={user.org_id ?? null} onClose={() => setViewer(null)} />
      )}
    </div>
  );
}

function PhaseJourney({ phase, module, slot, onOpen }: { phase: PhaseDTO; module: ModuleDTO; slot: "pre" | "in" | "post"; onOpen: (a: ActivityDTO) => void }) {
  const label = slot === "pre" ? "PRE-WORK" : slot === "post" ? "POST-WORK" : "MODULE ACTIVITIES";
  const items = slot === "pre" ? module.pre : slot === "post" ? module.post : phase.activities;
  const stateLabel = slot === "pre" ? "Upcoming module" : slot === "post" ? "Post-module work" : "Module day";

  return (
    <section style={{ border: `1px solid ${C.border}`, borderRadius: 10, overflow: "hidden" }}>
      <div style={{ padding: "10px 12px", background: C.page, borderBottom: `1px solid ${C.border}` }}>
        <div style={{ fontSize: 11, fontWeight: 800, color: C.navy }}>Phase {phase.phase_number}: {phase.title}</div>
        <div style={{ fontSize: 10, color: C.muted, marginTop: 3 }}>{stateLabel} · {module.title}{module.session_date ? ` · ${new Date(`${module.session_date}T00:00:00`).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}` : ""}</div>
      </div>
      <div style={{ padding: 12 }}>
        {items.length > 0
          ? <ActivityGroup label={label} items={items} onOpen={onOpen} />
          : <div style={{ fontSize: 11, color: C.muted }}>No {label.toLowerCase()} assigned for this module.</div>}
      </div>
    </section>
  );
}

function ActivityGroup({ label, items, onOpen }: { label: string; items: ActivityDTO[]; onOpen: (a: ActivityDTO) => void }) {
  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
        <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: 0.6, color: C.navy }}>{label}</span>
        <span style={{ fontSize: 9, fontWeight: 700, color: C.indigo, background: "rgba(74, 85, 115,0.1)", borderRadius: 20, padding: "2px 8px" }}>{items.length} item{items.length === 1 ? "" : "s"} from Studio</span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {items.map(activity => <AssetRow key={activity.id} activity={activity} onOpen={onOpen} />)}
      </div>
    </div>
  );
}

function AssetRow({ activity, onOpen }: { activity: ActivityDTO; onOpen: (a: ActivityDTO) => void }) {
  const hasAsset = Boolean(activity.config?.asset_id);
  return (
    <div
      onClick={() => hasAsset && onOpen(activity)}
      style={{ display: "flex", alignItems: "center", gap: 12, border: `1px solid ${C.border}`, borderRadius: 8, padding: "8px 12px", background: "#fff", cursor: hasAsset ? "pointer" : "default" }}
    >
      <div style={{ width: 32, height: 32, borderRadius: 8, background: C.page, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, flexShrink: 0 }}>
        {iconForType(activity.type)}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: C.navy, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{activity.title}</div>
        <div style={{ display: "flex", gap: 6, alignItems: "center", marginTop: 2 }}>
          <span style={{ fontSize: 9, fontWeight: 700, color: C.muted, textTransform: "capitalize" as const }}>{labelForType(activity.type)}</span>
          <span style={{ fontSize: 9, color: C.inactive }}>·</span>
          <span style={{ fontSize: 9, color: C.muted }}>{activity.duration_mins || 30} min</span>
          {activity.is_mandatory && <span style={{ fontSize: 9, fontWeight: 700, color: C.orange, background: "rgba(200, 168, 96,0.08)", borderRadius: 20, padding: "1px 7px" }}>Required</span>}
        </div>
      </div>
      {hasAsset && <span style={{ fontSize: 11, color: C.indigo, flexShrink: 0 }}>View →</span>}
    </div>
  );
}

// ── Asset viewer — read-only (no progress tracking; that's the participant
// experience). Opens whatever's attached: video, PDF, or an external link. ──
function AssetViewer({ activity, orgId, onClose }: { activity: ActivityDTO; orgId: string | null; onClose: () => void }) {
  const [asset, setAsset] = useState<AssetDTO | null>(null);
  const [loading, setLoading] = useState(true);
  const assetId = activity.config?.asset_id;

  useEffect(() => {
    if (!assetId || !orgId) { setLoading(false); return; }
    let active = true;
    setLoading(true);
    contentApi.get(orgId, assetId)
      .then(r => { if (active) setAsset(r.data); })
      .catch(() => { if (active) setAsset(null); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [assetId, orgId]);

  if (typeof document === "undefined") return null;

  const fileUrl = assetId && orgId && asset?.has_file ? contentApi.fileUrl(assetId, orgId) : null;
  const externalUrl = asset?.video_url || null;
  const isVideo = activity.type === "video" || (asset?.mime_type ?? "").startsWith("video/");
  const isPdf = asset?.mime_type === "application/pdf" || asset?.file_name?.toLowerCase().endsWith(".pdf");

  return ReactDOM.createPortal(
    <div onClick={e => { if (e.target === e.currentTarget) onClose(); }}
      style={{ position: "fixed", inset: 0, background: "rgba(24, 40, 72,0.55)", zIndex: 3000, display: "flex", alignItems: "center", justifyContent: "center", padding: 24, ...ff }}>
      <div style={{ background: "#fff", borderRadius: 16, width: "100%", maxWidth: 780, maxHeight: "88vh", overflow: "hidden", boxShadow: "0 24px 64px rgba(24, 40, 72,0.22)", display: "flex", flexDirection: "column" }}>
        <div style={{ padding: "18px 24px", borderBottom: `1px solid ${C.border}`, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16 }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: C.navy }}>{activity.title}</div>
            <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>{labelForType(activity.type)}{activity.duration_mins ? ` · ${activity.duration_mins} min` : ""}</div>
          </div>
          <button onClick={onClose} style={{ width: 30, height: 30, border: `1px solid ${C.border}`, borderRadius: "50%", background: "#fff", color: C.muted, cursor: "pointer", flexShrink: 0 }}>✕</button>
        </div>
        <div style={{ padding: 24, overflowY: "auto" }}>
          {!orgId && <div style={{ fontSize: 12, color: C.muted, textAlign: "center", padding: "24px 0" }}>Your organisation context is missing — please re-login to view content.</div>}
          {orgId && loading && <div style={{ fontSize: 12, color: C.muted, textAlign: "center", padding: "24px 0" }}>Loading content…</div>}
          {orgId && !loading && !assetId && <div style={{ fontSize: 12, color: C.muted, textAlign: "center", padding: "24px 0" }}>No content is attached to this item yet.</div>}
          {orgId && !loading && assetId && isVideo && fileUrl && (
            <video src={fileUrl} controls style={{ width: "100%", borderRadius: 10, background: "#000", maxHeight: 460 }} />
          )}
          {orgId && !loading && assetId && isVideo && !fileUrl && externalUrl && (
            <AssetLink url={externalUrl} label="Open video (hosted externally)" />
          )}
          {orgId && !loading && assetId && !isVideo && isPdf && fileUrl && (
            <iframe src={fileUrl} title="content" style={{ width: "100%", height: 480, border: `1px solid ${C.border}`, borderRadius: 10 }} />
          )}
          {orgId && !loading && assetId && !isVideo && !isPdf && fileUrl && (
            <AssetLink url={fileUrl} label={`Open ${asset?.file_name ?? "file"}`} />
          )}
          {orgId && !loading && assetId && !fileUrl && !isVideo && externalUrl && (
            <AssetLink url={externalUrl} label="Open resource" />
          )}
          {orgId && !loading && assetId && !fileUrl && !externalUrl && (
            <div style={{ fontSize: 12, color: C.muted, textAlign: "center", padding: "24px 0" }}>This item has no viewable file.</div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}

function AssetLink({ url, label }: { url: string; label: string }) {
  return (
    <div style={{ border: `2px dashed ${C.border}`, borderRadius: 12, padding: 32, textAlign: "center", background: "#FAFBFC" }}>
      <div style={{ fontSize: 28, marginBottom: 8, opacity: 0.4 }}>▶</div>
      <a href={url} target="_blank" rel="noreferrer" style={{ display: "inline-block", textDecoration: "none", background: C.orange, color: "#fff", padding: "10px 20px", borderRadius: 8, fontSize: 12, fontWeight: 700 }}>{label}</a>
    </div>
  );
}

function iconForType(type: string): string {
  switch (type) {
    case "video": return "▶";
    case "pdf": return "📄";
    case "case_study": return "📋";
    case "assessment": return "◎";
    case "survey": return "≡";
    case "coaching": return "◈";
    default: return "📖";
  }
}
function labelForType(type: string): string {
  switch (type) {
    case "video": return "Video";
    case "pdf": return "PDF";
    case "case_study": return "Case Study";
    case "content": return "Content";
    case "assessment": return "Assessment";
    case "survey": return "Survey";
    default: return type.replace(/_/g, " ");
  }
}
