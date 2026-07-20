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
  audience: "all_participants" | "at_risk" | "incomplete";
  status: "draft" | "scheduled" | "sending" | "sent" | "cancelled";
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
  trigger_config: Record<string, number>;
  channel: "email" | "push" | "both";
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
  status: "sent" | "failed" | "pending";
  error_msg?: string;
  sent_at: string;
}

export interface InAppNotification {
  id: string;
  user_id: string;
  title: string;
  body: string;
  type: "info" | "reminder" | "alert" | "achievement";
  rule_id?: string;
  campaign_id?: string;
  link?: string;
  read_at?: string;
  created_at: string;
}

export const communicationsApi = {
  listTemplates: (orgId: string) =>
    api.get<ApiResponse<EmailTemplate[]>>(`/communications/templates?org_id=${orgId}`),
  createTemplate: (body: { org_id: string; name: string; subject: string; body_html: string }) =>
    api.post<ApiResponse<EmailTemplate>>("/communications/templates", body),
  updateTemplate: (id: string, body: Partial<{ name: string; subject: string; body_html: string }>) =>
    api.patch<ApiResponse<EmailTemplate>>(`/communications/templates/${id}`, body),
  deleteTemplate: (id: string) =>
    api.delete<ApiResponse<null>>(`/communications/templates/${id}`),

  listCampaigns: (orgId: string) =>
    api.get<ApiResponse<EmailCampaign[]>>(`/communications/campaigns?org_id=${orgId}`),
  createCampaign: (body: {
    org_id: string; name: string; subject: string; body_html: string;
    audience: string; cohort_id?: string; template_id?: string;
  }) => api.post<ApiResponse<EmailCampaign>>("/communications/campaigns", body),
  updateCampaign: (id: string, body: Partial<{
    name: string; subject: string; body_html: string;
    audience: string; cohort_id: string; template_id: string;
  }>) => api.patch<ApiResponse<EmailCampaign>>(`/communications/campaigns/${id}`, body),
  sendCampaign: (id: string) =>
    api.post<ApiResponse<EmailCampaign>>(`/communications/campaigns/${id}/send`, {}),
  scheduleCampaign: (id: string, scheduledAt: string) =>
    api.post<ApiResponse<EmailCampaign>>(`/communications/campaigns/${id}/schedule`, { scheduled_at: scheduledAt }),
  deleteCampaign: (id: string) =>
    api.delete<ApiResponse<null>>(`/communications/campaigns/${id}`),

  listRules: (orgId: string) =>
    api.get<ApiResponse<AutomationRule[]>>(`/communications/rules?org_id=${orgId}`),
  createRule: (body: {
    org_id: string; name: string; trigger_type: string;
    trigger_config: Record<string, number>; channel: string;
    message_subject?: string; message_body?: string; template_id?: string;
  }) => api.post<ApiResponse<AutomationRule>>("/communications/rules", body),
  updateRule: (id: string, body: Partial<{
    name: string; is_active: boolean; trigger_type: string;
    trigger_config: Record<string, number>; channel: string;
    message_subject: string; message_body: string; template_id: string;
  }>) => api.patch<ApiResponse<AutomationRule>>(`/communications/rules/${id}`, body),
  deleteRule: (id: string) =>
    api.delete<ApiResponse<null>>(`/communications/rules/${id}`),

  listNotifications: () =>
    api.get<ApiResponse<InAppNotification[]>>("/communications/notifications"),
  markRead: (id: string) =>
    api.post<ApiResponse<null>>(`/communications/notifications/${id}/read`, {}),
  markAllRead: () =>
    api.post<ApiResponse<null>>("/communications/notifications/read-all", {}),

  listLogs: (orgId: string, campaignId?: string, ruleId?: string) => {
    const qs = new URLSearchParams({ org_id: orgId });
    if (campaignId) qs.set("campaign_id", campaignId);
    if (ruleId) qs.set("rule_id", ruleId);
    return api.get<ApiResponse<NotificationLog[]>>(`/communications/logs?${qs.toString()}`);
  },
};
