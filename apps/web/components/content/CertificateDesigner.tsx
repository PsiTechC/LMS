"use client";

import { useRef, useState } from "react";
import ReactDOM from "react-dom";
import { contentApi, AssetDTO, CertificateConfig, CertificatePlacement, CertificateFieldKey, CertificateCustomText } from "@/lib/content-api";
import { NAVY, ORANGE, MUTED, BORDER, inputStyle, FieldLabel, btnPrimStyle, btnSecStyle, uid } from "./shared";

// CertificateDesigner is a full-viewport takeover (fixed inset:0), not a
// ModalShell - the first exception to this app's modal-only authoring
// convention (see apps/CLAUDE.md), deliberately scoped this way rather than
// as a new route: a drag-and-drop canvas needs real screen space a
// 380-760px centered dialog can't give it. Ported from a reference
// certificate editor's proven mechanics (percent-based absolute positioning,
// manual Pointer Events drag, no canvas/drag library needed) adapted to
// this app's domain (program completion, not a video/course) and design
// tokens.

const FIELD_META: { key: CertificateFieldKey; label: string; defaultPlacement: CertificatePlacement }[] = [
  { key: "name", label: "Participant Name", defaultPlacement: { x: 50, y: 45, font_size: 48, color: "#182848", font_family: "serif", italic: true } },
  { key: "program_title", label: "Program Title", defaultPlacement: { x: 50, y: 58, font_size: 24, color: "#4A5573" } },
  { key: "date", label: "Completion Date", defaultPlacement: { x: 50, y: 68, font_size: 16, color: "#4A5573" } },
  { key: "email", label: "Email", defaultPlacement: { x: 50, y: 74, font_size: 12, color: "#8b90a7" } },
  { key: "score", label: "Score", defaultPlacement: { x: 50, y: 80, font_size: 14, color: "#4A5573" } },
];

const FONT_OPTIONS = [
  { value: "sans", label: "Poppins (Sans)" },
  { value: "serif", label: "Playfair (Serif)" },
];

type DragTarget =
  | { type: "field"; key: CertificateFieldKey }
  | { type: "custom"; id: string }
  | { type: "logo"; index: number };

