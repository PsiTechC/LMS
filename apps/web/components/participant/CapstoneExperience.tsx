"use client";

import { useCallback, useEffect, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import { capstoneApi, MyCapstoneDTO, TeamMemberDTO, TeamFileDTO, PeerAssignmentDTO, PanelFeedbackDTO } from "@/lib/capstone-api";

const NAVY = "#1C2551";
const ORANGE = "#EF4E24";
const INDIGO = "#6B73BF";
const GREEN = "#22c55e";
const AMBER = "#f59e0b";
const PAGE = "#F5F7FB";
const BORDER = "#EAECF4";
const MUTED = "#8b90a7";
const SHADOW = "0 1px 4px rgba(28,37,81,0.07)";

type Tab = "overview" | "team" | "peer" | "panel";

const MEMBER_COLORS = [ORANGE, NAVY, INDIGO, GREEN, AMBER];

export default function CapstoneExperience() {
  const [data, setData] = useState<MyCapstoneDTO | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>("overview");

  const load = useCallback(async () => {
    try {
      const res = await capstoneApi.my();
      setData(res.data);
    } catch {
      setData(null);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    void Promise.resolve().then(() => {
      if (cancelled) return;
      setLoading(true);
      load().finally(() => { if (!cancelled) setLoading(false); });
    });
    return () => { cancelled = true; };
  }, [load]);

  if (loading) return <Page><SoftEmpty label="Loading your capstone..." /></Page>;

  if (!data?.has_team) {
    return (
      <Page>
        <EmptyCard title="Capstone team not assigned yet" body="Once your Program Manager places you in a capstone team, your project brief, team workspace, peer reviews, and panel feedback will appear here." />
      </Page>
    );
  }

  const submitted = data.submission_status === "submitted";
  const progressPct = computeProgress(data);
  const TABS: [Tab, string][] = [["overview", "My Capstone"], ["team", "Team Workspace"], ["peer", "Peer Review"], ["panel", "Panel Feedback"]];

  return (
    <Page>
      {/* Status banner */}
      <div style={{ background: "linear-gradient(135deg,#1C2551,#2d3a7c)", borderRadius: 14, padding: "20px 24px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 20 }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.5)", letterSpacing: 0.5, marginBottom: 6 }}>✦ CAPSTONE &amp; ACTION LEARNING</div>
          <div style={{ fontSize: 18, fontWeight: 800, color: "#fff", marginBottom: 4 }}>{data.title || "Capstone Project"}</div>
          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.6)" }}>
            {[data.program_name, submitted ? "Submitted ✓" : data.deadline ? `Due ${formatDate(data.deadline)}` : "In progress"].filter(Boolean).join(" · ")}
          </div>
        </div>
        <div style={{ textAlign: "center", flexShrink: 0 }}>
          <div style={{ fontSize: 32, fontWeight: 800, color: submitted ? "#4ade80" : ORANGE }}>{progressPct}%</div>
          <div style={{ fontSize: 10, color: "rgba(255,255,255,0.5)" }}>Overall Progress</div>
          <div style={{ height: 5, width: 120, background: "rgba(255,255,255,0.1)", borderRadius: 99, marginTop: 6 }}>
            <div style={{ height: "100%", width: `${progressPct}%`, background: submitted ? "#4ade80" : ORANGE, borderRadius: 99 }} />
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 4 }}>
        {TABS.map(([key, label]) => (
          <button key={key} onClick={() => setTab(key)} style={{ ...tabStyle, ...(tab === key ? tabActiveStyle : {}) }}>{label}</button>
        ))}
      </div>

      {tab === "overview" && <OverviewTab data={data} onChange={setData} />}
      {tab === "team" && <TeamTab data={data} onChange={setData} />}
      {tab === "peer" && <PeerTab data={data} onChange={setData} />}
      {tab === "panel" && <PanelTab data={data} />}
    </Page>
  );
}

