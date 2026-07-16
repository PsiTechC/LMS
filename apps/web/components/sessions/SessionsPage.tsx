"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import ReactDOM from "react-dom";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import {
  sessionsApi, uploadFile, zoomApi,
  SessionDTO, MaterialDTO, ActionItemDTO, AgendaItemDTO,
} from "@/lib/faculty-api";
import { programsApi, FacultyAssignmentDTO } from "@/lib/programs-api";
import { cohortsApi, MyEnrollmentDTO } from "@/lib/cohorts-api";
import { resolveJoinLink } from "@/lib/session-link";
import AttendanceModal from "@/components/sessions/AttendanceModal";
import LivePollModal   from "@/components/sessions/LivePollModal";
import BreakoutModal   from "@/components/sessions/BreakoutModal";
import TimerPanel      from "@/components/sessions/TimerPanel";
import SessionNotes    from "@/components/sessions/SessionNotes";
import ActionTags      from "@/components/sessions/ActionTags";
import ReflectionPanel from "@/components/sessions/ReflectionPanel";
import ProgramJourneyPanel from "@/components/sessions/ProgramJourneyPanel";

// ─────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────

const ff: React.CSSProperties = { fontFamily: "Poppins, sans-serif" };

// Agenda item types that live in the PRE PROGRAM phase
const PRE_TYPES  = new Set(["presentation", "activity", "break", "poll"]);
// Agenda item types that live in the POST PROGRAM phase
const POST_TYPES = new Set(["discussion"]);

// ─────────────────────────────────────────────────────────────
// Small shared primitives
// ─────────────────────────────────────────────────────────────

function typeIcon(type: string): React.ReactNode {
  const map: Record<string, string> = {
    presentation: "▤",
    video:        "▶",
    pdf:          "≡",
    ppt:          "▤",
    case_study:   "◆",
    article:      "≡",
    assessment:   "◎",
    survey:       "≡",
    journal:      "◇",
    discussion:   "○",
    activity:     "◆",
    break:        "◌",
    poll:         "◎",
    link:         "⇗",
    docx:         "≡",
    mp4:          "▶",
    upload:       "↑",
  };
  return map[type] ?? "◌";
}

function typeIconColor(type: string): string {
  const map: Record<string, string> = {
    presentation: "#1C2551",
    video:        "#EF4E24",
    pdf:          "#1C2551",
    ppt:          "#EF4E24",
    case_study:   "#6B73BF",
    article:      "#1C2551",
    assessment:   "#EF4E24",
    survey:       "#8b90a7",
    journal:      "#EF4E24",
    discussion:   "#6B73BF",
    activity:     "#6B73BF",
    break:        "#8b90a7",
    poll:         "#22c55e",
    link:         "#6B73BF",
    mp4:          "#EF4E24",
  };
  return map[type] ?? "#8b90a7";
}

function typeLabel(type: string): string {
  const map: Record<string, string> = {
    presentation: "Deck",
    video: "Video",
    pdf: "PDF",
    ppt: "PPT",
    case_study: "Case Study",
    article: "Article",
    assessment: "Assessment",
    survey: "Survey",
    journal: "Journal",
    discussion: "Discussion",
    activity: "Activity",
    break: "Break",
    poll: "Poll",
    link: "Link",
    docx: "Doc",
    mp4: "Video",
  };
  return map[type] ?? type.charAt(0).toUpperCase() + type.slice(1);
}

// Progress bar — shows 0% when no progress data exists yet
function ProgressBar({ pct }: { pct: number }) {
  const color = pct >= 100 ? "#22c55e" : pct > 0 ? "#f97316" : "#E5E7EB";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 140 }}>
      <div style={{ flex: 1, height: 6, background: "#F0F1F7", borderRadius: 99, overflow: "hidden" }}>
        <div style={{ width: `${Math.min(pct, 100)}%`, height: "100%", background: color, borderRadius: 99, transition: "width 0.3s ease" }} />
      </div>
      <span style={{ ...ff, fontSize: 11, fontWeight: 700, color: pct >= 100 ? "#22c55e" : "#8b90a7", minWidth: 32, textAlign: "right" }}>
        {pct >= 100 ? "" : `${pct}%`}
      </span>
    </div>
  );
}

function DoneBadge() {
  return (
    <span style={{ ...ff, fontSize: 10, fontWeight: 700, background: "#22c55e20", color: "#22c55e", borderRadius: 20, padding: "3px 10px" }}>
      DONE
    </span>
  );
}

function PendingBadge() {
  return (
    <span style={{ ...ff, fontSize: 10, fontWeight: 700, background: "#f59e0b20", color: "#f59e0b", borderRadius: 20, padding: "3px 10px" }}>
      PENDING
    </span>
  );
}

// ─────────────────────────────────────────────────────────────
// Phase section wrapper
// ─────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────
// Agenda item row (PRE PROGRAM)
// ─────────────────────────────────────────────────────────────

