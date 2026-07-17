"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import ReactDOM from "react-dom";
import { discussionsApi, ThreadDTO, AnnouncementDTO, ContactDTO, DMGroupDTO, DirectMessageDTO } from "@/lib/discussions-api";
import { useAuth } from "@/lib/auth-context";

const NAVY = "#182848";
const ORANGE = "#C8A860";
const INDIGO = "#4A5573";
const GREEN = "#22c55e";
const PAGE = "#F7F5F0";
const BORDER = "#E6DED0";
const MUTED = "#4A5573";
const SHADOW = "0 1px 4px rgba(24, 40, 72,0.07)";

const CATEGORIES = ["all", "Case Discussion", "Reflection", "Debate", "Q&A", "Submission", "Resource"] as const;
const CAT_META: Record<string, { bg: string; color: string }> = {
  "Case Discussion": { bg: "rgba(200, 168, 96,0.08)", color: ORANGE },
  Reflection: { bg: "rgba(74, 85, 115,0.1)", color: INDIGO },
  Debate: { bg: "rgba(24, 40, 72,0.08)", color: NAVY },
  "Q&A": { bg: "rgba(34,197,94,0.1)", color: GREEN },
  Submission: { bg: "rgba(200, 168, 96,0.08)", color: ORANGE },
  Resource: { bg: "rgba(34,197,94,0.1)", color: GREEN },
};

// programId scopes threads program-wide; cohortId is where new threads are posted.
interface Props {
  programId?: string;
  cohortId?: string;
}

