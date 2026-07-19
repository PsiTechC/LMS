"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { aiCoachApi, streamMessage, type AIMessageDTO } from "@/lib/ai-coach-api";

// ── Design tokens (apps/CLAUDE.md) ──────────────────────────────────
const ff = { fontFamily: "Poppins, sans-serif" } as const;
const NAVY = "var(--xa-navy)";
const ORANGE = "var(--xa-primary)";
const CARD = "#fff";
const BORDER = "#E6DED0";
const PAGE = "var(--xa-bg)";
const ALT = "#EFE9DC";
const MUTED = "var(--xa-muted)";
const SUCCESS = "#22c55e";
const DANGER = "#ef4444";

const SUGGESTIONS = [
  "How am I doing so far?",
  "What should I focus on next?",
  "Suggest a resource for me",
  "Give me a reflection prompt",
];

type ChatMsg = { role: "user" | "assistant"; content: string };

// Animated typing indicator shown while waiting for the first streamed token.
function TypingDots() {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 4, padding: "2px 0" }}>
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="xa-typing-dot"
          style={{ width: 6, height: 6, borderRadius: "50%", background: MUTED, display: "inline-block" }}
        />
      ))}
    </div>
  );
}

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

// Small clipboard icon, shown on hover over an assistant bubble.
function CopyIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="9" y="9" width="13" height="13" rx="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

