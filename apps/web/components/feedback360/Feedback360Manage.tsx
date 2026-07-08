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
            <div key={cy.id} style={{ ...cardBox, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: C.navy }}>{cy.name}</div>
                  <span style={pill(statusColor(cy.status))}>{cy.status}</span>
                </div>
                <div style={{ fontSize: 11, color: C.muted, marginTop: 3 }}>
                  Created {fmtDate(cy.created_at)}{cy.locked_at ? ` · Locked ${fmtDate(cy.locked_at)}` : ""} · by {cy.initiated_by_role.replace("_", " ")}
                </div>
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
                {/* Progress stats */}
                <Stat label="Assigned" value={cy.assigned_count} />
                <Stat label="Invited" value={cy.invited_count} />
                <Stat label="Completed" value={cy.completed_count} color={C.green} />

                {/* Actions depend on lifecycle */}
                <div style={{ display: "flex", gap: 8 }}>
                  {isConfigurable(cy.status) ? (
                    <button style={btnPrimary} onClick={() => setView({ kind: "configure", cycleId: cy.id })}>
                      Configure
                    </button>
                  ) : (
                    <button style={btnPrimary} onClick={() => setView({ kind: "assign", cycleId: cy.id, cycleName: cy.name })}>
                      Assign
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function isConfigurable(status: string): boolean {
  return status === "draft" || status === "configuring";
}

function Stat({ label, value, color }: { label: string; value: number; color?: string }) {
  return (
    <div style={{ textAlign: "center", minWidth: 56 }}>
      <div style={{ fontSize: 20, fontWeight: 800, color: color ?? C.navy }}>{value}</div>
      <div style={{ fontSize: 10, fontWeight: 700, color: C.muted, letterSpacing: 0.5, textTransform: "uppercase" }}>{label}</div>
    </div>
  );
}

const banner = {
  err: { background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.25)", borderRadius: 8, padding: "10px 14px", fontSize: 12, color: "#ef4444" } as React.CSSProperties,
};
