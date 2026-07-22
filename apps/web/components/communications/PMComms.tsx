"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import ReactDOM from "react-dom";
import {
  communicationsApi,
  EmailTemplate, EmailCampaign, AutomationRule, NotificationLog,
} from "@/lib/communications-api";
import { cohortsApi, CohortDTO } from "@/lib/cohorts-api";

const NAVY   = "var(--xa-navy)";
const ORANGE = "var(--xa-primary)";
const INDIGO = "var(--xa-muted)";
const BG     = "var(--xa-bg)";
const BORDER = "#E6DED0";
const MUTED  = "var(--xa-muted)";
const GREEN  = "#22c55e";
const RED    = "#ef4444";
const AMBER  = "#f59e0b";

const TABS = [
  { id: "campaigns", label: "Campaigns" },
  { id: "rules",     label: "Automation Rules" },
  { id: "logs",      label: "Notification Log" },
];

const AUDIENCE_LABELS: Record<string, string> = {
  all_participants: "All Participants",
  at_risk:         "At-Risk Only",
  incomplete:      "Incomplete Only",
};

const STATUS_COLORS: Record<string, [string, string]> = {
  draft:     [MUTED,   `${MUTED}14`],
  scheduled: [INDIGO,  `${INDIGO}14`],
  sending:   [ORANGE,  `${ORANGE}14`],
  sent:      [GREEN,   "#22c55e14"],
  cancelled: [RED,     "#ef444414"],
};

const CHANNEL_COLORS: Record<string, [string, string]> = {
  email: [NAVY,   `${NAVY}14`],
  push:  [INDIGO, `${INDIGO}14`],
  both:  [ORANGE, `${ORANGE}14`],
};

const TRIGGER_LABELS: Record<string, string> = {
  not_logged_in_N_days:    "Not logged in for N days",
  activity_overdue_N_days: "Activity overdue by N days",
  phase_starts:            "Phase starts",
  phase_ends_in_N_days:    "Phase ends in N days",
  completion_below_pct:    "Completion below X%",
  assessment_failed:       "Assessment failed (below 50%)",
  cohort_starts_in_N_days: "Cohort starts in N days",
  milestone_day_X:         "Milestone day X (since cohort start)",
};

const TRIGGER_NEEDS_N: Record<string, { key: string; label: string } | null> = {
  not_logged_in_N_days:    { key: "days",  label: "Days inactive" },
  activity_overdue_N_days: { key: "days",  label: "Days overdue" },
  phase_starts:            null,
  phase_ends_in_N_days:    { key: "days",  label: "Days before end" },
  completion_below_pct:    { key: "pct",   label: "Completion % threshold" },
  assessment_failed:       null,
  cohort_starts_in_N_days: { key: "days",  label: "Days before start" },
  milestone_day_X:         { key: "day_x", label: "Day number" },
};

const MERGE_VARS = [
  "{{participant_name}}",
  "{{cohort_name}}",
  "{{program_title}}",
  "{{completion_percent}}",
  "{{days_inactive}}",
  "{{phase_name}}",
];

// ── Shared primitives ─────────────────────────────────────────────

function Badge({ label, color, bg }: { label: string; color: string; bg: string }) {
  return (
    <span style={{ background: bg, color, fontSize: 10, fontWeight: 700, borderRadius: 20, padding: "3px 9px", whiteSpace: "nowrap" }}>
      {(label ?? "").toUpperCase()}
    </span>
  );
}

function Btn({
  children, onClick, variant = "secondary", disabled = false, style: extra,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  variant?: "primary" | "secondary" | "danger" | "orange";
  disabled?: boolean;
  style?: React.CSSProperties;
}) {
  const base: React.CSSProperties = {
    borderRadius: 8, padding: "8px 18px", fontSize: 12, fontWeight: 700,
    fontFamily: "Poppins,sans-serif", cursor: disabled ? "not-allowed" : "pointer",
    border: "none", opacity: disabled ? 0.5 : 1,
  };
  const variants: Record<string, React.CSSProperties> = {
    primary:   { background: NAVY,   color: "#fff" },
    orange:    { background: ORANGE, color: "#fff" },
    secondary: { background: "#fff", color: NAVY, border: `1px solid ${BORDER}` },
    danger:    { background: RED,    color: "#fff" },
  };
  return (
    <button onClick={disabled ? undefined : onClick} style={{ ...base, ...variants[variant], ...extra }}>
      {children}
    </button>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: 10, fontWeight: 700, color: MUTED, letterSpacing: 0.5, textTransform: "uppercase", marginBottom: 6 }}>
      {children}
    </div>
  );
}

function Card({ children, style: extra, onClick }: { children: React.ReactNode; style?: React.CSSProperties; onClick?: () => void }) {
  return (
    <div onClick={onClick} style={{
      background: "#fff", borderRadius: 12, border: `1px solid ${BORDER}`,
      boxShadow: "0 1px 4px rgba(24, 40, 72,0.07)", ...extra,
      cursor: onClick ? "pointer" : "default",
    }}>
      {children}
    </div>
  );
}

