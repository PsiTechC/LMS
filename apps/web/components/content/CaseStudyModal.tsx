"use client";

import { useState, useRef } from "react";
import { contentApi, AssetDTO } from "@/lib/content-api";
import { ModalShell, FieldLabel, inputStyle, btnPrimStyle, btnSecStyle, fmtBytes, NAVY, MUTED, ORANGE, BG, BORDER } from "./shared";

export default function CaseStudyModal({ orgId, onClose, onSuccess }: {
  orgId: string;
  onClose: () => void;
  onSuccess: (a: AssetDTO) => void;
}) {
  const [mode, setMode] = useState<"upload" | "type">("upload");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [bodyText, setBodyText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  function onFile(f: File) {
    setFile(f);
    setTitle((t) => t || f.name.replace(/\.[^/.]+$/, "").replace(/[-_]/g, " "));
  }

  const canSave = title.trim() && (mode === "upload" ? !!file : bodyText.trim().length > 0);

  async function handleSave() {
    if (!canSave) return;
    setSaving(true);
    setError("");
    try {
      const res = await contentApi.create(orgId, {
        title,
        description,
        asset_type: "case_study",
        file: mode === "upload" ? (file ?? undefined) : undefined,
        case_study: mode === "type" ? { body_text: bodyText } : undefined,
      });
      onSuccess(res.data);
    } catch (e: unknown) {
      setError((e as Error).message ?? "Failed to save case study");
      setSaving(false);
    }
  }

  return (
    <ModalShell title="Create Case Study" onClose={onClose} maxWidth={560}>
      <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 14, overflowY: "auto", flex: 1 }}>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={() => setMode("upload")} style={{ flex: 1, padding: "8px 12px", borderRadius: 8, border: `1.5px solid ${mode === "upload" ? "#4A5573" : BORDER}`, background: mode === "upload" ? "#4A557312" : "#fff", color: mode === "upload" ? "#4A5573" : MUTED, fontSize: 12, fontWeight: mode === "upload" ? 700 : 500, cursor: "pointer", fontFamily: "Poppins, sans-serif" }}>
            ⬆ Upload File
          </button>
          <button onClick={() => setMode("type")} style={{ flex: 1, padding: "8px 12px", borderRadius: 8, border: `1.5px solid ${mode === "type" ? "#4A5573" : BORDER}`, background: mode === "type" ? "#4A557312" : "#fff", color: mode === "type" ? "#4A5573" : MUTED, fontSize: 12, fontWeight: mode === "type" ? 700 : 500, cursor: "pointer", fontFamily: "Poppins, sans-serif" }}>
            ✎ Type Content
          </button>
        </div>

        <div>
          <FieldLabel>TITLE *</FieldLabel>
          <input value={title} onChange={(e) => setTitle(e.target.value)} style={inputStyle} placeholder="e.g. Navigating Organisational Change" />
        </div>
        <div>
          <FieldLabel>DESCRIPTION</FieldLabel>
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} style={{ ...inputStyle, resize: "vertical" }} placeholder="Brief description (optional)" />
        </div>

        {mode === "upload" ? (
          !file ? (
            <div
              onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => { e.preventDefault(); setDragging(false); const f = e.dataTransfer.files[0]; if (f) onFile(f); }}
              onClick={() => inputRef.current?.click()}
              style={{ border: `2px dashed ${dragging ? ORANGE : "#C9BFA8"}`, borderRadius: 12, padding: "36px 20px", textAlign: "center", background: dragging ? "rgba(200, 168, 96,0.04)" : BG, cursor: "pointer" }}
            >
              <input ref={inputRef} type="file" accept=".pdf,.doc,.docx" style={{ display: "none" }} onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); }} />
              <div style={{ fontSize: 28, marginBottom: 8, opacity: 0.4 }}>📁</div>
              <div style={{ fontSize: 13, fontWeight: 700, color: NAVY, marginBottom: 4 }}>Click or drag & drop to upload</div>
              <div style={{ fontSize: 11, color: MUTED }}>PDF, Word</div>
            </div>
          ) : (
            <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", background: "rgba(34,197,94,0.06)", border: "1px solid rgba(34,197,94,0.2)", borderRadius: 10 }}>
              <div style={{ fontSize: 24 }}>📄</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: NAVY }}>{file.name}</div>
                <div style={{ fontSize: 11, color: MUTED }}>{fmtBytes(file.size)}</div>
              </div>
              <button onClick={() => setFile(null)} style={{ fontSize: 12, color: ORANGE, border: "none", background: "none", cursor: "pointer", fontFamily: "Poppins, sans-serif" }}>Remove</button>
            </div>
          )
        ) : (
          <div>
            <FieldLabel>CASE STUDY CONTENT *</FieldLabel>
            <textarea
              value={bodyText}
              onChange={(e) => setBodyText(e.target.value)}
              rows={12}
              style={{ ...inputStyle, resize: "vertical", fontFamily: "Poppins, sans-serif", lineHeight: 1.6 }}
              placeholder="Write or paste the full case study content here…"
            />
          </div>
        )}
        {error && <div style={{ fontSize: 11, color: "#ef4444" }}>{error}</div>}
      </div>
      <div style={{ padding: "12px 20px", borderTop: `1px solid ${BORDER}`, display: "flex", gap: 8, justifyContent: "flex-end" }}>
        <button onClick={onClose} style={btnSecStyle}>Cancel</button>
        <button
          onClick={handleSave}
          disabled={!canSave || saving}
          style={{ ...btnPrimStyle, background: canSave && !saving ? ORANGE : "#C9BFA8", cursor: canSave && !saving ? "pointer" : "default" }}
        >
          {saving ? "Saving…" : "Save Case Study"}
        </button>
      </div>
    </ModalShell>
  );
}