export default function CertificateDesigner({ orgId, initialTitle, initialConfig, onClose, onSuccess }: {
  orgId: string;
  initialTitle?: string;
  initialConfig?: CertificateConfig;
  onClose: () => void;
  onSuccess: (a: AssetDTO) => void;
}) {
  const [title, setTitle] = useState(initialTitle ?? "");
  const [bgFile, setBgFile] = useState<File | null>(null);
  const [bgPreviewUrl, setBgPreviewUrl] = useState<string | null>(null);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreviewUrl, setLogoPreviewUrl] = useState<string | null>(null);

  const [fontFamily, setFontFamily] = useState(initialConfig?.placements?.font_family ?? "sans");
  const [fields, setFields] = useState<Partial<Record<CertificateFieldKey, CertificatePlacement>>>(
    initialConfig?.placements?.fields ?? { name: FIELD_META[0].defaultPlacement, program_title: FIELD_META[1].defaultPlacement, date: FIELD_META[2].defaultPlacement }
  );
  const [customTexts, setCustomTexts] = useState<CertificateCustomText[]>(initialConfig?.placements?.custom_texts ?? []);
  const [logoCopies, setLogoCopies] = useState<{ x: number; y: number; w: number }[]>(initialConfig?.placements?.logo_copies ?? []);

  const [selected, setSelected] = useState<DragTarget | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const canvasRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ target: DragTarget } | null>(null);
  const bgInputRef = useRef<HTMLInputElement>(null);
  const logoInputRef = useRef<HTMLInputElement>(null);

  function handleBgFile(f: File) {
    setBgFile(f);
    setBgPreviewUrl(URL.createObjectURL(f));
  }
  function handleLogoFile(f: File) {
    setLogoFile(f);
    setLogoPreviewUrl(URL.createObjectURL(f));
    if (logoCopies.length === 0) {
      setLogoCopies([{ x: 12, y: 12, w: 10 }]);
    }
  }

  function toggleField(key: CertificateFieldKey) {
    setFields((prev) => {
      const next = { ...prev };
      if (next[key]) {
        delete next[key];
      } else {
        next[key] = FIELD_META.find((f) => f.key === key)!.defaultPlacement;
      }
      return next;
    });
  }

  function updatePlacement(target: DragTarget, patch: Partial<CertificatePlacement>) {
    if (target.type === "field") {
      setFields((prev) => ({ ...prev, [target.key]: { ...prev[target.key]!, ...patch } }));
    } else if (target.type === "custom") {
      setCustomTexts((prev) => prev.map((t) => (t.id === target.id ? { ...t, ...patch } : t)));
    }
  }

  function pointerToPercent(clientX: number, clientY: number): { x: number; y: number } {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return { x: 50, y: 50 };
    const x = Math.min(100, Math.max(0, ((clientX - rect.left) / rect.width) * 100));
    const y = Math.min(100, Math.max(0, ((clientY - rect.top) / rect.height) * 100));
    return { x, y };
  }

  function onPointerDown(e: React.PointerEvent, target: DragTarget) {
    e.stopPropagation();
    (e.target as Element).setPointerCapture(e.pointerId);
    dragRef.current = { target };
    setSelected(target);
  }
  function onPointerMove(e: React.PointerEvent) {
    if (!dragRef.current) return;
    const { x, y } = pointerToPercent(e.clientX, e.clientY);
    const target = dragRef.current.target;
    if (target.type === "field") {
      updatePlacement(target, { x, y });
    } else if (target.type === "custom") {
      updatePlacement(target, { x, y });
    } else if (target.type === "logo") {
      setLogoCopies((prev) => prev.map((lc, i) => (i === target.index ? { ...lc, x, y } : lc)));
    }
  }
  function onPointerUp() {
    dragRef.current = null;
  }

  function addCustomText() {
    const t: CertificateCustomText = { id: uid(), text: "Signature", x: 50, y: 90, font_size: 12, color: "#4A5573" };
    setCustomTexts((prev) => [...prev, t]);
    setSelected({ type: "custom", id: t.id });
  }
  function removeCustomText(id: string) {
    setCustomTexts((prev) => prev.filter((t) => t.id !== id));
    if (selected?.type === "custom" && selected.id === id) setSelected(null);
  }

  function addLogoCopy() {
    if (logoCopies.length >= 4) return;
    setLogoCopies((prev) => [...prev, { x: 50, y: 12, w: 10 }]);
  }
  function removeLogoCopy(index: number) {
    setLogoCopies((prev) => prev.filter((_, i) => i !== index));
    if (selected?.type === "logo" && selected.index === index) setSelected(null);
  }

  async function handleSave() {
    if (!title.trim()) return;
    setSaving(true);
    setError("");
    try {
      const config: CertificateConfig = {
        cert_type: "Completion",
        authority: "",
        sig_name: "",
        sig_title: "",
        trigger: "Auto on Completion",
        validity: "No Expiry",
        layout: "Custom",
        placements: {
          font_family: fontFamily,
          fields,
          logo_copies: logoCopies.length > 0 ? logoCopies : undefined,
          custom_texts: customTexts.length > 0 ? customTexts : undefined,
        },
      };
      const res = await contentApi.create(orgId, { title, asset_type: "certificate", certificate: config, file: bgFile ?? undefined });
      onSuccess(res.data);
    } catch (e: unknown) {
      setError((e as Error).message ?? "Failed to save certificate");
      setSaving(false);
    }
  }

  const selectedPlacement: CertificatePlacement | null =
    selected?.type === "field" ? fields[selected.key] ?? null :
    selected?.type === "custom" ? customTexts.find((t) => t.id === selected.id) ?? null :
    null;

  if (typeof document === "undefined") return null;

  return ReactDOM.createPortal(
    <div style={{ position: "fixed", inset: 0, zIndex: 4500, background: "#F7F5F0", display: "flex", flexDirection: "column", fontFamily: "Poppins, sans-serif" }}>
      {/* Top bar */}
      <div style={{ height: 60, borderBottom: `1px solid ${BORDER}`, background: "#fff", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 24px", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <span style={{ fontSize: 17, fontWeight: 700, color: NAVY }}>Design Certificate</span>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Certificate title *"
            style={{ ...inputStyle, width: 320 }}
          />
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {error && <span style={{ fontSize: 11, color: "#ef4444" }}>{error}</span>}
          <button onClick={onClose} style={btnSecStyle}>Cancel</button>
          <button
            onClick={handleSave}
            disabled={!title.trim() || saving}
            style={{ ...btnPrimStyle, background: title.trim() && !saving ? ORANGE : "#C9BFA8", cursor: title.trim() && !saving ? "pointer" : "default" }}
          >
            {saving ? "Saving…" : "Save Template"}
          </button>
        </div>
      </div>

      <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
        {/* Left rail - fields */}
        <div style={{ width: 240, borderRight: `1px solid ${BORDER}`, background: "#fff", padding: 16, overflowY: "auto", flexShrink: 0 }}>
          <FieldLabel>FIELDS</FieldLabel>
          {FIELD_META.map((f) => (
            <label key={f.key} style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 0", fontSize: 12, color: NAVY, cursor: "pointer" }}>
              <input type="checkbox" checked={!!fields[f.key]} onChange={() => toggleField(f.key)} />
              {f.label}
            </label>
          ))}

          <div style={{ marginTop: 16 }}>
            <FieldLabel>DEFAULT FONT</FieldLabel>
            <select value={fontFamily} onChange={(e) => setFontFamily(e.target.value)} style={inputStyle}>
              {FONT_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>

          <div style={{ marginTop: 16 }}>
            <FieldLabel>CUSTOM TEXT</FieldLabel>
            <button onClick={addCustomText} style={{ ...btnSecStyle, width: "100%", justifyContent: "center" }} disabled={customTexts.length >= 20}>
              + Add Text
            </button>
            {customTexts.map((t) => (
              <div key={t.id} style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 6 }}>
                <button
                  onClick={() => setSelected({ type: "custom", id: t.id })}
                  style={{ ...inputStyle, flex: 1, textAlign: "left", cursor: "pointer", background: selected?.type === "custom" && selected.id === t.id ? "#F5F7FB" : "#fff" }}
                >
                  {t.text || "(empty)"}
                </button>
                <button onClick={() => removeCustomText(t.id)} style={{ border: "none", background: "none", color: MUTED, cursor: "pointer" }}>✕</button>
              </div>
            ))}
          </div>

          <div style={{ marginTop: 16 }}>
            <FieldLabel>LOGO</FieldLabel>
            {!logoFile ? (
              <button onClick={() => logoInputRef.current?.click()} style={{ ...btnSecStyle, width: "100%", justifyContent: "center" }}>
                Upload Logo
              </button>
            ) : (
              <>
                <button onClick={addLogoCopy} style={{ ...btnSecStyle, width: "100%", justifyContent: "center" }} disabled={logoCopies.length >= 4}>
                  + Add Copy ({logoCopies.length}/4)
                </button>
                {logoCopies.map((lc, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 6 }}>
                    <button
                      onClick={() => setSelected({ type: "logo", index: i })}
                      style={{ ...inputStyle, flex: 1, textAlign: "left", cursor: "pointer", background: selected?.type === "logo" && selected.index === i ? "#F5F7FB" : "#fff" }}
                    >
                      Logo copy {i + 1}
                    </button>
                    <button onClick={() => removeLogoCopy(i)} style={{ border: "none", background: "none", color: MUTED, cursor: "pointer" }}>✕</button>
                  </div>
                ))}
              </>
            )}
            <input ref={logoInputRef} type="file" accept="image/*" style={{ display: "none" }} onChange={(e) => { const f = e.target.files?.[0]; if (f) handleLogoFile(f); }} />
          </div>
        </div>

        {/* Center - canvas */}
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: 32, overflow: "auto" }}>
          <div
            ref={canvasRef}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onClick={() => setSelected(null)}
            style={{
              position: "relative", width: "100%", maxWidth: 900, aspectRatio: "4 / 3",
              background: bgPreviewUrl ? `#fff url(${bgPreviewUrl}) center/contain no-repeat` : "#fff",
              border: `1px solid ${BORDER}`, borderRadius: 12, boxShadow: "0 1px 4px rgba(24,40,72,0.07)",
              overflow: "hidden", cursor: "default",
            }}
          >
            {!bgPreviewUrl && (
              <div
                onClick={(e) => { e.stopPropagation(); bgInputRef.current?.click(); }}
                style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 8, cursor: "pointer", color: MUTED }}
              >
                <div style={{ fontSize: 32 }}>🎨</div>
                <div style={{ fontSize: 12, fontWeight: 700 }}>Upload Background</div>
                <div style={{ fontSize: 10 }}>PNG or JPG · click to browse</div>
              </div>
            )}
            <input ref={bgInputRef} type="file" accept="image/png,image/jpeg" style={{ display: "none" }} onChange={(e) => { const f = e.target.files?.[0]; if (f) handleBgFile(f); }} />

            {FIELD_META.filter((f) => fields[f.key]).map((f) => {
              const p = fields[f.key]!;
              const isSelected = selected?.type === "field" && selected.key === f.key;
              return (
                <div
                  key={f.key}
                  onPointerDown={(e) => onPointerDown(e, { type: "field", key: f.key })}
                  style={{
                    position: "absolute", left: `${p.x}%`, top: `${p.y}%`, transform: "translate(-50%,-50%)",
                    fontSize: p.font_size / 3, color: p.color, fontFamily: (p.font_family ?? fontFamily) === "serif" ? "Georgia, serif" : "Poppins, sans-serif",
                    fontWeight: p.bold ? 700 : 400, fontStyle: p.italic ? "italic" : "normal",
                    padding: "2px 6px", border: isSelected ? `1px dashed ${ORANGE}` : "1px dashed transparent",
                    cursor: "grab", whiteSpace: "nowrap", userSelect: "none",
                  }}
                >
                  {f.label}
                </div>
              );
            })}

            {customTexts.map((t) => {
              const isSelected = selected?.type === "custom" && selected.id === t.id;
              return (
                <div
                  key={t.id}
                  onPointerDown={(e) => onPointerDown(e, { type: "custom", id: t.id })}
                  style={{
                    position: "absolute", left: `${t.x}%`, top: `${t.y}%`, transform: "translate(-50%,-50%)",
                    fontSize: t.font_size / 3, color: t.color, fontFamily: (t.font_family ?? fontFamily) === "serif" ? "Georgia, serif" : "Poppins, sans-serif",
                    fontWeight: t.bold ? 700 : 400, fontStyle: t.italic ? "italic" : "normal",
                    padding: "2px 6px", border: isSelected ? `1px dashed ${ORANGE}` : "1px dashed transparent",
                    cursor: "grab", whiteSpace: "nowrap", userSelect: "none",
                  }}
                >
                  {t.text}
                </div>
              );
            })}

            {logoPreviewUrl && logoCopies.map((lc, i) => {
              const isSelected = selected?.type === "logo" && selected.index === i;
              return (
                <img
                  key={i}
                  src={logoPreviewUrl}
                  onPointerDown={(e) => onPointerDown(e, { type: "logo", index: i })}
                  style={{
                    position: "absolute", left: `${lc.x}%`, top: `${lc.y}%`, width: `${lc.w}%`,
                    transform: "translate(-50%,-50%)", border: isSelected ? `1px dashed ${ORANGE}` : "1px dashed transparent",
                    cursor: "grab",
                  }}
                  alt="logo"
                />
              );
            })}
          </div>
        </div>

        {/* Right rail - style controls for selection */}
        <div style={{ width: 240, borderLeft: `1px solid ${BORDER}`, background: "#fff", padding: 16, overflowY: "auto", flexShrink: 0 }}>
          <FieldLabel>STYLE</FieldLabel>
          {!selected && <div style={{ fontSize: 11, color: MUTED, marginTop: 8 }}>Select an element on the canvas to edit its style.</div>}

          {selected?.type === "logo" && (
            <div style={{ marginTop: 8 }}>
              <FieldLabel>WIDTH (%)</FieldLabel>
              <input
                type="number" min={2} max={40}
                value={logoCopies[selected.index]?.w ?? 10}
                onChange={(e) => {
                  const w = Math.min(40, Math.max(2, +e.target.value || 10));
                  setLogoCopies((prev) => prev.map((lc, i) => (i === selected.index ? { ...lc, w } : lc)));
                }}
                style={inputStyle}
              />
            </div>
          )}

          {selectedPlacement && (
            <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 8 }}>
              {selected?.type === "custom" && (
                <div>
                  <FieldLabel>TEXT</FieldLabel>
                  <input
                    value={customTexts.find((t) => t.id === selected.id)?.text ?? ""}
                    onChange={(e) => {
                      const text = e.target.value;
                      setCustomTexts((prev) => prev.map((t) => (t.id === selected.id ? { ...t, text } : t)));
                    }}
                    style={inputStyle}
                  />
                </div>
              )}
              <div>
                <FieldLabel>FONT</FieldLabel>
                <select
                  value={selectedPlacement.font_family ?? fontFamily}
                  onChange={(e) => selected && updatePlacement(selected, { font_family: e.target.value })}
                  style={inputStyle}
                >
                  {FONT_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
              <div>
                <FieldLabel>SIZE (PX)</FieldLabel>
                <input
                  type="number" min={8} max={120}
                  value={selectedPlacement.font_size}
                  onChange={(e) => selected && updatePlacement(selected, { font_size: Math.min(120, Math.max(8, +e.target.value || 16)) })}
                  style={inputStyle}
                />
              </div>
              <div>
                <FieldLabel>COLOR</FieldLabel>
                <input
                  type="color"
                  value={selectedPlacement.color}
                  onChange={(e) => selected && updatePlacement(selected, { color: e.target.value })}
                  style={{ ...inputStyle, padding: 2, height: 32 }}
                />
              </div>
              <div style={{ display: "flex", gap: 12 }}>
                <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: NAVY, cursor: "pointer" }}>
                  <input
                    type="checkbox"
                    checked={!!selectedPlacement.bold}
                    onChange={(e) => selected && updatePlacement(selected, { bold: e.target.checked })}
                  />
                  Bold
                </label>
                <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: NAVY, cursor: "pointer" }}>
                  <input
                    type="checkbox"
                    checked={!!selectedPlacement.italic}
                    onChange={(e) => selected && updatePlacement(selected, { italic: e.target.checked })}
                  />
                  Italic
                </label>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
