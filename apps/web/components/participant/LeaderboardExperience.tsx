"use client";

import { useCallback, useEffect, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import { leaderboardApi, MyLeaderboardDTO, LeaderRowDTO, BadgeDTO } from "@/lib/leaderboard-api";

const NAVY = "#1C2551";
const ORANGE = "#EF4E24";
const PAGE = "#F5F7FB";
const BORDER = "#EAECF4";
const MUTED = "#8b90a7";
const SHADOW = "0 1px 4px rgba(28,37,81,0.07)";

const CATEGORY_LABELS: [keyof MyLeaderboardDTO["breakdown"], string][] = [
  ["module_completions", "Module Completions"],
  ["assessments", "Assessments"],
  ["discussions", "Discussions"],
  ["reflections", "Reflections"],
  ["coaching_attendance", "Coaching Attendance"],
];

export default function LeaderboardExperience() {
  const [data, setData] = useState<MyLeaderboardDTO | null>(null);
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await leaderboardApi.my();
      setData(normalize(res.data));
    } catch {
      setData(null);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    void Promise.resolve().then(() => {
      if (cancelled) return;
      setLoading(true);
      load().finally(() => { if (!cancelled) setLoading(false); });
    });
    return () => { cancelled = true; };
  }, [load]);

  async function toggleVisibility() {
    if (!data) return;
    setToggling(true);
    try {
      const res = await leaderboardApi.setVisibility(!data.show_on_leaderboard);
      setData(normalize(res.data));
    } finally { setToggling(false); }
  }

  if (loading) return <Page><SoftEmpty label="Loading your leaderboard..." /></Page>;

  if (!data?.has_cohort) {
    return <Page><EmptyCard title="Not in a cohort yet" body="Once you're enrolled in a cohort, your points, ranking, and badges will appear here." /></Page>;
  }

  return (
    <Page>
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) 300px", gap: 16 }}>
        {/* Cohort Leaderboard */}
        <Card>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <div style={{ fontWeight: 700, fontSize: 14, color: NAVY }}>Cohort Leaderboard</div>
            <VisibilityToggle on={data.show_on_leaderboard} busy={toggling} onToggle={toggleVisibility} />
          </div>
          {data.leaders.map((l) => <LeaderRow key={l.user_id} row={l} />)}
          {data.leaders.length === 0 && <SoftEmpty label="No ranked participants yet." />}
          {!data.show_on_leaderboard && (
            <div style={{ marginTop: 10, fontSize: 11, color: MUTED, fontStyle: "italic" }}>
              You&rsquo;re hidden from other participants&rsquo; leaderboards. You still see your own rank ({data.my_rank ? `#${data.my_rank}` : "—"}).
            </div>
          )}
        </Card>

        {/* Right column */}
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <Card>
            <div style={{ fontWeight: 700, fontSize: 13, color: NAVY, marginBottom: 12 }}>My Points Breakdown</div>
            {CATEGORY_LABELS.map(([key, label]) => (
              <div key={key} style={{ display: "flex", justifyContent: "space-between", padding: "7px 0", borderBottom: `1px solid ${BORDER}`, fontSize: 12 }}>
                <span style={{ color: MUTED }}>{label}</span>
                <span style={{ fontWeight: 700, color: NAVY }}>{data.breakdown[key].toLocaleString()} pts</span>
              </div>
            ))}
            <div style={{ display: "flex", justifyContent: "space-between", padding: "10px 0 0", fontSize: 14, fontWeight: 800 }}>
              <span style={{ color: NAVY }}>Total</span><span style={{ color: ORANGE }}>{data.my_points.toLocaleString()} pts</span>
            </div>
          </Card>

          <Card>
            <div style={{ fontWeight: 700, fontSize: 13, color: NAVY, marginBottom: 12 }}>My Badges</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {data.badges.map((b) => <BadgeChip key={b.key} badge={b} />)}
              {data.badges.length === 0 && <SoftEmpty label="No badges defined yet." />}
            </div>
          </Card>
        </div>
      </div>
    </Page>
  );
}

