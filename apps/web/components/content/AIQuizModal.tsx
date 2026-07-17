"use client";

import { useState, useRef } from "react";
import { contentApi, AssetDTO, QuestionSet, AIChatTurn } from "@/lib/content-api";
import { ModalShell, FieldLabel, inputStyle, btnPrimStyle, btnSecStyle, fmtBytes, NAVY, MUTED, ORANGE, GREEN, BORDER, BG } from "./shared";
import { ASSET_TYPE_LABELS } from "./QuestionEditor";
import QuestionListPreview from "./QuestionListPreview";

// AI-assisted drafting for quiz/survey/Kirkpatrick assets: prompt/PDF -> draft -> conversational refine -> save.
export default function AIQuizModal({ orgId, assetType, onClose, onBack, onSuccess }: {
  orgId: string;
  assetType: string;
  onClose: () => void;
  onBack?: () => void;
  onSuccess: (a: AssetDTO) => void;
}) {
  const label = ASSET_TYPE_LABELS[assetType] ?? assetType;
  const [prompt, setPrompt] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState("");
  const [draftTitle, setDraftTitle] = useState("");
  const [draftDescription, setDraftDescription] = useState("");
  const [draft, setDraft] = useState<QuestionSet | null>(null);
  const [assistantMessage, setAssistantMessage] = useState("");
  const [chatHistory, setChatHistory] = useState<AIChatTurn[]>([]);
  const [refinePrompt, setRefinePrompt] = useState("");
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function generate(instructionOverride?: string) {
    const instruction = instructionOverride ?? prompt;
    if (!instruction.trim() && !file) return;
    setGenerating(true);
    setError("");
    try {
      const nextHistory: AIChatTurn[] = instructionOverride
        ? [...chatHistory, { role: "user", content: instructionOverride }]
        : chatHistory;
      const res = await contentApi.aiGenerateQuiz(orgId, {
        prompt: instruction,
        asset_type: assetType,
        existing_draft: draft ?? undefined,
        existing_title: draftTitle || undefined,
        chat_history: nextHistory,
      }, file ?? undefined);
      setDraftTitle(res.data.title);
      setDraftDescription(res.data.description);
      setDraft(res.data.question_set);
      setAssistantMessage(res.data.assistant_message);
      setChatHistory([...nextHistory, { role: "assistant", content: res.data.assistant_message }]);
      setRefinePrompt("");
    } catch (e: unknown) {
      setError((e as Error).message ?? "AI generation failed");
    } finally {
      setGenerating(false);
    }
  }

  async function handleSave() {
    if (!draft || !draftTitle.trim()) return;
    setSaving(true);
    setError("");
    try {
      const res = await contentApi.create(orgId, {
        title: draftTitle,
        description: draftDescription,
        asset_type: assetType,
        question_count: draft.questions.length,
        question_set: draft,
      });
      onSuccess(res.data);
    } catch (e: unknown) {
      setError((e as Error).message ?? "Failed to save");
      setSaving(false);
    }
  }

  if (!draft) {
    return (
      <ModalShell title={`AI Generate ${label}`} onClose={onClose} maxWidth={520}>
        <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 14 }}>
          <div>
            <FieldLabel>DESCRIBE THE {label.toUpperCase()} YOU WANT</FieldLabel>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              rows={4}
              style={{ ...inputStyle, resize: "vertical" }}
              placeholder={`e.g. A 5-question ${label.toLowerCase()} on situational leadership styles, mixing MCQ and true/false.`}
            />
          </div>
          <div>
            <FieldLabel>OR UPLOAD A PDF TO EXTRACT FROM (optional)</FieldLabel>
            {!file ? (
              <div
                onClick={() => inputRef.current?.click()}
                style={{ border: `1.5px dashed ${BORDER}`, borderRadius: 10, padding: "16px", textAlign: "center", cursor: "pointer", background: BG }}
              >
                <input ref={inputRef} type="file" accept=".pdf" style={{ display: "none" }}
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) setFile(f); }} />
                <div style={{ fontSize: 20, opacity: 0.3, marginBottom: 4 }}>📄</div>
                <div style={{ fontSize: 11, color: MUTED }}>Click to attach a PDF</div>
              </div>
            ) : (
              <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", background: "rgba(34,197,94,0.06)", border: "1px solid rgba(34,197,94,0.2)", borderRadius: 8 }}>
                <span style={{ fontSize: 16 }}>📄</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: NAVY, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{file.name}</div>
                  <div style={{ fontSize: 10, color: MUTED }}>{fmtBytes(file.size)}</div>
                </div>
                <button onClick={() => setFile(null)} style={{ fontSize: 11, color: ORANGE, border: "none", background: "none", cursor: "pointer", fontFamily: "Poppins, sans-serif" }}>Remove</button>
              </div>
            )}
          </div>
          {error && <div style={{ fontSize: 11, color: "#ef4444" }}>{error}</div>}
        </div>
        <div style={{ padding: "12px 20px", borderTop: `1px solid ${BORDER}`, display: "flex", gap: 8, justifyContent: onBack ? "space-between" : "flex-end" }}>
          {onBack && <button onClick={onBack} style={btnSecStyle}>← Back</button>}
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={onClose} style={btnSecStyle}>Cancel</button>
            <button
              onClick={() => generate()}
              disabled={generating || (!prompt.trim() && !file)}
              style={{ ...btnPrimStyle, background: generating || (!prompt.trim() && !file) ? "#C9BFA8" : ORANGE, cursor: generating || (!prompt.trim() && !file) ? "default" : "pointer" }}
            >
              {generating ? "Generating…" : "✦ Generate"}
            </button>
          </div>
        </div>
      </ModalShell>
    );
  }

  return (
    <ModalShell title={`Review AI-Generated ${label}`} onClose={onClose} maxWidth={640}>
      <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 14, overflowY: "auto", flex: 1 }}>
        {assistantMessage && (
          <div style={{ display: "flex", gap: 10, padding: "10px 14px", background: `${ORANGE}0a`, border: `1px solid ${ORANGE}30`, borderRadius: 10 }}>
            <span style={{ fontSize: 14 }}>✦</span>
            <div style={{ fontSize: 12, color: NAVY, lineHeight: 1.5 }}>{assistantMessage}</div>
          </div>
        )}
        <div>
          <FieldLabel>TITLE</FieldLabel>
          <input value={draftTitle} onChange={(e) => setDraftTitle(e.target.value)} style={inputStyle} />
        </div>
        <div>
          <FieldLabel>DESCRIPTION</FieldLabel>
          <textarea value={draftDescription} onChange={(e) => setDraftDescription(e.target.value)} rows={2} style={{ ...inputStyle, resize: "vertical" }} />
        </div>
        <div>
          <FieldLabel>QUESTIONS ({draft.questions.length})</FieldLabel>
          <QuestionListPreview questions={draft.questions} />
        </div>

        <div style={{ borderTop: `1px solid ${BORDER}`, paddingTop: 12 }}>
          <FieldLabel>ASK AI TO ADJUST</FieldLabel>
          <div style={{ display: "flex", gap: 8 }}>
            <input
              value={refinePrompt}
              onChange={(e) => setRefinePrompt(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && refinePrompt.trim() && !generating) generate(refinePrompt); }}
              style={inputStyle}
              placeholder='e.g. "Make question 3 harder" or "add 2 more true/false questions"'
            />
            <button
              onClick={() => generate(refinePrompt)}
              disabled={!refinePrompt.trim() || generating}
              style={{ ...btnSecStyle, opacity: !refinePrompt.trim() || generating ? 0.5 : 1, whiteSpace: "nowrap" }}
            >
              {generating ? "…" : "Send"}
            </button>
          </div>
        </div>
        {error && <div style={{ fontSize: 11, color: "#ef4444" }}>{error}</div>}
      </div>
      <div style={{ padding: "12px 20px", borderTop: `1px solid ${BORDER}`, display: "flex", gap: 8, justifyContent: "space-between" }}>
        <button onClick={() => setDraft(null)} style={btnSecStyle}>← Start Over</button>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={onClose} style={btnSecStyle}>Cancel</button>
          <button
            onClick={handleSave}
            disabled={!draftTitle.trim() || draft.questions.length === 0 || saving}
            style={{ ...btnPrimStyle, background: GREEN, opacity: !draftTitle.trim() || draft.questions.length === 0 || saving ? 0.5 : 1 }}
          >
            {saving ? "Saving…" : `✓ Finalize & Save ${label}`}
          </button>
        </div>
      </div>
    </ModalShell>
  );
}
