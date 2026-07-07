"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import ReactDOM from "react-dom";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import {
  sessionsApi, uploadFile,
  SessionDTO, MaterialDTO, ActionItemDTO, AgendaItemDTO,
} from "@/lib/faculty-api";
import { programsApi, FacultyAssignmentDTO } from "@/lib/programs-api";
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

// Dummy meet-link generator (placeholder until a real provider is wired).
function genMeetLink(): string {
  const seg = () => Math.random().toString(36).slice(2, 6);
  return `https://meet.xa-lms.dev/${seg()}-${seg()}-${seg()}`;
}

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

function PhaseSection({
  phase, label, badge, accentColor, bgColor, children,
}: {
  phase: "pre" | "in" | "post";
  label: string;
  badge?: React.ReactNode;
  accentColor: string;
  bgColor: string;
  children: React.ReactNode;
}) {
  return (
    <div style={{
      background: bgColor,
      borderRadius: 12,
      border: "1px solid #EAECF4",
      borderLeft: `4px solid ${accentColor}`,
      overflow: "hidden",
      marginBottom: 12,
    }}>
      {/* Section header */}
      <div style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "12px 20px",
        borderBottom: children ? "1px solid #EAECF4" : "none",
      }}>
        <span style={{ ...ff, fontSize: 11, fontWeight: 800, color: accentColor, letterSpacing: 0.8, textTransform: "uppercase" as const }}>
          {phase === "pre" ? "◼" : phase === "in" ? "○" : "◆"} {label}
        </span>
        {badge && badge}
      </div>
      {children}
    </div>
  );
}

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
// Upload zone shown before any session exists — creates a minimal draft
// session on first drop so the file has somewhere to attach, then hands
// off to the normal session flow (rename/schedule properly from the list).
// ─────────────────────────────────────────────────────────────

