"use client";

import { useState, useEffect } from "react";
import ReactDOM from "react-dom";
import { api, ApiResponse, OrgResponse } from "@/lib/api";
import { programsApi } from "@/lib/programs-api";
import { facultyMgmtApi, FacultyRosterItemDTO } from "@/lib/faculty-mgmt-api";

// ── Slate / Admin design tokens (FRONTEND_CLAUDE.md) ────────────────────────
const C = {
  navy: "#182848", slate: "#334155", slateL: "#64748b", orange: "#C8A860",
  page: "#F7F5F0", card: "#FFFFFF", alt: "#EFE9DC", border: "#E6DED0",
  muted: "#4A5573", green: "#22c55e", danger: "#ef4444",
};
const ff = { fontFamily: "Poppins, sans-serif" } as const;

interface ProgramOption { id: string; title: string; }

export default function ManageFacultyAccessModal({ faculty, onClose, onChanged }: {
  faculty: FacultyRosterItemDTO; onClose: () => void; onChanged: () => void;
}) {
  const [active, setActive]     = useState(faculty.status !== "inactive");
  const [programs, setPrograms] = useState<ProgramOption[]>([]);
  const [assigned, setAssigned] = useState<Set<string>>(new Set(faculty.assigned_programs.map((p) => p.id)));
  const [busy, setBusy]         = useState<Set<string>>(new Set()); // in-flight ids ("account" | programId | "zoom")
  const [err, setErr]           = useState("");
  const [touched, setTouched]   = useState(false);

  // Zoom meeting host override - which licensed Zoom user this faculty's
  // sessions get created under (see api/internal/zoom/service.go's
  // resolveZoomHostEmail). Loaded separately since the roster row (passed
  // in as `faculty`) doesn't carry it.
  const [zoomHostEmail, setZoomHostEmail]   = useState("");
  const [zoomHostSaved, setZoomHostSaved]   = useState(false);
  const [loadingZoomHost, setLoadingZoomHost] = useState(true);

  useEffect(() => {
    let cancelled = false;
    facultyMgmtApi.getUser(faculty.user_id)
      .then((r) => { if (!cancelled) setZoomHostEmail(r.data?.zoom_host_email ?? ""); })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoadingZoomHost(false); });
    return () => { cancelled = true; };
  }, [faculty.user_id]);

  // Load all programs across orgs (the faculty roster is cross-org).
  useEffect(() => {
    let cancelled = false;
    api.get<ApiResponse<OrgResponse[]>>("/organizations").then(async (r) => {
      const orgs = r.data ?? [];
      const lists = await Promise.all(
        orgs.map((o) => programsApi.list(o.id).then((pr) => (pr.data ?? []).map((p) => ({ id: p.id, title: p.title }))).catch(() => [] as ProgramOption[])),
      );
      if (!cancelled) {
        // de-dupe by id
        const map = new Map<string, ProgramOption>();
        lists.flat().forEach((p) => map.set(p.id, p));
        setPrograms(Array.from(map.values()));
      }
    }).catch(() => {});
    return () => { cancelled = true; };
  }, []);

  function mark(id: string, on: boolean) {
    setBusy((prev) => { const n = new Set(prev); on ? n.add(id) : n.delete(id); return n; });
  }

  async function toggleActive() {
    const next = !active;
    mark("account", true); setErr("");
    try {
      await facultyMgmtApi.setActive(faculty.user_id, next);
      setActive(next); setTouched(true);
    } catch (e) { setErr((e as Error).message); }
    finally { mark("account", false); }
  }

  async function saveZoomHostEmail() {
    mark("zoom", true); setErr(""); setZoomHostSaved(false);
    try {
      await facultyMgmtApi.setZoomHostEmail(faculty.user_id, zoomHostEmail.trim());
      setTouched(true); setZoomHostSaved(true);
      setTimeout(() => setZoomHostSaved(false), 2500);
    } catch (e) { setErr((e as Error).message); }
    finally { mark("zoom", false); }
  }

  async function toggleProgram(programId: string) {
    const isOn = assigned.has(programId);
    mark(programId, true); setErr("");
    try {
      if (isOn) await facultyMgmtApi.unassignProgram(faculty.user_id, programId);
      else await facultyMgmtApi.assignProgram(faculty.user_id, programId);
      setAssigned((prev) => { const n = new Set(prev); isOn ? n.delete(programId) : n.add(programId); return n; });
      setTouched(true);
    } catch (e) { setErr((e as Error).message); }
    finally { mark(programId, false); }
  }

  function done() { if (touched) onChanged(); onClose(); }

  if (typeof document === "undefined") return null;

  return ReactDOM.createPortal(
    <div onClick={(e) => { if (e.target === e.currentTarget) done(); }}
      style={{ position: "fixed", inset: 0, background: "rgba(24, 40, 72,0.5)", zIndex: 2000, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div style={{ ...ff, background: "#fff", borderRadius: 16, width: "100%", maxWidth: 460, maxHeight: "88vh", overflowY: "auto", boxShadow: "0 24px 64px rgba(24, 40, 72,0.22)" }}>
        {/* Header */}
        <div style={{ padding: "18px 22px", borderBottom: `1px solid ${C.border}`, display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: C.navy }}>Manage Faculty Access</div>
            <div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>
              {faculty.name}{faculty.specialization ? ` · ${faculty.specialization}` : ""}
            </div>
          </div>
          <button onClick={done} style={{ background: "none", border: "none", fontSize: 18, color: C.muted, cursor: "pointer" }}>✕</button>
        </div>

        <div style={{ padding: 22, display: "flex", flexDirection: "column", gap: 20 }}>
          {err && <div style={banner.err}>{err}</div>}

          {/* Platform status */}
          <div>
            <SectionLabel>Platform Status</SectionLabel>
            <div style={{ background: C.page, border: `1px solid ${C.border}`, borderRadius: 10, padding: "14px 16px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: C.navy }}>Account Status</div>
                <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>Controls whether this faculty can log in and access the platform</div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: active ? C.green : C.muted }}>{active ? "Active" : "Inactive"}</span>
                <Toggle on={active} busy={busy.has("account")} onToggle={toggleActive} />
              </div>
            </div>
          </div>

          {/* Zoom meeting host override */}
          <div>
            <SectionLabel>Zoom Meeting Host</SectionLabel>
            <div style={{ background: C.page, border: `1px solid ${C.border}`, borderRadius: 10, padding: "14px 16px" }}>
              <div style={{ fontSize: 11, color: C.muted, lineHeight: 1.55, marginBottom: 10 }}>
                Sessions this faculty creates are hosted under this licensed Zoom user instead of
                the organization&apos;s default. Leave blank to use the org default (or this
                faculty&apos;s own login email if no org default is set).
              </div>
              {loadingZoomHost ? (
                <div style={{ fontSize: 12, color: C.muted }}>Loading…</div>
              ) : (
                <div style={{ display: "flex", gap: 8 }}>
                  <input
                    value={zoomHostEmail}
                    onChange={(e) => { setZoomHostEmail(e.target.value); setZoomHostSaved(false); }}
                    placeholder="e.g. host@yourcompany.com"
                    style={{ ...ff, flex: 1, border: `1px solid ${C.border}`, borderRadius: 8, padding: "9px 12px", fontSize: 13, color: C.navy, boxSizing: "border-box" as const }}
                  />
                  <button
                    onClick={saveZoomHostEmail}
                    disabled={busy.has("zoom")}
                    style={{ ...ff, flexShrink: 0, background: busy.has("zoom") ? "#D1D5DB" : C.orange, color: "#fff", border: "none", borderRadius: 8, padding: "9px 18px", fontSize: 12, fontWeight: 700, cursor: busy.has("zoom") ? "not-allowed" : "pointer" }}
                  >
                    {busy.has("zoom") ? "Saving…" : zoomHostSaved ? "Saved!" : "Save"}
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Program access */}
          <div>
            <SectionLabel>Program Access</SectionLabel>
            {programs.length === 0 ? (
              <div style={{ fontSize: 12, color: C.muted }}>Loading programs…</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {programs.map((p) => {
                  const on = assigned.has(p.id);
                  return (
                    <div key={p.id} style={{ background: C.page, border: `1px solid ${C.border}`, borderRadius: 10, padding: "13px 16px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                        <span style={{ fontSize: 13, fontWeight: 600, color: C.navy, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.title}</span>
                        {!on && <span style={{ fontSize: 9, fontWeight: 700, color: C.muted, background: C.alt, borderRadius: 4, padding: "2px 6px", letterSpacing: 0.3, whiteSpace: "nowrap" }}>NOT ASSIGNED</span>}
                      </div>
                      <Toggle on={on} busy={busy.has(p.id)} onToggle={() => toggleProgram(p.id)} />
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div style={{ padding: "14px 22px", borderTop: `1px solid ${C.border}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span style={{ fontSize: 12, color: C.muted }}>Changes take effect immediately.</span>
          <button onClick={done} style={{ ...ff, padding: "9px 22px", background: C.navy, border: "none", borderRadius: 8, cursor: "pointer", fontSize: 12, fontWeight: 700, color: "#fff" }}>Done</button>
        </div>
      </div>
    </div>,
    document.body
  );
}

function Toggle({ on, busy, onToggle }: { on: boolean; busy: boolean; onToggle: () => void }) {
  return (
    <button
      onClick={onToggle}
      disabled={busy}
      style={{
        width: 42, height: 24, borderRadius: 99, border: "none", cursor: busy ? "wait" : "pointer",
        background: on ? C.green : "#C9BFA8", position: "relative", transition: "background 0.15s ease",
        opacity: busy ? 0.6 : 1, flexShrink: 0, padding: 0,
      }}
    >
      <span style={{
        position: "absolute", top: 3, left: on ? 21 : 3, width: 18, height: 18, borderRadius: "50%",
        background: "#fff", boxShadow: "0 1px 3px rgba(0,0,0,0.2)", transition: "left 0.15s ease",
      }} />
    </button>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: 10, fontWeight: 700, color: C.muted, letterSpacing: 0.5, textTransform: "uppercase", marginBottom: 8 }}>{children}</div>;
}

const banner = {
  err: { background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.25)", borderRadius: 8, padding: "10px 14px", fontSize: 12, color: C.danger } as React.CSSProperties,
};
