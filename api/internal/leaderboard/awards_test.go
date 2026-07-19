package leaderboard

import (
	"testing"
	"time"
)

func instant(t *testing.T, s string) time.Time {
	t.Helper()
	v, err := time.Parse(time.RFC3339, s)
	if err != nil {
		t.Fatal(err)
	}
	return v
}
func ptr(v time.Time) *time.Time { return &v }

func TestCalculateAwardCalendarTiersAndRounding(t *testing.T) {
	available := instant(t, "2026-07-18T10:00:00Z")
	due := instant(t, "2026-07-24T23:59:59Z")
	cases := []struct {
		name, completed string
		base, want      int
		tier            string
	}{
		{"day zero", "2026-07-18T12:00:00Z", 120, 120, TierFullEarly},
		{"day one", "2026-07-19T23:00:00Z", 120, 120, TierFullEarly},
		{"day two", "2026-07-20T12:00:00Z", 120, 60, TierHalfEarly},
		{"day three", "2026-07-21T12:00:00Z", 120, 60, TierHalfEarly},
		{"day four", "2026-07-22T12:00:00Z", 70, 18, TierQuarterOnTime},
		{"due date", "2026-07-24T12:00:00Z", 60, 15, TierQuarterOnTime},
		{"late", "2026-07-25T00:00:00Z", 120, 0, TierLateZero},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got, err := CalculateAward(tc.base, ptr(available), ptr(due), instant(t, tc.completed), "UTC")
			if err != nil {
				t.Fatal(err)
			}
			if got.AwardedPoints != tc.want || got.Tier != tc.tier {
				t.Fatalf("got %+v", got)
			}
		})
	}
}

func TestCalculateAwardUsesLocalCalendarDatesAndLegacyFallback(t *testing.T) {
	// These UTC moments are Jul 18 16:00 and Jul 19 21:00 in Kolkata: day 1.
	a := instant(t, "2026-07-18T10:30:00Z")
	d := instant(t, "2026-07-25T18:29:59Z")
	got, err := CalculateAward(60, ptr(a), ptr(d), instant(t, "2026-07-19T15:30:00Z"), "Asia/Kolkata")
	if err != nil || got.AwardedPoints != 60 || got.ElapsedCalendarDays != 1 {
		t.Fatalf("got %+v, %v", got, err)
	}
	legacy, err := CalculateAward(60, nil, ptr(d), instant(t, "2026-08-01T00:00:00Z"), "UTC")
	if err != nil || legacy.AwardedPoints != 60 || legacy.Tier != TierLegacyFull {
		t.Fatalf("got %+v, %v", legacy, err)
	}
}

func TestCalculateAwardRejectsInvalidTiming(t *testing.T) {
	a := instant(t, "2026-07-20T00:00:00Z")
	d := instant(t, "2026-07-19T00:00:00Z")
	if _, err := CalculateAward(60, ptr(a), ptr(d), a, "UTC"); err == nil {
		t.Fatal("expected invalid due date")
	}
	if _, err := CalculateAward(60, ptr(a), ptr(a), a, "Not/AZone"); err == nil {
		t.Fatal("expected invalid timezone")
	}
}
