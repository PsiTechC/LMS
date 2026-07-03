"use client";

import { useCallback, useEffect, useMemo, useState, type CSSProperties, type ReactNode } from "react";
import { coachingAdminApi, CoachDTO, CoachingAdminOptionsDTO, CoachingEngagementDTO } from "@/lib/coaching-admin-api";

const C = {
  navy: "#1C2551",
  orange: "#EF4E24",
  indigo: "#6B73BF",
  page: "#F5F7FB",
  card: "#FFFFFF",
  alt: "#F0F1F7",
  border: "#EAECF4",
  muted: "#8b90a7",
  success: "#22c55e",
  warning: "#f59e0b",
};

const emptyOptions: CoachingAdminOptionsDTO = { programs: [], cohorts: [], participants: [], coaches: [] };
const frequencies = ["Weekly", "Bi-weekly", "Monthly", "As needed"];

export default function PMCoachingAdmin({ orgId }: { orgId: string }) {
  const [engagements, setEngagements] = useState<CoachingEngagementDTO[]>([]);
  const [options, setOptions] = useState<CoachingAdminOptionsDTO>(emptyOptions);
  const [coaches, setCoaches] = useState<CoachDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showInitiate, setShowInitiate] = useState(false);
  const [showEnrollCoach, setShowEnrollCoach] = useState(false);

  const load = useCallback(async () => {
    if (!orgId) return;
    setLoading(true);
    setError("");
    try {
      const [listRes, optRes, coachRes] = await Promise.all([
        coachingAdminApi.list(orgId),
        coachingAdminApi.options(orgId),
        coachingAdminApi.coaches(orgId),
      ]);
      setEngagements(listRes.data ?? []);
      setOptions(optRes.data ?? emptyOptions);
      setCoaches(coachRes.data ?? []);
    } catch (e) {
      setError((e as Error).message || "Failed to load coaching admin data");
    } finally {
      setLoading(false);
    }
  }, [orgId]);

  useEffect(() => {
    void Promise.resolve().then(load);
  }, [load]);

  const stats = useMemo(() => [
    { label: "Total Engagements", value: engagements.length, color: C.navy, icon: "◈" },
    { label: "Active", value: engagements.filter(e => e.status === "active").length, color: C.success, icon: "◉" },
    { label: "Scheduled", value: engagements.filter(e => e.status === "scheduled").length, color: C.warning, icon: "◎" },
    { label: "Completed", value: engagements.filter(e => e.status === "completed").length, color: C.indigo, icon: "✦" },
  ], [engagements]);

  return (
    <div style={styles.page}>
      <div style={styles.topRow}>
        <div style={{ fontSize: 13, color: C.muted }}>Manage all coaching assignments across your programs</div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button onClick={() => setShowEnrollCoach(true)} style={styles.ghostBtn}>+ Enroll Coach</button>
          <button onClick={() => setShowInitiate(true)} style={{ ...styles.primaryBtn, background: C.navy }}>+ Initiate Coaching Assignment</button>
        </div>
      </div>

      {error && <div style={styles.error}>{error}</div>}

      <div style={styles.statGrid}>
        {stats.map(s => (
          <div key={s.label} style={styles.statCard}>
            <div style={{ fontSize: 11, color: C.muted, marginBottom: 8 }}>{s.label}</div>
            <div style={{ fontSize: 28, fontWeight: 800, color: s.color }}>{loading ? "-" : s.value}</div>
            <div style={{ fontSize: 18, opacity: 0.38, marginTop: 4, color: C.navy }}>{s.icon}</div>
          </div>
        ))}
      </div>

      <section style={styles.card}>
        <div style={styles.cardTitle}>All Coaching Engagements</div>
        <div style={{ overflowX: "auto" }}>
          <div style={styles.tableHeader}>
            {["Coachee / Group", "Program", "Type", "Sessions", "Status", "Assigned By"].map(h => <div key={h}>{h}</div>)}
          </div>
          {loading ? <SoftRow label="Loading coaching engagements..." /> : engagements.length === 0 ? <SoftRow label="No coaching engagements yet." /> : engagements.map(e => <EngagementRow key={e.id} e={e} />)}
        </div>
      </section>

      <section style={styles.card}>
        <div style={styles.topRow}>
          <div style={styles.cardTitle}>Coaches in this Organization</div>
          <div style={{ fontSize: 11, color: C.muted }}>{coaches.length} coach{coaches.length === 1 ? "" : "es"}</div>
        </div>
        <div style={{ overflowX: "auto" }}>
          <div style={styles.coachTableHeader}>
            {["Name", "Email", "Type"].map(h => <div key={h}>{h}</div>)}
          </div>
          {loading
            ? <SoftRow label="Loading coaches..." />
            : coaches.length === 0
              ? <SoftRow label="No coaches enrolled yet. Use “Enroll Coach” to invite one." />
              : coaches.map(co => <CoachRow key={co.user_id} c={co} />)}
        </div>
      </section>

      {showInitiate && (
        <InitiateModal
          orgId={orgId}
          options={options}
          onClose={() => setShowInitiate(false)}
          onCreated={(engagement) => {
            setEngagements(prev => [engagement, ...prev]);
            setShowInitiate(false);
          }}
        />
      )}

      {showEnrollCoach && (
        <EnrollCoachModal
          orgId={orgId}
          onClose={() => setShowEnrollCoach(false)}
          onEnrolled={() => { setShowEnrollCoach(false); void load(); }}
        />
      )}
    </div>
  );
}

