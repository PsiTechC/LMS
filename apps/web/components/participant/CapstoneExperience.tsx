"use client";

import { useCallback, useEffect, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import { capstoneApi, MyCapstoneDTO, TeamMemberDTO, TeamFileDTO } from "@/lib/capstone-api";
import { uploadFile, fetchFileBlob } from "@/lib/faculty-api";

const NAVY = "#182848";
const ORANGE = "#C8A860";
const INDIGO = "#4A5573";
const GREEN = "#22c55e";
const AMBER = "#f59e0b";
const PAGE = "#F7F5F0";
const BORDER = "#E6DED0";
const MUTED = "#4A5573";
const SHADOW = "0 1px 4px rgba(24, 40, 72,0.07)";

type Tab = "overview" | "team";

const MEMBER_COLORS = [ORANGE, NAVY, INDIGO, GREEN, AMBER];

export default function CapstoneExperience({ programId }: { programId?: string }) {
  const [data, setData] = useState<MyCapstoneDTO | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>("overview");

  const load = useCallback(async () => {
    try {
      const res = await capstoneApi.my(programId);
      setData(res.data);
    } catch {
      setData(null);
    }
  }, [programId]);

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
        <EmptyCard title="Capstone not assigned yet" body="Once your Program Manager or faculty assigns your capstone, the project brief, workspace, and submission will appear here." />
      </Page>
    );
  }

  const submitted = data.submission_status === "submitted";
  const progressPct = computeProgress(data);
  const TABS: [Tab, string][] = data.is_individual
    ? [["overview", "My Capstone"], ["team", "My Workspace"]]
    : [["overview", "My Capstone"], ["team", "Team Workspace"]];

  return (
    <Page>
      {/* Status banner */}
      <div style={{ background: "linear-gradient(135deg,#182848,#2d3a7c)", borderRadius: 14, padding: "20px 24px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 20 }}>
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

      {tab === "overview" && <OverviewTab data={data} onChange={setData} programId={programId} />}
      {tab === "team" && <TeamTab data={data} onChange={setData} programId={programId} />}
    </Page>
  );
}

// ── My Capstone tab ───────────────────────────────────────────────────────────
function OverviewTab({ data, onChange, programId }: { data: MyCapstoneDTO; onChange: (d: MyCapstoneDTO) => void; programId?: string }) {
  const submitted = data.submission_status === "submitted";
  const teamLabel = data.is_individual ? "Assigned" : "Team assigned";

  // Each item derives from real tracked state (no hardcoded checkmarks).
  const checklist: [string, boolean][] = [
    [teamLabel, data.has_team],
    ["Brief reviewed", !briefIsEmpty(data)],
    ["Draft shared in workspace", data.files.length > 0],
    ["Final submission", submitted],
    ["Graded", data.grade_released],
    ["Complete", data.completion_status === "complete"],
  ];

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
              {data.theme && <div style={{ fontSize: 11, fontWeight: 700, color: INDIGO, marginBottom: 8 }}>Theme: {data.theme}</div>}
              {(data.problem_statement || data.description) && <div style={{ fontSize: 13, color: "#4a5074", lineHeight: 1.7, marginBottom: 12, whiteSpace: "pre-wrap" }}>{data.problem_statement || data.description}</div>}
              {data.objectives && (
                <div style={{ marginBottom: 12 }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: MUTED, letterSpacing: 0.5, marginBottom: 4, textTransform: "uppercase" }}>Objectives</div>
                  <div style={{ fontSize: 12, color: NAVY, lineHeight: 1.7, whiteSpace: "pre-wrap" }}>{data.objectives}</div>
                </div>
              )}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 12 }}>
                {([["Format", (data.deliverable_format && data.deliverable_format.length ? data.deliverable_format.join(", ") : data.format)],
                   ["Deadline", data.deadline ? formatDate(data.deadline) : undefined],
                   ["Team", data.is_individual ? "Individual" : (data.team_structure || "Group")],
                   ["Passing", data.passing_threshold != null ? `≥ ${data.passing_threshold}/10` : undefined]] as [string, string | undefined][])
                  .filter(([, v]) => !!v)
                  .map(([k, v]) => (
                    <div key={k} style={{ padding: "10px 12px", background: "#F7F5F0", borderRadius: 8 }}>
                      <div style={{ fontSize: 10, fontWeight: 700, color: MUTED, letterSpacing: 0.5, marginBottom: 3, textTransform: "uppercase" }}>{k}</div>
                      <div style={{ fontSize: 12, color: NAVY, fontWeight: 600 }}>{v}</div>
                    </div>
                  ))}
              </div>
              {data.rubric && data.rubric.length > 0 && (
                <div style={{ marginBottom: 12 }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: MUTED, letterSpacing: 0.5, marginBottom: 6, textTransform: "uppercase" }}>Evaluation Rubric</div>
                  {data.rubric.map((r, i) => (
                    <div key={i} style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: NAVY, padding: "5px 0", borderBottom: `1px solid #F7F5F0` }}>
                      <span>{r.criterion}</span><span style={{ fontWeight: 700, color: INDIGO }}>{r.weight}%</span>
                    </div>
                  ))}
                </div>
              )}
              {data.resources && data.resources.length > 0 && (
                <div>
                  <div style={{ fontSize: 10, fontWeight: 700, color: MUTED, letterSpacing: 0.5, marginBottom: 6, textTransform: "uppercase" }}>Resources</div>
                  {data.resources.map((r, i) => (
                    <a key={i} href={r.url} target="_blank" rel="noreferrer" style={{ display: "block", fontSize: 12, color: ORANGE, fontWeight: 600, padding: "3px 0", textDecoration: "none" }}>↗ {r.title}</a>
                  ))}
                </div>
              )}
            </>
          )}
        </Card>

        {/* Milestones */}
        {data.milestones && data.milestones.length > 0 && (
          <Card>
            <SectionTitle title="Milestones" />
            {data.milestones.map((m) => {
              const c = m.status === "done" ? GREEN : m.status === "overdue" ? "#ef4444" : m.status === "open" ? ORANGE : MUTED;
              return (
                <div key={m.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "9px 0", borderBottom: `1px solid ${BORDER}` }}>
                  <div style={{ width: 8, height: 8, borderRadius: "50%", background: c, flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: NAVY }}>{m.title}</div>
                    {m.due_date && <div style={{ fontSize: 11, color: MUTED }}>Due {formatDate(m.due_date)}</div>}
                  </div>
                  <Badge label={m.status} color={c} />
                </div>
              );
            })}
          </Card>
        )}

        {/* Released grade + completion */}
        {data.grade_released && data.my_grade && (
          <Card style={{ background: data.completion_status === "complete" ? "rgba(34,197,94,0.04)" : "#fff", border: `1px solid ${data.completion_status === "complete" ? "rgba(34,197,94,0.25)" : BORDER}` }}>
            <SectionTitle title="Your Result" />
            <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 12 }}>
              <div style={{ fontSize: 30, fontWeight: 800, color: data.completion_status === "complete" ? GREEN : ORANGE }}>{data.my_grade.score}<span style={{ fontSize: 16, color: MUTED }}>/10</span></div>
              <div>
                <Badge label={data.completion_status === "complete" ? "✓ Complete" : "Not passed"} color={data.completion_status === "complete" ? GREEN : AMBER} />
                <div style={{ fontSize: 11, color: MUTED, marginTop: 4 }}>{data.my_grade.is_individual ? "Individual grade" : "Team grade"}</div>
              </div>
            </div>
            {data.my_grade.per_criterion && data.my_grade.per_criterion.length > 0 && (
              <div style={{ marginBottom: 10 }}>
                {data.my_grade.per_criterion.map((p, i) => (
                  <div key={i} style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: NAVY, padding: "4px 0" }}>
                    <span>{p.criterion}</span><span style={{ fontWeight: 700 }}>{p.score}/10</span>
                  </div>
                ))}
              </div>
            )}
            {data.my_grade.comments && <div style={{ fontSize: 12, color: NAVY, lineHeight: 1.6, background: "#F7F5F0", borderRadius: 8, padding: "10px 12px", fontStyle: "italic" }}>&ldquo;{data.my_grade.comments}&rdquo;</div>}
          </Card>
        )}

        <SubmissionCard data={data} onChange={onChange} programId={programId} />
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <Card>
          <SectionTitle title="Progress" />
          {checklist.map(([item, done]) => (
            <div key={item} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderBottom: "1px solid #F7F5F0" }}>
              <div style={{ width: 18, height: 18, borderRadius: "50%", border: `2px solid ${done ? GREEN : "#C9BFA8"}`, background: done ? GREEN : "transparent", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                {done && <span style={{ color: "#fff", fontSize: 10, fontWeight: 700 }}>✓</span>}
              </div>
              <span style={{ fontSize: 12, color: done ? NAVY : MUTED }}>{item}</span>
            </div>
          ))}
        </Card>

        {/* Reference materials from faculty */}
        {data.reference_files && data.reference_files.length > 0 && (
          <Card>
            <SectionTitle title="Reference Materials" />
            {data.reference_files.map((r, i) => <DownloadRow key={i} title={r.title} contentId={r.content_id} />)}
          </Card>
        )}
      </div>
    </div>
  );
}

