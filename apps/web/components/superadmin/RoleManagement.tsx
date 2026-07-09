"use client";

import { useState, useEffect, useCallback } from "react";
import { api, ApiResponse, OrgResponse } from "@/lib/api";
import {
  rolesApi, CustomRoleDTO, RolesSummaryDTO, RoleUserDTO, OrgScopedRoleDTO, OrgMemberDTO,
  BASE_ROLE_LABELS, INHERIT_OPTIONS, ROLE_COLORS, SIDEBAR_PERMISSION_MODULES,
} from "@/lib/roles-api";
import { invitationsApi } from "@/lib/invitations-api";

// ── Slate / Admin design tokens (FRONTEND_CLAUDE.md) ────────────────────────
const C = {
  navy:   "#1C2551",
  slate:  "#334155",
  slateL: "#64748b",
  orange: "#EF4E24",
  page:   "#F5F7FB",
  card:   "#FFFFFF",
  alt:    "#F0F1F7",
  border: "#EAECF4",
  muted:  "#8b90a7",
  green:  "#22c55e",
  indigo: "#6B73BF",
  danger: "#ef4444",
};
const ff = { fontFamily: "Poppins, sans-serif" } as const;

interface UserRow { id: string; name: string; email: string; role: string; }

// SIDEBAR_PERMISSION_MODULES grouped by sidebar label — some tabs (Grading &
// Capstone, Faculty Management) map to more than one real backend resource,
// so they appear as multiple catalog rows sharing one label; grouping here
// renders them as one visual row with sub-groups instead of duplicate rows.
const PERMISSION_ROW_GROUPS = (() => {
  const map = new Map<string, typeof SIDEBAR_PERMISSION_MODULES>();
  for (const row of SIDEBAR_PERMISSION_MODULES) {
    if (!map.has(row.label)) map.set(row.label, []);
    map.get(row.label)!.push(row);
  }
  return Array.from(map.entries());
})();

// Each role's REAL sidebar (nav-config.ts — the actual product nav that role
// sees, not the superadmin catalog) mapped to the matching permission-catalog
// row label, so the Members-tab per-account view can be scoped to exactly
// the tabs that role/account is meant to see — not all 21 superadmin tabs.
// "Dashboard"/"My Journey"/landing items have no catalog resource and are
// intentionally omitted (nothing to show permissions for).
const ROLE_TAB_LABELS: Record<string, string[]> = {
  program_manager: ["Program Design Studio", "Cohort Management", "Analytics", "Faculty Management", "Content Library", "Coaching Admin", "Discussions"],
  faculty: ["Program Design Studio", "Live Sessions", "Cohort Management", "Content Library", "Grading & Capstone", "Coaching Overview", "Discussions"],
  coach: ["Coaching Overview", "Live Sessions", "Program Design Studio", "Content Library"],
  participant: ["Content Library", "Live Sessions", "Grading & Capstone", "360° & Psychometrics", "Coaching Overview", "Leaderboard", "Surveys", "Discussions"],
};

// Scopes the permission grid to a base persona's real sidebar tabs (in that
// sidebar's own order) instead of every superadmin-wide catalog tab. Used
// both by the Members-tab per-account view (keyed off the member's current
// effective_role) and the Roles-tab shared-role view (keyed off the role's
// base_role — e.g. Participant Retail's base_role is "participant", so it
// shows the same tabs a real participant's sidebar has). Falls back to
// whatever resources `perms` actually grants at least one action on when the
// base role isn't one of the 4 known personas (e.g. base_role "none" or
// "superadmin", which see the full catalog).
function scopeRowGroupsForRole(baseRole: string, perms: Set<string>): typeof PERMISSION_ROW_GROUPS {
  const roleLabels = ROLE_TAB_LABELS[baseRole];
  if (roleLabels) {
    const byLabel = new Map(PERMISSION_ROW_GROUPS);
    return roleLabels
      .filter((label) => byLabel.has(label))
      .map((label) => [label, byLabel.get(label)!] as (typeof PERMISSION_ROW_GROUPS)[number]);
  }
  const grantedResources = new Set(Array.from(perms).map((p) => p.split(":")[0]));
  return PERMISSION_ROW_GROUPS.filter(([, rows]) =>
    rows.some((r) => r.resource && grantedResources.has(r.resource))
  );
}

// ════════════════════════════════════════════════════════════════════════════
//  MAIN
// ════════════════════════════════════════════════════════════════════════════

