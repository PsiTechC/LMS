"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import ReactDOM from "react-dom";
import {
  facultyMgmtApi, FacultyRosterItemDTO, FacultyProfileDTO, FacultyStatus,
} from "@/lib/faculty-mgmt-api";
import ManageFacultyAccessModal from "./ManageFacultyAccessModal";

// ── Slate / Admin design tokens (FRONTEND_CLAUDE.md) ────────────────────────
const C = {
  navy:   "#182848",
  slate:  "#334155",
  slateL: "#64748b",
  orange: "#C8A860",
  page:   "#F7F5F0",
  card:   "#FFFFFF",
  alt:    "#EFE9DC",
  border: "#E6DED0",
  muted:  "#4A5573",
  green:  "#22c55e",
  amber:  "#f59e0b",
  danger: "#ef4444",
  indigo: "#4A5573",
};
const ff = { fontFamily: "Poppins, sans-serif" } as const;

const STATUS_META: Record<FacultyStatus, { color: string; label: string }> = {
  active:     { color: C.green,  label: "Active" },
  onboarding: { color: C.amber,  label: "Onboarding in progress" },
  inactive:   { color: C.muted,  label: "Inactive" },
};

export default function FacultyRoster({ orgId, onNavigate }: { orgId?: string; onNavigate?: (page: string) => void }) {
  const [roster, setRoster]   = useState<FacultyRosterItemDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr]         = useState("");
  const [search, setSearch]   = useState("");
  const [profileFor, setProfileFor] = useState<FacultyRosterItemDTO | null>(null);
  const [manageFor, setManageFor]   = useState<FacultyRosterItemDTO | null>(null);

  const load = useCallback(() => {
    setLoading(true); setErr("");
    facultyMgmtApi.roster(orgId)
      .then((r) => setRoster(r.data ?? []))
      .catch((e) => setErr(e.message))
      .finally(() => setLoading(false));
  }, [orgId]);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return roster;
    return roster.filter((f) =>
      f.name.toLowerCase().includes(q) || f.specialization.toLowerCase().includes(q));
  }, [roster, search]);

  return (
    <div style={{ ...ff, padding: 24, display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Search */}
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <div style={{ position: "relative", flex: 1, maxWidth: 460 }}>
          <span style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: C.muted, fontSize: 13 }}>⌕</span>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name or specialization…"
            style={{ ...input, paddingLeft: 30 }}
          />
        </div>
        <span style={{ fontSize: 12, color: C.muted, marginLeft: "auto" }}>{filtered.length} of {roster.length} faculty</span>
      </div>

      {err && <div style={banner.err}>{err}</div>}

      {loading ? (
        <div style={card.empty}>Loading faculty roster…</div>
      ) : filtered.length === 0 ? (
        roster.length === 0 ? (
          <div style={{ ...card.plain, textAlign: "center", padding: "56px 24px", display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
            <div style={{ fontSize: 32 }}>👩‍🏫</div>
            <div style={{ fontSize: 14, fontWeight: 700, color: C.navy }}>No faculty onboarded yet</div>
            <div style={{ fontSize: 12, color: C.muted, maxWidth: 340 }}>Use the "Onboard Faculty" button on the Dashboard tab to add your first faculty member.</div>
          </div>
        ) : (
          <div style={{ ...card.plain, ...card.empty }}>No faculty match your search.</div>
        )
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))", gap: 16 }}>
          {filtered.map((f) => (
            <FacultyCard
              key={f.user_id}
              f={f}
              onViewProfile={() => setProfileFor(f)}
              onManageAccess={() => setManageFor(f)}
            />
          ))}
        </div>
      )}

      {profileFor && (
        <ProfileDrawer faculty={profileFor} onClose={() => setProfileFor(null)} />
      )}

      {manageFor && (
        <ManageFacultyAccessModal
          faculty={manageFor}
          onClose={() => setManageFor(null)}
          onChanged={load}
        />
      )}
    </div>
  );
}

// ── Faculty card ─────────────────────────────────────────────────────────────