function LeaderRow({ row }: { row: LeaderRowDTO }) {
  const topThree = row.rank <= 3;
  const medal = row.rank === 1 ? "🏆" : row.rank === 2 ? "🥈" : row.rank === 3 ? "🥉" : row.is_you ? "🌟" : "";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "11px 14px", borderRadius: 10, marginBottom: 6, background: row.is_you ? "rgba(239,78,36,0.06)" : "#FAFAFA", border: row.is_you ? "1.5px solid rgba(239,78,36,0.25)" : `1px solid ${BORDER}` }}>
      <div style={{ width: 28, fontWeight: 800, fontSize: 15, color: topThree ? ORANGE : MUTED, textAlign: "center" }}>{row.rank}</div>
      <div style={{ width: 34, height: 34, borderRadius: "50%", background: row.is_you ? ORANGE : NAVY, color: "#fff", fontWeight: 700, fontSize: 12, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{initials(row.name)}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: NAVY }}>{row.name}{row.is_you ? " (You)" : ""} {medal}</div>
        <div style={{ fontSize: 11, color: MUTED }}>🔥 {row.streak} day streak</div>
      </div>
      <div style={{ fontWeight: 800, fontSize: 15, color: row.is_you ? ORANGE : NAVY }}>{row.points.toLocaleString()} pts</div>
    </div>
  );
}

function BadgeChip({ badge }: { badge: BadgeDTO }) {
  return (
    <div title={badge.description} style={{ padding: "6px 12px", borderRadius: 20, background: badge.earned ? "rgba(239,78,36,0.1)" : "#F5F7FB", border: `1px solid ${badge.earned ? "rgba(239,78,36,0.3)" : BORDER}`, fontSize: 11, color: badge.earned ? ORANGE : MUTED, fontWeight: 600, cursor: "default" }}>
      {badge.name}
    </div>
  );
}

function VisibilityToggle({ on, busy, onToggle }: { on: boolean; busy: boolean; onToggle: () => void }) {
  return (
    <button onClick={onToggle} disabled={busy} title={on ? "You're visible to your cohort" : "You're hidden from your cohort"} style={{ display: "flex", alignItems: "center", gap: 8, background: "none", border: "none", cursor: busy ? "default" : "pointer", fontFamily: "Poppins, sans-serif", opacity: busy ? 0.6 : 1 }}>
      <span style={{ fontSize: 11, color: MUTED, fontWeight: 600 }}>{on ? "Visible" : "Hidden"}</span>
      <div style={{ width: 36, height: 20, borderRadius: 11, background: on ? ORANGE : "#D0D3E0", position: "relative", transition: "background 0.2s", flexShrink: 0 }}>
        <div style={{ position: "absolute", top: 2, left: on ? 18 : 2, width: 16, height: 16, borderRadius: "50%", background: "#fff", transition: "left 0.2s", boxShadow: "0 1px 3px rgba(0,0,0,0.2)" }} />
      </div>
    </button>
  );
}

// ── primitives ────────────────────────────────────────────────────────────────
function normalize(d: MyLeaderboardDTO): MyLeaderboardDTO {
  return { ...d, leaders: d.leaders ?? [], badges: d.badges ?? [] };
}
function Page({ children }: { children: ReactNode }) {
  return <div style={{ padding: 24, display: "flex", flexDirection: "column", gap: 16, fontFamily: "Poppins, sans-serif", background: PAGE }}>{children}</div>;
}
function Card({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return <div style={{ background: "#fff", borderRadius: 12, border: `1px solid ${BORDER}`, boxShadow: SHADOW, padding: 20, ...style }}>{children}</div>;
}
function SoftEmpty({ label }: { label: string }) {
  return <div style={{ padding: "18px 0", textAlign: "center", color: MUTED, fontSize: 12 }}>{label}</div>;
}
function EmptyCard({ title, body }: { title: string; body: string }) {
  return (
    <Card style={{ padding: 48, textAlign: "center" }}>
      <div style={{ fontSize: 16, fontWeight: 800, color: NAVY, marginBottom: 8 }}>{title}</div>
      <div style={{ fontSize: 13, color: MUTED, lineHeight: 1.65, maxWidth: 460, margin: "0 auto" }}>{body}</div>
    </Card>
  );
}
function initials(name: string) { return name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase(); }
