"use client";
import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  communicationsApi,
  EmailTemplate,
  EmailCampaign,
  AutomationRule,
  NotificationLog,
} from "@/lib/communications-api";
import { cohortsApi, CohortDTO } from "@/lib/cohorts-api";

// ─── Design tokens ────────────────────────────────────────────────────────────
const ACTIVE_TAB: React.CSSProperties = {
  background: "#1C2551",
  color: "#fff",
  border: "1px solid #1C2551",
  fontSize: 12,
  borderRadius: 8,
  padding: "7px 16px",
  fontWeight: 700,
  cursor: "pointer",
  fontFamily: "Poppins,sans-serif",
};
const INACTIVE_TAB: React.CSSProperties = {
  background: "#fff",
  border: "1px solid #EAECF4",
  color: "#8b90a7",
  fontSize: 12,
  borderRadius: 8,
  padding: "7px 16px",
  cursor: "pointer",
  fontFamily: "Poppins,sans-serif",
};
const INPUT_STYLE: React.CSSProperties = {
  border: "1px solid #EAECF4",
  borderRadius: 8,
  padding: "9px 12px",
  fontSize: 13,
  fontFamily: "Poppins,sans-serif",
  width: "100%",
  outline: "none",
  color: "#1C2551",
  boxSizing: "border-box",
};
const LABEL_STYLE: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 700,
  color: "#8b90a7",
  letterSpacing: 0.5,
  textTransform: "uppercase",
  marginBottom: 6,
  display: "block",
};
const BTN_PRIMARY: React.CSSProperties = {
  background: "#1C2551",
  color: "#fff",
  borderRadius: 8,
  padding: "9px 20px",
  fontWeight: 700,
  border: "none",
  cursor: "pointer",
  fontSize: 12,
  fontFamily: "Poppins,sans-serif",
};
const BTN_ORANGE: React.CSSProperties = {
  background: "#EF4E24",
  color: "#fff",
  borderRadius: 8,
  padding: "9px 20px",
  fontWeight: 700,
  border: "none",
  cursor: "pointer",
  fontSize: 12,
  fontFamily: "Poppins,sans-serif",
};
const BTN_SECONDARY: React.CSSProperties = {
  background: "#fff",
  border: "1px solid #EAECF4",
  color: "#1C2551",
  borderRadius: 8,
  padding: "8px 16px",
  fontWeight: 600,
  cursor: "pointer",
  fontSize: 12,
  fontFamily: "Poppins,sans-serif",
};
const CARD_STYLE: React.CSSProperties = {
  background: "#fff",
  borderRadius: 12,
  border: "1px solid #EAECF4",
  boxShadow: "0 1px 4px rgba(28,37,81,0.07)",
  padding: 20,
};
const TH_STYLE: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  color: "#8b90a7",
  letterSpacing: 0.5,
  padding: "10px 12px",
  textAlign: "left",
  background: "#F5F7FB",
};
const TD_STYLE: React.CSSProperties = {
  fontSize: 13,
  color: "#1C2551",
  padding: "10px 12px",
  borderTop: "1px solid #EAECF4",
};

const TABS = [
  { id: "campaigns", label: "Campaigns" },
  { id: "automation", label: "Automation Rules" },
  { id: "logs", label: "Notification Log" },
];

const TRIGGER_OPTIONS = [
  { value: "not_logged_in",     label: "Not logged in for N days",       configKey: "days",    inputType: "number", placeholder: "3" },
  { value: "activity_overdue",  label: "Activity overdue by N days",     configKey: "days",    inputType: "number", placeholder: "3" },
  { value: "phase_starts",      label: "Phase starts",                   configKey: null,      inputType: null,     placeholder: "" },
  { value: "phase_ends",        label: "Phase ends in N days",           configKey: "days",    inputType: "number", placeholder: "7" },
  { value: "completion_below",  label: "Completion below X%",            configKey: "percent", inputType: "number", placeholder: "50" },
  { value: "assessment_failed", label: "Assessment failed (below 50%)",  configKey: null,      inputType: null,     placeholder: "" },
  { value: "cohort_starts",     label: "Cohort starts in N days",        configKey: "days",    inputType: "number", placeholder: "7" },
  { value: "milestone_day",     label: "Milestone day X",                configKey: "day",     inputType: "number", placeholder: "30" },
] as const;

// ─── Shared sub-components ────────────────────────────────────────────────────
function Skeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10, padding: 16 }}>
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className="xa-skeleton"
          style={{
            background: "#F0F1F7",
            borderRadius: 8,
            height: 14,
            width: i % 3 === 0 ? "60%" : i % 3 === 1 ? "80%" : "40%",
          }}
        />
      ))}
    </div>
  );
}

function ErrorBanner({ msg, onRetry }: { msg: string; onRetry: () => void }) {
  return (
    <div
      style={{
        background: "#ef444414",
        border: "1px solid #ef4444",
        borderRadius: 8,
        padding: "10px 16px",
        color: "#ef4444",
        fontSize: 13,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        fontFamily: "Poppins,sans-serif",
      }}
    >
      <span>{msg}</span>
      <button
        onClick={onRetry}
        style={{ background: "none", border: "none", color: "#ef4444", cursor: "pointer", fontWeight: 700, fontSize: 12, fontFamily: "Poppins,sans-serif" }}
      >
        Retry
      </button>
    </div>
  );
}