function Skeleton() {
  return (
    <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 10 }}>
      {[100, 80, 90, 70].map((w) => (
        <div key={w} className="xa-skeleton" style={{ background: "#EFE9DC", borderRadius: 8, width: `${w}%`, height: 14 }} />
      ))}
    </div>
  );
}

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div onClick={() => onChange(!checked)} style={{
      width: 36, height: 20, borderRadius: 99, background: checked ? GREEN : BORDER,
      position: "relative", cursor: "pointer", flexShrink: 0, transition: "background 0.18s ease",
    }}>
      <div style={{
        position: "absolute", top: 2, left: checked ? 18 : 2, width: 16, height: 16,
        borderRadius: "50%", background: "#fff",
        transition: "left 0.18s cubic-bezier(0.34,1.56,0.64,1)",
        boxShadow: "0 1px 4px rgba(0,0,0,0.15)",
      }} />
    </div>
  );
}

function ConfirmModal({ title, body, onConfirm, onCancel, confirmLabel = "Confirm", danger = false }: {
  title: string; body: string; onConfirm: () => void; onCancel: () => void;
  confirmLabel?: string; danger?: boolean;
}) {
  if (typeof document === "undefined") return null;

  return ReactDOM.createPortal(
    <div className="xa-modal-overlay" style={{ position: "fixed", inset: 0, background: "rgba(24, 40, 72,0.5)", zIndex: 2000, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div className="xa-modal-content" style={{ background: "#fff", borderRadius: 16, maxWidth: 440, width: "100%", boxShadow: "0 24px 64px rgba(24, 40, 72,0.22)" }}>
        <div style={{ padding: "18px 24px", borderBottom: `1px solid ${BORDER}` }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: NAVY }}>{title}</div>
        </div>
        <div style={{ padding: "16px 24px", fontSize: 13, color: MUTED, lineHeight: 1.6 }}>{body}</div>
        <div style={{ padding: "14px 24px", borderTop: `1px solid ${BORDER}`, display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <Btn variant="secondary" onClick={onCancel}>Cancel</Btn>
          <Btn variant={danger ? "danger" : "orange"} onClick={onConfirm}>{confirmLabel}</Btn>
        </div>
      </div>
    </div>,
    document.body
  );
}

// ── Root component ────────────────────────────────────────────────

export default function PMComms({ orgId }: { orgId: string }) {
  const [activeTab, setActiveTab] = useState("campaigns");

  return (
    <div style={{ padding: 24, display: "flex", flexDirection: "column", gap: 16, fontFamily: "Poppins,sans-serif" }}>
      <div style={{ display: "flex", gap: 4, background: "#fff", border: `1px solid ${BORDER}`, borderRadius: 10, padding: "6px 8px", boxShadow: "0 1px 4px rgba(24, 40, 72,0.07)" }}>
        {TABS.map(t => (
          <button key={t.id} onClick={() => setActiveTab(t.id)} style={{
            padding: "7px 16px", borderRadius: 8, fontSize: 12, border: "none",
            cursor: "pointer", fontFamily: "Poppins,sans-serif",
            ...(activeTab === t.id
              ? { background: NAVY, color: "#fff", fontWeight: 700 }
              : { background: "transparent", color: MUTED, fontWeight: 500 }),
          }}>
            {t.label}
          </button>
        ))}
      </div>

      <div key={activeTab} className="xa-tab-panel">
        {activeTab === "campaigns" && <TabCampaigns orgId={orgId} />}
        {activeTab === "rules"     && <TabRules orgId={orgId} />}
        {activeTab === "logs"      && <TabLogs orgId={orgId} />}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// TAB 1 - CAMPAIGNS
// ═══════════════════════════════════════════════════════════

type CampaignForm = {
  name: string; cohort_id: string; audience: string;
  subject: string; body_html: string; template_id: string;
};

const EMPTY_CAMPAIGN: CampaignForm = {
  name: "", cohort_id: "", audience: "all_participants",
  subject: "", body_html: "", template_id: "",
};

function TabCampaigns({ orgId }: { orgId: string }) {
  const [campaigns,  setCampaigns]  = useState<EmailCampaign[]>([]);
  const [templates,  setTemplates]  = useState<EmailTemplate[]>([]);
  const [cohorts,    setCohorts]    = useState<CohortDTO[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [selected,   setSelected]   = useState<EmailCampaign | null>(null);
  const [creating,   setCreating]   = useState(false);
  const [form,       setForm]       = useState<CampaignForm>(EMPTY_CAMPAIGN);
  const [saving,     setSaving]     = useState(false);
  const [scheduleAt, setScheduleAt] = useState("");
  const [confirm,    setConfirm]    = useState<{ type: "send" | "delete"; id: string } | null>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [c, t, co] = await Promise.allSettled([
      communicationsApi.listCampaigns(orgId),
      communicationsApi.listTemplates(orgId),
      cohortsApi.list(orgId),
    ]);
    if (c.status === "fulfilled") setCampaigns(c.value.data ?? []);
    if (t.status === "fulfilled") setTemplates(t.value.data ?? []);
    if (co.status === "fulfilled") setCohorts(co.value.data ?? []);
    setLoading(false);
  }, [orgId]);

  useEffect(() => { load(); }, [load]);

  function openCreate() {
    setSelected(null);
    setForm(EMPTY_CAMPAIGN);
    setCreating(true);
  }

  function openEdit(c: EmailCampaign) {
    setCreating(false);
    setSelected(c);
    setForm({
      name: c.name, cohort_id: c.cohort_id ?? "", audience: c.audience,
      subject: c.subject, body_html: c.body_html, template_id: c.template_id ?? "",
    });
  }

  function applyTemplate(tplId: string) {
    const tpl = templates.find(t => t.id === tplId);
    if (tpl) setForm(f => ({ ...f, subject: tpl.subject, body_html: tpl.body_html, template_id: tplId }));
  }

  function insertVar(v: string) {
    const el = bodyRef.current;
    if (!el) { setForm(f => ({ ...f, body_html: f.body_html + v })); return; }
    const start = el.selectionStart ?? el.value.length;
    const end   = el.selectionEnd   ?? el.value.length;
    const next  = el.value.slice(0, start) + v + el.value.slice(end);
    setForm(f => ({ ...f, body_html: next }));
    setTimeout(() => { el.focus(); el.setSelectionRange(start + v.length, start + v.length); }, 0);
  }

  async function handleSave() {
    if (!form.name || !form.subject || !form.body_html) return;
    setSaving(true);
    try {
      if (creating) {
        const res = await communicationsApi.createCampaign({ org_id: orgId, ...form });
        if (res.data) {
          setCampaigns(prev => [res.data, ...prev]);
          setCreating(false);
          setSelected(res.data);
        }
      } else if (selected) {
        const res = await communicationsApi.updateCampaign(selected.id, form);
        if (res.data) {
          setCampaigns(prev => prev.map(c => c.id === selected.id ? res.data : c));
          setSelected(res.data);
        }
      }
    } catch { /* ignore */ }
    setSaving(false);
  }

  async function handleSend(id: string) {
    try {
      const res = await communicationsApi.sendCampaign(id);
      if (res.data) {
        setCampaigns(prev => prev.map(c => c.id === id ? res.data : c));
        if (selected?.id === id) setSelected(res.data);
      }
    } catch { /* ignore */ }
    setConfirm(null);
  }

  async function handleSchedule() {
    if (!selected || !scheduleAt) return;
    try {
      const res = await communicationsApi.scheduleCampaign(selected.id, new Date(scheduleAt).toISOString());
      if (res.data) {
        setCampaigns(prev => prev.map(c => c.id === selected.id ? res.data : c));
        setSelected(res.data);
      }
    } catch { /* ignore */ }
  }

  async function handleDelete(id: string) {
    try {
      await communicationsApi.deleteCampaign(id);
      setCampaigns(prev => prev.filter(c => c.id !== id));
      if (selected?.id === id) { setSelected(null); setCreating(false); }
    } catch { /* ignore */ }
    setConfirm(null);
  }

  const showPanel = creating || !!selected;
  const isDraft   = !selected || selected.status === "draft";

  return (
    <div style={{ display: "grid", gridTemplateColumns: showPanel ? "320px 1fr" : "1fr", gap: 16, alignItems: "start" }}>
      {/* Campaign list */}
      <Card style={{ overflow: "hidden" }}>
        <div style={{ padding: "14px 16px", borderBottom: `1px solid ${BORDER}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: NAVY }}>Campaigns</div>
          <Btn variant="primary" onClick={openCreate} style={{ padding: "6px 14px" }}>+ New</Btn>
        </div>
        {loading ? <Skeleton /> : campaigns.length === 0 ? (
          <div style={{ padding: 32, textAlign: "center", color: MUTED, fontSize: 13 }}>No campaigns yet.</div>
        ) : (
          <div>
            {campaigns.map(c => {
              const [sc, sbg] = STATUS_COLORS[c.status] ?? [MUTED, `${MUTED}14`];
              const active = selected?.id === c.id;
              return (
                <div key={c.id} onClick={() => openEdit(c)} style={{
                  padding: "12px 16px", borderBottom: `1px solid ${BORDER}`, cursor: "pointer",
                  background: active ? `${NAVY}08` : "#fff",
                  borderLeft: active ? `3px solid ${ORANGE}` : "3px solid transparent",
                }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: NAVY }}>{c.name}</div>
                    <Badge label={c.status} color={sc} bg={sbg} />
                  </div>
                  <div style={{ fontSize: 11, color: MUTED }}>
                    {AUDIENCE_LABELS[c.audience]} &nbsp;·&nbsp;
                    {c.status === "sent" ? `${c.sent_count} sent` : c.scheduled_at ? `Scheduled ${new Date(c.scheduled_at).toLocaleDateString()}` : "Draft"}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {/* Editor panel */}
      {showPanel && (
        <Card style={{ padding: 24 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: NAVY, marginBottom: 20 }}>
            {creating ? "New Campaign" : `Edit: ${selected?.name}`}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div>
              <FieldLabel>Campaign Name *</FieldLabel>
              <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                placeholder="e.g. Week 2 Check-in"
                style={{ border: `1px solid ${BORDER}`, borderRadius: 8, padding: "9px 12px", fontSize: 13, fontFamily: "Poppins,sans-serif", color: NAVY, width: "100%", boxSizing: "border-box", outline: "none" }} />
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div>
                <FieldLabel>Cohort</FieldLabel>
                <select value={form.cohort_id} onChange={e => setForm(f => ({ ...f, cohort_id: e.target.value }))}
                  style={{ width: "100%", border: `1px solid ${BORDER}`, borderRadius: 8, padding: "9px 12px", fontSize: 13, fontFamily: "Poppins,sans-serif", color: NAVY, background: "#fff" }}>
                  <option value="">All cohorts</option>
                  {cohorts.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div>
                <FieldLabel>Audience</FieldLabel>
                <select value={form.audience} onChange={e => setForm(f => ({ ...f, audience: e.target.value }))}
                  style={{ width: "100%", border: `1px solid ${BORDER}`, borderRadius: 8, padding: "9px 12px", fontSize: 13, fontFamily: "Poppins,sans-serif", color: NAVY, background: "#fff" }}>
                  <option value="all_participants">All Participants</option>
                  <option value="at_risk">At-Risk Only</option>
                  <option value="incomplete">Incomplete Only</option>
                </select>
              </div>
            </div>

            {templates.length > 0 && (
              <div>
                <FieldLabel>Use Template</FieldLabel>
                <select value={form.template_id} onChange={e => applyTemplate(e.target.value)}
                  style={{ width: "100%", border: `1px solid ${BORDER}`, borderRadius: 8, padding: "9px 12px", fontSize: 13, fontFamily: "Poppins,sans-serif", color: NAVY, background: "#fff" }}>
                  <option value="">No template</option>
                  {templates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </div>
            )}

            <div>
              <FieldLabel>Subject *</FieldLabel>
              <input value={form.subject} onChange={e => setForm(f => ({ ...f, subject: e.target.value }))}
                placeholder="Email subject line"
                style={{ border: `1px solid ${BORDER}`, borderRadius: 8, padding: "9px 12px", fontSize: 13, fontFamily: "Poppins,sans-serif", color: NAVY, width: "100%", boxSizing: "border-box", outline: "none" }} />
            </div>

            <div>
              <FieldLabel>Body *</FieldLabel>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
                {MERGE_VARS.map(v => (
                  <span key={v} onClick={() => insertVar(v)} style={{
                    background: `${INDIGO}14`, color: INDIGO, fontSize: 11, fontWeight: 600,
                    borderRadius: 20, padding: "3px 10px", cursor: "pointer",
                  }}>{v}</span>
                ))}
              </div>
              <textarea ref={bodyRef} value={form.body_html}
                onChange={e => setForm(f => ({ ...f, body_html: e.target.value }))}
                placeholder="Write your email body. Click chips above to insert merge variables."
                rows={10}
                style={{ width: "100%", border: `1px solid ${BORDER}`, borderRadius: 8, padding: "10px 12px", fontSize: 13, fontFamily: "Poppins,sans-serif", color: NAVY, resize: "vertical", boxSizing: "border-box", outline: "none" }}
              />
            </div>

            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", paddingTop: 8, borderTop: `1px solid ${BORDER}` }}>
              <Btn variant="primary" onClick={handleSave} disabled={saving || !form.name || !form.subject || !form.body_html}>
                {saving ? "Saving..." : "Save Draft"}
              </Btn>
              {!creating && isDraft && selected && (
                <>
                  <Btn variant="orange" onClick={() => setConfirm({ type: "send", id: selected.id })}>Send Now</Btn>
                  <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                    <input type="datetime-local" value={scheduleAt} onChange={e => setScheduleAt(e.target.value)}
                      style={{ border: `1px solid ${BORDER}`, borderRadius: 8, padding: "8px 10px", fontSize: 12, fontFamily: "Poppins,sans-serif", color: NAVY }} />
                    <Btn variant="secondary" onClick={handleSchedule} disabled={!scheduleAt}>Schedule</Btn>
                  </div>
                </>
              )}
              {!creating && selected && (
                <Btn variant="danger" onClick={() => setConfirm({ type: "delete", id: selected.id })} style={{ marginLeft: "auto" }}>Delete</Btn>
              )}
            </div>
          </div>
        </Card>
      )}

      {confirm?.type === "send" && (
        <ConfirmModal title="Send Campaign" body="This will immediately send to all matching participants. This cannot be undone."
          confirmLabel="Send Now" onConfirm={() => handleSend(confirm.id)} onCancel={() => setConfirm(null)} />
      )}
      {confirm?.type === "delete" && (
        <ConfirmModal title="Delete Campaign" body="This will permanently delete this draft campaign."
          confirmLabel="Delete" danger onConfirm={() => handleDelete(confirm.id)} onCancel={() => setConfirm(null)} />
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// TAB 2 - AUTOMATION RULES
// ═══════════════════════════════════════════════════════════

type RuleForm = {
  name: string; trigger_type: string; trigger_n: string;
  channel: "email" | "push" | "both";
  message_subject: string; message_body: string; template_id: string;
};

const EMPTY_RULE: RuleForm = {
  name: "", trigger_type: "not_logged_in_N_days", trigger_n: "6",
  channel: "email", message_subject: "", message_body: "", template_id: "",
};

function TabRules({ orgId }: { orgId: string }) {
  const [rules,     setRules]     = useState<AutomationRule[]>([]);
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [showForm,  setShowForm]  = useState(false);
  const [editId,    setEditId]    = useState<string | null>(null);
  const [form,      setForm]      = useState<RuleForm>(EMPTY_RULE);
  const [saving,    setSaving]    = useState(false);
  const [deleting,  setDeleting]  = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [r, t] = await Promise.allSettled([
      communicationsApi.listRules(orgId),
      communicationsApi.listTemplates(orgId),
    ]);
    if (r.status === "fulfilled") setRules(r.value.data ?? []);
    if (t.status === "fulfilled") setTemplates(t.value.data ?? []);
    setLoading(false);
  }, [orgId]);

  useEffect(() => { load(); }, [load]);

  function openCreate() { setEditId(null); setForm(EMPTY_RULE); setShowForm(true); }

  function openEdit(rule: AutomationRule) {
    const cfg = rule.trigger_config ?? {};
    const n = String(cfg.days ?? cfg.pct ?? cfg.day_x ?? "");
    setEditId(rule.id);
    setForm({ name: rule.name, trigger_type: rule.trigger_type, trigger_n: n,
      channel: rule.channel, message_subject: rule.message_subject ?? "",
      message_body: rule.message_body ?? "", template_id: rule.template_id ?? "" });
    setShowForm(true);
  }

  function buildTriggerConfig(): Record<string, number> {
    const need = TRIGGER_NEEDS_N[form.trigger_type];
    if (!need) return {};
    return { [need.key]: Number(form.trigger_n) };
  }

  async function handleToggle(rule: AutomationRule) {
    try {
      const res = await communicationsApi.updateRule(rule.id, { is_active: !rule.is_active });
      if (res.data) setRules(prev => prev.map(r => r.id === rule.id ? res.data : r));
    } catch { /* ignore */ }
  }

  async function handleSave() {
    if (!form.name) return;
    setSaving(true);
    const payload = {
      org_id: orgId, name: form.name, trigger_type: form.trigger_type,
      trigger_config: buildTriggerConfig(), channel: form.channel,
      message_subject: form.message_subject || undefined,
      message_body: form.message_body || undefined,
      template_id: form.template_id || undefined,
    };
    try {
      if (editId) {
        const res = await communicationsApi.updateRule(editId, payload);
        if (res.data) setRules(prev => prev.map(r => r.id === editId ? res.data : r));
      } else {
        const res = await communicationsApi.createRule(payload);
        if (res.data) setRules(prev => [res.data, ...prev]);
      }
      setShowForm(false); setEditId(null);
    } catch { /* ignore */ }
    setSaving(false);
  }

  async function handleDelete(id: string) {
    setDeleting(id);
    try {
      await communicationsApi.deleteRule(id);
      setRules(prev => prev.filter(r => r.id !== id));
      if (editId === id) { setShowForm(false); setEditId(null); }
    } catch { /* ignore */ }
    setDeleting(null);
  }

  const needN = TRIGGER_NEEDS_N[form.trigger_type];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* IF-THEN form */}
      {showForm && (
        <Card style={{ padding: 24 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: NAVY, marginBottom: 20 }}>
            {editId ? "Edit Rule" : "New Automation Rule"}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div>
              <FieldLabel>Rule Name *</FieldLabel>
              <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                placeholder="e.g. 6-day inactivity nudge"
                style={{ border: `1px solid ${BORDER}`, borderRadius: 8, padding: "9px 12px", fontSize: 13, fontFamily: "Poppins,sans-serif", color: NAVY, width: "100%", boxSizing: "border-box", outline: "none" }} />
            </div>

            {/* IF block */}
            <div style={{ background: BG, borderRadius: 10, padding: 16, border: `1px solid ${BORDER}` }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: ORANGE, letterSpacing: 0.5, marginBottom: 12 }}>IF</div>
              <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                <select value={form.trigger_type} onChange={e => setForm(f => ({ ...f, trigger_type: e.target.value, trigger_n: "6" }))}
                  style={{ border: `1px solid ${BORDER}`, borderRadius: 8, padding: "8px 12px", fontSize: 13, fontFamily: "Poppins,sans-serif", color: NAVY, background: "#fff", minWidth: 280 }}>
                  {Object.entries(TRIGGER_LABELS).map(([k, v]) => (
                    <option key={k} value={k}>{v}</option>
                  ))}
                </select>
                {needN && (
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <input type="number" min={1} value={form.trigger_n}
                      onChange={e => setForm(f => ({ ...f, trigger_n: e.target.value }))}
                      style={{ width: 72, border: `1px solid ${BORDER}`, borderRadius: 8, padding: "8px 10px", fontSize: 13, fontFamily: "Poppins,sans-serif", color: NAVY, outline: "none" }} />
                    <span style={{ fontSize: 12, color: MUTED }}>{needN.label}</span>
                  </div>
                )}
              </div>
            </div>

            {/* THEN block */}
            <div style={{ background: BG, borderRadius: 10, padding: 16, border: `1px solid ${BORDER}` }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: NAVY, letterSpacing: 0.5, marginBottom: 12 }}>THEN SEND VIA</div>
              <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
                {(["email", "push", "both"] as const).map(ch => (
                  <button key={ch} onClick={() => setForm(f => ({ ...f, channel: ch }))} style={{
                    padding: "7px 16px", borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: "pointer",
                    fontFamily: "Poppins,sans-serif", border: "none",
                    ...(form.channel === ch ? { background: NAVY, color: "#fff" } : { background: "#fff", color: MUTED, border: `1px solid ${BORDER}` }),
                  }}>{ch.charAt(0).toUpperCase() + ch.slice(1)}</button>
                ))}
              </div>

              {(form.channel === "email" || form.channel === "both") && (
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {templates.length > 0 && (
                    <div>
                      <FieldLabel>Use Template</FieldLabel>
                      <select value={form.template_id} onChange={e => {
                        const tpl = templates.find(t => t.id === e.target.value);
                        setForm(f => ({ ...f, template_id: e.target.value, message_subject: tpl?.subject ?? f.message_subject, message_body: tpl?.body_html ?? f.message_body }));
                      }} style={{ width: "100%", border: `1px solid ${BORDER}`, borderRadius: 8, padding: "8px 12px", fontSize: 13, fontFamily: "Poppins,sans-serif", color: NAVY, background: "#fff" }}>
                        <option value="">Custom message</option>
                        {templates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                      </select>
                    </div>
                  )}
                  <div>
                    <FieldLabel>Email Subject</FieldLabel>
                    <input value={form.message_subject} onChange={e => setForm(f => ({ ...f, message_subject: e.target.value }))}
                      placeholder="Subject line"
                      style={{ border: `1px solid ${BORDER}`, borderRadius: 8, padding: "9px 12px", fontSize: 13, fontFamily: "Poppins,sans-serif", color: NAVY, width: "100%", boxSizing: "border-box", outline: "none" }} />
                  </div>
                  <div>
                    <FieldLabel>Email Body</FieldLabel>
                    <textarea value={form.message_body} onChange={e => setForm(f => ({ ...f, message_body: e.target.value }))}
                      placeholder="Message body - supports {{participant_name}}, {{cohort_name}}, etc."
                      rows={4}
                      style={{ width: "100%", border: `1px solid ${BORDER}`, borderRadius: 8, padding: "9px 12px", fontSize: 13, fontFamily: "Poppins,sans-serif", color: NAVY, resize: "vertical", boxSizing: "border-box", outline: "none" }} />
                  </div>
                </div>
              )}

              {(form.channel === "push" || form.channel === "both") && (
                <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: form.channel === "both" ? 12 : 0 }}>
                  {form.channel === "both" && <div style={{ fontSize: 11, fontWeight: 700, color: MUTED, letterSpacing: 0.5 }}>PUSH NOTIFICATION</div>}
                  <div>
                    <FieldLabel>Push Title</FieldLabel>
                    <input value={form.message_subject} onChange={e => setForm(f => ({ ...f, message_subject: e.target.value }))}
                      placeholder="Notification title"
                      style={{ border: `1px solid ${BORDER}`, borderRadius: 8, padding: "9px 12px", fontSize: 13, fontFamily: "Poppins,sans-serif", color: NAVY, width: "100%", boxSizing: "border-box", outline: "none" }} />
                  </div>
                  <div>
                    <FieldLabel>Push Message</FieldLabel>
                    <input value={form.message_body} onChange={e => setForm(f => ({ ...f, message_body: e.target.value }))}
                      placeholder="Short notification message"
                      style={{ border: `1px solid ${BORDER}`, borderRadius: 8, padding: "9px 12px", fontSize: 13, fontFamily: "Poppins,sans-serif", color: NAVY, width: "100%", boxSizing: "border-box", outline: "none" }} />
                  </div>
                </div>
              )}
            </div>

            <div style={{ display: "flex", gap: 10, paddingTop: 8, borderTop: `1px solid ${BORDER}` }}>
              <Btn variant="primary" onClick={handleSave} disabled={saving || !form.name}>
                {saving ? "Saving..." : editId ? "Update Rule" : "Save Rule"}
              </Btn>
              <Btn variant="secondary" onClick={() => { setShowForm(false); setEditId(null); }}>Cancel</Btn>
            </div>
          </div>
        </Card>
      )}

      {/* Rules table */}
      <Card style={{ overflow: "hidden" }}>
        <div style={{ padding: "14px 16px", borderBottom: `1px solid ${BORDER}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: NAVY }}>Active Rules</div>
          <Btn variant="primary" onClick={openCreate} style={{ padding: "6px 14px" }}>+ New Rule</Btn>
        </div>
        {loading ? <Skeleton /> : rules.length === 0 ? (
          <div style={{ padding: 40, textAlign: "center", color: MUTED, fontSize: 13 }}>No automation rules yet.</div>
        ) : (
          <div className="xa-table-wrap">
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: BG }}>
                {["RULE", "TRIGGER", "CHANNEL", "LAST RUN", "ACTIVE", "ACTIONS"].map(h => (
                  <th key={h} style={{ padding: "9px 14px", textAlign: "left", fontSize: 10, fontWeight: 700, color: MUTED, letterSpacing: 0.5, whiteSpace: "nowrap" }}>{h === "ACTIONS" ? "" : h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rules.map(rule => {
                const [rc, rbg] = CHANNEL_COLORS[rule.channel] ?? [MUTED, `${MUTED}14`];
                return (
                  <tr key={rule.id} style={{ borderTop: `1px solid ${BORDER}` }}>
                    <td style={{ padding: "11px 14px", fontWeight: 600, color: NAVY, fontSize: 13 }}>{rule.name}</td>
                    <td style={{ padding: "11px 14px" }}>
                      <span style={{ background: `${ORANGE}12`, color: ORANGE, fontSize: 10, fontWeight: 700, borderRadius: 20, padding: "3px 9px" }}>
                        {TRIGGER_LABELS[rule.trigger_type] ?? rule.trigger_type}
                      </span>
                    </td>
                    <td style={{ padding: "11px 14px" }}><Badge label={rule.channel} color={rc} bg={rbg} /></td>
                    <td style={{ padding: "11px 14px", fontSize: 11, color: MUTED }}>
                      {rule.last_run_at ? new Date(rule.last_run_at).toLocaleString() : "Never"}
                    </td>
                    <td style={{ padding: "11px 14px" }}>
                      <Toggle checked={rule.is_active} onChange={() => handleToggle(rule)} />
                    </td>
                    <td style={{ padding: "11px 14px" }}>
                      <div style={{ display: "flex", gap: 6 }}>
                        <Btn variant="secondary" onClick={() => openEdit(rule)} style={{ padding: "5px 12px", fontSize: 11 }}>Edit</Btn>
                        <Btn variant="danger" disabled={deleting === rule.id} onClick={() => handleDelete(rule.id)} style={{ padding: "5px 12px", fontSize: 11 }}>
                          {deleting === rule.id ? "..." : "Delete"}
                        </Btn>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          </div>
        )}
      </Card>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// TAB 3 - NOTIFICATION LOG
// ═══════════════════════════════════════════════════════════

function TabLogs({ orgId }: { orgId: string }) {
  const [logs,       setLogs]       = useState<NotificationLog[]>([]);
  const [campaigns,  setCampaigns]  = useState<EmailCampaign[]>([]);
  const [rules,      setRules]      = useState<AutomationRule[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [filterCamp, setFilterCamp] = useState("");
  const [filterRule, setFilterRule] = useState("");
  const [filterChan, setFilterChan] = useState("");
  const [filterFrom, setFilterFrom] = useState("");
  const [filterTo,   setFilterTo]   = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const [l, c, r] = await Promise.allSettled([
      communicationsApi.listLogs(orgId, filterCamp || undefined, filterRule || undefined),
      communicationsApi.listCampaigns(orgId),
      communicationsApi.listRules(orgId),
    ]);
    if (l.status === "fulfilled") setLogs(l.value.data ?? []);
    if (c.status === "fulfilled") setCampaigns(c.value.data ?? []);
    if (r.status === "fulfilled") setRules(r.value.data ?? []);
    setLoading(false);
  }, [orgId, filterCamp, filterRule]);

  useEffect(() => { load(); }, [load]);

  const filtered = logs.filter(log => {
    if (filterChan && log.channel !== filterChan) return false;
    if (filterFrom && new Date(log.sent_at) < new Date(filterFrom)) return false;
    if (filterTo && new Date(log.sent_at) > new Date(filterTo + "T23:59:59")) return false;
    return true;
  });

  const STATUS_LOG: Record<string, [string, string]> = {
    sent:    [GREEN, "#22c55e14"],
    failed:  [RED,   "#ef444414"],
    pending: [AMBER, "#f59e0b14"],
  };

  const selectStyle: React.CSSProperties = {
    border: `1px solid ${BORDER}`, borderRadius: 8, padding: "8px 12px",
    fontSize: 12, fontFamily: "Poppins,sans-serif", color: NAVY, background: "#fff",
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <Card style={{ padding: 16 }}>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
          <div>
            <FieldLabel>Campaign</FieldLabel>
            <select value={filterCamp} onChange={e => setFilterCamp(e.target.value)} style={{ ...selectStyle, minWidth: 180 }}>
              <option value="">All campaigns</option>
              {campaigns.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <FieldLabel>Rule</FieldLabel>
            <select value={filterRule} onChange={e => setFilterRule(e.target.value)} style={{ ...selectStyle, minWidth: 180 }}>
              <option value="">All rules</option>
              {rules.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
          </div>
          <div>
            <FieldLabel>Channel</FieldLabel>
            <select value={filterChan} onChange={e => setFilterChan(e.target.value)} style={selectStyle}>
              <option value="">All</option>
              <option value="email">Email</option>
              <option value="push">Push</option>
            </select>
          </div>
          <div>
            <FieldLabel>From</FieldLabel>
            <input type="date" value={filterFrom} onChange={e => setFilterFrom(e.target.value)}
              style={{ border: `1px solid ${BORDER}`, borderRadius: 8, padding: "8px 10px", fontSize: 12, fontFamily: "Poppins,sans-serif", color: NAVY }} />
          </div>
          <div>
            <FieldLabel>To</FieldLabel>
            <input type="date" value={filterTo} onChange={e => setFilterTo(e.target.value)}
              style={{ border: `1px solid ${BORDER}`, borderRadius: 8, padding: "8px 10px", fontSize: 12, fontFamily: "Poppins,sans-serif", color: NAVY }} />
          </div>
          <Btn variant="secondary" onClick={load} style={{ padding: "8px 16px" }}>Refresh</Btn>
        </div>
      </Card>

      <Card style={{ overflow: "hidden" }}>
        <div style={{ padding: "12px 16px", borderBottom: `1px solid ${BORDER}`, fontSize: 13, fontWeight: 700, color: NAVY }}>
          Delivery Log <span style={{ fontSize: 11, fontWeight: 400, color: MUTED, marginLeft: 8 }}>{filtered.length} entries</span>
        </div>
        {loading ? <Skeleton /> : filtered.length === 0 ? (
          <div style={{ padding: 40, textAlign: "center", color: MUTED, fontSize: 13 }}>No delivery logs found.</div>
        ) : (
          <div className="xa-table-wrap">
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: BG }}>
                {["SENT AT", "RECIPIENT", "SUBJECT", "CHANNEL", "SOURCE", "STATUS"].map(h => (
                  <th key={h} style={{ padding: "9px 14px", textAlign: "left", fontSize: 10, fontWeight: 700, color: MUTED, letterSpacing: 0.5, whiteSpace: "nowrap" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map(log => {
                const [lc, lbg] = STATUS_LOG[log.status] ?? [MUTED, `${MUTED}14`];
                const [chc, chbg] = CHANNEL_COLORS[log.channel] ?? [MUTED, `${MUTED}14`];
                const camp = log.campaign_id ? campaigns.find(c => c.id === log.campaign_id) : null;
                const rule = log.rule_id ? rules.find(r => r.id === log.rule_id) : null;
                return (
                  <tr key={log.id} style={{ borderTop: `1px solid ${BORDER}` }}>
                    <td style={{ padding: "10px 14px", fontSize: 11, color: MUTED, whiteSpace: "nowrap" }}>
                      {new Date(log.sent_at).toLocaleString()}
                    </td>
                    <td style={{ padding: "10px 14px", fontSize: 12, color: NAVY }}>{log.recipient_email}</td>
                    <td style={{ padding: "10px 14px", fontSize: 12, color: NAVY, maxWidth: 240, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{log.subject}</td>
                    <td style={{ padding: "10px 14px" }}><Badge label={log.channel} color={chc} bg={chbg} /></td>
                    <td style={{ padding: "10px 14px", fontSize: 11, color: MUTED }}>{camp ? camp.name : rule ? rule.name : "-"}</td>
                    <td style={{ padding: "10px 14px" }}>
                      <Badge label={log.status} color={lc} bg={lbg} />
                      {log.error_msg && <div style={{ fontSize: 10, color: RED, marginTop: 2 }}>{log.error_msg}</div>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          </div>
        )}
      </Card>
    </div>
  );
}