export default function RoleManagement() {
  const [summary, setSummary]         = useState<RolesSummaryDTO | null>(null);
  const [customRoles, setCustomRoles] = useState<CustomRoleDTO[]>([]);
  const [orgs, setOrgs]               = useState<OrgResponse[]>([]);
  const [loading, setLoading]         = useState(true);
  const [err, setErr]                 = useState("");
  const [selected, setSelected]       = useState<CustomRoleDTO | null>(null);

  // ── Org scope (new, additive) — "" = All Orgs (current, unscoped behavior) ──
  const [selectedOrgId, setSelectedOrgId] = useState("");
  const [orgRoles, setOrgRoles]           = useState<OrgScopedRoleDTO[]>([]);
  const [members, setMembers]             = useState<OrgMemberDTO[]>([]);
  const [orgLoading, setOrgLoading]       = useState(false);
  const [orgErr, setOrgErr]               = useState("");
  // Clicked role in the Built-in Roles table (org-scoped view) — filters the
  // Members table below to just that role. null = show all members.
  const [selectedMemberRole, setSelectedMemberRole] = useState<string | null>(null);
  // Member whose individual permissions are being viewed/edited. null = list view.
  const [permMember, setPermMember] = useState<OrgMemberDTO | null>(null);
  // "+ Add PM" modal (invite a Secondary PM into the selected org) — open/closed.
  const [showAddPM, setShowAddPM] = useState(false);

  // Summary-card filter for the unscoped Roles table below — "all" (Total
  // Roles) or "custom" (Custom Roles). Makes the "Tap for details" cards
  // actually do something instead of being purely decorative.
  const [roleFilter, setRoleFilter] = useState<"all" | "custom">("all");

  // "Secondary PM" is a flavor of program_manager (surfaced via the small
  // Primary/Secondary tag on the Members table), not a distinct role concept
  // — kept out of the unscoped "Roles" catalog so it doesn't inflate that
  // count or read as a whole separate role. Still fully present in the DB
  // and still assignable via "+ Add PM" — this only affects this one list.
  const visibleCustomRoles = customRoles
    .filter((r) => r.name !== "Secondary PM")
    .filter((r) => roleFilter === "all" || !r.is_system);

  const loadOrgScoped = useCallback((orgId: string) => {
    if (!orgId) { setOrgRoles([]); setMembers([]); return; }
    setOrgLoading(true); setOrgErr("");
    Promise.all([
      rolesApi.rolesByOrg(orgId).then((r) => r.data ?? []),
      rolesApi.orgMembers(orgId).then((r) => r.data ?? []),
    ]).then(([r, m]) => { setOrgRoles(r); setMembers(m); })
      .catch((e) => setOrgErr((e as Error).message))
      .finally(() => setOrgLoading(false));
  }, []);

  // Switching org (or leaving org scope) clears any active role filter.
  useEffect(() => { setSelectedMemberRole(null); }, [selectedOrgId]);
  useEffect(() => { loadOrgScoped(selectedOrgId); }, [selectedOrgId, loadOrgScoped]);

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([
      rolesApi.summary().then((r) => r.data).catch(() => null),
      // listRoles() (no org_id) already returns all 6 roles together — the 2
      // custom roles (Participant Retail, Super Admin (Secondary)) and the 4
      // built-in system roles (participant, coach, faculty, program_manager)
      // — ordered with the custom roles first, matching the merged table's
      // required sort order.
      rolesApi.listRoles().then((r) => r.data ?? []).catch((e) => { setErr(e.message); return []; }),
    ]).then(([s, c]) => { setSummary(s); setCustomRoles(c); })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    api.get<ApiResponse<OrgResponse[]>>("/organizations").then((r) => setOrgs(r.data ?? [])).catch(() => {});
  }, []);

  if (selected) {
    return <RoleDetail role={selected} onBack={() => { setSelected(null); load(); }} onChanged={load} />;
  }

  // "View Permissions" on a Members row — per-account editing, completely
  // separate from the shared-role Edit flow above. Never touches
  // program_manager/faculty/coach/participant or Participant Retail/Super
  // Admin (Secondary); only ever creates/edits a role scoped to this one user.
  if (permMember) {
    return (
      <MemberPermissionsPage
        orgId={selectedOrgId}
        member={permMember}
        onBack={() => setPermMember(null)}
      />
    );
  }

  // When a specific org is selected, the cards switch to THAT org's numbers
  // (derived from data already loaded for the org-scoped view below) instead
  // of the platform-wide totals — real custom-role names only (excludes
  // personal per-account roles, which never appear in customRoles at all,
  // and "Secondary PM", already excluded from visibleCustomRoles).
  const orgScoped = !!selectedOrgId;
  const realCustomRoleNames = new Set(visibleCustomRoles.filter((r) => !r.is_system).map((r) => r.name));
  const orgCustomRoleCount = new Set(
    members.map((m) => m.effective_role).filter((role) => realCustomRoleNames.has(role))
  ).size;
  const orgTotalRoles = orgRoles.length + orgCustomRoleCount;

  const cards: { label: string; value: string; color: string; filter: "all" | "custom" }[] = [
    { label: "Total Roles",
      value: orgScoped ? String(orgTotalRoles) : summary ? String(summary.total_roles) : "—",
      color: C.navy, filter: "all" },
    { label: "Custom Roles",
      value: orgScoped ? String(orgCustomRoleCount) : summary ? String(summary.custom_roles) : "—",
      color: C.orange, filter: "custom" },
    { label: "Total Users Assigned",
      value: orgScoped ? members.length.toLocaleString() : summary ? summary.total_users_assigned.toLocaleString() : "—",
      color: C.navy, filter: "all" },
    { label: "Permissions Defined", value: summary ? String(summary.permissions_defined) : "—",  color: C.indigo, filter: "all" },
  ];

  return (
    <div style={{ ...ff, padding: 24, display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Summary cards — clickable: filters the Roles table below */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16 }}>
        {cards.map((c) => {
          // The roleFilter click-toggle only affects the unscoped Roles
          // table, so it's inert (and unhighlighted) while an org is selected.
          const on = !orgScoped && roleFilter === c.filter;
          return (
            <div
              key={c.label}
              onClick={() => setRoleFilter(c.filter)}
              style={{
                ...card.plain, display: "flex", flexDirection: "column", gap: 8, cursor: "pointer",
                border: on ? `1px solid ${c.color}` : `1px solid ${C.border}`,
                boxShadow: on ? `0 0 0 2px ${c.color}22, 0 1px 4px rgba(28,37,81,0.07)` : card.plain.boxShadow,
                transition: "box-shadow 0.15s, border-color 0.15s",
              }}
            >
              <div style={{ fontSize: 11, fontWeight: 600, color: C.muted }}>{c.label}</div>
              <div style={{ fontSize: 30, fontWeight: 800, color: c.color, lineHeight: 1.1 }}>{c.value}</div>
              <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: 0.5, color: on ? c.color : C.muted, textTransform: "uppercase" }}>
                {orgScoped ? "This organization" : on ? "Showing below ✓" : "Tap for details"}
              </div>
            </div>
          );
        })}
      </div>

      {err && <div style={banner.err}>{err}</div>}

      {loading ? (
        <div style={card.empty}>Loading roles…</div>
      ) : (
        <>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <SectionLabel>
              {selectedOrgId ? `Built-in Roles (${orgRoles.length})` : `Roles (${visibleCustomRoles.length})`}
            </SectionLabel>
            <OrgScopeToggle orgs={orgs} value={selectedOrgId} onChange={setSelectedOrgId} />
          </div>

          {orgErr && <div style={banner.err}>{orgErr}</div>}

          {selectedOrgId ? (
            orgLoading ? (
              <div style={card.empty}>Loading org roles…</div>
            ) : (
              <OrgScopedRoleTable
                roles={orgRoles}
                selectedRole={selectedMemberRole}
                onSelectRole={(role) => setSelectedMemberRole((prev) => (prev === role ? null : role))}
              />
            )
          ) : (
            // Merged table: all 6 roles together (Participant Retail, Super
            // Admin (Secondary), then the 4 built-in system roles) — listRoles()
            // already returns them in this order. The Type column (Built-in /
            // Custom badge, from RoleTable's r.is_system check) still shows the
            // distinction per row, and the Actions column still shows Edit only
            // for non-system (custom) rows — unchanged from before the merge.
            <RoleTable roles={visibleCustomRoles} onOpen={setSelected} />
          )}

          {selectedOrgId && (() => {
            // Filtering by "Program Manager" also includes Secondary PM
            // accounts — Secondary PM is a flavor of program_manager, not a
            // separate persona, so clicking the PM row should surface both.
            const visibleMembers = selectedMemberRole
              ? members.filter((m) =>
                  m.effective_role === selectedMemberRole ||
                  (selectedMemberRole === "program_manager" && m.effective_role === "Secondary PM")
                )
              : members;
            return (
              <>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <SectionLabel>Members ({visibleMembers.length})</SectionLabel>
                  {selectedMemberRole && (
                    <button onClick={() => setSelectedMemberRole(null)} style={btn.ghostSm}>
                      Show All Members
                    </button>
                  )}
                </div>
                {orgLoading ? (
                  <div style={card.empty}>Loading members…</div>
                ) : (
                  <MembersTable
                    members={visibleMembers}
                    emptyMessage={selectedMemberRole ? "No members currently hold this role." : undefined}
                    onViewPermissions={setPermMember}
                    onAddPM={() => setShowAddPM(true)}
                  />
                )}
              </>
            );
          })()}

          {showAddPM && (
            <AddSecondaryPMModal
              orgId={selectedOrgId}
              secondaryPMRole={customRoles.find((r) => r.name === "Secondary PM") ?? null}
              onClose={() => setShowAddPM(false)}
              onDone={() => { setShowAddPM(false); loadOrgScoped(selectedOrgId); }}
            />
          )}
        </>
      )}
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: 13, fontWeight: 700, color: C.navy }}>{children}</div>;
}

