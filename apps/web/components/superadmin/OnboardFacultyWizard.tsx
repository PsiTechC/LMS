"use client";

import { useState, useEffect } from "react";
import { api, ApiResponse, OrgResponse } from "@/lib/api";
import { programsApi } from "@/lib/programs-api";
import { rolesApi, CustomRoleDTO } from "@/lib/roles-api";
import { facultyMgmtApi, OnboardFacultyBody } from "@/lib/faculty-mgmt-api";

// ── Slate / Admin design tokens (FRONTEND_CLAUDE.md) ────────────────────────
const C = {
  navy: "#182848", slate: "#334155", slateL: "#64748b", orange: "#C8A860",
  page: "#F7F5F0", card: "#FFFFFF", alt: "#EFE9DC", border: "#E6DED0",
  muted: "#4A5573", green: "#22c55e", indigo: "#4A5573", danger: "#ef4444",
};
const ff = { fontFamily: "Poppins, sans-serif" } as const;

const STEP_LABELS = ["Personal Info", "Professional Profile", "Program Assignment", "Platform Access"];

const SPECIALIZATIONS = [
  "Leadership & Executive Coaching", "Finance & Business Strategy", "Communication & Executive Presence",
  "Digital Leadership & Change Mgmt", "OD & Talent Management", "Sales & Commercial Strategy",
  "Data & Analytics", "Product Management", "Diversity & Inclusion", "Operations", "Human Resources", "Marketing",
];
const DELIVERY_MODES = [
  { value: "virtual", label: "Virtual" },
  { value: "in-person", label: "In-Person" },
  { value: "hybrid", label: "Hybrid" },
];
const ROLE_ON_PROGRAM = ["Lead Facilitator", "Co-Facilitator", "Guest Speaker", "Mentor", "Assessor"];
const AVAILABILITY = ["Weekdays", "Weekends only", "Evenings", "Full-time", "Part-time", "On-demand"];

const ACCESS_LEVELS = [
  { value: "standard", label: "Standard", desc: "Access to assigned programs, sessions, grading and discussions." },
  { value: "advanced", label: "Advanced", desc: "All Standard + analytics, content upload, cohort-level reporting." },
  { value: "admin",    label: "Admin",    desc: "Full program-level access including cohort management and comms." },
];

const emailValid = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e.trim());
const phoneValid = (p: string) => p.trim() === "" || /^\+?[0-9\s\-()]{7,20}$/.test(p.trim());

interface ProgramOption { id: string; title: string; orgId: string; }

