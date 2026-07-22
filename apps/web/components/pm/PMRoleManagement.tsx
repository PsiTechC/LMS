"use client";

import { useState, useEffect, useCallback } from "react";
import ReactDOM from "react-dom";
import { useAuth } from "@/lib/auth-context";
import { pmRolesApi, OrgMemberDTO } from "@/lib/roles-api";
import { invitationsApi } from "@/lib/invitations-api";
import { programsApi, ProgramDTO } from "@/lib/programs-api";
import { cohortsApi, CohortDTO } from "@/lib/cohorts-api";
import { PermissionCatalogGrid, scopeRowGroupsForRole } from "@/components/superadmin/RoleManagement";
import OnboardFacultyWizard from "@/components/superadmin/OnboardFacultyWizard";

// ── Slate / Admin design tokens (FRONTEND_CLAUDE.md) - matches RoleManagement.tsx ──
const C = {
  navy:   "var(--xa-navy)",
  slateL: "#64748b",
  orange: "var(--xa-primary)",
  page:   "var(--xa-bg)",
  card:   "#FFFFFF",
  border: "#E6DED0",
  muted:  "var(--xa-muted)",
  green:  "#22c55e",
  indigo: "var(--xa-muted)",
};
const ff = { fontFamily: "Poppins, sans-serif" } as const;

const card = {
  table: { background: C.card, borderRadius: 12, border: `1px solid ${C.border}`, boxShadow: "0 1px 4px rgba(24, 40, 72,0.07)", overflow: "hidden" } as const,
  empty: { padding: 40, textAlign: "center" as const, color: C.muted, fontSize: 13 },
};
const th = { textAlign: "left" as const, padding: "10px 16px", fontSize: 11, fontWeight: 700, color: C.muted, letterSpacing: 0.5, textTransform: "uppercase" as const };
const td = { padding: "12px 16px", verticalAlign: "middle" as const };
const btn = {
  ghost: { ...ff, padding: "9px 16px", borderRadius: 8, border: `1px solid ${C.border}`, background: "#fff", color: C.navy, fontSize: 12, fontWeight: 600, cursor: "pointer" },
  ghostSm: { ...ff, padding: "7px 12px", borderRadius: 8, border: `1px solid ${C.border}`, background: "#fff", color: C.navy, fontSize: 11, fontWeight: 600, cursor: "pointer" },
  prim: { ...ff, padding: "9px 20px", borderRadius: 8, border: "none", background: C.orange, color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer" },
};
const pill = (color: string) => ({ ...ff, display: "inline-block" as const, fontSize: 11, fontWeight: 700, color, background: `${color}14`, borderRadius: 20, padding: "3px 10px" });
const banner = {
  err: { ...ff, background: "rgba(239,68,68,0.08)", color: "#dc2626", padding: "10px 14px", borderRadius: 8, fontSize: 12, border: "1px solid rgba(239,68,68,0.2)" },
  ok:  { ...ff, background: "rgba(34,197,94,0.08)", color: C.green, padding: "10px 14px", borderRadius: 8, fontSize: 12, border: "1px solid rgba(34,197,94,0.2)" },
};

function initials(name: string) {
  return name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);
}

// ── Category cards ────────────────────────────────────────────────────────
// pmOrgMembersService already excludes the Primary PM themselves and any
// superadmin-tier account, so every base_role that comes back here is
// exactly one of these four - a program_manager row in THIS list is always
// a Secondary PM (the Primary PM never appears in their own manageable list).
type Category = "program_manager" | "faculty" | "coach" | "participant";
const CATEGORIES: { key: Category; label: string; color: string }[] = [
  { key: "program_manager", label: "Program Manager (Secondary)", color: C.orange },
  { key: "faculty",         label: "Faculty",      color: C.indigo },
  { key: "coach",           label: "Coach",         color: "#0891B2" },
  { key: "participant",     label: "Participant",  color: "#22c55e" },
];

