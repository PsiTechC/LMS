"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import ReactDOM from "react-dom";
import { discussionsApi, ThreadDTO, AnnouncementDTO } from "@/lib/discussions-api";
import { useAuth } from "@/lib/auth-context";

const NAVY = "#1C2551";
const ORANGE = "#EF4E24";
const INDIGO = "#6B73BF";
const GREEN = "#22c55e";
const PAGE = "#F5F7FB";
const BORDER = "#EAECF4";
const MUTED = "#8b90a7";
const SHADOW = "0 1px 4px rgba(28,37,81,0.07)";

const CATEGORIES = ["all", "Case Discussion", "Reflection", "Debate", "Q&A", "Submission", "Resource"] as const;
const CAT_META: Record<string, { bg: string; color: string }> = {
  "Case Discussion": { bg: "rgba(239,78,36,0.08)", color: ORANGE },
  Reflection: { bg: "rgba(107,115,191,0.1)", color: INDIGO },
  Debate: { bg: "rgba(28,37,81,0.08)", color: NAVY },
  "Q&A": { bg: "rgba(34,197,94,0.1)", color: GREEN },
  Submission: { bg: "rgba(239,78,36,0.08)", color: ORANGE },
  Resource: { bg: "rgba(34,197,94,0.1)", color: GREEN },
};

// programId scopes threads program-wide; cohortId is where new threads are posted.
interface Props {
  programId?: string;
  cohortId?: string;
}

