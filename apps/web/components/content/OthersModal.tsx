"use client";

import { useState, useRef } from "react";
import { contentApi, AssetDTO, CreateAssetPayload } from "@/lib/content-api";
import { ModalShell, FieldLabel, inputStyle, btnPrimStyle, btnSecStyle, fmtBytes, NAVY, MUTED, ORANGE, BG, BORDER } from "./shared";

// Generic catch-all creation form - used for "assessment" and any asset type
// that doesn't have a dedicated workflow. All fields are optional except title.
export default function OthersModal({ orgId, assetType, assetLabel, onClose, onSuccess }: {
  orgId: string;
  assetType: string;
  assetLabel: string;
  onClose: () => void;
  onSuccess: (a: AssetDTO) => void;
}) {
  const [form, setForm] = useState<Record<string, string>>({});
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  function setF(k: string, v: string) { setForm((p) => ({ ...p, [k]: v })); }

  async function handleCreate() {
    if (!form.title?.trim()) return;
    setSaving(true);
    setError("");
    try {
      const payload: CreateAssetPayload = {
        title: form.title,
        description: form.description,
        asset_type: assetType,
        tags: form.tags ? form.tags.split(",").map((s) => s.trim()).filter(Boolean) : [],
        question_count: form.question_count ? parseInt(form.question_count) : undefined,
        duration_mins: form.duration_mins ? parseInt(form.duration_mins) : undefined,
        video_url: form.video_url?.trim() ? form.video_url.trim() : undefined,
        file: file ?? undefined,
      };
      const res = await contentApi.create(orgId, payload);
      onSuccess(res.data);
    } catch (e: unknown) {
      setError((e as Error).message ?? "Failed to create asset");
      setSaving(false);
    }
  }

  return (
    <ModalShell title={`Create ${assetLabel}`} onClose={onClose} maxWidth={520}>
      <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 14, maxHeight: "calc(90vh - 120px)", overflowY: "auto" }}>
        <div>
          <FieldLabel>TITLE *</FieldLabel>
          <input value={form.title ?? ""} onChange={(e) => setF("title", e.target.value)} style={inputStyle} placeholder={`e.g. ${assetLabel} title`} />
        </div>

        <div>
          <FieldLabel>DESCRIPTION</FieldLabel>
          <textarea value={form.description ?? ""} onChange={(e) => setF("description", e.target.value)} rows={2} style={{ ...inputStyle, resize: "vertical" }} placeholder="Brief description (optional)" />
        </div>

        <div className="xa-two-col" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <div>
            <FieldLabel>QUESTION COUNT</FieldLabel>
            <input type="number" min="1" value={form.question_count ?? ""} onChange={(e) => setF("question_count", e.target.value)} style={inputStyle} placeholder="e.g. 10" />
          </div>
          <div>
            <FieldLabel>DURATION (mins)</FieldLabel>
            <input type="number" min="1" value={form.duration_mins ?? ""} onChange={(e) => setF("duration_mins", e.target.value)} style={inputStyle} placeholder="e.g. 30" />
          </div>
        </div>

        <div>
          <FieldLabel>TAGS (comma-separated)</FieldLabel>
          <input value={form.tags ?? ""} onChange={(e) => setF("tags", e.target.value)} style={inputStyle} placeholder="e.g. Leadership, Strategy, Module 1" />
        </div>

        <div>
          <FieldLabel>ATTACH FILE (optional)</FieldLabel>
          {!file ? (
            <div
              onClick={() => inputRef.current?.click()}
              style={{ border: `1.5px dashed ${BORDER}`, borderRadius: 10, padding: "16px", textAlign: "center", cursor: "pointer", background: BG }}
            >
              <input ref={inputRef} type="file" style={{ display: "none" }}
                onChange={(e) => { const f = e.target.files?.[0]; if (f) setFile(f); }}
              />
              <div style={{ fontSize: 20, opacity: 0.3, marginBottom: 4 }}>📎</div>
              <div style={{ fontSize: 11, color: MUTED }}>Click to attach file</div>
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
        
        {assetType === "video" && (
          <div>
            <FieldLabel>OR VIDEO URL (e.g. YouTube/Vimeo)</FieldLabel>
            <input value={form.video_url ?? ""} onChange={(e) => setF("video_url", e.target.value)} style={inputStyle} placeholder="https://youtube.com/..." />
          </div>
        )}

        {error && <div style={{ fontSize: 11, color: "#ef4444" }}>{error}</div>}
      </div>

      <div style={{ padding: "12px 20px", borderTop: `1px solid ${BORDER}`, display: "flex", gap: 8, justifyContent: "flex-end" }}>
        <button onClick={onClose} style={btnSecStyle}>Cancel</button>
        <button
          onClick={handleCreate}
          disabled={!form.title?.trim() || saving}
          style={{ ...btnPrimStyle, background: form.title?.trim() && !saving ? ORANGE : "#C9BFA8", cursor: form.title?.trim() && !saving ? "pointer" : "default" }}
        >
          {saving ? "Creating…" : "Create Asset"}
        </button>
      </div>
    </ModalShell>
  );
}
