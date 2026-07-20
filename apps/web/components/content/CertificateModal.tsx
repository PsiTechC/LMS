"use client";

import { useState, useRef } from "react";
import { contentApi, AssetDTO, CertificateConfig } from "@/lib/content-api";
import { ModalShell, FieldLabel, inputStyle, btnPrimStyle, btnSecStyle, NAVY, MUTED, ORANGE, BORDER } from "./shared";

const CERT_TYPES = ["Completion", "Participation", "Excellence", "Custom"];
const LAYOUTS = ["Classic", "Modern", "Minimal", "Premium"] as const;
const TRIGGERS = ["Auto on Completion", "Manual", "Score-based", "Attendance-based"];
const VALIDITIES = ["No Expiry", "1 Year", "2 Years", "3 Years"];

const selStyle: React.CSSProperties = { ...inputStyle, background: "#fff" };

type Layout = typeof LAYOUTS[number];

const LAYOUT_STYLES: Record<Layout, { border: string; bg: string; accent: string; font: string; dark?: boolean }> = {
  Classic: { border: "4px double #c9a84c", bg: "#fffdf5", accent: "#c9a84c", font: "Georgia, serif" },
  Modern:  { border: `3px solid ${NAVY}`, bg: "#f8f9ff", accent: NAVY, font: "'Poppins', sans-serif" },
  Minimal: { border: `1px solid ${BORDER}`, bg: "#fff", accent: ORANGE, font: "'Poppins', sans-serif" },
  Premium: { border: "none", bg: NAVY, accent: ORANGE, font: "Georgia, serif", dark: true },
};

function CertPreview({ form, title }: { form: CertificateConfig; title: string }) {
  const l = LAYOUT_STYLES[(form.layout as Layout) || "Classic"] ?? LAYOUT_STYLES.Classic;
  const textColor = l.dark ? "#fff" : NAVY;
  const subColor = l.dark ? "rgba(255,255,255,0.6)" : MUTED;
  const certTitle = title || "Certificate of Completion";
  const certType = form.cert_type || "Completion";
  const authority = form.authority || "XA Learning";
  const sigName = form.sig_name || "Program Director";
  const sigTitle = form.sig_title || "Head of Learning";

  return (
    <div style={{ border: l.border, borderRadius: 10, background: l.bg, padding: "14px 12px", fontFamily: l.font, textAlign: "center", boxShadow: "0 2px 12px rgba(24, 40, 72,0.10)", position: "relative", overflow: "hidden", minHeight: 200 }}>
      <div style={{ position: "relative", zIndex: 1 }}>
        <div style={{ fontSize: 20, marginBottom: 4 }}>{certType === "Excellence" ? "🏅" : certType === "Participation" ? "📋" : "🏆"}</div>
        <div style={{ fontSize: 8, fontWeight: 700, color: l.accent, letterSpacing: 1.5, marginBottom: 4 }}>THIS IS TO CERTIFY THAT</div>
        <div style={{ fontSize: 11, fontWeight: 700, color: subColor, fontStyle: "italic", marginBottom: 6, borderBottom: `1px solid ${l.dark ? "rgba(255,255,255,0.15)" : l.accent + "40"}`, paddingBottom: 6 }}>Participant Name</div>
        <div style={{ fontSize: 8, color: subColor, marginBottom: 3 }}>has successfully completed</div>
        <div style={{ fontSize: 9, fontWeight: 700, color: textColor, lineHeight: 1.4, marginBottom: 6, minHeight: 24 }}>{certTitle.length > 40 ? certTitle.slice(0, 40) + "…" : certTitle}</div>
        <div style={{ fontSize: 7, color: l.accent, fontWeight: 700, letterSpacing: 0.5, marginBottom: 8 }}>CERTIFICATE OF {certType.toUpperCase()}</div>
        <div style={{ display: "flex", justifyContent: "space-between", borderTop: `1px solid ${l.dark ? "rgba(255,255,255,0.1)" : l.accent + "30"}`, paddingTop: 8, marginTop: 4 }}>
          <div style={{ textAlign: "left" }}>
            <div style={{ fontSize: 7, fontWeight: 700, color: textColor }}>{sigName}</div>
            <div style={{ fontSize: 6, color: subColor }}>{sigTitle}</div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 7, fontWeight: 700, color: textColor }}>{authority.split("·")[0].trim()}</div>
            <div style={{ fontSize: 6, color: subColor }}>Issuing Authority</div>
          </div>
        </div>
      </div>
    </div>
  );
}

