export interface Repo {
  id: number;
  path: string;
  name: string;
  first_seen: string | null;
  last_synced: string | null;
}

export interface Commit {
  id: number;
  repo_id: number;
  sha: string;
  message: string | null;
  author: string | null;
  timestamp: string;
  lines_added: number;
  lines_removed: number;
  files_changed: number;
  branch: string | null;
  is_merge: boolean;
  tags: string | null;
}

export interface DailySummary {
  id: number;
  repo_id: number;
  date: string;
  commits_count: number;
  lines_added: number;
  lines_removed: number;
  files_touched: number;
  user_notes: string | null;
  ai_draft: string | null;
  published: boolean;
  published_at: string | null;
}

export interface ModuleActivity {
  module: string;
  changes: number;
  percentage: number;
}

export interface StreakInfo {
  current: number;
  best: number;
  best_start: string;
  best_end: string;
}

export interface HourDistribution {
  hour: number;
  commits: number;
}

export interface MostActiveMonth {
  month: string;
  commits: number;
}

export interface Milestone {
  tag: string;
  date: string;
}

export interface GlobalConfig {
  cloudEnabled: boolean;
  cloudToken: string | null;
  nudgeTime: string;
  timezone: string;
  colorScheme: string;
  ai: { provider: string; model: string | null; ollamaUrl: string };
  git: { userEmail: string | null; userEmailOverride: string | null };
  showCaptureConfirmation: boolean;
  cloudApiUrl: string | null;
  appearance: { theme: "dark" | "light"; fontScale: number };
}

export interface CloudProfile {
  username: string;
  email: string | null;
  displayName: string | null;
  bio: string | null;
  avatarUrl: string | null;
  githubUrl: string | null;
  twitterUrl: string | null;
  websiteUrl: string | null;
  subscriptionTier: string | null;
}

export interface DeviceCodeData {
  deviceCode: string;
  userCode: string;
  verificationUrl: string;
  expiresIn: number;
}

export interface TimelineEntry {
  digestId: string;
  date: string;
  repoName: string | null;
  repoSlug: string | null;
  commitsCount: number;
  linesAdded: number;
  linesRemoved: number;
  publishedText: string | null;
  tags: string | null;
}

export interface PagedResponse<T> {
  success: boolean;
  data: T[];
  page: number;
  pageSize: number;
  totalCount: number;
  totalPages: number;
}

export interface WeeklyDigestResponse {
  aiSummary: string | null;
  weekStartDate: string;
  weekEndDate: string;
}

export interface DayCommitStats {
  date: string;
  commits: number;
  lines_added: number;
  lines_removed: number;
  files_changed: number;
}

export interface AiSession {
  id: number;
  repo_id: number;
  date: string;
  provider: string | null;
  model: string | null;
  tool: string | null;
  cost_usd: number;
  input_tokens: number;
  output_tokens: number;
  tools_used: string | null;
  mcp_servers: string | null;
  duration_secs: number;
  commits: string | null;
  note: string | null;
  timestamp: string;
}

export interface AiSessionStats {
  total_sessions: number;
  total_cost: number;
  total_input_tokens: number;
  total_output_tokens: number;
  total_duration_secs: number;
  providers: [string, number][];
  models: [string, number][];
  tools: [string, number][];
  tools_used_frequency: [string, number][];
  mcp_servers_used: [string, number][];
}

export interface DailyAiSummary {
  date: string;
  sessions: number;
  cost: number;
  tokens: number;
}

export type View =
  | "overview"
  | "daily-log"
  | "history"
  | "digest"
  | "ai"
  | "cloud"
  | "repos"
  | "settings";
