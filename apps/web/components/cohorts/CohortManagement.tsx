"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { cohortsApi, CohortDTO, ParticipantDTO } from "@/lib/cohorts-api";
import { invitationsApi, InvitationDTO } from "@/lib/invitations-api";
import { programsApi, ProgramDTO } from "@/lib/programs-api";

// ── helpers ────────────────────────────────────────────────────────
function initials(name: string) {
  return name.split(" ").slice(0, 2).map((w) => w[0]?.toUpperCase() ?? "").join("");
}

function avatarBg(name: string) {
  const colors = ["#1C2551", "#6B73BF", "#EF4E24", "#22c55e", "#f59e0b", "#0ea5e9"];
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) % colors.length;
  return colors[h];
}

const RISK_COLOR: Record<string, string> = {
  low: "#22c55e", medium: "#EF4E24", high: "#ef4444",
};

const STATUS_STYLES: Record<string, { bg: string; color: string }> = {
  enrolled:  { bg: "rgba(107,115,191,0.14)", color: "#6B73BF" },
  active:    { bg: "rgba(28,37,81,0.08)",    color: "#1C2551" },
  completed: { bg: "rgba(34,197,94,0.14)",   color: "#22c55e" },
  on_hold:   { bg: "rgba(245,158,11,0.14)",  color: "#f59e0b" },
  withdrawn: { bg: "rgba(139,144,167,0.14)", color: "#8b90a7" },
};

const ENROLLMENT_STATUSES = ["enrolled", "active", "completed", "on_hold", "withdrawn"] as const;
type EnrollmentStatus = typeof ENROLLMENT_STATUSES[number];

// ── Shared styles matching reference exactly ───────────────────────
const S = {
  primBtn: { padding: "9px 20px", background: "#EF4E24", border: "none", borderRadius: 8, cursor: "pointer", fontSize: 12, fontWeight: 700, color: "#fff", fontFamily: "Poppins, sans-serif" } as React.CSSProperties,
  secBtn:  { padding: "8px 16px", background: "#fff", border: "1px solid #EAECF4", borderRadius: 8, cursor: "pointer", fontSize: 12, fontWeight: 600, color: "#1C2551", fontFamily: "Poppins, sans-serif" } as React.CSSProperties,
  iconBtn: { padding: "6px 10px", background: "#F5F7FB", border: "1px solid #EAECF4", borderRadius: 6, cursor: "pointer", fontSize: 11, color: "#1C2551", fontFamily: "Poppins, sans-serif", fontWeight: 600 } as React.CSSProperties,
};