// ── Project Submission card (real file upload via /uploads content store) ──────
function SubmissionCard({ data, onChange, programId }: { data: MyCapstoneDTO; onChange: (d: MyCapstoneDTO) => void; programId?: string }) {
  const submitted = data.submission_status === "submitted";
  const graded = data.grade_released;
  const [file, setFile] = useState<File | null>(null);
  const [name, setName] = useState("");
  const [uploading, setUploading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [replacing, setReplacing] = useState(false);

  function pick(f: File) { setFile(f); if (!name.trim()) setName(f.name); }

  async function submit() {
    if (!file) { setError("Choose a file to upload."); return; }
    setError(""); setUploading(true);
    try {
      const up = await uploadFile(file);
      setUploading(false); setBusy(true);
      // Store the content_id in file_url (an opaque reference, not a public URL).
      const res = await capstoneApi.submit({ file_url: up.data.content_id, file_name: name.trim() || file.name }, programId);
      onChange(res.data);
      setFile(null); setName(""); setReplacing(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Submission failed");
    } finally { setUploading(false); setBusy(false); }
  }

  const showForm = !submitted || replacing;
  return (
    <Card>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
        <SectionTitle title="Final Submission" />
        {submitted && !replacing && !graded && <button onClick={() => setReplacing(true)} style={linkButton}>Replace</button>}
      </div>

      {submitted && !replacing ? (
        <div style={{ padding: 18, background: "rgba(34,197,94,0.06)", border: "1px solid rgba(34,197,94,0.2)", borderRadius: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ width: 42, height: 42, borderRadius: 10, background: "rgba(34,197,94,0.15)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, flexShrink: 0 }}>📄</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: NAVY, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{data.file_name || "Capstone Submission"}</div>
              <div style={{ fontSize: 11, color: GREEN, fontWeight: 600 }}>✓ Submitted{data.submitted_at ? ` · ${formatDate(data.submitted_at)}` : ""}</div>
            </div>
            {data.file_url && <DownloadButton contentId={data.file_url} label="View" />}
          </div>
          {graded && <div style={{ fontSize: 11, color: MUTED, marginTop: 10 }}>This capstone has been graded — the submission is locked.</div>}
        </div>
      ) : showForm ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <label style={{ cursor: "pointer" }}>
            <input type="file" style={{ display: "none" }} onChange={(e) => { const f = e.target.files?.[0]; if (f) pick(f); }} />
            <div style={{ border: `2px dashed ${file ? GREEN : "#C9BFA8"}`, borderRadius: 12, padding: 24, textAlign: "center", background: file ? "rgba(34,197,94,0.04)" : "#FAFBFC" }}>
              <div style={{ fontSize: 26, marginBottom: 8, opacity: file ? 1 : 0.4 }}>{file ? "📄" : "☁"}</div>
              <div style={{ fontSize: 13, fontWeight: 600, color: NAVY, marginBottom: 4 }}>{file ? file.name : "Click to choose a file"}</div>
              <div style={{ fontSize: 11, color: MUTED }}>{file ? `${(file.size / 1024 / 1024).toFixed(1)} MB — click to change` : "PPTX, PDF, DOCX, or video"}</div>
            </div>
          </label>
          <Field label="Title (optional)"><input value={name} onChange={(e) => setName(e.target.value)} placeholder="Board Presentation" style={inputStyle} /></Field>
          {error && <div style={{ color: "#ef4444", fontSize: 12, fontWeight: 600 }}>{error}</div>}
          <div style={{ display: "flex", gap: 8 }}>
            {replacing && <button onClick={() => { setReplacing(false); setFile(null); }} style={{ ...secondaryButton, flex: 1, justifyContent: "center" }}>Cancel</button>}
            <button onClick={submit} disabled={uploading || busy || !file} style={{ ...primaryButton, flex: 1, justifyContent: "center", opacity: uploading || busy || !file ? 0.6 : 1 }}>
              {uploading ? "Uploading…" : busy ? "Submitting…" : "Submit Capstone →"}
            </button>
          </div>
        </div>
      ) : null}
    </Card>
  );
}

// DownloadButton / DownloadRow fetch a file blob (auth) and open it — never
// exposes a raw path. Reused for the submission and reference materials.
function DownloadButton({ contentId, label }: { contentId: string; label: string }) {
  const [busy, setBusy] = useState(false);
  async function open() {
    setBusy(true);
    try { const { blobUrl } = await fetchFileBlob(contentId, "preview"); window.open(blobUrl, "_blank"); }
    catch { /* ignore */ } finally { setBusy(false); }
  }
  return <button onClick={open} disabled={busy} style={{ ...secondaryButton, padding: "6px 14px", fontSize: 11, flexShrink: 0 }}>{busy ? "…" : label}</button>;
}
function DownloadRow({ title, contentId }: { title: string; contentId: string }) {
  return (
    <div style={{ display: "flex", gap: 10, padding: "9px 0", borderBottom: `1px solid ${BORDER}`, alignItems: "center" }}>
      <span style={{ fontSize: 18 }}>📎</span>
      <div style={{ flex: 1, minWidth: 0, fontSize: 12, fontWeight: 600, color: NAVY, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{title}</div>
      <DownloadButton contentId={contentId} label="Open" />
    </div>
  );
}

// ── Team Workspace tab ────────────────────────────────────────────────────────
function TeamTab({ data, onChange, programId }: { data: MyCapstoneDTO; onChange: (d: MyCapstoneDTO) => void; programId?: string }) {
  const [addOpen, setAddOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [mode, setMode] = useState<"upload" | "link">("upload");
  const [url, setUrl] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [visibility, setVisibility] = useState<"personal" | "public">("public");
  const [busy, setBusy] = useState(false);

  async function addFile() {
    const ttl = title.trim() || file?.name || "";
    if (!ttl) return;
    setBusy(true);
    try {
      let ref = url.trim();
      if (mode === "upload") {
        if (!file) { setBusy(false); return; }
        const up = await uploadFile(file);
        ref = up.data.content_id;
      }
      if (!ref) { setBusy(false); return; }
      const res = await capstoneApi.addFile({ title: ttl, file_url: ref, visibility }, programId);
      onChange(res.data);
      setTitle(""); setUrl(""); setFile(null); setVisibility("public"); setAddOpen(false);
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
            <div style={{ display: "flex", gap: 6 }}>
              {(["upload", "link"] as const).map((m) => (
                <button key={m} onClick={() => setMode(m)} style={{
                  flex: 1, padding: "6px", borderRadius: 8, fontSize: 11, fontWeight: mode === m ? 700 : 500, cursor: "pointer", textTransform: "capitalize", fontFamily: "Poppins, sans-serif",
                  background: mode === m ? "rgba(200, 168, 96,0.08)" : "#fff", color: mode === m ? ORANGE : MUTED,
                  border: `1px solid ${mode === m ? "rgba(200, 168, 96,0.3)" : BORDER}`,
                }}>{m === "upload" ? "⬆ Upload file" : "🔗 Link"}</button>
              ))}
            </div>
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="File title" style={inputStyle} />
            {mode === "upload" ? (
              <label style={{ cursor: "pointer" }}>
                <input type="file" style={{ display: "none" }} onChange={(e) => { const f = e.target.files?.[0]; if (f) { setFile(f); if (!title.trim()) setTitle(f.name); } }} />
                <div style={{ border: `1.5px dashed ${file ? GREEN : "#C9BFA8"}`, borderRadius: 8, padding: "12px", textAlign: "center", background: file ? "rgba(34,197,94,0.04)" : "#FAFBFC", fontSize: 11, color: file ? NAVY : MUTED }}>
                  {file ? `📄 ${file.name}` : "Click to choose a file"}
                </div>
              </label>
            ) : (
              <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://... (link)" style={inputStyle} />
            )}
            {data.is_individual && (
              <div style={{ display: "flex", gap: 6 }}>
                {(["public", "personal"] as const).map((v) => (
                  <button key={v} onClick={() => setVisibility(v)} style={{
                    flex: 1, padding: "6px", borderRadius: 8, fontSize: 11, fontWeight: visibility === v ? 700 : 500, cursor: "pointer", textTransform: "capitalize",
                    fontFamily: "Poppins, sans-serif",
                    background: visibility === v ? "rgba(74, 85, 115,0.1)" : "#fff", color: visibility === v ? INDIGO : MUTED,
                    border: `1px solid ${visibility === v ? "rgba(74, 85, 115,0.3)" : BORDER}`,
                  }}>{v === "public" ? "Public" : "Personal (only me)"}</button>
                ))}
              </div>
            )}
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

// A stored file_url is either an uploaded content_id (UUID → auth download) or
// an external link (http… → open directly).
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function FileRow({ file }: { file: TeamFileDTO }) {
  const isUpload = UUID_RE.test(file.file_url);
  return (
    <div style={{ display: "flex", gap: 10, padding: "9px 0", borderBottom: `1px solid ${BORDER}`, alignItems: "center" }}>
      <span style={{ fontSize: 20 }}>{isUpload ? "📄" : "🔗"}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: NAVY, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{file.title}</div>
        <div style={{ fontSize: 10, color: MUTED }}>
          {file.uploaded_by ? `by ${file.uploaded_by} · ` : ""}{file.visibility === "personal" ? "Personal · " : ""}{formatDate(file.created_at)}
        </div>
      </div>
      {isUpload
        ? <DownloadButton contentId={file.file_url} label="Open" />
        : <a href={file.file_url} target="_blank" rel="noreferrer" style={{ ...secondaryButton, padding: "4px 10px", fontSize: 10, textDecoration: "none" }}>Open</a>}
    </div>
  );
}
function computeProgress(d: MyCapstoneDTO): number {
  const milestones = [
    d.has_team,
    !briefIsEmpty(d),
    d.files.length > 0,
    d.submission_status === "submitted",
    d.grade_released,
    d.completion_status === "complete",
  ];
  const done = milestones.filter(Boolean).length;
  return Math.round((done / milestones.length) * 100);
}

// briefIsEmpty is true when no brief config has been published for the capstone.
function briefIsEmpty(d: MyCapstoneDTO): boolean {
  return !d.description && !d.format && !d.audience && !d.evaluation && !d.deadline
    && !d.theme && !d.problem_statement && !d.objectives
    && !(d.deliverable_format && d.deliverable_format.length)
    && !(d.rubric && d.rubric.length);
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
const tabActiveStyle: CSSProperties = { background: "rgba(200, 168, 96,0.08)", color: ORANGE, border: `1.5px solid ${ORANGE}`, fontWeight: 700 };
const primaryButton: CSSProperties = { padding: "10px 20px", background: ORANGE, border: "none", borderRadius: 8, color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "Poppins, sans-serif" };
const secondaryButton: CSSProperties = { padding: "8px 16px", border: `1px solid ${BORDER}`, borderRadius: 8, background: "#fff", color: NAVY, fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "Poppins, sans-serif" };
const linkButton: CSSProperties = { fontSize: 11, color: ORANGE, background: "none", border: "none", cursor: "pointer", fontFamily: "Poppins, sans-serif", fontWeight: 700, padding: 0 };
const inputStyle: CSSProperties = { width: "100%", border: `1.5px solid ${BORDER}`, borderRadius: 8, padding: "8px 10px", fontSize: 12, fontFamily: "Poppins, sans-serif", color: NAVY, outline: "none", boxSizing: "border-box" };
