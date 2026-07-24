"use client";

import { useCallback, useEffect, useState } from "react";
import type { CSSProperties } from "react";
import { programsApi, ProgramDTO } from "@/lib/programs-api";
import DiscussionsExperience from "@/components/participant/DiscussionsExperience";

const NAVY = "var(--xa-navy)";
const BORDER = "#E6DED0";
const MUTED = "var(--xa-muted)";

// PM Discussions - pick a program, then view its program-wide forum + announcements.
// The PM is staff, so DiscussionsExperience gives them pin/delete controls.
// New threads are posted into the program's first cohort (PMs read/moderate;
// authoring in a specific cohort is the faculty flow).
export default function PMDiscussions({ orgId, externalProgramId }: { orgId: string;
  // When set, discussions for this program show directly with no internal
  // program <select> rendered - the caller (the top-level PMProgramSwitcher)
  // is driving the selection instead. undefined (the default) preserves the
  // original self-contained program-picker behavior.
  externalProgramId?: string;
}) {
  const isExternallyControlled = externalProgramId !== undefined;
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
      if (!isExternallyControlled) setSelected((cur) => cur || list[0]?.id || "");
    } catch { setPrograms([]); }
    finally { setLoading(false); }
  }, [orgId, isExternallyControlled]);

  useEffect(() => {
    let cancelled = false;
    void Promise.resolve().then(() => { if (!cancelled) loadPrograms(); });
    return () => { cancelled = true; };
  }, [loadPrograms]);

  const effectiveSelected = isExternallyControlled ? (externalProgramId || "") : selected;

  // Resolve a cohort in the selected program (for posting new threads).
  const loadCohort = useCallback(async () => {
    if (!effectiveSelected || !orgId) { setCohortId(""); return; }
    try {
      const res = await (await import("@/lib/cohorts-api")).cohortsApi.list(orgId, effectiveSelected);
      setCohortId(res.data?.[0]?.id ?? "");
    } catch { setCohortId(""); }
  }, [effectiveSelected, orgId]);

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
      {/* Program selector - hidden when externally controlled (e.g. PM's
          top-level PMProgramSwitcher already picks the program - showing
          this too would be a redundant second filter). */}
      {!isExternallyControlled && (
        <div style={{ padding: "16px 24px 0", fontFamily: "Poppins, sans-serif" }}>
          <label style={{ fontSize: 10, fontWeight: 700, color: MUTED, letterSpacing: 0.5, textTransform: "uppercase", display: "block", marginBottom: 6 }}>Program</label>
          <select value={selected} onChange={(e) => setSelected(e.target.value)} style={select}>
            {programs.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
          </select>
        </div>
      )}
      {/* key forces a clean reload when the program changes */}
      <DiscussionsExperience key={effectiveSelected} programId={effectiveSelected} cohortId={cohortId} />
    </div>
  );
}

const select: CSSProperties = { border: `1px solid ${BORDER}`, borderRadius: 8, padding: "9px 12px", fontSize: 13, color: NAVY, fontFamily: "Poppins, sans-serif", background: "#fff", outline: "none", minWidth: 280 };
