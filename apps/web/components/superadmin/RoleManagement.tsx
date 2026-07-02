"use client";

import { useState, useEffect, useCallback } from "react";
import { api, ApiResponse, OrgResponse } from "@/lib/api";
import {
  rolesApi, CustomRoleDTO, RoleAssignmentDTO, OrgAccessRuleDTO, EffectivePermissionsDTO,
  BaseRole, CreateRoleBody, PERMISSION_CATALOG, BASE_ROLE_LABELS,
} from "@/lib/roles-api";

// ── Slate / Admin design tokens (FRONTEND_CLAUDE.md) ────────────────────────
const C = {
  navy:   "#1C2551",   // primary text / solid buttons
  slate:  "#334155",   // slate accent (admin persona)
  slateL: "#64748b",   // muted slate
  orange: "#EF4E24",   // primary CTA
  page:   "#F5F7FB",
  card:   "#FFFFFF",
  alt:    "#F0F1F7",
  border: "#EAECF4",
  muted:  "#8b90a7",
  green:  "#22c55e",
  danger: "#ef4444",
};
const ff = { fontFamily: "Poppins, sans-serif" } as const;

interface UserRow { id: string; name: string; email: string; role: string; }

type SubTab = "roles" | "assignments" | "access";

export default function RoleManagement() {
  const [subTab, setSubTab] = useState<SubTab>("roles");
  const [orgs, setOrgs] = useState<OrgResponse[]>([]);

  useEffect(() => {
    api.get<ApiResponse<OrgResponse[]>>("/organizations")
      .then((r) => setOrgs(r.data ?? []))
      .catch(() => {});
  }, []);

  const tabs: { id: SubTab; label: string }[] = [
    { id: "roles",       label: "Roles" },
    { id: "assignments", label: "User Assignments" },
    { id: "access",      label: "Org Access Rules" },
  ];

  return (
    <div style={{ ...ff, padding: 24, display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Sub-tab bar */}
      <div style={{ display: "flex", gap: 8 }}>
        {tabs.map((t) => {
          const active = subTab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setSubTab(t.id)}
              style={{
                ...ff, padding: "7px 16px", borderRadius: 8, fontSize: 12, cursor: "pointer",
                fontWeight: active ? 700 : 500,
                background: active ? C.navy : C.card,
                color: active ? "#fff" : C.muted,
                border: `1px solid ${active ? C.navy : C.border}`,
              }}
            >
              {t.label}
            </button>
          );
        })}
      </div>

      {subTab === "roles"       && <RolesTab orgs={orgs} />}
      {subTab === "assignments" && <AssignmentsTab orgs={orgs} />}
      {subTab === "access"      && <AccessRulesTab orgs={orgs} />}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
//  TAB 1 — ROLES
// ════════════════════════════════════════════════════════════════════════════

function RolesTab({ orgs }: { orgs: OrgResponse[] }) {
  const [roles, setRoles] = useState<CustomRoleDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<CustomRoleDTO | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [err, setErr] = useState("");

  const load = useCallback(() => {
    setLoading(true);
    rolesApi.listRoles()
      .then((r) => setRoles(r.data ?? []))
      .catch((e) => setErr(e.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  function onEdit(role: CustomRoleDTO) { setEditing(role); setShowForm(true); }
  function onNew()  { setEditing(null); setShowForm(true); }

  async function onDelete(role: CustomRoleDTO) {
    if (!confirm(`Delete role "${role.name}"? This cannot be undone.`)) return;
    try {
      await rolesApi.deleteRole(role.id);
      load();
    } catch (e) { setErr((e as Error).message); }
  }

  const orgName = (id?: string) => orgs.find((o) => o.id === id)?.name;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ fontSize: 13, color: C.muted }}>
          Custom roles extend a base persona with granular, additive permissions.
        </div>
        <button onClick={onNew} style={btn.prim}>+ New Role</button>
      </div>

      {err && <div style={banner.err}>{err}</div>}

      <div style={card.table}>
        {loading ? (
          <div style={card.empty}>Loading roles…</div>
        ) : roles.length === 0 ? (
          <div style={card.empty}>No custom roles yet. Create one to get started.</div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: C.page }}>
                {["Role", "Base Persona", "Permissions", "Scope", "", ""].map((h, i) => (
                  <th key={i} style={th}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {roles.map((r) => (
                <tr key={r.id} style={{ borderTop: `1px solid ${C.border}` }}>
                  <td style={td}>
                    <div style={{ fontWeight: 600, color: C.navy, fontSize: 13 }}>{r.name}</div>
                    {r.description && <div style={{ fontSize: 11, color: C.muted }}>{r.description}</div>}
                  </td>
                  <td style={td}>
                    <span style={pill(C.slate)}>{BASE_ROLE_LABELS[r.base_role]}</span>
                  </td>
                  <td style={{ ...td, fontSize: 12, color: C.navy }}>
                    <span title={r.permissions.join(", ")}>{r.permissions.length} explicit</span>
                    <span style={{ color: C.muted }}> · {r.effective_permissions.length} effective</span>
                  </td>
                  <td style={{ ...td, fontSize: 12, color: C.slateL }}>
                    {r.org_id ? (orgName(r.org_id) ?? "Org") : "Global"}
                    {r.is_system && <span style={{ ...pill(C.muted), marginLeft: 6 }}>System</span>}
                  </td>
                  <td style={td}>
                    <button onClick={() => onEdit(r)} style={btn.ghostSm}>Edit</button>
                  </td>
                  <td style={td}>
                    {!r.is_system && (
                      <button onClick={() => onDelete(r)} style={btn.dangerSm}>Delete</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {showForm && (
        <RoleFormModal
          role={editing}
          orgs={orgs}
          onClose={() => setShowForm(false)}
          onSaved={() => { setShowForm(false); load(); }}
        />
      )}
    </div>
  );
}

function RoleFormModal({ role, orgs, onClose, onSaved }: {
  role: CustomRoleDTO | null; orgs: OrgResponse[];
  onClose: () => void; onSaved: () => void;
}) {
  const [name, setName]         = useState(role?.name ?? "");
  const [description, setDesc]  = useState(role?.description ?? "");
  const [baseRole, setBaseRole] = useState<BaseRole>(role?.base_role ?? "participant");
  const [orgId, setOrgId]       = useState(role?.org_id ?? "");
  const [perms, setPerms]       = useState<Set<string>>(new Set(role?.permissions ?? []));
  const [saving, setSaving]     = useState(false);
  const [err, setErr]           = useState("");

  function toggle(key: string) {
    setPerms((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  }
  function toggleModule(actions: string[], moduleKey: string) {
    const keys = actions.map((a) => `${moduleKey}:${a}`);
    const allOn = keys.every((k) => perms.has(k));
    setPerms((prev) => {
      const next = new Set(prev);
      keys.forEach((k) => (allOn ? next.delete(k) : next.add(k)));
      return next;
    });
  }

  async function save() {
    if (!name.trim()) { setErr("Name is required"); return; }
    setSaving(true); setErr("");
    try {
      const body: CreateRoleBody = {
        name: name.trim(), description, base_role: baseRole,
        permissions: Array.from(perms),
        ...(orgId ? { org_id: orgId } : {}),
      };
      if (role) {
        await rolesApi.updateRole(role.id, {
          name: body.name, description, base_role: baseRole, permissions: body.permissions,
        });
      } else {
        await rolesApi.createRole(body);
      }
      onSaved();
    } catch (e) { setErr((e as Error).message); setSaving(false); }
  }

  return (
    <Modal title={role ? "Edit Role" : "Create Role"} onClose={onClose} wide>
      {err && <div style={banner.err}>{err}</div>}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <Field label="Role Name">
          <input value={name} onChange={(e) => setName(e.target.value)} style={input} placeholder="e.g. Regional Coordinator" />
        </Field>
        <Field label="Base Persona (inherits its permissions)">
          <select value={baseRole} onChange={(e) => setBaseRole(e.target.value as BaseRole)} style={input}>
            {(Object.keys(BASE_ROLE_LABELS) as BaseRole[]).map((r) => (
              <option key={r} value={r}>{BASE_ROLE_LABELS[r]}</option>
            ))}
          </select>
        </Field>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <Field label="Description">
          <input value={description} onChange={(e) => setDesc(e.target.value)} style={input} placeholder="Optional" />
        </Field>
        <Field label="Scope">
          <select value={orgId} onChange={(e) => setOrgId(e.target.value)} style={input} disabled={!!role}>
            <option value="">Global (all organizations)</option>
            {orgs.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
          </select>
        </Field>
      </div>

      <div style={{ fontSize: 10, fontWeight: 700, color: C.muted, letterSpacing: 0.5, textTransform: "uppercase", margin: "8px 0 6px" }}>
        Granular Permissions (added on top of base persona)
      </div>
      <div style={{ maxHeight: 320, overflowY: "auto", border: `1px solid ${C.border}`, borderRadius: 10, padding: 12, display: "flex", flexDirection: "column", gap: 12 }}>
        {PERMISSION_CATALOG.map((mod) => {
          const keys = mod.actions.map((a) => `${mod.key}:${a}`);
          const allOn = keys.every((k) => perms.has(k));
          return (
            <div key={mod.key}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: C.navy }}>{mod.label}</span>
                <button onClick={() => toggleModule(mod.actions, mod.key)} style={btn.ghostSm}>
                  {allOn ? "Clear" : "All"}
                </button>
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {mod.actions.map((a) => {
                  const key = `${mod.key}:${a}`;
                  const on = perms.has(key);
                  return (
                    <label key={key} style={{
                      display: "flex", alignItems: "center", gap: 6, cursor: "pointer",
                      padding: "5px 10px", borderRadius: 6, fontSize: 12,
                      background: on ? "rgba(28,37,81,0.06)" : C.alt,
                      border: `1px solid ${on ? C.navy : C.border}`,
                      color: on ? C.navy : C.slateL, fontWeight: on ? 600 : 500,
                    }}>
                      <input type="checkbox" checked={on} onChange={() => toggle(key)} style={{ accentColor: C.navy }} />
                      {a}
                    </label>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 16 }}>
        <button onClick={onClose} style={btn.ghost}>Cancel</button>
        <button onClick={save} disabled={saving} style={{ ...btn.prim, opacity: saving ? 0.6 : 1 }}>
          {saving ? "Saving…" : role ? "Save Changes" : "Create Role"}
        </button>
      </div>
    </Modal>
  );
}

// ════════════════════════════════════════════════════════════════════════════
//  TAB 2 — USER ASSIGNMENTS
// ════════════════════════════════════════════════════════════════════════════

function AssignmentsTab({ orgs }: { orgs: OrgResponse[] }) {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [roles, setRoles] = useState<CustomRoleDTO[]>([]);
  const [selectedUser, setSelectedUser] = useState("");
  const [assignments, setAssignments] = useState<RoleAssignmentDTO[]>([]);
  const [effective, setEffective] = useState<EffectivePermissionsDTO | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    api.get<ApiResponse<UserRow[]>>("/users?limit=200")
      .then((r) => setUsers(r.data ?? []))
      .catch(() => {});
    rolesApi.listRoles().then((r) => setRoles(r.data ?? [])).catch(() => {});
  }, []);

  const loadUser = useCallback((userId: string) => {
    if (!userId) { setAssignments([]); setEffective(null); return; }
    setLoading(true); setErr("");
    Promise.all([
      rolesApi.listAssignments({ user_id: userId }),
      rolesApi.effectivePermissions(userId),
    ]).then(([a, e]) => {
      setAssignments(a.data ?? []);
      setEffective(e.data ?? null);
    }).catch((e) => setErr(e.message)).finally(() => setLoading(false));
  }, []);

  useEffect(() => { loadUser(selectedUser); }, [selectedUser, loadUser]);

  const orgName = (id?: string) => orgs.find((o) => o.id === id)?.name;

  async function revoke(id: string) {
    if (!confirm("Revoke this role assignment?")) return;
    try { await rolesApi.deleteAssignment(id); loadUser(selectedUser); }
    catch (e) { setErr((e as Error).message); }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={card.plain}>
        <Field label="Select User">
          <select value={selectedUser} onChange={(e) => setSelectedUser(e.target.value)} style={{ ...input, maxWidth: 420 }}>
            <option value="">— Choose a user —</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>{u.name} ({u.email}) · {u.role}</option>
            ))}
          </select>
        </Field>
      </div>

      {err && <div style={banner.err}>{err}</div>}

      {selectedUser && (
        <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: 14 }}>
          {/* Left — assignments + assign form */}
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <AssignForm
              userId={selectedUser} roles={roles} orgs={orgs}
              onErr={setErr} onCreated={() => loadUser(selectedUser)}
            />
            <div style={card.table}>
              <div style={cardHead}>Current Assignments</div>
              {loading ? (
                <div style={card.empty}>Loading…</div>
              ) : assignments.length === 0 ? (
                <div style={card.empty}>No scoped role assignments for this user.</div>
              ) : (
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr style={{ background: C.page }}>
                      {["Role", "Scope", "Validity", "Status", ""].map((h, i) => <th key={i} style={th}>{h}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {assignments.map((a) => (
                      <tr key={a.id} style={{ borderTop: `1px solid ${C.border}` }}>
                        <td style={td}>
                          <span style={{ fontSize: 13, fontWeight: 600, color: C.navy }}>
                            {a.role_name || (a.base_role ? BASE_ROLE_LABELS[a.base_role] : "—")}
                          </span>
                        </td>
                        <td style={{ ...td, fontSize: 12, color: C.slateL }}>
                          {a.org_id ? (orgName(a.org_id) ?? "Org") : "All orgs"}
                          {a.program_id ? " · program-scoped" : ""}
                        </td>
                        <td style={{ ...td, fontSize: 11, color: C.slateL }}>
                          {a.valid_from || a.valid_until
                            ? `${fmtDate(a.valid_from)} → ${fmtDate(a.valid_until)}`
                            : "No time limit"}
                        </td>
                        <td style={td}>
                          <span style={pill(a.active ? C.green : C.muted)}>{a.active ? "Active" : "Inactive"}</span>
                        </td>
                        <td style={td}>
                          <button onClick={() => revoke(a.id)} style={btn.dangerSm}>Revoke</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>

          {/* Right — effective permissions */}
          <div style={card.plain}>
            <div style={cardHead}>Effective Permissions</div>
            {effective ? (
              <>
                <div style={{ fontSize: 12, color: C.slateL, marginBottom: 8 }}>
                  Base persona: <strong style={{ color: C.navy }}>{BASE_ROLE_LABELS[effective.base_role]}</strong>
                  {effective.roles.length > 0 && <> · Roles: {effective.roles.join(", ")}</>}
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6, maxHeight: 360, overflowY: "auto" }}>
                  {effective.permissions.map((p) => (
                    <span key={p} style={{ ...pill(C.slate), fontFamily: "monospace" as const }}>{p}</span>
                  ))}
                </div>
                <div style={{ fontSize: 11, color: C.muted, marginTop: 10 }}>
                  {effective.permissions.length} permissions, resolved live from base persona + active assignments.
                </div>
              </>
            ) : (
              <div style={card.empty}>—</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function AssignForm({ userId, roles, orgs, onErr, onCreated }: {
  userId: string; roles: CustomRoleDTO[]; orgs: OrgResponse[];
  onErr: (m: string) => void; onCreated: () => void;
}) {
  const [mode, setMode] = useState<"custom" | "base">("custom");
  const [roleId, setRoleId]     = useState("");
  const [baseRole, setBaseRole] = useState<BaseRole>("faculty");
  const [orgId, setOrgId]       = useState("");
  const [programId, setProgram] = useState("");
  const [from, setFrom]         = useState("");
  const [until, setUntil]       = useState("");
  const [saving, setSaving]     = useState(false);

  async function submit() {
    if (mode === "custom" && !roleId) { onErr("Select a role to assign"); return; }
    setSaving(true); onErr("");
    try {
      await rolesApi.createAssignment({
        user_id: userId,
        ...(mode === "custom" ? { role_id: roleId } : { base_role: baseRole }),
        ...(orgId ? { org_id: orgId } : {}),
        ...(programId ? { program_id: programId } : {}),
        ...(from  ? { valid_from:  new Date(from).toISOString() } : {}),
        ...(until ? { valid_until: new Date(until + "T23:59:59").toISOString() } : {}),
      });
      setRoleId(""); setProgram(""); setFrom(""); setUntil("");
      onCreated();
    } catch (e) { onErr((e as Error).message); }
    finally { setSaving(false); }
  }

  return (
    <div style={card.plain}>
      <div style={cardHead}>Assign a Role</div>

      <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
        {(["custom", "base"] as const).map((m) => (
          <button key={m} onClick={() => setMode(m)} style={{
            ...btn.ghostSm,
            background: mode === m ? C.navy : C.card,
            color: mode === m ? "#fff" : C.muted,
            borderColor: mode === m ? C.navy : C.border,
          }}>
            {m === "custom" ? "Custom Role" : "Base Persona"}
          </button>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        {mode === "custom" ? (
          <Field label="Custom Role">
            <select value={roleId} onChange={(e) => setRoleId(e.target.value)} style={input}>
              <option value="">— Choose —</option>
              {roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
          </Field>
        ) : (
          <Field label="Base Persona">
            <select value={baseRole} onChange={(e) => setBaseRole(e.target.value as BaseRole)} style={input}>
              {(Object.keys(BASE_ROLE_LABELS) as BaseRole[]).map((r) => (
                <option key={r} value={r}>{BASE_ROLE_LABELS[r]}</option>
              ))}
            </select>
          </Field>
        )}
        <Field label="Organization Scope (optional)">
          <select value={orgId} onChange={(e) => setOrgId(e.target.value)} style={input}>
            <option value="">All organizations</option>
            {orgs.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
          </select>
        </Field>
      </div>

      <Field label="Program Scope — Program UUID (optional)">
        <input value={programId} onChange={(e) => setProgram(e.target.value)} style={input} placeholder="Leave blank for org-wide" />
      </Field>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <Field label="Valid From (optional)">
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} style={input} />
        </Field>
        <Field label="Valid Until (optional)">
          <input type="date" value={until} onChange={(e) => setUntil(e.target.value)} style={input} />
        </Field>
      </div>

      <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 6 }}>
        <button onClick={submit} disabled={saving} style={{ ...btn.prim, opacity: saving ? 0.6 : 1 }}>
          {saving ? "Assigning…" : "Assign Role"}
        </button>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
//  TAB 3 — ORG ACCESS RULES
// ════════════════════════════════════════════════════════════════════════════

function AccessRulesTab({ orgs }: { orgs: OrgResponse[] }) {
  const [orgId, setOrgId]   = useState("");
  const [rule, setRule]     = useState<OrgAccessRuleDTO | null>(null);
  const [ips, setIps]       = useState<string[]>([]);
  const [ipInput, setIpInput] = useState("");
  const [allowed, setAllowed] = useState("");
  const [blocked, setBlocked] = useState("");
  const [enforce, setEnforce] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving]   = useState(false);
  const [msg, setMsg]         = useState("");
  const [err, setErr]         = useState("");

  useEffect(() => {
    if (!orgId) { setRule(null); return; }
    setLoading(true); setErr(""); setMsg("");
    rolesApi.getAccessRule(orgId)
      .then((r) => {
        const d = r.data;
        setRule(d);
        setIps(d.ip_allowlist ?? []);
        setAllowed((d.allowed_countries ?? []).join(", "));
        setBlocked((d.blocked_countries ?? []).join(", "));
        setEnforce(d.enforce);
      })
      .catch(() => {
        // No rule yet — start blank
        setRule(null); setIps([]); setAllowed(""); setBlocked(""); setEnforce(false);
      })
      .finally(() => setLoading(false));
  }, [orgId]);

  function addIp() {
    const v = ipInput.trim();
    if (v && !ips.includes(v)) { setIps([...ips, v]); setIpInput(""); }
  }
  function removeIp(v: string) { setIps(ips.filter((x) => x !== v)); }

  async function save() {
    if (!orgId) { setErr("Select an organization"); return; }
    setSaving(true); setErr(""); setMsg("");
    try {
      const parseCsv = (s: string) => s.split(",").map((x) => x.trim().toUpperCase()).filter(Boolean);
      const r = await rolesApi.upsertAccessRule({
        org_id: orgId,
        ip_allowlist: ips,
        allowed_countries: parseCsv(allowed),
        blocked_countries: parseCsv(blocked),
        enforce,
      });
      setRule(r.data);
      setMsg("Access rules saved.");
      setTimeout(() => setMsg(""), 4000);
    } catch (e) { setErr((e as Error).message); }
    finally { setSaving(false); }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={card.plain}>
        <Field label="Organization">
          <select value={orgId} onChange={(e) => setOrgId(e.target.value)} style={{ ...input, maxWidth: 420 }}>
            <option value="">— Choose an organization —</option>
            {orgs.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
          </select>
        </Field>
      </div>

      {err && <div style={banner.err}>{err}</div>}
      {msg && <div style={banner.ok}>{msg}</div>}

      {orgId && !loading && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
          {/* IP allowlist */}
          <div style={card.plain}>
            <div style={cardHead}>IP Allowlist</div>
            <div style={{ fontSize: 11, color: C.muted, marginBottom: 8 }}>
              CIDR ranges or single IPs. Empty = no IP restriction.
            </div>
            <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
              <input
                value={ipInput}
                onChange={(e) => setIpInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addIp(); } }}
                style={input} placeholder="e.g. 203.0.113.0/24"
              />
              <button onClick={addIp} style={btn.ghost}>Add</button>
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {ips.length === 0 && <span style={{ fontSize: 12, color: C.muted }}>No IPs added.</span>}
              {ips.map((ip) => (
                <span key={ip} style={{ ...pill(C.slate), fontFamily: "monospace" as const, display: "inline-flex", alignItems: "center", gap: 6 }}>
                  {ip}
                  <button onClick={() => removeIp(ip)} style={{ background: "none", border: "none", cursor: "pointer", color: C.danger, fontWeight: 700 }}>×</button>
                </span>
              ))}
            </div>
          </div>

          {/* Geo restriction */}
          <div style={card.plain}>
            <div style={cardHead}>Geo-Restriction</div>
            <Field label="Allowed Countries (ISO codes, comma-separated)">
              <input value={allowed} onChange={(e) => setAllowed(e.target.value)} style={input} placeholder="e.g. IN, US, GB" />
            </Field>
            <Field label="Blocked Countries (ISO codes, comma-separated)">
              <input value={blocked} onChange={(e) => setBlocked(e.target.value)} style={input} placeholder="e.g. KP, RU" />
            </Field>
            <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", marginTop: 6 }}>
              <input type="checkbox" checked={enforce} onChange={(e) => setEnforce(e.target.checked)} style={{ accentColor: C.navy }} />
              <span style={{ fontSize: 13, color: C.navy, fontWeight: 600 }}>Enforce these rules</span>
            </label>
          </div>
        </div>
      )}

      {orgId && !loading && (
        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <button onClick={save} disabled={saving} style={{ ...btn.prim, opacity: saving ? 0.6 : 1 }}>
            {saving ? "Saving…" : "Save Access Rules"}
          </button>
        </div>
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
//  Shared primitives
// ════════════════════════════════════════════════════════════════════════════

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <label style={{ fontSize: 10, fontWeight: 700, color: C.muted, display: "block", marginBottom: 5, letterSpacing: 0.5, textTransform: "uppercase" }}>
        {label}
      </label>
      {children}
    </div>
  );
}

function Modal({ title, children, onClose, wide }: { title: string; children: React.ReactNode; onClose: () => void; wide?: boolean }) {
  return (
    <div
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{ position: "fixed", inset: 0, background: "rgba(28,37,81,0.5)", zIndex: 2000, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}
    >
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

function fmtDate(iso?: string) {
  if (!iso) return "∞";
  return new Date(iso).toLocaleDateString("en-US", { day: "numeric", month: "short", year: "numeric" });
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
  prim:      { ...ff, padding: "9px 20px", background: C.orange, border: "none", borderRadius: 8, cursor: "pointer", fontSize: 12, fontWeight: 700, color: "#fff" } as React.CSSProperties,
  ghost:     { ...ff, padding: "8px 16px", background: "#fff", border: `1px solid ${C.border}`, borderRadius: 8, cursor: "pointer", fontSize: 12, fontWeight: 600, color: C.navy } as React.CSSProperties,
  ghostSm:   { ...ff, padding: "5px 12px", background: "#fff", border: `1px solid ${C.border}`, borderRadius: 6, cursor: "pointer", fontSize: 11, fontWeight: 600, color: C.navy } as React.CSSProperties,
  dangerSm:  { ...ff, padding: "5px 12px", background: "#fff", border: `1px solid ${C.danger}40`, borderRadius: 6, cursor: "pointer", fontSize: 11, fontWeight: 600, color: C.danger } as React.CSSProperties,
};

const banner = {
  err: { background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.25)", borderRadius: 8, padding: "10px 14px", fontSize: 12, color: C.danger } as React.CSSProperties,
  ok:  { background: "rgba(34,197,94,0.08)", border: "1px solid rgba(34,197,94,0.25)", borderRadius: 8, padding: "10px 14px", fontSize: 12, color: "#16a34a" } as React.CSSProperties,
};
