"use client";

import { useState, useEffect, useCallback } from "react";
import { feedback360ManageApi, CycleSummary } from "@/lib/feedback360-manage-api";
import { C, ff, cardBox, btnPrimary, btnSecondary, pill, statusColor, fmtDate } from "./styles";
import ConfigureWizard from "./ConfigureWizard";
import AssignScreen from "./AssignScreen";

// Top-level admin-initiated 360° management surface. One component for both
// Superadmin (must select an org first — `orgId` comes from the shell org filter)
// and Program Manager (auto-scoped — `orgId` is their own org).
//
// requireOrgPick=true (superadmin): show a "select an organization" hint until an
// org is chosen, so cycles are always scoped to a single org, per spec (superadmin
// selects org when initiating at the top; PM is fixed to their org).

type View =
  | { kind: "list" }
  | { kind: "configure"; cycleId: string }
  | { kind: "assign"; cycleId: string; cycleName: string };

export default function Feedback360Manage({
  orgId,
  requireOrgPick = false,
}: {
  orgId?: string;
  requireOrgPick?: boolean;
}) {
  const [view, setView] = useState<View>({ kind: "list" });
  const [cycles, setCycles] = useState<CycleSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [reopeningId, setReopeningId] = useState("");
  const [confirmDelete, setConfirmDelete] = useState<CycleSummary | null>(null);
  const [deletingId, setDeletingId] = useState("");

  const orgReady = !requireOrgPick || !!orgId;

  const load = useCallback(async () => {
    if (!orgReady) { setLoading(false); return; }
    setLoading(true); setErr("");
    try {
      const r = await feedback360ManageApi.listCycles(orgId);
      setCycles(r.data ?? []);
    } catch (e) { setErr((e as Error).message); }
    finally { setLoading(false); }
  }, [orgId, orgReady]);

  useEffect(() => { if (view.kind === "list") load(); }, [view, load]);

  async function createCycle() {
    if (!newName.trim()) return;
    setCreating(true); setErr("");
    try {
      const r = await feedback360ManageApi.createCycle(orgId, newName.trim());
      setShowCreate(false); setNewName("");
      setView({ kind: "configure", cycleId: r.data.id });
    } catch (e) { setErr((e as Error).message); }
    finally { setCreating(false); }
  }

  // Unlock a locked/active cycle and jump straight into the Configure wizard.
  // Assigned participants and the frozen snapshot are preserved; re-locking
  // overwrites the snapshot with the edited config.
  async function reopen(cycleId: string) {
    setReopeningId(cycleId); setErr("");
    try {
      await feedback360ManageApi.reopenCycle(cycleId, orgId);
      setView({ kind: "configure", cycleId });
    } catch (e) { setErr((e as Error).message); }
    finally { setReopeningId(""); }
  }

  // Permanently delete a cycle (guarded by the confirmation modal).
  async function doDelete(cycleId: string) {
    setDeletingId(cycleId); setErr("");
    try {
      await feedback360ManageApi.deleteCycle(cycleId, orgId);
      setConfirmDelete(null);
      await load();
    } catch (e) { setErr((e as Error).message); }
    finally { setDeletingId(""); }
  }

  // ── Org gate (superadmin, no org selected) ──────────────────────
  if (!orgReady) {
    return (
      <div style={{ ...ff, padding: 24 }}>
        <div style={{ ...cardBox, textAlign: "center", padding: 40, color: C.muted, fontSize: 13, lineHeight: 1.6 }}>
          Select an organization from the filter above to configure and launch a 360° feedback cycle for it.
        </div>
      </div>
    );
  }

  // ── Sub-views ───────────────────────────────────────────────────
  if (view.kind === "configure") {
    return (
      <div style={{ ...ff, padding: 24 }}>
        <ConfigureWizard
          orgId={orgId}
          cycleId={view.cycleId}
          onCancel={() => setView({ kind: "list" })}
          onDone={() => {
            // After lock, jump straight to assigning participants.
            const c = cycles.find((x) => x.id === view.cycleId);
            setView({ kind: "assign", cycleId: view.cycleId, cycleName: c?.name ?? newName ?? "360° Cycle" });
          }}
        />
      </div>
    );
  }
  if (view.kind === "assign") {
    return (
      <div style={{ ...ff, padding: 24 }}>
        <AssignScreen
          orgId={orgId}
          cycleId={view.cycleId}
          cycleName={view.cycleName}
          onBack={() => setView({ kind: "list" })}
        />
      </div>
    );
  }

  // ── Cycle dashboard ─────────────────────────────────────────────
  return (
    <div style={{ ...ff, padding: 24, display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ fontSize: 12, color: C.muted }}>
          Configure competencies & quorum, lock a cycle, then assign participants and invite them.
        </div>
        <button style={btnPrimary} onClick={() => setShowCreate(true)}>+ New 360° Cycle</button>
      </div>

      {err && <div style={banner.err}>{err}</div>}

      {showCreate && (
        <div style={{ ...cardBox, display: "flex", gap: 10, alignItems: "flex-end" }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: C.muted, letterSpacing: 0.5, textTransform: "uppercase", marginBottom: 6 }}>
              New Cycle Name
            </div>
            <input
              autoFocus
              style={{ ...ff, border: `1px solid ${C.border}`, borderRadius: 8, padding: "9px 12px", fontSize: 13, color: C.navy, width: "100%" }}
              placeholder="e.g. Q3 2026 Leadership 360"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") createCycle(); }}
            />
          </div>
          <button style={{ ...btnPrimary, opacity: creating || !newName.trim() ? 0.5 : 1 }} disabled={creating || !newName.trim()} onClick={createCycle}>
            {creating ? "Creating…" : "Create & Configure"}
          </button>
          <button style={btnSecondary} onClick={() => { setShowCreate(false); setNewName(""); }}>Cancel</button>
        </div>
      )}

      {loading ? (
        <div style={{ ...cardBox, textAlign: "center", color: C.muted }}>Loading cycles…</div>
      ) : cycles.length === 0 ? (
        <div style={{ ...cardBox, textAlign: "center", padding: 40, color: C.muted, fontSize: 13, lineHeight: 1.6 }}>
          No 360° cycles yet. Create one to configure its competency framework and quorum, lock it, and assign participants.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {cycles.map((cy) => (
            <div key={cy.id} style={{ ...cardBox, ...row.wrap }}>
              {/* Title + meta — the only flexible column */}
              <div style={row.title}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                  <div style={{
                    fontSize: 14, fontWeight: 700, color: C.navy,
                    whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                  }}>{cy.name}</div>
                  <span style={pill(statusColor(cy.status))}>{cy.status}</span>
                </div>
                <div style={{ fontSize: 11, color: C.muted, marginTop: 3 }}>
                  Created {fmtDate(cy.created_at)}{cy.locked_at ? ` · Locked ${fmtDate(cy.locked_at)}` : ""} · by {cy.initiated_by_role.replace("_", " ")}
                </div>
              </div>

              {/* Stats — fixed width so every row's numbers line up */}
              <div style={row.stats}>
                <Stat label="Assigned" value={cy.assigned_count} />
                <Stat label="Invited" value={cy.invited_count} />
                <Stat label="Completed" value={cy.completed_count} color={C.green} />
              </div>

              {/* Actions — fixed width, right-aligned, so a row with one button
                  (Configure) lines up with a row that has two (Edit + Assign). */}
              <div style={row.actions}>
                {isConfigurable(cy.status) ? (
                  <button style={{ ...btnPrimary, width: BTN_W }} onClick={() => setView({ kind: "configure", cycleId: cy.id })}>
                    Configure
                  </button>
                ) : (
                  <>
                    {cy.status !== "completed" && (
                      <button
                        style={{ ...btnSecondary, width: EDIT_W, ...(reopeningId === cy.id ? { opacity: 0.5, cursor: "not-allowed" } : {}) }}
                        disabled={reopeningId === cy.id}
                        onClick={() => reopen(cy.id)}
                        title="Unlock this cycle to edit its competencies, questions and quorum"
                      >
                        {reopeningId === cy.id ? "…" : "Edit"}
                      </button>
                    )}
                    <button
                      style={{ ...btnPrimary, width: cy.status !== "completed" ? BTN_W - EDIT_W - 8 : BTN_W }}
                      onClick={() => setView({ kind: "assign", cycleId: cy.id, cycleName: cy.name })}
                    >
                      Assign
                    </button>
                  </>
                )}
              </div>

              {/* Delete — completed cycles are a permanent record, so no delete. */}
              <div style={row.del}>
                {cy.status !== "completed" && (
                  <button
                    onClick={() => setConfirmDelete(cy)}
                    title="Delete this cycle"
                    aria-label={`Delete cycle ${cy.name}`}
                    style={iconBtn}
                  >
                    <TrashIcon />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {confirmDelete && (
        <ConfirmDeleteModal
          cycleName={confirmDelete.name}
          assigned={confirmDelete.assigned_count}
          busy={deletingId === confirmDelete.id}
          onCancel={() => setConfirmDelete(null)}
          onConfirm={() => doDelete(confirmDelete.id)}
        />
      )}
    </div>
  );
}

// Fixed action-column geometry — keeps every row's buttons on the same axis.
const BTN_W = 190;   // total width of the action slot's button group
const EDIT_W = 74;   // the secondary "Edit" button

const row = {
  wrap: {
    display: "flex", alignItems: "center", gap: 16,
  } as React.CSSProperties,
  title: { flex: 1, minWidth: 0 } as React.CSSProperties,
  stats: {
    display: "flex", alignItems: "center", gap: 20, flexShrink: 0,
  } as React.CSSProperties,
  actions: {
    display: "flex", gap: 8, justifyContent: "flex-end",
    width: BTN_W, flexShrink: 0,
  } as React.CSSProperties,
  del: { width: 32, display: "flex", justifyContent: "center", flexShrink: 0 } as React.CSSProperties,
};

const iconBtn: React.CSSProperties = {
  background: C.page, border: `1px solid ${C.border}`, borderRadius: 6,
  padding: "6px 8px", cursor: "pointer", color: C.muted,
  display: "flex", alignItems: "center", justifyContent: "center", lineHeight: 0,
};

function TrashIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
      <path d="M10 11v6M14 11v6" />
      <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
    </svg>
  );
}

// ── Delete confirmation modal ─────────────────────────────────────
function ConfirmDeleteModal({
  cycleName, assigned, busy, onCancel, onConfirm,
}: {
  cycleName: string;
  assigned: number;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div
      onClick={onCancel}
      style={{
        ...ff, position: "fixed", inset: 0, background: "rgba(28,37,81,0.5)", zIndex: 2000,
        display: "flex", alignItems: "center", justifyContent: "center", padding: 24,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "#fff", borderRadius: 16, maxWidth: 460, width: "100%",
          boxShadow: "0 24px 64px rgba(28,37,81,0.22)", overflow: "hidden",
        }}
      >
        <div style={{ padding: "18px 24px", borderBottom: `1px solid ${C.border}` }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: C.navy }}>Delete this 360° cycle?</div>
        </div>

        <div style={{ padding: 24, fontSize: 13, color: C.navy, lineHeight: 1.6 }}>
          <div>
            You&apos;re about to permanently delete <b>{cycleName}</b>.
          </div>
          {assigned > 0 && (
            <div style={{
              marginTop: 12, background: "rgba(239,78,36,0.06)", border: "1px solid rgba(239,78,36,0.25)",
              borderRadius: 8, padding: "10px 12px", fontSize: 12,
            }}>
              This cycle has <b>{assigned} assigned participant{assigned === 1 ? "" : "s"}</b>. Their assignments,
              invitations and progress for this cycle will be removed.
            </div>
          )}
          <div style={{ marginTop: 12, fontSize: 12, color: C.muted }}>
            This can&apos;t be undone.
          </div>
        </div>

        <div style={{
          padding: "14px 24px", borderTop: `1px solid ${C.border}`,
          display: "flex", justifyContent: "flex-end", gap: 8,
        }}>
          <button style={btnSecondary} onClick={onCancel} disabled={busy}>Cancel</button>
          <button
            onClick={onConfirm}
            disabled={busy}
            style={{
              ...ff, background: C.danger, border: "none", color: "#fff", borderRadius: 8,
              padding: "9px 20px", fontSize: 12, fontWeight: 700,
              cursor: busy ? "not-allowed" : "pointer", opacity: busy ? 0.6 : 1,
            }}
          >
            {busy ? "Deleting…" : "Delete cycle"}
          </button>
        </div>
      </div>
    </div>
  );
}

function isConfigurable(status: string): boolean {
  return status === "draft" || status === "configuring";
}

// Fixed width (not minWidth) so the three stat columns sit on the same axis in
// every row regardless of the number's digit count.
function Stat({ label, value, color }: { label: string; value: number; color?: string }) {
  return (
    <div style={{ textAlign: "center", width: 72, flexShrink: 0 }}>
      <div style={{ fontSize: 20, fontWeight: 800, color: color ?? C.navy }}>{value}</div>
      <div style={{ fontSize: 10, fontWeight: 700, color: C.muted, letterSpacing: 0.5, textTransform: "uppercase" }}>{label}</div>
    </div>
  );
}

const banner = {
  err: { background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.25)", borderRadius: 8, padding: "10px 14px", fontSize: 12, color: "#ef4444" } as React.CSSProperties,
};
