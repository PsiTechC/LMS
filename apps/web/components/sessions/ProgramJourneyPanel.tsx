"use client";

import { useEffect, useMemo, useState } from "react";
import { programsApi, ProgramDetailDTO, ActivityDTO, FacultyAssignmentDTO, ProgramDTO } from "@/lib/programs-api";
import { UserDTO } from "@/lib/api";

const ff: React.CSSProperties = { fontFamily: "Poppins, sans-serif" };
const C = { navy: "#1C2551", orange: "#EF4E24", indigo: "#6B73BF", green: "#22c55e", muted: "#8b90a7", border: "#EAECF4", page: "#F5F7FB", inactive: "#D0D3E0" };

interface Props {
  user: UserDTO;
}

// A flattened, position-tagged view of one activity — the phase/module nesting
// it lived in on the Program Design side is a design-time concept only; here
// faculty just need "what's assigned, and is it pre/in/post program".
interface FlatAsset {
  activity: ActivityDTO;
  bucket: "pre" | "in" | "post";
}

// Every activity across every phase, flattened and bucketed by its slot:
// module pre-work -> PRE PROGRAM, module post-work -> POST PROGRAM, anything
// else (direct phase activities, e.g. capstone/discussion-type phases) -> IN PROGRAM.
function flattenAssets(program: ProgramDetailDTO): FlatAsset[] {
  const out: FlatAsset[] = [];
  const seen = new Set<string>();
  const push = (activity: ActivityDTO, bucket: FlatAsset["bucket"]) => {
    if (seen.has(activity.id)) return;
    seen.add(activity.id);
    out.push({ activity, bucket });
  };
  (program.phases ?? []).forEach(phase => {
    (phase.modules ?? []).forEach(mod => {
      mod.pre.forEach(a => push(a, "pre"));
      mod.post.forEach(a => push(a, "post"));
    });
    (phase.activities ?? []).forEach(a => push(a, "in"));
  });
  return out;
}

export default function ProgramJourneyPanel({ user }: Props) {
  const [programList, setProgramList] = useState<{ id: string; title: string }[]>([]);
  const [selectedId, setSelectedId] = useState<string>("");
  const [detail, setDetail] = useState<ProgramDetailDTO | null>(null);
  const [loading, setLoading] = useState(true);

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

  const assets = useMemo(() => (detail ? flattenAssets(detail) : []), [detail]);
  const preAssets = assets.filter(a => a.bucket === "pre");
  const inAssets = assets.filter(a => a.bucket === "in");
  const postAssets = assets.filter(a => a.bucket === "post");

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

      {/* Flat asset list, grouped by pre/in/post program */}
      <div style={{ padding: "14px 16px", display: "flex", flexDirection: "column", gap: 16 }}>
        {assets.length === 0 && (
          <div style={{ fontSize: 12, color: C.muted, padding: "8px 4px" }}>This program has no assets assigned yet.</div>
        )}
        {preAssets.length > 0 && <AssetGroup label="PRE PROGRAM" count={preAssets.length} items={preAssets} />}
        {inAssets.length > 0 && <AssetGroup label="IN PROGRAM" count={inAssets.length} items={inAssets} />}
        {postAssets.length > 0 && <AssetGroup label="POST PROGRAM" count={postAssets.length} items={postAssets} />}
      </div>
    </div>
  );
}

function AssetGroup({ label, count, items }: { label: string; count: number; items: FlatAsset[] }) {
  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
        <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: 0.6, color: C.navy }}>{label}</span>
        <span style={{ fontSize: 9, fontWeight: 700, color: C.indigo, background: "rgba(107,115,191,0.1)", borderRadius: 20, padding: "2px 8px" }}>{count} item{count === 1 ? "" : "s"} from Studio</span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {items.map(({ activity }) => <AssetRow key={activity.id} activity={activity} />)}
      </div>
    </div>
  );
}

function AssetRow({ activity }: { activity: ActivityDTO }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, border: `1px solid ${C.border}`, borderRadius: 8, padding: "8px 12px", background: "#fff" }}>
      <div style={{ width: 32, height: 32, borderRadius: 8, background: C.page, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, flexShrink: 0 }}>
        {iconForType(activity.type)}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: C.navy, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{activity.title}</div>
        <div style={{ display: "flex", gap: 6, alignItems: "center", marginTop: 2 }}>
          <span style={{ fontSize: 9, fontWeight: 700, color: C.muted, textTransform: "capitalize" as const }}>{labelForType(activity.type)}</span>
          <span style={{ fontSize: 9, color: C.inactive }}>·</span>
          <span style={{ fontSize: 9, color: C.muted }}>{activity.duration_mins || 30} min</span>
          {activity.is_mandatory && <span style={{ fontSize: 9, fontWeight: 700, color: C.orange, background: "rgba(239,78,36,0.08)", borderRadius: 20, padding: "1px 7px" }}>Required</span>}
        </div>
      </div>
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