function EarlyUploadZone({
  programId,
  cohortId,
  onCreated,
}: {
  programId: string;
  cohortId: string;
  onCreated: () => void;
}) {
  const inputRef            = useRef<HTMLInputElement>(null);
  const [dragging, setDrag] = useState(false);
  const [uploading, setUpl] = useState(false);
  const [error, setError]   = useState("");

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
      const sessRes = await sessionsApi.create({
        program_id: programId,
        cohort_id: cohortId,
        title: "Untitled Session",
        session_type: "classroom",
        scheduled_at: new Date().toISOString(),
        duration_mins: 60,
      });
      const sessionId = sessRes.data.id;

      const uploadRes = await uploadFile(file);
      const contentId = uploadRes.data.content_id;
      const mimeType  = uploadRes.data.mime_type;
      const matType = mimeType.startsWith("video/") ? "video"
        : mimeType === "application/pdf" ? "pdf"
        : mimeType.includes("presentation") ? "ppt"
        : mimeType.includes("word") ? "docx"
        : "link";

      await sessionsApi.addMaterial(sessionId, {
        title: file.name.replace(/\.[^.]+$/, ""),
        type: matType,
        url: `content://${contentId}`,
        size_bytes: file.size,
      });
      onCreated();
    } catch (e: unknown) {
      setError((e as Error).message ?? "Upload failed");
    } finally {
      setUpl(false);
    }
  }

  return (
    <div style={{ marginTop: 16 }}>
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
              PPTX, PDF, MP4, DOCX · Drag &amp; drop or click — creates a draft session to hold it
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
    ]).then(([asgRes, sesRes]) => {
      const assignments = asgRes.data ?? [];
      let sess = sesRes.data ?? [];

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
      setSessions(sess);

      // Auto-select: prefer live, then next scheduled, then first
      const live      = sess.find(s => s.status === "live");
      const scheduled = sess.filter(s => s.status === "scheduled")
                            .sort((a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime())[0];
      const pick = live ?? scheduled ?? sess[0];
      if (pick) setSelectedId(pick.id);
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
  async function startSession() {
    if (!session) return;
    setSavingLifecycle(true);
    const r = await sessionsApi.start(session.id).catch(() => null);
    if (r?.data) setSession(r.data);
    setSavingLifecycle(false);
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

          {/* No sessions — list is truly empty. Create Session lives right here
              rather than buried per-module, since faculty create sessions at
              the program/cohort level, not tied to a specific asset. */}
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
                  ? "Create a session to get started, or drop a file below to stash session content now."
                  : "You haven't been assigned to any sessions yet. Your Program Manager will schedule sessions for you."}
              </div>
              {canCreateSessions && (programId ?? programs[0]?.id) && (
                <button onClick={() => setShowCreateSession(true)}
                  style={{ ...ff, marginTop: 16, fontSize: 12, fontWeight: 700, color: "#fff", background: "#1C2551", border: "none", borderRadius: 8, padding: "9px 20px", cursor: "pointer" }}>
                  + Create Session
                </button>
              )}
              {canCreateSessions && (programId ?? programs[0]?.id) && (
                <EarlyUploadZone
                  programId={programId ?? programs[0].id}
                  cohortId={cohortId ?? ""}
                  onCreated={() => setRefreshKey(k => k + 1)}
                />
              )}
            </div>
          )}

          {/* Sessions exist but detail failed to load */}
          {!loadingSessions && !loadingDetail && sessions.length > 0 && !session && (
            <div style={{
              background: "#fff",
              borderRadius: 12,
              border: "1px solid #EAECF4",
              padding: 32,
              textAlign: "center" as const,
            }}>
              <div style={{ ...ff, fontSize: 13, color: "#8b90a7" }}>
                Select a session tab above to get started.
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

              {/* ── PRE PROGRAM ─────────────────────────────── */}
              <PhaseSection
                phase="pre"
                label="PRE PROGRAM"
                accentColor="#22c55e"
                bgColor="#f0fdf4"
                badge={
                  preItems.length > 0
                    ? <span style={{ ...ff, fontSize: 10, fontWeight: 700, background: "#22c55e20", color: "#22c55e", borderRadius: 20, padding: "2px 10px" }}>
                        {preItems.length} item{preItems.length !== 1 ? "s" : ""} from Studio
                      </span>
                    : undefined
                }
              >
                {preItems.length === 0 ? (
                  <div style={{ padding: "16px 20px", ...ff, fontSize: 12, color: "#8b90a7" }}>
                    No agenda items for this session yet. Upload content using the upload area below.
                  </div>
                ) : (
                  preItems.map((item, i) => (
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
                  ))
                )}
              </PhaseSection>

              {/* ── IN PROGRAM ──────────────────────────────── */}
              <PhaseSection
                phase="in"
                label="IN PROGRAM"
                accentColor="#EF4E24"
                bgColor="rgba(239,78,36,0.04)"
              >
                {materials.map(m => (
                  <MaterialRow key={m.id} m={m} onDelete={() => deleteMaterial(m.id)} />
                ))}
                <UploadZone
                  sessionId={session.id}
                  onUploaded={m => setMaterials(prev => [...prev, m])}
                />
              </PhaseSection>

              {/* ── POST PROGRAM ────────────────────────────── */}
              <PhaseSection
                phase="post"
                label="POST PROGRAM"
                accentColor="#6B73BF"
                bgColor="#eef2ff"
                badge={
                  postItems.length > 0
                    ? <span style={{ ...ff, fontSize: 10, fontWeight: 700, background: "#6B73BF20", color: "#6B73BF", borderRadius: 20, padding: "2px 10px" }}>
                        {postItems.length} item{postItems.length !== 1 ? "s" : ""} from Studio
                      </span>
                    : undefined
                }
              >
                {postItems.length === 0 ? (
                  <div style={{ padding: "16px 20px", ...ff, fontSize: 12, color: "#8b90a7" }}>
                    No post-session action items yet. Add them via the action items panel in My Sessions.
                  </div>
                ) : (
                  postItems.map(item => (
                    <ActionRow key={item.id} item={item} />
                  ))
                )}
              </PhaseSection>
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

      {showCreateSession && user && (programId ?? programs[0]?.id) && (
        <CreateSessionModal
          onClose={() => setShowCreateSession(false)}
          onConfirm={(title, when, dur) => {
            const link = genMeetLink();
            sessionsApi.create({
              program_id: (programId ?? programs[0].id),
              cohort_id: cohortId ?? "",
              faculty_id: user.id,
              title,
              session_type: "virtual",
              virtual_link: link,
              scheduled_at: new Date(when).toISOString(),
              duration_mins: dur,
            }).then(() => {
              setShowCreateSession(false);
              setToast(`Session created · ${link}`);
              setRefreshKey(k => k + 1);
            }).catch(() => {
              setToast("Could not create session. Try again.");
            });
          }}
        />
      )}
    </div>
  );
}

// ── Create-session modal: title + date/time + duration; meet link auto-generated ──
function CreateSessionModal({ onClose, onConfirm }: {
  onClose: () => void; onConfirm: (title: string, scheduledAt: string, durationMins: number) => void;
}) {
  const def = (() => {
    const d = new Date(Date.now() + 86400000);
    d.setHours(10, 0, 0, 0);
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  })();
  const [title, setTitle] = useState("");
  const [when, setWhen] = useState(def);
  const [dur, setDur] = useState(60);
  const [saving, setSaving] = useState(false);

  if (typeof document === "undefined") return null;
  return ReactDOM.createPortal(
    <div onClick={e => { if (e.target === e.currentTarget) onClose(); }}
      style={{ position: "fixed", inset: 0, background: "rgba(28,37,81,0.5)", zIndex: 3000, display: "flex", alignItems: "center", justifyContent: "center", padding: 24, ...ff }}>
      <div style={{ background: "#fff", borderRadius: 16, width: "100%", maxWidth: 420, boxShadow: "0 24px 64px rgba(28,37,81,0.22)", overflow: "hidden" }}>
        <div style={{ padding: "18px 22px", borderBottom: "1px solid #EAECF4" }}>
          <div style={{ ...ff, fontSize: 14, fontWeight: 700, color: "#1C2551" }}>Create Session</div>
        </div>
        <div style={{ padding: "20px 22px", display: "flex", flexDirection: "column", gap: 16 }}>
          <div>
            <label style={{ ...ff, fontSize: 10, fontWeight: 700, color: "#8b90a7", letterSpacing: 0.5, textTransform: "uppercase" as const, display: "block", marginBottom: 6 }}>Session Title</label>
            <input value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Week 3 — Live Session"
              style={{ ...ff, width: "100%", border: "1px solid #EAECF4", borderRadius: 8, padding: "9px 12px", fontSize: 13, color: "#1C2551", boxSizing: "border-box" as const }} />
          </div>
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
          <div style={{ ...ff, fontSize: 11, color: "#8b90a7", background: "#F5F7FB", borderRadius: 8, padding: "10px 12px" }}>
            🔗 A meeting link will be generated automatically for this session.
          </div>
        </div>
        <div style={{ padding: "0 22px 20px", display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <button onClick={onClose} disabled={saving}
            style={{ ...ff, fontSize: 12, fontWeight: 600, color: "#1C2551", background: "#fff", border: "1px solid #EAECF4", borderRadius: 8, padding: "9px 18px", cursor: "pointer" }}>Cancel</button>
          <button disabled={saving || !when || !title.trim()} onClick={() => { setSaving(true); onConfirm(title.trim(), when, dur); }}
            style={{ ...ff, fontSize: 12, fontWeight: 700, color: "#fff", background: saving ? "#D0D3E0" : "#EF4E24", border: "none", borderRadius: 8, padding: "9px 20px", cursor: saving ? "not-allowed" : "pointer" }}>
            {saving ? "Creating…" : "Create Session"}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
