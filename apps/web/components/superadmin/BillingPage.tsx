"use client";

// Styling deliberately replicates (not imports - the source objects aren't
// exported) two existing conventions:
// - Table/card/badge/button tokens from OrgsPage's local `p` style object
//   in app/dashboard/superadmin/page.tsx (background/border/radius/shadow,
//   header row, row divider, badge formula).
// - The tab-toggle pattern from components/participant/AssessmentsExperience.tsx
//   (inactive: white/border/muted-text; active: solid navy/white-text),
//   which itself matches apps/CLAUDE.md's documented "Tab Bar" spec.
import { useEffect, useState } from "react";
import { api, ApiResponse, OrgResponse } from "@/lib/api";
import { billingApi, ParticipantEnrollmentDTO } from "@/lib/billing-api";

const ff: React.CSSProperties = { fontFamily: "Poppins, sans-serif" };
const NAVY = "var(--xa-navy)";
const MUTED = "var(--xa-muted)";
const BORDER = "#E6DED0";

const s: Record<string, React.CSSProperties> = {
  page: { padding: 24, display: "flex", flexDirection: "column", gap: 16, ...ff },
  tabRow: { display: "flex", gap: 8 },
  tab: {
    ...ff, padding: "8px 18px", border: `1px solid ${BORDER}`, borderRadius: 8,
    background: "#fff", color: MUTED, fontSize: 12, fontWeight: 600, cursor: "pointer",
  },
  tabActive: { background: NAVY, color: "#fff", border: `1px solid ${NAVY}`, fontWeight: 700 },
  tableCard: {
    background: "#fff", borderRadius: 12, border: `1px solid ${BORDER}`,
    boxShadow: "0 1px 4px rgba(24, 40, 72,0.07)", overflow: "hidden",
  },
  table: { width: "100%", borderCollapse: "collapse" },
  thead: { background: "#F7F5F0" },
  th: { padding: "12px 16px", textAlign: "left", fontSize: 11, fontWeight: 700, color: MUTED, letterSpacing: 0.5 },
  tr: { borderTop: `1px solid ${BORDER}` },
  td: { padding: "13px 16px", fontSize: 13, color: NAVY },
  empty: {
    display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
    padding: 64, color: MUTED, fontSize: 13,
  },
  errBanner: {
    background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.25)",
    borderRadius: 8, padding: "10px 14px", fontSize: 12, color: "#dc2626",
  },
  editableCell: {
    ...ff, border: `1px solid ${BORDER}`, borderRadius: 6, padding: "5px 8px",
    fontSize: 12, color: NAVY, width: "100%", boxSizing: "border-box",
  },
  editHint: {
    fontSize: 12, color: MUTED, cursor: "pointer", padding: "4px 6px", borderRadius: 6,
    border: "1px solid transparent",
  },
};

type EditableField = "plan_start_date" | "plan_end_date" | "billing_note";