function AgendaRow({ item, progress = 0 }: { item: AgendaItemDTO; progress?: number }) {
  const color = typeIconColor(item.type);
  return (
    <div style={{
      display: "flex",
      alignItems: "center",
      gap: 14,
      padding: "12px 20px",
      borderBottom: "1px solid #F0F1F7",
      background: "#fff",
    }}>
      {/* Type icon */}
      <div style={{
        width: 34,
        height: 34,
        borderRadius: 8,
        background: `${color}15`,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: 14,
        color,
        flexShrink: 0,
      }}>
        {typeIcon(item.type)}
      </div>

      {/* Title + meta */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          ...ff,
          fontSize: 13,
          fontWeight: 600,
          color: progress >= 100 ? "#8b90a7" : "#1C2551",
          textDecoration: progress >= 100 ? "line-through" : "none",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap" as const,
        }}>
          {item.title}
        </div>
        <div style={{ ...ff, fontSize: 11, color: "#8b90a7", marginTop: 2 }}>
          {typeLabel(item.type)} · {item.duration_mins} min
        </div>
      </div>

      {/* Progress */}
      <div style={{ flexShrink: 0 }}>
        {progress >= 100 ? <DoneBadge /> : <ProgressBar pct={progress} />}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Material row (IN PROGRAM uploaded file)
// ─────────────────────────────────────────────────────────────

function MaterialRow({ m, onDelete }: { m: MaterialDTO; onDelete: () => void }) {
  const color = typeIconColor(m.type);
  return (
    <div style={{
      display: "flex",
      alignItems: "center",
      gap: 14,
      padding: "12px 20px",
      borderBottom: "1px solid #F0F1F7",
      background: "#fff",
    }}>
      <div style={{
        width: 34,
        height: 34,
        borderRadius: 8,
        background: `${color}15`,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: 14,
        color,
        flexShrink: 0,
      }}>
        {typeIcon(m.type)}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ ...ff, fontSize: 13, fontWeight: 600, color: "#1C2551", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>
          {m.title}
        </div>
        <div style={{ ...ff, fontSize: 11, color: "#8b90a7", marginTop: 2 }}>
          {typeLabel(m.type)} · Uploaded {new Date(m.created_at).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
        </div>
      </div>
      <button
        onClick={onDelete}
        title="Remove"
        style={{ background: "none", border: "none", cursor: "pointer", fontSize: 13, color: "#ef4444", padding: "4px 8px", borderRadius: 6, ...ff }}
      >
        ✕
      </button>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Action item row (POST PROGRAM)
// ─────────────────────────────────────────────────────────────

function ActionRow({ item }: { item: ActionItemDTO }) {
  const done = item.status === "completed";
  const color = typeIconColor("assessment");
  return (
    <div style={{
      display: "flex",
      alignItems: "center",
      gap: 14,
      padding: "12px 20px",
      borderBottom: "1px solid #F0F1F7",
      background: "#fff",
    }}>
      <div style={{
        width: 34,
        height: 34,
        borderRadius: 8,
        background: `${color}15`,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: 14,
        color,
        flexShrink: 0,
      }}>
        ◇
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          ...ff,
          fontSize: 13,
          fontWeight: 600,
          color: done ? "#8b90a7" : "#1C2551",
          textDecoration: done ? "line-through" : "none",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap" as const,
        }}>
          {item.description}
        </div>
        <div style={{ ...ff, fontSize: 11, color: "#8b90a7", marginTop: 2 }}>
          Action Item{item.due_date ? ` · Due ${new Date(item.due_date).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}` : ""}
        </div>
      </div>
      <div style={{ flexShrink: 0 }}>
        {done ? <DoneBadge /> : <PendingBadge />}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Drag-and-drop upload zone (IN PROGRAM)
// ─────────────────────────────────────────────────────────────

function UploadZone({
  sessionId,
  onUploaded,
}: {
  sessionId: string;
  onUploaded: (m: MaterialDTO) => void;
}) {
  const inputRef             = useRef<HTMLInputElement>(null);
  const [dragging, setDrag]  = useState(false);
  const [uploading, setUpl]  = useState(false);
  const [error, setError]    = useState("");

  const ALLOWED_EXTS = [".pptx", ".ppt", ".pdf", ".mp4", ".docx", ".mov", ".png", ".jpg", ".jpeg"];

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    const file = files[0];
    const ext  = "." + file.name.split(".").pop()!.toLowerCase();
    if (!ALLOWED_EXTS.includes(ext)) {
      setError(`File type not supported. Allowed: ${ALLOWED_EXTS.join(", ")}`);
      return;
    }
    setError("");
    setUpl(true);
    try {
      // Step 1: upload binary to file storage, get content_id
      const uploadRes = await uploadFile(file);
      const contentId = uploadRes.data.content_id;
      const mimeType  = uploadRes.data.mime_type;

      // Step 2: record as a session material so it belongs to this session
      const matType = mimeType.startsWith("video/") ? "video"
        : mimeType === "application/pdf" ? "pdf"
        : mimeType.includes("presentation") ? "ppt"
        : mimeType.includes("word") ? "docx"
        : "link";

      const matRes = await sessionsApi.addMaterial(sessionId, {
        title: file.name.replace(/\.[^.]+$/, ""),
        type: matType,
        url: `content://${contentId}`,
        size_bytes: file.size,
      });
      if (matRes.data) onUploaded(matRes.data);
    } catch (e: unknown) {
      setError((e as Error).message ?? "Upload failed");
    } finally {
      setUpl(false);
    }
  }

  return (
    <div style={{ padding: "12px 20px 16px" }}>
      <div
        onClick={() => !uploading && inputRef.current?.click()}
        onDragOver={e => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={e => { e.preventDefault(); setDrag(false); handleFiles(e.dataTransfer.files); }}
        style={{
          border: `2px dashed ${dragging ? "#EF4E24" : "#EAECF4"}`,
          borderRadius: 10,
          padding: "28px 20px",
          textAlign: "center" as const,
          cursor: uploading ? "not-allowed" : "pointer",
          background: dragging ? "rgba(239,78,36,0.04)" : "#FAFBFD",
          transition: "border-color 0.15s, background 0.15s",
        }}
      >
        <div style={{ fontSize: 24, marginBottom: 8 }}>↑</div>
        {uploading ? (
          <div style={{ ...ff, fontSize: 13, fontWeight: 600, color: "#6B73BF" }}>Uploading…</div>
        ) : (
          <>
            <div style={{ ...ff, fontSize: 13, fontWeight: 600, color: "#1C2551" }}>
              Upload session content — decks, videos, case studies
            </div>
            <div style={{ ...ff, fontSize: 11, color: "#8b90a7", marginTop: 4 }}>
              PPTX, PDF, MP4, DOCX · Drag &amp; drop or click
            </div>
          </>
        )}
      </div>
      {error && (
        <div style={{ ...ff, fontSize: 11, color: "#ef4444", marginTop: 6 }}>{error}</div>
      )}
      <input
        ref={inputRef}
        type="file"
        accept={ALLOWED_EXTS.join(",")}
        style={{ display: "none" }}
        onChange={e => handleFiles(e.target.files)}
      />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Session row — simple list item: title, date/time, in-person/virtual tag,
// Join button for virtual. Clicking opens the full session workspace below.
// ─────────────────────────────────────────────────────────────

function SessionRow({ s, selected, isLast, onOpen }: { s: SessionDTO; selected: boolean; isLast: boolean; onOpen: () => void }) {
  // meeting_type (in_person | external_link | zoom_embedded) is the real
  // source of truth for virtual vs in-person — session_type is a different
  // axis entirely (classroom | coaching_group | coaching_individual) and
  // was never a reliable signal for this, including for classroom sessions
  // scheduled as Zoom/external link.
  const isVirtual = s.meeting_type === "external_link" || s.meeting_type === "zoom_embedded";
  return (
    <div
      onClick={onOpen}
      style={{
        display: "flex", alignItems: "center", gap: 12, padding: "12px 20px", cursor: "pointer",
        background: selected ? "#F8F9FC" : "#fff", borderBottom: isLast ? "none" : "1px solid #F0F2FA",
      }}
    >
      {s.status === "live" && (
        <span style={{ ...ff, fontSize: 9, fontWeight: 800, color: "#fff", background: "#22c55e", borderRadius: 20, padding: "2px 8px", flexShrink: 0 }}>● LIVE</span>
      )}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ ...ff, fontSize: 13, fontWeight: 600, color: "#1C2551", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>{s.title}</div>
        <div style={{ ...ff, fontSize: 11, color: "#8b90a7", marginTop: 2 }}>
          {new Date(s.scheduled_at).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
          {" · "}{new Date(s.scheduled_at).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" })}
          {" · "}{s.duration_mins} min
        </div>
      </div>
      <span style={{ ...ff, fontSize: 10, fontWeight: 700, borderRadius: 20, padding: "3px 10px", flexShrink: 0, background: isVirtual ? "rgba(28,37,81,0.08)" : "rgba(239,78,36,0.08)", color: isVirtual ? "#1C2551" : "#EF4E24" }}>
        {isVirtual ? "🌐 Virtual" : "🏛 In-Person"}
      </span>
      {isVirtual && resolveJoinLink(s.meeting_type, s.join_url, s.virtual_link) && (
        <a href={resolveJoinLink(s.meeting_type, s.join_url, s.virtual_link)} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()}
          style={{ ...ff, textDecoration: "none", fontSize: 11, fontWeight: 700, color: "#fff", background: "#EF4E24", borderRadius: 8, padding: "6px 14px", flexShrink: 0 }}>
          Join
        </a>
      )}
    </div>
  );
}

// EarlyUploadZone (free-floating draft-session-on-upload widget) removed —
// every session must now link to a curriculum activity_id (see
// ScheduleFromActivityModal). Content upload still works from within an
// already-scheduled session's own material tab.

// ─────────────────────────────────────────────────────────────
// SESSION TOOLS sidebar tool row
// ─────────────────────────────────────────────────────────────

interface Tool {
  id: string;
  icon: string;
  label: string;
  desc: string;
  alwaysEnabled?: boolean;
}

const TOOLS: Tool[] = [
  { id: "poll",       icon: "▶",  label: "Live Poll",       desc: "Launch a real-time poll" },
  { id: "breakout",   icon: "○",  label: "Breakout Groups", desc: "Randomize teams of 4" },
  { id: "timer",      icon: "⏱", label: "Timer",           desc: "Session countdown" },
  { id: "attendance", icon: "◎",  label: "Attendance",      desc: "QR code check-in", alwaysEnabled: true },
  { id: "whiteboard", icon: "◇",  label: "Whiteboard",      desc: "Shared canvas" },
];

function ToolRow({
  tool,
  onLaunch,
}: {
  tool: Tool;
  isLive: boolean;
  onLaunch: (id: string) => void;
}) {
  return (
    <div style={{
      display: "flex",
      alignItems: "center",
      gap: 12,
      padding: "14px 0",
      borderBottom: "1px solid #EAECF4",
    }}>
      {/* Icon circle */}
      <div style={{
        width: 36,
        height: 36,
        borderRadius: "50%",
        background: "#F5F7FB",
        border: "1px solid #EAECF4",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: 14,
        color: "#1C2551",
        flexShrink: 0,
      }}>
        {tool.icon}
      </div>

      {/* Label + desc */}
      <div style={{ flex: 1 }}>
        <div style={{ ...ff, fontSize: 13, fontWeight: 600, color: "#1C2551" }}>
          {tool.label}
        </div>
        <div style={{ ...ff, fontSize: 11, color: "#8b90a7", marginTop: 1 }}>
          {tool.desc}
        </div>
      </div>

      {/* Launch button */}
      <button
        onClick={() => onLaunch(tool.id)}
        title={`Launch ${tool.label}`}
        style={{
          ...ff,
          fontSize: 12,
          fontWeight: 700,
          padding: "6px 14px",
          borderRadius: 8,
          border: "1.5px solid #EAECF4",
          background: "#fff",
          color: "#1C2551",
          cursor: "pointer",
          whiteSpace: "nowrap" as const,
        }}
      >
        Launch
      </button>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// "Coming soon" toast for tool launches
// ─────────────────────────────────────────────────────────────

function Toast({ msg, onClose }: { msg: string; onClose: () => void }) {
  useEffect(() => {
    const t = setTimeout(onClose, 2800);
    return () => clearTimeout(t);
  }, [onClose]);
  return (
    <div style={{
      position: "fixed",
      bottom: 28,
      right: 28,
      background: "#1C2551",
      color: "#fff",
      borderRadius: 10,
      padding: "12px 20px",
      fontSize: 13,
      fontWeight: 600,
      boxShadow: "0 8px 32px rgba(28,37,81,0.22)",
      zIndex: 9999,
      ...ff,
    }}>
      {msg}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Main page component
// ─────────────────────────────────────────────────────────────

interface SessionsPageProps {
  cohortId?:   string;
  programId?:  string;
  programName?: string;
}

export function SessionsPage({ cohortId, programId, programName }: SessionsPageProps = {}) {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();

  // ── data state ──────────────────────────────────────────────
  const [programs,        setPrograms]        = useState<{ id: string; name: string }[]>([]);
  const [assignments,     setAssignments]     = useState<FacultyAssignmentDTO[]>([]);
  const [enrollments,     setEnrollments]     = useState<MyEnrollmentDTO[]>([]);
  const [sessions,        setSessions]        = useState<SessionDTO[]>([]);
  const [selectedId,      setSelectedId]      = useState<string>("");
  const [session,         setSession]         = useState<SessionDTO | null>(null);
  const [materials,       setMaterials]       = useState<MaterialDTO[]>([]);
  const [actionItems,     setActionItems]     = useState<ActionItemDTO[]>([]);
  const [loadingSessions, setLoadingSessions] = useState(true);
  const [loadingDetail,   setLoadingDetail]   = useState(false);
  const [savingLifecycle, setSavingLifecycle] = useState(false);
  const [refreshKey,      setRefreshKey]      = useState(0); // bump to reload the sessions list

  // ── program filter ───────────────────────────────────────────
  const [selectedProgram, setSelectedProgram] = useState<string>("all");

  // ── session history panel ────────────────────────────────────
  const [showHistory, setShowHistory] = useState(false);

  // ── toast ───────────────────────────────────────────────────
  const [toast, setToast] = useState("");
  const closeToast = useCallback(() => setToast(""), []);

  // ── tool modals ──────────────────────────────────────────────
  const [openTool, setOpenTool] = useState<"poll" | "breakout" | "timer" | "attendance" | null>(null);
  const [showCreateSession, setShowCreateSession] = useState(false);

  // ── auth guard ───────────────────────────────────────────────
  useEffect(() => {
    if (!authLoading && !user) router.push("/login");
  }, [authLoading, user, router]);

  // ── load sessions — scoped to cohort when provided ───────────
  useEffect(() => {
    if (!user) return;
    setLoadingSessions(true);
    setSelectedId("");
    setSession(null);

    const params = cohortId ? { cohort_id: cohortId, limit: 100 } : { limit: 100 };
    Promise.all([
      programsApi.getFacultyAssignments(user.id).catch(() => ({ data: [] as FacultyAssignmentDTO[] })),
      sessionsApi.list(params).catch(() => ({ data: [] as SessionDTO[] })),
      cohortsApi.myEnrollments().catch(() => ({ data: [] as MyEnrollmentDTO[] })),
    ]).then(([asgRes, sesRes, enrRes]) => {
      const assignments = asgRes.data ?? [];
      let sess = sesRes.data ?? [];
      setEnrollments(enrRes.data ?? []);

      // When a programId filter is provided but no cohortId, filter client-side
      if (programId && !cohortId) {
        sess = sess.filter(s => s.program_id === programId);
      }

      // Deduplicate by session id
      const seen = new Set<string>();
      sess = sess.filter(s => { if (seen.has(s.id)) return false; seen.add(s.id); return true; });

      // Build program name map
      const seenP = new Set<string>();
      const progs: { id: string; name: string }[] = [];
      for (const a of assignments) {
        if (!seenP.has(a.program_id)) {
          seenP.add(a.program_id);
          progs.push({ id: a.program_id, name: a.program_title });
        }
      }
      setPrograms(progs);
      setAssignments(assignments);
      setSessions(sess);

      // Auto-select only a LIVE session (faculty should land straight in an
      // in-progress session's workspace); otherwise show the row list and let
      // them pick which scheduled session to open.
      const live = sess.find(s => s.status === "live");
      if (live) setSelectedId(live.id);
    }).finally(() => setLoadingSessions(false));
  }, [user, cohortId, programId, refreshKey]);

  // ── load detail when selection changes ───────────────────────
  useEffect(() => {
    if (!selectedId) return;
    setLoadingDetail(true);
    Promise.allSettled([
      sessionsApi.get(selectedId),
      sessionsApi.getMaterials(selectedId),
      sessionsApi.listActionItems(selectedId),
    ]).then(([sRes, mRes, aRes]) => {
      setSession(sRes.status === "fulfilled" ? (sRes.value.data ?? null) : null);
      setMaterials(mRes.status === "fulfilled" ? (mRes.value.data ?? []) : []);
      setActionItems(aRes.status === "fulfilled" ? (aRes.value.data ?? []) : []);
    }).finally(() => setLoadingDetail(false));
  }, [selectedId]);

  // ── lifecycle ────────────────────────────────────────────────
  // Virtual: backend creates/reuses the Zoom meeting before flipping status
  // to live, and returns join_url — open it in a new tab. In-person: just
  // the status flip, no join_url, no new tab. On failure (e.g. org's Zoom
  // credentials invalid), the session stays "scheduled" — surfaced as a
  // clear error, not a silent no-op.
  async function startSession() {
    if (!session) return;
    setSavingLifecycle(true);
    try {
      const r = await sessionsApi.start(session.id);
      if (r.data) {
        setSession(r.data);
        if (r.data.join_url) window.open(r.data.join_url, "_blank");
      }
    } catch (e) {
      setToast((e as Error).message || "Could not start session. Try again.");
    } finally {
      setSavingLifecycle(false);
    }
  }
  async function endSession() {
    if (!session) return;
    setSavingLifecycle(true);
    const r = await sessionsApi.end(session.id).catch(() => null);
    if (r?.data) setSession(r.data);
    setSavingLifecycle(false);
  }

  // ── material delete ──────────────────────────────────────────
  async function deleteMaterial(materialId: string) {
    if (!session) return;
    await sessionsApi.deleteMaterial(session.id, materialId).catch(() => {});
    setMaterials(prev => prev.filter(m => m.id !== materialId));
  }

  // ── derived data ─────────────────────────────────────────────
  const isLive = session?.status === "live";

  // Phase split: agenda items → pre (all types except "discussion")
  //             action items  → post
  const preItems  = (session?.agenda ?? []).filter(a => !POST_TYPES.has(a.type));
  const postItems = actionItems;

  // Program dropdown: unique programs from faculty assignments
  const programMap = new Map<string, string>();
  programs.forEach(p => programMap.set(p.id, p.name));
  // Fallback: if a session's program isn't in assignments, show truncated ID
  sessions.forEach(s => {
    if (!programMap.has(s.program_id))
      programMap.set(s.program_id, `Program ${s.program_id.slice(0, 8)}`);
  });

  const allFiltered = selectedProgram === "all"
    ? sessions
    : sessions.filter(s => s.program_id === selectedProgram);

  // Active = live or scheduled (shown as tabs). History = completed/cancelled.
  const filteredSessions = allFiltered.filter(s => s.status === "live" || s.status === "scheduled");
  const historySessions  = allFiltered.filter(s => s.status === "completed" || s.status === "cancelled")
                                      .sort((a, b) => new Date(b.scheduled_at).getTime() - new Date(a.scheduled_at).getTime());

  const currentProgram = session
    ? (programMap.get(session.program_id) ?? "Program")
    : "My Sessions";
  const canCreateSessions = user?.role === "faculty" || user?.role === "program_manager" || user?.role === "superadmin" || user?.role === "superadmin_secondary";

  // live_session activities this user is assigned to that don't currently
  // have a PENDING scheduled class_sessions row — the picker for the new
  // activity-linked "+ Create Session" flow. Only 'scheduled'/'live' count
  // as pending; a 'completed'/'cancelled' prior instance must NOT block
  // re-scheduling — this is how recurring/weekly Live Sessions (e.g. a
  // weekly cohort call) get their next instance created here, matching
  // Program Design's own Schedule button, which has never had this
  // restriction. (Coaching activities are scheduled elsewhere; out of scope
  // here — this tab's create flow is Live Session only.)
  const pendingScheduledActivityIds = new Set(
    sessions.filter(s => s.status === "scheduled" || s.status === "live").map(s => s.activity_id).filter(Boolean),
  );
  const unscheduledLiveSessions = assignments.filter(a => a.activity_type === "live_session" && !pendingScheduledActivityIds.has(a.activity_id));

  // ── loading / auth states ────────────────────────────────────
  if (authLoading || !user) return null;

  // ─────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────

  return (
    <div style={{ padding: 24, ...ff }}>
      <div style={{ display: "flex", gap: 20, alignItems: "flex-start" }}>

        {/* ══════════════════════════════════════════════════════
            LEFT COLUMN — session content
        ══════════════════════════════════════════════════════ */}
        <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 0 }}>

          {/* Program Journey — flat list of assets (pre/in/post program)
              assigned to this program, for at-a-glance faculty reference. */}
          {user && <ProgramJourneyPanel user={user} />}

          {/* Sessions — simple row list (title, date/time, in-person/virtual
              tag, Join for virtual). Clicking a row opens that session's full
              workspace (agenda/materials/tools) below instead of showing it
              by default for every session. */}
          {!loadingSessions && filteredSessions.length > 0 && (
            <div style={{ background: "#fff", borderRadius: 12, border: "1px solid #EAECF4", marginBottom: 16, overflow: "hidden" }}>
              <div style={{ padding: "14px 20px", borderBottom: "1px solid #EAECF4", fontSize: 13, fontWeight: 700, color: "#1C2551" }}>
                Sessions
              </div>
              {filteredSessions
                .slice()
                .sort((a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime())
                .map((s, i) => (
                  <SessionRow key={s.id} s={s} selected={s.id === selectedId} isLast={i === filteredSessions.length - 1}
                    onOpen={() => setSelectedId(s.id)} />
                ))}
            </div>
          )}

          {/* "+ Create Session" — always available, independent of whether a
              session is currently open below. Opens the activity-linked
              picker: every new session must be an instance of a curriculum
              Live Session activity (format is inherited from Program
              Design, never re-asked here). */}
          {canCreateSessions && (programId ?? programs[0]?.id) && (
            <div style={{ marginBottom: 16 }}>
              <button onClick={() => setShowCreateSession(true)}
                style={{ ...ff, marginBottom: session ? 0 : 12, fontSize: 12, fontWeight: 700, color: "#fff", background: "#1C2551", border: "none", borderRadius: 8, padding: "9px 20px", cursor: "pointer" }}>
                + Create Session
              </button>
            </div>
          )}

          {/* Session History button — only shown when past sessions exist */}
          {historySessions.length > 0 && !loadingSessions && (
            <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 12 }}>
              <button
                onClick={() => setShowHistory(h => !h)}
                style={{
                  ...ff, padding: "7px 16px", borderRadius: 8, fontSize: 12, fontWeight: 600,
                  border: `1px solid ${showHistory ? "#EF4E24" : "#EAECF4"}`,
                  background: showHistory ? "#FFF0ED" : "#fff",
                  color: showHistory ? "#EF4E24" : "#8b90a7",
                  cursor: "pointer",
                }}
              >
                Session History ({historySessions.length})
              </button>
            </div>
          )}

          {/* Session History panel */}
          {showHistory && (
            <div style={{
              background: "#fff", borderRadius: 12, border: "1px solid #EAECF4",
              marginBottom: 16, overflow: "hidden",
            }}>
              <div style={{
                padding: "14px 20px", borderBottom: "1px solid #EAECF4",
                display: "flex", alignItems: "center", justifyContent: "space-between",
              }}>
                <div style={{ ...ff, fontSize: 13, fontWeight: 700, color: "#1C2551" }}>Session History</div>
                <button
                  onClick={() => setShowHistory(false)}
                  style={{ ...ff, fontSize: 11, color: "#8b90a7", background: "none", border: "none", cursor: "pointer" }}
                >✕ Close</button>
              </div>
              <div style={{ maxHeight: 320, overflowY: "auto" as const }}>
                {historySessions.map((s, i) => (
                  <div
                    key={s.id}
                    style={{
                      padding: "12px 20px",
                      borderTop: i > 0 ? "1px solid #EAECF4" : undefined,
                      display: "flex", alignItems: "center", gap: 12,
                    }}
                  >
                    <div style={{ flex: 1 }}>
                      <div style={{ ...ff, fontSize: 13, fontWeight: 600, color: "#1C2551" }}>{s.title}</div>
                      <div style={{ ...ff, fontSize: 11, color: "#8b90a7", marginTop: 2 }}>
                        {new Date(s.scheduled_at).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", year: "numeric" })}
                        {" · "}{s.duration_mins} min
                        {" · "}{programMap.get(s.program_id) ?? ""}
                      </div>
                    </div>
                    <span style={{
                      ...ff, fontSize: 10, fontWeight: 700, borderRadius: 20, padding: "2px 10px",
                      background: s.status === "completed" ? "#22c55e18" : "#ef444418",
                      color: s.status === "completed" ? "#22c55e" : "#ef4444",
                    }}>
                      {s.status.toUpperCase()}
                    </span>
                    <button
                      onClick={() => { setSelectedId(s.id); setShowHistory(false); }}
                      style={{
                        ...ff, fontSize: 11, fontWeight: 600, padding: "5px 12px", borderRadius: 8,
                        border: "1px solid #EAECF4", background: "#F5F7FB", color: "#1C2551", cursor: "pointer",
                      }}
                    >
                      View
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Loading state */}
          {(loadingSessions || loadingDetail) && (
            <div style={{ padding: 48, textAlign: "center" as const, color: "#8b90a7", fontSize: 13 }}>
              Loading session…
            </div>
          )}

          {/* No sessions — list is truly empty (Create Session / upload area
              above already cover getting started). */}
          {!loadingSessions && !loadingDetail && sessions.length === 0 && (
            <div style={{
              background: "#fff",
              borderRadius: 12,
              border: "1.5px dashed #EAECF4",
              padding: 48,
              textAlign: "center" as const,
            }}>
              <div style={{ fontSize: 32, marginBottom: 12 }}>📅</div>
              <div style={{ ...ff, fontSize: 15, fontWeight: 700, color: "#1C2551", marginBottom: 6 }}>No sessions yet</div>
              <div style={{ ...ff, fontSize: 12, color: "#8b90a7", maxWidth: 360, margin: "0 auto" }}>
                {canCreateSessions
                  ? "Create a session above to get started, or drop a file below to stash session content now."
                  : "You haven't been assigned to any sessions yet. Your Program Manager will schedule sessions for you."}
              </div>
            </div>
          )}

          {/* Sessions exist but none opened yet — pick one from the list above */}
          {!loadingSessions && !loadingDetail && sessions.length > 0 && !session && (
            <div style={{
              background: "#fff",
              borderRadius: 12,
              border: "1px solid #EAECF4",
              padding: 32,
              textAlign: "center" as const,
            }}>
              <div style={{ ...ff, fontSize: 13, color: "#8b90a7" }}>
                Select a session above to open its workspace.
              </div>
            </div>
          )}

          {/* Session content */}
          {!loadingSessions && !loadingDetail && session && (
            <>
              {/* Session title header */}
              <div style={{ marginBottom: 16 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <h2 style={{ ...ff, fontSize: 17, fontWeight: 700, color: "#1C2551", margin: 0 }}>
                    Session: {session.title}
                  </h2>
                  {session.status === "live" && (
                    <span style={{ ...ff, fontSize: 10, fontWeight: 700, background: "#22c55e20", color: "#22c55e", borderRadius: 20, padding: "3px 10px" }}>
                      ● LIVE
                    </span>
                  )}
                  {session.status === "completed" && (
                    <span style={{ ...ff, fontSize: 10, fontWeight: 700, background: "#8b90a720", color: "#8b90a7", borderRadius: 20, padding: "3px 10px" }}>
                      COMPLETED
                    </span>
                  )}
                </div>
                <div style={{ ...ff, fontSize: 11, color: "#8b90a7", marginTop: 4 }}>
                  {new Date(session.scheduled_at).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "long", year: "numeric" })}
                  {" · "}
                  {session.duration_mins} min
                  {session.session_type !== "classroom" && ` · ${session.session_type.replace("_", " ")}`}
                </div>
              </div>

              {/* Agenda items (if any were set up in Program Design Studio) */}
              {preItems.length > 0 && (
                <div style={{ background: "#fff", borderRadius: 12, border: "1px solid #EAECF4", marginBottom: 12, overflow: "hidden" }}>
                  {preItems.map((item, i) => (
                    <div key={item.id || i}>
                      <AgendaRow item={item} progress={0} />
                      {(item.type === "journal" || item.type === "reflection") && item.id && (
                        <ReflectionPanel
                          sessionId={session.id}
                          agendaItemId={item.id}
                          agendaItemTitle={item.title}
                          isFaculty={user?.role === "faculty" || user?.role === "program_manager" || user?.role === "superadmin" || user?.role === "superadmin_secondary"}
                          participantId={user?.id}
                        />
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* Session materials — uploaded files + upload area */}
              <div style={{ background: "#fff", borderRadius: 12, border: "1px solid #EAECF4", marginBottom: 12, overflow: "hidden" }}>
                {materials.map(m => (
                  <MaterialRow key={m.id} m={m} onDelete={() => deleteMaterial(m.id)} />
                ))}
                <UploadZone
                  sessionId={session.id}
                  onUploaded={m => setMaterials(prev => [...prev, m])}
                />
              </div>

              {/* Post-session action items (if any) */}
              {postItems.length > 0 && (
                <div style={{ background: "#fff", borderRadius: 12, border: "1px solid #EAECF4", marginBottom: 12, overflow: "hidden" }}>
                  {postItems.map(item => (
                    <ActionRow key={item.id} item={item} />
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        {/* ══════════════════════════════════════════════════════
            RIGHT COLUMN — SESSION TOOLS sidebar
        ══════════════════════════════════════════════════════ */}
        <div style={{
          width: 300,
          flexShrink: 0,
          background: "#fff",
          borderRadius: 12,
          border: "1px solid #EAECF4",
          boxShadow: "0 1px 4px rgba(28,37,81,0.07)",
          padding: "16px 20px",
          position: "sticky" as const,
          top: 24,
        }}>
          {/* Header */}
          <div style={{ ...ff, fontSize: 11, fontWeight: 800, color: "#8b90a7", letterSpacing: 1, textTransform: "uppercase" as const, marginBottom: 4 }}>
            SESSION TOOLS
          </div>

          {/* Tool rows */}
          {TOOLS.map(tool => (
            <ToolRow
              key={tool.id}
              tool={tool}
              isLive={isLive}
              onLaunch={id => {
                if (id === "whiteboard") { setToast("Whiteboard — coming soon"); return; }
                setOpenTool(id as "poll" | "breakout" | "timer" | "attendance");
              }}
            />
          ))}

          {/* Start / End Live Session button */}
          <div style={{ marginTop: 16 }}>
            {session?.status === "scheduled" && (
              <button
                onClick={startSession}
                disabled={savingLifecycle}
                style={{
                  ...ff,
                  width: "100%",
                  padding: "14px 0",
                  background: savingLifecycle ? "#8b90a7" : "#EF4E24",
                  color: "#fff",
                  border: "none",
                  borderRadius: 10,
                  fontSize: 14,
                  fontWeight: 800,
                  cursor: savingLifecycle ? "not-allowed" : "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 8,
                }}
              >
                ▶ {savingLifecycle ? "Starting…" : "Start Live Session"}
              </button>
            )}
            {session?.status === "live" && (
              <button
                onClick={endSession}
                disabled={savingLifecycle}
                style={{
                  ...ff,
                  width: "100%",
                  padding: "14px 0",
                  background: savingLifecycle ? "#8b90a7" : "#ef4444",
                  color: "#fff",
                  border: "none",
                  borderRadius: 10,
                  fontSize: 14,
                  fontWeight: 800,
                  cursor: savingLifecycle ? "not-allowed" : "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 8,
                }}
              >
                ⏹ {savingLifecycle ? "Ending…" : "End Session"}
              </button>
            )}
            {session?.status === "completed" && (
              <div style={{
                ...ff,
                textAlign: "center" as const,
                padding: "14px 0",
                background: "#F5F7FB",
                borderRadius: 10,
                fontSize: 13,
                fontWeight: 700,
                color: "#8b90a7",
              }}>
                ✓ Session Completed
              </div>
            )}
            {!session && (
              <div style={{
                ...ff,
                textAlign: "center" as const,
                padding: "14px 0",
                background: "#F5F7FB",
                borderRadius: 10,
                fontSize: 13,
                color: "#D0D3E0",
              }}>
                No session selected
              </div>
            )}
          </div>

          {/* Session meta */}
          {session && (
            <div style={{ marginTop: 16, paddingTop: 14, borderTop: "1px solid #EAECF4" }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                <span style={{ ...ff, fontSize: 11, color: "#8b90a7" }}>Agenda items</span>
                <span style={{ ...ff, fontSize: 11, fontWeight: 700, color: "#1C2551" }}>{session.agenda.length}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                <span style={{ ...ff, fontSize: 11, color: "#8b90a7" }}>Uploaded materials</span>
                <span style={{ ...ff, fontSize: 11, fontWeight: 700, color: "#1C2551" }}>{materials.length}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ ...ff, fontSize: 11, color: "#8b90a7" }}>Action items</span>
                <span style={{ ...ff, fontSize: 11, fontWeight: 700, color: "#1C2551" }}>{actionItems.length}</span>
              </div>
            </div>
          )}

          {/* Session Notes — faculty only, collapsible */}
          {session && (
            <SessionNotes
              sessionId={session.id}
              initialNotes={session.notes ?? ""}
              isFaculty={user?.role === "faculty" || user?.role === "program_manager" || user?.role === "superadmin" || user?.role === "superadmin_secondary"}
            />
          )}

          {/* Action Tags — faculty only, collapsible */}
          {session && (
            <ActionTags
              sessionId={session.id}
              isFaculty={user?.role === "faculty" || user?.role === "program_manager" || user?.role === "superadmin" || user?.role === "superadmin_secondary"}
            />
          )}
        </div>
      </div>

      {/* Toast */}
      {toast && <Toast msg={toast} onClose={closeToast} />}

      {/* Tool modals */}
      {openTool === "attendance" && session && (
        <AttendanceModal
          sessionId={session.id}
          sessionTitle={session.title}
          onClose={() => setOpenTool(null)}
          onFinalized={() => { setOpenTool(null); setToast("Attendance record finalized"); }}
        />
      )}
      {openTool === "poll" && session && (
        <LivePollModal
          sessionId={session.id}
          sessionTitle={session.title}
          onClose={() => setOpenTool(null)}
        />
      )}
      {openTool === "breakout" && session && (
        <BreakoutModal
          sessionId={session.id}
          sessionTitle={session.title}
          onClose={() => setOpenTool(null)}
        />
      )}
      {openTool === "timer" && (
        <TimerPanel onClose={() => setOpenTool(null)} />
      )}

      {showCreateSession && user && (
        <ScheduleFromActivityModal
          activities={unscheduledLiveSessions}
          fallbackCohorts={enrollments}
          onClose={() => setShowCreateSession(false)}
          onConfirm={async (activity, cohort, title, meetingType, virtualLink, when, dur) => {
            try {
              if (activity) {
                await programsApi.scheduleSession(activity.program_id, activity.activity_id, {
                  program_id: activity.program_id,
                  cohort_id: activity.cohort_id,
                  faculty_id: user.id,
                  title: activity.activity_title,
                  scheduled_at: new Date(when).toISOString(),
                  duration_mins: dur,
                });
              } else if (cohort) {
                // No curriculum Live Session activity to link — a session
                // can still be scheduled directly for the cohort, independent
                // of whether Program Design has anything set up for it.
                const r = await sessionsApi.create({
                  program_id: cohort.program_id,
                  cohort_id: cohort.cohort_id,
                  faculty_id: user.id,
                  title,
                  session_type: "classroom",
                  meeting_type: meetingType,
                  virtual_link: meetingType === "external_link" ? (virtualLink || undefined) : undefined,
                  scheduled_at: new Date(when).toISOString(),
                  duration_mins: dur,
                });
                // Zoom: auto-create the meeting against the org's connected
                // Zoom account right away, so the join link exists as soon
                // as the session does — never a manually-typed/hardcoded link.
                if (meetingType === "zoom_embedded" && r.data) {
                  await zoomApi.createMeeting(r.data.id, {
                    topic: title,
                    start_time: new Date(when).toISOString(),
                    duration_minutes: dur,
                    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
                  }).catch(() => {
                    setToast("Session created, but the Zoom meeting couldn't be generated — ask your Super Admin to check the org's Zoom setup.");
                  });
                }
              }
              setShowCreateSession(false);
              setToast(`Session created · ${activity ? activity.activity_title : title}`);
              setRefreshKey(k => k + 1);
            } catch (e) {
              setToast((e as Error).message || "Could not create session. Try again.");
            }
          }}
        />
      )}
    </div>
  );
}

// ── Schedule-from-activity modal: pick which unscheduled curriculum Live
// Session item this instance is for, then only date/time + duration. Format
// (virtual/in-person) is never asked here — it's inherited from the
// activity's own config, set once in Program Design (see
// api/internal/programs/service.go scheduleSessionService), and the backend
// derives meeting_type from it automatically.
//
// When there's no unscheduled curriculum activity to link (either none are
// set up in Program Design yet, or every one already has a session), the
// picker falls back to letting the faculty pick a cohort directly and type
// a title — creation is never blocked on Program Design having a Live
// Session activity configured.
//
// fallbackCohorts comes from GET /cohorts/my (enrollments), NOT
// activity_faculty — activity_faculty rows are frequently assigned at the
// activity level with no cohort_id set, which silently emptied this list
// and made every faculty member with only activity-level assignments look
// like they had no cohort to schedule against.
function ScheduleFromActivityModal({ activities, fallbackCohorts, onClose, onConfirm }: {
  activities: FacultyAssignmentDTO[];
  fallbackCohorts: MyEnrollmentDTO[];
  onClose: () => void;
  onConfirm: (
    activity: FacultyAssignmentDTO | null,
    cohort: { cohort_id: string; program_id: string } | null,
    title: string,
    meetingType: "in_person" | "external_link" | "zoom_embedded",
    virtualLink: string,
    scheduledAt: string,
    durationMins: number,
  ) => Promise<void>;
}) {
  const def = (() => {
    const d = new Date(Date.now() + 86400000);
    d.setHours(10, 0, 0, 0);
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  })();

  // Every cohort this faculty member is assigned to, deduplicated — used
  // only when there's no curriculum activity to link.
  const cohorts = (() => {
    const seen = new Set<string>();
    const out: { cohort_id: string; cohort_name: string; program_id: string; program_title: string }[] = [];
    for (const e of fallbackCohorts) {
      if (!e.cohort_id || seen.has(e.cohort_id)) continue;
      seen.add(e.cohort_id);
      out.push({ cohort_id: e.cohort_id, cohort_name: e.cohort_name || "Cohort", program_id: e.program_id, program_title: e.program_title });
    }
    return out;
  })();

  const hasActivities = activities.length > 0;
  const [activityId, setActivityId] = useState(activities[0]?.activity_id ?? "");
  const [cohortId, setCohortId] = useState(cohorts[0]?.cohort_id ?? "");
  const [title, setTitle] = useState("");
  const [meetingType, setMeetingType] = useState<"in_person" | "external_link" | "zoom_embedded">("in_person");
  const [virtualLink, setVirtualLink] = useState("");
  const [when, setWhen] = useState(def);
  const [dur, setDur] = useState(60);
  const [saving, setSaving] = useState(false);
  const selected = activities.find(a => a.activity_id === activityId);
  const selectedCohort = cohorts.find(c => c.cohort_id === cohortId);

  const canSubmit = hasActivities ? !!selected : (!!selectedCohort && title.trim().length > 0);

  if (typeof document === "undefined") return null;
  return ReactDOM.createPortal(
    <div onClick={e => { if (e.target === e.currentTarget) onClose(); }}
      style={{ position: "fixed", inset: 0, background: "rgba(28,37,81,0.5)", zIndex: 3000, display: "flex", alignItems: "center", justifyContent: "center", padding: 24, ...ff }}>
      <div style={{ background: "#fff", borderRadius: 16, width: "100%", maxWidth: 460, boxShadow: "0 24px 64px rgba(28,37,81,0.22)", overflow: "hidden" }}>
        <div style={{ padding: "18px 22px", borderBottom: "1px solid #EAECF4" }}>
          <div style={{ ...ff, fontSize: 14, fontWeight: 700, color: "#1C2551" }}>Create Session</div>
        </div>
        <div style={{ padding: "20px 22px", display: "flex", flexDirection: "column", gap: 16 }}>
          {hasActivities ? (
            <div>
              <label style={{ ...ff, fontSize: 10, fontWeight: 700, color: "#8b90a7", letterSpacing: 0.5, textTransform: "uppercase" as const, display: "block", marginBottom: 6 }}>Live Session Activity</label>
              <select value={activityId} onChange={e => setActivityId(e.target.value)}
                style={{ ...ff, width: "100%", border: "1px solid #EAECF4", borderRadius: 8, padding: "9px 12px", fontSize: 13, color: "#1C2551", background: "#fff", cursor: "pointer" }}>
                {activities.map(a => (
                  <option key={a.activity_id} value={a.activity_id}>
                    {a.activity_title} — {a.program_title}{a.cohort_name ? ` · ${a.cohort_name}` : ""}
                  </option>
                ))}
              </select>
            </div>
          ) : cohorts.length > 0 ? (
            <>
              <div>
                <label style={{ ...ff, fontSize: 10, fontWeight: 700, color: "#8b90a7", letterSpacing: 0.5, textTransform: "uppercase" as const, display: "block", marginBottom: 6 }}>Cohort</label>
                <select value={cohortId} onChange={e => setCohortId(e.target.value)}
                  style={{ ...ff, width: "100%", border: "1px solid #EAECF4", borderRadius: 8, padding: "9px 12px", fontSize: 13, color: "#1C2551", background: "#fff", cursor: "pointer" }}>
                  {cohorts.map(c => (
                    <option key={c.cohort_id} value={c.cohort_id}>{c.program_title} · {c.cohort_name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label style={{ ...ff, fontSize: 10, fontWeight: 700, color: "#8b90a7", letterSpacing: 0.5, textTransform: "uppercase" as const, display: "block", marginBottom: 6 }}>Session Title</label>
                <input value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Strategic Leadership – Module 3"
                  style={{ ...ff, width: "100%", border: "1px solid #EAECF4", borderRadius: 8, padding: "9px 12px", fontSize: 13, color: "#1C2551", boxSizing: "border-box" as const }} />
              </div>
              <div>
                <label style={{ ...ff, fontSize: 10, fontWeight: 700, color: "#8b90a7", letterSpacing: 0.5, textTransform: "uppercase" as const, display: "block", marginBottom: 6 }}>Meeting Type</label>
                <select value={meetingType} onChange={e => setMeetingType(e.target.value as "in_person" | "external_link" | "zoom_embedded")}
                  style={{ ...ff, width: "100%", border: "1px solid #EAECF4", borderRadius: 8, padding: "9px 12px", fontSize: 13, color: "#1C2551", background: "#fff", cursor: "pointer" }}>
                  <option value="in_person">🏢 In Person</option>
                  <option value="external_link">🔗 External Link</option>
                  <option value="zoom_embedded">🎥 Zoom (auto-generated link)</option>
                </select>
              </div>
              {meetingType === "external_link" && (
                <div>
                  <label style={{ ...ff, fontSize: 10, fontWeight: 700, color: "#8b90a7", letterSpacing: 0.5, textTransform: "uppercase" as const, display: "block", marginBottom: 6 }}>Video Conferencing Link (optional)</label>
                  <input value={virtualLink} onChange={e => setVirtualLink(e.target.value)} placeholder="https://..."
                    style={{ ...ff, width: "100%", border: "1px solid #EAECF4", borderRadius: 8, padding: "9px 12px", fontSize: 13, color: "#1C2551", boxSizing: "border-box" as const }} />
                </div>
              )}
              {meetingType === "zoom_embedded" && (
                <div style={{ ...ff, fontSize: 11, color: "#8b90a7", background: "#F5F7FB", borderRadius: 8, padding: "10px 12px" }}>
                  📍 The Zoom join link is created automatically from your organization's connected Zoom account once the session is saved.
                </div>
              )}
            </>
          ) : (
            <div style={{ ...ff, fontSize: 12, color: "#8b90a7", background: "#F5F7FB", border: "1px dashed #EAECF4", borderRadius: 10, padding: "20px", textAlign: "center" as const }}>
              You're not assigned to any cohort yet — your Program Manager needs to assign you before you can schedule a session.
            </div>
          )}

          {(hasActivities || cohorts.length > 0) && (
            <>
              <div>
                <label style={{ ...ff, fontSize: 10, fontWeight: 700, color: "#8b90a7", letterSpacing: 0.5, textTransform: "uppercase" as const, display: "block", marginBottom: 6 }}>Date & Time</label>
                <input type="datetime-local" value={when} onChange={e => setWhen(e.target.value)}
                  style={{ ...ff, width: "100%", border: "1px solid #EAECF4", borderRadius: 8, padding: "9px 12px", fontSize: 13, color: "#1C2551", boxSizing: "border-box" as const }} />
              </div>
              <div>
                <label style={{ ...ff, fontSize: 10, fontWeight: 700, color: "#8b90a7", letterSpacing: 0.5, textTransform: "uppercase" as const, display: "block", marginBottom: 6 }}>Duration (minutes)</label>
                <select value={dur} onChange={e => setDur(Number(e.target.value))}
                  style={{ ...ff, width: "100%", border: "1px solid #EAECF4", borderRadius: 8, padding: "9px 12px", fontSize: 13, color: "#1C2551", background: "#fff", cursor: "pointer" }}>
                  {[30, 45, 60, 90, 120].map(m => <option key={m} value={m}>{m} min</option>)}
                </select>
              </div>
            </>
          )}

          {hasActivities && (
            <div style={{ ...ff, fontSize: 11, color: "#8b90a7", background: "#F5F7FB", borderRadius: 8, padding: "10px 12px" }}>
              📍 Format (virtual/in-person) is inherited from Program Design — not asked here.
            </div>
          )}
        </div>
        <div style={{ padding: "0 22px 20px", display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <button onClick={onClose} disabled={saving}
            style={{ ...ff, fontSize: 12, fontWeight: 600, color: "#1C2551", background: "#fff", border: "1px solid #EAECF4", borderRadius: 8, padding: "9px 18px", cursor: "pointer" }}>
            {(hasActivities || cohorts.length > 0) ? "Cancel" : "Close"}
          </button>
          {(hasActivities || cohorts.length > 0) && (
            <button disabled={saving || !when || !canSubmit} onClick={async () => {
              if (!canSubmit) return;
              setSaving(true);
              await onConfirm(
                hasActivities ? (selected ?? null) : null,
                hasActivities ? null : (selectedCohort ? { cohort_id: selectedCohort.cohort_id, program_id: selectedCohort.program_id } : null),
                title, meetingType, virtualLink, when, dur,
              );
              setSaving(false);
            }}
              style={{ ...ff, fontSize: 12, fontWeight: 700, color: "#fff", background: saving ? "#D0D3E0" : "#EF4E24", border: "none", borderRadius: 8, padding: "9px 20px", cursor: saving ? "not-allowed" : "pointer" }}>
              {saving ? "Creating…" : "Create Session"}
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}

// CreateSessionModal (free-floating title+date/time+duration, no activity
// link, fabricated meet link) removed — superseded by
// ScheduleFromActivityModal above. Verified working end-to-end (real
// activity-linked session created with correctly-inherited meeting_type)
// before this removal.