export default function DiscussionsExperience({ programId, cohortId }: Props) {
  const { user } = useAuth();
  const [subTab, setSubTab] = useState<"forum" | "announcements">("forum");
  const [threads, setThreads] = useState<ThreadDTO[]>([]);
  const [loadingThreads, setLoadingThreads] = useState(false);
  const [announcements, setAnnouncements] = useState<AnnouncementDTO[]>([]);
  const [loadingAnn, setLoadingAnn] = useState(false);
  const [catFilter, setCatFilter] = useState("all");
  const [search, setSearch] = useState("");

  // Inline expand-in-card, not full-page navigation — matches the reference's
  // thread-reader pattern. Full detail (replies) is fetched lazily on first
  // expand and cached here so re-collapsing/re-expanding doesn't refetch.
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [expandedDetail, setExpandedDetail] = useState<Record<string, ThreadDTO>>({});
  const [loadingExpand, setLoadingExpand] = useState(false);
  const [replyText, setReplyText] = useState("");
  const [posting, setPosting] = useState(false);

  const [showNew, setShowNew] = useState(false);
  const [form, setForm] = useState({ title: "", body: "", category: "Q&A", tags: "" });

  // Staff (PM/faculty/SA) can pin/delete; participants cannot.
  const isStaff = user?.role === "program_manager" || user?.role === "faculty" || user?.role === "superadmin" || user?.role === "superadmin_secondary";

  const loadThreads = useCallback(async () => {
    if (!programId && !cohortId) return;
    setLoadingThreads(true);
    try {
      const res = await discussionsApi.listThreads(programId ? { program_id: programId } : { cohort_id: cohortId });
      setThreads(res.data ?? []);
    } catch { setThreads([]); }
    finally { setLoadingThreads(false); }
  }, [programId, cohortId]);

  const loadAnnouncements = useCallback(async () => {
    if (!cohortId) return;
    setLoadingAnn(true);
    try {
      const res = await discussionsApi.listAnnouncements(cohortId);
      setAnnouncements(res.data ?? []);
    } catch { setAnnouncements([]); }
    finally { setLoadingAnn(false); }
  }, [cohortId]);

  useEffect(() => {
    let cancelled = false;
    void Promise.resolve().then(() => { if (!cancelled) loadThreads(); });
    return () => { cancelled = true; };
  }, [loadThreads]);

  useEffect(() => {
    if (subTab !== "announcements") return;
    let cancelled = false;
    void Promise.resolve().then(() => { if (!cancelled) loadAnnouncements(); });
    return () => { cancelled = true; };
  }, [subTab, loadAnnouncements]);

  const filtered = useMemo(() => threads.filter((t) => {
    if (catFilter !== "all" && t.category !== catFilter) return false;
    if (search && !t.title.toLowerCase().includes(search.toLowerCase()) && !t.body.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  }), [threads, catFilter, search]);

  const pinnedCount = threads.filter((t) => t.is_pinned).length;

  async function toggleExpand(id: string) {
    if (expandedId === id) { setExpandedId(null); return; }
    setExpandedId(id);
    setReplyText("");
    if (expandedDetail[id]) return;
    setLoadingExpand(true);
    const r = await discussionsApi.getThread(id).catch(() => null);
    if (r?.data) setExpandedDetail((prev) => ({ ...prev, [id]: r.data! }));
    setLoadingExpand(false);
  }

  async function postReply(threadId: string) {
    if (!replyText.trim()) return;
    setPosting(true);
    const r = await discussionsApi.createReply(threadId, replyText.trim()).catch(() => null);
    if (r?.data) {
      setExpandedDetail((prev) => {
        const t = prev[threadId];
        if (!t) return prev;
        return { ...prev, [threadId]: { ...t, replies: [...(t.replies ?? []), r.data!], reply_count: t.reply_count + 1 } };
      });
      setThreads((prev) => prev.map((t) => t.id === threadId ? { ...t, reply_count: t.reply_count + 1 } : t));
      setReplyText("");
    }
    setPosting(false);
  }

  async function postThread() {
    if (!form.title.trim() || !form.body.trim() || !cohortId || !programId) return;
    setPosting(true);
    const tags = form.tags.split(",").map((t) => t.trim()).filter(Boolean);
    const r = await discussionsApi.createThread({ cohort_id: cohortId, program_id: programId, title: form.title.trim(), body: form.body.trim(), category: form.category, tags }).catch(() => null);
    if (r?.data) {
      setThreads((prev) => [r.data!, ...prev]);
      setForm({ title: "", body: "", category: "Q&A", tags: "" });
      setShowNew(false);
    }
    setPosting(false);
  }

  async function togglePin(t: ThreadDTO) {
    await discussionsApi.pinThread(t.id).catch(() => {});
    setThreads((prev) => prev.map((x) => x.id === t.id ? { ...x, is_pinned: !x.is_pinned } : x));
    setExpandedDetail((prev) => prev[t.id] ? { ...prev, [t.id]: { ...prev[t.id], is_pinned: !prev[t.id].is_pinned } } : prev);
  }

  async function removeThread(id: string) {
    if (!window.confirm("Delete this thread? This cannot be undone.")) return;
    await discussionsApi.deleteThread(id).catch(() => {});
    setThreads((prev) => prev.filter((t) => t.id !== id));
    if (expandedId === id) setExpandedId(null);
  }

  async function removeReply(threadId: string, replyId: string) {
    if (!window.confirm("Delete this reply?")) return;
    await discussionsApi.deleteReply(threadId, replyId).catch(() => {});
    setExpandedDetail((prev) => {
      const t = prev[threadId];
      if (!t) return prev;
      return { ...prev, [threadId]: { ...t, replies: (t.replies ?? []).filter((r) => r.id !== replyId), reply_count: Math.max(0, t.reply_count - 1) } };
    });
    setThreads((prev) => prev.map((t) => t.id === threadId ? { ...t, reply_count: Math.max(0, t.reply_count - 1) } : t));
  }

  if (!programId && !cohortId) {
    return <Page><EmptyCard title="No program yet" body="Discussions become available once you're enrolled in a program." /></Page>;
  }

  return (
    <Page>
      {/* Stats */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 12 }}>
        <Stat label="Threads" value={String(threads.length)} sub="In this program" color={NAVY} />
        <Stat label="Pinned" value={String(pinnedCount)} sub="Highlighted by staff" color={INDIGO} />
        <Stat label="Categories" value={String(new Set(threads.map((t) => t.category)).size)} sub="Active topics" color={ORANGE} />
      </div>

      {/* Sub-tabs + New Thread */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <div style={{ display: "flex", gap: 8 }}>
          {([["forum", "Forum"], ["announcements", "Announcements"]] as [typeof subTab, string][]).map(([k, label]) => (
            <button key={k} onClick={() => setSubTab(k)} style={{ ...pill, ...(subTab === k ? pillActive : {}) }}>{label}</button>
          ))}
        </div>
        {subTab === "forum" && <button onClick={() => setShowNew(true)} style={primaryBtn}>+ New Thread</button>}
      </div>

      {subTab === "forum" ? (
        <>
          {/* Search + category filters */}
          <Card style={{ padding: "14px 16px" }}>
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="🔍 Search threads…" style={{ ...input, marginBottom: 12 }} />
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {CATEGORIES.map((c) => (
                <button key={c} onClick={() => setCatFilter(c)} style={{ ...filterPill, ...(catFilter === c ? filterPillActive : {}) }}>{c === "all" ? "All" : c}</button>
              ))}
            </div>
          </Card>

          {/* Thread list */}
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {loadingThreads && <SoftEmpty label="Loading discussions…" />}
            {!loadingThreads && filtered.map((t) => (
              <ThreadRow
                key={t.id}
                thread={t}
                expanded={expandedId === t.id}
                detail={expandedDetail[t.id]}
                loadingDetail={loadingExpand && expandedId === t.id}
                isStaff={isStaff}
                currentUserId={user?.id}
                replyText={expandedId === t.id ? replyText : ""}
                posting={posting}
                onToggle={() => toggleExpand(t.id)}
                onReplyTextChange={setReplyText}
                onPostReply={() => postReply(t.id)}
                onTogglePin={() => togglePin(t)}
                onDeleteThread={() => removeThread(t.id)}
                onDeleteReply={(replyId) => removeReply(t.id, replyId)}
              />
            ))}
            {!loadingThreads && filtered.length === 0 && <EmptyCard title="No threads yet" body="Start the conversation — post the first thread for your program." />}
          </div>
        </>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {loadingAnn && <SoftEmpty label="Loading announcements…" />}
          {!loadingAnn && announcements.map((a) => (
            <Card key={a.id}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                <span style={{ fontSize: 16 }}>📣</span>
                <div style={{ fontSize: 14, fontWeight: 700, color: NAVY }}>{a.title}</div>
              </div>
              <p style={{ fontSize: 13, color: NAVY, lineHeight: 1.6, margin: 0, whiteSpace: "pre-wrap" }}>{a.body}</p>
              <div style={{ fontSize: 11, color: MUTED, marginTop: 10 }}>{a.author_name} · {timeAgo(a.created_at)}</div>
            </Card>
          ))}
          {!loadingAnn && announcements.length === 0 && <EmptyCard title="No announcements" body="Announcements from your faculty and program manager will appear here." />}
        </div>
      )}

      {showNew && (
        <NewThreadModal
          form={form}
          setForm={setForm}
          posting={posting}
          onClose={() => setShowNew(false)}
          onSubmit={postThread}
        />
      )}
    </Page>
  );
}

function ThreadRow({
  thread, expanded, detail, loadingDetail, isStaff, currentUserId, replyText, posting,
  onToggle, onReplyTextChange, onPostReply, onTogglePin, onDeleteThread, onDeleteReply,
}: {
  thread: ThreadDTO; expanded: boolean; detail?: ThreadDTO; loadingDetail: boolean;
  isStaff: boolean; currentUserId?: string; replyText: string; posting: boolean;
  onToggle: () => void; onReplyTextChange: (v: string) => void; onPostReply: () => void;
  onTogglePin: () => void; onDeleteThread: () => void; onDeleteReply: (replyId: string) => void;
}) {
  const cm = CAT_META[thread.category] ?? { bg: "rgba(139,144,167,0.12)", color: MUTED };
  return (
    <Card style={{ cursor: "pointer", border: `1.5px solid ${expanded ? ORANGE : BORDER}` }}>
      <div onClick={onToggle} style={{ display: "flex", justifyContent: "space-between", gap: 16 }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 6, flexWrap: "wrap" }}>
            {thread.is_pinned && <span style={pinnedChip}>📌 PINNED</span>}
            <span style={{ fontSize: 10, fontWeight: 700, background: cm.bg, color: cm.color, padding: "3px 9px", borderRadius: 20 }}>{thread.category}</span>
          </div>
          <div style={{ fontSize: 14, fontWeight: 700, color: NAVY, marginBottom: 4 }}>{thread.title}</div>
          {!expanded && <div style={{ fontSize: 12, color: MUTED, lineHeight: 1.5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{thread.body}</div>}
          {!expanded && <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>{thread.tags.slice(0, 3).map((tag) => <span key={tag} style={tagChip}>{tag}</span>)}</div>}
        </div>
        <div style={{ textAlign: "right", flexShrink: 0, fontSize: 11, color: MUTED }}>
          <div>💬 {thread.reply_count}</div>
          <div style={{ marginTop: 4 }}>{timeAgo(thread.created_at)}</div>
        </div>
      </div>

      {expanded && (
        <div onClick={(e) => e.stopPropagation()} style={{ marginTop: 14, borderTop: `1px solid ${BORDER}`, paddingTop: 14, display: "flex", flexDirection: "column", gap: 14 }}>
          <div>
            <p style={{ fontSize: 13, color: NAVY, lineHeight: 1.6, margin: 0, whiteSpace: "pre-wrap" }}>{thread.body}</p>
            <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>{thread.tags.map((tag) => <span key={tag} style={tagChip}>{tag}</span>)}</div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 10 }}>
              <div style={{ fontSize: 11, color: MUTED, flex: 1 }}>{thread.author_name} · {timeAgo(thread.created_at)} · {thread.reply_count} replies</div>
              {isStaff && (
                <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                  <button onClick={onTogglePin} style={{ ...smallBtn, color: thread.is_pinned ? ORANGE : MUTED, background: thread.is_pinned ? "rgba(239,78,36,0.06)" : "#fff" }}>{thread.is_pinned ? "Unpin" : "📌 Pin"}</button>
                  <button onClick={onDeleteThread} style={{ ...smallBtn, color: "#ef4444", border: "1.5px solid rgba(239,68,68,0.3)", background: "rgba(239,68,68,0.06)" }}>Delete</button>
                </div>
              )}
            </div>
          </div>

          {loadingDetail ? (
            <SoftEmpty label="Loading replies…" />
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {(detail?.replies ?? []).map((r) => {
                const mine = r.author_id === currentUserId;
                return (
                  <div key={r.id} style={{ background: PAGE, borderRadius: 10, padding: "12px 14px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                      <Avatar name={r.author_name} accent={mine ? ORANGE : NAVY} />
                      <span style={{ fontSize: 12, fontWeight: 600, color: NAVY }}>{r.author_name}</span>
                      {mine && <span style={youChip}>YOU</span>}
                      <span style={{ fontSize: 11, color: MUTED }}>{timeAgo(r.created_at)}</span>
                      {(isStaff || mine) && <button onClick={() => onDeleteReply(r.id)} style={{ ...smallBtn, marginLeft: "auto", color: "#ef4444", border: "1px solid rgba(239,68,68,0.3)", background: "rgba(239,68,68,0.04)", fontSize: 10, padding: "3px 9px" }}>Delete</button>}
                    </div>
                    <p style={{ fontSize: 13, color: NAVY, lineHeight: 1.6, margin: 0, whiteSpace: "pre-wrap" }}>{r.body}</p>
                  </div>
                );
              })}
              {(detail?.replies ?? []).length === 0 && <SoftEmpty label="No replies yet. Be the first to respond." />}
            </div>
          )}

          <div>
            <div style={microLabel}>YOUR REPLY</div>
            <textarea value={replyText} onChange={(e) => onReplyTextChange(e.target.value)} rows={3} placeholder="Share your thoughts…" style={textarea} />
            <button onClick={onPostReply} disabled={posting || !replyText.trim()} style={{ ...primaryBtn, marginTop: 10, opacity: posting || !replyText.trim() ? 0.6 : 1 }}>{posting ? "Posting…" : "Post Reply"}</button>
          </div>
        </div>
      )}
    </Card>
  );
}

function NewThreadModal({ form, setForm, posting, onClose, onSubmit }: {
  form: { title: string; body: string; category: string; tags: string };
  setForm: (updater: (f: { title: string; body: string; category: string; tags: string }) => typeof form) => void;
  posting: boolean; onClose: () => void; onSubmit: () => void;
}) {
  if (typeof document === "undefined") return null;
  return ReactDOM.createPortal(
    <div onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{ position: "fixed", inset: 0, background: "rgba(28,37,81,0.5)", zIndex: 2000, display: "flex", alignItems: "center", justifyContent: "center", padding: 24, fontFamily: "Poppins, sans-serif" }}>
      <div style={{ background: "#fff", borderRadius: 16, width: "100%", maxWidth: 520, maxHeight: "88vh", overflowY: "auto", boxShadow: "0 24px 64px rgba(28,37,81,0.22)" }}>
        <div style={{ padding: "18px 24px", borderBottom: `1px solid ${BORDER}`, display: "flex", justifyContent: "space-between", alignItems: "center", position: "sticky", top: 0, background: "#fff" }}>
          <span style={{ fontSize: 15, fontWeight: 700, color: NAVY }}>Start a New Thread</span>
          <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 18, color: MUTED, cursor: "pointer" }}>✕</button>
        </div>
        <div style={{ padding: 24, display: "flex", flexDirection: "column", gap: 14 }}>
          <Field label="Title"><input value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} placeholder="What's your question or topic?" style={input} autoFocus /></Field>
          <Field label="Body"><textarea value={form.body} onChange={(e) => setForm((f) => ({ ...f, body: e.target.value }))} rows={4} placeholder="Share details…" style={textarea} /></Field>
          <Field label="Category">
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {CATEGORIES.filter((c) => c !== "all").map((c) => {
                const cm = CAT_META[c] ?? { bg: "rgba(139,144,167,0.12)", color: MUTED };
                const on = form.category === c;
                return (
                  <button key={c} onClick={() => setForm((f) => ({ ...f, category: c }))}
                    style={{ padding: "6px 14px", border: `1.5px solid ${on ? cm.color : BORDER}`, borderRadius: 20, background: on ? cm.bg : "#fff", color: on ? cm.color : MUTED, fontSize: 11, fontWeight: on ? 700 : 500, cursor: "pointer", fontFamily: "Poppins, sans-serif" }}>
                    {c}
                  </button>
                );
              })}
            </div>
          </Field>
          <Field label="Tags (comma-separated)"><input value={form.tags} onChange={(e) => setForm((f) => ({ ...f, tags: e.target.value }))} placeholder="e.g. Leadership, Strategy" style={input} /></Field>
        </div>
        <div style={{ padding: "14px 24px", borderTop: `1px solid ${BORDER}`, display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <button onClick={onClose} style={{ ...smallBtn, padding: "9px 18px" }}>Cancel</button>
          <button onClick={onSubmit} disabled={posting || !form.title.trim() || !form.body.trim()} style={{ ...primaryBtn, opacity: posting || !form.title.trim() || !form.body.trim() ? 0.6 : 1 }}>{posting ? "Posting…" : "Post Thread"}</button>
        </div>
      </div>
    </div>,
    document.body
  );
}