export default function DiscussionsExperience({ programId, cohortId }: Props) {
  const { user } = useAuth();
  const [subTab, setSubTab] = useState<"forum" | "announcements" | "dm">("forum");
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
  // Direct Messages is participant ⇄ PM and participant ⇄ participant only —
  // faculty never gets this sub-tab, matching the backend's route allow-list.
  const canDM = (user?.role === "participant" || user?.role === "program_manager") && !!programId;

  // Unread DM badge on the tab pill — polled independently of whether the DM
  // tab is open, so a new message shows up even while viewing Forum. Counts
  // 1:1 conversations whose latest message is unread and addressed to me;
  // group messages have no per-recipient read state to count against.
  const [dmUnread, setDmUnread] = useState(0);
  const myUserId = user?.id;
  const loadDmUnread = useCallback(() => {
    if (!canDM || !myUserId) { setDmUnread(0); return; }
    discussionsApi.listDMConversations()
      .then((r) => {
        const n = (r.data ?? []).filter((m) => m.recipient_id === myUserId && !m.is_read).length;
        setDmUnread(n);
      })
      .catch(() => setDmUnread(0));
  }, [canDM, myUserId]);

  useEffect(() => {
    loadDmUnread();
    const id = setInterval(loadDmUnread, DM_POLL_MS);
    return () => clearInterval(id);
  }, [loadDmUnread]);

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
          {([["forum", "Forum"], ["announcements", "Announcements"], ...(canDM ? [["dm", "Direct Messages"]] : [])] as [typeof subTab, string][]).map(([k, label]) => (
            <button key={k} onClick={() => setSubTab(k)} style={{ ...pill, ...(subTab === k ? pillActive : {}), display: "flex", alignItems: "center", gap: 6 }}>
              {label}
              {k === "dm" && dmUnread > 0 && <UnreadBadge count={dmUnread} />}
            </button>
          ))}
        </div>
        {subTab === "forum" && <button onClick={() => setShowNew(true)} style={primaryBtn}>+ New Thread</button>}
      </div>

      {subTab === "dm" && canDM ? (
        <DirectMessagesPanel programId={programId!} currentUserId={user?.id} currentUserRole={user?.role} onRead={loadDmUnread} />
      ) : subTab === "forum" ? (
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

// ── Direct Messages panel ────────────────────────────────────────────────────
// A conversation is either 1:1 (partnerId set, groupId undefined) or a group
// (groupId set, partnerId undefined) — never both. 1:1 threads are never
// filtered by program (see backend listDMs doc) — two people are simply
// connected or not, regardless of which of their shared programs justified
// it, so partnerId alone identifies the conversation. programId is kept on
// the selection only as a display label (which program this contact was
// found through) and because sendDM's server-side authorization check still
// needs *some* shared program to validate against.
type DMSelection = { kind: "contact"; partnerId: string; partnerName: string; partnerEmail: string; programId: string } | { kind: "group"; groupId: string; groupName: string };

const DM_POLL_MS = 15000; // matches the codebase's existing notification-bell polling pattern (Header.tsx), no WebSocket/SSE infra exists for user-to-user events

// programId is the PM's currently-managed program (used only to scope a PM's
// own contact list / group visibility to that program). For a participant,
// contacts and conversations are always aggregated across every program
// they're enrolled in — DM is not meant to be scoped to whichever single
// program happens to be active in the outer tab.
function DirectMessagesPanel({ programId, currentUserId, currentUserRole, onRead }: { programId: string; currentUserId?: string; currentUserRole?: string; onRead?: () => void }) {
  const [contacts, setContacts] = useState<ContactDTO[]>([]);
  const [groups, setGroups] = useState<DMGroupDTO[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [selection, setSelection] = useState<DMSelection | null>(null);
  const [showNewGroup, setShowNewGroup] = useState(false);
  const [search, setSearch] = useState("");
  const isParticipant = currentUserRole === "participant";

  const loadContactsAndGroups = useCallback(async () => {
    try {
      const [c, g] = await Promise.all([
        discussionsApi.listDMContacts(isParticipant ? undefined : programId),
        isParticipant ? discussionsApi.listMyDMGroups() : Promise.resolve({ data: [] as DMGroupDTO[] }),
      ]);
      setContacts(c.data ?? []);
      setGroups(g.data ?? []);
    } catch {
      setContacts([]);
      setGroups([]);
    } finally {
      setLoadingList(false);
    }
  }, [programId, isParticipant]);

  useEffect(() => {
    let cancelled = false;
    void Promise.resolve().then(() => { if (!cancelled) loadContactsAndGroups(); });
    return () => { cancelled = true; };
  }, [loadContactsAndGroups]);

  // Poll the contact/group list in the background so a new group invite or a
  // newly-shared program shows up without a manual refresh — same cadence
  // philosophy as the notification bell, just scoped to this panel.
  useEffect(() => {
    const id = setInterval(loadContactsAndGroups, DM_POLL_MS);
    return () => clearInterval(id);
  }, [loadContactsAndGroups]);

  const q = search.trim().toLowerCase();
  const matchesSearch = (name: string, email?: string) => !q || name.toLowerCase().includes(q) || (email ?? "").toLowerCase().includes(q);

  const pmContacts = contacts.filter((c) => c.role === "program_manager" && matchesSearch(c.name, c.email));
  const peerContacts = contacts.filter((c) => c.role === "participant" && matchesSearch(c.name, c.email));
  const filteredGroups = groups.filter((g) => matchesSearch(g.name));

  return (
    <div style={{ display: "grid", gridTemplateColumns: "280px minmax(0,1fr)", gap: 16, height: "calc(100vh - 260px)", minHeight: 420 }}>
      {/* Left rail — contacts + groups. Its own scroll region so a long
          contact list never pushes the conversation pane's composer out of view. */}
      <Card style={{ padding: 0, display: "flex", flexDirection: "column", overflow: "hidden", minHeight: 0 }}>
        {isParticipant && (
          <div style={{ padding: 14, borderBottom: `1px solid ${BORDER}` }}>
            <button onClick={() => setShowNewGroup(true)} style={{ ...primaryBtn, width: "100%", justifyContent: "center", display: "flex" }}>+ New Group</button>
          </div>
        )}
        <div style={{ padding: "10px 10px 0" }}>
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="🔍 Search people or groups…" style={{ ...input, fontSize: 12 }} />
        </div>
        <div style={{ flex: 1, overflowY: "auto", padding: 10 }}>
          {loadingList && <SoftEmpty label="Loading…" />}

          {!loadingList && pmContacts.length > 0 && (
            <div style={{ marginBottom: 10 }}>
              <div style={{ ...microLabel, padding: "4px 8px" }}>PROGRAM MANAGER</div>
              {pmContacts.map((c) => (
                <ContactRow key={c.user_id} contact={c}
                  active={selection?.kind === "contact" && selection.partnerId === c.user_id}
                  onClick={() => setSelection({ kind: "contact", partnerId: c.user_id, partnerName: c.name, partnerEmail: c.email, programId: c.program_id })} />
              ))}
            </div>
          )}

          {!loadingList && filteredGroups.length > 0 && (
            <div style={{ marginBottom: 10 }}>
              <div style={{ ...microLabel, padding: "4px 8px" }}>GROUPS</div>
              {filteredGroups.map((g) => (
                <GroupRow key={g.id} group={g}
                  active={selection?.kind === "group" && selection.groupId === g.id}
                  onClick={() => setSelection({ kind: "group", groupId: g.id, groupName: g.name })} />
              ))}
            </div>
          )}

          {!loadingList && peerContacts.length > 0 && (
            <div>
              <div style={{ ...microLabel, padding: "4px 8px" }}>PARTICIPANTS</div>
              {peerContacts.map((c) => (
                <ContactRow key={c.user_id} contact={c}
                  active={selection?.kind === "contact" && selection.partnerId === c.user_id}
                  onClick={() => setSelection({ kind: "contact", partnerId: c.user_id, partnerName: c.name, partnerEmail: c.email, programId: c.program_id })} />
              ))}
            </div>
          )}

          {!loadingList && pmContacts.length === 0 && peerContacts.length === 0 && filteredGroups.length === 0 && (
            <div style={{ padding: 16 }}><SoftEmpty label={q ? "No matches." : "No one to message yet."} /></div>
          )}
        </div>
      </Card>

      {/* Right pane — active conversation */}
      {selection ? (
        selection.kind === "contact" ? (
          <ConversationView programId={selection.programId} partnerId={selection.partnerId} partnerName={selection.partnerName} partnerEmail={selection.partnerEmail} currentUserId={currentUserId} onRead={onRead} />
        ) : (
          <GroupConversationView groupId={selection.groupId} groupName={selection.groupName} currentUserId={currentUserId} />
        )
      ) : (
        <Card style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: 0 }}>
          <SoftEmpty label="Select a conversation to start messaging." />
        </Card>
      )}

      {showNewGroup && (
        <NewGroupModal
          peers={peerContacts}
          onClose={() => setShowNewGroup(false)}
          onCreated={(g) => { setGroups((prev) => [g, ...prev]); setSelection({ kind: "group", groupId: g.id, groupName: g.name }); setShowNewGroup(false); }}
        />
      )}
    </div>
  );
}

function ContactRow({ contact, active, onClick }: { contact: ContactDTO; active: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} style={{
      ...ff, display: "flex", alignItems: "center", gap: 10, width: "100%", padding: "8px 8px", border: "none",
      borderRadius: 8, background: active ? "rgba(200, 168, 96,0.08)" : "transparent", cursor: "pointer", textAlign: "left",
    }}>
      <Avatar name={contact.name} accent={contact.role === "program_manager" ? INDIGO : ORANGE} />
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ fontSize: 12.5, fontWeight: 600, color: active ? ORANGE : NAVY, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{contact.name}</div>
        <div style={{ fontSize: 10, color: MUTED, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{contact.email || (contact.role === "program_manager" ? "Program Manager" : contact.program)}</div>
      </div>
    </button>
  );
}

function GroupRow({ group, active, onClick }: { group: DMGroupDTO; active: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} style={{
      ...ff, display: "flex", alignItems: "center", gap: 10, width: "100%", padding: "8px 8px", border: "none",
      borderRadius: 8, background: active ? "rgba(200, 168, 96,0.08)" : "transparent", cursor: "pointer", textAlign: "left",
    }}>
      <div style={{ width: 30, height: 30, borderRadius: "50%", background: `${GREEN}18`, color: GREEN, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 700, flexShrink: 0 }}>👥</div>
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ fontSize: 12.5, fontWeight: 600, color: active ? ORANGE : NAVY, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{group.name}</div>
        <div style={{ fontSize: 10, color: MUTED }}>{group.member_count} member{group.member_count !== 1 ? "s" : ""}</div>
      </div>
    </button>
  );
}

function ConversationView({ programId, partnerId, partnerName, partnerEmail, currentUserId, onRead }: {
  programId: string; partnerId: string; partnerName: string; partnerEmail?: string; currentUserId?: string; onRead?: () => void;
}) {
  const [messages, setMessages] = useState<DirectMessageDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await discussionsApi.listDMs(partnerId);
      setMessages(res.data ?? []);
    } catch { /* keep last-known messages on a transient poll failure */ }
    finally { setLoading(false); }
  }, [partnerId]);

  useEffect(() => {
    setLoading(true);
    void load();
    // Marking read here (not just clearing local state) also drives the tab
    // pill's unread badge back down immediately via onRead, instead of
    // waiting up to DM_POLL_MS for the next background refresh.
    discussionsApi.markDMsRead(partnerId).then(() => onRead?.()).catch(() => {});
  }, [load, partnerId, onRead]);

  useEffect(() => {
    const id = setInterval(load, DM_POLL_MS);
    return () => clearInterval(id);
  }, [load]);

  async function send() {
    if (!draft.trim()) return;
    setSending(true);
    const body = draft.trim();
    setDraft("");
    try {
      const res = await discussionsApi.sendDM({ recipient_id: partnerId, program_id: programId, body });
      if (res.data) setMessages((prev) => [...prev, res.data!]);
    } catch {
      setDraft(body); // restore on failure so the message isn't silently lost
    } finally {
      setSending(false);
    }
  }

  return (
    <Card style={{ padding: 0, display: "flex", flexDirection: "column", overflow: "hidden", minHeight: 0 }}>
      <div style={{ padding: "14px 18px", borderBottom: `1px solid ${BORDER}`, display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
        <Avatar name={partnerName} accent={ORANGE} />
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 13.5, fontWeight: 700, color: NAVY, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{partnerName}</div>
          {partnerEmail && <div style={{ fontSize: 11, color: MUTED, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{partnerEmail}</div>}
        </div>
      </div>
      <div style={{ flex: 1, overflowY: "auto", padding: 16, display: "flex", flexDirection: "column", gap: 10, minHeight: 0 }}>
        {loading && <SoftEmpty label="Loading conversation…" />}
        {!loading && messages.length === 0 && <SoftEmpty label={`Say hello to ${partnerName} — no messages yet.`} />}
        {!loading && messages.map((m) => <MessageBubble key={m.id} message={m} mine={m.sender_id === currentUserId} />)}
      </div>
      <MessageComposer draft={draft} onDraftChange={setDraft} onSend={send} sending={sending} />
    </Card>
  );
}

function GroupConversationView({ groupId, groupName, currentUserId }: { groupId: string; groupName: string; currentUserId?: string }) {
  const [messages, setMessages] = useState<DirectMessageDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [group, setGroup] = useState<DMGroupDTO | null>(null);
  const [showInvite, setShowInvite] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await discussionsApi.listGroupMessages(groupId);
      setMessages(res.data ?? []);
    } catch { /* keep last-known messages on a transient poll failure */ }
    finally { setLoading(false); }
  }, [groupId]);

  const loadGroup = useCallback(async () => {
    try {
      const res = await discussionsApi.getDMGroup(groupId);
      setGroup(res.data ?? null);
    } catch { setGroup(null); }
  }, [groupId]);

  useEffect(() => { setLoading(true); void load(); void loadGroup(); }, [load, loadGroup, groupId]);

  useEffect(() => {
    const id = setInterval(load, DM_POLL_MS);
    return () => clearInterval(id);
  }, [load]);

  async function send() {
    if (!draft.trim()) return;
    setSending(true);
    const body = draft.trim();
    setDraft("");
    try {
      const res = await discussionsApi.sendGroupMessage(groupId, body);
      if (res.data) setMessages((prev) => [...prev, res.data!]);
    } catch {
      setDraft(body);
    } finally {
      setSending(false);
    }
  }

  return (
    <Card style={{ padding: 0, display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <div style={{ padding: "14px 18px", borderBottom: `1px solid ${BORDER}`, display: "flex", alignItems: "center", gap: 10 }}>
        <div style={{ width: 30, height: 30, borderRadius: "50%", background: `${GREEN}18`, color: GREEN, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 700, flexShrink: 0 }}>👥</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13.5, fontWeight: 700, color: NAVY }}>{groupName}</div>
          <div style={{ fontSize: 10, color: MUTED }}>{(group?.members ?? []).map((m) => m.name).join(", ") || `${group?.member_count ?? ""} members`}</div>
        </div>
        <button onClick={() => setShowInvite(true)} style={{ ...smallBtn, flexShrink: 0 }}>+ Invite</button>
      </div>
      <div style={{ flex: 1, overflowY: "auto", padding: 16, display: "flex", flexDirection: "column", gap: 10, minHeight: 320 }}>
        {loading && <SoftEmpty label="Loading conversation…" />}
        {!loading && messages.length === 0 && <SoftEmpty label="No messages yet — start the conversation." />}
        {!loading && messages.map((m) => <MessageBubble key={m.id} message={m} mine={m.sender_id === currentUserId} showSenderName />)}
      </div>
      <MessageComposer draft={draft} onDraftChange={setDraft} onSend={send} sending={sending} />

      {showInvite && group && (
        <InviteToGroupModal
          groupId={groupId}
          programId={group.program_id}
          existingMemberIds={(group.members ?? []).map((m) => m.user_id)}
          onClose={() => setShowInvite(false)}
          onInvited={() => { setShowInvite(false); void loadGroup(); }}
        />
      )}
    </Card>
  );
}