function FacultyCard({ f, onViewProfile, onManageAccess }: {
  f: FacultyRosterItemDTO; onViewProfile: () => void; onManageAccess: () => void;
}) {
  const meta = STATUS_META[f.status];
  const onboarding = f.status === "onboarding";

  return (
    <div style={{ ...card.plain, padding: 0, overflow: "hidden", display: "flex", flexDirection: "column" }}>
      {/* Header */}
      <div style={{ padding: 18, display: "flex", gap: 12, alignItems: "flex-start" }}>
        <div style={{
          width: 46, height: 46, borderRadius: "50%", background: onboarding ? C.amber : C.navy,
          color: "#fff", fontWeight: 700, fontSize: 15, flexShrink: 0,
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          {initials(f.name)}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
            <span style={{ fontSize: 15, fontWeight: 700, color: C.navy, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{f.name}</span>
            <span style={{ ...pill(meta.color), display: "inline-flex", alignItems: "center", gap: 5, flexShrink: 0 }}>
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: meta.color }} />
              {meta.label}
            </span>
          </div>
          <div style={{ fontSize: 12, color: C.slateL, marginTop: 3 }}>
            {f.location || "-"} · Joined {fmtDate(f.joined_at)}
          </div>
          {f.specialization && (
            <div style={{ fontSize: 12, color: C.navy, fontWeight: 600, marginTop: 4 }}>{f.specialization}</div>
          )}
        </div>
      </div>

      {/* Certification tags */}
      {f.certifications.length > 0 && (
        <div style={{ padding: "0 18px 14px", display: "flex", flexWrap: "wrap", gap: 6 }}>
          {f.certifications.map((c) => (
            <span key={c} style={{ fontSize: 10, fontWeight: 600, color: C.indigo, background: `${C.indigo}14`, borderRadius: 6, padding: "3px 8px" }}>{c}</span>
          ))}
        </div>
      )}

      {onboarding ? (
        /* Onboarding state - real, from onboarding_invites status */
        <div style={{ padding: 16, flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, background: "rgba(74, 85, 115,0.08)", border: `1px solid ${C.indigo}33`, borderRadius: 8, padding: "12px 14px", fontSize: 12, fontWeight: 600, color: C.indigo }}>
            <span>◷</span> Onboarding in progress - {f.sessions_scheduled} session{f.sessions_scheduled === 1 ? "" : "s"} scheduled
          </div>
        </div>
      ) : (
        <>
          {/* Stats */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", borderTop: `1px solid ${C.border}`, borderBottom: `1px solid ${C.border}`, background: C.page }}>
            <Stat label="Sessions" value={f.sessions_delivered} />
            <Stat label="Scheduled" value={f.sessions_scheduled} divider />
            <Stat label="Engagement" value={`${f.engagement_pct}%`} divider />
          </div>

          {/* Assigned programs */}
          <div style={{ padding: 16, flex: 1 }}>
            {f.assigned_programs.length === 0 ? (
              <div style={{ background: C.page, border: `1px solid ${C.border}`, borderRadius: 8, padding: "12px 14px", fontSize: 12, color: C.muted }}>
                No active program assignments
              </div>
            ) : (
              <>
                <div style={{ fontSize: 10, fontWeight: 700, color: C.muted, letterSpacing: 0.5, textTransform: "uppercase", marginBottom: 8 }}>
                  Assigned Programs
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                  {f.assigned_programs.map((p) => (
                    <div key={p.id} style={{ fontSize: 12, color: C.navy, display: "flex", alignItems: "center", gap: 6 }}>
                      <span style={{ width: 5, height: 5, borderRadius: "50%", background: C.indigo }} />
                      {p.title}
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </>
      )}

      {/* Actions */}
      <div style={{ display: "flex", gap: 8, padding: 16, borderTop: `1px solid ${C.border}` }}>
        <button onClick={onViewProfile} style={{ ...btn.ghost, flex: 1 }}>View Profile</button>
        <button onClick={onManageAccess} style={{ ...btn.prim, flex: 1 }}>Manage Access</button>
      </div>
    </div>
  );
}

function Stat({ label, value, divider }: { label: string; value: string | number; divider?: boolean }) {
  return (
    <div style={{ padding: "12px 10px", textAlign: "center", borderLeft: divider ? `1px solid ${C.border}` : "none" }}>
      <div style={{ fontSize: 17, fontWeight: 800, color: C.navy }}>{value}</div>
      <div style={{ fontSize: 10, fontWeight: 600, color: C.muted, textTransform: "uppercase", letterSpacing: 0.5 }}>{label}</div>
    </div>
  );
}

// ── Profile drawer (View Profile) ────────────────────────────────────────────

function ProfileDrawer({ faculty, onClose }: { faculty: FacultyRosterItemDTO; onClose: () => void }) {
  const [profile, setProfile] = useState<FacultyProfileDTO | null>(null);
  const [loading, setLoading] = useState(true);
  const meta = STATUS_META[faculty.status];

  useEffect(() => {
    facultyMgmtApi.profile(faculty.user_id)
      .then((r) => setProfile(r.data))
      .catch(() => setProfile(null))
      .finally(() => setLoading(false));
  }, [faculty.user_id]);

  if (typeof document === "undefined") return null;
  return ReactDOM.createPortal(
    <div onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{ position: "fixed", inset: 0, background: "rgba(24, 40, 72,0.35)", zIndex: 2000, display: "flex", justifyContent: "flex-end" }}>
      <div style={{ ...ff, width: "min(560px, 92vw)", height: "100%", background: C.card, boxShadow: "-8px 0 40px rgba(24, 40, 72,0.14)", overflowY: "auto" }}>
        <div style={{ position: "sticky", top: 0, background: C.card, borderBottom: `1px solid ${C.border}`, padding: "16px 22px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontSize: 15, fontWeight: 700, color: C.navy }}>Faculty Profile</span>
          <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 18, color: C.muted, cursor: "pointer" }}>✕</button>
        </div>

        <div style={{ padding: 22, display: "flex", flexDirection: "column", gap: 18 }}>
          {/* Identity */}
          <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
            <div style={{ width: 54, height: 54, borderRadius: "50%", background: faculty.status === "onboarding" ? C.amber : C.navy, color: "#fff", fontWeight: 700, fontSize: 18, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              {initials(faculty.name)}
            </div>
            <div>
              <div style={{ fontSize: 17, fontWeight: 700, color: C.navy }}>{faculty.name}</div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4 }}>
                <span style={{ ...pill(meta.color) }}>{meta.label}</span>
                <span style={{ fontSize: 12, color: C.muted }}>{faculty.location || "-"} · Joined {fmtDate(faculty.joined_at)}</span>
              </div>
            </div>
          </div>

          {faculty.specialization && <Section label="Specialization"><span style={{ fontSize: 13, color: C.navy }}>{faculty.specialization}</span></Section>}

          {loading ? (
            <div style={{ fontSize: 13, color: C.muted }}>Loading profile…</div>
          ) : (
            <>
              {profile?.bio && <Section label="Bio"><span style={{ fontSize: 13, color: C.slateL, lineHeight: 1.6 }}>{profile.bio}</span></Section>}
              {(profile?.delivery_modes?.length ?? 0) > 0 && (
                <Section label="Delivery Modes">
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {profile!.delivery_modes.map((m) => <span key={m} style={tag(C.slate)}>{m}</span>)}
                  </div>
                </Section>
              )}
              {faculty.certifications.length > 0 && (
                <Section label="Certifications">
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {faculty.certifications.map((c) => <span key={c} style={tag(C.indigo)}>{c}</span>)}
                  </div>
                </Section>
              )}
              {profile?.linkedin_url && (
                <Section label="LinkedIn">
                  <a href={profile.linkedin_url} target="_blank" rel="noreferrer" style={{ fontSize: 13, color: C.orange, fontWeight: 600 }}>{profile.linkedin_url}</a>
                </Section>
              )}
            </>
          )}

          {/* Stats */}
          <Section label="Activity">
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
              <MiniStat label="Sessions" value={faculty.sessions_delivered} />
              <MiniStat label="Scheduled" value={faculty.sessions_scheduled} />
              <MiniStat label="Engagement" value={`${faculty.engagement_pct}%`} />
            </div>
          </Section>

          {/* Programs */}
          <Section label="Assigned Programs">
            {faculty.assigned_programs.length === 0 ? (
              <span style={{ fontSize: 13, color: C.muted }}>None assigned.</span>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {faculty.assigned_programs.map((p) => (
                  <div key={p.id} style={{ fontSize: 13, color: C.navy }}>• {p.title}</div>
                ))}
              </div>
            )}
          </Section>
        </div>
      </div>
    </div>,
    document.body
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ fontSize: 10, fontWeight: 700, color: C.muted, letterSpacing: 0.5, textTransform: "uppercase", marginBottom: 6 }}>{label}</div>
      {children}
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string | number }) {
  return (
    <div style={{ background: C.page, borderRadius: 8, padding: "10px 12px", textAlign: "center" }}>
      <div style={{ fontSize: 16, fontWeight: 800, color: C.navy }}>{value}</div>
      <div style={{ fontSize: 10, fontWeight: 600, color: C.muted, textTransform: "uppercase" }}>{label}</div>
    </div>
  );
}

// ── helpers & styles ─────────────────────────────────────────────────────────

function initials(name: string) {
  return name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2) || "F";
}
function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { day: "numeric", month: "short", year: "numeric" });
}

const pill = (color: string): React.CSSProperties => ({
  display: "inline-block", background: `${color}18`, color,
  fontSize: 10, fontWeight: 700, borderRadius: 20, padding: "3px 9px", whiteSpace: "nowrap",
});
const tag = (color: string): React.CSSProperties => ({
  fontSize: 11, fontWeight: 600, color, background: `${color}14`, borderRadius: 6, padding: "3px 9px", textTransform: "capitalize",
});
const input: React.CSSProperties = {
  width: "100%", border: `1px solid ${C.border}`, borderRadius: 8, padding: "9px 12px",
  fontSize: 13, color: C.navy, fontFamily: "Poppins, sans-serif", outline: "none", boxSizing: "border-box", background: "#fff",
};
const card = {
  plain: { background: C.card, borderRadius: 12, border: `1px solid ${C.border}`, boxShadow: "0 1px 4px rgba(24, 40, 72,0.07)", padding: 20 } as React.CSSProperties,
  empty: { padding: 48, textAlign: "center", color: C.muted, fontSize: 13 } as React.CSSProperties,
};
const btn = {
  prim:  { ...ff, padding: "9px 16px", background: C.orange, border: "none", borderRadius: 8, cursor: "pointer", fontSize: 12, fontWeight: 700, color: "#fff" } as React.CSSProperties,
  ghost: { ...ff, padding: "9px 16px", background: "#fff", border: `1px solid ${C.border}`, borderRadius: 8, cursor: "pointer", fontSize: 12, fontWeight: 600, color: C.navy } as React.CSSProperties,
};
const banner = {
  err: { background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.25)", borderRadius: 8, padding: "10px 14px", fontSize: 12, color: C.danger } as React.CSSProperties,
};
