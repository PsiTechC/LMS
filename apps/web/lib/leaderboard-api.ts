import { api, ApiResponse } from "./api";

// Cut over from the old per-category (module/assessment/discussion/...)
// breakdown to the approved engagement+speed+quality model - summed across
// every scored activity in the program (max 8 points per activity, fewer
// when a dimension doesn't apply to a given activity type).
export interface PointsBreakdownDTO {
  engagement_score: number;
  speed_score: number;
  quality_score: number;
  earned_total: number;
  maximum_total: number;
  percentage: number;
  total: number;
}

export interface LeaderRowDTO {
  rank: number;
  user_id: string;
  name: string;
  points: number;
  streak: number;
  is_you: boolean;
}

export interface BadgeDTO {
  key: string;
  name: string;
  description: string;
  earned: boolean;
}

export interface MyLeaderboardDTO {
  has_cohort: boolean;
  cohort_name?: string;
  show_on_leaderboard: boolean;
  my_rank?: number;
  my_points: number;
  breakdown: PointsBreakdownDTO;
  leaders: LeaderRowDTO[];
  badges: BadgeDTO[];
}

export const leaderboardApi = {
  // programId scopes the leaderboard to the program the switcher is on, so a
  // participant enrolled in multiple programs sees the correct standings.
  my: (programId?: string) =>
    api.get<ApiResponse<MyLeaderboardDTO>>(`/leaderboard/my${programId ? `?program_id=${programId}` : ""}`),

  setVisibility: (show: boolean, programId?: string) =>
    api.patch<ApiResponse<MyLeaderboardDTO>>(`/leaderboard/visibility${programId ? `?program_id=${programId}` : ""}`, { show_on_leaderboard: show }),
};
