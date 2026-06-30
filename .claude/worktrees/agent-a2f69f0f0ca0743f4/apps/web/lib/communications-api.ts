import { api, ApiResponse } from "./api";

export interface EmailTemplate {
  id: string;
  org_id: string;
  name: string;
  subject: string;
  body_html: string;
  variables: string[];
  created_at: string;
}

export interface EmailCampaign {
  id: string;
  org_id: string;
  cohort_id?: string;
  template_id?: string;
  name: string;
  subject: string;
  body_html: string;
  audience: string; // "all" | "at_risk" | "incomplete"
  status: string;   // "draft" | "scheduled" | "sending" | "sent" | "cancelled"
  scheduled_at?: string;
  sent_at?: string;
  recipient_count: number;
  sent_count: number;
  created_at: string;
}

export interface AutomationRule {
  id: string;
  org_id: string;
  name: string;
  is_active: boolean;
  trigger_type: string;
  trigger_config: Record<string, unknown>;
  channel: string; // "email" | "push" | "both"
  template_id?: string;
  message_subject?: string;
  message_body?: string;
  last_run_at?: string;
  created_at: string;
}

export interface NotificationLog {
  id: string;
  org_id: string;
  campaign_id?: string;
  rule_id?: string;
  user_id: string;
  channel: string;
  recipient_email: string;
  subject: string;
  status: string;
  error_msg?: string;
  sent_at: string;
}

export interface InAppNotification {
  id: string;
  user_id: string;
  title: string;
  body: string;
  type: string;
  rule_id?: string;
  campaign_id?: string;
  read_at?: string;
  created_at: string;
}

// Templates
const templates = {
  list: (orgId: string) =>
    api.get<ApiResponse<EmailTemplate[]>>(`/communications/templates?org_id=${orgId}`),
  create: (body: Omit<EmailTemplate, "id" | "created_at">) =>
    api.post<ApiResponse<EmailTemplate>>("/communications/templates", body),
  update: (id: string, body: Partial<Omit<EmailTemplate, "id" | "org_id" | "created_at">>) =>
    api.patch<ApiResponse<EmailTemplate>>(`/communications/templates/${id}`, body),
  delete: (id: string) =>
    api.delete<ApiResponse<null>>(`/communications/templates/${id}`),
};

// Campaigns
const campaigns = {
  list: (orgId: string) =>
    api.get<ApiResponse<EmailCampaign[]>>(`/communications/campaigns?org_id=${orgId}`),
  create: (body: Omit<EmailCampaign, "id" | "created_at" | "recipient_count" | "sent_count">) =>
    api.post<ApiResponse<EmailCampaign>>("/communications/campaigns", body),
  update: (id: string, body: Partial<Omit<EmailCampaign, "id" | "org_id" | "created_at">>) =>
    api.patch<ApiResponse<EmailCampaign>>(`/communications/campaigns/${id}`, body),
  send: (id: string) =>
    api.post<ApiResponse<EmailCampaign>>(`/communications/campaigns/${id}/send`, {}),
  schedule: (id: string, scheduledAt: string) =>
    api.post<ApiResponse<EmailCampaign>>(`/communications/campaigns/${id}/schedule`, { scheduled_at: scheduledAt }),
  delete: (id: string) =>
    api.delete<ApiResponse<null>>(`/communications/campaigns/${id}`),
};

// Automation rules
const rules = {
  list: (orgId: string) =>
    api.get<ApiResponse<AutomationRule[]>>(`/communications/rules?org_id=${orgId}`),
  create: (body: Omit<AutomationRule, "id" | "created_at" | "last_run_at">) =>
    api.post<ApiResponse<AutomationRule>>("/communications/rules", body),
  update: (id: string, body: Partial<Omit<AutomationRule, "id" | "org_id" | "created_at">>) =>
    api.patch<ApiResponse<AutomationRule>>(`/communications/rules/${id}`, body),
  delete: (id: string) =>
    api.delete<ApiResponse<null>>(`/communications/rules/${id}`),
};

// In-app notifications
const notifications = {
  listMine: () =>
    api.get<ApiResponse<InAppNotification[]>>("/communications/notifications"),
  markRead: (id: string) =>
    api.patch<ApiResponse<InAppNotification>>(`/communications/notifications/${id}/read`, {}),
  markAllRead: () =>
    api.post<ApiResponse<null>>("/communications/notifications/read-all", {}),
};

// Notification logs
const logs = {
  list: (orgId: string, filters?: { campaignId?: string; ruleId?: string }) => {
    const params = new URLSearchParams({ org_id: orgId });
    if (filters?.campaignId) params.set("campaign_id", filters.campaignId);
    if (filters?.ruleId) params.set("rule_id", filters.ruleId);
    return api.get<ApiResponse<NotificationLog[]>>(`/communications/logs?${params.toString()}`);
  },
};

export const communicationsApi = { templates, campaigns, rules, notifications, logs };