function ConfirmModal({
  title,
  body,
  onConfirm,
  onCancel,
}: {
  title: string;
  body: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(28,37,81,0.5)",
        zIndex: 2000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
      }}
    >
      <div
        style={{
          background: "#fff",
          borderRadius: 16,
          maxWidth: 440,
          width: "100%",
          boxShadow: "0 24px 64px rgba(28,37,81,0.22)",
          overflow: "hidden",
          fontFamily: "Poppins,sans-serif",
        }}
      >
        <div style={{ padding: "18px 24px", borderBottom: "1px solid #EAECF4" }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: "#1C2551" }}>{title}</div>
        </div>
        <div style={{ padding: "20px 24px", fontSize: 13, color: "#1C2551" }}>{body}</div>
        <div style={{ padding: "12px 24px 20px", display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <button onClick={onCancel} style={BTN_SECONDARY}>Cancel</button>
          <button onClick={onConfirm} style={BTN_ORANGE}>Confirm</button>
        </div>
      </div>
    </div>
  );
}

function Badge({ label, color }: { label: string; color: string }) {
  return (
    <span
      style={{
        background: `${color}14`,
        color,
        fontSize: 10,
        fontWeight: 700,
        borderRadius: 20,
        padding: "3px 9px",
        whiteSpace: "nowrap",
      }}
    >
      {label}
    </span>
  );
}

// ─── Status / audience helpers ─────────────────────────────────────────────
const STATUS_COLORS: Record<string, string> = {
  draft: "#8b90a7",
  scheduled: "#6B73BF",
  sending: "#EF4E24",
  sent: "#22c55e",
  cancelled: "#ef4444",
};
const AUDIENCE_COLORS: Record<string, string> = {
  all: "#1C2551",
  at_risk: "#f59e0b",
  incomplete: "#6B73BF",
};
const CHANNEL_COLORS: Record<string, string> = {
  email: "#1C2551",
  push: "#EF4E24",
  both: "#22c55e",
};
const LOG_STATUS_COLORS: Record<string, string> = {
  sent: "#22c55e",
  failed: "#ef4444",
  pending: "#f59e0b",
};

