"use client";

import { useCallback, useEffect, useState } from "react";
import type { CSSProperties } from "react";
import { programsApi, ProgramDTO } from "@/lib/programs-api";
import DiscussionsExperience from "@/components/participant/DiscussionsExperience";

const NAVY = "var(--xa-navy)";
const BORDER = "#E6DED0";
const MUTED = "var(--xa-muted)";

// PM Discussions — pick a program, then view its program-wide forum + announcements.
// The PM is staff, so DiscussionsExperience gives them pin/delete controls.
// New threads are posted into the program's first cohort (PMs read/moderate;
// authoring in a specific cohort is the faculty flow).
export default function PMDiscussions({ orgId }: { orgId: string }) {
  const [programs, setPrograms] = useState<ProgramDTO[]>([]);
  const [selected, setSelected] = useState<string>("");
  const [cohortId, setCohortId] = useState<string>("");
  const [loading, setLoading] = useState(true);

  const loadPrograms = useCallback(async () => {
    if (!orgId) return;
    try {
      const res = await programsApi.list(orgId);
      const list = res.data ?? [];
      setPrograms(list);
      setSelected((cur) => cur || list[0]?.id || "");
    } catch { setPrograms([]); }
    finally { setLoading(false); }
  }, [orgId]);

  useEffect(() => {
    let cancelled = false;
    void Promise.resolve().then(() => { if (!cancelled) loadPrograms(); });
    return () => { cancelled = true; };
  }, [loadPrograms]);

  // Resolve a cohort in the selected program (for posting new threads).
  const loadCohort = useCallback(async () => {
    if (!selected || !orgId) { setCohortId(""); return; }
    try {
      const res = await (await import("@/lib/cohorts-api")).cohortsApi.list(orgId, selected);
      setCohortId(res.data?.[0]?.id ?? "");
    } catch { setCohortId(""); }
  }, [selected, orgId]);

  useEffect(() => {
    let cancelled = false;
    void Promise.resolve().then(() => { if (!cancelled) loadCohort(); });
    return () => { cancelled = true; };
  }, [loadCohort]);

  if (loading) return <div style={{ padding: 24, color: MUTED, fontFamily: "Poppins, sans-serif" }}>Loading programs…</div>;
  if (programs.length === 0) {
    return <div style={{ padding: 24, color: MUTED, fontFamily: "Poppins, sans-serif" }}>No programs yet. Create a program to start discussions.</div>;
  }

  return (
    <div>
      {/* Program selector */}
      <div style={{ padding: "16px 24px 0", fontFamily: "Poppins, sans-serif" }}>
        <label style={{ fontSize: 10, fontWeight: 700, color: MUTED, letterSpacing: 0.5, textTransform: "uppercase", display: "block", marginBottom: 6 }}>Program</label>
        <select value={selected} onChange={(e) => setSelected(e.target.value)} style={select}>
          {programs.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
        </select>
      </div>
      {/* key forces a clean reload when the program changes */}
      <DiscussionsExperience key={selected} programId={selected} cohortId={cohortId} />
    </div>
  );
}

const select: CSSProperties = { border: `1px solid ${BORDER}`, borderRadius: 8, padding: "9px 12px", fontSize: 13, color: NAVY, fontFamily: "Poppins, sans-serif", background: "#fff", outline: "none", minWidth: 280 };
