"use client";

import { useCallback, useEffect, useState } from "react";
import type { ReactNode } from "react";
import { cohortsApi, MyEnrollmentDTO, ParticipantDTO } from "@/lib/cohorts-api";
import { useAuth } from "@/lib/auth-context";

const NAVY = "var(--xa-navy)";
const ORANGE = "var(--xa-primary)";
const PAGE = "var(--xa-bg)";
const BORDER = "#E6DED0";
const MUTED = "var(--xa-muted)";
const SHADOW = "0 1px 4px rgba(24, 40, 72,0.07)";

interface CohortGroup {
  enrollment: MyEnrollmentDTO;
  peers: ParticipantDTO[];
}

export default function MyCohortsExperience({ enrollments, activeEnrollment }: { enrollments: MyEnrollmentDTO[]; activeEnrollment: MyEnrollmentDTO | null }) {
  const { user } = useAuth();
  const [groups, setGroups] = useState<CohortGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const activeProgramId = activeEnrollment?.program_id;

  const load = useCallback(async () => {
    const scopedEnrollments = activeProgramId
      ? enrollments.filter((enrollment) => enrollment.program_id === activeProgramId)
      : enrollments;
    const settled = await Promise.allSettled(
      scopedEnrollments.map((enrollment) => cohortsApi.listParticipants(enrollment.cohort_id).then((response) => response.data ?? [])),
    );
    setGroups(
      scopedEnrollments.map((enrollment, index) => ({
        enrollment,
        peers: settled[index].status === "fulfilled" ? (settled[index] as PromiseFulfilledResult<ParticipantDTO[]>).value : [],
      })),
    );
  }, [activeProgramId, enrollments]);

  useEffect(() => {
    let cancelled = false;
    void Promise.resolve().then(() => {
      if (cancelled) return;
      setLoading(true);
      load().finally(() => { if (!cancelled) setLoading(false); });
    });
    return () => { cancelled = true; };
  }, [load]);

  if (loading) return <Page><SoftEmpty label="Loading your cohorts..." /></Page>;

  if (groups.length === 0) {
    return (
      <Page>
        <EmptyCard
          title="No cohorts yet"
          body="You haven't been assigned to any cohort. Your program manager will notify you once cohorts are set up."
        />
      </Page>
    );
  }

  const cur = groups[0];
  const totalCohorts = groups.length;

  return (
    <Page>
      {/* Header banner */}
      <div style={{ background: "linear-gradient(135deg,var(--xa-navy),#2d3a7c)", borderRadius: 12, padding: "14px 20px", display: "flex", alignItems: "center", gap: 12 }}>
        <span style={{ fontSize: 16 }}>◇</span>
        <div>
          <div style={{ fontWeight: 700, fontSize: 13, color: "#fff", marginBottom: 3 }}>My Cohorts</div>
          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.65)" }}>Programs and sessions where you have been assigned to a cohort.</div>
        </div>
        <div style={{ marginLeft: "auto", background: "rgba(255,255,255,0.12)", borderRadius: 8, padding: "6px 14px", textAlign: "center" }}>
          <div style={{ fontSize: 18, fontWeight: 800, color: "#fff" }}>{totalCohorts}</div>
          <div style={{ fontSize: 9, color: "rgba(255,255,255,0.55)", fontWeight: 600 }}>COHORT{totalCohorts !== 1 ? "S" : ""}</div>
        </div>
      </div>

      {cur && <CohortDetail group={cur} myUserId={user?.id ?? ""} />}
    </Page>
  );
}