export default function BillingPage() {
  const [view, setView] = useState<"organizations" | "participants">("organizations");

  const [orgs, setOrgs] = useState<OrgResponse[]>([]);
  const [orgsLoading, setOrgsLoading] = useState(true);
  const [orgsErr, setOrgsErr] = useState("");

  const [participants, setParticipants] = useState<ParticipantEnrollmentDTO[]>([]);
  const [participantsLoading, setParticipantsLoading] = useState(true);
  const [participantsErr, setParticipantsErr] = useState("");
  const [participantsPage, setParticipantsPage] = useState(1);
  const [participantsTotal, setParticipantsTotal] = useState(0);
  const PARTICIPANTS_PER_PAGE = 20;

  const [editing, setEditing] = useState<{ orgId: string; field: EditableField } | null>(null);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveErr, setSaveErr] = useState("");

  useEffect(() => {
    api.get<ApiResponse<OrgResponse[]>>("/organizations")
      .then(r => setOrgs(r.data ?? []))
      .catch(e => setOrgsErr((e as Error).message || "Failed to load organizations"))
      .finally(() => setOrgsLoading(false));
  }, []);

  useEffect(() => {
    setParticipantsLoading(true);
    billingApi.listParticipants(participantsPage, PARTICIPANTS_PER_PAGE)
      .then(r => {
        setParticipants(r.data ?? []);
        setParticipantsTotal(r.meta?.total ?? 0);
      })
      .catch(e => setParticipantsErr((e as Error).message || "Failed to load participants"))
      .finally(() => setParticipantsLoading(false));
  }, [participantsPage]);

  function startEdit(orgId: string, field: EditableField, currentValue: string) {
    setEditing({ orgId, field });
    setDraft(currentValue);
    setSaveErr("");
  }

  async function commitEdit() {
    if (!editing) return;
    const { orgId, field } = editing;
    setSaving(true);
    setSaveErr("");
    try {
      const res = await api.patch<ApiResponse<OrgResponse>>(`/organizations/${orgId}`, { [field]: draft });
      if (res.data) {
        setOrgs(prev => prev.map(o => (o.id === orgId ? res.data! : o)));
      }
      setEditing(null);
    } catch (e) {
      setSaveErr((e as Error).message || "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  function cancelEdit() {
    setEditing(null);
    setSaveErr("");
  }

  return (
    <div style={s.page}>
      <div style={s.tabRow}>
        <button
          onClick={() => setView("organizations")}
          style={{ ...s.tab, ...(view === "organizations" ? s.tabActive : {}) }}
        >
          Organizations
        </button>
        <button
          onClick={() => setView("participants")}
          style={{ ...s.tab, ...(view === "participants" ? s.tabActive : {}) }}
        >
          Participants
        </button>
      </div>

      {saveErr && <div style={s.errBanner}>{saveErr}</div>}

      {view === "organizations" ? (
        <OrganizationsTable
          orgs={orgs}
          loading={orgsLoading}
          error={orgsErr}
          editing={editing}
          draft={draft}
          saving={saving}
          onStartEdit={startEdit}
          onDraftChange={setDraft}
          onCommit={commitEdit}
          onCancel={cancelEdit}
        />
      ) : (
        <ParticipantsTable
          participants={participants}
          loading={participantsLoading}
          error={participantsErr}
          page={participantsPage}
          total={participantsTotal}
          perPage={PARTICIPANTS_PER_PAGE}
          onPageChange={setParticipantsPage}
        />
      )}
    </div>
  );
}

function orgDetails(org: OrgResponse): string {
  const parts = [org.industry, org.size].filter((v): v is string => !!v && v.trim() !== "");
  return parts.length > 0 ? parts.join(" · ") : "-";
}

function OrganizationsTable({
  orgs, loading, error, editing, draft, saving, onStartEdit, onDraftChange, onCommit, onCancel,
}: {
  orgs: OrgResponse[];
  loading: boolean;
  error: string;
  editing: { orgId: string; field: EditableField } | null;
  draft: string;
  saving: boolean;
  onStartEdit: (orgId: string, field: EditableField, currentValue: string) => void;
  onDraftChange: (v: string) => void;
  onCommit: () => void;
  onCancel: () => void;
}) {
  function editableCell(org: OrgResponse, field: EditableField, displayValue: string, type: "date" | "text") {
    const isEditing = editing?.orgId === org.id && editing.field === field;
    if (isEditing) {
      return (
        <input
          autoFocus
          type={type}
          value={draft}
          disabled={saving}
          onChange={e => onDraftChange(e.target.value)}
          onBlur={onCommit}
          onKeyDown={e => {
            if (e.key === "Enter") onCommit();
            if (e.key === "Escape") onCancel();
          }}
          style={s.editableCell}
        />
      );
    }
    return (
      <span
        style={s.editHint}
        title="Click to edit"
        onClick={() => onStartEdit(org.id, field, field === "billing_note" ? org.billing_note ?? "" : displayValue === "-" ? "" : displayValue)}
      >
        {displayValue}
      </span>
    );
  }

  return (
    <div style={s.tableCard}>
      {loading ? (
        <div style={s.empty}>Loading organizations…</div>
      ) : error ? (
        <div style={{ ...s.empty, color: "#dc2626" }}>{error}</div>
      ) : orgs.length === 0 ? (
        <div style={s.empty}>No organizations yet.</div>
      ) : (
        <div className="xa-table-wrap">
          <table style={s.table}>
          <thead>
            <tr style={s.thead}>
              {["Organization", "Program Manager", "Details", "Plan Start", "Plan End", "Reminder / Description"].map(h => (
                <th key={h} style={s.th}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {orgs.map(org => (
              <tr key={org.id} style={s.tr}>
                <td style={s.td}>
                  <span style={{ fontWeight: 600, color: NAVY }}>{org.name}</span>
                </td>
                <td style={{ ...s.td, color: org.program_manager_name ? NAVY : MUTED }}>
                  {org.program_manager_name || "-"}
                </td>
                <td style={{ ...s.td, color: MUTED }}>{orgDetails(org)}</td>
                <td style={s.td}>{editableCell(org, "plan_start_date", org.plan_start_date || "-", "date")}</td>
                <td style={s.td}>{editableCell(org, "plan_end_date", org.plan_end_date || "-", "date")}</td>
                <td style={{ ...s.td, minWidth: 220 }}>
                  {editableCell(org, "billing_note", org.billing_note || "-", "text")}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      )}
    </div>
  );
}

function ParticipantsTable({ participants, loading, error, page, total, perPage, onPageChange }: {
  participants: ParticipantEnrollmentDTO[];
  loading: boolean;
  error: string;
  page: number;
  total: number;
  perPage: number;
  onPageChange: (p: number) => void;
}) {
  const totalPages = Math.max(1, Math.ceil(total / perPage));
  return (
    <div style={s.tableCard}>
      {loading ? (
        <div style={s.empty}>Loading participants…</div>
      ) : error ? (
        <div style={{ ...s.empty, color: "#dc2626" }}>{error}</div>
      ) : participants.length === 0 ? (
        <div style={s.empty}>No open-program participants yet.</div>
      ) : (
        <>
          <div className="xa-table-wrap">
            <table style={s.table}>
            <thead>
              <tr style={s.thead}>
                {["Participant", "Email", "Enrolled Program", "Start Date", "End Date"].map(h => (
                  <th key={h} style={s.th}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {participants.map(p => (
                <tr key={`${p.user_id}-${p.program_title}-${p.start_date}`} style={s.tr}>
                  <td style={s.td}><span style={{ fontWeight: 600, color: NAVY }}>{p.name}</span></td>
                  <td style={{ ...s.td, color: MUTED }}>{p.email}</td>
                  <td style={s.td}>{p.program_title}</td>
                  <td style={s.td}>{p.start_date}</td>
                  <td style={{ ...s.td, color: p.end_date ? NAVY : MUTED }}>{p.end_date || "Active"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
          <Pager page={page} totalPages={totalPages} onChange={onPageChange} />
        </>
      )}
    </div>
  );
}

function Pager({ page, totalPages, onChange }: { page: number; totalPages: number; onChange: (p: number) => void }) {
  if (totalPages <= 1) return null;
  const btn = (disabled: boolean): React.CSSProperties => ({
    ...ff, padding: "7px 14px", borderRadius: 8, border: `1px solid ${BORDER}`,
    background: "#fff", color: disabled ? "#C9BFA8" : NAVY, fontSize: 12, fontWeight: 600,
    cursor: disabled ? "not-allowed" : "pointer",
  });
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 12, padding: "14px 16px", borderTop: `1px solid ${BORDER}` }}>
      <button style={btn(page <= 1)} disabled={page <= 1} onClick={() => onChange(page - 1)}>← Prev</button>
      <span style={{ ...ff, fontSize: 12, color: MUTED, fontWeight: 600 }}>Page {page} of {totalPages}</span>
      <button style={btn(page >= totalPages)} disabled={page >= totalPages} onClick={() => onChange(page + 1)}>Next →</button>
    </div>
  );
}