function MessageBubble({ message, mine, showSenderName }: { message: DirectMessageDTO; mine: boolean; showSenderName?: boolean }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: mine ? "flex-end" : "flex-start" }}>
      {showSenderName && !mine && <div style={{ fontSize: 10, color: MUTED, marginBottom: 3, marginLeft: 4 }}>{message.sender_name}</div>}
      <div style={{
        maxWidth: "70%", padding: "9px 13px", borderRadius: mine ? "12px 12px 3px 12px" : "12px 12px 12px 3px",
        background: mine ? ORANGE : PAGE, color: mine ? "#fff" : NAVY, fontSize: 13, lineHeight: 1.5, whiteSpace: "pre-wrap", wordBreak: "break-word",
      }}>
        {message.body}
      </div>
      <div style={{ fontSize: 9.5, color: MUTED, marginTop: 3, marginLeft: mine ? 0 : 4, marginRight: mine ? 4 : 0 }}>{timeAgo(message.created_at)}</div>
    </div>
  );
}

function MessageComposer({ draft, onDraftChange, onSend, sending }: { draft: string; onDraftChange: (v: string) => void; onSend: () => void; sending: boolean }) {
  return (
    <div style={{ padding: 12, borderTop: `1px solid ${BORDER}`, display: "flex", gap: 8 }}>
      <input
        value={draft}
        onChange={(e) => onDraftChange(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); onSend(); } }}
        placeholder="Type a message…"
        style={{ ...input, flex: 1 }}
      />
      <button onClick={onSend} disabled={sending || !draft.trim()} style={{ ...primaryBtn, opacity: sending || !draft.trim() ? 0.6 : 1 }}>Send</button>
    </div>
  );
}

