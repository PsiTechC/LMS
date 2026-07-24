import { apiClient } from './client';

/**
 * In-app notifications — exact contract from api/internal/communications
 * (GET /communications/notifications, POST .../:id/read, POST .../read-all),
 * matching apps/web/lib/communications-api.ts's InAppNotification +
 * communicationsApi.listNotifications/markRead/markAllRead. Gated server-side
 * by `notifications:read`, which both `participant` and `participant_retailer`
 * hold (api/internal/shared/rbac.go).
 */
export interface InAppNotification {
  id: string;
  user_id: string;
  title: string;
  body: string;
  type: 'info' | 'reminder' | 'alert' | 'achievement';
  rule_id?: string;
  campaign_id?: string;
  link?: string;
  read_at?: string;
  created_at: string;
}

export const notificationsApi = {
  list: () => apiClient.get<InAppNotification[]>('/communications/notifications'),
  markRead: (id: string) => apiClient.post<null>(`/communications/notifications/${id}/read`, {}),
  markAllRead: () => apiClient.post<null>('/communications/notifications/read-all', {}),
};
