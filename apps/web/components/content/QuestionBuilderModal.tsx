"use client";

import { useState } from "react";
import { contentApi, AssetDTO, Question } from "@/lib/content-api";
import { ModalShell, FieldLabel, inputStyle, btnPrimStyle, btnSecStyle, NAVY, MUTED, ORANGE, BORDER } from "./shared";
import { QuestionEditorList, ASSET_TYPE_LABELS } from "./QuestionEditor";
import UploadOnlyModal from "./UploadOnlyModal";
import AIQuizModal from "./AIQuizModal";

export default function QuestionBuilderModal({ orgId, assetType, onClose, onSuccess }: {
  orgId: string;
  assetType: string;
  onClose: () => void;
  onSuccess: (a: AssetDTO) => void;
}) {
  const [mode, setMode] = useState<"choice" | "manual" | "upload" | "ai">("choice");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [questions, setQuestions] = useState<Question[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function handleSave() {
    if (!title.trim() || questions.length === 0) return;
    setSaving(true);
    setError("");
    try {
      const ordered = questions.map((q, i) => ({ ...q, sort_order: i }));
      const res = await contentApi.create(orgId, {
        title, description, asset_type: assetType,
        question_count: ordered.length,
        question_set: { questions: ordered },
      });
      onSuccess(res.data);
    } catch (e: unknown) {
      setError((e as Error).message ?? "Failed to save");
      setSaving(false);
    }
  }

  const label = ASSET_TYPE_LABELS[assetType] ?? assetType;

  if (mode === "upload") {
    return <UploadOnlyModal orgId={orgId} assetType={assetType} onClose={onClose} onSuccess={onSuccess} />;
  }
  if (mode === "ai") {
    return <AIQuizModal orgId={orgId} assetType={assetType} onClose={onClose} onSuccess={onSuccess} />;
  }

  if (mode === "choice") {
    return (
      <ModalShell title={`Create ${label}`} onClose={onClose} maxWidth={460}>
        <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 10 }}>
          <button onClick={() => setMode("manual")} style={choiceCardStyle}>
            <span style={{ fontSize: 20 }}>✎</span>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: NAVY }}>Create Manually</div>
              <div style={{ fontSize: 11, color: MUTED, marginTop: 2 }}>Build questions step-by-step</div>
            </div>
          </button>
          <button onClick={() => setMode("ai")} style={choiceCardStyle}>
            <span style={{ fontSize: 20 }}>✦</span>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: NAVY }}>AI Generate</div>
              <div style={{ fontSize: 11, color: MUTED, marginTop: 2 }}>Describe it, or upload a PDF — AI drafts the {label.toLowerCase()}</div>
            </div>
          </button>
          <button onClick={() => setMode("upload")} style={choiceCardStyle}>
            <span style={{ fontSize: 20 }}>⬆</span>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: NAVY }}>Upload a File</div>
              <div style={{ fontSize: 11, color: MUTED, marginTop: 2 }}>Attach an existing document instead</div>
            </div>
          </button>
        </div>
      </ModalShell>
    );
  }

  // Manual builder
  return (
    <ModalShell title={`Create ${label} — Manually`} onClose={onClose} maxWidth={620}>
      <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 14, overflowY: "auto", flex: 1 }}>
        <div>
          <FieldLabel>TITLE *</FieldLabel>
          <input value={title} onChange={(e) => setTitle(e.target.value)} style={inputStyle} placeholder={`e.g. ${label} — Module 1`} />
        </div>
        <div>
          <FieldLabel>DESCRIPTION</FieldLabel>
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} style={{ ...inputStyle, resize: "vertical" }} placeholder="Brief description (optional)" />
        </div>

        <QuestionEditorList assetType={assetType} questions={questions} onChange={setQuestions} />
        {error && <div style={{ fontSize: 11, color: "#ef4444" }}>{error}</div>}
      </div>
      <div style={{ padding: "12px 20px", borderTop: `1px solid ${BORDER}`, display: "flex", gap: 8, justifyContent: "flex-end" }}>
        <button onClick={onClose} style={btnSecStyle}>Cancel</button>
        <button
          onClick={handleSave}
          disabled={!title.trim() || questions.length === 0 || saving}
          style={{ ...btnPrimStyle, background: title.trim() && questions.length > 0 && !saving ? ORANGE : "#D0D3E0", cursor: title.trim() && questions.length > 0 && !saving ? "pointer" : "default" }}
        >
          {saving ? "Saving…" : `Save ${label}`}
        </button>
      </div>
    </ModalShell>
  );
}

const choiceCardStyle: React.CSSProperties = {
  display: "flex", alignItems: "center", gap: 12, padding: "14px 16px",
  border: `1.5px solid ${BORDER}`, borderRadius: 12, background: "#fff",
  cursor: "pointer", textAlign: "left", fontFamily: "Poppins, sans-serif",
};