// Groups still belong to one program server-side (dm_group_members must all
// be peers of that program), but a participant's peer list is now aggregated
// across every program they're in — so the program is chosen implicitly by
// which program's peers the user picks from, not a prop passed in from
// whatever the outer tab happened to have active. Peers are grouped by
// program in the picker, and the checkboxes for programs other than the one
// backing the current selection are disabled to keep every invitee valid
// for a single group.
function NewGroupModal({ peers, onClose, onCreated }: {
  peers: ContactDTO[]; onClose: () => void; onCreated: (g: DMGroupDTO) => void;
}) {
  const [name, setName] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [creating, setCreating] = useState(false);

  const byProgram = useMemo(() => {
    const groups = new Map<string, { program: string; peers: ContactDTO[] }>();
    peers.forEach((p) => {
      if (!groups.has(p.program_id)) groups.set(p.program_id, { program: p.program, peers: [] });
      groups.get(p.program_id)!.peers.push(p);
    });
    return Array.from(groups.entries());
  }, [peers]);

  const activeProgramId = peers.find((p) => selected.has(p.user_id))?.program_id ?? null;

  function toggle(p: ContactDTO) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(p.user_id)) { next.delete(p.user_id); return next; }
      // First pick locks the group to that peer's program — clear any prior
      // selection from a different program rather than allowing a mixed set.
      if (activeProgramId && activeProgramId !== p.program_id) return new Set([p.user_id]);
      next.add(p.user_id);
      return next;
    });
  }

  async function create() {
    if (!name.trim() || !activeProgramId) return;
    setCreating(true);
    try {
      const res = await discussionsApi.createDMGroup({ program_id: activeProgramId, name: name.trim(), member_ids: Array.from(selected) });
      if (res.data) onCreated(res.data);
    } finally {
      setCreating(false);
    }
  }

  if (typeof document === "undefined") return null;
  return ReactDOM.createPortal(
    <div onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{ position: "fixed", inset: 0, background: "rgba(24, 40, 72,0.5)", zIndex: 2000, display: "flex", alignItems: "center", justifyContent: "center", padding: 24, fontFamily: "Poppins, sans-serif" }}>
      <div style={{ background: "#fff", borderRadius: 16, width: "100%", maxWidth: 440, maxHeight: "88vh", overflowY: "auto", boxShadow: "0 24px 64px rgba(24, 40, 72,0.22)" }}>
        <div style={{ padding: "18px 24px", borderBottom: `1px solid ${BORDER}`, display: "flex", justifyContent: "space-between", alignItems: "center", position: "sticky", top: 0, background: "#fff" }}>
          <span style={{ fontSize: 15, fontWeight: 700, color: NAVY }}>New Group</span>
          <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 18, color: MUTED, cursor: "pointer" }}>✕</button>
        </div>
        <div style={{ padding: 24, display: "flex", flexDirection: "column", gap: 14 }}>
          <Field label="Group Name"><input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Cohort Study Group" style={input} autoFocus /></Field>
          <Field label={`Invite Participants (${selected.size} selected)`}>
            {peers.length === 0 ? (
              <div style={{ padding: 14, border: `1px solid ${BORDER}`, borderRadius: 8 }}><SoftEmpty label="No other participants in your programs yet." /></div>
            ) : (
              <div style={{ maxHeight: 260, overflowY: "auto", border: `1px solid ${BORDER}`, borderRadius: 8 }}>
                {byProgram.map(([pid, group]) => {
                  const disabled = activeProgramId !== null && activeProgramId !== pid;
                  return (
                    <div key={pid}>
                      <div style={{ ...microLabel, padding: "8px 12px 4px", background: PAGE }}>{group.program}</div>
                      {group.peers.map((p) => (
                        <label key={p.user_id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 12px", borderBottom: `1px solid ${BORDER}`, cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.4 : 1 }}>
                          <input type="checkbox" checked={selected.has(p.user_id)} disabled={disabled} onChange={() => toggle(p)} />
                          <Avatar name={p.name} accent={ORANGE} />
                          <div style={{ minWidth: 0 }}>
                            <div style={{ fontSize: 12.5, color: NAVY, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.name}</div>
                            {p.email && <div style={{ fontSize: 10.5, color: MUTED, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.email}</div>}
                          </div>
                        </label>
                      ))}
                    </div>
                  );
                })}
              </div>
            )}
          </Field>
        </div>
        <div style={{ padding: "14px 24px", borderTop: `1px solid ${BORDER}`, display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <button onClick={onClose} style={{ ...smallBtn, padding: "9px 18px" }}>Cancel</button>
          <button onClick={create} disabled={creating || !name.trim() || !activeProgramId} style={{ ...primaryBtn, opacity: creating || !name.trim() || !activeProgramId ? 0.6 : 1 }}>{creating ? "Creating…" : "Create Group"}</button>
        </div>
      </div>
    </div>,
    document.body
  );
}

function InviteToGroupModal({ groupId, programId, existingMemberIds, onClose, onInvited }: {
  groupId: string; programId: string; existingMemberIds: string[]; onClose: () => void; onInvited: () => void;
}) {
  const [peers, setPeers] = useState<ContactDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [inviting, setInviting] = useState(false);
  const existing = new Set(existingMemberIds);

  useEffect(() => {
    let cancelled = false;
    discussionsApi.listDMContacts(programId).then((res) => {
      if (cancelled) return;
      setPeers((res.data ?? []).filter((c) => c.role === "participant" && !existing.has(c.user_id)));
    }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [programId]);

  function toggle(id: string) {
    setSelected((prev) => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next; });
  }

  async function invite() {
    if (selected.size === 0) return;
    setInviting(true);
    try {
      await discussionsApi.inviteToDMGroup(groupId, Array.from(selected));
      onInvited();
    } finally {
      setInviting(false);
    }
  }

  if (typeof document === "undefined") return null;
  return ReactDOM.createPortal(
    <div onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{ position: "fixed", inset: 0, background: "rgba(24, 40, 72,0.5)", zIndex: 2000, display: "flex", alignItems: "center", justifyContent: "center", padding: 24, fontFamily: "Poppins, sans-serif" }}>
      <div style={{ background: "#fff", borderRadius: 16, width: "100%", maxWidth: 440, maxHeight: "88vh", overflowY: "auto", boxShadow: "0 24px 64px rgba(24, 40, 72,0.22)" }}>
        <div style={{ padding: "18px 24px", borderBottom: `1px solid ${BORDER}`, display: "flex", justifyContent: "space-between", alignItems: "center", position: "sticky", top: 0, background: "#fff" }}>
          <span style={{ fontSize: 15, fontWeight: 700, color: NAVY }}>Invite to Group</span>
          <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 18, color: MUTED, cursor: "pointer" }}>✕</button>
        </div>
        <div style={{ padding: 24 }}>
          {loading && <SoftEmpty label="Loading…" />}
          {!loading && (
            <div style={{ maxHeight: 260, overflowY: "auto", border: `1px solid ${BORDER}`, borderRadius: 8 }}>
              {peers.length === 0 && <div style={{ padding: 14 }}><SoftEmpty label="Everyone in this program is already in the group." /></div>}
              {peers.map((p) => (
                <label key={p.user_id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 12px", borderBottom: `1px solid ${BORDER}`, cursor: "pointer" }}>
                  <input type="checkbox" checked={selected.has(p.user_id)} onChange={() => toggle(p.user_id)} />
                  <Avatar name={p.name} accent={ORANGE} />
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 12.5, color: NAVY, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.name}</div>
                    {p.email && <div style={{ fontSize: 10.5, color: MUTED, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.email}</div>}
                  </div>
                </label>
              ))}
            </div>
          )}
        </div>
        <div style={{ padding: "14px 24px", borderTop: `1px solid ${BORDER}`, display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <button onClick={onClose} style={{ ...smallBtn, padding: "9px 18px" }}>Cancel</button>
          <button onClick={invite} disabled={inviting || selected.size === 0} style={{ ...primaryBtn, opacity: inviting || selected.size === 0 ? 0.6 : 1 }}>{inviting ? "Inviting…" : "Invite"}</button>
        </div>
      </div>
    </div>,
    document.body
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
  const cm = CAT_META[thread.category] ?? { bg: "rgba(74, 85, 115,0.12)", color: MUTED };
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
                  <button onClick={onTogglePin} style={{ ...smallBtn, color: thread.is_pinned ? ORANGE : MUTED, background: thread.is_pinned ? "rgba(200, 168, 96,0.06)" : "#fff" }}>{thread.is_pinned ? "Unpin" : "📌 Pin"}</button>
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
      style={{ position: "fixed", inset: 0, background: "rgba(24, 40, 72,0.5)", zIndex: 2000, display: "flex", alignItems: "center", justifyContent: "center", padding: 24, fontFamily: "Poppins, sans-serif" }}>
      <div style={{ background: "#fff", borderRadius: 16, width: "100%", maxWidth: 520, maxHeight: "88vh", overflowY: "auto", boxShadow: "0 24px 64px rgba(24, 40, 72,0.22)" }}>
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
                const cm = CAT_META[c] ?? { bg: "rgba(74, 85, 115,0.12)", color: MUTED };
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
function UnreadBadge({ count }: { count: number }) {
  return (
    <span style={{
      background: ORANGE, color: "#fff", fontSize: 10, fontWeight: 700, lineHeight: 1,
      borderRadius: 20, minWidth: 16, height: 16, padding: "0 5px",
      display: "flex", alignItems: "center", justifyContent: "center",
    }}>
      {count > 99 ? "99+" : count}
    </span>
  );
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

const ff = { fontFamily: "Poppins, sans-serif" } as const;
const primaryBtn: CSSProperties = { padding: "9px 20px", background: ORANGE, border: "none", borderRadius: 8, color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "Poppins, sans-serif", whiteSpace: "nowrap" };
const smallBtn: CSSProperties = { fontSize: 11, fontWeight: 600, padding: "5px 12px", borderRadius: 7, border: `1.5px solid ${BORDER}`, background: "#fff", cursor: "pointer", fontFamily: "Poppins, sans-serif" };
const pill: CSSProperties = { padding: "8px 18px", border: `1.5px solid ${BORDER}`, borderRadius: 20, background: "#fff", color: MUTED, fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "Poppins, sans-serif" };
const pillActive: CSSProperties = { background: "rgba(200, 168, 96,0.08)", color: ORANGE, border: `1.5px solid ${ORANGE}`, fontWeight: 700 };
const filterPill: CSSProperties = { padding: "6px 14px", border: `1px solid ${BORDER}`, borderRadius: 20, background: "#fff", color: MUTED, fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: "Poppins, sans-serif" };
const filterPillActive: CSSProperties = { background: "rgba(200, 168, 96,0.08)", color: ORANGE, border: `1px solid ${ORANGE}`, fontWeight: 700 };
const input: CSSProperties = { width: "100%", border: `1px solid ${BORDER}`, borderRadius: 8, padding: "9px 12px", fontSize: 13, color: NAVY, fontFamily: "Poppins, sans-serif", outline: "none", boxSizing: "border-box" };
const textarea: CSSProperties = { ...input, resize: "vertical", lineHeight: 1.6 };
const microLabel: CSSProperties = { fontSize: 10, fontWeight: 700, color: MUTED, letterSpacing: 0.5, textTransform: "uppercase", display: "block", marginBottom: 6 };
const tagChip: CSSProperties = { fontSize: 10, fontWeight: 500, background: "#F7F5F0", color: MUTED, padding: "3px 9px", borderRadius: 20 };
const pinnedChip: CSSProperties = { fontSize: 9, fontWeight: 700, background: "rgba(200, 168, 96,0.1)", color: ORANGE, padding: "2px 8px", borderRadius: 20, letterSpacing: 0.5 };
const youChip: CSSProperties = { fontSize: 9, fontWeight: 700, background: "rgba(200, 168, 96,0.12)", color: ORANGE, padding: "2px 7px", borderRadius: 20, letterSpacing: 0.5 };