// ── My Capstone tab ───────────────────────────────────────────────────────────
function OverviewTab({ data, onChange }: { data: MyCapstoneDTO; onChange: (d: MyCapstoneDTO) => void }) {
  const [url, setUrl] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const submitted = data.submission_status === "submitted";

  // Each item derives from real tracked state (no hardcoded checkmarks).
  const peerDone = data.peer_assignments.length > 0 && data.peer_assignments.every((p) => p.reviewed);
  const checklist: [string, boolean][] = [
    ["Team assigned", data.has_team],
    ["Brief reviewed", !briefIsEmpty(data)],
    ["Draft shared in workspace", data.files.length > 0],
    ["Final submission", submitted],
    ["Peer review completed", peerDone],
    ["Panel feedback received", data.panel_released],
  ];

  async function submit() {
    if (!url.trim()) { setError("Add an upload link or video URL."); return; }
    setBusy(true); setError("");
    try {
      const res = await capstoneApi.submit({ file_url: url.trim(), file_name: name.trim() || "Capstone Submission" });
      onChange(res.data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Submission failed");
    } finally { setBusy(false); }
  }

  return (
    <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) 320px", gap: 16 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <Card>
          <SectionTitle title="Project Brief" />
          {briefIsEmpty(data) ? (
            <div style={{ padding: "18px 16px", background: "#F9FAFB", border: `1px dashed ${BORDER}`, borderRadius: 10 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: NAVY, marginBottom: 4 }}>Brief not published yet</div>
              <div style={{ fontSize: 11, color: MUTED, lineHeight: 1.6 }}>Your Program Manager or faculty will publish the capstone brief — objective, format, audience, and evaluation criteria. It will appear here.</div>
            </div>
          ) : (
            <>
              {data.description && <div style={{ fontSize: 13, color: "#4a5074", lineHeight: 1.7, marginBottom: 14 }}>{data.description}</div>}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                {([["Format", data.format], ["Audience", data.audience], ["Evaluation", data.evaluation], ["Deadline", data.deadline ? formatDate(data.deadline) : undefined]] as [string, string | undefined][])
                  .filter(([, v]) => !!v)
                  .map(([k, v]) => (
                    <div key={k} style={{ padding: "10px 12px", background: "#F5F7FB", borderRadius: 8 }}>
                      <div style={{ fontSize: 10, fontWeight: 700, color: MUTED, letterSpacing: 0.5, marginBottom: 3, textTransform: "uppercase" }}>{k}</div>
                      <div style={{ fontSize: 12, color: NAVY, fontWeight: 600 }}>{v}</div>
                    </div>
                  ))}
              </div>
            </>
          )}
        </Card>

        <Card>
          <SectionTitle title="Project Submission" />
          {submitted ? (
            <div style={{ padding: 20, background: "rgba(34,197,94,0.06)", border: "1px solid rgba(34,197,94,0.2)", borderRadius: 12, textAlign: "center" }}>
              <div style={{ fontSize: 28, marginBottom: 8 }}>✅</div>
              <div style={{ fontSize: 14, fontWeight: 700, color: GREEN, marginBottom: 4 }}>Submission Received</div>
              <div style={{ fontSize: 12, color: MUTED }}>{data.file_name}</div>
              {data.submitted_at && <div style={{ fontSize: 11, color: MUTED, marginTop: 4 }}>Submitted {formatDate(data.submitted_at)}</div>}
              {data.file_url && <a href={data.file_url} target="_blank" rel="noreferrer" style={{ ...secondaryButton, display: "inline-block", marginTop: 12, textDecoration: "none" }}>View Submission</a>}
              <div style={{ marginTop: 12 }}>
                <button onClick={() => onChange({ ...data, submission_status: "not_submitted" })} style={{ ...linkButton }}>Replace submission</button>
              </div>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <div style={{ border: `2px dashed #D0D3E0`, borderRadius: 12, padding: 24, textAlign: "center", background: "#FAFBFC" }}>
                <div style={{ fontSize: 26, marginBottom: 8, opacity: 0.4 }}>☁</div>
                <div style={{ fontSize: 13, fontWeight: 600, color: NAVY, marginBottom: 4 }}>Add your submission</div>
                <div style={{ fontSize: 11, color: MUTED }}>PPTX, PDF, or video link</div>
              </div>
              <Field label="File name"><input value={name} onChange={(e) => setName(e.target.value)} placeholder="Board Presentation.pptx" style={inputStyle} /></Field>
              <Field label="Link / URL"><input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://..." style={inputStyle} /></Field>
              {error && <div style={{ color: "#ef4444", fontSize: 12, fontWeight: 600 }}>{error}</div>}
              <button onClick={submit} disabled={busy} style={{ ...primaryButton, opacity: busy ? 0.7 : 1 }}>{busy ? "Submitting..." : "Submit Capstone →"}</button>
            </div>
          )}
        </Card>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <Card>
          <SectionTitle title="Checklist" />
          {checklist.map(([item, done]) => (
            <div key={item} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderBottom: "1px solid #F5F7FB" }}>
              <div style={{ width: 18, height: 18, borderRadius: "50%", border: `2px solid ${done ? GREEN : "#D0D3E0"}`, background: done ? GREEN : "transparent", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                {done && <span style={{ color: "#fff", fontSize: 10, fontWeight: 700 }}>✓</span>}
              </div>
              <span style={{ fontSize: 12, color: done ? NAVY : MUTED }}>{item}</span>
            </div>
          ))}
        </Card>
        <Card style={{ background: "rgba(239,78,36,0.04)", border: "1px solid rgba(239,78,36,0.15)" }}>
          <div style={{ fontSize: 11, fontWeight: 800, color: ORANGE, marginBottom: 8 }}>✦ AI Feedback Preview</div>
          <div style={{ fontSize: 12, color: NAVY, lineHeight: 1.7 }}>
            {data.ai_feedback ? data.ai_feedback : "Submit a draft to get AI-assisted feedback and improvement suggestions before your final panel presentation."}
          </div>
        </Card>
      </div>
    </div>
  );
}