function CustomCertUpload({ file, onFile, onRemove }: { file: File | null; onFile: (f: File) => void; onRemove: () => void }) {
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const previewUrl = file && file.type.startsWith("image/") ? URL.createObjectURL(file) : null;

  if (file) {
    return (
      <div style={{ border: "1px solid rgba(245,158,11,0.3)", borderRadius: 10, overflow: "hidden", position: "relative" }}>
        {previewUrl ? (
          <img src={previewUrl} alt="cert design" style={{ width: "100%", display: "block", borderRadius: 10 }} />
        ) : (
          <div style={{ background: "rgba(245,158,11,0.06)", borderRadius: 10, padding: "20px 12px", textAlign: "center" }}>
            <div style={{ fontSize: 22, marginBottom: 6 }}>📄</div>
            <div style={{ fontSize: 10, fontWeight: 700, color: "#f59e0b", marginBottom: 3 }}>PDF Uploaded</div>
            <div style={{ fontSize: 9, color: MUTED, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{file.name}</div>
          </div>
        )}
        <button onClick={onRemove} style={{ position: "absolute", top: 5, right: 5, width: 20, height: 20, borderRadius: "50%", background: "rgba(24, 40, 72,0.7)", border: "none", color: "#fff", fontSize: 10, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>✕</button>
      </div>
    );
  }

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => { e.preventDefault(); setDragging(false); const f = e.dataTransfer.files[0]; if (f) onFile(f); }}
      onClick={() => inputRef.current?.click()}
      style={{ border: `2px dashed ${dragging ? "#f59e0b" : "#C9BFA8"}`, borderRadius: 10, padding: "20px 10px", textAlign: "center", cursor: "pointer", background: dragging ? "rgba(245,158,11,0.04)" : "#FAFBFC", transition: "all 0.15s", minHeight: 140, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 6 }}
    >
      <div style={{ fontSize: 24, opacity: 0.5 }}>🎨</div>
      <div style={{ fontSize: 10, fontWeight: 700, color: NAVY }}>Upload Custom Design</div>
      <div style={{ fontSize: 9, color: MUTED, lineHeight: 1.5 }}>PNG, JPG or PDF<br />Drag & drop or click</div>
      <div style={{ fontSize: 8, color: "#f59e0b", fontWeight: 600, marginTop: 4 }}>Recommended: 1200×850px</div>
      <input ref={inputRef} type="file" accept="image/*,.pdf" style={{ display: "none" }} onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); }} />
    </div>
  );
}

