"use client";

import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { createPortal } from "react-dom";
import {
  coachApi,
  uploadCoachDocument,
  downloadCoachDocument,
  openCoachDocument,
  type CoachDocumentDTO,
  type CoachingEngagementDTO,
} from "@/lib/coach-api";

// ── Design tokens ─────────────────────────────────────────────────
const ff = { fontFamily: "Poppins, sans-serif" } as const;
const NAVY = "#1C2551";
const COACH = "#0891B2";
const CARD = "#fff";
const BORDER = "#EAECF4";
const PAGE = "#F5F7FB";
const MUTED = "#8b90a7";

const TABS = ["All Documents", "Psychometric Reports", "Coachee Documents"] as const;
type Tab = (typeof TABS)[number];

function shortDate(iso: string): string {
  return new Date(iso).toLocaleDateString([], { month: "short", day: "numeric" });
}
function typeBadge(t: string): string {
  if (t === "report") return "REPORT";
  return t.toUpperCase();
}

const microLabel: React.CSSProperties = { ...ff, fontSize: 10, fontWeight: 700, color: MUTED, letterSpacing: 0.5, textTransform: "uppercase", marginBottom: 6, display: "block" };
const inputStyle: React.CSSProperties = { ...ff, width: "100%", border: `1px solid ${BORDER}`, borderRadius: 8, padding: "9px 12px", fontSize: 13, color: NAVY, outline: "none", boxSizing: "border-box", background: CARD };