// ── Team Workspace tab ────────────────────────────────────────────────────────
function TeamTab({ data, onChange }: { data: MyCapstoneDTO; onChange: (d: MyCapstoneDTO) => void }) {
  const [addOpen, setAddOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);

  async function addFile() {
    if (!title.trim() || !url.trim()) return;
    setBusy(true);
    try {
      const res = await capstoneApi.addFile({ title: title.trim(), file_url: url.trim() });
      onChange(res.data);
      setTitle(""); setUrl(""); setAddOpen(false);
    } finally { setBusy(false); }
  }

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
      <Card>
        <SectionTitle title={`${data.team_name} — Members`} />
        {data.members.map((m, i) => <MemberRow key={m.user_id} member={m} color={MEMBER_COLORS[i % MEMBER_COLORS.length]} />)}
        {data.members.length === 0 && <SoftEmpty label="No team members found." />}
        <div style={{ marginTop: 12, fontSize: 11, color: MUTED, lineHeight: 1.6 }}>
          Each member is responsible for their part of the project and updates their own status here.
        </div>
      </Card>

      <Card>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: NAVY }}>Shared Workspace</div>
          <button onClick={() => setAddOpen((o) => !o)} style={linkButton}>{addOpen ? "Cancel" : "+ Add file"}</button>
        </div>
        {addOpen && (
          <div style={{ marginBottom: 12, display: "flex", flexDirection: "column", gap: 8 }}>
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="File title" style={inputStyle} />
            <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://... (link)" style={inputStyle} />
            <button onClick={addFile} disabled={busy} style={{ ...primaryButton, opacity: busy ? 0.7 : 1 }}>{busy ? "Adding..." : "Add to workspace"}</button>
          </div>
        )}
        {data.files.map((f) => <FileRow key={f.id} file={f} />)}
        {data.files.length === 0 && <SoftEmpty label="No shared files yet. Add your deck, research notes, or plans." />}
      </Card>
    </div>
  );
}

function MemberRow({ member, color }: { member: TeamMemberDTO; color: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 0", borderBottom: `1px solid ${BORDER}` }}>
      <div style={{ width: 36, height: 36, borderRadius: "50%", background: color, color: "#fff", fontWeight: 800, fontSize: 12, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{initials(member.name)}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: NAVY }}>{member.name}{member.is_me ? " (You)" : ""}</div>
        <div style={{ fontSize: 11, color: MUTED }}>{member.department || member.email}</div>
      </div>
    </div>
  );
}

function FileRow({ file }: { file: TeamFileDTO }) {
  return (
    <div style={{ display: "flex", gap: 10, padding: "9px 0", borderBottom: `1px solid ${BORDER}`, alignItems: "center" }}>
      <span style={{ fontSize: 20 }}>📄</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: NAVY, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{file.title}</div>
        <div style={{ fontSize: 10, color: MUTED }}>{file.uploaded_by ? `by ${file.uploaded_by} · ` : ""}{formatDate(file.created_at)}</div>
      </div>
      <a href={file.file_url} target="_blank" rel="noreferrer" style={{ ...secondaryButton, padding: "4px 10px", fontSize: 10, textDecoration: "none" }}>Open</a>
    </div>
  );
}

// ── Peer Review tab ───────────────────────────────────────────────────────────
function PeerTab({ data, onChange }: { data: MyCapstoneDTO; onChange: (d: MyCapstoneDTO) => void }) {
  if (data.peer_assignments.length === 0) {
    return <EmptyCard title="No peer reviews assigned" body="Your Program Manager assigns cross-team peer reviews. When you're assigned a team to review, it appears here with a structured rubric." />;
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {data.peer_assignments.map((p) => <PeerReviewCard key={p.assignment_id} assignment={p} onSubmitted={onChange} />)}
    </div>
  );
}