function CohortDetail({ group, myUserId }: { group: CohortGroup; myUserId: string }) {
  const { enrollment: e, peers } = group;
  const color = e.program_color || ORANGE;
  const sessionLabel = e.cohort_start_date ? `Starts ${fmtDate(e.cohort_start_date)}` : "Unscheduled";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* Program info */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 16px", background: "#F9FAFB", borderRadius: 10, border: `1px solid ${BORDER}` }}>
        <div style={{ width: 10, height: 10, borderRadius: "50%", background: color, flexShrink: 0 }} />
        <div style={{ flex: 1 }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: NAVY }}>{e.program_title}</span>
          <span style={{ fontSize: 11, color: MUTED, marginLeft: 12 }}>
            {fmtDate(e.cohort_start_date)} - {fmtDate(e.cohort_end_date)}
          </span>
        </div>
        <span style={{ fontSize: 11, background: "rgba(34,197,94,0.1)", color: "#22c55e", borderRadius: 10, padding: "3px 10px", fontWeight: 700 }}>
          {e.program_status.toUpperCase()}
        </span>
      </div>

      {/* Session group header */}
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: NAVY, letterSpacing: 0.5 }}>{e.cohort_name.toUpperCase()}</div>
          <div style={{ fontSize: 10, color: MUTED }}>{sessionLabel}</div>
          <div style={{ flex: 1, height: 1, background: BORDER }} />
        </div>

        {/* Cohort card */}
        <div style={{ background: "#fff", borderRadius: 12, border: `2px solid ${color}`, boxShadow: "0 2px 12px rgba(24, 40, 72,0.08)", overflow: "hidden" }}>
          <div style={{ background: `${color}10`, borderBottom: `1px solid ${color}22`, padding: "14px 18px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: NAVY }}>{e.cohort_name}</div>
                <span style={{ fontSize: 10, background: color, color: "#fff", borderRadius: 99, padding: "2px 9px", fontWeight: 700 }}>YOUR COHORT</span>
              </div>
              <div style={{ fontSize: 11, color: MUTED }}>{peers.length} member{peers.length !== 1 ? "s" : ""}</div>
            </div>
            <div style={{ width: 44, height: 44, borderRadius: 12, background: `${color}22`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, fontWeight: 800, color }}>
              {peers.length}
            </div>
          </div>

          {/* Peer members */}
          <div style={{ padding: "14px 18px" }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: MUTED, letterSpacing: 0.5, marginBottom: 10 }}>YOUR PEERS</div>
            {peers.length === 0 ? (
              <SoftEmpty label="No peer roster available for this cohort yet." />
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {peers.map((m) => {
                  const isMe = m.user_id === myUserId;
                  return (
                    <div
                      key={m.enrollment_id}
                      style={{
                        display: "flex", alignItems: "center", gap: 12, padding: "8px 12px", borderRadius: 8,
                        background: isMe ? `${color}08` : "#F9FAFB",
                        border: `1px solid ${isMe ? `${color}33` : BORDER}`,
                      }}
                    >
                      <div style={{ width: 32, height: 32, borderRadius: "50%", background: isMe ? color : NAVY, color: "#fff", fontSize: 10, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                        {initials(m.name)}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 12, fontWeight: isMe ? 700 : 500, color: NAVY }}>
                          {m.name}{isMe ? " (You)" : ""}
                        </div>
                        <div style={{ fontSize: 10, color: MUTED }}>{m.department || "-"}</div>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <div style={{ height: 5, width: 60, background: "#EFE9DC", borderRadius: 99 }}>
                          <div style={{ height: "100%", width: `${m.completion_percent}%`, background: m.completion_percent >= 60 ? "#22c55e" : m.completion_percent >= 30 ? "#f59e0b" : ORANGE, borderRadius: 99 }} />
                        </div>
                        <span style={{ fontSize: 10, fontWeight: 700, color: NAVY, minWidth: 28 }}>{m.completion_percent}%</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── primitives ────────────────────────────────────────────────────────────────
function Page({ children }: { children: ReactNode }) {
  return <div style={{ padding: 24, display: "flex", flexDirection: "column", gap: 16, fontFamily: "Poppins, sans-serif", background: PAGE }}>{children}</div>;
}
function SoftEmpty({ label }: { label: string }) {
  return <div style={{ padding: "18px 0", textAlign: "center", color: MUTED, fontSize: 12 }}>{label}</div>;
}
function EmptyCard({ title, body }: { title: string; body: string }) {
  return (
    <div style={{ background: "#fff", borderRadius: 12, border: `1px solid ${BORDER}`, boxShadow: SHADOW, padding: 48, textAlign: "center" }}>
      <div style={{ fontSize: 16, fontWeight: 800, color: NAVY, marginBottom: 8 }}>{title}</div>
      <div style={{ fontSize: 13, color: MUTED, lineHeight: 1.65, maxWidth: 460, margin: "0 auto" }}>{body}</div>
    </div>
  );
}
function initials(name: string) {
  return name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase();
}
function fmtDate(iso?: string) {
  if (!iso) return "-";
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}