export default function CoachDocuments() {
  const [docs, setDocs] = useState<CoachDocumentDTO[]>([]);
  const [engagements, setEngagements] = useState<CoachingEngagementDTO[]>([]);
  const [tab, setTab] = useState<Tab>("All Documents");
  const [loading, setLoading] = useState(true);

  // Upload modal state
  const [uploadOpen, setUploadOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ participant_id: "", title: "", doc_type: "report", uploaded_by: "Coach", is_shared: true, coach_summary: "" });
  const [file, setFile] = useState<File | null>(null);

  async function reload() {
    const r = await coachApi.allDocuments();
    setDocs(r.data ?? []);
  }

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      try {
        const [d, e] = await Promise.all([coachApi.allDocuments(), coachApi.engagements()]);
        if (!alive) return;
        setDocs(d.data ?? []);
        setEngagements(e.data ?? []);
      } catch {
        if (alive) setDocs([]);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  // Unique coachees across engagements for the upload dropdown.
  const coachees = useMemo(() => {
    const map = new Map<string, string>();
    for (const e of engagements) for (const p of e.participants) map.set(p.id, p.name);
    return [...map.entries()].map(([id, name]) => ({ id, name }));
  }, [engagements]);

  const filtered = useMemo(() => {
    if (tab === "Psychometric Reports") return docs.filter((d) => d.doc_type === "report");
    if (tab === "Coachee Documents") return docs.filter((d) => d.doc_type !== "report");
    return docs;
  }, [docs, tab]);

  async function submitUpload(e: FormEvent) {
    e.preventDefault();
    if (!form.participant_id || !form.title.trim()) return;
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append("participant_id", form.participant_id);
      fd.append("title", form.title.trim());
      fd.append("doc_type", form.doc_type);
      fd.append("uploaded_by", form.uploaded_by);
      fd.append("is_shared", String(form.is_shared));
      fd.append("coach_summary", form.coach_summary);
      if (file) fd.append("file", file);
      await uploadCoachDocument(fd);
      await reload();
      setUploadOpen(false);
      setForm({ participant_id: "", title: "", doc_type: "report", uploaded_by: "Coach", is_shared: true, coach_summary: "" });
      setFile(null);
    } catch {
      /* keep modal open */
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ padding: 24, display: "flex", flexDirection: "column", gap: 16, height: "100%", overflowY: "auto", background: PAGE }}>
      {/* Tabs + upload */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {TABS.map((t) => {
            const active = tab === t;
            return (
              <button key={t} onClick={() => setTab(t)}
                style={{ ...ff, padding: "8px 18px", borderRadius: 8, fontSize: 12, fontWeight: active ? 700 : 500,
                  border: `1px solid ${active ? COACH : BORDER}`, background: active ? COACH : CARD, color: active ? "#fff" : MUTED, cursor: "pointer" }}>
                {t}
              </button>
            );
          })}
        </div>
        <button onClick={() => setUploadOpen(true)}
          style={{ ...ff, background: COACH, color: "#fff", border: "none", borderRadius: 8, padding: "9px 18px", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
          + Upload Document
        </button>
      </div>

      {loading ? (
        <div style={{ ...ff, fontSize: 13, color: MUTED }}>Loading…</div>
      ) : filtered.length === 0 ? (
        <div style={{ ...ff, fontSize: 13, color: MUTED, background: CARD, border: `1px solid ${BORDER}`, borderRadius: 12, padding: 40, textAlign: "center" }}>
          No documents yet. Use “Upload Document” to add one.
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(400px, 1fr))", gap: 16 }}>
          {filtered.map((d) => <DocCard key={d.id} doc={d} />)}
        </div>
      )}

      {/* Upload modal */}
      {uploadOpen && typeof document !== "undefined" &&
        createPortal(
          <div onClick={() => setUploadOpen(false)} style={{ position: "fixed", inset: 0, background: "rgba(28,37,81,0.5)", zIndex: 2000, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
            <form onClick={(e) => e.stopPropagation()} onSubmit={submitUpload}
              style={{ ...ff, background: CARD, borderRadius: 16, width: 560, maxWidth: "100%", maxHeight: "88vh", overflowY: "auto", boxShadow: "0 24px 64px rgba(28,37,81,0.22)" }}>
              <div style={{ padding: "18px 24px", borderBottom: `1px solid ${BORDER}`, fontSize: 16, fontWeight: 700, color: NAVY }}>Upload Document</div>
              <div style={{ padding: 24, display: "flex", flexDirection: "column", gap: 14 }}>
                <div>
                  <label style={microLabel}>Coachee</label>
                  <select required value={form.participant_id} onChange={(e) => setForm({ ...form, participant_id: e.target.value })} style={inputStyle}>
                    <option value="">Select a coachee…</option>
                    {coachees.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                <div>
                  <label style={microLabel}>Title</label>
                  <input required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="e.g. DISC Profile" style={inputStyle} />
                </div>
                <div style={{ display: "flex", gap: 12 }}>
                  <div style={{ flex: 1 }}>
                    <label style={microLabel}>Type</label>
                    <select value={form.doc_type} onChange={(e) => setForm({ ...form, doc_type: e.target.value })} style={inputStyle}>
                      <option value="report">Report (psychometric)</option>
                      <option value="pdf">PDF</option>
                      <option value="doc">Document</option>
                    </select>
                  </div>
                  <div style={{ flex: 1 }}>
                    <label style={microLabel}>Uploaded by</label>
                    <input value={form.uploaded_by} onChange={(e) => setForm({ ...form, uploaded_by: e.target.value })} placeholder="Coach / BA / SA / Coachee" style={inputStyle} />
                  </div>
                </div>
                <div>
                  <label style={microLabel}>File (optional)</label>
                  <input type="file" onChange={(e) => setFile(e.target.files?.[0] ?? null)} style={{ ...ff, fontSize: 13, color: NAVY }} />
                </div>
                <div>
                  <label style={microLabel}>Coach summary (for reports)</label>
                  <textarea value={form.coach_summary} onChange={(e) => setForm({ ...form, coach_summary: e.target.value })} placeholder="Optional summary shown on the report card"
                    style={{ ...inputStyle, minHeight: 90, resize: "vertical", lineHeight: 1.5 }} />
                </div>
                <label style={{ ...ff, display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: NAVY, cursor: "pointer" }}>
                  <input type="checkbox" checked={form.is_shared} onChange={(e) => setForm({ ...form, is_shared: e.target.checked })} />
                  Shared with coachee
                </label>
              </div>
              <div style={{ padding: "14px 24px", borderTop: `1px solid ${BORDER}`, display: "flex", justifyContent: "flex-end", gap: 10 }}>
                <button type="button" onClick={() => setUploadOpen(false)} style={{ ...ff, background: CARD, border: `1px solid ${BORDER}`, borderRadius: 8, padding: "9px 18px", fontSize: 12, fontWeight: 600, color: NAVY, cursor: "pointer" }}>Cancel</button>
                <button type="submit" disabled={busy || !form.participant_id || !form.title.trim()}
                  style={{ ...ff, background: COACH, color: "#fff", border: "none", borderRadius: 8, padding: "9px 20px", fontSize: 12, fontWeight: 700, cursor: busy ? "not-allowed" : "pointer", opacity: busy || !form.participant_id || !form.title.trim() ? 0.6 : 1 }}>
                  {busy ? "Uploading…" : "Upload"}
                </button>
              </div>
            </form>
          </div>,
          document.body,
        )}
    </div>
  );
}

function DocCard({ doc }: { doc: CoachDocumentDTO }) {
  const isReport = doc.doc_type === "report";
  const badge = typeBadge(doc.doc_type);
  async function handleAction() {
    try {
      if (doc.has_file) {
        if (isReport) await openCoachDocument(doc.id);
        else await downloadCoachDocument(doc.id, doc.file_name || doc.title);
      } else if (doc.url) {
        window.open(doc.url, "_blank");
      } else {
        alert("No file attached — the summary is shown on the card.");
      }
    } catch {
      alert("File not available.");
    }
  }
  return (
    <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 12, boxShadow: "0 1px 4px rgba(28,37,81,0.07)", overflow: "hidden" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 16px" }}>
        <div style={{ width: 36, height: 36, minWidth: 36, borderRadius: 8, background: isReport ? `${COACH}14` : PAGE, color: isReport ? COACH : MUTED, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15 }}>
          {isReport ? "◎" : "▤"}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ ...ff, fontSize: 14, fontWeight: 700, color: NAVY }}>{doc.title}</div>
          <div style={{ ...ff, fontSize: 11, color: MUTED, marginTop: 1 }}>
            {doc.coachee_name}{doc.uploaded_by ? ` · ${doc.uploaded_by}` : ""} · {shortDate(doc.created_at)}
          </div>
        </div>
        <span style={{ ...ff, fontSize: 9, fontWeight: 700, color: isReport ? COACH : MUTED, letterSpacing: 0.5 }}>{badge}</span>
        <button onClick={handleAction}
          style={{ ...ff, background: CARD, border: `1px solid ${BORDER}`, borderRadius: 8, padding: "6px 16px", fontSize: 12, fontWeight: 600, color: NAVY, cursor: "pointer" }}>
          {isReport ? "View" : "Download"}
        </button>
      </div>
      {doc.coach_summary && (
        <div style={{ borderTop: `1px solid ${BORDER}`, background: PAGE, padding: "12px 16px" }}>
          <div style={{ ...ff, fontSize: 13, color: "#4a5568", lineHeight: 1.5 }}>{doc.coach_summary}</div>
        </div>
      )}
    </div>
  );
}