function PeerReviewCard({ assignment, onSubmitted }: { assignment: PeerAssignmentDTO; onSubmitted: (d: MyCapstoneDTO) => void }) {
  const [rating, setRating] = useState(assignment.my_rating ?? 0);
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const done = assignment.reviewed;

  async function submit() {
    if (rating < 1) return;
    setBusy(true);
    try {
      const res = await capstoneApi.submitPeerReview({ assignment_id: assignment.assignment_id, rating, comment: comment.trim() });
      onSubmitted(res.data);
    } finally { setBusy(false); }
  }

  return (
    <Card>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: NAVY }}>{assignment.target_team}</div>
          {assignment.due_date && <div style={{ fontSize: 11, color: MUTED }}>Due {formatDate(assignment.due_date)}</div>}
        </div>
        <Badge label={done ? "Reviewed" : "Pending"} color={done ? GREEN : AMBER} />
      </div>
      {!done ? (
        <>
          <div style={{ fontSize: 11, fontWeight: 700, color: MUTED, letterSpacing: 0.5, marginBottom: 8, textTransform: "uppercase" }}>Rating</div>
          <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
            {[1, 2, 3, 4, 5].map((n) => (
              <button key={n} onClick={() => setRating(n)} style={{ width: 36, height: 36, border: `1.5px solid ${rating >= n ? ORANGE : BORDER}`, borderRadius: 8, background: rating >= n ? "rgba(239,78,36,0.1)" : "#fff", color: rating >= n ? ORANGE : MUTED, fontWeight: 700, cursor: "pointer", fontFamily: "Poppins, sans-serif" }}>{n}</button>
            ))}
          </div>
          <textarea value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Write constructive feedback…" style={{ width: "100%", border: `1.5px solid ${BORDER}`, borderRadius: 8, padding: "9px 12px", fontSize: 12, fontFamily: "Poppins, sans-serif", color: NAVY, outline: "none", resize: "vertical", height: 72, boxSizing: "border-box", marginBottom: 10 }} />
          <button onClick={submit} disabled={busy || rating < 1} style={{ ...primaryButton, opacity: busy || rating < 1 ? 0.6 : 1 }}>{busy ? "Submitting..." : "Submit Review"}</button>
        </>
      ) : (
        <div style={{ padding: "10px 14px", background: "rgba(34,197,94,0.06)", borderRadius: 8, fontSize: 12, color: GREEN, fontWeight: 600 }}>✓ Review submitted{assignment.my_rating ? ` · rated ${assignment.my_rating}/5` : ""}</div>
      )}
    </Card>
  );
}

// ── Panel Feedback tab ────────────────────────────────────────────────────────
function PanelTab({ data }: { data: MyCapstoneDTO }) {
  if (!data.panel_released) {
    return (
      <Card style={{ textAlign: "center", padding: "48px 24px" }}>
        <div style={{ fontSize: 36, marginBottom: 12, opacity: 0.3 }}>🏛</div>
        <div style={{ fontSize: 14, fontWeight: 700, color: NAVY, marginBottom: 6 }}>Panel Review Not Yet Released</div>
        <div style={{ fontSize: 12, color: MUTED }}>Panel scores and feedback are released after your presentation day. They will appear here once your faculty panel completes the review.</div>
      </Card>
    );
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {data.panel_avg != null && (
        <Card style={{ textAlign: "center" }}>
          <div style={{ fontSize: 11, color: MUTED, marginBottom: 6 }}>Overall Panel Score</div>
          <div style={{ fontSize: 28, fontWeight: 800, color: ORANGE }}>{data.panel_avg} / 5</div>
        </Card>
      )}
      {data.panel.map((f, i) => <PanelCard key={i} feedback={f} />)}
      {data.panel.length === 0 && <SoftEmpty label="No panel feedback recorded." />}
    </div>
  );
}