export default function CertificateModal({ orgId, onClose, onSuccess }: {
  orgId: string;
  onClose: () => void;
  onSuccess: (a: AssetDTO) => void;
}) {
  const [title, setTitle] = useState("");
  const [cf, setCf] = useState<CertificateConfig>({
    cert_type: "Completion", authority: "", sig_name: "", sig_title: "",
    trigger: "Auto on Completion", validity: "No Expiry", layout: "Classic",
  });
  const [passingScore, setPassingScore] = useState("80");
  const [designFile, setDesignFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  function setCF<K extends keyof CertificateConfig>(k: K, v: CertificateConfig[K]) {
    setCf((p) => ({ ...p, [k]: v }));
  }

  async function handleSave() {
    if (!title.trim()) return;
    setSaving(true);
    setError("");
    try {
      const config: CertificateConfig = {
        ...cf,
        passing_score: cf.trigger === "Score-based" ? parseInt(passingScore) || undefined : undefined,
      };
      const res = await contentApi.create(orgId, {
        title,
        asset_type: "certificate",
        certificate: config,
        file: designFile ?? undefined,
      });
      onSuccess(res.data);
    } catch (e: unknown) {
      setError((e as Error).message ?? "Failed to save certificate");
      setSaving(false);
    }
  }

  return (
    <ModalShell title="Configure Certificate" onClose={onClose} maxWidth={760}>
      <div style={{ padding: "16px 20px", display: "flex", flexDirection: "column", gap: 12, overflowY: "auto", flex: 1 }}>
        <div>
          <FieldLabel>TITLE *</FieldLabel>
          <input value={title} onChange={(e) => setTitle(e.target.value)} style={inputStyle} placeholder="e.g. Certificate of Completion - Leadership Accelerator" />
        </div>

        <div style={{ display: "flex", gap: 14 }}>
          <div style={{ flex: 1, background: "rgba(245,158,11,0.04)", border: "1px solid rgba(245,158,11,0.2)", borderRadius: 10, padding: "12px 14px", display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#f59e0b", marginBottom: 2 }}>🏆 Certificate Settings</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              <div>
                <FieldLabel>CERTIFICATE TYPE</FieldLabel>
                <select value={cf.cert_type} onChange={(e) => setCF("cert_type", e.target.value)} style={selStyle}>
                  {CERT_TYPES.map((o) => <option key={o} value={o}>{o}</option>)}
                </select>
              </div>
              <div>
                <FieldLabel>LAYOUT TEMPLATE</FieldLabel>
                <select value={cf.layout} onChange={(e) => setCF("layout", e.target.value)} style={selStyle}>
                  {LAYOUTS.map((o) => <option key={o} value={o}>{o}</option>)}
                </select>
              </div>
            </div>
            <div>
              <FieldLabel>ISSUING AUTHORITY</FieldLabel>
              <input value={cf.authority} onChange={(e) => setCF("authority", e.target.value)} placeholder="e.g. fourward · XA Learning" style={selStyle} />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              <div>
                <FieldLabel>SIGNATORY NAME</FieldLabel>
                <input value={cf.sig_name} onChange={(e) => setCF("sig_name", e.target.value)} placeholder="e.g. Sanjay Gupta" style={selStyle} />
              </div>
              <div>
                <FieldLabel>SIGNATORY TITLE</FieldLabel>
                <input value={cf.sig_title} onChange={(e) => setCF("sig_title", e.target.value)} placeholder="e.g. Director of Learning" style={selStyle} />
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              <div>
                <FieldLabel>ISSUE TRIGGER</FieldLabel>
                <select value={cf.trigger} onChange={(e) => setCF("trigger", e.target.value)} style={selStyle}>
                  {TRIGGERS.map((o) => <option key={o} value={o}>{o}</option>)}
                </select>
              </div>
              <div>
                <FieldLabel>VALIDITY PERIOD</FieldLabel>
                <select value={cf.validity} onChange={(e) => setCF("validity", e.target.value)} style={selStyle}>
                  {VALIDITIES.map((o) => <option key={o} value={o}>{o}</option>)}
                </select>
              </div>
            </div>
            {cf.trigger === "Score-based" && (
              <div>
                <FieldLabel>PASSING SCORE (%)</FieldLabel>
                <input type="number" min={1} max={100} value={passingScore} onChange={(e) => setPassingScore(e.target.value)} style={{ ...selStyle, width: 90 }} />
              </div>
            )}
          </div>

          <div style={{ width: 220, flexShrink: 0, display: "flex", flexDirection: "column", gap: 8 }}>
            <FieldLabel>PREVIEW</FieldLabel>
            {!designFile && <CertPreview form={cf} title={title} />}
            <div style={{ marginTop: designFile ? 0 : 8 }}>
              <FieldLabel>CUSTOM DESIGN</FieldLabel>
              <CustomCertUpload file={designFile} onFile={setDesignFile} onRemove={() => setDesignFile(null)} />
            </div>
          </div>
        </div>
        {error && <div style={{ fontSize: 11, color: "#ef4444" }}>{error}</div>}
      </div>
      <div style={{ padding: "12px 20px", borderTop: `1px solid ${BORDER}`, display: "flex", gap: 8, justifyContent: "flex-end" }}>
        <button onClick={onClose} style={btnSecStyle}>Cancel</button>
        <button
          onClick={handleSave}
          disabled={!title.trim() || saving}
          style={{ ...btnPrimStyle, background: title.trim() && !saving ? ORANGE : "#C9BFA8", cursor: title.trim() && !saving ? "pointer" : "default" }}
        >
          {saving ? "Saving…" : "Create Asset"}
        </button>
      </div>
    </ModalShell>
  );
}
