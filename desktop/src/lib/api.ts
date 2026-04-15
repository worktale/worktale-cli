import { invoke } from "@tauri-apps/api/core";
import type {
  Repo,
  Commit,
  DailySummary,
  ModuleActivity,
  StreakInfo,
  HourDistribution,
  MostActiveMonth,
  Milestone,
  GlobalConfig,
  CloudProfile,
  DeviceCodeData,
  TimelineEntry,
  PagedResponse,
  WeeklyDigestResponse,
  AiSession,
  AiSessionStats,
  DailyAiSummary,
} from "./types";

// ── Repos ────────────────────────────────────────────────────────────────────

export const getAllRepos = () => invoke<Repo[]>("get_all_repos");
export const getRepoByPath = (path: string) =>
  invoke<Repo | null>("get_repo_by_path", { path });
export const getRepoById = (repoId: number) =>
  invoke<Repo | null>("get_repo_by_id", { repoId });
export const removeRepo = (repoId: number) =>
  invoke<void>("remove_repo", { repoId });

// ── Commits ──────────────────────────────────────────────────────────────────

export const getCommitsByDate = (repoId: number, date: string) =>
  invoke<Commit[]>("get_commits_by_date", { repoId, date });
export const getRecentCommits = (repoId: number, limit: number) =>
  invoke<Commit[]>("get_recent_commits", { repoId, limit });
export const getCommitCount = (repoId: number) =>
  invoke<number>("get_commit_count", { repoId });

// ── Daily Summaries ──────────────────────────────────────────────────────────

export const getDailySummary = (repoId: number, date: string) =>
  invoke<DailySummary | null>("get_daily_summary", { repoId, date });
export const getDailySummariesRange = (
  repoId: number,
  startDate: string,
  endDate: string,
) =>
  invoke<DailySummary[]>("get_daily_summaries_range", {
    repoId,
    startDate,
    endDate,
  });
export const updateUserNotes = (
  repoId: number,
  date: string,
  notes: string,
) => invoke<void>("update_user_notes", { repoId, date, notes });
export const updateAiDraft = (
  repoId: number,
  date: string,
  draft: string,
) => invoke<void>("update_ai_draft", { repoId, date, draft });
export const markPublished = (repoId: number, date: string) =>
  invoke<void>("mark_published", { repoId, date });
export const getUnpublishedDays = (repoId: number) =>
  invoke<number>("get_unpublished_days", { repoId });
export const markAllPublished = (repoId: number) =>
  invoke<number>("mark_all_published", { repoId });

// ── File Activity ────────────────────────────────────────────────────────────

export const getModuleActivityByDate = (repoId: number, date: string) =>
  invoke<ModuleActivity[]>("get_module_activity_by_date", { repoId, date });
export const getTopModules = (repoId: number, limit: number) =>
  invoke<ModuleActivity[]>("get_top_modules", { repoId, limit });

// ── Streaks & Stats ──────────────────────────────────────────────────────────

export const getActiveDates = (repoId: number) =>
  invoke<string[]>("get_active_dates", { repoId });
export const getStreakInfo = (repoId: number) =>
  invoke<StreakInfo>("get_streak_info", { repoId });
export const getWorkingHourDistribution = (repoId: number) =>
  invoke<HourDistribution[]>("get_working_hour_distribution", { repoId });
export const getEstimatedCodingTime = (repoId: number, date: string) =>
  invoke<number>("get_estimated_coding_time", { repoId, date });
export const getMostActiveMonth = (repoId: number) =>
  invoke<MostActiveMonth>("get_most_active_month", { repoId });
export const getMilestones = (repoId: number, limit: number) =>
  invoke<Milestone[]>("get_milestones", { repoId, limit });

// ── Config ───────────────────────────────────────────────────────────────────

export const getConfig = () => invoke<GlobalConfig>("get_config");
export const setConfigValue = (key: string, value: string) =>
  invoke<void>("set_config_value", { key, value });

// ── Cloud ────────────────────────────────────────────────────────────────────

export const cloudIsConfigured = () => invoke<boolean>("cloud_is_configured");
export const cloudLoginStart = () =>
  invoke<DeviceCodeData>("cloud_login_start");
export const cloudLoginPoll = (deviceCode: string) =>
  invoke<string | null>("cloud_login_poll", { deviceCode });
export const cloudLogout = () => invoke<void>("cloud_logout");
export const cloudGetProfile = () =>
  invoke<CloudProfile>("cloud_get_profile");
export const cloudUpdateProfile = (field: string, value: string) =>
  invoke<void>("cloud_update_profile", { field, value });
export const cloudPublishDaily = (repoId: number, date: string) =>
  invoke<string>("cloud_publish_daily", { repoId, date });
export const cloudPublishWeekly = () =>
  invoke<WeeklyDigestResponse>("cloud_publish_weekly");
export const cloudStandup = () => invoke<string>("cloud_standup");
export const cloudRetro = (days: number) =>
  invoke<string>("cloud_retro", { days });
export const cloudTimeline = (page: number) =>
  invoke<PagedResponse<TimelineEntry>>("cloud_timeline", { page });

// ── AI Sessions ──────────────────────────────────────────────────────────────

export const getAiSessionsByDate = (repoId: number, date: string) =>
  invoke<AiSession[]>("get_ai_sessions_by_date", { repoId, date });
export const getAiSessionStats = (repoId: number, days: number) =>
  invoke<AiSessionStats>("get_ai_session_stats", { repoId, days });
export const getDailyAiSummary = (
  repoId: number,
  startDate: string,
  endDate: string,
) =>
  invoke<DailyAiSummary[]>("get_daily_ai_summary", {
    repoId,
    startDate,
    endDate,
  });

// ── Digest ───────────────────────────────────────────────────────────────────

export const generateDigest = (repoId: number, date: string) =>
  invoke<string>("generate_digest", { repoId, date });

// ── Git ──────────────────────────────────────────────────────────────────────

export const checkIsGitRepo = (path: string) =>
  invoke<boolean>("check_is_git_repo", { path });
export const getCurrentBranch = (path: string) =>
  invoke<string>("get_current_branch", { path });
export const getGitUserEmail = (path: string) =>
  invoke<string>("get_git_user_email", { path });
export const openInBrowser = (url: string) =>
  invoke<void>("open_in_browser", { url });
export const getTodayString = () => invoke<string>("get_today_string");
