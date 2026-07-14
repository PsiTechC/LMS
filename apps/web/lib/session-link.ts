// Shared join-link resolution for any screen that renders a session's
// meeting link (faculty dashboard, coach calendar, participant My Sessions
// and Coaching, superadmin Live Sessions). meeting_type/zoom_join_url only
// exist on class_sessions once a real Zoom meeting has been created;
// virtual_link is a separate, often-stale field (legacy manual links or the
// old fake meet.xa-lms.dev placeholder from before the Zoom pivot) and must
// never be preferred over a real Zoom join URL.
export function resolveJoinLink(
  meetingType: string | undefined,
  joinUrl: string | undefined,
  virtualLink: string | undefined,
): string | undefined {
  if (meetingType === "zoom_embedded" && joinUrl) return joinUrl;
  return virtualLink || undefined;
}
