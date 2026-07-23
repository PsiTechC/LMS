"use client";

import { useCallback, useEffect, useState } from "react";
import { programsApi, ProgramDTO } from "@/lib/programs-api";
import { cohortsApi, CohortDTO, ParticipantDTO } from "@/lib/cohorts-api";
import { certificatesApi } from "@/lib/certificates-api";

const NAVY = "var(--xa-navy)";
const ORANGE = "var(--xa-primary)";
const MUTED = "var(--xa-muted)";
const BORDER = "#E6DED0";
const GREEN = "#22c55e";
const SHADOW = "0 1px 4px rgba(24,40,72,0.07)";

const inputStyle: React.CSSProperties = {
  width: "100%", border: `1px solid ${BORDER}`, borderRadius: 7, padding: "7px 10px",
  fontSize: 12, fontFamily: "Poppins, sans-serif", color: NAVY, boxSizing: "border-box",
};

// PM/SA manual issue/revoke screen - exceptions/backfills only. Automatic
// issuance already happens on 100% completion (see the certificates
// module's completion hook); this screen exists for programs that aren't
// quiz-gated, or a participant who genuinely completed but the automatic
// trigger hasn't run yet.
export default function CertificatesAdmin({ orgId }: { orgId: string }) {
  const [programs, setPrograms] = useState<ProgramDTO[]>([]);
  const [programId, setProgramId] = useState("");
  const [cohorts, setCohorts] = useState<CohortDTO[]>([]);
  const [cohortId, setCohortId] = useState("");
  const [participants, setParticipants] = useState<ParticipantDTO[]>([]);
  const [busyEnrollmentId, setBusyEnrollmentId] = useState<string | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    programsApi.list(orgId).then((res) => setPrograms(res.data)).catch(() => setPrograms([]));
  }, [orgId]);

  useEffect(() => {
    if (!programId) { setCohorts([]); setCohortId(""); return; }
    cohortsApi.list(orgId, programId).then((res) => setCohorts(res.data)).catch(() => setCohorts([]));
  }, [orgId, programId]);

  const loadParticipants = useCallback(() => {
    if (!cohortId) { setParticipants([]); return; }
    cohortsApi.listParticipants(cohortId).then((res) => setParticipants(res.data)).catch(() => setParticipants([]));
  }, [cohortId]);

  useEffect(() => { loadParticipants(); }, [loadParticipants]);

  async function handleIssue(enrollmentId: string) {
    setBusyEnrollmentId(enrollmentId);
    setError("");
    try {
      await certificatesApi.manualIssue(enrollmentId);
      loadParticipants();
    } catch (e: unknown) {
      setError((e as Error).message ?? "Failed to issue certificate");
    } finally {
      setBusyEnrollmentId(null);
    }
  }

  return (
    <div style={{ padding: 24, display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ fontSize: 17, fontWeight: 700, color: NAVY }}>Certificates</div>
      <div style={{ fontSize: 12, color: MUTED, marginTop: -8 }}>
        Certificates are issued automatically when a participant reaches 100% completion in a program with a certificate template attached. Use this screen only for exceptions.
      </div>

      <div style={{ display: "flex", gap: 12 }}>
        <div style={{ flex: 1 }}>
          <select value={programId} onChange={(e) => setProgramId(e.target.value)} style={inputStyle}>
            <option value="">Select a program…</option>
            {programs.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
          </select>
        </div>
        <div style={{ flex: 1 }}>
          <select value={cohortId} onChange={(e) => setCohortId(e.target.value)} style={inputStyle} disabled={!programId}>
            <option value="">Select a cohort…</option>
            {cohorts.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
      </div>

      {error && <div style={{ fontSize: 11, color: "#ef4444" }}>{error}</div>}

      {cohortId && (
        <div style={{ background: "#fff", border: `1px solid ${BORDER}`, borderRadius: 12, boxShadow: SHADOW, overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: "#F7F5F0" }}>
                <Th>Participant</Th>
                <Th>Completion</Th>
                <Th>Status</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {participants.map((p) => (
                <tr key={p.enrollment_id} style={{ borderTop: `1px solid ${BORDER}` }}>
                  <td style={{ padding: "10px 14px", fontSize: 12, color: NAVY }}>{p.name}<div style={{ fontSize: 10, color: MUTED }}>{p.email}</div></td>
                  <td style={{ padding: "10px 14px", fontSize: 12, color: NAVY }}>{p.completion_percent}%</td>
                  <td style={{ padding: "10px 14px", fontSize: 11 }}>
                    {p.completion_percent >= 100
                      ? <span style={{ color: GREEN, fontWeight: 700 }}>Complete</span>
                      : <span style={{ color: MUTED }}>In progress</span>}
                  </td>
                  <td style={{ padding: "10px 14px", textAlign: "right" }}>
                    <button
                      onClick={() => handleIssue(p.enrollment_id)}
                      disabled={busyEnrollmentId === p.enrollment_id}
                      style={{
                        padding: "6px 14px", background: ORANGE, border: "none", borderRadius: 7, color: "#fff",
                        fontSize: 11, fontWeight: 700, cursor: busyEnrollmentId === p.enrollment_id ? "not-allowed" : "pointer",
                        fontFamily: "Poppins, sans-serif",
                      }}
                    >
                      {busyEnrollmentId === p.enrollment_id ? "Issuing…" : "Issue Certificate"}
                    </button>
                  </td>
                </tr>
              ))}
              {participants.length === 0 && (
                <tr><td colSpan={4} style={{ padding: "20px 14px", fontSize: 12, color: MUTED, textAlign: "center" }}>No participants in this cohort.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Th({ children }: { children?: React.ReactNode }) {
  return <th style={{ padding: "10px 14px", textAlign: "left", fontSize: 11, fontWeight: 700, color: MUTED, letterSpacing: 0.5 }}>{children}</th>;
}
