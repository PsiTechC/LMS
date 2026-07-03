import { api, ApiResponse } from "./api";

export interface PointsBreakdownDTO {
  module_completions: number;
  assessments: number;
  discussions: number;
  reflections: number;
  coaching_attendance: number;
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