// ── primitives ────────────────────────────────────────────────────────────────
function Page({ children }: { children: ReactNode }) {
  return <div style={{ padding: 24, display: "flex", flexDirection: "column", gap: 16, fontFamily: "Poppins, sans-serif", background: PAGE }}>{children}</div>;
}
function Card({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return <div style={{ background: "#fff", borderRadius: 12, border: `1px solid ${BORDER}`, boxShadow: SHADOW, padding: 20, ...style }}>{children}</div>;
}
function Stat({ label, value, sub, color }: { label: string; value: string; sub: string; color: string }) {
  return (
    <Card style={{ padding: "14px 16px" }}>
      <div style={{ fontSize: 11, color: MUTED, marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 800, color }}>{value}</div>
      <div style={{ fontSize: 10, color: MUTED, marginTop: 3 }}>{sub}</div>
    </Card>
  );
}
function Field({ label, children }: { label: string; children: ReactNode }) {
  return <div><label style={microLabel}>{label}</label>{children}</div>;
}
function Avatar({ name, accent }: { name: string; accent: string }) {
  return <div style={{ width: 30, height: 30, borderRadius: "50%", background: `${accent}18`, color: accent, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700, flexShrink: 0 }}>{(name ?? "?").charAt(0).toUpperCase()}</div>;
}
function SoftEmpty({ label }: { label: string }) { return <div style={{ padding: "18px 0", textAlign: "center", color: MUTED, fontSize: 12 }}>{label}</div>; }
function EmptyCard({ title, body }: { title: string; body: string }) {
  return <Card style={{ padding: 40, textAlign: "center" }}><div style={{ fontSize: 16, fontWeight: 800, color: NAVY, marginBottom: 8 }}>{title}</div><div style={{ fontSize: 13, color: MUTED, lineHeight: 1.6, maxWidth: 440, margin: "0 auto" }}>{body}</div></Card>;
}
function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

const primaryBtn: CSSProperties = { padding: "9px 20px", background: ORANGE, border: "none", borderRadius: 8, color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "Poppins, sans-serif", whiteSpace: "nowrap" };
const smallBtn: CSSProperties = { fontSize: 11, fontWeight: 600, padding: "5px 12px", borderRadius: 7, border: `1.5px solid ${BORDER}`, background: "#fff", cursor: "pointer", fontFamily: "Poppins, sans-serif" };
const pill: CSSProperties = { padding: "8px 18px", border: `1.5px solid ${BORDER}`, borderRadius: 20, background: "#fff", color: MUTED, fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "Poppins, sans-serif" };
const pillActive: CSSProperties = { background: "rgba(239,78,36,0.08)", color: ORANGE, border: `1.5px solid ${ORANGE}`, fontWeight: 700 };
const filterPill: CSSProperties = { padding: "6px 14px", border: `1px solid ${BORDER}`, borderRadius: 20, background: "#fff", color: MUTED, fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: "Poppins, sans-serif" };
const filterPillActive: CSSProperties = { background: "rgba(239,78,36,0.08)", color: ORANGE, border: `1px solid ${ORANGE}`, fontWeight: 700 };
const input: CSSProperties = { width: "100%", border: `1px solid ${BORDER}`, borderRadius: 8, padding: "9px 12px", fontSize: 13, color: NAVY, fontFamily: "Poppins, sans-serif", outline: "none", boxSizing: "border-box" };
const textarea: CSSProperties = { ...input, resize: "vertical", lineHeight: 1.6 };
const microLabel: CSSProperties = { fontSize: 10, fontWeight: 700, color: MUTED, letterSpacing: 0.5, textTransform: "uppercase", display: "block", marginBottom: 6 };
const tagChip: CSSProperties = { fontSize: 10, fontWeight: 500, background: "#F5F7FB", color: MUTED, padding: "3px 9px", borderRadius: 20 };
const pinnedChip: CSSProperties = { fontSize: 9, fontWeight: 700, background: "rgba(239,78,36,0.1)", color: ORANGE, padding: "2px 8px", borderRadius: 20, letterSpacing: 0.5 };
const youChip: CSSProperties = { fontSize: 9, fontWeight: 700, background: "rgba(239,78,36,0.12)", color: ORANGE, padding: "2px 7px", borderRadius: 20, letterSpacing: 0.5 };
