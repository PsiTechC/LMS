"use client";

import { useState, useEffect, useCallback } from "react";
import { feedback360ManageApi, CycleDetail } from "@/lib/feedback360-manage-api";
import { C, ff, cardBox, btnPrimary, btnSecondary, pill, statusColor, fmtDate } from "./styles";
import ConfigureWizard from "./ConfigureWizard";
import AssignScreen from "./AssignScreen";

// An organization has exactly ONE 360° configuration — there is no cycle concept,
// so there is nothing to create, name, list, or delete. This screen shows that
// single configuration and its participation, for both Superadmin (who picks the
// org via the shell filter) and Program Manager (auto-scoped to their own org).
//
// requireOrgPick=true (superadmin): show a "select an organization" hint until an
// org is chosen, since the configuration is per-org.

type View = "overview" | "configure" | "assign";

export default function Feedback360Manage({
  orgId,
  requireOrgPick = false,
}: {
  orgId?: string;
  requireOrgPick?: boolean;
}) {
  const [view, setView] = useState<View>("overview");
  const [config, setConfig] = useState<CycleDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [reopening, setReopening] = useState(false);

  const orgReady = !requireOrgPick || !!orgId;

  const load = useCallback(async () => {
    if (!orgReady) { setLoading(false); return; }
    setLoading(true); setErr("");
    try {
      // Creates an empty draft on first open, so this never 404s.
      const r = await feedback360ManageApi.getConfig(orgId);
      setConfig(r.data);
    } catch (e) { setErr((e as Error).message); }
    finally { setLoading(false); }
  }, [orgId, orgReady]);

  useEffect(() => { if (view === "overview") load(); }, [view, load]);

  // Unlock the configuration so it can be edited, then jump into the wizard.
  // Assigned participants and the frozen snapshot survive; re-locking overwrites
  // the snapshot with the edits.
  async function reopen() {
    setReopening(true); setErr("");
    try {
      await feedback360ManageApi.reopenConfig(orgId);
      setView("configure");
    } catch (e) { setErr((e as Error).message); }
    finally { setReopening(false); }
  }

  // ── Org gate (superadmin, no org selected) ──────────────────────
  if (!orgReady) {
    return (
      <div style={{ ...ff, padding: 24 }}>
        <div style={{ ...cardBox, textAlign: "center", padding: 40, color: C.muted, fontSize: 13, lineHeight: 1.6 }}>
          Select an organization from the filter above to configure its 360° feedback.
        </div>
      </div>
    );
  }

  if (view === "configure") {
    return (
      <div style={{ ...ff, padding: 24 }}>
        <ConfigureWizard
          orgId={orgId}
          onCancel={() => setView("overview")}
          onDone={() => setView("assign")}
        />
      </div>
    );
  }
  if (view === "assign") {
    return (
      <div style={{ ...ff, padding: 24 }}>
        <AssignScreen orgId={orgId} onBack={() => setView("overview")} />
      </div>
    );
  }

  // ── Overview: the org's single 360° configuration ───────────────
  if (loading) {
    return <div style={{ ...ff, padding: 24 }}><div style={{ ...cardBox, textAlign: "center", color: C.muted }}>Loading 360° configuration…</div></div>;
  }

  const locked = !!config && ["locked", "active", "completed"].includes(config.status);
  const configured = !!config?.competencies?.some((c) => c.behaviors.length > 0);

  return (
    <div style={{ ...ff, padding: 24, display: "flex", flexDirection: "column", gap: 16 }}>
      {err && <div style={banner.err}>{err}</div>}

      {/* Status + actions */}
      <div style={{ ...cardBox, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: C.navy }}>This organization&apos;s 360° Feedback</div>
            {config && <span style={pill(statusColor(config.status))}>{config.status}</span>}
          </div>
          <div style={{ fontSize: 11, color: C.muted, marginTop: 4 }}>
            {locked
              ? `Locked ${fmtDate(config?.locked_at)} — participants can nominate reviewers and raters can respond.`
              : configured
                ? "Configured but not locked. Lock it to start assigning participants."
                : "Not configured yet. Set up the competencies, questions and quorum to begin."}
          </div>
        </div>

        <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
          {locked ? (
            <>
              <button
                style={{ ...btnSecondary, ...(reopening ? { opacity: 0.5, cursor: "not-allowed" } : {}) }}
                disabled={reopening}
                onClick={reopen}
                title="Unlock to edit the competencies, questions and quorum"
              >
                {reopening ? "Reopening…" : "Edit configuration"}
              </button>
              <button style={btnPrimary} onClick={() => setView("assign")}>Assign participants</button>
            </>
          ) : (
            <button style={btnPrimary} onClick={() => setView("configure")}>
              {configured ? "Continue configuring" : "Configure 360°"}
            </button>
          )}
        </div>
      </div>

      {/* Participation stats — only meaningful once locked */}
      {locked && config && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14 }}>
          <Stat label="Assigned" value={config.assigned_count} />
          <Stat label="Invited" value={config.invited_count} />
          <Stat label="Completed" value={config.completed_count} color={C.green} />
        </div>
      )}

      {/* Framework summary */}
      {configured && config && (
        <div style={cardBox}>
          <div style={{ fontSize: 13, fontWeight: 700, color: C.navy, marginBottom: 10 }}>
            Framework · {config.competencies.length} competencies ·{" "}
            {config.competencies.reduce((n, c) => n + c.behaviors.length, 0)} questions ·{" "}
            {config.open_questions.length} open questions
          </div>
          {config.competencies.map((c) => (
            <div key={c.competency_id} style={{ fontSize: 12, color: C.muted, marginTop: 6 }}>
              <span style={{ fontWeight: 600, color: C.navy }}>{c.title}</span>
              {" — "}{c.behaviors.length} question{c.behaviors.length === 1 ? "" : "s"}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, color }: { label: string; value: number; color?: string }) {
  return (
    <div style={{ ...cardBox, textAlign: "center" }}>
      <div style={{ fontSize: 26, fontWeight: 800, color: color ?? C.navy }}>{value}</div>
      <div style={{ fontSize: 10, fontWeight: 700, color: C.muted, letterSpacing: 0.5, textTransform: "uppercase", marginTop: 2 }}>{label}</div>
    </div>
  );
}

const banner = {
  err: { background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.25)", borderRadius: 8, padding: "10px 14px", fontSize: 12, color: "#ef4444" } as React.CSSProperties,
};
