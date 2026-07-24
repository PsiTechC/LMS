/**
 * Shared join-link resolution — exact port of apps/web/lib/session-link.ts.
 * meeting_type/join_url only exist once a real Zoom meeting has been
 * created; virtual_link is a separate, often-stale field and must never be
 * preferred over a real Zoom join URL.
 */
export function resolveJoinLink(
  meetingType: string | undefined,
  joinUrl: string | undefined,
  virtualLink: string | undefined
): string | undefined {
  if (meetingType === 'zoom_embedded' && joinUrl) return joinUrl;
  return virtualLink || undefined;
}
