"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { aiCoachApi, streamMessage, type AIMessageDTO } from "@/lib/ai-coach-api";

// ── Design tokens ─────────────────────────────────────────────────
const ff = { fontFamily: "Poppins, sans-serif" } as const;
const NAVY = "#1C2551";
const ORANGE = "#EF4E24";
const CARD = "#fff";
const BORDER = "#EAECF4";
const PAGE = "#F5F7FB";
const MUTED = "#8b90a7";

const SUGGESTIONS = [
  "How am I doing so far?",
  "What should I focus on next?",
  "Suggest a resource for me",
  "Give me a reflection prompt",
];

type ChatMsg = { role: "user" | "assistant"; content: string };

// Inline formatting: **bold**, and strip any stray * markers so raw markdown
// symbols never show through.
function inline(text: string, keyBase: string): React.ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, i) => {
    const m = part.match(/^\*\*([^*]+)\*\*$/);
    if (m) return <strong key={`${keyBase}-${i}`}>{m[1]}</strong>;
    return <span key={`${keyBase}-${i}`}>{part.replace(/\*/g, "")}</span>;
  });
}

// Minimal markdown → React: headings (#..), bold (**), and -/*/1. lists.
// Keeps assistant replies clean without pulling in a markdown dependency.
function renderMarkdown(text: string): React.ReactNode[] {
  const lines = text.split("\n");
  const blocks: React.ReactNode[] = [];
  let list: React.ReactNode[] = [];
  let listOrdered = false;
  const flush = () => {
    if (list.length) {
      const items = list;
      blocks.push(
        listOrdered
          ? <ol key={`b${blocks.length}`} style={{ margin: "4px 0", paddingLeft: 20 }}>{items}</ol>
          : <ul key={`b${blocks.length}`} style={{ margin: "4px 0", paddingLeft: 20 }}>{items}</ul>,
      );
      list = [];
    }
  };
  lines.forEach((raw, i) => {
    const line = raw.trim();
    if (!line) { flush(); return; }
    const heading = line.match(/^#{1,6}\s+(.*)$/);
    if (heading) { flush(); blocks.push(<div key={i} style={{ fontWeight: 700, margin: "8px 0 2px" }}>{inline(heading[1], `h${i}`)}</div>); return; }
    const bullet = line.match(/^[-*]\s+(.*)$/);
    if (bullet) { if (listOrdered) flush(); listOrdered = false; list.push(<li key={i} style={{ marginBottom: 2 }}>{inline(bullet[1], `li${i}`)}</li>); return; }
    const num = line.match(/^\d+\.\s+(.*)$/);
    if (num) { if (!listOrdered && list.length) flush(); listOrdered = true; list.push(<li key={i} style={{ marginBottom: 2 }}>{inline(num[1], `li${i}`)}</li>); return; }
    flush();
    blocks.push(<div key={i} style={{ margin: "3px 0" }}>{inline(line, `p${i}`)}</div>);
  });
  flush();
  return blocks;
}

export default function AICoachWidget() {
  const [open, setOpen] = useState(false);
  const [convId, setConvId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [booting, setBooting] = useState(false);
  const [error, setError] = useState("");
  const bodyRef = useRef<HTMLDivElement>(null);
  // Guards the one-time boot so a failure can NEVER retry-loop (which froze the page).
  const bootStartedRef = useRef(false);

  const boot = useCallback(async () => {
    if (bootStartedRef.current) return;
    bootStartedRef.current = true;
    setBooting(true);
    setError("");
    try {
      const list = await aiCoachApi.list();
      const existing = (list.data ?? [])[0];
      if (existing) {
        const detail = await aiCoachApi.get(existing.id);
        setConvId(existing.id);
        setMessages((detail.data?.messages ?? []).map((m: AIMessageDTO) => ({ role: m.role, content: m.content })));
      } else {
        const created = await aiCoachApi.create();
        if (!created.data?.id) throw new Error("no conversation id");
        setConvId(created.data.id);
        setMessages([]);
      }
    } catch {
      setError("Couldn't start the AI coach. Close and reopen to retry.");
      bootStartedRef.current = false; // allow a manual retry on next open
    } finally {
      setBooting(false);
    }
  }, []);

  // Boot once when the widget is first opened.
  useEffect(() => {
    if (open && !convId) void boot();
  }, [open, convId, boot]);

  useEffect(() => {
    bodyRef.current?.scrollTo({ top: bodyRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, streaming]);

  async function send(text: string) {
    const content = text.trim();
    if (!content || streaming || !convId) return;
    setError("");
    setInput("");
    setMessages((m) => [...m, { role: "user", content }, { role: "assistant", content: "" }]);
    setStreaming(true);
    try {
      await streamMessage(convId, content, (delta) => {
        setMessages((m) => {
          const copy = m.slice();
          const last = copy[copy.length - 1];
          if (last && last.role === "assistant") copy[copy.length - 1] = { ...last, content: last.content + delta };
          return copy;
        });
      });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Something went wrong";
      setMessages((m) => {
        const copy = m.slice();
        const last = copy[copy.length - 1];
        if (last && last.role === "assistant" && !last.content) copy[copy.length - 1] = { ...last, content: `⚠️ ${msg}` };
        return copy;
      });
    } finally {
      setStreaming(false);
    }
  }

  return (
    <>
      {/* Floating action button */}
      <button
        onClick={() => setOpen(true)}
        aria-label="Open AI Learning Coach"
        style={{
          position: "fixed", bottom: 28, right: 28, zIndex: 1900,
          width: 56, height: 56, borderRadius: "50%", border: "none", cursor: "pointer",
          background: ORANGE, color: "#fff", fontSize: 22,
          boxShadow: "0 8px 24px rgba(239,78,36,0.4)", display: open ? "none" : "flex",
          alignItems: "center", justifyContent: "center",
        }}
      >
        ✦
      </button>

      {open && typeof document !== "undefined" &&
        createPortal(
          <>
            {/* Overlay */}
            <div onClick={() => setOpen(false)} style={{ position: "fixed", inset: 0, background: "rgba(28,37,81,0.35)", zIndex: 2000 }} />

            {/* Slide-in panel */}
            <div style={{ position: "fixed", top: 0, right: 0, bottom: 0, width: 420, maxWidth: "100vw", background: CARD, boxShadow: "-8px 0 40px rgba(28,37,81,0.14)", zIndex: 2001, display: "flex", flexDirection: "column", ...ff }}>
              {/* Header */}
              <div style={{ background: "linear-gradient(135deg,#1C2551,#2d3a7c)", padding: "18px 20px", display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <div style={{ width: 34, height: 34, borderRadius: "50%", background: "rgba(255,255,255,0.15)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, color: "#fff" }}>✦</div>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: "#fff" }}>AI Learning Coach</div>
                    <div style={{ fontSize: 11, color: "rgba(255,255,255,0.6)" }}>Always-on personalized support</div>
                  </div>
                </div>
                <button onClick={() => setOpen(false)} style={{ width: 30, height: 30, borderRadius: "50%", border: "none", background: "rgba(255,255,255,0.15)", color: "#fff", cursor: "pointer", fontSize: 15 }}>✕</button>
              </div>

              {/* Messages */}
              <div ref={bodyRef} style={{ flex: 1, overflowY: "auto", padding: "18px 20px", background: PAGE }}>
                {booting ? (
                  <div style={{ ...ff, fontSize: 13, color: MUTED, textAlign: "center", padding: 24 }}>Starting your coach…</div>
                ) : messages.length === 0 ? (
                  <div>
                    <div style={{ ...ff, fontSize: 13, color: MUTED, lineHeight: 1.5, marginBottom: 16 }}>
                      Hi! I'm your AI Learning Coach. Ask me about your program, your progress, or what to focus on next.
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      {SUGGESTIONS.map((s) => (
                        <button key={s} onClick={() => send(s)} disabled={streaming || !convId}
                          style={{ ...ff, textAlign: "left", background: CARD, border: `1px solid ${BORDER}`, borderRadius: 10, padding: "10px 14px", fontSize: 13, color: NAVY, cursor: "pointer" }}>
                          {s}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                    {messages.map((m, i) => (
                      <div key={i} style={{ display: "flex", justifyContent: m.role === "user" ? "flex-end" : "flex-start" }}>
                        <div style={{
                          ...ff, maxWidth: "84%", fontSize: 13, lineHeight: 1.55, padding: "10px 13px", borderRadius: 12,
                          whiteSpace: m.role === "user" ? "pre-wrap" : "normal",
                          wordBreak: "break-word",
                          background: m.role === "user" ? NAVY : CARD,
                          color: m.role === "user" ? "#fff" : NAVY,
                          border: m.role === "user" ? "none" : `1px solid ${BORDER}`,
                          borderBottomRightRadius: m.role === "user" ? 4 : 12,
                          borderBottomLeftRadius: m.role === "user" ? 12 : 4,
                        }}>
                          {m.role === "assistant"
                            ? (m.content ? renderMarkdown(m.content) : (streaming && i === messages.length - 1 ? "▍" : ""))
                            : m.content}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                {error && <div style={{ ...ff, fontSize: 12, color: "#ef4444", marginTop: 10 }}>{error}</div>}
              </div>

              {/* Composer */}
              <form onSubmit={(e) => { e.preventDefault(); send(input); }}
                style={{ flexShrink: 0, borderTop: `1px solid ${BORDER}`, padding: 12, display: "flex", gap: 8, background: CARD }}>
                <input
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder={streaming ? "Coach is typing…" : "Ask your coach…"}
                  disabled={streaming || booting || !convId}
                  style={{ ...ff, flex: 1, border: `1px solid ${BORDER}`, borderRadius: 10, padding: "10px 12px", fontSize: 13, color: NAVY, outline: "none" }}
                />
                <button type="submit" disabled={streaming || booting || !input.trim() || !convId}
                  style={{ ...ff, background: ORANGE, color: "#fff", border: "none", borderRadius: 10, padding: "0 18px", fontSize: 13, fontWeight: 700, cursor: streaming ? "not-allowed" : "pointer", opacity: streaming || !input.trim() ? 0.6 : 1 }}>
                  Send
                </button>
              </form>
            </div>
          </>,
          document.body,
        )}
    </>
  );
}
