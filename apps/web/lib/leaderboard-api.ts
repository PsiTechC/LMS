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
  my: () => api.get<ApiResponse<MyLeaderboardDTO>>("/leaderboard/my"),

  setVisibility: (show: boolean) =>
    api.patch<ApiResponse<MyLeaderboardDTO>>("/leaderboard/visibility", { show_on_leaderboard: show }),
};