export default function OnboardFacultyWizard({ onComplete, onCancel, targetRole = "faculty" }: {
  onComplete: () => void; onCancel: () => void; targetRole?: "faculty" | "coach";
}) {
  const isCoach = targetRole === "coach";
  const [step, setStep] = useState(1);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const [done, setDone] = useState<{ tempPassword?: string; emailSent: boolean; name: string } | null>(null);

  // Step 1
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName]   = useState("");
  const [email, setEmail]         = useState("");
  const [phone, setPhone]         = useState("");
  const [location, setLocation]   = useState("");
  const [linkedin, setLinkedin]   = useState("");
  // Step 2
  const [specialization, setSpecialization] = useState("");
  const [certifications, setCertifications] = useState("");
  const [bio, setBio]                       = useState("");
  const [deliveryMode, setDeliveryMode]     = useState("");
  // Step 2 - coaching-specific (only shown/required when targetRole="coach")
  const [coachingYears, setCoachingYears]       = useState(0);
  const [coachingMethodology, setCoachingMethodology] = useState("");
  const [maxCoachees, setMaxCoachees]           = useState(0);
  const [sessionMins, setSessionMins]           = useState(45);
  const [timeZone, setTimeZone]                 = useState("");
  // Step 3
  const [orgs, setOrgs]           = useState<OrgResponse[]>([]);
  const [selectedOrgId, setSelectedOrgId] = useState("");
  const [programs, setPrograms]   = useState<ProgramOption[]>([]);
  const [selectedPrograms, setSelectedPrograms] = useState<Set<string>>(new Set());
  const [roleOnProgram, setRoleOnProgram] = useState(ROLE_ON_PROGRAM[0]);
  const [sessionsPlanned, setSessionsPlanned] = useState(0);
  const [availability, setAvailability]   = useState(AVAILABILITY[0]);
  // Step 4
  const [accessLevel, setAccessLevel]   = useState("standard");
  const [sendWelcome, setSendWelcome]   = useState(true);
  const [baseRoles, setBaseRoles]       = useState<CustomRoleDTO[]>([]);

  // Load real programs across all orgs (matches the "All Orgs" header context).
  useEffect(() => {
    let cancelled = false;
    api.get<ApiResponse<OrgResponse[]>>("/organizations").then(async (r) => {
      const orgList = r.data ?? [];
      if (cancelled) return;
      setOrgs(orgList);
      if (orgList.length === 1) setSelectedOrgId(orgList[0].id);
      const lists = await Promise.all(
        orgList.map((o) =>
          programsApi.list(o.id)
            .then((pr) => (pr.data ?? []).map((p) => ({ id: p.id, title: p.title, orgId: o.id })))
            .catch(() => [] as ProgramOption[])),
      );
      if (!cancelled) setPrograms(lists.flat());
    }).catch(() => {});
    rolesApi.listBaseRoles().then((r) => setBaseRoles(r.data ?? [])).catch(() => {});
    return () => { cancelled = true; };
  }, []);

  const step1Valid = firstName.trim() !== "" && lastName.trim() !== "" && emailValid(email) && phoneValid(phone);
  const step2Valid = specialization !== "" && deliveryMode !== "";
  const step3Valid = selectedOrgId !== "";
  const facultyRole = baseRoles.find((r) => r.base_role === targetRole);
  const programsForOrg = programs.filter((p) => p.orgId === selectedOrgId);

  function toggleProgram(id: string) {
    setSelectedPrograms((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }
  function next() {
    if (step === 1 && !step1Valid) return;
    if (step === 2 && !step2Valid) return;
    if (step === 3 && !step3Valid) return;
    setErr("");
    setStep((s) => Math.min(4, s + 1));
  }
  function back() { setErr(""); setStep((s) => Math.max(1, s - 1)); }

  async function complete() {
    setSaving(true); setErr("");
    try {
      const body: OnboardFacultyBody = {
        name: `${firstName.trim()} ${lastName.trim()}`.trim(),
        email: email.trim(),
        phone: phone.trim() || undefined,
        location: location.trim() || undefined,
        org_id: selectedOrgId,
        target_role: targetRole,
        specialization: specialization || undefined,
        certifications: certifications.split(",").map((c) => c.trim()).filter(Boolean),
        bio: bio.trim() || undefined,
        delivery_modes: deliveryMode ? [deliveryMode] : [],
        linkedin_url: linkedin.trim() || undefined,
        ...(isCoach ? {
          coaching_years_experience: coachingYears || undefined,
          coaching_methodology: coachingMethodology || undefined,
          max_concurrent_coachees: maxCoachees || undefined,
          preferred_session_mins: sessionMins || undefined,
          time_zone: timeZone.trim() || undefined,
        } : {}),
        assignments: Array.from(selectedPrograms).map((pid) => ({
          program_id: pid,
          role_on_program: roleOnProgram,
          sessions_planned: sessionsPlanned,
          availability: { preference: availability },
        })),
        access_level: accessLevel,
        send_welcome_email: sendWelcome,
      };
      const res = await facultyMgmtApi.onboard(body);
      setDone({ tempPassword: res.data.temporary_password, emailSent: res.data.welcome_email_sent, name: body.name });
    } catch (e) {
      setErr((e as Error).message);
      setSaving(false);
    }
  }

  // ── Success ──
  if (done) {
    return (
      <div style={{ ...ff, padding: 24 }}>
        <div style={{ ...panel, maxWidth: 560, margin: "0 auto", textAlign: "center", padding: 36 }}>
          <div style={{ width: 56, height: 56, borderRadius: "50%", background: `${C.green}18`, color: C.green, fontSize: 28, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px" }}>✓</div>
          <div style={{ fontSize: 17, fontWeight: 700, color: C.navy, marginBottom: 6 }}>{done.name} onboarded</div>
          <div style={{ fontSize: 13, color: C.slateL, marginBottom: 18 }}>
            {done.emailSent ? "A welcome email with login credentials has been sent." : "No welcome email was sent - share the temporary password below."}
          </div>
          {!done.emailSent && done.tempPassword && (
            <div style={{ background: C.page, border: `1px solid ${C.border}`, borderRadius: 8, padding: "12px 16px", marginBottom: 18 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: C.muted, textTransform: "uppercase", letterSpacing: 0.5 }}>Temporary password</div>
              <div style={{ fontSize: 15, fontWeight: 700, color: C.navy, fontFamily: "monospace" }}>{done.tempPassword}</div>
            </div>
          )}
          <button onClick={onComplete} style={btn.prim}>{isCoach ? "Done" : "Go to Faculty Roster"}</button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ ...ff, padding: 24, display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Horizontal stepper */}
      <div style={panel}>
        <div style={{ display: "flex", alignItems: "center", padding: "16px 22px" }}>
          {STEP_LABELS.map((label, i) => {
            const n = i + 1;
            const state = n < step ? "done" : n === step ? "current" : "future";
            const filled = state !== "future";
            return (
              <div key={n} style={{ display: "flex", alignItems: "center", flex: i < STEP_LABELS.length - 1 ? 1 : "0 0 auto" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
                  <div style={{
                    width: 26, height: 26, borderRadius: "50%", flexShrink: 0,
                    background: filled ? C.navy : C.alt, color: filled ? "#fff" : C.muted,
                    fontSize: 12, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center",
                  }}>
                    {state === "done" ? "✓" : n}
                  </div>
                  <span style={{ fontSize: 13, fontWeight: state === "current" ? 700 : 500, color: state === "future" ? C.muted : C.navy, whiteSpace: "nowrap" }}>{label}</span>
                </div>
                {i < STEP_LABELS.length - 1 && (
                  <div style={{ flex: 1, height: 1, background: n < step ? C.navy : C.border, margin: "0 14px" }} />
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Step content */}
      <div style={panel}>
        <div style={{ padding: 24 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: C.navy, marginBottom: 18 }}>Step {step}: {stepTitle(step)}</div>
          {err && <div style={{ ...banner.err, marginBottom: 14 }}>{err}</div>}

          {/* STEP 1 */}
          {step === 1 && (
            <div>
              <Row>
                <Field label="First Name *"><input value={firstName} onChange={(e) => setFirstName(e.target.value)} style={input} placeholder="e.g. Priya" autoFocus /></Field>
                <Field label="Last Name *"><input value={lastName} onChange={(e) => setLastName(e.target.value)} style={input} placeholder="e.g. Verma" /></Field>
              </Row>
              <Row>
                <Field label="Email Address *">
                  <input value={email} onChange={(e) => setEmail(e.target.value)} style={{ ...input, borderColor: email && !emailValid(email) ? C.danger : C.border }} placeholder="faculty@organisation.com" />
                  {email && !emailValid(email) && <div style={{ fontSize: 11, color: C.danger, marginTop: 4 }}>Enter a valid email address.</div>}
                </Field>
                <Field label="Phone Number">
                  <input value={phone} onChange={(e) => setPhone(e.target.value)} style={{ ...input, borderColor: phone && !phoneValid(phone) ? C.danger : C.border }} placeholder="+91 98765 43210" />
                  {phone && !phoneValid(phone) && <div style={{ fontSize: 11, color: C.danger, marginTop: 4 }}>Enter a valid phone number.</div>}
                </Field>
              </Row>
              <Row>
                <Field label="Location / City"><input value={location} onChange={(e) => setLocation(e.target.value)} style={input} placeholder="e.g. Mumbai" /></Field>
                <Field label="LinkedIn Profile"><input value={linkedin} onChange={(e) => setLinkedin(e.target.value)} style={input} placeholder="https://linkedin.com/in/…" /></Field>
              </Row>
            </div>
          )}

          {/* STEP 2 */}
          {step === 2 && (
            <div>
              <Field label="Specialization / Domain *">
                <select value={specialization} onChange={(e) => setSpecialization(e.target.value)} style={input}>
                  <option value="">- Select specialization -</option>
                  {SPECIALIZATIONS.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </Field>
              <Field label="Certifications & Qualifications">
                <input value={certifications} onChange={(e) => setCertifications(e.target.value)} style={input} placeholder="e.g. ICF PCC, PhD Org. Psychology, MBA IIM-A" />
              </Field>
              <Field label="Bio / Introduction">
                <textarea value={bio} onChange={(e) => setBio(e.target.value)} style={{ ...input, minHeight: 100, resize: "vertical" as const }} placeholder="A brief introduction that will be shared with participants…" />
              </Field>
              <Field label="Delivery Modes *">
                <div style={{ display: "flex", gap: 10 }}>
                  {DELIVERY_MODES.map((m) => {
                    const on = deliveryMode === m.value;
                    return (
                      <label key={m.value} style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", padding: "9px 16px", borderRadius: 8, fontSize: 13, fontWeight: on ? 700 : 500, border: `1px solid ${on ? C.orange : C.border}`, background: on ? "rgba(200, 168, 96,0.06)" : "#fff", color: on ? C.orange : C.slateL }}>
                        <input type="radio" checked={on} onChange={() => setDeliveryMode(m.value)} style={{ accentColor: C.orange }} />
                        {m.label}
                      </label>
                    );
                  })}
                </div>
              </Field>

              {isCoach && (
                <>
                  <div style={{ fontSize: 10, fontWeight: 700, color: C.muted, textTransform: "uppercase", letterSpacing: 0.5, margin: "18px 0 12px" }}>Coaching Profile</div>
                  <Row>
                    <Field label="Years of Coaching Experience"><input type="number" min={0} value={coachingYears} onChange={(e) => setCoachingYears(Math.max(0, Number(e.target.value) || 0))} style={input} /></Field>
                    <Field label="Coaching Methodology"><input value={coachingMethodology} onChange={(e) => setCoachingMethodology(e.target.value)} style={input} placeholder="e.g. GROW Model, Executive Coaching" /></Field>
                  </Row>
                  <Row>
                    <Field label="Max Concurrent Coachees"><input type="number" min={0} value={maxCoachees} onChange={(e) => setMaxCoachees(Math.max(0, Number(e.target.value) || 0))} style={input} /></Field>
                    <Field label="Preferred Session Length (mins)"><input type="number" min={0} value={sessionMins} onChange={(e) => setSessionMins(Math.max(0, Number(e.target.value) || 0))} style={input} /></Field>
                  </Row>
                  <Field label="Time Zone"><input value={timeZone} onChange={(e) => setTimeZone(e.target.value)} style={input} placeholder="e.g. Asia/Kolkata (IST)" /></Field>
                </>
              )}
            </div>
          )}

          {/* STEP 3 */}
          {step === 3 && (
            <div>
              <Field label="Organization *">
                <select value={selectedOrgId} onChange={(e) => { setSelectedOrgId(e.target.value); setSelectedPrograms(new Set()); }} style={input}>
                  <option value="">Select organization</option>
                  {orgs.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
                </select>
                <div style={{ fontSize: 11, color: C.muted, marginTop: 6 }}>
                  Required - this is the organization the faculty member is onboarded into, independent of any program assignment below.
                </div>
              </Field>

              <Field label="Assign to Programs">
                {!selectedOrgId ? (
                  <div style={{ fontSize: 12, color: C.muted }}>Select an organization above to see its programs.</div>
                ) : programsForOrg.length === 0 ? (
                  <div style={{ fontSize: 12, color: C.muted }}>No programs available yet for this organization.</div>
                ) : (
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                    {programsForOrg.map((p) => {
                      const on = selectedPrograms.has(p.id);
                      return (
                        <label key={p.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "11px 14px", borderRadius: 8, cursor: "pointer", background: on ? "rgba(24, 40, 72,0.05)" : "#fff", border: `1px solid ${on ? C.navy : C.border}` }}>
                          <input type="checkbox" checked={on} onChange={() => toggleProgram(p.id)} style={{ accentColor: C.navy }} />
                          <span style={{ fontSize: 13, color: C.navy, fontWeight: on ? 600 : 500 }}>{p.title}</span>
                        </label>
                      );
                    })}
                  </div>
                )}
              </Field>

              <div style={{ background: C.page, border: `1px solid ${C.border}`, borderRadius: 10, padding: 16, marginTop: 14 }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: C.muted, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 12 }}>Assignment Details</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
                  <Field label="Role on Program">
                    <select value={roleOnProgram} onChange={(e) => setRoleOnProgram(e.target.value)} style={input}>
                      {ROLE_ON_PROGRAM.map((r) => <option key={r} value={r}>{r}</option>)}
                    </select>
                  </Field>
                  <Field label="Sessions Planned">
                    <input type="number" min={0} value={sessionsPlanned} onChange={(e) => setSessionsPlanned(Math.max(0, Number(e.target.value) || 0))} style={input} />
                  </Field>
                  <Field label="Availability">
                    <select value={availability} onChange={(e) => setAvailability(e.target.value)} style={input}>
                      {AVAILABILITY.map((a) => <option key={a} value={a}>{a}</option>)}
                    </select>
                  </Field>
                </div>
              </div>
            </div>
          )}

          {/* STEP 4 */}
          {step === 4 && (
            <div>
              <Field label="Access Level">
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
                  {ACCESS_LEVELS.map((a) => {
                    const on = accessLevel === a.value;
                    return (
                      <label key={a.value} style={{ cursor: "pointer", padding: "14px 16px", borderRadius: 10, border: `1.5px solid ${on ? C.navy : C.border}`, background: on ? "rgba(24, 40, 72,0.03)" : "#fff", display: "flex", flexDirection: "column", gap: 5 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <input type="radio" checked={on} onChange={() => setAccessLevel(a.value)} style={{ accentColor: C.navy }} />
                          <span style={{ fontSize: 13, fontWeight: 700, color: C.navy }}>{a.label}</span>
                        </div>
                        <span style={{ fontSize: 11, color: C.muted, lineHeight: 1.5 }}>{a.desc}</span>
                      </label>
                    );
                  })}
                </div>
                <div style={{ fontSize: 11, color: C.muted, marginTop: 8 }}>
                  Base role assigned via Role Management: <strong style={{ color: C.navy }}>{facultyRole?.name ?? (isCoach ? "Coach" : "Faculty")}</strong>.
                </div>
              </Field>

              <div style={{ background: C.page, border: `1px solid ${C.border}`, borderRadius: 10, padding: 16, margin: "14px 0" }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: C.muted, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 10 }}>Review Summary</div>
                <Review label="Name" value={`${firstName} ${lastName}`.trim() || "-"} />
                <Review label="Email" value={email || "-"} />
                {location && <Review label="Location" value={location} />}
                {specialization && <Review label="Specialization" value={specialization} />}
                <Review label="Organization" value={orgs.find((o) => o.id === selectedOrgId)?.name ?? "-"} />
                <Review label="Programs" value={selectedPrograms.size > 0 ? `${selectedPrograms.size} assigned` : "None"} />
                <Review label="Access Level" value={ACCESS_LEVELS.find((a) => a.value === accessLevel)?.label ?? accessLevel} />
              </div>

              <label style={{ display: "flex", alignItems: "flex-start", gap: 10, cursor: "pointer", padding: "12px 14px", borderRadius: 10, border: `1px solid ${sendWelcome ? C.green : C.border}`, background: sendWelcome ? "rgba(34,197,94,0.05)" : "#fff" }}>
                <input type="checkbox" checked={sendWelcome} onChange={(e) => setSendWelcome(e.target.checked)} style={{ width: 17, height: 17, accentColor: C.green, marginTop: 1 }} />
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: C.navy }}>Send Welcome Email with Login Credentials</div>
                  <div style={{ fontSize: 12, color: C.muted }}>An onboarding email will be sent to {email || "the faculty member"}.</div>
                </div>
              </label>
            </div>
          )}

          {/* Footer */}
          <div style={{ display: "flex", justifyContent: "space-between", gap: 8, marginTop: 22 }}>
            {step === 1
              ? <button onClick={onCancel} style={btn.ghost}>Cancel</button>
              : <button onClick={back} style={btn.ghost}>← Back</button>}
            {step < 4
              ? (() => {
                  const blocked = (step === 1 && !step1Valid) || (step === 2 && !step2Valid) || (step === 3 && !step3Valid);
                  return (
                    <button onClick={next} disabled={blocked}
                      style={{ ...btn.prim, background: blocked ? C.muted : C.navy, cursor: blocked ? "not-allowed" : "pointer" }}>
                      Next: {STEP_LABELS[step]} →
                    </button>
                  );
                })()
              : <button onClick={complete} disabled={saving} style={{ ...btn.prim, background: C.green, opacity: saving ? 0.6 : 1 }}>
                  {saving ? "Onboarding…" : "+ Complete Onboarding"}
                </button>}
          </div>
        </div>
      </div>
    </div>
  );
}

function stepTitle(step: number) {
  return ["Personal Information", "Professional Profile", "Program Assignment", "Platform Access & Send Invite"][step - 1];
}

// ── primitives ───────────────────────────────────────────────────────────────

function Row({ children }: { children: React.ReactNode }) {
  return <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>{children}</div>;
}
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <label style={{ fontSize: 10, fontWeight: 700, color: C.muted, display: "block", marginBottom: 6, letterSpacing: 0.5, textTransform: "uppercase" }}>{label}</label>
      {children}
    </div>
  );
}
function Review({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", padding: "5px 0", fontSize: 13 }}>
      <span style={{ color: C.muted }}>{label}</span>
      <span style={{ color: C.navy, fontWeight: 600, textAlign: "right", maxWidth: "60%" }}>{value}</span>
    </div>
  );
}

const panel: React.CSSProperties = {
  background: C.card, borderRadius: 12, border: `1px solid ${C.border}`, boxShadow: "0 1px 4px rgba(24, 40, 72,0.07)",
};
const input: React.CSSProperties = {
  width: "100%", border: `1px solid ${C.border}`, borderRadius: 8, padding: "10px 12px",
  fontSize: 13, color: C.navy, fontFamily: "Poppins, sans-serif", outline: "none", boxSizing: "border-box", background: "#fff",
};
const btn = {
  prim:  { ...ff, padding: "10px 20px", background: C.navy, border: "none", borderRadius: 8, cursor: "pointer", fontSize: 12, fontWeight: 700, color: "#fff" } as React.CSSProperties,
  ghost: { ...ff, padding: "9px 18px", background: "#fff", border: `1px solid ${C.border}`, borderRadius: 8, cursor: "pointer", fontSize: 12, fontWeight: 600, color: C.navy } as React.CSSProperties,
};
const banner = {
  err: { background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.25)", borderRadius: 8, padding: "10px 14px", fontSize: 12, color: C.danger } as React.CSSProperties,
};