// Copy-to-clipboard button revealed on hover, with brief "Copied" feedback.
function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  async function handleCopy(e: React.MouseEvent) {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      return;
    }
    setCopied(true);
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => setCopied(false), 1500);
  }

  useEffect(() => () => { if (timeoutRef.current) clearTimeout(timeoutRef.current); }, []);

  return (
    <button
      onClick={handleCopy}
      aria-label={copied ? "Copied" : "Copy response"}
      title={copied ? "Copied!" : "Copy response"}
      className="xa-copy-btn"
      style={{
        ...ff, display: "flex", alignItems: "center", gap: 4, marginTop: 6,
        background: "none", border: "none", padding: 0, cursor: "pointer",
        fontSize: 10.5, fontWeight: 600, color: copied ? SUCCESS : MUTED,
        opacity: 0, transition: "opacity 0.12s ease",
      }}
    >
      {copied ? <CheckIcon /> : <CopyIcon />}
      {copied ? "Copied" : "Copy"}
    </button>
  );
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
      {/* Floating action button — 50px (10% down from the previous 56px).
          Portaled to <body>, same as the open panel below — this component
          is mounted inside DashboardShell's <main className="xa-page">,
          which has a CSS transform for its entrance animation and is also
          the scroll container. A transformed ancestor becomes the containing
          block for position:fixed descendants, so without the portal this
          button would scroll away with the page instead of staying pinned
          to the viewport. */}
      {typeof document !== "undefined" && !open &&
        createPortal(
          <button
            onClick={() => setOpen(true)}
            aria-label="Open AI Learning Coach"
            style={{
              position: "fixed", bottom: 26, right: 26, zIndex: 1900,
              width: 50, height: 50, borderRadius: "50%", border: "none", cursor: "pointer",
              background: ORANGE, color: "#fff", fontSize: 20,
              boxShadow: "0 8px 24px rgba(200, 168, 96,0.4)", display: "flex",
              alignItems: "center", justifyContent: "center",
              transition: "transform 0.15s ease, box-shadow 0.15s ease",
            }}
            onMouseEnter={(e) => { e.currentTarget.style.transform = "scale(1.06)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.transform = "scale(1)"; }}
          >
            ✦
          </button>,
          document.body
        )}

      {open && typeof document !== "undefined" &&
        createPortal(
          <>
            {/* Click-away layer — transparent, just closes the popover */}
            <div onClick={() => setOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 2000 }} />

            {/* Floating popover panel — anchored to and animates from the FAB */}
            <div
              className="xa-chat-pop-in"
              style={{
                position: "fixed", bottom: 26, right: 26, zIndex: 2001,
                width: 378, maxWidth: "calc(100vw - 32px)", height: 560, maxHeight: "calc(100vh - 120px)",
                background: CARD, borderRadius: 16, border: `1px solid ${BORDER}`,
                boxShadow: "0 24px 64px rgba(24, 40, 72,0.22)",
                display: "flex", flexDirection: "column", overflow: "hidden", ...ff,
              }}
            >
              {/* Header */}
              <div style={{ background: NAVY, padding: "16px 18px", display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <div style={{ width: 36, height: 36, borderRadius: "50%", background: "rgba(200, 168, 96,0.22)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, color: ORANGE }}>✦</div>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: "#fff" }}>AI Learning Coach</div>
                    <div style={{ fontSize: 11, color: "rgba(255,255,255,0.65)", display: "flex", alignItems: "center", gap: 5, marginTop: 2 }}>
                      <span style={{ width: 6, height: 6, borderRadius: "50%", background: SUCCESS, display: "inline-block" }} />
                      Online
                    </div>
                  </div>
                </div>
                <button
                  onClick={() => setOpen(false)}
                  aria-label="Close"
                  style={{ width: 28, height: 28, borderRadius: 6, border: "none", background: "rgba(255,255,255,0.1)", color: "#fff", cursor: "pointer", fontSize: 14, display: "flex", alignItems: "center", justifyContent: "center" }}
                >
                  ✕
                </button>
              </div>

              {/* Messages */}
              <div ref={bodyRef} style={{ flex: 1, overflowY: "auto", padding: "16px 18px", background: PAGE }}>
                {booting ? (
                  <div style={{ ...ff, fontSize: 13, color: MUTED, textAlign: "center", padding: 24 }}>Starting your coach…</div>
                ) : messages.length === 0 ? (
                  <div>
                    <div style={{ display: "flex", justifyContent: "flex-start", marginBottom: 14 }}>
                      <div style={{
                        maxWidth: "88%", fontSize: 13, lineHeight: 1.55, padding: "11px 14px", borderRadius: 12,
                        borderBottomLeftRadius: 4, background: CARD, color: NAVY, border: `1px solid ${BORDER}`,
                      }}>
                        Hello! I&apos;m your AI Learning Coach. I can help with your program, progress, and what to focus on next. What would you like to know?
                      </div>
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      {SUGGESTIONS.map((s) => (
                        <button
                          key={s}
                          onClick={() => send(s)}
                          disabled={streaming || !convId}
                          style={{
                            ...ff, textAlign: "left", background: CARD, border: `1px solid ${BORDER}`,
                            borderRadius: 10, padding: "10px 14px", fontSize: 12.5, fontWeight: 500, color: NAVY,
                            cursor: streaming || !convId ? "default" : "pointer",
                          }}
                        >
                          {s}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    {messages.map((m, i) => {
                      const isCompleteAssistant = m.role === "assistant" && !!m.content && !(streaming && i === messages.length - 1);
                      return (
                        <div key={i} style={{ display: "flex", justifyContent: m.role === "user" ? "flex-end" : "flex-start" }}>
                          <div
                            className={isCompleteAssistant ? "xa-msg-bubble" : undefined}
                            style={{
                              ...ff, maxWidth: "86%", fontSize: 13, lineHeight: 1.55, padding: "10px 13px", borderRadius: 12,
                              whiteSpace: m.role === "user" ? "pre-wrap" : "normal",
                              wordBreak: "break-word",
                              background: m.role === "user" ? ORANGE : CARD,
                              color: m.role === "user" ? "#fff" : NAVY,
                              border: m.role === "user" ? "none" : `1px solid ${BORDER}`,
                              borderBottomRightRadius: m.role === "user" ? 4 : 12,
                              borderBottomLeftRadius: m.role === "user" ? 12 : 4,
                            }}
                          >
                            {m.role === "assistant"
                              ? (m.content ? renderMarkdown(m.content) : (streaming && i === messages.length - 1 ? <TypingDots /> : ""))
                              : m.content}
                            {isCompleteAssistant && <CopyButton text={m.content} />}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
                {error && <div style={{ ...ff, fontSize: 12, color: DANGER, marginTop: 10 }}>{error}</div>}
              </div>

              {/* Composer */}
              <form
                onSubmit={(e) => { e.preventDefault(); send(input); }}
                style={{ flexShrink: 0, borderTop: `1px solid ${BORDER}`, padding: 12, display: "flex", gap: 8, background: CARD }}
              >
                <input
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder={streaming ? "Coach is typing…" : "Type a message…"}
                  disabled={streaming || booting || !convId}
                  style={{ ...ff, flex: 1, background: ALT, border: `1px solid ${BORDER}`, borderRadius: 99, padding: "9px 14px", fontSize: 13, color: NAVY, outline: "none" }}
                />
                <button
                  type="submit"
                  disabled={streaming || booting || !input.trim() || !convId}
                  aria-label="Send"
                  style={{
                    ...ff, width: 38, height: 38, flexShrink: 0, background: ORANGE, color: "#fff", border: "none",
                    borderRadius: "50%", fontSize: 15, cursor: streaming ? "not-allowed" : "pointer",
                    opacity: streaming || !input.trim() ? 0.55 : 1,
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}
                >
                  ➤
                </button>
              </form>
            </div>
          </>,
          document.body,
        )}
    </>
  );
}
