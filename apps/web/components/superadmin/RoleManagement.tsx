"use client";

import { useState, useEffect, useCallback } from "react";
import { api, ApiResponse, OrgResponse } from "@/lib/api";
import {
  rolesApi, CustomRoleDTO, RolesSummaryDTO, RoleUserDTO,
  BASE_ROLE_LABELS, INHERIT_OPTIONS, ROLE_COLORS, WIZARD_MODULES, WIZARD_ACTIONS,
} from "@/lib/roles-api";

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

function gridCount(g?: Record<string, Record<string, boolean>>): number {
  if (!g) return 0;
  let n = 0;
  for (const row of Object.values(g)) for (const on of Object.values(row)) if (on) n++;
  return n;
}

// ════════════════════════════════════════════════════════════════════════════
//  MAIN
// ════════════════════════════════════════════════════════════════════════════

export default function RoleManagement() {
  const [summary, setSummary]         = useState<RolesSummaryDTO | null>(null);
  const [baseRoles, setBaseRoles]     = useState<CustomRoleDTO[]>([]);
  const [customRoles, setCustomRoles] = useState<CustomRoleDTO[]>([]);
  const [orgs, setOrgs]               = useState<OrgResponse[]>([]);
  const [loading, setLoading]         = useState(true);
  const [err, setErr]                 = useState("");
  const [selected, setSelected]       = useState<CustomRoleDTO | null>(null);
  const [showWizard, setShowWizard]   = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([
      rolesApi.summary().then((r) => r.data).catch(() => null),
      rolesApi.listBaseRoles().then((r) => r.data ?? []).catch(() => []),
      rolesApi.listRoles().then((r) => r.data ?? []).catch((e) => { setErr(e.message); return []; }),
    ]).then(([s, b, c]) => { setSummary(s); setBaseRoles(b); setCustomRoles(c); })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    api.get<ApiResponse<OrgResponse[]>>("/organizations").then((r) => setOrgs(r.data ?? [])).catch(() => {});
  }, []);

  if (selected) {
    return <RoleDetail role={selected} onBack={() => { setSelected(null); load(); }} onChanged={load} />;
  }

  const cards: { label: string; value: string; color: string }[] = [
    { label: "Total Roles",         value: summary ? String(summary.total_roles) : "—",          color: C.navy },
    { label: "Custom Roles",        value: summary ? String(summary.custom_roles) : "—",         color: C.orange },
    { label: "Total Users Assigned",value: summary ? summary.total_users_assigned.toLocaleString() : "—", color: C.navy },
    { label: "Permissions Defined", value: summary ? String(summary.permissions_defined) : "—",  color: C.indigo },
  ];

  return (
    <div style={{ ...ff, padding: 24, display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Summary cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16 }}>
        {cards.map((c) => (
          <div key={c.label} style={{ ...card.plain, display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: C.muted }}>{c.label}</div>
            <div style={{ fontSize: 30, fontWeight: 800, color: c.color, lineHeight: 1.1 }}>{c.value}</div>
            <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: 0.5, color: C.muted, textTransform: "uppercase" }}>Tap for details</div>
          </div>
        ))}
      </div>

      {err && <div style={banner.err}>{err}</div>}

      {loading ? (
        <div style={card.empty}>Loading roles…</div>
      ) : (
        <>
          <SectionLabel>Built-in Roles ({baseRoles.length})</SectionLabel>
          <RoleTable roles={baseRoles} onOpen={setSelected} />

          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 8 }}>
            <SectionLabel>Custom Roles ({customRoles.length})</SectionLabel>
          </div>
          {customRoles.length === 0 ? (
            <div style={{ ...card.table, ...card.empty }}>No custom roles yet. Create one to get started.</div>
          ) : (
            <RoleTable roles={customRoles} onOpen={setSelected} />
          )}

          <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 4 }}>
            <button onClick={() => setShowWizard(true)} style={btn.prim}>+ Create Custom Role</button>
          </div>
        </>
      )}

      {showWizard && (
        <RoleFormModal role={null} orgs={orgs} onClose={() => setShowWizard(false)} onSaved={() => { setShowWizard(false); load(); }} />
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

// ════════════════════════════════════════════════════════════════════════════
//  ROLE DETAIL — Permissions / Users / Settings
// ════════════════════════════════════════════════════════════════════════════

function RoleDetail({ role, onBack, onChanged }: {
  role: CustomRoleDTO; onBack: () => void; onChanged: () => void;
}) {
  const [tab, setTab] = useState<"permissions" | "users" | "settings">("permissions");
  const permCount = gridCount(role.permission_grid);
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

function cloneGrid(g?: Record<string, Record<string, boolean>>): Record<string, Record<string, boolean>> {
  const out: Record<string, Record<string, boolean>> = {};
  for (const m of WIZARD_MODULES) {
    out[m.key] = {};
    for (const a of WIZARD_ACTIONS) out[m.key][a.key] = !!g?.[m.key]?.[a.key];
  }
  return out;
}

function PermissionGrid({ role, onChanged }: { role: CustomRoleDTO; onChanged: () => void }) {
  const editable = !role.is_system;
  const [grid, setGrid]     = useState(() => cloneGrid(role.permission_grid));
  const [dirty, setDirty]   = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg]       = useState("");
  const [err, setErr]       = useState("");

  useEffect(() => { setGrid(cloneGrid(role.permission_grid)); setDirty(false); }, [role.id, role.permission_grid]);

  function toggle(m: string, a: string) {
    if (!editable) return;
    setGrid((prev) => {
      const next = cloneGrid(prev);
      next[m][a] = !next[m][a];
      return next;
    });
    setDirty(true);
  }

  async function save() {
    setSaving(true); setErr(""); setMsg("");
    const perms: string[] = [];
    for (const m of WIZARD_MODULES) for (const a of WIZARD_ACTIONS) if (grid[m.key]?.[a.key]) perms.push(`${m.key}:${a.key}`);
    try {
      await rolesApi.updateRole(role.id, { permissions: perms });
      setMsg("Permissions saved."); setDirty(false); onChanged();
      setTimeout(() => setMsg(""), 3000);
    } catch (e) { setErr((e as Error).message); }
    finally { setSaving(false); }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {err && <div style={banner.err}>{err}</div>}
      {msg && <div style={banner.ok}>{msg}</div>}

      <div style={card.table}>
        <div style={{ display: "grid", gridTemplateColumns: "1.8fr repeat(5, 1fr)", background: C.page, padding: "12px 18px" }}>
          <span style={{ ...th, padding: 0 }}>MODULE</span>
          {WIZARD_ACTIONS.map((a) => <span key={a.key} style={{ ...th, padding: 0, textAlign: "center" }}>{a.label}</span>)}
        </div>
        {WIZARD_MODULES.map((mod) => (
          <div key={mod.key} style={{ display: "grid", gridTemplateColumns: "1.8fr repeat(5, 1fr)", alignItems: "center", padding: "13px 18px", borderTop: `1px solid ${C.border}` }}>
            <span style={{ fontSize: 13, color: C.navy }}>{mod.label}</span>
            {WIZARD_ACTIONS.map((a) => {
              const on = !!grid[mod.key]?.[a.key];
              return (
                <div key={a.key} style={{ display: "flex", justifyContent: "center" }}>
                  {editable ? (
                    <input type="checkbox" checked={on} onChange={() => toggle(mod.key, a.key)}
                      style={{ width: 17, height: 17, accentColor: C.orange, cursor: "pointer" }} />
                  ) : (
                    <span style={{ fontSize: 14, fontWeight: 700, color: on ? C.green : C.border }}>{on ? "✓" : "—"}</span>
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </div>

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

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {err && <div style={banner.err}>{err}</div>}
      {loading ? (
        <div style={card.empty}>Loading users…</div>
      ) : users.length === 0 ? (
        <div style={{ ...card.table, ...card.empty }}>
          {role.is_system ? "No users currently hold this role." : "No users assigned yet."}
        </div>
      ) : (
        users.map((u) => (
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
          <div style={{ border: `1px solid ${C.border}`, borderRadius: 10, overflow: "hidden" }}>
            <div style={{ display: "grid", gridTemplateColumns: "1.6fr repeat(5, 1fr)", background: C.page, padding: "10px 14px" }}>
              <span style={gridHead}>MODULE</span>
              {WIZARD_ACTIONS.map((a) => <span key={a.key} style={{ ...gridHead, textAlign: "center" }}>{a.label}</span>)}
            </div>
            {WIZARD_MODULES.map((mod, i) => (
              <div key={mod.key} style={{ display: "grid", gridTemplateColumns: "1.6fr repeat(5, 1fr)", alignItems: "center", padding: "10px 14px", borderTop: i === 0 ? "none" : `1px solid ${C.border}` }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: C.navy }}>{mod.label}</span>
                {WIZARD_ACTIONS.map((a) => {
                  const key = `${mod.key}:${a.key}`;
                  return (
                    <div key={a.key} style={{ display: "flex", justifyContent: "center" }}>
                      <input type="checkbox" checked={perms.has(key)} onChange={() => togglePerm(key)}
                        style={{ width: 16, height: 16, accentColor: C.orange, cursor: "pointer" }} />
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
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

const gridHead: React.CSSProperties = { fontSize: 10, fontWeight: 700, color: C.muted, letterSpacing: 0.5 };
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
