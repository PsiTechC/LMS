"use client";

import { useState, useRef } from "react";
import { contentApi, AssetDTO } from "@/lib/content-api";
import { ModalShell, FieldLabel, inputStyle, btnPrimStyle, btnSecStyle, fmtBytes, ORANGE, GREEN, BG, BORDER, NAVY, MUTED } from "./shared";

// Upload-only creation flow for asset types that are just a file: video, elearning.
export default function UploadOnlyModal({ orgId, assetType, onClose, onBack, onSuccess }: {
  orgId: string;
  assetType: string;
  onClose: () => void;
  onBack?: () => void;
  onSuccess: (a: AssetDTO) => void;
}) {
  const [dragging, setDragging] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const accept = assetType === "video" ? "video/*,.mp4,.mov,.avi" : ".zip,.scorm,.pdf,.pptx,.ppt";
  const hint = assetType === "video" ? "MP4, MOV, AVI" : "SCORM (.zip), PDF, PowerPoint";

  function onFile(f: File) {
    setFile(f);
    setTitle((t) => t || f.name.replace(/\.[^/.]+$/, "").replace(/[-_]/g, " "));
    setError("");
  }

  async function handleSave() {
    if (!file || !title.trim()) return;
    setSaving(true);
    setError("");
    try {
      const res = await contentApi.create(orgId, { title, asset_type: assetType, file });
      setSaved(true);
      setTimeout(() => onSuccess(res.data), 900);
    } catch (e: unknown) {
      setError((e as Error).message ?? "Upload failed");
      setSaving(false);
    }
  }

  return (
    <ModalShell title={assetType === "video" ? "Upload Video" : "Upload eLearning Package"} onClose={onClose} maxWidth={480}>
      <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 14 }}>
        {!file ? (
          <div
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => { e.preventDefault(); setDragging(false); const f = e.dataTransfer.files[0]; if (f) onFile(f); }}
            onClick={() => inputRef.current?.click()}
            style={{
              border: `2px dashed ${dragging ? ORANGE : "#C9BFA8"}`,
              borderRadius: 12, padding: "40px 20px", textAlign: "center",
              background: dragging ? "rgba(200, 168, 96,0.04)" : BG,
              cursor: "pointer", transition: "all 0.15s",
            }}
          >
            <input ref={inputRef} type="file" style={{ display: "none" }}
              accept={accept}
              onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); }}
            />
            <div style={{ fontSize: 32, marginBottom: 10, opacity: 0.4 }}>{assetType === "video" ? "▶" : "📁"}</div>
            <div style={{ fontSize: 13, fontWeight: 700, color: NAVY, marginBottom: 4 }}>Click or drag & drop to upload</div>
            <div style={{ fontSize: 11, color: MUTED }}>{hint}</div>
            <div style={{ fontSize: 10, color: MUTED, marginTop: 8 }}>Max file size: 500 MB</div>
          </div>
        ) : (
          <>
            <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", background: "rgba(34,197,94,0.06)", border: "1px solid rgba(34,197,94,0.2)", borderRadius: 10 }}>
              <div style={{ fontSize: 24 }}>📄</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: NAVY }}>{file.name}</div>
                <div style={{ fontSize: 11, color: MUTED }}>{fmtBytes(file.size)}</div>
              </div>
              <button onClick={() => setFile(null)} style={{ fontSize: 12, color: ORANGE, border: "none", background: "none", cursor: "pointer", fontFamily: "Poppins, sans-serif" }}>Remove</button>
            </div>
            <div>
              <FieldLabel>TITLE</FieldLabel>
              <input value={title} onChange={(e) => setTitle(e.target.value)} style={inputStyle} placeholder="Asset title" />
            </div>
            {error && <div style={{ fontSize: 11, color: "#ef4444" }}>{error}</div>}
          </>
        )}
      </div>
      <div style={{ padding: "12px 20px", borderTop: `1px solid ${BORDER}`, display: "flex", gap: 8, justifyContent: onBack ? "space-between" : "flex-end" }}>
        {onBack && <button onClick={onBack} style={btnSecStyle}>← Back</button>}
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={onClose} style={btnSecStyle}>Cancel</button>
          <button
            onClick={handleSave}
            disabled={!file || !title.trim() || saving || saved}
            style={{ ...btnPrimStyle, background: saved ? GREEN : (!file || !title.trim() || saving) ? "#C9BFA8" : ORANGE, cursor: (!file || !title.trim() || saving) ? "default" : "pointer" }}
          >
            {saved ? "✓ Uploaded!" : saving ? "Uploading…" : "Upload & Save"}
          </button>
        </div>
      </div>
    </ModalShell>
  );
}
