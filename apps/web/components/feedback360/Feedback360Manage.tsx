"use client";

import { useState, useEffect, useCallback } from "react";
import { feedback360ManageApi, CycleDetail, OrgOverview } from "@/lib/feedback360-manage-api";
import { C, ff, cardBox, btnPrimary, btnSecondary, pill, statusColor, fmtDate } from "./styles";
import ConfigureWizard from "./ConfigureWizard";
import AssignScreen from "./AssignScreen";

// An organization has exactly ONE 360° configuration — there is no cycle concept,
// so there is nothing to create, name, list, or delete. This screen shows that
// single configuration and its participation, for both Superadmin (who picks the
// org via the shell filter) and Program Manager (auto-scoped to their own org).
//
// requireOrgPick=true (superadmin): with no org selected, show an "All Orgs"
// roll-up — one row per organization with its 360° status and progress — instead
// of a dead-end hint. Clicking a row drills into that org.

type View = "overview" | "configure" | "assign";

export default function Feedback360Manage({
  orgId,
  requireOrgPick = false,
  onSelectOrg,
}: {
  orgId?: string;
  requireOrgPick?: boolean;
  /** Drill into one org from the All Orgs roll-up (sets the shell's org filter). */
  onSelectOrg?: (orgId: string) => void;
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

  // ── All Orgs (superadmin, no org selected) ──────────────────────
  // A cross-org roll-up rather than a dead-end hint. Uses the read-only
  // orgs_overview endpoint so browsing here never creates a draft config.
  if (!orgReady) {
    return <AllOrgsOverview onSelectOrg={onSelectOrg} />;
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
  // configured = ready to lock (at least one competency carries a statement).
  const configured = !!config?.competencies?.some((c) => c.behaviors.length > 0);
  // The framework detail renders whenever a config exists — including a Draft with
  // nothing in it yet, which shows its own "nothing set up" empty state.
  const hasConfig = !!config;

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
                : "Not configured yet. Set up the competencies, statements and quorum to begin."}
          </div>
        </div>

        <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
          {locked ? (
            <>
              <button
                style={{ ...btnSecondary, ...(reopening ? { opacity: 0.5, cursor: "not-allowed" } : {}) }}
                disabled={reopening}
                onClick={reopen}
                title="Unlock to edit the competencies, statements and quorum"
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

      {/* Framework — the full configured detail: every competency with the behavior
          statements raters rate, the open-ended questions, and the quorum. */}
      {hasConfig && config && (
        <>
          <div style={cardBox}>
            <div style={{ fontSize: 13, fontWeight: 700, color: C.navy, marginBottom: 2 }}>
              Competency Framework
            </div>
            <div style={{ fontSize: 11, color: C.muted, marginBottom: 14 }}>
              {config.competencies.length} competencies ·{" "}
              {config.competencies.reduce((n, c) => n + c.behaviors.length, 0)} behavior statements
              {locked ? " · frozen at lock" : " · draft, not yet locked"}
            </div>

            {config.competencies.length === 0 ? (
              <div style={emptyHint}>
                No competencies yet. Use <b>Configure 360°</b> to add them, along with the behavior
                statements raters will rate.
              </div>
            ) : (
              config.competencies.map((c, ci) => (
                <CompetencyBlock
                  key={c.competency_id}
                  index={ci}
                  title={c.title}
                  behaviors={c.behaviors}
                />
              ))
            )}
          </div>

          {/* Open-ended questions */}
          <div style={cardBox}>
            <div style={{ fontSize: 13, fontWeight: 700, color: C.navy, marginBottom: 2 }}>
              Open-Ended Questions
            </div>
            <div style={{ fontSize: 11, color: C.muted, marginBottom: 12 }}>
              Asked once at the end of the rater form, after all competencies.
            </div>
            {config.open_questions.length === 0 ? (
              <div style={emptyHint}>No open-ended questions set yet.</div>
            ) : (
              config.open_questions.map((q, i) => (
                <div key={i} style={{ display: "flex", gap: 8, alignItems: "flex-start", marginTop: 8 }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: C.navy, flexShrink: 0 }}>{i + 1}.</span>
                  <span style={{ flex: 1, fontSize: 12, color: C.navy, lineHeight: 1.6 }}>{q.prompt}</span>
                  {!q.mandatory && <OptionalTag />}
                </div>
              ))
            )}
          </div>

          {/* Quorum */}
          <div style={cardBox}>
            <div style={{ fontSize: 13, fontWeight: 700, color: C.navy, marginBottom: 2 }}>
              Minimum Responses (Quorum)
            </div>
            <div style={{ fontSize: 11, color: C.muted, marginBottom: 12 }}>
              Minimum completed responses required per reviewer category. Self is always required.
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: 10 }}>
              <QuorumChip label="Self" value={1} fixed />
              <QuorumChip label="Manager" value={config.quorum.manager} />
              <QuorumChip label="Skip-Level" value={config.quorum.skip_manager} />
              <QuorumChip label="Peer" value={config.quorum.peer} />
              <QuorumChip label="Direct Report" value={config.quorum.direct_report} />
              <QuorumChip
                label={config.quorum.others_label?.trim() || "Others"}
                value={config.quorum.others}
              />
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ── All Orgs roll-up (superadmin, no org selected) ────────────────

function AllOrgsOverview({ onSelectOrg }: { onSelectOrg?: (orgId: string) => void }) {
  const [rows, setRows] = useState<OrgOverview[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  useEffect(() => {
    feedback360ManageApi.orgsOverview()
      .then((r) => setRows(r.data ?? []))
      .catch((e) => setErr((e as Error).message))
      .finally(() => setLoading(false));
  }, []);

  const configuredCount = rows.filter((r) => r.status !== "not_configured").length;
  const liveCount = rows.filter((r) => ["locked", "active", "completed"].includes(r.status)).length;

  return (
    <div style={{ ...ff, padding: 24, display: "flex", flexDirection: "column", gap: 16 }}>
      {err && <div style={banner.err}>{err}</div>}

      <div style={{ fontSize: 12, color: C.muted }}>
        Each organization has a single 360° feedback configuration. Select an organization below — or use the
        Org filter above — to configure it and assign participants.
      </div>

      {!loading && rows.length > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14 }}>
          <Stat label="Organizations" value={rows.length} />
          <Stat label="Configured" value={configuredCount} />
          <Stat label="Live" value={liveCount} color={C.green} />
        </div>
      )}

      <div style={{ ...cardBox, padding: 0, overflow: "hidden" }}>
        <div style={orgRow.header}>
          <div style={{ flex: 2 }}>Organization</div>
          <div style={{ width: 110 }}>Status</div>
          <div style={{ width: 130, textAlign: "center" }}>Framework</div>
          <div style={{ width: 72, textAlign: "center" }}>Assigned</div>
          <div style={{ width: 72, textAlign: "center" }}>Invited</div>
          <div style={{ width: 82, textAlign: "center" }}>Completed</div>
        </div>

        {loading ? (
          <div style={orgRow.empty}>Loading organizations…</div>
        ) : rows.length === 0 ? (
          <div style={orgRow.empty}>No organizations yet.</div>
        ) : rows.map((r) => (
          <button
            key={r.org_id}
            onClick={() => onSelectOrg?.(r.org_id)}
            disabled={!onSelectOrg}
            title={onSelectOrg ? `Open ${r.org_name}'s 360° configuration` : undefined}
            style={{ ...orgRow.row, cursor: onSelectOrg ? "pointer" : "default" }}
          >
            <div style={{ flex: 2, minWidth: 0, textAlign: "left" }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: C.navy, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {r.org_name}
              </div>
              {r.locked_at && (
                <div style={{ fontSize: 10, color: C.muted, marginTop: 2 }}>Locked {fmtDate(r.locked_at)}</div>
              )}
            </div>
            <div style={{ width: 110 }}>
              <span style={pill(r.status === "not_configured" ? C.muted : statusColor(r.status))}>
                {r.status === "not_configured" ? "not set up" : r.status}
              </span>
            </div>
            <div style={{ width: 130, textAlign: "center", fontSize: 11, color: C.muted }}>
              {r.competency_count === 0
                ? "—"
                : `${r.competency_count} comp · ${r.statement_count} stmt`}
            </div>
            <StatCell value={r.assigned_count} />
            <StatCell value={r.invited_count} />
            <StatCell value={r.completed_count} color={r.completed_count > 0 ? C.green : undefined} width={82} />
          </button>
        ))}
      </div>
    </div>
  );
}

function StatCell({ value, color, width = 72 }: { value: number; color?: string; width?: number }) {
  return (
    <div style={{ width, textAlign: "center", fontSize: 14, fontWeight: 700, color: value === 0 ? C.muted : (color ?? C.navy) }}>
      {value}
    </div>
  );
}

const orgRow = {
  header: {
    display: "flex", alignItems: "center", gap: 12, padding: "10px 16px", background: C.page,
    fontSize: 11, fontWeight: 700, color: C.muted, letterSpacing: 0.5, textTransform: "uppercase",
  } as React.CSSProperties,
  row: {
    display: "flex", alignItems: "center", gap: 12, padding: "12px 16px", width: "100%",
    borderTop: `1px solid ${C.border}`, background: "#fff", border: "none",
    borderTopWidth: 1, borderTopStyle: "solid", borderTopColor: C.border,
    fontFamily: "Poppins, sans-serif",
  } as React.CSSProperties,
  empty: {
    padding: 32, textAlign: "center", color: C.muted, fontSize: 13, borderTop: `1px solid ${C.border}`,
  } as React.CSSProperties,
};

// ── Framework detail primitives ───────────────────────────────────

// One competency and the exact questions raters will answer under it.
function CompetencyBlock({
  index, title, behaviors,
}: {
  index: number;
  title: string;
  behaviors: { statement: string; mandatory: boolean }[];
}) {
  return (
    <div style={{ marginTop: index === 0 ? 0 : 16, paddingTop: index === 0 ? 0 : 16, borderTop: index === 0 ? "none" : `1px solid ${C.border}` }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 8 }}>
        <span style={{ fontSize: 10, fontWeight: 700, color: C.muted, letterSpacing: 0.5 }}>
          {String(index + 1).padStart(2, "0")}
        </span>
        <span style={{ fontSize: 13, fontWeight: 700, color: C.navy }}>{title}</span>
        <span style={{ fontSize: 11, color: C.muted }}>
          · {behaviors.length} statement{behaviors.length === 1 ? "" : "s"}
        </span>
      </div>

      {behaviors.length === 0 ? (
        <div style={{ fontSize: 11, color: C.amber, paddingLeft: 24 }}>No behavior statements added yet.</div>
      ) : (
        behaviors.map((b, bi) => (
          <div key={bi} style={{ display: "flex", gap: 8, alignItems: "flex-start", paddingLeft: 24, marginTop: 6 }}>
            <span style={{ color: C.muted, fontSize: 12, flexShrink: 0 }}>•</span>
            <span style={{ flex: 1, fontSize: 12, color: C.navy, lineHeight: 1.6 }}>
              {b.statement}
            </span>
            {!b.mandatory && <OptionalTag />}
          </div>
        ))
      )}
    </div>
  );
}

function OptionalTag() {
  return (
    <span style={{
      fontSize: 9, fontWeight: 700, color: C.amber, background: "rgba(245,158,11,0.1)",
      borderRadius: 20, padding: "2px 7px", flexShrink: 0, letterSpacing: 0.3,
    }}>OPTIONAL</span>
  );
}

// A minimum of 0 means the category is switched off — no responses required.
function QuorumChip({ label, value, fixed = false }: { label: string; value: number; fixed?: boolean }) {
  const optional = !fixed && value === 0;
  return (
    <div style={{
      background: C.page, border: `1px solid ${C.border}`, borderRadius: 10, padding: "10px 12px",
    }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: C.muted, letterSpacing: 0.5, textTransform: "uppercase" }}>
        {label}
      </div>
      <div style={{ fontSize: 18, fontWeight: 800, color: optional ? C.muted : C.navy, marginTop: 2 }}>
        {optional ? "—" : value}
      </div>
      <div style={{ fontSize: 9, color: C.muted }}>
        {fixed ? "always required" : optional ? "not required" : `min response${value === 1 ? "" : "s"}`}
      </div>
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

const emptyHint: React.CSSProperties = {
  background: C.page, border: `1px dashed ${C.border}`, borderRadius: 10,
  padding: "14px 16px", fontSize: 12, color: C.muted, lineHeight: 1.6,
};

const banner = {
  err: { background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.25)", borderRadius: 8, padding: "10px 14px", fontSize: 12, color: "#ef4444" } as React.CSSProperties,
};