// ── Role table (built-in or custom) ─────────────────────────────────────────

function RoleTable({ roles, onOpen }: { roles: CustomRoleDTO[]; onOpen: (r: CustomRoleDTO) => void }) {
  return (
    <div style={card.table}>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr style={{ background: C.page }}>
            {["Role", "Type", "Users", "Description", "Actions"].map((h) => <th key={h} style={th}>{h}</th>)}
          </tr>
        </thead>
        <tbody>
          {roles.map((r) => (
            <tr key={r.id} style={{ borderTop: `1px solid ${C.border}` }}>
              <td style={td}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <div style={{ width: 30, height: 30, borderRadius: "50%", background: r.color || C.slate, color: "#fff", fontWeight: 700, fontSize: 12, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    {(r.name[0] ?? "R").toUpperCase()}
                  </div>
                  <span style={{ fontSize: 13, fontWeight: 600, color: C.navy }}>{r.name}</span>
                </div>
              </td>
              <td style={td}>
                <span style={pill(r.is_system ? C.slate : C.orange)}>{r.is_system ? "Built-in" : "Custom"}</span>
              </td>
              <td style={{ ...td, fontSize: 13, fontWeight: 600, color: C.navy }}>{r.user_count}</td>
              <td style={{ ...td, fontSize: 12, color: C.slateL, maxWidth: 380 }}>{r.description}</td>
              <td style={td}>
                <div style={{ display: "flex", gap: 8 }}>
                  <button onClick={() => onOpen(r)} style={btn.ghostSm}>View Permissions</button>
                  {!r.is_system && <button onClick={() => onOpen(r)} style={btn.ghostSm}>Edit</button>}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Org scope toggle (new, additive) ────────────────────────────────────────
// Matches the "All Orgs / [Org Name]" dropdown already used on Organizations,
// Live Sessions, and other superadmin tabs (see OrgFilterDropdown in
// app/dashboard/superadmin/page.tsx). Kept local to this component rather
// than importing that private function, so no other tab's wiring is touched.
function OrgScopeToggle({ orgs, value, onChange }: {
  orgs: OrgResponse[]; value: string; onChange: (id: string) => void;
}) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <span style={{ fontSize: 11, color: C.muted, fontWeight: 600, ...ff }}>Org:</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{
          ...ff, fontSize: 12, fontWeight: 600, color: C.navy,
          background: "#fff", border: `1px solid ${C.border}`, borderRadius: 8,
          padding: "6px 10px", cursor: "pointer", minWidth: 150, outline: "none",
        }}
      >
        <option value="">All Orgs</option>
        {orgs.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
      </select>
    </div>
  );
}

// ── Org-scoped Built-in Roles table (new, additive) ─────────────────────────
// Distinct from RoleTable: these rows are per-org counts for a persona, not
// role records with an id — no click-through detail view (that would show
// unscoped, platform-wide data, which would be misleading here). Rows are
// clickable to filter the Members table below to just that role; the
// selected-row tint/border matches the same selected-state pattern already
// used for the sub-tabs in RoleDetail and the "Inherit Permissions From"
// buttons in the create-role wizard (orange tint + orange border).
function OrgScopedRoleTable({ roles, selectedRole, onSelectRole }: {
  roles: OrgScopedRoleDTO[];
  selectedRole: string | null;
  onSelectRole: (role: string) => void;
}) {
  return (
    <div style={card.table}>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr style={{ background: C.page }}>
            {["Role", "Users in this Org"].map((h) => <th key={h} style={th}>{h}</th>)}
          </tr>
        </thead>
        <tbody>
          {roles.map((r) => {
            const on = selectedRole === r.role;
            return (
              <tr
                key={r.role}
                onClick={() => onSelectRole(r.role)}
                style={{
                  borderTop: `1px solid ${C.border}`, cursor: "pointer",
                  background: on ? "rgba(239,78,36,0.06)" : "transparent",
                  boxShadow: on ? `inset 3px 0 0 ${C.orange}` : "none",
                }}
              >
                <td style={td}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <div style={{ width: 30, height: 30, borderRadius: "50%", background: r.color, color: "#fff", fontWeight: 700, fontSize: 12, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                      {r.label[0]?.toUpperCase() ?? "R"}
                    </div>
                    <span style={{ fontSize: 13, fontWeight: on ? 700 : 600, color: on ? C.orange : C.navy }}>{r.label}</span>
                  </div>
                </td>
                <td style={{ ...td, fontSize: 13, fontWeight: 600, color: C.navy }}>{r.user_count}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ── Members table (new, additive) ───────────────────────────────────────────
// Only rendered when a specific org is selected. Name + Current Role (read-
// only badge) + a "View Permissions" action for per-account permission
// editing (see MemberPermissionsPage). Role reassignment from this view was
// removed earlier — the underlying PATCH /orgs/:id/members/:userId/role
// endpoint and its backend logic are untouched and may still be used
// elsewhere later.
function MembersTable({ members, emptyMessage, onViewPermissions, onAddPM }: {
  members: OrgMemberDTO[];
  emptyMessage?: string;
  onViewPermissions: (m: OrgMemberDTO) => void;
  onAddPM: () => void;
}) {
  if (members.length === 0) {
    return <div style={{ ...card.table, ...card.empty }}>{emptyMessage ?? "No members in this org yet."}</div>;
  }

  return (
    <div style={card.table}>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr style={{ background: C.page }}>
            {["Name", "Current Role", "Actions"].map((h) => <th key={h} style={th}>{h}</th>)}
          </tr>
        </thead>
        <tbody>
          {members.map((m) => (
            <tr key={m.user_id} style={{ borderTop: `1px solid ${C.border}` }}>
              <td style={td}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <div style={{ width: 30, height: 30, borderRadius: "50%", background: C.navy, color: "#fff", fontWeight: 700, fontSize: 12, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    {initials(m.name)}
                  </div>
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <span style={{ fontSize: 13, fontWeight: 600, color: C.navy }}>{m.name}</span>
                      {/* Primary/Secondary is a PM-only distinction — every
                          other role has no such tag. */}
                      {m.effective_role === "program_manager" && (
                        <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: 0.5, color: C.muted, textTransform: "uppercase" }}>Primary</span>
                      )}
                      {m.effective_role === "Secondary PM" && (
                        <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: 0.5, color: C.orange, textTransform: "uppercase" }}>Secondary</span>
                      )}
                    </div>
                    <div style={{ fontSize: 11, color: C.muted }}>{m.email}</div>
                  </div>
                </div>
              </td>
              <td style={td}>
                <span style={pill(C.indigo)}>{m.effective_role === "Secondary PM" ? "program_manager" : m.effective_role}</span>
              </td>
              <td style={td}>
                <div style={{ display: "flex", gap: 8 }}>
                  <button onClick={() => onViewPermissions(m)} style={btn.ghostSm}>View Permissions</button>
                  {/* Only the Primary PM's row (the base program_manager system
                      role) gets this — Secondary PM rows and every other role
                      are excluded. */}
                  {m.effective_role === "program_manager" && (
                    <button onClick={onAddPM} style={btn.ghostSm}>+ Add</button>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Per-account permission editor (Members tab) ─────────────────────────────
// Full page (same pattern as RoleDetail), reached via "View Permissions" on a
// Members row. Pre-checked from this account's CURRENT effective permissions
// (GET /orgs/:id/members/:userId/permissions — rbac.Resolve for this user,
// not a static role definition, since they may already be on a personal
// custom role from a prior edit here). Saving writes ONLY this account's
// personal custom role (create-or-update) and reassigns only this account to
// it — see updateMemberPermissionsService on the backend. This NEVER edits
// program_manager/faculty/coach/participant or a shared custom role like
// Participant Retail — that remains the separate Roles-tab Edit flow.
function MemberPermissionsPage({ orgId, member, onBack }: {
  orgId: string; member: OrgMemberDTO; onBack: () => void;
}) {
  // Editable ONLY for program_manager — faculty/coach/participant (and any
  // custom-role member) get the identical grid purely as a read-only view,
  // no Save. Read dynamically off the member's CURRENT effective_role every
  // render, so a later reassignment immediately flips this without any
  // per-user special-casing.
  const editable = member.effective_role === "program_manager";
  const [perms, setPerms]   = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [dirty, setDirty]   = useState(false);
  const [saving, setSaving] = useState(false);
  const [full, setFull]     = useState(false);
  const [msg, setMsg]       = useState("");
  const [err, setErr]       = useState("");

  useEffect(() => {
    setLoading(true); setErr("");
    rolesApi.getMemberPermissions(orgId, member.user_id)
      .then((r) => {
        setFull(!!r.data?.full);
        setPerms(new Set(r.data?.permissions ?? []));
      })
      .catch((e) => setErr((e as Error).message))
      .finally(() => setLoading(false));
  }, [orgId, member.user_id]);

  // Scope the grid to tabs relevant to THIS member's own role, instead of
  // every superadmin-wide sidebar tab. Prefer the real per-role nav
  // (ROLE_TAB_LABELS, sourced from nav-config.ts — the actual product
  // sidebar that role sees) for the 4 base personas, in that sidebar's own
  // tab order (not the superadmin catalog's order); for anything else
  // (a custom-role member) fall back to whatever resources they're actually
  // granted at least one action on, from the live permission set just
  // fetched above.
  const scopedRowGroups = scopeRowGroupsForRole(member.effective_role, perms);

  function toggle(key: string) {
    setPerms((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
    setDirty(true);
  }

  async function save() {
    setSaving(true); setErr(""); setMsg("");
    try {
      await rolesApi.updateMemberPermissions(orgId, member.user_id, Array.from(perms));
      setMsg("Permissions saved for this account."); setDirty(false);
    } catch (e) { setErr((e as Error).message); }
    finally { setSaving(false); }
  }

  return (
    <div style={{ ...ff, padding: 24, display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Header — mirrors RoleDetail's header layout */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div style={{ display: "flex", gap: 14 }}>
          <div style={{ width: 44, height: 44, borderRadius: "50%", background: C.navy, color: "#fff", fontWeight: 700, fontSize: 17, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            {initials(member.name)}
          </div>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ fontSize: 18, fontWeight: 700, color: C.navy }}>{member.name}</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4 }}>
              <span style={pill(C.indigo)}>{member.effective_role}</span>
              <span style={{ fontSize: 12, color: C.muted }}>{member.email}</span>
            </div>
            <div style={{ fontSize: 12, color: C.slateL, marginTop: 6, maxWidth: 620 }}>
              {editable
                ? <>Editing permissions for this account only. Saving never changes {member.effective_role} for
                    any other member, and never edits the shared role definition.</>
                : <>Read-only — per-account permission editing is only available for Program Manager accounts.
                    This shows {member.name}&apos;s actual current permissions.</>}
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
          This account has unrestricted (superadmin bootstrap) access — nothing to edit here.
        </div>
      ) : (
        <>
          <PermissionCatalogGrid selected={perms} editable={editable} onToggle={editable ? toggle : undefined} rowGroups={scopedRowGroups} />
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
            {editable ? (
              <>
                <button onClick={onBack} style={btn.ghost}>Cancel</button>
                <button onClick={save} disabled={!dirty || saving} style={{ ...btn.prim, opacity: !dirty || saving ? 0.6 : 1 }}>
                  {saving ? "Saving…" : "Save Permissions"}
                </button>
              </>
            ) : (
              <button onClick={onBack} style={btn.ghost}>Close</button>
            )}
          </div>
        </>
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
//  ROLE DETAIL — Permissions / Users / Settings
// ════════════════════════════════════════════════════════════════════════════

function RoleDetail({ role, onBack, onChanged }: {
  role: CustomRoleDTO; onBack: () => void; onChanged: () => void;
}) {
  const [tab, setTab] = useState<"permissions" | "users" | "settings">("permissions");
  const permCount = role.permissions.length;
  const tabs: { id: typeof tab; label: string }[] = [
    { id: "permissions", label: "Permissions" },
    { id: "users",       label: "Users" },
    ...(role.is_system ? [] : [{ id: "settings" as const, label: "Settings" }]),
  ];

  return (
    <div style={{ ...ff, padding: 24, display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div style={{ display: "flex", gap: 14 }}>
          <div style={{ width: 44, height: 44, borderRadius: "50%", background: role.color || C.slate, color: "#fff", fontWeight: 700, fontSize: 17, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            {(role.name[0] ?? "R").toUpperCase()}
          </div>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ fontSize: 18, fontWeight: 700, color: C.navy }}>{role.name}</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4 }}>
              <span style={pill(role.is_system ? C.slate : C.orange)}>{role.is_system ? "Built-in" : "Custom"}</span>
              <span style={{ fontSize: 12, color: C.muted }}>{role.user_count} users · {permCount} permissions</span>
            </div>
            {role.description && <div style={{ fontSize: 13, color: C.slateL, marginTop: 6, maxWidth: 620 }}>{role.description}</div>}
          </div>
        </div>
        <button onClick={onBack} style={{ ...btn.ghost, border: "none", color: C.muted }}>← Back</button>
      </div>

      {/* Sub-tabs */}
      <div style={{ display: "flex", gap: 8 }}>
        {tabs.map((t) => {
          const on = tab === t.id;
          return (
            <button key={t.id} onClick={() => setTab(t.id)} style={{
              ...ff, padding: "7px 16px", borderRadius: 20, fontSize: 12, cursor: "pointer",
              fontWeight: on ? 700 : 500,
              background: on ? "rgba(239,78,36,0.08)" : "#fff",
              color: on ? C.orange : C.slateL,
              border: `1px solid ${on ? C.orange : C.border}`,
            }}>
              {t.label}
            </button>
          );
        })}
      </div>

      {tab === "permissions" && <PermissionGrid role={role} onChanged={onChanged} />}
      {tab === "users"       && <RoleUsers role={role} onChanged={onChanged} />}
      {tab === "settings" && !role.is_system && <RoleSettings role={role} onChanged={onChanged} onBack={onBack} />}
    </div>
  );
}

// ── Permissions grid — editable for custom roles, read-only for built-in ─────
// Driven by role.permissions (the real "resource:action" grants — the same
// data rbac.Resolve() actually enforces), never role.permission_grid (a
// legacy, narrower 10-module derivation that's been retired from the UI).

function PermissionGrid({ role, onChanged }: { role: CustomRoleDTO; onChanged: () => void }) {
  const editable = !role.is_system;
  const [perms, setPerms]   = useState<Set<string>>(new Set(role.permissions));
  const [dirty, setDirty]   = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg]       = useState("");
  const [err, setErr]       = useState("");

  useEffect(() => { setPerms(new Set(role.permissions)); setDirty(false); }, [role.id, role.permissions]);

  // Scope to this role's OWN base persona's real sidebar tabs (e.g.
  // Participant Retail's base_role is "participant", so it shows the same
  // tabs a real participant's sidebar has) instead of the full superadmin
  // catalog. Falls back to the full catalog for base_role "none"/"superadmin".
  const scopedRowGroups = scopeRowGroupsForRole(role.base_role, perms);

  function toggle(key: string) {
    if (!editable) return;
    setPerms((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
    setDirty(true);
  }

  async function save() {
    setSaving(true); setErr(""); setMsg("");
    try {
      await rolesApi.updateRole(role.id, { permissions: Array.from(perms) });
      setMsg("Permissions saved."); setDirty(false); onChanged();
      setTimeout(() => setMsg(""), 3000);
    } catch (e) { setErr((e as Error).message); }
    finally { setSaving(false); }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {err && <div style={banner.err}>{err}</div>}
      {msg && <div style={banner.ok}>{msg}</div>}

      <PermissionCatalogGrid selected={perms} editable={editable} onToggle={toggle} rowGroups={scopedRowGroups} />

      {editable && (
        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <button onClick={save} disabled={!dirty || saving} style={{ ...btn.prim, opacity: !dirty || saving ? 0.6 : 1 }}>
            {saving ? "Saving…" : "Save Permissions"}
          </button>
        </div>
      )}
    </div>
  );
}

// Fixed 4-column layout: View / Create / Edit / Delete. Each column maps to
// whichever real action key a resource actually uses for that concept ("Edit"
// covers both "update" and "write", since resources use one or the other,
// never both). Resource actions with no equivalent in these 4 (grade, manage,
// send, announce, self_read, admin) aren't shown here — any such permission a
// role/account already has stays intact on Save (only the visible checkboxes
// can add or remove a grant), it's just not toggleable from this grid.
const GRID_COLUMNS: { label: string; keys: string[] }[] = [
  { label: "View",   keys: ["read"] },
  { label: "Create", keys: ["create"] },
  { label: "Edit",   keys: ["update", "write"] },
  { label: "Delete", keys: ["delete"] },
];

// Real permission catalog grid, shared by RoleDetail's Permissions tab, the
// create/edit-role wizard, and the per-account Members-tab editor. One row
// per real sidebar tab (SIDEBAR_PERMISSION_MODULES, grouped by label so a
// tab backed by more than one resource — Grading & Capstone, Faculty
// Management — renders as two sub-rows under one module instead of duplicate
// top-level rows). A row with no backing resource (Billing, Integrations) is
// greyed out with "Not yet enforced" — there is no RBAC key for it yet.
// `rowGroups` defaults to the full catalog (every sidebar tab); the
// Members-tab per-account view passes a filtered subset scoped to that
// member's own role instead of showing every superadmin-wide tab.
function PermissionCatalogGrid({ selected, editable, onToggle, rowGroups = PERMISSION_ROW_GROUPS }: {
  selected: Set<string>; editable: boolean; onToggle?: (key: string) => void;
  rowGroups?: typeof PERMISSION_ROW_GROUPS;
}) {
  return (
    <div style={{ ...card.table, overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr style={{ background: C.page }}>
            <th style={{ ...th, minWidth: 220 }}>MODULE</th>
            {GRID_COLUMNS.map((c) => <th key={c.label} style={{ ...th, textAlign: "center", whiteSpace: "nowrap" }}>{c.label}</th>)}
          </tr>
        </thead>
        <tbody>
          {rowGroups.map(([label, rows]) => {
            const enforced = rows.filter((r) => r.resource !== "");
            if (enforced.length === 0) {
              return (
                <tr key={label} style={{ borderTop: `1px solid ${C.border}` }}>
                  <td style={{ ...td, fontSize: 13, color: C.navy }}>{label}</td>
                  <td colSpan={GRID_COLUMNS.length} style={{ ...td, fontSize: 11, color: C.muted, fontStyle: "italic" }}>
                    Not yet enforced
                  </td>
                </tr>
              );
            }
            return enforced.map((row, ri) => (
              <tr key={row.key} style={{ borderTop: ri === 0 ? `1px solid ${C.border}` : "none" }}>
                <td style={{ ...td, fontSize: 13, color: C.navy }}>
                  {label}
                  {enforced.length > 1 && (
                    <span style={{ display: "block", fontSize: 10, fontWeight: 700, color: C.muted, textTransform: "uppercase", marginTop: 2 }}>
                      {row.resource}
                    </span>
                  )}
                </td>
                {GRID_COLUMNS.map((c) => {
                  const match = row.actions.find((a) => c.keys.includes(a.key));
                  // Read-only views only ever show a column the resource
                  // actually has (a real match) — no point rendering a dash
                  // that can't be interacted with anyway. Editable views
                  // always render a live, clickable checkbox in every
                  // column, using the column's canonical action key
                  // (c.keys[0]) when the resource has no matching grant yet,
                  // so every cell in the table is selectable as requested.
                  if (!match && !editable) {
                    return <td key={c.label} style={{ ...td, textAlign: "center", color: C.border }}>–</td>;
                  }
                  const actionKey = match?.key ?? c.keys[0];
                  const key = `${row.resource}:${actionKey}`;
                  const on = selected.has(key);
                  return (
                    <td key={c.label} style={{ ...td, textAlign: "center" }}>
                      {editable ? (
                        <input type="checkbox" checked={on} onChange={() => onToggle?.(key)}
                          style={{ width: 15, height: 15, accentColor: C.orange, cursor: "pointer" }} />
                      ) : (
                        <span style={{ fontSize: 13, fontWeight: 700, color: on ? C.green : C.border }}>{on ? "✓" : "—"}</span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ));
          })}
        </tbody>
      </table>
    </div>
  );
}

// ── Users tab ───────────────────────────────────────────────────────────────

function RoleUsers({ role, onChanged }: { role: CustomRoleDTO; onChanged: () => void }) {
  const [users, setUsers]     = useState<RoleUserDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAssign, setShowAssign] = useState(false);
  const [err, setErr]         = useState("");

  const load = useCallback(() => {
    setLoading(true);
    rolesApi.roleUsers(role.id)
      .then((r) => setUsers(r.data ?? []))
      .catch((e) => setErr(e.message))
      .finally(() => setLoading(false));
  }, [role.id]);

  useEffect(() => { load(); }, [load]);

  async function remove(u: RoleUserDTO) {
    if (!u.assignment_id) return;
    if (!confirm(`Remove ${u.name} from this role?`)) return;
    try { await rolesApi.deleteAssignment(u.assignment_id); load(); onChanged(); }
    catch (e) { setErr((e as Error).message); }
  }

  // Group by organization for display — a user with no org membership
  // (org_name empty) falls into an "Unassigned" bucket rather than being
  // dropped or shown ungrouped.
  const groups = new Map<string, RoleUserDTO[]>();
  for (const u of users) {
    const key = u.org_name || "Unassigned";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(u);
  }
  const orderedGroups = Array.from(groups.entries()).sort(([a], [b]) => {
    if (a === "Unassigned") return 1;
    if (b === "Unassigned") return -1;
    return a.localeCompare(b);
  });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {err && <div style={banner.err}>{err}</div>}
      {loading ? (
        <div style={card.empty}>Loading users…</div>
      ) : users.length === 0 ? (
        <div style={{ ...card.table, ...card.empty }}>
          {role.is_system ? "No users currently hold this role." : "No users assigned yet."}
        </div>
      ) : (
        orderedGroups.map(([orgName, groupUsers]) => (
          <div key={orgName} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, letterSpacing: 0.5, textTransform: "uppercase" }}>
              {orgName} ({groupUsers.length})
            </div>
            {groupUsers.map((u) => (
              <div key={u.id} style={{ ...card.plain, display: "flex", alignItems: "center", gap: 12, padding: "14px 18px" }}>
                <div style={{ width: 36, height: 36, borderRadius: "50%", background: C.navy, color: "#fff", fontWeight: 700, fontSize: 12, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  {initials(u.name)}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: C.navy }}>{u.name}</div>
                  <div style={{ fontSize: 11, color: C.muted }}>{u.email}</div>
                </div>
                {!role.is_system && u.assignment_id && (
                  <button onClick={() => remove(u)} style={btn.dangerSm}>Remove</button>
                )}
              </div>
            ))}
          </div>
        ))
      )}

      {/* Assign — custom roles only */}
      {!role.is_system && (
        <button onClick={() => setShowAssign(true)} style={{
          ...ff, border: `1px dashed ${C.border}`, background: "#fff", borderRadius: 10,
          padding: "14px", fontSize: 13, fontWeight: 600, color: C.muted, cursor: "pointer",
        }}>
          + Assign Users
        </button>
      )}

      {showAssign && (
        <AssignUsersModal
          roleId={role.id}
          existing={new Set(users.map((u) => u.id))}
          onClose={() => setShowAssign(false)}
          onDone={() => { setShowAssign(false); load(); onChanged(); }}
        />
      )}
    </div>
  );
}

function AssignUsersModal({ roleId, existing, onClose, onDone }: {
  roleId: string; existing: Set<string>; onClose: () => void; onDone: () => void;
}) {
  const [users, setUsers]       = useState<UserRow[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [saving, setSaving]     = useState(false);

  useEffect(() => {
    api.get<ApiResponse<UserRow[]>>("/users?limit=200").then((r) => setUsers(r.data ?? [])).catch(() => {});
  }, []);

  function toggle(id: string) {
    setSelected((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }

  async function save() {
    setSaving(true);
    await Promise.all(Array.from(selected).map((uid) =>
      rolesApi.createAssignment({ user_id: uid, role_id: roleId }).catch(() => null)));
    onDone();
  }

  const assignable = users.filter((u) => !existing.has(u.id));

  return (
    <Modal title="Assign Users" onClose={onClose} wide>
      <div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: 400, overflowY: "auto" }}>
        {assignable.length === 0 && <div style={{ fontSize: 13, color: C.muted }}>All users already have this role.</div>}
        {assignable.map((u) => {
          const on = selected.has(u.id);
          return (
            <label key={u.id} style={{
              display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", cursor: "pointer",
              border: `1px solid ${on ? C.orange : C.border}`, borderRadius: 10,
              background: on ? "rgba(239,78,36,0.04)" : "#fff",
            }}>
              <div style={{ width: 34, height: 34, borderRadius: "50%", background: C.navy, color: "#fff", fontWeight: 700, fontSize: 12, display: "flex", alignItems: "center", justifyContent: "center" }}>{initials(u.name)}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: C.navy }}>{u.name}</div>
                <div style={{ fontSize: 11, color: C.muted }}>{u.email}</div>
              </div>
              <input type="checkbox" checked={on} onChange={() => toggle(u.id)} style={{ width: 18, height: 18, accentColor: C.orange }} />
            </label>
          );
        })}
      </div>
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 16 }}>
        <button onClick={onClose} style={btn.ghost}>Cancel</button>
        <button onClick={save} disabled={saving || selected.size === 0} style={{ ...btn.prim, opacity: saving || selected.size === 0 ? 0.6 : 1 }}>
          {saving ? "Assigning…" : `Assign ${selected.size || ""}`.trim()}
        </button>
      </div>
    </Modal>
  );
}

// ── Settings tab (custom roles) ─────────────────────────────────────────────

function RoleSettings({ role, onChanged, onBack }: {
  role: CustomRoleDTO; onChanged: () => void; onBack: () => void;
}) {
  const [name, setName] = useState(role.name);
  const [desc, setDesc] = useState(role.description);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  async function save() {
    if (!name.trim()) { setErr("Role name is required"); return; }
    setSaving(true); setErr(""); setMsg("");
    try {
      await rolesApi.updateRole(role.id, { name: name.trim(), description: desc });
      setMsg("Saved."); onChanged();
      setTimeout(() => setMsg(""), 3000);
    } catch (e) { setErr((e as Error).message); }
    finally { setSaving(false); }
  }

  async function del() {
    if (!confirm(`Delete role "${role.name}"? Users assigned to it will revert to their base persona.`)) return;
    try { await rolesApi.deleteRole(role.id); onBack(); }
    catch (e) { setErr((e as Error).message); }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={card.plain}>
        <div style={cardHead}>Role Settings</div>
        {err && <div style={{ ...banner.err, marginBottom: 12 }}>{err}</div>}
        {msg && <div style={{ ...banner.ok, marginBottom: 12 }}>{msg}</div>}
        <Field label="Role Name">
          <input value={name} onChange={(e) => setName(e.target.value)} style={input} />
        </Field>
        <Field label="Description">
          <textarea value={desc} onChange={(e) => setDesc(e.target.value)} style={{ ...input, minHeight: 80, resize: "vertical" as const }} />
        </Field>
        <button onClick={save} disabled={saving} style={{ ...btn.prim, opacity: saving ? 0.6 : 1 }}>
          {saving ? "Saving…" : "Save Changes"}
        </button>
      </div>

      <div style={{ ...card.plain, border: `1px solid ${C.danger}40`, background: "rgba(239,68,68,0.03)" }}>
        <div style={{ ...cardHead, color: C.danger }}>Delete Role</div>
        <div style={{ fontSize: 12, color: C.slateL, marginBottom: 14 }}>
          Permanently delete this role. Users assigned to it will revert to their base persona.
        </div>
        <button onClick={del} style={{ ...btn.dangerSm, padding: "9px 18px", fontSize: 12 }}>Delete Role</button>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
//  CREATE CUSTOM ROLE — 3-step wizard
// ════════════════════════════════════════════════════════════════════════════

function RoleFormModal({ role, orgs, onClose, onSaved }: {
  role: CustomRoleDTO | null; orgs: OrgResponse[];
  onClose: () => void; onSaved: () => void;
}) {
  const isEdit = !!role;
  const totalSteps = isEdit ? 2 : 3;
  const STEP_LABELS = isEdit ? ["Role Details", "Permissions"] : ["Role Details", "Permissions", "Assign Users"];

  const [step, setStep]         = useState(1);
  const [name, setName]         = useState(role?.name ?? "");
  const [description, setDesc]  = useState(role?.description ?? "");
  const [baseRole, setBaseRole] = useState<string>(role?.base_role ?? "none");
  const [color, setColor]       = useState(role?.color ?? ROLE_COLORS[0]);
  const [orgId]                 = useState(role?.org_id ?? "");
  const [perms, setPerms]       = useState<Set<string>>(new Set(role?.permissions ?? []));
  const [users, setUsers]       = useState<UserRow[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [saving, setSaving]     = useState(false);
  const [err, setErr]           = useState("");

  useEffect(() => {
    if (isEdit) return;
    api.get<ApiResponse<UserRow[]>>("/users?limit=200")
      .then((r) => setUsers(r.data ?? [])).catch(() => {});
  }, [isEdit]);

  function togglePerm(key: string) {
    setPerms((prev) => { const next = new Set(prev); next.has(key) ? next.delete(key) : next.add(key); return next; });
  }
  function toggleUser(id: string) {
    setSelected((prev) => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next; });
  }

  function next() {
    if (step === 1 && !name.trim()) { setErr("Role name is required"); return; }
    setErr("");
    setStep((s) => Math.min(totalSteps, s + 1));
  }
  function back() { setErr(""); setStep((s) => Math.max(1, s - 1)); }

  async function submit() {
    if (!name.trim()) { setErr("Role name is required"); setStep(1); return; }
    setSaving(true); setErr("");
    try {
      if (isEdit) {
        await rolesApi.updateRole(role!.id, {
          name: name.trim(), description, base_role: baseRole, color, permissions: Array.from(perms),
        });
      } else {
        const created = await rolesApi.createRole({
          name: name.trim(), description, base_role: baseRole, color,
          permissions: Array.from(perms),
          ...(orgId ? { org_id: orgId } : {}),
        });
        const roleId = created.data.id;
        await Promise.all(
          Array.from(selected).map((uid) =>
            rolesApi.createAssignment({ user_id: uid, role_id: roleId }).catch(() => null)
          )
        );
      }
      onSaved();
    } catch (e) { setErr((e as Error).message); setSaving(false); }
  }

  return (
    <Modal title={isEdit ? "Edit Custom Role" : "Create Custom Role"} onClose={onClose} wide>
      {/* Progress bar */}
      <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
        {Array.from({ length: totalSteps }).map((_, i) => (
          <div key={i} style={{ flex: 1, height: 3, borderRadius: 2, background: i < step ? C.orange : C.border }} />
        ))}
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: C.orange }}>Step {step} of {totalSteps}</span>
        <span style={{ fontSize: 12, fontWeight: 600, color: C.muted }}>{STEP_LABELS[step - 1]}</span>
      </div>

      {err && <div style={{ ...banner.err, marginBottom: 14 }}>{err}</div>}

      {step === 1 && (
        <div>
          <Field label="Role Name *">
            <input value={name} onChange={(e) => setName(e.target.value)} style={input} placeholder="e.g. Regional Coordinator" autoFocus />
          </Field>
          <Field label="Description">
            <textarea value={description} onChange={(e) => setDesc(e.target.value)} style={{ ...input, minHeight: 70, resize: "vertical" as const }} placeholder="Optional" />
          </Field>
          <Field label="Role Color">
            <div style={{ display: "flex", gap: 10 }}>
              {ROLE_COLORS.map((c) => (
                <button key={c} onClick={() => setColor(c)} title={c} style={{
                  width: 30, height: 30, borderRadius: "50%", background: c, cursor: "pointer",
                  border: color === c ? `2px solid ${C.navy}` : "2px solid transparent",
                  outline: color === c ? `2px solid ${c}` : "none", outlineOffset: 1,
                }} />
              ))}
            </div>
          </Field>
          <Field label="Inherit Permissions From">
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {INHERIT_OPTIONS.map((opt) => {
                const on = baseRole === opt.value;
                return (
                  <button key={opt.value} onClick={() => setBaseRole(opt.value)} style={{
                    ...ff, padding: "8px 14px", borderRadius: 8, fontSize: 12, cursor: "pointer",
                    fontWeight: on ? 700 : 500,
                    background: on ? "rgba(239,78,36,0.08)" : "#fff",
                    color: on ? C.orange : C.slateL,
                    border: `1px solid ${on ? C.orange : C.border}`,
                  }}>
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </Field>
        </div>
      )}

      {step === 2 && (
        <div>
          <div style={{ fontSize: 13, color: C.slateL, marginBottom: 12 }}>
            Check the permissions this role should have for each module.
          </div>
          <PermissionCatalogGrid selected={perms} editable onToggle={togglePerm} />
        </div>
      )}

      {step === 3 && !isEdit && (
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 16px", borderRadius: 10, background: `${color}12`, marginBottom: 16 }}>
            <div style={{ width: 40, height: 40, borderRadius: "50%", background: color, color: "#fff", fontWeight: 700, fontSize: 15, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              {(name.trim()[0] ?? "R").toUpperCase()}
            </div>
            <div>
              <div style={{ fontSize: 14, fontWeight: 700, color: C.navy }}>{name.trim() || "Untitled Role"}</div>
              <div style={{ fontSize: 12, color: C.muted }}>
                {perms.size} permission{perms.size === 1 ? "" : "s"} · {BASE_ROLE_LABELS[baseRole] ?? "Custom"}
              </div>
            </div>
          </div>

          <div style={{ fontSize: 13, color: C.slateL, marginBottom: 12 }}>
            Select users to assign this role to immediately (optional — you can do this later).
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: 300, overflowY: "auto" }}>
            {users.length === 0 && <div style={{ fontSize: 13, color: C.muted }}>No users found.</div>}
            {users.map((u) => {
              const on = selected.has(u.id);
              return (
                <label key={u.id} style={{
                  display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", cursor: "pointer",
                  border: `1px solid ${on ? C.orange : C.border}`, borderRadius: 10,
                  background: on ? "rgba(239,78,36,0.04)" : "#fff",
                }}>
                  <div style={{ width: 34, height: 34, borderRadius: "50%", background: C.navy, color: "#fff", fontWeight: 700, fontSize: 12, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    {initials(u.name)}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: C.navy }}>{u.name}</div>
                    <div style={{ fontSize: 11, color: C.muted }}>{u.email}</div>
                  </div>
                  <input type="checkbox" checked={on} onChange={() => toggleUser(u.id)} style={{ width: 18, height: 18, accentColor: C.orange, cursor: "pointer" }} />
                </label>
              );
            })}
          </div>
        </div>
      )}

      <div style={{ display: "flex", justifyContent: "space-between", gap: 8, marginTop: 20 }}>
        {step === 1
          ? <button onClick={onClose} style={btn.ghost}>Cancel</button>
          : <button onClick={back} style={btn.ghost}>← Back</button>}

        {step < totalSteps
          ? <button onClick={next} style={btn.prim}>
              {step === 1 ? "Next: Permissions →" : "Next: Assign Users →"}
            </button>
          : <button onClick={submit} disabled={saving} style={{ ...btn.prim, opacity: saving ? 0.6 : 1 }}>
              {saving ? "Saving…" : isEdit ? "✓ Save Changes" : "✓ Create Role"}
            </button>}
      </div>
    </Modal>
  );
}

// ── Add Secondary PM modal (org-scoped Members tab) ─────────────────────────
// Reuses the existing org-level invite mechanism (POST /invitations/faculty,
// same one used for Faculty/Coach org invites) — no new user-creation path.
// Passing role_id (the "Secondary PM" custom role) makes the invite assign
// that custom role directly on accept, instead of the base faculty/coach
// persona; same replace-not-duplicate / mutually-exclusive assignment logic
// already used for every other invite variant.
function AddSecondaryPMModal({ orgId, secondaryPMRole, onClose, onDone }: {
  orgId: string; secondaryPMRole: CustomRoleDTO | null;
  onClose: () => void; onDone: () => void;
}) {
  const [name, setName]     = useState("");
  const [email, setEmail]   = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr]       = useState("");

  async function submit() {
    if (!secondaryPMRole) { setErr("Secondary PM role not found."); return; }
    if (!name.trim() || !email.trim()) { setErr("Name and email are required."); return; }
    setSaving(true); setErr("");
    try {
      await invitationsApi.sendFaculty({
        email: email.trim(), org_id: orgId, name: name.trim(), role_id: secondaryPMRole.id,
      });
      onDone();
    } catch (e) { setErr((e as Error).message); setSaving(false); }
  }

  return (
    <Modal title="Add Secondary PM" onClose={onClose}>
      <div style={{ padding: "10px 14px", background: "rgba(239,78,36,0.04)", border: "1px solid rgba(239,78,36,0.15)", borderRadius: 8, fontSize: 12, color: C.muted, marginBottom: 16 }}>
        Invites a new <strong>Secondary PM</strong> for this organization — will receive login credentials.
      </div>

      {err && <div style={{ ...banner.err, marginBottom: 14 }}>{err}</div>}

      <Field label="Full Name *">
        <input style={input} placeholder="e.g. Priya Nair" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
      </Field>
      <Field label="Email *">
        <input style={input} type="email" placeholder="priya@company.com" value={email} onChange={(e) => setEmail(e.target.value)} />
      </Field>

      <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 8 }}>
        <button onClick={onClose} style={btn.ghost}>Cancel</button>
        <button onClick={submit} disabled={saving} style={{ ...btn.prim, opacity: saving ? 0.6 : 1 }}>
          {saving ? "Sending…" : "Send Invite"}
        </button>
      </div>
    </Modal>
  );
}

// ── Shared primitives & styles ──────────────────────────────────────────────

function initials(name: string) {
  return name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2) || "U";
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <label style={{ fontSize: 10, fontWeight: 700, color: C.muted, display: "block", marginBottom: 5, letterSpacing: 0.5, textTransform: "uppercase" }}>{label}</label>
      {children}
    </div>
  );
}

function Modal({ title, children, onClose, wide }: { title: string; children: React.ReactNode; onClose: () => void; wide?: boolean }) {
  return (
    <div onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{ position: "fixed", inset: 0, background: "rgba(28,37,81,0.5)", zIndex: 2000, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div style={{ ...ff, background: "#fff", borderRadius: 16, width: "100%", maxWidth: wide ? 640 : 480, maxHeight: "88vh", overflowY: "auto", boxShadow: "0 24px 64px rgba(28,37,81,0.22)" }}>
        <div style={{ padding: "18px 24px", borderBottom: `1px solid ${C.border}`, display: "flex", justifyContent: "space-between", alignItems: "center", position: "sticky", top: 0, background: "#fff", zIndex: 1 }}>
          <span style={{ fontSize: 15, fontWeight: 700, color: C.navy }}>{title}</span>
          <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 18, color: C.muted, cursor: "pointer" }}>✕</button>
        </div>
        <div style={{ padding: 24 }}>{children}</div>
      </div>
    </div>
  );
}

const pill = (color: string): React.CSSProperties => ({
  display: "inline-block", background: `${color}18`, color,
  fontSize: 10, fontWeight: 700, borderRadius: 20, padding: "3px 9px",
});
const th: React.CSSProperties = { padding: "11px 16px", textAlign: "left", fontSize: 11, fontWeight: 700, color: C.muted, letterSpacing: 0.5 };
const td: React.CSSProperties = { padding: "12px 16px", verticalAlign: "middle" };
const cardHead: React.CSSProperties = { fontSize: 13, fontWeight: 700, color: C.navy, marginBottom: 12 };
const input: React.CSSProperties = {
  width: "100%", border: `1px solid ${C.border}`, borderRadius: 8, padding: "9px 12px",
  fontSize: 13, color: C.navy, fontFamily: "Poppins, sans-serif", outline: "none", boxSizing: "border-box", background: "#fff",
};
const card = {
  table: { background: C.card, borderRadius: 12, border: `1px solid ${C.border}`, boxShadow: "0 1px 4px rgba(28,37,81,0.07)", overflow: "hidden" } as React.CSSProperties,
  plain: { background: C.card, borderRadius: 12, border: `1px solid ${C.border}`, boxShadow: "0 1px 4px rgba(28,37,81,0.07)", padding: 20 } as React.CSSProperties,
  empty: { padding: 40, textAlign: "center", color: C.muted, fontSize: 13 } as React.CSSProperties,
};
const btn = {
  prim:     { ...ff, padding: "9px 20px", background: C.orange, border: "none", borderRadius: 8, cursor: "pointer", fontSize: 12, fontWeight: 700, color: "#fff" } as React.CSSProperties,
  ghost:    { ...ff, padding: "8px 16px", background: "#fff", border: `1px solid ${C.border}`, borderRadius: 8, cursor: "pointer", fontSize: 12, fontWeight: 600, color: C.navy } as React.CSSProperties,
  ghostSm:  { ...ff, padding: "5px 12px", background: "#fff", border: `1px solid ${C.border}`, borderRadius: 6, cursor: "pointer", fontSize: 11, fontWeight: 600, color: C.navy } as React.CSSProperties,
  dangerSm: { ...ff, padding: "5px 12px", background: "#fff", border: `1px solid ${C.danger}40`, borderRadius: 6, cursor: "pointer", fontSize: 11, fontWeight: 600, color: C.danger } as React.CSSProperties,
};
const banner = {
  err: { background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.25)", borderRadius: 8, padding: "10px 14px", fontSize: 12, color: C.danger } as React.CSSProperties,
  ok:  { background: "rgba(34,197,94,0.08)", border: "1px solid rgba(34,197,94,0.25)", borderRadius: 8, padding: "10px 14px", fontSize: 12, color: "#16a34a" } as React.CSSProperties,
};