function PanelCard({ feedback }: { feedback: PanelFeedbackDTO }) {
  return (
    <Card>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
        <div style={{ width: 40, height: 40, borderRadius: "50%", background: INDIGO, color: "#fff", fontWeight: 800, fontSize: 12, display: "flex", alignItems: "center", justifyContent: "center" }}>{initials(feedback.panelist_name)}</div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: NAVY }}>{feedback.panelist_name}</div>
          <div style={{ fontSize: 11, color: MUTED }}>{feedback.panelist_role || "Panelist"} · {formatDate(feedback.created_at)}</div>
        </div>
        <div style={{ display: "flex", gap: 2 }}>{[1, 2, 3, 4, 5].map((j) => <span key={j} style={{ color: j <= feedback.rating ? "#f59e0b" : "#E0E3EF", fontSize: 14 }}>★</span>)}</div>
      </div>
      {feedback.comment && <div style={{ fontSize: 13, color: NAVY, lineHeight: 1.7, background: "#F5F7FB", borderRadius: 10, padding: "12px 14px", fontStyle: "italic" }}>&ldquo;{feedback.comment}&rdquo;</div>}
    </Card>
  );
}

// ── helpers ───────────────────────────────────────────────────────────────────
// computeProgress mirrors the 6 checklist milestones — all from real state.
function computeProgress(d: MyCapstoneDTO): number {
  const milestones = [
    d.has_team,
    !briefIsEmpty(d),
    d.files.length > 0,
    d.submission_status === "submitted",
    d.peer_assignments.length > 0 && d.peer_assignments.every((p) => p.reviewed),
    d.panel_released,
  ];
  const done = milestones.filter(Boolean).length;
  return Math.round((done / milestones.length) * 100);
}

// briefIsEmpty is true when no brief config has been published for the capstone.
function briefIsEmpty(d: MyCapstoneDTO): boolean {
  return !d.description && !d.format && !d.audience && !d.evaluation && !d.deadline;
}

function Page({ children }: { children: ReactNode }) {
  return <div style={{ padding: 24, display: "flex", flexDirection: "column", gap: 16, fontFamily: "Poppins, sans-serif", background: PAGE }}>{children}</div>;
}
function Card({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return <div style={{ background: "#fff", borderRadius: 12, border: `1px solid ${BORDER}`, boxShadow: SHADOW, padding: 20, ...style }}>{children}</div>;
}
function SectionTitle({ title }: { title: string }) {
  return <div style={{ fontSize: 14, fontWeight: 700, color: NAVY, marginBottom: 14 }}>{title}</div>;
}
function Badge({ label, color = ORANGE }: { label: string; color?: string }) {
  return <span style={{ background: `${color}14`, color, fontSize: 10, fontWeight: 700, borderRadius: 20, padding: "3px 9px", whiteSpace: "nowrap" }}>{label}</span>;
}
function Field({ label, children }: { label: string; children: ReactNode }) {
  return <div><label style={{ fontSize: 10, fontWeight: 700, color: MUTED, letterSpacing: 0.5, display: "block", marginBottom: 5, textTransform: "uppercase" }}>{label}</label>{children}</div>;
}
function SoftEmpty({ label }: { label: string }) {
  return <div style={{ padding: "20px 0", textAlign: "center", color: MUTED, fontSize: 12 }}>{label}</div>;
}
function EmptyCard({ title, body }: { title: string; body: string }) {
  return (
    <Card style={{ padding: 48, textAlign: "center" }}>
      <div style={{ fontSize: 16, fontWeight: 800, color: NAVY, marginBottom: 8 }}>{title}</div>
      <div style={{ fontSize: 13, color: MUTED, lineHeight: 1.65, maxWidth: 480, margin: "0 auto" }}>{body}</div>
    </Card>
  );
}

function initials(name: string) { return name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase(); }
function formatDate(iso: string) { return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }); }

const tabStyle: CSSProperties = { padding: "8px 18px", border: `1.5px solid ${BORDER}`, borderRadius: 20, background: "#fff", color: MUTED, fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "Poppins, sans-serif" };
const tabActiveStyle: CSSProperties = { background: "rgba(239,78,36,0.08)", color: ORANGE, border: `1.5px solid ${ORANGE}`, fontWeight: 700 };
const primaryButton: CSSProperties = { padding: "10px 20px", background: ORANGE, border: "none", borderRadius: 8, color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "Poppins, sans-serif" };
const secondaryButton: CSSProperties = { padding: "8px 16px", border: `1px solid ${BORDER}`, borderRadius: 8, background: "#fff", color: NAVY, fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "Poppins, sans-serif" };
const linkButton: CSSProperties = { fontSize: 11, color: ORANGE, background: "none", border: "none", cursor: "pointer", fontFamily: "Poppins, sans-serif", fontWeight: 700, padding: 0 };
const inputStyle: CSSProperties = { width: "100%", border: `1.5px solid ${BORDER}`, borderRadius: 8, padding: "8px 10px", fontSize: 12, fontFamily: "Poppins, sans-serif", color: NAVY, outline: "none", boxSizing: "border-box" };