function CoachRow({ c }: { c: CoachDTO }) {
  const isFaculty = c.type === "faculty";
  return (
    <div style={styles.coachTableRow}>
      <div style={styles.nameCell}>
        <div style={{ ...styles.avatar, background: isFaculty ? "rgba(107,115,191,0.14)" : "rgba(239,78,36,0.12)", color: isFaculty ? C.indigo : C.orange }}>{initialsFor(c.name)}</div>
        <div style={styles.strongText}>{c.name}</div>
      </div>
      <div style={styles.mutedEllipsis}>{c.email}</div>
      <div><Pill label={isFaculty ? "FACULTY · COACH" : "COACH"} color={isFaculty ? C.indigo : C.orange} /></div>
    </div>
  );
}

function EnrollCoachModal({ orgId, onClose, onEnrolled }: { orgId: string; onClose: () => void; onEnrolled: () => void }) {
  const [email, setEmail] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function submit() {
    const trimmed = email.trim().toLowerCase();
    if (!trimmed) { setError("Email is required"); return; }
    setSaving(true); setError(""); setNotice("");
    try {
      const res = await coachingAdminApi.enrollCoach({ email: trimmed, org_id: orgId });
      // Existing org member enrolled directly returns a { message } (no invite email).
      if (res.data?.message) {
        setNotice(res.data.message);
        setTimeout(onEnrolled, 900);
      } else {
        onEnrolled();
      }
    } catch (e) {
      setError((e as Error).message || "Failed to enroll coach");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={styles.overlay} onMouseDown={(e) => { if (e.currentTarget === e.target) onClose(); }}>
      <div style={{ ...styles.modal, width: "min(480px, 95vw)" }}>
        <div style={styles.modalHeader}>
          <div style={{ fontSize: 15, fontWeight: 700, color: C.navy }}>Enroll Coach</div>
          <button onClick={onClose} style={styles.closeBtn}>×</button>
        </div>
        <div style={styles.modalBody}>
          <div style={styles.infoStrip}>The coach is invited to this organization with a coach role. They complete the same onboarding as faculty and then appear as an assignable coach.</div>
          {error && <div style={styles.error}>{error}</div>}
          {notice && <div style={{ ...styles.infoStrip, background: "rgba(34,197,94,0.1)", borderColor: "rgba(34,197,94,0.22)", color: C.success }}>{notice}</div>}
          <Field label="Coach Email">
            <input value={email} onChange={e => setEmail(e.target.value)} onKeyDown={e => { if (e.key === "Enter") void submit(); }} placeholder="coach@example.com" style={styles.input} type="email" />
          </Field>
          <FooterNav right={<button disabled={saving} onClick={submit} style={{ ...styles.primaryBtn, opacity: saving ? 0.6 : 1 }}>{saving ? "Enrolling..." : "Send Invite"}</button>} />
        </div>
      </div>
    </div>
  );
}

function EngagementRow({ e }: { e: CoachingEngagementDTO }) {
  const displayName = e.assignment_type === "group" ? e.name : (e.participants[0]?.name || e.name);
  const initials = initialsFor(displayName);
  return (
    <div style={styles.tableRow}>
      <div style={styles.nameCell}>
        <div style={{ ...styles.avatar, background: e.assignment_type === "group" ? "rgba(28,37,81,0.1)" : "rgba(239,78,36,0.12)", color: e.assignment_type === "group" ? C.navy : C.orange }}>{initials}</div>
        <div style={{ minWidth: 0 }}>
          <div style={styles.strongText}>{displayName}</div>
          {e.assignment_type === "group" && <div style={styles.metaText}>{e.participants.length} participants</div>}
        </div>
      </div>
      <div style={styles.mutedEllipsis}>{e.program_title}</div>
      <div><Pill label={e.assignment_type === "group" ? "GROUP" : "1:1"} color={e.assignment_type === "group" ? C.navy : C.orange} /></div>
      <div style={styles.strongText}>{e.completed_sessions}/{e.total_sessions}</div>
      <div><StatusBadge status={e.status} /></div>
      <div style={styles.mutedEllipsis}>{e.assigned_by_name}</div>
    </div>
  );
}

function InitiateModal({ orgId, options, onClose, onCreated }: { orgId: string; options: CoachingAdminOptionsDTO; onClose: () => void; onCreated: (e: CoachingEngagementDTO) => void }) {
  const [type, setType] = useState<"individual" | "group">("individual");
  const [step, setStep] = useState(1);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState({ programId: "", cohortId: "", coachId: options.coaches[0]?.id ?? "", participantIds: [] as string[], groupName: "", startDate: "", sessions: 6, frequency: "Bi-weekly", goals: ["", "", ""] });

  const cohorts = options.cohorts.filter(c => !form.programId || c.program_id === form.programId);
  const canNext1 = type === "individual" ? form.participantIds.length === 1 : form.participantIds.length >= 2 && form.groupName.trim().length > 0;
  const canNext2 = !!form.programId && !!form.coachId;

  function toggleParticipant(id: string) {
    setForm(f => {
      if (type === "individual") return { ...f, participantIds: f.participantIds[0] === id ? [] : [id] };
      return { ...f, participantIds: f.participantIds.includes(id) ? f.participantIds.filter(p => p !== id) : [...f.participantIds, id] };
    });
  }

  async function submit() {
    setSaving(true);
    setError("");
    try {
      const selected = options.participants.find(p => p.id === form.participantIds[0]);
      const created = await coachingAdminApi.create({
        org_id: orgId,
        program_id: form.programId,
        cohort_id: form.cohortId || undefined,
        coach_id: form.coachId,
        assignment_type: type,
        name: type === "group" ? form.groupName.trim() : (selected?.name || "Individual Coaching"),
        participant_ids: form.participantIds,
        start_date: form.startDate || undefined,
        frequency: form.frequency,
        total_sessions: Number(form.sessions) || 6,
        goals: form.goals,
      });
      onCreated(created.data);
    } catch (e) {
      setError((e as Error).message || "Failed to create coaching assignment");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={styles.overlay} onMouseDown={(e) => { if (e.currentTarget === e.target) onClose(); }}>
      <div style={styles.modal}>
        <div style={styles.modalHeader}>
          <div style={{ fontSize: 15, fontWeight: 700, color: C.navy }}>Initiate Coaching Assignment</div>
          <button onClick={onClose} style={styles.closeBtn}>×</button>
        </div>
        <div style={styles.modalBody}>
          <div style={styles.infoStrip}>You are initiating this coaching assignment as Business Admin. You can assign any available coach.</div>
          <div style={styles.typeGrid}>
            <TypeCard active={type === "individual"} title="1:1 Individual Coaching" body="One coach, one coachee. Personalized goal-focused journey." onClick={() => { setType("individual"); setForm(f => ({ ...f, participantIds: f.participantIds.slice(0, 1) })); }} />
            <TypeCard active={type === "group"} title="Group Coaching" body="One coach, multiple coachees in a shared learning space." onClick={() => setType("group")} />
          </div>
          <Stepper step={step} />
          {error && <div style={styles.error}>{error}</div>}

          {step === 1 && (
            <section style={styles.card}>
              <div style={styles.cardTitle}>Step 1: Select Participant{type === "group" ? "s" : ""}</div>
              {type === "group" && <Field label="Group Name"><input value={form.groupName} onChange={e => setForm(f => ({ ...f, groupName: e.target.value }))} placeholder="Cohort A - Group Coaching" style={styles.input} /></Field>}
              <div style={styles.participantGrid}>
                {options.participants.map(p => {
                  const checked = form.participantIds.includes(p.id);
                  return <button key={p.id} onClick={() => toggleParticipant(p.id)} style={{ ...styles.selectTile, borderColor: checked ? C.indigo : C.border, background: checked ? "rgba(107,115,191,0.06)" : C.card }}><span style={{ ...styles.checkbox, background: checked ? C.indigo : "transparent", borderColor: checked ? C.indigo : "#D0D3E0" }}>{checked ? "✓" : ""}</span><span>{p.name}</span></button>;
                })}
              </div>
              <FooterNav right={<button disabled={!canNext1} onClick={() => setStep(2)} style={{ ...styles.primaryBtn, opacity: canNext1 ? 1 : 0.45 }}>Next: Program & Coach</button>} />
            </section>
          )}

          {step === 2 && (
            <section style={styles.card}>
              <div style={styles.cardTitle}>Step 2: Program & Coach Assignment</div>
              <Field label="Program"><select value={form.programId} onChange={e => setForm(f => ({ ...f, programId: e.target.value, cohortId: "" }))} style={styles.input}><option value="">Select program</option>{options.programs.map(p => <option key={p.id} value={p.id}>{p.title}</option>)}</select></Field>
              <Field label="Cohort"><select value={form.cohortId} onChange={e => setForm(f => ({ ...f, cohortId: e.target.value }))} style={styles.input}><option value="">No specific cohort</option>{cohorts.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>
              <Field label="Assign Coach">
                {options.coaches.length === 0
                  ? <div style={{ fontSize: 12, color: C.muted, padding: "10px 12px", border: `1px solid ${C.border}`, borderRadius: 8, background: "#fff" }}>No coaches or faculty available in this organisation yet.</div>
                  : <select value={form.coachId} onChange={e => setForm(f => ({ ...f, coachId: e.target.value }))} style={styles.input}><option value="">Select coach</option>{options.coaches.map(c => <option key={c.id} value={c.id}>{c.name}{c.type ? ` — ${c.type === "coach" ? "Coach" : "Faculty"}` : ""}</option>)}</select>
                }
              </Field>
              <FooterNav left={<button onClick={() => setStep(1)} style={styles.ghostBtn}>Back</button>} right={<button disabled={!canNext2} onClick={() => setStep(3)} style={{ ...styles.primaryBtn, opacity: canNext2 ? 1 : 0.45 }}>Next: Schedule & Goals</button>} />
            </section>
          )}

          {step === 3 && (
            <section style={styles.card}>
              <div style={styles.cardTitle}>Step 3: Schedule & Goals</div>
              <div style={styles.scheduleGrid}>
                <Field label="Start Date"><input type="date" value={form.startDate} onChange={e => setForm(f => ({ ...f, startDate: e.target.value }))} style={styles.input} /></Field>
                <Field label="No. of Sessions"><input type="number" min={1} max={24} value={form.sessions} onChange={e => setForm(f => ({ ...f, sessions: Number(e.target.value) }))} style={styles.input} /></Field>
                <Field label="Frequency"><select value={form.frequency} onChange={e => setForm(f => ({ ...f, frequency: e.target.value }))} style={styles.input}>{frequencies.map(f => <option key={f}>{f}</option>)}</select></Field>
              </div>
              <Field label="Initial Coaching Goals"><div style={{ display: "grid", gap: 8 }}>{form.goals.map((g, i) => <input key={i} value={g} onChange={e => setForm(f => ({ ...f, goals: f.goals.map((old, idx) => idx === i ? e.target.value : old) }))} placeholder={`Goal ${i + 1}`} style={styles.input} />)}</div></Field>
              <FooterNav left={<button onClick={() => setStep(2)} style={styles.ghostBtn}>Back</button>} right={<button disabled={saving} onClick={submit} style={styles.primaryBtn}>{saving ? "Creating..." : "Initiate Assignment"}</button>} />
            </section>
          )}
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) { return <label style={{ display: "grid", gap: 6, marginBottom: 14 }}><span style={styles.label}>{label}</span>{children}</label>; }
function FooterNav({ left, right }: { left?: ReactNode; right: ReactNode }) { return <div style={{ display: "flex", justifyContent: left ? "space-between" : "flex-end", marginTop: 16 }}>{left}<div>{right}</div></div>; }
function TypeCard({ active, title, body, onClick }: { active: boolean; title: string; body: string; onClick: () => void }) { return <button onClick={onClick} style={{ ...styles.typeCard, borderColor: active ? C.indigo : C.border, background: active ? "rgba(107,115,191,0.05)" : C.card }}><span style={{ fontSize: 13, fontWeight: 700, color: active ? C.indigo : C.navy }}>{title}</span><span style={{ fontSize: 11, color: C.muted, lineHeight: 1.6 }}>{body}</span></button>; }
function Stepper({ step }: { step: number }) { return <div style={styles.stepper}>{["Participants", "Program & Coach", "Schedule & Goals"].map((label, i) => <div key={label} style={{ display: "flex", alignItems: "center", gap: 8, color: i + 1 <= step ? C.navy : C.muted, fontSize: 12, fontWeight: i + 1 === step ? 700 : 500 }}><span style={{ ...styles.stepDot, background: i + 1 <= step ? C.indigo : C.alt, color: i + 1 <= step ? "#fff" : C.muted }}>{i + 1}</span>{label}</div>)}</div>; }
function Pill({ label, color }: { label: string; color: string }) { return <span style={{ background: `${color}14`, color, borderRadius: 20, padding: "3px 9px", fontSize: 10, fontWeight: 700 }}>{label}</span>; }
function StatusBadge({ status }: { status: string }) { const color = status === "active" ? C.success : status === "completed" ? C.indigo : status === "cancelled" ? C.muted : C.warning; return <Pill label={status.toUpperCase()} color={color} />; }
function SoftRow({ label }: { label: string }) { return <div style={{ padding: 18, color: C.muted, fontSize: 12, borderTop: `1px solid ${C.border}` }}>{label}</div>; }
function initialsFor(name: string) { return name.split(/\s+/).filter(Boolean).slice(0, 2).map(p => p[0]?.toUpperCase()).join("") || "CO"; }

const styles: Record<string, CSSProperties> = {
  page: { padding: 24, display: "flex", flexDirection: "column", gap: 16, color: C.navy, fontFamily: "Poppins, sans-serif" },
  topRow: { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" },
  statGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 14 },
  statCard: { background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, boxShadow: "0 1px 4px rgba(28,37,81,0.07)", padding: 20, minHeight: 120 },
  card: { background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, boxShadow: "0 1px 4px rgba(28,37,81,0.07)", padding: 20 },
  cardTitle: { fontSize: 15, fontWeight: 700, color: C.navy, marginBottom: 16 },
  primaryBtn: { border: "none", background: C.orange, color: "#fff", borderRadius: 8, padding: "9px 18px", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "Poppins, sans-serif" },
  ghostBtn: { background: "#fff", border: `1px solid ${C.border}`, color: C.navy, borderRadius: 8, padding: "8px 16px", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "Poppins, sans-serif" },
  tableHeader: { minWidth: 880, display: "grid", gridTemplateColumns: "2fr 1.5fr 0.8fr 0.8fr 0.9fr 1fr", gap: 12, padding: "10px 12px", background: C.page, borderRadius: "8px 8px 0 0", color: C.muted, fontSize: 11, fontWeight: 700 },
  tableRow: { minWidth: 880, display: "grid", gridTemplateColumns: "2fr 1.5fr 0.8fr 0.8fr 0.9fr 1fr", gap: 12, padding: "12px", alignItems: "center", borderTop: `1px solid ${C.border}` },
  coachTableHeader: { minWidth: 560, display: "grid", gridTemplateColumns: "1.6fr 2fr 1fr", gap: 12, padding: "10px 12px", background: C.page, borderRadius: "8px 8px 0 0", color: C.muted, fontSize: 11, fontWeight: 700 },
  coachTableRow: { minWidth: 560, display: "grid", gridTemplateColumns: "1.6fr 2fr 1fr", gap: 12, padding: "12px", alignItems: "center", borderTop: `1px solid ${C.border}` },
  nameCell: { display: "flex", alignItems: "center", gap: 10, minWidth: 0 },
  avatar: { width: 30, height: 30, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, fontWeight: 800, flexShrink: 0 },
  strongText: { fontSize: 12, fontWeight: 700, color: C.navy, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" },
  mutedEllipsis: { fontSize: 11, color: C.muted, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" },
  metaText: { fontSize: 10, color: C.muted, marginTop: 2 },
  overlay: { position: "fixed", inset: 0, background: "rgba(28,37,81,0.45)", zIndex: 2000, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 },
  modal: { width: "min(860px, 95vw)", maxHeight: "90vh", overflowY: "auto", background: C.page, borderRadius: 16, boxShadow: "0 24px 64px rgba(28,37,81,0.22)" },
  modalHeader: { padding: "16px 22px", borderBottom: `1px solid ${C.border}`, background: C.card, borderRadius: "16px 16px 0 0", display: "flex", justifyContent: "space-between", alignItems: "center" },
  modalBody: { padding: 20, display: "grid", gap: 14 },
  closeBtn: { border: "none", background: "transparent", color: C.muted, fontSize: 18, cursor: "pointer" },
  infoStrip: { background: "rgba(107,115,191,0.08)", border: "1px solid rgba(107,115,191,0.18)", color: C.indigo, borderRadius: 10, padding: "10px 14px", fontSize: 12, fontWeight: 600 },
  typeGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 },
  typeCard: { textAlign: "left", border: `2px solid ${C.border}`, borderRadius: 12, padding: 16, cursor: "pointer", display: "grid", gap: 6, fontFamily: "Poppins, sans-serif" },
  stepper: { display: "flex", alignItems: "center", gap: 18, flexWrap: "wrap" },
  stepDot: { width: 28, height: 28, borderRadius: "50%", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700, flexShrink: 0 },
  participantGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))", gap: 8 },
  selectTile: { display: "flex", alignItems: "center", gap: 8, padding: "9px 12px", border: `1.5px solid ${C.border}`, borderRadius: 9, cursor: "pointer", color: C.navy, fontSize: 12, fontWeight: 600, fontFamily: "Poppins, sans-serif" },
  checkbox: { width: 18, height: 18, borderRadius: 4, border: "2px solid #D0D3E0", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 800, flexShrink: 0 },
  label: { fontSize: 10, fontWeight: 700, color: C.muted, letterSpacing: 0.5, textTransform: "uppercase" },
  input: { width: "100%", border: `1px solid ${C.border}`, borderRadius: 8, padding: "10px 12px", fontSize: 13, color: C.navy, fontFamily: "Poppins, sans-serif", boxSizing: "border-box", background: "#fff" },
  scheduleGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12 },
  error: { background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.18)", color: "#ef4444", borderRadius: 10, padding: "10px 14px", fontSize: 12, fontWeight: 600 },
};