// ─── Main component ───────────────────────────────────────────────────────────
export default function PMComms({ orgId }: { orgId: string }) {
  const [activeTab, setActiveTab] = useState<string>("campaigns");

  // ── Campaigns state ──────────────────────────────────────────────────────
  const [campaigns, setCampaigns] = useState<EmailCampaign[]>([]);
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [cohorts, setCohorts] = useState<CohortDTO[]>([]);
  const [campaignsLoading, setCampaignsLoading] = useState(false);
  const [campaignsError, setCampaignsError] = useState<string | null>(null);
  const [selectedCampaign, setSelectedCampaign] = useState<EmailCampaign | null>(null);
  const [editingCampaign, setEditingCampaign] = useState(false);
  const [campaignForm, setCampaignForm] = useState<{
    name: string;
    cohort_id: string;
    audience: string;
    subject: string;
    body_html: string;
  }>({ name: "", cohort_id: "", audience: "all", subject: "", body_html: "" });
  const [scheduleAt, setScheduleAt] = useState<string>("");
  const [sendConfirm, setSendConfirm] = useState(false);
  const [savingCampaign, setSavingCampaign] = useState(false);
  const bodyRef = useRef<HTMLTextAreaElement>(null);

  // ── Automation rules state ───────────────────────────────────────────────
  const [rules, setRules] = useState<AutomationRule[]>([]);
  const [rulesLoading, setRulesLoading] = useState(false);
  const [rulesError, setRulesError] = useState<string | null>(null);
  const [editingRule, setEditingRule] = useState<AutomationRule | null>(null);
  const [showRuleForm, setShowRuleForm] = useState(false);
  const [ruleForm, setRuleForm] = useState<{
    name: string;
    trigger_type: string;
    trigger_config: Record<string, unknown>;
    channel: string;
    template_id: string;
    message_subject: string;
    message_body: string;
    is_active: boolean;
  }>({
    name: "",
    trigger_type: "not_logged_in",
    trigger_config: { days: 3 },
    channel: "email",
    template_id: "",
    message_subject: "",
    message_body: "",
    is_active: true,
  });
  const [savingRule, setSavingRule] = useState(false);
  const [deleteRuleId, setDeleteRuleId] = useState<string | null>(null);

  // ── Logs state ───────────────────────────────────────────────────────────
  const [logs, setLogs] = useState<NotificationLog[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);
  const [logsError, setLogsError] = useState<string | null>(null);
  const [logFilters, setLogFilters] = useState<{
    campaignId: string;
    ruleId: string;
    channel: string;
    dateFrom: string;
    dateTo: string;
  }>({ campaignId: "", ruleId: "", channel: "", dateFrom: "", dateTo: "" });

  // ── Data loading ─────────────────────────────────────────────────────────
  const loadCampaigns = useCallback(() => {
    if (!orgId) return;
    setCampaignsLoading(true);
    setCampaignsError(null);
    Promise.allSettled([
      communicationsApi.campaigns.list(orgId),
      communicationsApi.templates.list(orgId),
      cohortsApi.list(orgId),
    ]).then(([camRes, tmplRes, cohRes]) => {
      if (camRes.status === "fulfilled") setCampaigns(camRes.value.data ?? []);
      else setCampaignsError("Failed to load campaigns");
      if (tmplRes.status === "fulfilled") setTemplates(tmplRes.value.data ?? []);
      if (cohRes.status === "fulfilled") setCohorts(cohRes.value.data ?? []);
      setCampaignsLoading(false);
    });
  }, [orgId]);

  const loadRules = useCallback(() => {
    if (!orgId) return;
    setRulesLoading(true);
    setRulesError(null);
    communicationsApi.rules
      .list(orgId)
      .then((r) => {
        setRules(r.data ?? []);
        setRulesLoading(false);
      })
      .catch(() => {
        setRulesError("Failed to load automation rules");
        setRulesLoading(false);
      });
  }, [orgId]);

  const loadLogs = useCallback(() => {
    if (!orgId) return;
    setLogsLoading(true);
    setLogsError(null);
    communicationsApi.logs
      .list(orgId)
      .then((r) => {
        setLogs(r.data ?? []);
        setLogsLoading(false);
      })
      .catch(() => {
        setLogsError("Failed to load notification log");
        setLogsLoading(false);
      });
  }, [orgId]);

  useEffect(() => {
    if (!orgId) return;
    loadCampaigns();
    loadRules();
    loadLogs();
  }, [orgId, loadCampaigns, loadRules, loadLogs]);

  // ── Campaign helpers ─────────────────────────────────────────────────────
  const openNewCampaign = () => {
    setSelectedCampaign(null);
    setCampaignForm({ name: "", cohort_id: "", audience: "all", subject: "", body_html: "" });
    setScheduleAt("");
    setEditingCampaign(true);
  };

  const openEditCampaign = (c: EmailCampaign) => {
    setSelectedCampaign(c);
    setCampaignForm({
      name: c.name,
      cohort_id: c.cohort_id ?? "",
      audience: c.audience,
      subject: c.subject,
      body_html: c.body_html,
    });
    setScheduleAt(c.scheduled_at ?? "");
    setEditingCampaign(true);
  };

  const insertMergeVar = (variable: string) => {
    const ta = bodyRef.current;
    if (!ta) return;
    const start = ta.selectionStart ?? ta.value.length;
    const end = ta.selectionEnd ?? ta.value.length;
    const before = ta.value.substring(0, start);
    const after = ta.value.substring(end);
    const newVal = before + variable + after;
    ta.value = newVal;
    setCampaignForm((f) => ({ ...f, body_html: newVal }));
    ta.focus();
    ta.setSelectionRange(start + variable.length, start + variable.length);
  };

  const applyTemplate = (tmplId: string) => {
    const tmpl = templates.find((t) => t.id === tmplId);
    if (!tmpl) return;
    setCampaignForm((f) => ({ ...f, subject: tmpl.subject, body_html: tmpl.body_html }));
    if (bodyRef.current) bodyRef.current.value = tmpl.body_html;
  };

  const saveDraft = async () => {
    setSavingCampaign(true);
    try {
      if (selectedCampaign) {
        const updated = await communicationsApi.campaigns.update(selectedCampaign.id, {
          name: campaignForm.name,
          cohort_id: campaignForm.cohort_id || undefined,
          audience: campaignForm.audience,
          subject: campaignForm.subject,
          body_html: campaignForm.body_html,
          status: "draft",
        });
        setCampaigns((prev) => prev.map((c) => (c.id === updated.data.id ? updated.data : c)));
        setSelectedCampaign(updated.data);
      } else {
        const created = await communicationsApi.campaigns.create({
          org_id: orgId,
          name: campaignForm.name,
          cohort_id: campaignForm.cohort_id || undefined,
          audience: campaignForm.audience,
          subject: campaignForm.subject,
          body_html: campaignForm.body_html,
          status: "draft",
        });
        setCampaigns((prev) => [created.data, ...prev]);
        setSelectedCampaign(created.data);
      }
    } catch {
      // silently keep form open
    }
    setSavingCampaign(false);
  };

  const scheduleCampaign = async () => {
    if (!scheduleAt) return;
    setSavingCampaign(true);
    try {
      let id = selectedCampaign?.id;
      if (!id) {
        const created = await communicationsApi.campaigns.create({
          org_id: orgId,
          name: campaignForm.name,
          cohort_id: campaignForm.cohort_id || undefined,
          audience: campaignForm.audience,
          subject: campaignForm.subject,
          body_html: campaignForm.body_html,
          status: "draft",
        });
        id = created.data.id;
        setCampaigns((prev) => [created.data, ...prev]);
        setSelectedCampaign(created.data);
      }
      const scheduled = await communicationsApi.campaigns.schedule(id, scheduleAt);
      setCampaigns((prev) => prev.map((c) => (c.id === scheduled.data.id ? scheduled.data : c)));
      setSelectedCampaign(scheduled.data);
    } catch {
      // silently keep form open
    }
    setSavingCampaign(false);
  };

  const sendNow = async () => {
    if (!selectedCampaign) return;
    setSavingCampaign(true);
    try {
      const sent = await communicationsApi.campaigns.send(selectedCampaign.id);
      setCampaigns((prev) => prev.map((c) => (c.id === sent.data.id ? sent.data : c)));
      setSelectedCampaign(sent.data);
    } catch {
      // silently
    }
    setSendConfirm(false);
    setSavingCampaign(false);
  };

  // ── Rule helpers ─────────────────────────────────────────────────────────
  const openNewRule = () => {
    setEditingRule(null);
    setRuleForm({
      name: "",
      trigger_type: "not_logged_in",
      trigger_config: { days: 3 },
      channel: "email",
      template_id: "",
      message_subject: "",
      message_body: "",
      is_active: true,
    });
    setShowRuleForm(true);
  };

  const openEditRule = (r: AutomationRule) => {
    setEditingRule(r);
    setRuleForm({
      name: r.name,
      trigger_type: r.trigger_type,
      trigger_config: { ...r.trigger_config },
      channel: r.channel,
      template_id: r.template_id ?? "",
      message_subject: r.message_subject ?? "",
      message_body: r.message_body ?? "",
      is_active: r.is_active,
    });
    setShowRuleForm(true);
  };

  const saveRule = async () => {
    setSavingRule(true);
    try {
      if (editingRule) {
        const updated = await communicationsApi.rules.update(editingRule.id, {
          name: ruleForm.name,
          trigger_type: ruleForm.trigger_type,
          trigger_config: ruleForm.trigger_config,
          channel: ruleForm.channel,
          template_id: ruleForm.template_id || undefined,
          message_subject: ruleForm.message_subject || undefined,
          message_body: ruleForm.message_body || undefined,
          is_active: ruleForm.is_active,
        });
        setRules((prev) => prev.map((r) => (r.id === updated.data.id ? updated.data : r)));
      } else {
        const created = await communicationsApi.rules.create({
          org_id: orgId,
          name: ruleForm.name,
          is_active: ruleForm.is_active,
          trigger_type: ruleForm.trigger_type,
          trigger_config: ruleForm.trigger_config,
          channel: ruleForm.channel,
          template_id: ruleForm.template_id || undefined,
          message_subject: ruleForm.message_subject || undefined,
          message_body: ruleForm.message_body || undefined,
        });
        setRules((prev) => [created.data, ...prev]);
      }
      setShowRuleForm(false);
    } catch {
      // keep form open
    }
    setSavingRule(false);
  };

  const toggleRuleActive = async (rule: AutomationRule) => {
    const newActive = !rule.is_active;
    // Optimistic update
    setRules((prev) => prev.map((r) => (r.id === rule.id ? { ...r, is_active: newActive } : r)));
    try {
      await communicationsApi.rules.update(rule.id, { is_active: newActive });
    } catch {
      // Revert on failure
      setRules((prev) => prev.map((r) => (r.id === rule.id ? { ...r, is_active: rule.is_active } : r)));
    }
  };

  const deleteRule = async (id: string) => {
    try {
      await communicationsApi.rules.delete(id);
      setRules((prev) => prev.filter((r) => r.id !== id));
    } catch {
      // ignore
    }
    setDeleteRuleId(null);
  };

  // ── Log filter apply ─────────────────────────────────────────────────────
  const applyLogFilters = () => {
    loadLogs();
  };

  const filteredLogs = logs.filter((l) => {
    if (logFilters.campaignId && l.campaign_id !== logFilters.campaignId) return false;
    if (logFilters.ruleId && l.rule_id !== logFilters.ruleId) return false;
    if (logFilters.channel && l.channel !== logFilters.channel) return false;
    if (logFilters.dateFrom && l.sent_at < logFilters.dateFrom) return false;
    if (logFilters.dateTo && l.sent_at > logFilters.dateTo + "T23:59:59") return false;
    return true;
  });

  // ── Trigger option for current rule form ─────────────────────────────────
  const currentTriggerOpt = TRIGGER_OPTIONS.find((o) => o.value === ruleForm.trigger_type);

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div style={{ fontFamily: "Poppins,sans-serif", display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ fontSize: 17, fontWeight: 700, color: "#1C2551" }}>Communications</div>
      </div>

      {/* Tab bar */}
      <div style={{ display: "flex", gap: 6 }}>
        {TABS.map((t) => (
          <button key={t.id} onClick={() => setActiveTab(t.id)} style={activeTab === t.id ? ACTIVE_TAB : INACTIVE_TAB}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ── CAMPAIGNS TAB ─────────────────────────────────────────────────── */}
      {activeTab === "campaigns" && (
        <div style={{ display: "flex", gap: 16, alignItems: "flex-start" }}>
          {/* Left panel */}
          <div
            style={{
              width: 320,
              flexShrink: 0,
              ...CARD_STYLE,
              padding: 0,
              display: "flex",
              flexDirection: "column",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "14px 16px",
                borderBottom: "1px solid #EAECF4",
              }}
            >
              <div style={{ fontSize: 15, fontWeight: 700, color: "#1C2551" }}>Campaigns</div>
              <button onClick={openNewCampaign} style={BTN_ORANGE}>
                + New Campaign
              </button>
            </div>

            {campaignsLoading && <Skeleton rows={4} />}
            {campaignsError && (
              <div style={{ padding: 12 }}>
                <ErrorBanner msg={campaignsError} onRetry={loadCampaigns} />
              </div>
            )}

            {!campaignsLoading && !campaignsError && campaigns.length === 0 && (
              <div style={{ padding: "48px 24px", textAlign: "center", color: "#8b90a7", fontSize: 13 }}>
                No campaigns yet. Create your first campaign.
              </div>
            )}

            {!campaignsLoading &&
              !campaignsError &&
              campaigns.map((c) => {
                const cohort = cohorts.find((co) => co.id === c.cohort_id);
                const isSelected = selectedCampaign?.id === c.id;
                return (
                  <div
                    key={c.id}
                    onClick={() => openEditCampaign(c)}
                    style={{
                      padding: "12px 16px",
                      cursor: "pointer",
                      borderBottom: "1px solid #EAECF4",
                      border: isSelected ? "1px solid #1C2551" : undefined,
                      background: isSelected ? "rgba(28,37,81,0.03)" : "#fff",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        marginBottom: 6,
                      }}
                    >
                      <div style={{ fontSize: 13, fontWeight: 700, color: "#1C2551" }}>{c.name}</div>
                      <Badge
                        label={c.status.toUpperCase()}
                        color={STATUS_COLORS[c.status] ?? "#8b90a7"}
                      />
                    </div>
                    <div style={{ display: "flex", gap: 6, marginBottom: 5 }}>
                      <Badge
                        label={c.audience.replace(/_/g, " ").toUpperCase()}
                        color={AUDIENCE_COLORS[c.audience] ?? "#8b90a7"}
                      />
                      {cohort && (
                        <span style={{ fontSize: 11, color: "#8b90a7", alignSelf: "center" }}>
                          {cohort.name}
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: 11, color: "#8b90a7" }}>
                      {c.scheduled_at
                        ? `Scheduled: ${new Date(c.scheduled_at).toLocaleString()}`
                        : c.sent_at
                        ? `Sent: ${new Date(c.sent_at).toLocaleString()}`
                        : "Not scheduled"}
                      {" · "}
                      {c.recipient_count} recipients / {c.sent_count} sent
                    </div>
                  </div>
                );
              })}
          </div>

          {/* Right panel — edit form */}
          {editingCampaign && (
            <div style={{ flex: 1, ...CARD_STYLE }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: "#1C2551", marginBottom: 20 }}>
                {selectedCampaign ? "Edit Campaign" : "New Campaign"}
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                {/* Name */}
                <div>
                  <label style={LABEL_STYLE}>Name</label>
                  <input
                    style={INPUT_STYLE}
                    value={campaignForm.name}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                      setCampaignForm((f) => ({ ...f, name: e.target.value }))
                    }
                    placeholder="Campaign name"
                  />
                </div>

                {/* Cohort */}
                <div>
                  <label style={LABEL_STYLE}>Cohort</label>
                  <select
                    style={INPUT_STYLE}
                    value={campaignForm.cohort_id}
                    onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
                      setCampaignForm((f) => ({ ...f, cohort_id: e.target.value }))
                    }
                  >
                    <option value="">-- All participants --</option>
                    {cohorts.map((co) => (
                      <option key={co.id} value={co.id}>
                        {co.name}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Audience */}
                <div>
                  <label style={LABEL_STYLE}>Audience</label>
                  <select
                    style={INPUT_STYLE}
                    value={campaignForm.audience}
                    onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
                      setCampaignForm((f) => ({ ...f, audience: e.target.value }))
                    }
                  >
                    <option value="all">All</option>
                    <option value="at_risk">At Risk</option>
                    <option value="incomplete">Incomplete</option>
                  </select>
                </div>

                {/* Template picker */}
                <div>
                  <label style={LABEL_STYLE}>Use Template</label>
                  <select
                    style={INPUT_STYLE}
                    defaultValue=""
                    onChange={(e: React.ChangeEvent<HTMLSelectElement>) => {
                      if (e.target.value) applyTemplate(e.target.value);
                    }}
                  >
                    <option value="">-- Select template --</option>
                    {templates.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Subject */}
                <div>
                  <label style={LABEL_STYLE}>Subject</label>
                  <input
                    style={INPUT_STYLE}
                    value={campaignForm.subject}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                      setCampaignForm((f) => ({ ...f, subject: e.target.value }))
                    }
                    placeholder="Email subject line"
                  />
                </div>

                {/* Body */}
                <div>
                  <label style={LABEL_STYLE}>Body</label>
                  <textarea
                    ref={bodyRef}
                    style={{ ...INPUT_STYLE, minHeight: 200, resize: "vertical" }}
                    defaultValue={campaignForm.body_html}
                    onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) =>
                      setCampaignForm((f) => ({ ...f, body_html: e.target.value }))
                    }
                    placeholder="Email body (HTML or plain text)"
                  />
                  {/* Merge variable chips */}
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}>
                    {["{{participant_name}}", "{{cohort_name}}", "{{program_title}}", "{{completion_percent}}"].map(
                      (v) => (
                        <button
                          key={v}
                          onClick={() => insertMergeVar(v)}
                          style={{
                            background: "rgba(107,115,191,0.12)",
                            color: "#6B73BF",
                            borderRadius: 20,
                            padding: "3px 10px",
                            fontSize: 11,
                            cursor: "pointer",
                            fontFamily: "Poppins,sans-serif",
                            border: "none",
                          }}
                        >
                          {v}
                        </button>
                      )
                    )}
                  </div>
                </div>

                {/* Schedule At — only when not sent/sending */}
                {selectedCampaign?.status !== "sent" && selectedCampaign?.status !== "sending" && (
                  <div>
                    <label style={LABEL_STYLE}>Schedule At</label>
                    <input
                      type="datetime-local"
                      style={INPUT_STYLE}
                      value={scheduleAt}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => setScheduleAt(e.target.value)}
                    />
                  </div>
                )}

                {/* Action buttons */}
                <div style={{ display: "flex", gap: 10, marginTop: 4 }}>
                  <button onClick={saveDraft} style={BTN_SECONDARY} disabled={savingCampaign}>
                    {savingCampaign ? "Saving..." : "Save Draft"}
                  </button>
                  <button
                    onClick={scheduleCampaign}
                    style={{ ...BTN_PRIMARY, opacity: !scheduleAt ? 0.5 : 1 }}
                    disabled={savingCampaign || !scheduleAt}
                  >
                    Schedule
                  </button>
                  {selectedCampaign && (
                    <button
                      onClick={() => setSendConfirm(true)}
                      style={BTN_ORANGE}
                      disabled={savingCampaign}
                    >
                      Send Now
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}

          {!editingCampaign && (
            <div
              style={{
                flex: 1,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#8b90a7",
                fontSize: 13,
                ...CARD_STYLE,
              }}
            >
              Select a campaign or create a new one.
            </div>
          )}
        </div>
      )}

      {/* Send confirm modal */}
      {sendConfirm && (
        <ConfirmModal
          title="Send Campaign"
          body={`This will send to ${selectedCampaign?.recipient_count ?? 0} participants. Are you sure?`}
          onConfirm={sendNow}
          onCancel={() => setSendConfirm(false)}
        />
      )}

      {/* ── AUTOMATION RULES TAB ─────────────────────────────────────────── */}
      {activeTab === "automation" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={{ display: "flex", justifyContent: "flex-end" }}>
            <button onClick={openNewRule} style={BTN_ORANGE}>
              + New Rule
            </button>
          </div>

          {/* Rule form */}
          {showRuleForm && (
            <div style={{ ...CARD_STYLE }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: "#1C2551", marginBottom: 16 }}>
                IF / THEN Builder
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                {/* Rule name */}
                <div>
                  <label style={LABEL_STYLE}>Rule Name</label>
                  <input
                    style={INPUT_STYLE}
                    value={ruleForm.name}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                      setRuleForm((f) => ({ ...f, name: e.target.value }))
                    }
                    placeholder="e.g. Re-engage inactive participants"
                  />
                </div>

                {/* IF section */}
                <div
                  style={{
                    background: "#FEF6F4",
                    border: "1px solid rgba(239,78,36,0.2)",
                    borderRadius: 8,
                    padding: 14,
                  }}
                >
                  <div style={{ fontSize: 12, fontWeight: 700, color: "#EF4E24", marginBottom: 10 }}>
                    IF
                  </div>
                  <div style={{ display: "flex", gap: 10, alignItems: "flex-end" }}>
                    <div style={{ flex: 1 }}>
                      <label style={LABEL_STYLE}>Trigger</label>
                      <select
                        style={INPUT_STYLE}
                        value={ruleForm.trigger_type}
                        onChange={(e: React.ChangeEvent<HTMLSelectElement>) => {
                          const val = e.target.value;
                          const opt = TRIGGER_OPTIONS.find((o) => o.value === val);
                          const newConfig: Record<string, unknown> = {};
                          if (opt && opt.configKey) newConfig[opt.configKey] = parseInt(opt.placeholder || "3", 10);
                          setRuleForm((f) => ({ ...f, trigger_type: val, trigger_config: newConfig }));
                        }}
                      >
                        {TRIGGER_OPTIONS.map((o) => (
                          <option key={o.value} value={o.value}>
                            {o.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    {currentTriggerOpt && currentTriggerOpt.configKey && (
                      <div style={{ width: 100 }}>
                        <label style={LABEL_STYLE}>{currentTriggerOpt.configKey}</label>
                        <input
                          type="number"
                          style={INPUT_STYLE}
                          placeholder={currentTriggerOpt.placeholder}
                          value={
                            ruleForm.trigger_config[currentTriggerOpt.configKey] !== undefined
                              ? String(ruleForm.trigger_config[currentTriggerOpt.configKey])
                              : ""
                          }
                          onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                            const key = currentTriggerOpt.configKey as string;
                            const val = parseInt(e.target.value, 10);
                            setRuleForm((f) => ({
                              ...f,
                              trigger_config: { ...f.trigger_config, [key]: isNaN(val) ? 0 : val },
                            }));
                          }}
                        />
                      </div>
                    )}
                  </div>
                </div>

                {/* THEN section */}
                <div
                  style={{
                    background: "rgba(28,37,81,0.03)",
                    border: "1px solid #EAECF4",
                    borderRadius: 8,
                    padding: 14,
                  }}
                >
                  <div style={{ fontSize: 12, fontWeight: 700, color: "#1C2551", marginBottom: 10 }}>
                    THEN send via
                  </div>
                  <div>
                    <label style={LABEL_STYLE}>Channel</label>
                    <select
                      style={INPUT_STYLE}
                      value={ruleForm.channel}
                      onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
                        setRuleForm((f) => ({ ...f, channel: e.target.value }))
                      }
                    >
                      <option value="email">Email</option>
                      <option value="push">Push</option>
                      <option value="both">Both</option>
                    </select>
                  </div>
                </div>

                {/* Message section */}
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  {(ruleForm.channel === "email" || ruleForm.channel === "both") && (
                    <>
                      <div>
                        <label style={LABEL_STYLE}>Use Template</label>
                        <select
                          style={INPUT_STYLE}
                          value={ruleForm.template_id}
                          onChange={(e: React.ChangeEvent<HTMLSelectElement>) => {
                            const tmpl = templates.find((t) => t.id === e.target.value);
                            setRuleForm((f) => ({
                              ...f,
                              template_id: e.target.value,
                              message_subject: tmpl ? tmpl.subject : f.message_subject,
                              message_body: tmpl ? tmpl.body_html : f.message_body,
                            }));
                          }}
                        >
                          <option value="">-- Select template --</option>
                          {templates.map((t) => (
                            <option key={t.id} value={t.id}>
                              {t.name}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label style={LABEL_STYLE}>Subject</label>
                        <input
                          style={INPUT_STYLE}
                          value={ruleForm.message_subject}
                          onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                            setRuleForm((f) => ({ ...f, message_subject: e.target.value }))
                          }
                          placeholder="Email subject"
                        />
                      </div>
                      <div>
                        <label style={LABEL_STYLE}>Body</label>
                        <textarea
                          style={{ ...INPUT_STYLE, minHeight: 120, resize: "vertical" }}
                          value={ruleForm.message_body}
                          onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) =>
                            setRuleForm((f) => ({ ...f, message_body: e.target.value }))
                          }
                          placeholder="Email body"
                        />
                      </div>
                    </>
                  )}
                  {ruleForm.channel === "push" && (
                    <>
                      <div>
                        <label style={LABEL_STYLE}>Title</label>
                        <input
                          style={INPUT_STYLE}
                          value={ruleForm.message_subject}
                          onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                            setRuleForm((f) => ({ ...f, message_subject: e.target.value }))
                          }
                          placeholder="Push notification title"
                        />
                      </div>
                      <div>
                        <label style={LABEL_STYLE}>Short Message</label>
                        <textarea
                          style={{ ...INPUT_STYLE, minHeight: 80, resize: "vertical" }}
                          value={ruleForm.message_body}
                          maxLength={160}
                          onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) =>
                            setRuleForm((f) => ({ ...f, message_body: e.target.value }))
                          }
                          placeholder="Short push message (max 160 chars)"
                        />
                        <div style={{ fontSize: 11, color: "#8b90a7", textAlign: "right", marginTop: 2 }}>
                          {ruleForm.message_body.length}/160
                        </div>
                      </div>
                    </>
                  )}
                </div>

                {/* Form actions */}
                <div style={{ display: "flex", gap: 10 }}>
                  <button
                    onClick={() => {
                      setShowRuleForm(false);
                      setEditingRule(null);
                    }}
                    style={BTN_SECONDARY}
                  >
                    Cancel
                  </button>
                  <button onClick={saveRule} style={BTN_PRIMARY} disabled={savingRule}>
                    {savingRule ? "Saving..." : "Save Rule"}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Rules table */}
          {rulesLoading && <Skeleton rows={4} />}
          {rulesError && <ErrorBanner msg={rulesError} onRetry={loadRules} />}

          {!rulesLoading && !rulesError && (
            <div style={{ ...CARD_STYLE, padding: 0, overflowX: "auto" }}>
              {rules.length === 0 ? (
                <div style={{ padding: "48px 24px", textAlign: "center", color: "#8b90a7", fontSize: 13 }}>
                  No automation rules yet. Create your first rule.
                </div>
              ) : (
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr>
                      {["Rule Name", "Trigger", "Channel", "Active", "Last Run", "Actions"].map((h) => (
                        <th key={h} style={TH_STYLE}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rules.map((r) => {
                      const triggerOpt = TRIGGER_OPTIONS.find((o) => o.value === r.trigger_type);
                      return (
                        <tr key={r.id}>
                          <td style={TD_STYLE}>
                            <div style={{ fontWeight: 600 }}>{r.name}</div>
                          </td>
                          <td style={TD_STYLE}>
                            <Badge label={triggerOpt?.label ?? r.trigger_type} color="#6B73BF" />
                          </td>
                          <td style={TD_STYLE}>
                            <Badge
                              label={r.channel.toUpperCase()}
                              color={CHANNEL_COLORS[r.channel] ?? "#8b90a7"}
                            />
                          </td>
                          <td style={TD_STYLE}>
                            {/* Toggle switch */}
                            <button
                              onClick={() => toggleRuleActive(r)}
                              style={{
                                position: "relative",
                                width: 36,
                                height: 20,
                                borderRadius: 99,
                                background: r.is_active ? "#22c55e" : "#D0D3E0",
                                border: "none",
                                cursor: "pointer",
                                padding: 0,
                                flexShrink: 0,
                              }}
                            >
                              <div
                                style={{
                                  position: "absolute",
                                  top: 2,
                                  left: r.is_active ? 16 : 2,
                                  width: 16,
                                  height: 16,
                                  borderRadius: 99,
                                  background: "#fff",
                                  transition: "left 0.15s ease",
                                }}
                              />
                            </button>
                          </td>
                          <td style={{ ...TD_STYLE, color: "#8b90a7", fontSize: 12 }}>
                            {r.last_run_at ? new Date(r.last_run_at).toLocaleString() : "Never"}
                          </td>
                          <td style={TD_STYLE}>
                            <div style={{ display: "flex", gap: 6 }}>
                              <button
                                onClick={() => openEditRule(r)}
                                style={{
                                  background: "#F5F7FB",
                                  border: "1px solid #EAECF4",
                                  color: "#1C2551",
                                  borderRadius: 6,
                                  padding: "4px 8px",
                                  cursor: "pointer",
                                  fontSize: 12,
                                  fontFamily: "Poppins,sans-serif",
                                }}
                                title="Edit"
                              >
                                Edit
                              </button>
                              <button
                                onClick={() => setDeleteRuleId(r.id)}
                                style={{
                                  background: "#ef444414",
                                  border: "1px solid #ef4444",
                                  color: "#ef4444",
                                  borderRadius: 6,
                                  padding: "4px 8px",
                                  cursor: "pointer",
                                  fontSize: 12,
                                  fontFamily: "Poppins,sans-serif",
                                }}
                                title="Delete"
                              >
                                Delete
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {/* Delete rule confirm */}
          {deleteRuleId && (
            <ConfirmModal
              title="Delete Automation Rule"
              body="This action cannot be undone. The rule will stop sending messages."
              onConfirm={() => deleteRule(deleteRuleId)}
              onCancel={() => setDeleteRuleId(null)}
            />
          )}
        </div>
      )}

      {/* ── NOTIFICATION LOG TAB ─────────────────────────────────────────── */}
      {activeTab === "logs" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {/* Filter bar */}
          <div
            style={{
              ...CARD_STYLE,
              display: "flex",
              gap: 12,
              flexWrap: "wrap",
              alignItems: "flex-end",
            }}
          >
            <div style={{ minWidth: 160 }}>
              <label style={LABEL_STYLE}>Campaign</label>
              <select
                style={INPUT_STYLE}
                value={logFilters.campaignId}
                onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
                  setLogFilters((f) => ({ ...f, campaignId: e.target.value }))
                }
              >
                <option value="">All Campaigns</option>
                {campaigns.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div style={{ minWidth: 160 }}>
              <label style={LABEL_STYLE}>Rule</label>
              <select
                style={INPUT_STYLE}
                value={logFilters.ruleId}
                onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
                  setLogFilters((f) => ({ ...f, ruleId: e.target.value }))
                }
              >
                <option value="">All Rules</option>
                {rules.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>
            </div>
            <div style={{ minWidth: 120 }}>
              <label style={LABEL_STYLE}>Channel</label>
              <select
                style={INPUT_STYLE}
                value={logFilters.channel}
                onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
                  setLogFilters((f) => ({ ...f, channel: e.target.value }))
                }
              >
                <option value="">All</option>
                <option value="email">Email</option>
                <option value="push">Push</option>
              </select>
            </div>
            <div>
              <label style={LABEL_STYLE}>Date From</label>
              <input
                type="date"
                style={INPUT_STYLE}
                value={logFilters.dateFrom}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  setLogFilters((f) => ({ ...f, dateFrom: e.target.value }))
                }
              />
            </div>
            <div>
              <label style={LABEL_STYLE}>Date To</label>
              <input
                type="date"
                style={INPUT_STYLE}
                value={logFilters.dateTo}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  setLogFilters((f) => ({ ...f, dateTo: e.target.value }))
                }
              />
            </div>
            <button onClick={applyLogFilters} style={BTN_SECONDARY}>
              Apply Filters
            </button>
          </div>

          {/* Logs table */}
          {logsLoading && <Skeleton rows={5} />}
          {logsError && <ErrorBanner msg={logsError} onRetry={loadLogs} />}

          {!logsLoading && !logsError && (
            <div style={{ ...CARD_STYLE, padding: 0, overflowX: "auto" }}>
              {filteredLogs.length === 0 ? (
                <div style={{ padding: "48px 24px", textAlign: "center", color: "#8b90a7", fontSize: 13 }}>
                  No notification logs found.
                </div>
              ) : (
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr>
                      {["Sent At", "Recipient", "Subject / Title", "Channel", "Status", "Campaign / Rule"].map(
                        (h) => (
                          <th key={h} style={TH_STYLE}>
                            {h}
                          </th>
                        )
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredLogs.map((l) => {
                      const campaignName = campaigns.find((c) => c.id === l.campaign_id)?.name;
                      const ruleName = rules.find((r) => r.id === l.rule_id)?.name;
                      return (
                        <tr key={l.id}>
                          <td style={{ ...TD_STYLE, whiteSpace: "nowrap", fontSize: 12 }}>
                            {new Date(l.sent_at).toLocaleString()}
                          </td>
                          <td style={{ ...TD_STYLE, fontSize: 12 }}>{l.recipient_email}</td>
                          <td style={{ ...TD_STYLE, fontSize: 12 }}>
                            {l.subject.length > 40 ? l.subject.substring(0, 40) + "…" : l.subject}
                          </td>
                          <td style={TD_STYLE}>
                            <Badge
                              label={l.channel.toUpperCase()}
                              color={CHANNEL_COLORS[l.channel] ?? "#8b90a7"}
                            />
                          </td>
                          <td style={TD_STYLE}>
                            <Badge
                              label={l.status.toUpperCase()}
                              color={LOG_STATUS_COLORS[l.status] ?? "#8b90a7"}
                            />
                          </td>
                          <td style={{ ...TD_STYLE, fontSize: 12, color: "#8b90a7" }}>
                            {campaignName ?? ruleName ?? "—"}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