// ── Overlay ────────────────────────────────────────────────────────
function Overlay({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{ position: "fixed", inset: 0, background: "rgba(28,37,81,0.45)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 24, fontFamily: "Poppins, sans-serif" }}
    >
      <div style={{ background: "#fff", borderRadius: 12, width: "100%", maxWidth: 440, overflow: "hidden", boxShadow: "0 24px 64px rgba(28,37,81,0.22)" }}>
        {children}
      </div>
    </div>
  );
}

// ── Status Dropdown ────────────────────────────────────────────────
function StatusDropdown({ cohortId, enrollId, currentStatus, onUpdated }: {
  cohortId: string; enrollId: string; currentStatus: string;
  onUpdated: (enrollId: string, newStatus: string) => void;
}) {
  const [open, setOpen]     = useState(false);
  const [saving, setSaving] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handle(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [open]);

  async function select(s: EnrollmentStatus) {
    if (s === currentStatus) { setOpen(false); return; }
    setSaving(true); setOpen(false);
    try {
      await cohortsApi.updateEnrollment(cohortId, enrollId, { status: s });
      onUpdated(enrollId, s);
    } finally { setSaving(false); }
  }

  const ss = STATUS_STYLES[currentStatus] ?? STATUS_STYLES.enrolled;
  const label = currentStatus.replace("_", " ").replace(/^\w/, c => c.toUpperCase());

  return (
    <div ref={ref} style={{ position: "relative", display: "inline-block" }}>
      <span
        onClick={() => !saving && setOpen(!open)}
        style={{
          background: ss.bg, color: ss.color,
          fontSize: 10, fontWeight: 700, borderRadius: 20, padding: "3px 9px",
          cursor: saving ? "default" : "pointer", userSelect: "none",
          display: "inline-flex", alignItems: "center", gap: 4,
          fontFamily: "Poppins, sans-serif",
        }}
      >
        {saving ? "…" : label}
        {!saving && <span style={{ fontSize: 8, opacity: 0.7 }}>▾</span>}
      </span>
      {open && (
        <div style={{
          position: "absolute", top: "calc(100% + 4px)", left: 0, zIndex: 200,
          background: "#fff", border: "1px solid #EAECF4", borderRadius: 8,
          boxShadow: "0 8px 24px rgba(28,37,81,0.13)", overflow: "hidden", minWidth: 130,
        }}>
          {ENROLLMENT_STATUSES.map((s) => {
            const sss = STATUS_STYLES[s] ?? STATUS_STYLES.enrolled;
            return (
              <div key={s} onClick={() => select(s)} style={{
                padding: "8px 12px", fontSize: 12, cursor: "pointer",
                fontFamily: "Poppins, sans-serif",
                fontWeight: s === currentStatus ? 700 : 400,
                color: s === currentStatus ? sss.color : "#1C2551",
                background: s === currentStatus ? sss.bg : "transparent",
              }}>
                {s.replace("_", " ").replace(/^\w/, c => c.toUpperCase())}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Bulk CSV Modal ─────────────────────────────────────────────────
interface CSVRow { email: string; error?: string }

function BulkCSVModal({ cohortId, cohortName, onClose, onDone }: {
  cohortId: string; cohortName: string; onClose: () => void; onDone: () => void;
}) {
  const [rows, setRows]     = useState<CSVRow[]>([]);
  const [state, setState]   = useState<"idle" | "preview" | "uploading" | "done">("idle");
  const [result, setResult] = useState<{ enrolled: number; skipped: number; failed: number } | null>(null);
  const [drag, setDrag]     = useState(false);

  function parse(text: string) {
    const lines = text.trim().split(/\r?\n/).filter(l => l.trim());
    if (!lines.length) return;

    // Split a CSV line respecting quoted fields
    function splitLine(line: string): string[] {
      const cols: string[] = []; let cur = ""; let inQ = false;
      for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (ch === '"') { inQ = !inQ; continue; }
        if (ch === "," && !inQ) { cols.push(cur.trim()); cur = ""; continue; }
        cur += ch;
      }
      cols.push(cur.trim());
      return cols;
    }

    // Detect header row — find which column index is email
    const EMAIL_HEADERS = ["email", "emailid", "email_id", "emailaddress", "email address", "e-mail", "mail"];
    const firstCols = splitLine(lines[0]).map(c => c.toLowerCase().replace(/\s+/g, ""));
    let emailCol = firstCols.findIndex(c => EMAIL_HEADERS.includes(c));
    const hasHeader = emailCol !== -1;
    // If no named header, check if first cell looks like an email — if not, treat row 0 as header with unknown column name
    if (!hasHeader) {
      const firstCell = firstCols[0];
      if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(firstCell)) {
        emailCol = 0; // data starts from line 0, no header
      } else {
        emailCol = 0; // skip line 0 as unrecognised header, try col 0
      }
    }

    const dataLines = hasHeader ? lines.slice(1) : lines;
    const out: CSVRow[] = [];
    for (const line of dataLines) {
      if (!line.trim()) continue;
      const cols = splitLine(line);
      const raw = (cols[emailCol] ?? "").toLowerCase().replace(/^"|"$/g, "").trim();
      if (!raw) continue;
      const error = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(raw) ? undefined : "Invalid email";
      out.push({ email: raw, error });
    }
    setRows(out); setState("preview");
  }

  function handleFile(f: File) {
    const r = new FileReader();
    r.onload = e => parse(e.target?.result as string);
    r.readAsText(f);
  }

  async function upload() {
    const valid = rows.filter(r => !r.error);
    if (!valid.length) return;
    setState("uploading");
    let enrolled = 0, skipped = 0, failed = 0;
    await Promise.all(valid.map(async r => {
      try {
        const res = await invitationsApi.send({ email: r.email, role: "participant", cohort_id: cohortId });
        const body = res.data as { message?: string };
        if (body?.message?.includes("enrolled directly")) enrolled++; else skipped++;
      } catch { failed++; }
    }));
    setResult({ enrolled, skipped, failed }); setState("done"); onDone();
  }

  if (state === "done" && result) return (
    <Overlay onClose={onClose}>
      <div style={{ padding: "36px 28px", textAlign: "center" }}>
        <div style={{ fontSize: 32, marginBottom: 12 }}>🎉</div>
        <div style={{ fontSize: 15, fontWeight: 700, color: "#1C2551", marginBottom: 16 }}>Upload Complete</div>
        <div style={{ display: "flex", gap: 16, justifyContent: "center", marginBottom: 24 }}>
          {[["Enrolled", result.enrolled, "#22c55e"], ["Invites Sent", result.skipped, "#6B73BF"], ["Failed", result.failed, "#EF4E24"]].map(([l, v, c]) => (
            <div key={String(l)} style={{ textAlign: "center" }}>
              <div style={{ fontSize: 22, fontWeight: 800, color: String(c) }}>{v}</div>
              <div style={{ fontSize: 11, color: "#8b90a7" }}>{l}</div>
            </div>
          ))}
        </div>
        <button onClick={onClose} style={S.primBtn}>Done</button>
      </div>
    </Overlay>
  );

  return (
    <Overlay onClose={onClose}>
      <div style={{ padding: "16px 20px", borderBottom: "1px solid #EAECF4" }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: "#1C2551" }}>Bulk Enroll via CSV</div>
        <div style={{ fontSize: 12, color: "#8b90a7", marginTop: 2 }}>Cohort: <strong style={{ color: "#1C2551" }}>{cohortName}</strong></div>
      </div>
      <div style={{ padding: "16px 20px", display: "flex", flexDirection: "column", gap: 14 }}>
        {state === "idle" && (
          <>
            <div
              onDragOver={e => { e.preventDefault(); setDrag(true); }}
              onDragLeave={() => setDrag(false)}
              onDrop={e => { e.preventDefault(); setDrag(false); const f = e.dataTransfer.files[0]; if (f) handleFile(f); }}
              onClick={() => document.getElementById("csv-input")?.click()}
              style={{ border: `2px dashed ${drag ? "#1C2551" : "#EAECF4"}`, borderRadius: 10, padding: "28px 20px", textAlign: "center", cursor: "pointer", background: drag ? "rgba(28,37,81,0.03)" : "#FAFBFD" }}
            >
              <div style={{ fontSize: 24, marginBottom: 8 }}>📂</div>
              <div style={{ fontSize: 13, fontWeight: 600, color: "#1C2551" }}>Drop CSV here or click to browse</div>
              <input id="csv-input" type="file" accept=".csv" style={{ display: "none" }} onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
            </div>
            <div style={{ fontSize: 11, color: "#8b90a7", lineHeight: 1.7, padding: "10px 12px", background: "#F5F7FB", borderRadius: 8 }}>
              <strong style={{ color: "#1C2551" }}>Any CSV with an email column.</strong> The column must be named <code>Email</code>, <code>EmailID</code>, or similar. Extra columns (name, department, etc.) are ignored.
            </div>
          </>
        )}
        {state === "preview" && (
          <>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: "#1C2551" }}>{rows.filter(r => !r.error).length} valid · {rows.filter(r => r.error).length} invalid</span>
              <button onClick={() => { setRows([]); setState("idle"); }} style={{ ...S.secBtn, padding: "5px 10px", fontSize: 11 }}>Change</button>
            </div>
            <div style={{ maxHeight: 200, overflowY: "auto", border: "1px solid #EAECF4", borderRadius: 8 }}>
              {rows.map((r, i) => (
                <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 12px", borderBottom: i < rows.length - 1 ? "1px solid #F4F5F8" : "none", background: r.error ? "rgba(239,78,36,0.04)" : "transparent" }}>
                  <div>
                    <div style={{ fontSize: 12, color: r.error ? "#EF4E24" : "#1C2551" }}>{r.email}</div>
                    {r.error && <div style={{ fontSize: 11, color: "#EF4E24" }}>{r.error}</div>}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
        {state === "uploading" && <div style={{ textAlign: "center", padding: "20px 0", fontSize: 13, color: "#8b90a7" }}>Enrolling participants…</div>}
      </div>
      <div style={{ padding: "12px 20px", borderTop: "1px solid #EAECF4", display: "flex", gap: 10, justifyContent: "flex-end" }}>
        <button onClick={onClose} style={S.secBtn}>Cancel</button>
        {state === "preview" && (
          <button onClick={upload} disabled={!rows.filter(r => !r.error).length} style={{ ...S.primBtn, opacity: rows.filter(r => !r.error).length ? 1 : 0.5 }}>
            Enroll {rows.filter(r => !r.error).length} Users
          </button>
        )}
      </div>
    </Overlay>
  );
}

// ── Enroll Modal — role is fixed per tab, no toggle shown ─────────
// defaultRole: "participant" | "faculty"
function EnrollModal({ cohortId, cohortName, defaultRole, onClose, onEnrolled }: {
  cohortId: string; cohortName: string; defaultRole: "participant" | "faculty";
  onClose: () => void; onEnrolled: () => void;
}) {
  const [email, setEmail] = useState("");
  const [busy, setBusy]   = useState(false);
  const [err, setErr]     = useState("");
  const [done, setDone]   = useState<"invite" | "direct" | null>(null);
  const [sentTo, setSentTo] = useState("");

  const isFaculty = defaultRole === "faculty";

  async function submit() {
    const t = email.trim().toLowerCase();
    if (!t) { setErr("Email required"); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(t)) { setErr("Invalid email"); return; }
    setBusy(true); setErr("");
    try {
      const res = await invitationsApi.send({ email: t, role: defaultRole, cohort_id: cohortId });
      const body = res.data as { message?: string };
      if (body?.message?.includes("enrolled directly")) { setDone("direct"); onEnrolled(); }
      else { setSentTo(t); setDone("invite"); }
    } catch (e: unknown) { setErr((e as Error).message || "Failed"); }
    finally { setBusy(false); }
  }

  if (done === "invite") return (
    <Overlay onClose={onClose}>
      <div style={{ padding: "36px 28px", textAlign: "center" }}>
        <div style={{ fontSize: 32, marginBottom: 12 }}>📧</div>
        <div style={{ fontSize: 15, fontWeight: 700, color: "#1C2551", marginBottom: 8 }}>Invite Sent!</div>
        <div style={{ fontSize: 12, color: "#8b90a7", lineHeight: 1.6, marginBottom: 20 }}>
          Sent to <strong style={{ color: "#1C2551" }}>{sentTo}</strong>.<br />
          They'll join <strong style={{ color: "#1C2551" }}>{cohortName}</strong> as a {isFaculty ? "Faculty member" : "Participant"} once they accept.
        </div>
        <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
          <button onClick={() => { setEmail(""); setDone(null); setSentTo(""); }} style={S.secBtn}>Invite Another</button>
          <button onClick={onClose} style={S.primBtn}>Done</button>
        </div>
      </div>
    </Overlay>
  );

  if (done === "direct") return (
    <Overlay onClose={onClose}>
      <div style={{ padding: "36px 28px", textAlign: "center" }}>
        <div style={{ fontSize: 32, marginBottom: 12 }}>✅</div>
        <div style={{ fontSize: 15, fontWeight: 700, color: "#1C2551", marginBottom: 8 }}>
          {isFaculty ? "Faculty Added!" : "Enrolled!"}
        </div>
        <div style={{ fontSize: 12, color: "#8b90a7", lineHeight: 1.6, marginBottom: 20 }}>
          User already had an account and was {isFaculty ? "added as faculty" : "enrolled"} directly.
        </div>
        <button onClick={onClose} style={{ ...S.primBtn, background: "#22c55e" }}>Done</button>
      </div>
    </Overlay>
  );

  return (
    <Overlay onClose={onClose}>
      <div style={{ padding: "16px 20px", borderBottom: "1px solid #EAECF4" }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: "#1C2551" }}>
          {isFaculty ? "+ Invite Faculty" : "+ Enroll Participants"}
        </div>
        <div style={{ fontSize: 12, color: "#8b90a7", marginTop: 2 }}>
          Cohort: <strong style={{ color: "#1C2551" }}>{cohortName}</strong>
          {" · "}
          <span style={{ color: isFaculty ? "#6B73BF" : "#EF4E24", fontWeight: 700 }}>
            Role: {isFaculty ? "Faculty" : "Participant"}
          </span>
        </div>
      </div>
      <div style={{ padding: "16px 20px", display: "flex", flexDirection: "column", gap: 14 }}>
        <div>
          <div style={{ fontSize: 10, fontWeight: 700, color: "#8b90a7", letterSpacing: 0.5, marginBottom: 6 }}>EMAIL ADDRESS *</div>
          <input autoFocus type="email" value={email}
            onChange={e => { setEmail(e.target.value); setErr(""); }}
            onKeyDown={e => { if (e.key === "Enter") submit(); }}
            placeholder={isFaculty ? "faculty@institution.com" : "participant@company.com"}
            style={{ width: "100%", border: "1px solid #EAECF4", borderRadius: 8, padding: "9px 12px", fontSize: 13, fontFamily: "Poppins, sans-serif", color: "#1C2551", boxSizing: "border-box", outline: "none" }}
          />
        </div>
        {isFaculty && (
          <div style={{ fontSize: 11, color: "#6B73BF", background: "rgba(107,115,191,0.08)", borderRadius: 8, padding: "8px 12px", lineHeight: 1.6 }}>
            The invitee will automatically receive the <strong>Faculty</strong> role in this cohort.
          </div>
        )}
        {err && <div style={{ fontSize: 12, color: "#EF4E24", padding: "8px 12px", background: "rgba(239,78,36,0.06)", borderRadius: 8 }}>{err}</div>}
      </div>
      <div style={{ padding: "12px 20px", borderTop: "1px solid #EAECF4", display: "flex", gap: 10, justifyContent: "flex-end" }}>
        <button onClick={onClose} style={S.secBtn}>Cancel</button>
        <button onClick={submit} disabled={busy} style={{ ...S.primBtn, opacity: busy ? 0.6 : 1 }}>
          {busy ? "Sending…" : isFaculty ? "Send Faculty Invite" : "Send Invite"}
        </button>
      </div>
    </Overlay>
  );
}

// ── Create Cohort Modal ────────────────────────────────────────────
function CreateCohortModal({ orgId, onClose, onCreated }: {
  orgId: string; onClose: () => void; onCreated: (c: CohortDTO) => void;
}) {
  const [programs, setPrograms] = useState<ProgramDTO[]>([]);
  const [loadingProgs, setLoadingProgs] = useState(true);
  const [selProgId, setSelProgId] = useState("");
  const [name, setName]         = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate]   = useState("");
  const [maxSeats, setMaxSeats] = useState(50);
  const [saving, setSaving]     = useState(false);
  const [err, setErr]           = useState("");

  useEffect(() => {
    programsApi.list(orgId)
      .then(r => { const all = r.data ?? []; setPrograms(all.filter(p => p.status !== "archived")); })
      .catch(() => setPrograms([]))
      .finally(() => setLoadingProgs(false));
  }, [orgId]);

  async function submit() {
    if (!selProgId) { setErr("Select a program"); return; }
    if (!name.trim()) { setErr("Name required"); return; }
    setSaving(true); setErr("");
    try {
      const res = await cohortsApi.create(orgId, { program_id: selProgId, name, start_date: startDate || undefined, end_date: endDate || undefined, max_seats: maxSeats });
      onCreated(res.data); onClose();
    } catch (e: unknown) { setErr((e as Error).message || "Failed"); }
    finally { setSaving(false); }
  }

  const selProg = programs.find(p => p.id === selProgId);

  return (
    <Overlay onClose={onClose}>
      <div style={{ padding: "16px 20px", borderBottom: "1px solid #EAECF4" }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: "#1C2551" }}>New Cohort</div>
        <div style={{ fontSize: 12, color: "#8b90a7", marginTop: 2 }}>Select a program and configure this cohort.</div>
      </div>
      <div style={{ padding: "16px 20px", display: "flex", flexDirection: "column", gap: 14, maxHeight: "60vh", overflowY: "auto" }}>
        <div>
          <div style={{ fontSize: 10, fontWeight: 700, color: "#8b90a7", letterSpacing: 0.5, marginBottom: 6 }}>PROGRAM *</div>
          {loadingProgs ? <div style={{ fontSize: 12, color: "#8b90a7" }}>Loading…</div> : programs.length === 0 ? (
            <div style={{ fontSize: 12, color: "#EF4E24" }}>No programs found. Create a program first.</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {programs.map(p => (
                <div key={p.id} onClick={() => { setSelProgId(p.id); if (!name) setName(`${p.title} – Batch 1`); }}
                  style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", borderRadius: 8, cursor: "pointer", border: `1.5px solid ${selProgId === p.id ? p.color : "#EAECF4"}`, background: selProgId === p.id ? `${p.color}08` : "#fff" }}>
                  <div style={{ width: 8, height: 8, borderRadius: "50%", background: p.color, flexShrink: 0 }} />
                  <div style={{ flex: 1, fontSize: 13, fontWeight: 600, color: "#1C2551", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.title}</div>
                  <span style={{ fontSize: 10, color: "#8b90a7" }}>{p.status}</span>
                  {selProgId === p.id && <span style={{ color: p.color, fontWeight: 700 }}>✓</span>}
                </div>
              ))}
            </div>
          )}
        </div>
        {selProgId && (
          <>
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, color: "#8b90a7", letterSpacing: 0.5, marginBottom: 6 }}>COHORT NAME *</div>
              <input autoFocus style={{ width: "100%", border: "1px solid #EAECF4", borderRadius: 8, padding: "9px 12px", fontSize: 13, fontFamily: "Poppins, sans-serif", color: "#1C2551", boxSizing: "border-box", outline: "none" }}
                value={name} onChange={e => setName(e.target.value)} />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <div>
                <div style={{ fontSize: 10, fontWeight: 700, color: "#8b90a7", letterSpacing: 0.5, marginBottom: 6 }}>START DATE</div>
                <input type="date" style={{ width: "100%", border: "1px solid #EAECF4", borderRadius: 8, padding: "9px 12px", fontSize: 13, fontFamily: "Poppins, sans-serif", color: "#1C2551", boxSizing: "border-box", outline: "none" }}
                  value={startDate} onChange={e => setStartDate(e.target.value)} />
              </div>
              <div>
                <div style={{ fontSize: 10, fontWeight: 700, color: "#8b90a7", letterSpacing: 0.5, marginBottom: 6 }}>END DATE</div>
                <input type="date" style={{ width: "100%", border: "1px solid #EAECF4", borderRadius: 8, padding: "9px 12px", fontSize: 13, fontFamily: "Poppins, sans-serif", color: "#1C2551", boxSizing: "border-box", outline: "none" }}
                  value={endDate} onChange={e => setEndDate(e.target.value)} />
              </div>
            </div>
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, color: "#8b90a7", letterSpacing: 0.5, marginBottom: 6 }}>MAX SEATS</div>
              <input type="number" min={1} max={500} value={maxSeats} onChange={e => setMaxSeats(Number(e.target.value))}
                style={{ width: "100%", border: "1px solid #EAECF4", borderRadius: 8, padding: "9px 12px", fontSize: 13, fontFamily: "Poppins, sans-serif", color: "#1C2551", boxSizing: "border-box", outline: "none" }} />
            </div>
          </>
        )}
        {err && <div style={{ fontSize: 12, color: "#EF4E24", padding: "8px 12px", background: "rgba(239,78,36,0.06)", borderRadius: 8 }}>{err}</div>}
      </div>
      <div style={{ padding: "12px 20px", borderTop: "1px solid #EAECF4", display: "flex", gap: 10, justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontSize: 11, color: "#8b90a7" }}>{selProg ? `Program: ${selProg.title}` : ""}</span>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={onClose} style={S.secBtn}>Cancel</button>
          <button onClick={submit} disabled={saving || !selProgId || !name.trim()} style={{ ...S.primBtn, opacity: saving || !selProgId || !name.trim() ? 0.5 : 1 }}>
            {saving ? "Creating…" : "Create Cohort"}
          </button>
        </div>
      </div>
    </Overlay>
  );
}

// ── Main Component ─────────────────────────────────────────────────
export default function CohortManagement({ orgId }: { orgId: string }) {
  const [cohorts, setCohorts]           = useState<CohortDTO[]>([]);
  const [selId, setSelId]               = useState<string | null>(null);
  const [participants, setParticipants]   = useState<ParticipantDTO[]>([]);
  const [pendingInvites, setPendingInvites] = useState<InvitationDTO[]>([]);
  const [loadingC, setLoadingC]           = useState(true);
  const [loadingP, setLoadingP]           = useState(false);
  const [showEnroll, setShowEnroll]     = useState(false);
  const [showCreate, setShowCreate]     = useState(false);
  const [showBulk, setShowBulk]         = useState(false);
  const [nudgingId, setNudgingId]       = useState<string | null>(null);
  const [nudgedIds, setNudgedIds]       = useState<Set<string>>(new Set());

  const selCohort = cohorts.find(c => c.id === selId) ?? null;

  const loadCohorts = useCallback(async () => {
    setLoadingC(true);
    try {
      const res = await cohortsApi.list(orgId);
      const list = res.data ?? [];
      setCohorts(list);
      if (list.length > 0 && !selId) setSelId(list[0].id);
    } finally { setLoadingC(false); }
  }, [orgId, selId]);

  const loadParticipants = useCallback(async (cohortId: string) => {
    setLoadingP(true);
    try {
      const [enrolledRes, inviteRes] = await Promise.all([
        cohortsApi.listParticipants(cohortId),
        invitationsApi.listByCohort(cohortId).catch(() => ({ data: [] as InvitationDTO[] })),
      ]);
      setParticipants(enrolledRes.data ?? []);
      // Only show pending invites (not yet accepted or expired)
      setPendingInvites((inviteRes.data ?? []).filter(i => i.status === "pending" && i.role === "participant"));
    } finally { setLoadingP(false); }
  }, []);

  useEffect(() => { loadCohorts(); }, [loadCohorts]);
  useEffect(() => { if (selId) loadParticipants(selId); }, [selId, loadParticipants]);

  function handleStatusUpdated(enrollId: string, newStatus: string) {
    setParticipants(prev => prev.map(p => p.enrollment_id === enrollId ? { ...p, status: newStatus } : p));
  }

  async function handleNudge(enrollId: string) {
    if (!selId) return;
    setNudgingId(enrollId);
    try {
      await cohortsApi.nudge(selId, enrollId);
      setNudgedIds(prev => new Set([...prev, enrollId]));
    } finally { setNudgingId(null); }
  }

  if (!orgId) return (
    <div style={{ padding: 48, textAlign: "center", color: "#8b90a7", fontSize: 14, fontFamily: "Poppins, sans-serif" }}>
      Your account is not linked to an organization.
    </div>
  );

  const pRows = participants.filter(p => p.role !== "faculty");

  return (
    <div style={{ padding: 24, display: "flex", flexDirection: "column", gap: 16, fontFamily: "Poppins, sans-serif" }}>

      {/* Cohort selector + New Cohort */}
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        {loadingC ? (
          <span style={{ fontSize: 12, color: "#8b90a7" }}>Loading cohorts…</span>
        ) : (
          cohorts.map(c => (
            <button key={c.id} onClick={() => setSelId(c.id)} style={{
              padding: "5px 14px", borderRadius: 20, cursor: "pointer", fontSize: 12,
              border: `1.5px solid ${c.id === selId ? "#1C2551" : "#EAECF4"}`,
              background: c.id === selId ? "#1C2551" : "#fff",
              color: c.id === selId ? "#fff" : "#8b90a7",
              fontWeight: c.id === selId ? 700 : 400, fontFamily: "Poppins, sans-serif",
            }}>
              {c.name} <span style={{ fontSize: 10, opacity: 0.7 }}>{c.enrolled_count}/{c.max_seats}</span>
            </button>
          ))
        )}
        <button onClick={() => setShowCreate(true)} style={{ padding: "5px 12px", borderRadius: 20, cursor: "pointer", border: "1.5px dashed #EAECF4", background: "none", color: "#8b90a7", fontSize: 12, fontFamily: "Poppins, sans-serif" }}>
          + New Cohort
        </button>
      </div>

      {/* Action bar */}
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
        <button onClick={() => setShowBulk(true)} style={S.secBtn}>Import CSV</button>
        <button onClick={() => setShowEnroll(true)} style={S.primBtn}>+ Enroll Participants</button>
      </div>

      {/* Table */}
      <div style={{ background: "#fff", borderRadius: 12, boxShadow: "0 1px 4px rgba(28,37,81,0.07)", border: "1px solid #EAECF4", overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ background: "#F5F7FB" }}>
              {["Participant", "Department", "Enrolled", "Completion", "Risk", "Status", "Actions"].map(h => (
                <th key={h} style={{ padding: "12px 16px", textAlign: "left", fontSize: 11, fontWeight: 700, color: "#8b90a7", letterSpacing: 0.5, fontFamily: "Poppins, sans-serif" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loadingP ? (
              <tr><td colSpan={7} style={{ padding: 40, textAlign: "center", fontSize: 13, color: "#8b90a7" }}>Loading participants…</td></tr>
            ) : pRows.length === 0 && pendingInvites.length === 0 ? (
              <tr>
                <td colSpan={7} style={{ padding: 48, textAlign: "center" }}>
                  <div style={{ fontSize: 13, color: "#8b90a7", marginBottom: 14 }}>No participants yet in this cohort.</div>
                  <button onClick={() => setShowEnroll(true)} style={S.primBtn}>+ Enroll Participants</button>
                </td>
              </tr>
            ) : (
              <>
              {pRows.map(p => {
                const riskColor = RISK_COLOR[p.risk_level] ?? "#22c55e";
                const isNudging = nudgingId === p.enrollment_id;
                const wasNudged = nudgedIds.has(p.enrollment_id);
                return (
                  <tr key={p.enrollment_id} style={{ borderTop: "1px solid #EAECF4" }}
                    onMouseEnter={e => (e.currentTarget.style.background = "#FAFBFD")}
                    onMouseLeave={e => (e.currentTarget.style.background = "transparent")}>
                    <td style={{ padding: "12px 16px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <div style={{ width: 32, height: 32, borderRadius: "50%", background: avatarBg(p.name), color: "#fff", fontWeight: 700, fontSize: 11, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                          {p.avatar_url ? <img src={p.avatar_url} alt={p.name} style={{ width: 32, height: 32, borderRadius: "50%", objectFit: "cover" }} /> : initials(p.name)}
                        </div>
                        <div>
                          <div style={{ fontSize: 13, fontWeight: 600, color: "#1C2551" }}>{p.name}</div>
                          <div style={{ fontSize: 11, color: "#8b90a7" }}>{p.email}</div>
                        </div>
                      </div>
                    </td>
                    <td style={{ padding: "12px 16px", fontSize: 12, color: "#8b90a7" }}>{p.department ?? "—"}</td>
                    <td style={{ padding: "12px 16px", fontSize: 12, color: "#8b90a7" }}>
                      {new Date(p.enrolled_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                    </td>
                    <td style={{ padding: "12px 16px", minWidth: 130 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <div style={{ flex: 1, height: 5, background: "#F0F1F7", borderRadius: 99 }}>
                          <div style={{ height: "100%", width: `${p.completion_percent}%`, background: p.completion_percent >= 70 ? "#22c55e" : "#EF4E24", borderRadius: 99 }} />
                        </div>
                        <span style={{ fontSize: 11, fontWeight: 700, color: "#1C2551", minWidth: 30 }}>{p.completion_percent}%</span>
                      </div>
                    </td>
                    <td style={{ padding: "12px 16px" }}>
                      <span style={{ background: `${riskColor}14`, color: riskColor, fontSize: 10, fontWeight: 700, borderRadius: 20, padding: "3px 9px" }}>
                        {p.risk_level.charAt(0).toUpperCase() + p.risk_level.slice(1)}
                      </span>
                    </td>
                    <td style={{ padding: "12px 16px" }}>
                      {selId && <StatusDropdown cohortId={selId} enrollId={p.enrollment_id} currentStatus={p.status} onUpdated={handleStatusUpdated} />}
                    </td>
                    <td style={{ padding: "12px 16px" }}>
                      <div style={{ display: "flex", gap: 6 }}>
                        <button style={S.iconBtn}>View</button>
                        <button onClick={() => handleNudge(p.enrollment_id)} disabled={isNudging || wasNudged}
                          style={{ ...S.iconBtn, color: wasNudged ? "#22c55e" : S.iconBtn.color, background: wasNudged ? "rgba(34,197,94,0.08)" : S.iconBtn.background, cursor: isNudging || wasNudged ? "default" : "pointer" }}>
                          {isNudging ? "…" : wasNudged ? "✓ Sent" : "Nudge"}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {pendingInvites.map(inv => (
                <tr key={inv.id} style={{ borderTop: "1px solid #EAECF4" }}
                  onMouseEnter={e => (e.currentTarget.style.background = "#FAFBFD")}
                  onMouseLeave={e => (e.currentTarget.style.background = "transparent")}>
                  <td style={{ padding: "12px 16px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <div style={{ width: 32, height: 32, borderRadius: "50%", background: "#F0F1F7", color: "#8b90a7", fontWeight: 700, fontSize: 14, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>✉</div>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 600, color: "#1C2551" }}>{inv.email}</div>
                        <div style={{ fontSize: 11, color: "#8b90a7" }}>Invite sent · awaiting signup</div>
                      </div>
                    </div>
                  </td>
                  <td style={{ padding: "12px 16px", fontSize: 12, color: "#8b90a7" }}>—</td>
                  <td style={{ padding: "12px 16px", fontSize: 12, color: "#8b90a7" }}>
                    {new Date(inv.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                  </td>
                  <td style={{ padding: "12px 16px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <div style={{ flex: 1, height: 5, background: "#F0F1F7", borderRadius: 99 }} />
                      <span style={{ fontSize: 11, color: "#8b90a7", minWidth: 30 }}>—</span>
                    </div>
                  </td>
                  <td style={{ padding: "12px 16px" }}>—</td>
                  <td style={{ padding: "12px 16px" }}>
                    <span style={{ background: "rgba(245,158,11,0.14)", color: "#f59e0b", fontSize: 10, fontWeight: 700, borderRadius: 20, padding: "3px 9px" }}>Pending</span>
                  </td>
                  <td style={{ padding: "12px 16px" }}>
                    <span style={{ fontSize: 11, color: "#8b90a7" }}>Expires {new Date(inv.expires_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span>
                  </td>
                </tr>
              ))}
              </>
            )}
          </tbody>
        </table>
      </div>

      {/* Modals */}
      {showEnroll && selId && (
        <EnrollModal
          cohortId={selId}
          cohortName={selCohort?.name ?? ""}
          defaultRole="participant"
          onClose={() => setShowEnroll(false)}
          onEnrolled={() => loadParticipants(selId)}
        />
      )}
      {showBulk && selId && (
        <BulkCSVModal
          cohortId={selId}
          cohortName={selCohort?.name ?? ""}
          onClose={() => { setShowBulk(false); loadParticipants(selId); }}
          onDone={() => loadParticipants(selId)}
        />
      )}
      {showCreate && (
        <CreateCohortModal
          orgId={orgId}
          onClose={() => setShowCreate(false)}
          onCreated={c => { setCohorts(prev => [c, ...prev]); setSelId(c.id); }}
        />
      )}
    </div>
  );
}
