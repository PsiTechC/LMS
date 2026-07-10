import { api, ApiResponse } from "./api";

export interface AIConversationDTO {
  id: string;
  title: string;
  program_id?: string;
  created_at: string;
  updated_at: string;
}

export interface AIMessageDTO {
  id: string;
  role: "user" | "assistant";
  content: string;
  created_at: string;
}

export interface AIConversationDetailDTO extends AIConversationDTO {
  messages: AIMessageDTO[];
}

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080/api/v1";
function authToken(): string | null {
  return typeof window !== "undefined" ? localStorage.getItem("xa_token") : null;
}

export const aiCoachApi = {
  list: () => api.get<ApiResponse<AIConversationDTO[]>>("/ai/conversations"),
  create: (programId?: string) =>
    api.post<ApiResponse<AIConversationDTO>>("/ai/conversations", { program_id: programId ?? "" }),
  get: (id: string) => api.get<ApiResponse<AIConversationDetailDTO>>(`/ai/conversations/${id}`),
};

// streamMessage POSTs a message and consumes the SSE stream, invoking onDelta
// per token. The shared api client buffers the whole body, so we use fetch +
// a manual reader here. Resolves when the stream ends; rejects on error.
export async function streamMessage(
  conversationId: string,
  content: string,
  onDelta: (delta: string) => void,
): Promise<void> {
  const res = await fetch(`${API_BASE}/ai/conversations/${conversationId}/messages`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(authToken() ? { Authorization: `Bearer ${authToken()}` } : {}),
    },
    body: JSON.stringify({ content }),
  });
  if (!res.ok || !res.body) {
    throw new Error(`AI request failed (${res.status})`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? ""; // keep the last partial line
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data:")) continue;
      const data = trimmed.slice(5).trim();
      if (!data) continue;
      try {
        const evt = JSON.parse(data) as { delta?: string; done?: boolean; error?: string };
        if (evt.error) throw new Error(evt.error);
        if (evt.delta) onDelta(evt.delta);
        if (evt.done) return;
      } catch (e) {
        if (e instanceof Error && e.message && !e.message.includes("JSON")) throw e;
        // otherwise ignore non-JSON keep-alive lines
      }
    }
  }
}