// ── Main page - Primary PM's own-org Members + per-account permission editor ──
// No org selector (always the caller's own org - /pm/members never accepts
// an org_id), no Billing/System Health/Integrations/Audit Log/Organizations
// sections. Summary cards per role - click a card to filter the table below
// to just that role; each card's own "+ Add" button invites a NEW account of
// that specific role into this org (separate from the superadmin Members
// tab's "+ Add" Secondary PM button, which still only lives there).
export default function PMRoleManagement({ onBack, onNavigate }: { onBack?: () => void; onNavigate?: (page: string) => void }) {
  const { user } = useAuth();
  const orgId = user?.org_id ?? "";
  const [members, setMembers] = useState<OrgMemberDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [editingMember, setEditingMember] = useState<OrgMemberDTO | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<Category | null>(null);
  const [addCategory, setAddCategory] = useState<Category | null>(null);
  // Participants can only ever be enrolled into a program - track whether this
  // org has any (non-archived) programs so the "+ Add Participant" trigger can
  // be disabled with a clear message instead of opening a modal that dead-ends
  // on submit. Mirrors the "No programs found. Create a program first." guard
  // already used in Cohort Management / Program Participants.
  const [hasPrograms, setHasPrograms] = useState(true);
  const [programsChecked, setProgramsChecked] = useState(false);
  // "Grant Coach Role" - additive, faculty-only (see pmRolesApi.grantCoachRole).
  const [grantingCoachId, setGrantingCoachId] = useState<string | null>(null);
  const [grantMsg, setGrantMsg] = useState("");
  // Faculty/Coach "+ Add" routes into the full onboarding wizard (richer
  // intake - profile, program assignment, access level) instead of the bare
  // AddAccountModal used for Program Manager/Participant.
  const [onboardingRole, setOnboardingRole] = useState<"faculty" | "coach" | null>(null);

  const load = useCallback(() => {
    setLoading(true); setErr("");
    pmRolesApi.listMembers()
      .then((r) => setMembers(r.data ?? []))
      .catch((e) => setErr((e as Error).message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!orgId) return;
    programsApi.list(orgId)
      .then((r) => {
        const list = (r.data ?? []).filter((p) => p.status !== "archived");
        setHasPrograms(list.length > 0);
      })
      .catch(() => setHasPrograms(true)) // fail open on lookup error - don't block the whole Members
      // page on a network hiccup. Not a gap: AddAccountModal below runs its own
      // independent programs fetch and fails CLOSED (empty list -> blockedNoProgram)
      // on error, so a real zero-program org can never actually submit even if this
      // outer check mistakenly stays enabled.
      .finally(() => setProgramsChecked(true));
  }, [orgId]);

  async function grantCoachRole(userId: string) {
    setGrantingCoachId(userId); setErr(""); setGrantMsg("");
    try {
      await pmRolesApi.grantCoachRole(userId);
      setGrantMsg("Coach role granted - this member now also appears in the faculty Coaching tab's Coach Workspace.");
      load();
    } catch (e) { setErr((e as Error).message || "Failed to grant coach role"); }
    finally { setGrantingCoachId(null); }
  }

  if (editingMember) {
    return (
      <PMMemberPermissionsPage
        member={editingMember}
        onBack={() => setEditingMember(null)}
      />
    );
  }

  if (onboardingRole) {
    return (
      <OnboardFacultyWizard
        targetRole={onboardingRole}
        onComplete={() => { setOnboardingRole(null); load(); }}
        onCancel={() => setOnboardingRole(null)}
      />
    );
  }

  const counts = CATEGORIES.reduce((acc, c) => {
    acc[c.key] = members.filter((m) => m.base_role === c.key).length;
    return acc;
  }, {} as Record<Category, number>);

  const visibleMembers = selectedCategory
    ? members.filter((m) => m.base_role === selectedCategory)
    : members;

  return (
    <div style={{ ...ff, padding: 24, display: "flex", flexDirection: "column", gap: 16 }}>
      <div>
        {onBack && (
          <button
            onClick={onBack}
            style={{ ...ff, display: "flex", alignItems: "center", gap: 5, background: "none", border: "none", cursor: "pointer", fontSize: 12, fontWeight: 600, color: C.muted, padding: 0, marginBottom: 10 }}
          >
            ← Back to Dashboard
          </button>
        )}
        <div style={{ fontSize: 18, fontWeight: 700, color: C.navy }}>Members</div>
      </div>

      {err && <div style={banner.err}>{err}</div>}
      {grantMsg && <div style={banner.ok}>{grantMsg}</div>}

      {/* Summary cards - click the body to filter, click "+ Add" to invite */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14 }}>
        {CATEGORIES.map((c) => {
          const on = selectedCategory === c.key;
          return (
            <div
              key={c.key}
              onClick={() => setSelectedCategory((prev) => (prev === c.key ? null : c.key))}
              style={{
                ...card.table, cursor: "pointer", padding: 16,
                display: "flex", flexDirection: "column", gap: 10,
                border: on ? `1px solid ${c.color}` : `1px solid ${C.border}`,
                boxShadow: on ? `0 0 0 2px ${c.color}22, 0 1px 4px rgba(24, 40, 72,0.07)` : card.table.boxShadow,
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, textTransform: "uppercase", letterSpacing: 0.5 }}>{c.label}</div>
                  <div style={{ fontSize: 26, fontWeight: 800, color: c.color, marginTop: 4 }}>{counts[c.key] ?? 0}</div>
                </div>
              </div>
              {c.key === "participant" && programsChecked && !hasPrograms ? (
                <div
                  style={{ alignSelf: "flex-start", fontSize: 10.5, color: C.muted, lineHeight: 1.4 }}
                  title="No programs found. Create a program first."
                >
                  No programs found. Create a program first.
                </div>
              ) : (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    if (c.key === "faculty" || c.key === "coach") setOnboardingRole(c.key);
                    else setAddCategory(c.key);
                  }}
                  disabled={c.key === "participant" && !hasPrograms}
                  style={{ ...btn.ghostSm, alignSelf: "flex-start", opacity: c.key === "participant" && !hasPrograms ? 0.5 : 1, cursor: c.key === "participant" && !hasPrograms ? "not-allowed" : "pointer" }}
                >
                  + Add {c.label}
                </button>
              )}
            </div>
          );
        })}
      </div>

      {loading ? (
        <div style={card.empty}>Loading members…</div>
      ) : visibleMembers.length === 0 ? (
        <div style={{ ...card.table, ...card.empty }}>
          {selectedCategory ? "No members with this role yet." : "No manageable members in your organization yet."}
        </div>
      ) : (
        <div style={card.table}>
          <div className="xa-table-wrap">
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: C.page }}>
                {["Name", "Current Role", "Actions"].map((h) => <th key={h} style={th}>{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {visibleMembers.map((m) => (
                <tr key={m.user_id} style={{ borderTop: `1px solid ${C.border}` }}>
                  <td style={td}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <div style={{ width: 30, height: 30, borderRadius: "50%", background: C.navy, color: "#fff", fontWeight: 700, fontSize: 12, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                        {initials(m.name)}
                      </div>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 600, color: C.navy }}>{m.name}</div>
                        <div style={{ fontSize: 11, color: C.muted }}>{m.email}</div>
                      </div>
                    </div>
                  </td>
                  <td style={td}>
                    <span style={pill(C.indigo)}>{m.base_role}</span>
                  </td>
                  <td style={td}>
                    <div style={{ display: "flex", gap: 8 }}>
                      <button onClick={() => setEditingMember(m)} style={btn.ghostSm}>View Permissions</button>
                      {m.base_role === "faculty" && (
                        <button
                          onClick={() => grantCoachRole(m.user_id)}
                          disabled={grantingCoachId === m.user_id}
                          style={{ ...btn.ghostSm, opacity: grantingCoachId === m.user_id ? 0.6 : 1 }}
                          title="Additively grant this faculty member the Coach persona - their existing faculty access is unaffected."
                        >
                          {grantingCoachId === m.user_id ? "Granting…" : "+ Grant Coach Role"}
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </div>
      )}

      {addCategory && (
        <AddAccountModal
          category={addCategory}
          orgId={orgId}
          onClose={() => setAddCategory(null)}
          onDone={() => { setAddCategory(null); load(); }}
          onNavigate={onNavigate}
        />
      )}
    </div>
  );
}

// ── Add-account modal ────────────────────────────────────────────────────
// Reuses the EXISTING invite endpoints - no new invite mechanism:
// - Secondary PM / Faculty / Coach: POST /invitations/faculty (org-level,
//   no cohort). "secondary_pm" is a symbolic role_id sentinel the backend
//   resolves to the real shared "Secondary PM" role id - this PM-scoped UI
//   has no way to look that id up itself (GET /roles is superadmin-only).
// - Participant: POST /invitations, scoped to a program in this org (the
//   same "enroll to program's default cohort" path Cohort Management uses).
function AddAccountModal({ category, orgId, onClose, onDone, onNavigate }: {
  category: Category; orgId: string; onClose: () => void; onDone: () => void; onNavigate?: (page: string) => void;
}) {
  const label = CATEGORIES.find((c) => c.key === category)?.label ?? category;
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [department, setDepartment] = useState("");
  const [programs, setPrograms] = useState<ProgramDTO[]>([]);
  const [programId, setProgramId] = useState("");
  const [cohorts, setCohorts] = useState<CohortDTO[]>([]);
  const [cohortId, setCohortId] = useState("");
  const [cohortsLoading, setCohortsLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (category !== "participant" || !orgId) return;
    programsApi.list(orgId).then((r) => {
      const list = (r.data ?? []).filter((p) => p.status !== "archived");
      setPrograms(list);
      if (list.length > 0) setProgramId(list[0].id);
    }).catch(() => {});
  }, [category, orgId]);

  // Cohorts are program-scoped - reload whenever the selected program
  // changes. Picking a cohort here is optional: a participant can be
  // enrolled directly to a program (no specific cohort chosen) - the
  // invitations service lands them in that program's auto-managed
  // "Unassigned" cohort, movable to a real one later via Cohort Management.
  useEffect(() => {
    if (category !== "participant" || !programId) { setCohorts([]); setCohortId(""); return; }
    setCohortsLoading(true);
    cohortsApi.list(orgId, programId).then((r) => {
      const list = (r.data ?? []).filter((c) => c.is_active);
      setCohorts(list);
    }).catch(() => { setCohorts([]); })
      .finally(() => setCohortsLoading(false));
  }, [category, orgId, programId]);

  // Participants can never be enrolled without a program - a participant is
  // structurally tied to a program (see invitations service). Block
  // submission entirely rather than letting the PM fill in name/email and
  // hit a generic error only after clicking submit.
  const blockedNoProgram = category === "participant" && programs.length === 0;

  async function submit() {
    if (blockedNoProgram) { setErr("No programs found. Create a program first."); return; }
    if (!email.trim()) { setErr("Email is required"); return; }
    if (!name.trim()) { setErr("Name is required"); return; }
    setErr(""); setSaving(true);
    try {
      if (category === "participant") {
        if (!programId) { setErr("Select a program"); setSaving(false); return; }
        await invitationsApi.send({
          email: email.trim(), role: "participant", cohort_id: cohortId || undefined, program_id: programId, org_id: orgId,
          name: name.trim(), department: department.trim(),
        });
      } else {
        await invitationsApi.sendFaculty({
          email: email.trim(), org_id: orgId, name: name.trim(),
          ...(category === "program_manager" ? { role_id: "secondary_pm" } : { role: category }),
        });
      }
      setDone(true);
    } catch (e) { setErr((e as Error).message || "Failed to send invite"); }
    finally { setSaving(false); }
  }

  if (typeof document === "undefined") return null;
  return ReactDOM.createPortal(
    <div
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{ position: "fixed", inset: 0, background: "rgba(24, 40, 72,0.5)", zIndex: 2000, display: "flex", alignItems: "center", justifyContent: "center", padding: 24, ...ff }}
    >
      <div style={{ background: "#fff", borderRadius: 16, width: "100%", maxWidth: 440, boxShadow: "0 24px 64px rgba(24, 40, 72,0.22)", overflow: "hidden" }}>
        {done ? (
          <div style={{ padding: "40px 28px", textAlign: "center" }}>
            <div style={{ fontSize: 30, marginBottom: 12 }}>✅</div>
            <div style={{ fontSize: 15, fontWeight: 700, color: C.navy, marginBottom: 8 }}>Invitation Sent!</div>
            <div style={{ fontSize: 13, color: C.muted, marginBottom: 24 }}>
              An invite email has been sent to <strong style={{ color: C.navy }}>{email}</strong>.
            </div>
            <button onClick={onDone} style={btn.prim}>Done</button>
          </div>
        ) : (
          <>
            <div style={{ padding: "18px 22px", borderBottom: `1px solid ${C.border}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: C.navy }}>Add {label}</div>
              <button onClick={onClose} style={{ border: "none", background: "none", cursor: "pointer", fontSize: 18, color: C.muted }}>✕</button>
            </div>
            <div style={{ padding: "20px 22px", display: "flex", flexDirection: "column", gap: 14 }}>
              {blockedNoProgram ? (
                <div style={{ padding: 24, textAlign: "center", background: C.page, borderRadius: 10, border: `1px solid ${C.border}` }}>
                  <div style={{ color: C.muted, fontSize: 13, marginBottom: onNavigate ? 14 : 0 }}>
                    No programs found - participants can&apos;t be enrolled until at least one program exists.
                  </div>
                  {onNavigate && (
                    <button onClick={() => { onClose(); onNavigate("pm-design"); }} style={{ padding: "9px 20px", background: C.orange, border: "none", borderRadius: 8, cursor: "pointer", fontSize: 12, fontWeight: 700, color: "#fff", fontFamily: "Poppins, sans-serif" }}>
                      + Create a Program
                    </button>
                  )}
                </div>
              ) : (
                <>
                  <Field label="Full Name *">
                    <input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Riya Sharma" style={input} />
                  </Field>
                  <Field label="Email Address *">
                    <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@organisation.com" style={input} />
                  </Field>
                  {category === "participant" && (
                    <>
                      <Field label="Department">
                        <input value={department} onChange={(e) => setDepartment(e.target.value)} placeholder="e.g. Operations" style={input} />
                      </Field>
                      <Field label="Program *">
                        <select value={programId} onChange={(e) => setProgramId(e.target.value)} style={input}>
                          {programs.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
                        </select>
                      </Field>
                      <Field label="Cohort (optional)">
                        {cohortsLoading ? (
                          <div style={{ fontSize: 12, color: C.muted, padding: "9px 0" }}>Loading cohorts…</div>
                        ) : cohorts.length === 0 ? (
                          <div style={{ fontSize: 11, color: C.muted, padding: "6px 0" }}>
                            No cohorts yet for this program - participant will be enrolled directly to the program.
                          </div>
                        ) : (
                          <select value={cohortId} onChange={(e) => setCohortId(e.target.value)} style={input}>
                            <option value="">No specific cohort - enroll to program</option>
                            {cohorts.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                          </select>
                        )}
                      </Field>
                    </>
                  )}
                </>
              )}
              {err && <div style={banner.err}>{err}</div>}
            </div>
            <div style={{ padding: "14px 22px", borderTop: `1px solid ${C.border}`, display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <button onClick={onClose} style={btn.ghost}>Cancel</button>
              {!blockedNoProgram && (
                <button onClick={submit} disabled={saving} style={{ ...btn.prim, opacity: saving ? 0.6 : 1 }}>
                  {saving ? "Sending…" : "Send Invite →"}
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </div>,
    document.body
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ fontSize: 10, fontWeight: 700, color: C.muted, letterSpacing: 0.5, marginBottom: 6 }}>{label.toUpperCase()}</div>
      {children}
    </div>
  );
}

const input: React.CSSProperties = {
  width: "100%", border: `1.5px solid ${C.border}`, borderRadius: 8, padding: "9px 12px",
  fontSize: 13, fontFamily: "Poppins, sans-serif", color: C.navy, outline: "none", boxSizing: "border-box",
};

// ── Per-account permission editor - reuses PermissionCatalogGrid exactly as
// the superadmin Members-tab editor does (same checkbox-cascade / always-
// visible elevated-action-chip logic), just backed by the /pm/members/*
// routes instead of /orgs/:id/members/*. Always editable: every account
// pmRolesApi.listMembers() returns is, by the backend's own filtering, a
// legitimate edit target for this Primary PM (Secondary PM/Faculty/Coach/
// Participant in their own org) - the server still independently enforces
// the org check and the escalation ceiling on Save regardless of anything
// here.
function PMMemberPermissionsPage({ member, onBack }: { member: OrgMemberDTO; onBack: () => void }) {
  const [perms, setPerms] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [full, setFull] = useState(false);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  useEffect(() => {
    setLoading(true); setErr("");
    pmRolesApi.getMemberPermissions(member.user_id)
      .then((r) => {
        setFull(!!r.data?.full);
        setPerms(new Set(r.data?.permissions ?? []));
      })
      .catch((e) => setErr((e as Error).message))
      .finally(() => setLoading(false));
  }, [member.user_id]);

  const scopedRowGroups = scopeRowGroupsForRole(member.base_role, perms);

  function toggle(keys: string[], on: boolean) {
    setPerms((prev) => {
      const next = new Set(prev);
      keys.forEach((k) => (on ? next.add(k) : next.delete(k)));
      return next;
    });
    setDirty(true);
  }

  async function save() {
    setSaving(true); setErr(""); setMsg("");
    try {
      const r = await pmRolesApi.updateMemberPermissions(member.user_id, Array.from(perms));
      // The server may have capped some requested keys (escalation ceiling -
      // can't grant a permission the Primary PM doesn't hold themselves).
      // Reflect exactly what was actually saved, not what was requested.
      setPerms(new Set(r.data?.permissions ?? []));
      setMsg("Permissions saved for this account."); setDirty(false);
    } catch (e) { setErr((e as Error).message); }
    finally { setSaving(false); }
  }

  return (
    <div style={{ ...ff, padding: 24, display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div style={{ display: "flex", gap: 14 }}>
          <div style={{ width: 44, height: 44, borderRadius: "50%", background: C.navy, color: "#fff", fontWeight: 700, fontSize: 17, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            {initials(member.name)}
          </div>
          <div>
            <div style={{ fontSize: 18, fontWeight: 700, color: C.navy }}>{member.name}</div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4 }}>
              <span style={pill(C.indigo)}>{member.base_role}</span>
              <span style={{ fontSize: 12, color: C.muted }}>{member.email}</span>
            </div>
            <div style={{ fontSize: 12, color: C.slateL, marginTop: 6, maxWidth: 620 }}>
              Editing permissions for this account only, within your organization. You can never grant a
              permission you don&rsquo;t hold yourself - the server caps anything beyond your own access.
            </div>
          </div>
        </div>
        <button onClick={onBack} style={{ ...btn.ghost, border: "none", color: C.muted }}>← Back</button>
      </div>

      {err && <div style={banner.err}>{err}</div>}
      {msg && <div style={banner.ok}>{msg}</div>}

      {loading ? (
        <div style={card.empty}>Loading permissions…</div>
      ) : full ? (
        <div style={{ ...card.table, ...card.empty }}>
          This account has unrestricted access - nothing to edit here.
        </div>
      ) : (
        <>
          <PermissionCatalogGrid selected={perms} editable onToggle={toggle} rowGroups={scopedRowGroups} />
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
            <button onClick={onBack} style={btn.ghost}>Cancel</button>
            <button onClick={save} disabled={!dirty || saving} style={{ ...btn.prim, opacity: !dirty || saving ? 0.6 : 1 }}>
              {saving ? "Saving…" : "Save Permissions"}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
