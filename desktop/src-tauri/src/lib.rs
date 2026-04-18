use chrono::{Local, NaiveDate};
use reqwest::Client;
use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::sync::Mutex;
use tauri::State;

// ─── Types ───────────────────────────────────────────────────────────────────

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Repo {
    pub id: i64,
    pub path: String,
    pub name: String,
    pub first_seen: Option<String>,
    pub last_synced: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Commit {
    pub id: i64,
    pub repo_id: i64,
    pub sha: String,
    pub message: Option<String>,
    pub author: Option<String>,
    pub timestamp: String,
    pub lines_added: i64,
    pub lines_removed: i64,
    pub files_changed: i64,
    pub branch: Option<String>,
    pub is_merge: bool,
    pub tags: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct DailySummary {
    pub id: i64,
    pub repo_id: i64,
    pub date: String,
    pub commits_count: i64,
    pub lines_added: i64,
    pub lines_removed: i64,
    pub files_touched: i64,
    pub user_notes: Option<String>,
    pub ai_draft: Option<String>,
    pub published: bool,
    pub published_at: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ModuleActivity {
    pub module: String,
    pub changes: i64,
    pub percentage: f64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct StreakInfo {
    pub current: i64,
    pub best: i64,
    pub best_start: String,
    pub best_end: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct HourDistribution {
    pub hour: i32,
    pub commits: i64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct MostActiveMonth {
    pub month: String,
    pub commits: i64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Milestone {
    pub tag: String,
    pub date: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct GlobalConfig {
    #[serde(rename = "cloudEnabled", default)]
    pub cloud_enabled: bool,
    #[serde(rename = "cloudToken", default)]
    pub cloud_token: Option<String>,
    #[serde(rename = "nudgeTime", default = "default_nudge_time")]
    pub nudge_time: String,
    #[serde(default = "default_timezone")]
    pub timezone: String,
    #[serde(rename = "colorScheme", default = "default_color_scheme")]
    pub color_scheme: String,
    #[serde(default)]
    pub ai: AiConfig,
    #[serde(default)]
    pub git: GitConfig,
    #[serde(rename = "showCaptureConfirmation", default)]
    pub show_capture_confirmation: bool,
    #[serde(rename = "cloudApiUrl", default)]
    pub cloud_api_url: Option<String>,
    #[serde(default)]
    pub appearance: AppearanceConfig,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct AppearanceConfig {
    #[serde(default = "default_theme")]
    pub theme: String,
    #[serde(rename = "fontScale", default = "default_font_scale")]
    pub font_scale: f32,
}

impl Default for AppearanceConfig {
    fn default() -> Self {
        Self { theme: default_theme(), font_scale: default_font_scale() }
    }
}

fn default_theme() -> String { "dark".into() }
fn default_font_scale() -> f32 { 1.0 }

fn default_nudge_time() -> String { "17:00".into() }
fn default_timezone() -> String { "auto".into() }
fn default_color_scheme() -> String { "default".into() }

#[derive(Debug, Serialize, Deserialize, Clone, Default)]
pub struct AiConfig {
    #[serde(default = "default_ai_provider")]
    pub provider: String,
    #[serde(default)]
    pub model: Option<String>,
    #[serde(rename = "ollamaUrl", default = "default_ollama_url")]
    pub ollama_url: String,
}

fn default_ai_provider() -> String { "template".into() }
fn default_ollama_url() -> String { "http://localhost:11434".into() }

#[derive(Debug, Serialize, Deserialize, Clone, Default)]
pub struct GitConfig {
    #[serde(rename = "userEmail", default)]
    pub user_email: Option<String>,
    #[serde(rename = "userEmailOverride", default)]
    pub user_email_override: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct CloudProfile {
    pub username: String,
    pub email: Option<String>,
    #[serde(rename = "displayName")]
    pub display_name: Option<String>,
    pub bio: Option<String>,
    #[serde(rename = "avatarUrl")]
    pub avatar_url: Option<String>,
    #[serde(rename = "githubUrl")]
    pub github_url: Option<String>,
    #[serde(rename = "twitterUrl")]
    pub twitter_url: Option<String>,
    #[serde(rename = "websiteUrl")]
    pub website_url: Option<String>,
    #[serde(rename = "subscriptionTier")]
    pub subscription_tier: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct DeviceCodeResponse {
    pub success: bool,
    pub data: DeviceCodeData,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct DeviceCodeData {
    #[serde(rename = "deviceCode")]
    pub device_code: String,
    #[serde(rename = "userCode")]
    pub user_code: String,
    #[serde(rename = "verificationUrl")]
    pub verification_url: String,
    #[serde(rename = "expiresIn")]
    pub expires_in: i64,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct DevicePollResponse {
    pub success: bool,
    pub data: DevicePollData,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct DevicePollData {
    pub confirmed: bool,
    pub token: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct CloudApiResponse<T> {
    pub success: bool,
    pub data: Option<T>,
    pub message: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct TimelineEntry {
    #[serde(rename = "digestId")]
    pub digest_id: String,
    pub date: String,
    #[serde(rename = "repoName")]
    pub repo_name: Option<String>,
    #[serde(rename = "repoSlug")]
    pub repo_slug: Option<String>,
    #[serde(rename = "commitsCount")]
    pub commits_count: i64,
    #[serde(rename = "linesAdded")]
    pub lines_added: i64,
    #[serde(rename = "linesRemoved")]
    pub lines_removed: i64,
    #[serde(rename = "publishedText")]
    pub published_text: Option<String>,
    pub tags: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct PagedResponse<T> {
    pub success: bool,
    pub data: Vec<T>,
    pub page: i64,
    #[serde(rename = "pageSize")]
    pub page_size: i64,
    #[serde(rename = "totalCount")]
    pub total_count: i64,
    #[serde(rename = "totalPages")]
    pub total_pages: i64,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct DigestPublishData {
    pub id: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct WeeklyDigestResponse {
    #[serde(rename = "aiSummary")]
    pub ai_summary: Option<String>,
    #[serde(rename = "weekStartDate")]
    pub week_start_date: String,
    #[serde(rename = "weekEndDate")]
    pub week_end_date: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct AiTextResponse {
    pub output: Option<String>,
    #[serde(rename = "dateRangeStart")]
    pub date_range_start: Option<String>,
    #[serde(rename = "dateRangeEnd")]
    pub date_range_end: Option<String>,
}

// ─── AI Session Types ────────────────────────────────────────────────────────

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct AiSession {
    pub id: i64,
    pub repo_id: i64,
    pub date: String,
    pub provider: Option<String>,
    pub model: Option<String>,
    pub tool: Option<String>,
    pub cost_usd: f64,
    pub input_tokens: i64,
    pub output_tokens: i64,
    pub tools_used: Option<String>,
    pub mcp_servers: Option<String>,
    pub duration_secs: i64,
    pub commits: Option<String>,
    pub note: Option<String>,
    pub timestamp: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct AiSessionStats {
    pub total_sessions: i64,
    pub total_cost: f64,
    pub total_input_tokens: i64,
    pub total_output_tokens: i64,
    pub total_duration_secs: i64,
    pub providers: Vec<(String, i64)>,
    pub models: Vec<(String, i64)>,
    pub tools: Vec<(String, i64)>,
    pub tools_used_frequency: Vec<(String, i64)>,
    pub mcp_servers_used: Vec<(String, i64)>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct DailyAiSummary {
    pub date: String,
    pub sessions: i64,
    pub cost: f64,
    pub tokens: i64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct DayCommitStats {
    pub date: String,
    pub commits: i64,
    pub lines_added: i64,
    pub lines_removed: i64,
    pub files_changed: i64,
}

// ─── State ───────────────────────────────────────────────────────────────────

pub struct AppState {
    pub db: Mutex<Connection>,
    pub http: Client,
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

fn worktale_dir() -> PathBuf {
    let home = dirs::home_dir().expect("Cannot find home directory");
    home.join(".worktale")
}

fn db_path() -> PathBuf {
    worktale_dir().join("data.db")
}

fn config_path() -> PathBuf {
    worktale_dir().join("config.json")
}

fn open_db() -> Result<Connection, String> {
    let dir = worktale_dir();
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;

    let conn = Connection::open(db_path()).map_err(|e| e.to_string())?;
    conn.execute_batch("PRAGMA journal_mode = WAL;")
        .map_err(|e| e.to_string())?;

    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS repos (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            path        TEXT UNIQUE NOT NULL,
            name        TEXT NOT NULL,
            first_seen  TEXT,
            last_synced TEXT
        );
        CREATE TABLE IF NOT EXISTS commits (
            id            INTEGER PRIMARY KEY AUTOINCREMENT,
            repo_id       INTEGER REFERENCES repos(id),
            sha           TEXT NOT NULL,
            message       TEXT,
            author        TEXT,
            timestamp     TEXT NOT NULL,
            lines_added   INTEGER DEFAULT 0,
            lines_removed INTEGER DEFAULT 0,
            files_changed INTEGER DEFAULT 0,
            branch        TEXT,
            is_merge      INTEGER DEFAULT 0,
            tags          TEXT,
            UNIQUE(repo_id, sha)
        );
        CREATE TABLE IF NOT EXISTS daily_summaries (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            repo_id         INTEGER REFERENCES repos(id),
            date            TEXT NOT NULL,
            commits_count   INTEGER DEFAULT 0,
            lines_added     INTEGER DEFAULT 0,
            lines_removed   INTEGER DEFAULT 0,
            files_touched   INTEGER DEFAULT 0,
            user_notes      TEXT,
            ai_draft        TEXT,
            published       INTEGER DEFAULT 0,
            published_at    TEXT,
            UNIQUE(repo_id, date)
        );
        CREATE TABLE IF NOT EXISTS file_activity (
            id        INTEGER PRIMARY KEY AUTOINCREMENT,
            repo_id   INTEGER REFERENCES repos(id),
            path      TEXT,
            module    TEXT,
            date      TEXT,
            changes   INTEGER DEFAULT 0
        );
        CREATE TABLE IF NOT EXISTS ai_sessions (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            repo_id         INTEGER REFERENCES repos(id),
            date            TEXT NOT NULL,
            provider        TEXT,
            model           TEXT,
            tool            TEXT,
            cost_usd        REAL DEFAULT 0,
            input_tokens    INTEGER DEFAULT 0,
            output_tokens   INTEGER DEFAULT 0,
            tools_used      TEXT,
            mcp_servers     TEXT,
            duration_secs   INTEGER DEFAULT 0,
            commits         TEXT,
            note            TEXT,
            timestamp       TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_commits_repo_timestamp ON commits(repo_id, timestamp);
        CREATE INDEX IF NOT EXISTS idx_commits_repo_sha ON commits(repo_id, sha);
        CREATE INDEX IF NOT EXISTS idx_daily_summaries_repo_date ON daily_summaries(repo_id, date);
        CREATE INDEX IF NOT EXISTS idx_file_activity_repo_date ON file_activity(repo_id, date);
        CREATE INDEX IF NOT EXISTS idx_file_activity_repo_module ON file_activity(repo_id, module);
        CREATE INDEX IF NOT EXISTS idx_ai_sessions_repo_date ON ai_sessions(repo_id, date);",
    )
    .map_err(|e| e.to_string())?;

    Ok(conn)
}

fn date_string(d: &NaiveDate) -> String {
    d.format("%Y-%m-%d").to_string()
}

fn today_string() -> String {
    Local::now().format("%Y-%m-%d").to_string()
}

fn load_config_file() -> GlobalConfig {
    let path = config_path();
    if let Ok(contents) = std::fs::read_to_string(&path) {
        serde_json::from_str(&contents).unwrap_or_default()
    } else {
        GlobalConfig::default()
    }
}

fn save_config_file(config: &GlobalConfig) -> Result<(), String> {
    let dir = worktale_dir();
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let json = serde_json::to_string_pretty(config).map_err(|e| e.to_string())?;
    std::fs::write(config_path(), json).map_err(|e| e.to_string())
}

fn cloud_api_url(config: &GlobalConfig) -> String {
    config
        .cloud_api_url
        .clone()
        .unwrap_or_else(|| "https://api.worktale.dev".into())
}

impl Default for GlobalConfig {
    fn default() -> Self {
        Self {
            cloud_enabled: false,
            cloud_token: None,
            nudge_time: "17:00".into(),
            timezone: "auto".into(),
            color_scheme: "default".into(),
            ai: AiConfig::default(),
            git: GitConfig::default(),
            show_capture_confirmation: false,
            cloud_api_url: None,
            appearance: AppearanceConfig::default(),
        }
    }
}

// ─── Tauri Commands: Repos ───────────────────────────────────────────────────

#[tauri::command]
fn get_all_repos(state: State<AppState>) -> Result<Vec<Repo>, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let mut stmt = db
        .prepare("SELECT id, path, name, first_seen, last_synced FROM repos ORDER BY name ASC")
        .map_err(|e| e.to_string())?;

    let repos = stmt
        .query_map([], |row| {
            Ok(Repo {
                id: row.get(0)?,
                path: row.get(1)?,
                name: row.get(2)?,
                first_seen: row.get(3)?,
                last_synced: row.get(4)?,
            })
        })
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();

    Ok(repos)
}

#[tauri::command]
fn get_repo_by_path(state: State<AppState>, path: String) -> Result<Option<Repo>, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let mut stmt = db
        .prepare("SELECT id, path, name, first_seen, last_synced FROM repos WHERE path = ?1")
        .map_err(|e| e.to_string())?;

    let repo = stmt
        .query_row(params![path], |row| {
            Ok(Repo {
                id: row.get(0)?,
                path: row.get(1)?,
                name: row.get(2)?,
                first_seen: row.get(3)?,
                last_synced: row.get(4)?,
            })
        })
        .ok();

    Ok(repo)
}

#[tauri::command]
fn get_repo_by_id(state: State<AppState>, repo_id: i64) -> Result<Option<Repo>, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let mut stmt = db
        .prepare("SELECT id, path, name, first_seen, last_synced FROM repos WHERE id = ?1")
        .map_err(|e| e.to_string())?;

    let repo = stmt
        .query_row(params![repo_id], |row| {
            Ok(Repo {
                id: row.get(0)?,
                path: row.get(1)?,
                name: row.get(2)?,
                first_seen: row.get(3)?,
                last_synced: row.get(4)?,
            })
        })
        .ok();

    Ok(repo)
}

#[tauri::command]
fn remove_repo(state: State<AppState>, repo_id: i64) -> Result<(), String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    db.execute("DELETE FROM file_activity WHERE repo_id = ?1", params![repo_id])
        .map_err(|e| e.to_string())?;
    db.execute("DELETE FROM daily_summaries WHERE repo_id = ?1", params![repo_id])
        .map_err(|e| e.to_string())?;
    db.execute("DELETE FROM commits WHERE repo_id = ?1", params![repo_id])
        .map_err(|e| e.to_string())?;
    db.execute("DELETE FROM repos WHERE id = ?1", params![repo_id])
        .map_err(|e| e.to_string())?;
    Ok(())
}

// ─── Tauri Commands: Commits ─────────────────────────────────────────────────

#[tauri::command]
fn get_commits_by_date(
    state: State<AppState>,
    repo_id: i64,
    date: String,
) -> Result<Vec<Commit>, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let mut stmt = db
        .prepare(
            "SELECT id, repo_id, sha, message, author, timestamp, lines_added, lines_removed,
                    files_changed, branch, is_merge, tags
             FROM commits
             WHERE repo_id = ?1 AND date(timestamp) = ?2
             ORDER BY timestamp DESC",
        )
        .map_err(|e| e.to_string())?;

    let commits = stmt
        .query_map(params![repo_id, date], |row| {
            Ok(Commit {
                id: row.get(0)?,
                repo_id: row.get(1)?,
                sha: row.get(2)?,
                message: row.get(3)?,
                author: row.get(4)?,
                timestamp: row.get(5)?,
                lines_added: row.get(6)?,
                lines_removed: row.get(7)?,
                files_changed: row.get(8)?,
                branch: row.get(9)?,
                is_merge: row.get::<_, i64>(10)? != 0,
                tags: row.get(11)?,
            })
        })
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();

    Ok(commits)
}

#[tauri::command]
fn get_recent_commits(
    state: State<AppState>,
    repo_id: i64,
    limit: i64,
) -> Result<Vec<Commit>, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let mut stmt = db
        .prepare(
            "SELECT id, repo_id, sha, message, author, timestamp, lines_added, lines_removed,
                    files_changed, branch, is_merge, tags
             FROM commits WHERE repo_id = ?1
             ORDER BY timestamp DESC LIMIT ?2",
        )
        .map_err(|e| e.to_string())?;

    let commits = stmt
        .query_map(params![repo_id, limit], |row| {
            Ok(Commit {
                id: row.get(0)?,
                repo_id: row.get(1)?,
                sha: row.get(2)?,
                message: row.get(3)?,
                author: row.get(4)?,
                timestamp: row.get(5)?,
                lines_added: row.get(6)?,
                lines_removed: row.get(7)?,
                files_changed: row.get(8)?,
                branch: row.get(9)?,
                is_merge: row.get::<_, i64>(10)? != 0,
                tags: row.get(11)?,
            })
        })
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();

    Ok(commits)
}

#[tauri::command]
fn get_commit_count(state: State<AppState>, repo_id: i64) -> Result<i64, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    db.query_row(
        "SELECT COUNT(*) FROM commits WHERE repo_id = ?1",
        params![repo_id],
        |row| row.get(0),
    )
    .map_err(|e| e.to_string())
}

// ─── Tauri Commands: Commit Stats Range ─────────────────────────────────────

#[tauri::command]
fn get_commit_stats_range(
    state: State<AppState>,
    repo_id: i64,
    start_date: String,
    end_date: String,
) -> Result<Vec<DayCommitStats>, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let mut stmt = db
        .prepare(
            "SELECT date(timestamp) AS d, COUNT(*) AS cnt,
                    COALESCE(SUM(lines_added), 0),
                    COALESCE(SUM(lines_removed), 0),
                    COALESCE(SUM(files_changed), 0)
             FROM commits
             WHERE repo_id = ?1 AND date(timestamp) >= ?2 AND date(timestamp) <= ?3
             GROUP BY d ORDER BY d ASC",
        )
        .map_err(|e| e.to_string())?;

    let results = stmt
        .query_map(params![repo_id, start_date, end_date], |row| {
            Ok(DayCommitStats {
                date: row.get(0)?,
                commits: row.get(1)?,
                lines_added: row.get(2)?,
                lines_removed: row.get(3)?,
                files_changed: row.get(4)?,
            })
        })
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();

    Ok(results)
}

// ─── Tauri Commands: Daily Summaries ─────────────────────────────────────────

#[tauri::command]
fn get_daily_summary(
    state: State<AppState>,
    repo_id: i64,
    date: String,
) -> Result<Option<DailySummary>, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let mut stmt = db
        .prepare(
            "SELECT id, repo_id, date, commits_count, lines_added, lines_removed, files_touched,
                    user_notes, ai_draft, published, published_at
             FROM daily_summaries WHERE repo_id = ?1 AND date = ?2",
        )
        .map_err(|e| e.to_string())?;

    let summary = stmt
        .query_row(params![repo_id, date], |row| {
            Ok(DailySummary {
                id: row.get(0)?,
                repo_id: row.get(1)?,
                date: row.get(2)?,
                commits_count: row.get(3)?,
                lines_added: row.get(4)?,
                lines_removed: row.get(5)?,
                files_touched: row.get(6)?,
                user_notes: row.get(7)?,
                ai_draft: row.get(8)?,
                published: row.get::<_, i64>(9)? != 0,
                published_at: row.get(10)?,
            })
        })
        .ok();

    Ok(summary)
}

#[tauri::command]
fn get_daily_summaries_range(
    state: State<AppState>,
    repo_id: i64,
    start_date: String,
    end_date: String,
) -> Result<Vec<DailySummary>, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let mut stmt = db
        .prepare(
            "SELECT id, repo_id, date, commits_count, lines_added, lines_removed, files_touched,
                    user_notes, ai_draft, published, published_at
             FROM daily_summaries
             WHERE repo_id = ?1 AND date >= ?2 AND date <= ?3
             ORDER BY date ASC",
        )
        .map_err(|e| e.to_string())?;

    let summaries = stmt
        .query_map(params![repo_id, start_date, end_date], |row| {
            Ok(DailySummary {
                id: row.get(0)?,
                repo_id: row.get(1)?,
                date: row.get(2)?,
                commits_count: row.get(3)?,
                lines_added: row.get(4)?,
                lines_removed: row.get(5)?,
                files_touched: row.get(6)?,
                user_notes: row.get(7)?,
                ai_draft: row.get(8)?,
                published: row.get::<_, i64>(9)? != 0,
                published_at: row.get(10)?,
            })
        })
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();

    Ok(summaries)
}

#[tauri::command]
fn update_user_notes(
    state: State<AppState>,
    repo_id: i64,
    date: String,
    notes: String,
) -> Result<(), String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    // Upsert: update if exists, insert if not
    let existing: bool = db
        .query_row(
            "SELECT COUNT(*) > 0 FROM daily_summaries WHERE repo_id = ?1 AND date = ?2",
            params![repo_id, date],
            |row| row.get(0),
        )
        .unwrap_or(false);

    if existing {
        db.execute(
            "UPDATE daily_summaries SET user_notes = ?3 WHERE repo_id = ?1 AND date = ?2",
            params![repo_id, date, notes],
        )
        .map_err(|e| e.to_string())?;
    } else {
        db.execute(
            "INSERT INTO daily_summaries (repo_id, date, user_notes) VALUES (?1, ?2, ?3)",
            params![repo_id, date, notes],
        )
        .map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
fn update_ai_draft(
    state: State<AppState>,
    repo_id: i64,
    date: String,
    draft: String,
) -> Result<(), String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let existing: bool = db
        .query_row(
            "SELECT COUNT(*) > 0 FROM daily_summaries WHERE repo_id = ?1 AND date = ?2",
            params![repo_id, date],
            |row| row.get(0),
        )
        .unwrap_or(false);

    if existing {
        db.execute(
            "UPDATE daily_summaries SET ai_draft = ?3 WHERE repo_id = ?1 AND date = ?2",
            params![repo_id, date, draft],
        )
        .map_err(|e| e.to_string())?;
    } else {
        db.execute(
            "INSERT INTO daily_summaries (repo_id, date, ai_draft) VALUES (?1, ?2, ?3)",
            params![repo_id, date, draft],
        )
        .map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
fn mark_published(state: State<AppState>, repo_id: i64, date: String) -> Result<(), String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let now = Local::now().to_rfc3339();
    db.execute(
        "UPDATE daily_summaries SET published = 1, published_at = ?3 WHERE repo_id = ?1 AND date = ?2",
        params![repo_id, date, now],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn get_unpublished_days(state: State<AppState>, repo_id: i64) -> Result<i64, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    db.query_row(
        "SELECT COUNT(*) FROM daily_summaries WHERE repo_id = ?1 AND published = 0 AND commits_count > 0",
        params![repo_id],
        |row| row.get(0),
    )
    .map_err(|e| e.to_string())
}

#[tauri::command]
fn mark_all_published(state: State<AppState>, repo_id: i64) -> Result<i64, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let now = Local::now().to_rfc3339();
    let count = db
        .execute(
            "UPDATE daily_summaries SET published = 1, published_at = ?2 WHERE repo_id = ?1 AND published = 0 AND commits_count > 0",
            params![repo_id, now],
        )
        .map_err(|e| e.to_string())?;
    Ok(count as i64)
}

// ─── Tauri Commands: File Activity / Modules ─────────────────────────────────

#[tauri::command]
fn get_module_activity_by_date(
    state: State<AppState>,
    repo_id: i64,
    date: String,
) -> Result<Vec<ModuleActivity>, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let mut stmt = db
        .prepare(
            "SELECT module, SUM(changes) as total
             FROM file_activity WHERE repo_id = ?1 AND date = ?2
             GROUP BY module ORDER BY total DESC",
        )
        .map_err(|e| e.to_string())?;

    let rows: Vec<(String, i64)> = stmt
        .query_map(params![repo_id, date], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, i64>(1)?))
        })
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();

    let total: i64 = rows.iter().map(|(_, c)| c).sum();
    let modules = rows
        .into_iter()
        .map(|(module, changes)| ModuleActivity {
            module,
            changes,
            percentage: if total > 0 {
                (changes as f64 / total as f64) * 100.0
            } else {
                0.0
            },
        })
        .collect();

    Ok(modules)
}

#[tauri::command]
fn get_top_modules(
    state: State<AppState>,
    repo_id: i64,
    limit: i64,
) -> Result<Vec<ModuleActivity>, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let mut stmt = db
        .prepare(
            "SELECT module, SUM(changes) as total
             FROM file_activity WHERE repo_id = ?1
             GROUP BY module ORDER BY total DESC LIMIT ?2",
        )
        .map_err(|e| e.to_string())?;

    let rows: Vec<(String, i64)> = stmt
        .query_map(params![repo_id, limit], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, i64>(1)?))
        })
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();

    let total: i64 = rows.iter().map(|(_, c)| c).sum();
    let modules = rows
        .into_iter()
        .map(|(module, changes)| ModuleActivity {
            module,
            changes,
            percentage: if total > 0 {
                (changes as f64 / total as f64) * 100.0
            } else {
                0.0
            },
        })
        .collect();

    Ok(modules)
}

// ─── Tauri Commands: Streaks ─────────────────────────────────────────────────

fn query_active_dates(db: &Connection, repo_id: i64) -> Result<Vec<String>, String> {
    let mut stmt = db
        .prepare(
            "SELECT DISTINCT date(timestamp) AS d FROM commits WHERE repo_id = ?1 ORDER BY d ASC",
        )
        .map_err(|e| e.to_string())?;

    let dates = stmt
        .query_map(params![repo_id], |row| row.get::<_, String>(0))
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();

    Ok(dates)
}

#[tauri::command]
fn get_active_dates(state: State<AppState>, repo_id: i64) -> Result<Vec<String>, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    query_active_dates(&db, repo_id)
}

#[tauri::command]
fn get_streak_info(state: State<AppState>, repo_id: i64) -> Result<StreakInfo, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let dates = query_active_dates(&db, repo_id)?;

    let today = today_string();
    let yesterday = {
        let now = Local::now();
        let y = now.date_naive() - chrono::Duration::days(1);
        date_string(&y)
    };

    // Current streak
    let date_set: std::collections::HashSet<&str> =
        dates.iter().map(|s| s.as_str()).collect();

    let current = if date_set.contains(today.as_str()) || date_set.contains(yesterday.as_str()) {
        let start = if date_set.contains(today.as_str()) {
            &today
        } else {
            &yesterday
        };
        let mut streak = 0i64;
        let mut d = NaiveDate::parse_from_str(start, "%Y-%m-%d").unwrap_or_default();
        while date_set.contains(date_string(&d).as_str()) {
            streak += 1;
            d -= chrono::Duration::days(1);
        }
        streak
    } else {
        0
    };

    // Best streak
    let sorted: Vec<&str> = {
        let mut s: Vec<&str> = dates.iter().map(|s| s.as_str()).collect();
        s.sort();
        s
    };

    let (mut best_len, mut best_start, mut best_end) = (0i64, String::new(), String::new());
    if !sorted.is_empty() {
        let mut cur_len = 1i64;
        let mut cur_start = sorted[0];
        for i in 1..sorted.len() {
            let prev = NaiveDate::parse_from_str(sorted[i - 1], "%Y-%m-%d").unwrap_or_default();
            let curr = NaiveDate::parse_from_str(sorted[i], "%Y-%m-%d").unwrap_or_default();
            if (curr - prev).num_days() == 1 {
                cur_len += 1;
            } else {
                if cur_len > best_len {
                    best_len = cur_len;
                    best_start = cur_start.to_string();
                    best_end = sorted[i - 1].to_string();
                }
                cur_len = 1;
                cur_start = sorted[i];
            }
        }
        if cur_len > best_len {
            best_len = cur_len;
            best_start = cur_start.to_string();
            best_end = sorted[sorted.len() - 1].to_string();
        }
    }

    Ok(StreakInfo {
        current,
        best: best_len,
        best_start,
        best_end,
    })
}

#[tauri::command]
fn get_working_hour_distribution(
    state: State<AppState>,
    repo_id: i64,
) -> Result<Vec<HourDistribution>, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let mut stmt = db
        .prepare(
            "SELECT CAST(strftime('%H', timestamp) AS INTEGER) as hour, COUNT(*) as cnt
             FROM commits WHERE repo_id = ?1
             GROUP BY hour ORDER BY hour ASC",
        )
        .map_err(|e| e.to_string())?;

    let rows: std::collections::HashMap<i32, i64> = stmt
        .query_map(params![repo_id], |row| {
            Ok((row.get::<_, i32>(0)?, row.get::<_, i64>(1)?))
        })
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();

    let result: Vec<HourDistribution> = (0..24)
        .map(|h| HourDistribution {
            hour: h,
            commits: *rows.get(&h).unwrap_or(&0),
        })
        .collect();

    Ok(result)
}

#[tauri::command]
fn get_estimated_coding_time(
    state: State<AppState>,
    repo_id: i64,
    date: String,
) -> Result<i64, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let mut stmt = db
        .prepare(
            "SELECT timestamp FROM commits WHERE repo_id = ?1 AND date(timestamp) = ?2 ORDER BY timestamp ASC",
        )
        .map_err(|e| e.to_string())?;

    let timestamps: Vec<String> = stmt
        .query_map(params![repo_id, date], |row| row.get::<_, String>(0))
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();

    if timestamps.len() < 2 {
        return Ok(0);
    }

    let first = chrono::DateTime::parse_from_rfc3339(&timestamps[0])
        .or_else(|_| chrono::NaiveDateTime::parse_from_str(&timestamps[0], "%Y-%m-%dT%H:%M:%S")
            .map(|dt| dt.and_utc().fixed_offset()))
        .unwrap_or_default();
    let last = chrono::DateTime::parse_from_rfc3339(timestamps.last().unwrap())
        .or_else(|_| chrono::NaiveDateTime::parse_from_str(timestamps.last().unwrap(), "%Y-%m-%dT%H:%M:%S")
            .map(|dt| dt.and_utc().fixed_offset()))
        .unwrap_or_default();

    Ok((last - first).num_minutes())
}

#[tauri::command]
fn get_most_active_month(
    state: State<AppState>,
    repo_id: i64,
) -> Result<MostActiveMonth, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let result = db.query_row(
        "SELECT strftime('%Y-%m', timestamp) AS ym, COUNT(*) AS cnt
         FROM commits WHERE repo_id = ?1
         GROUP BY ym ORDER BY cnt DESC LIMIT 1",
        params![repo_id],
        |row| Ok((row.get::<_, String>(0)?, row.get::<_, i64>(1)?)),
    );

    match result {
        Ok((ym, cnt)) => {
            let parts: Vec<&str> = ym.split('-').collect();
            if parts.len() == 2 {
                let year: i32 = parts[0].parse().unwrap_or(2024);
                let month: u32 = parts[1].parse().unwrap_or(1);
                let d = NaiveDate::from_ymd_opt(year, month, 1).unwrap_or_default();
                let month_name = d.format("%B %Y").to_string();
                Ok(MostActiveMonth { month: month_name, commits: cnt })
            } else {
                Ok(MostActiveMonth { month: ym, commits: cnt })
            }
        }
        Err(_) => Ok(MostActiveMonth { month: String::new(), commits: 0 }),
    }
}

#[tauri::command]
fn get_milestones(
    state: State<AppState>,
    repo_id: i64,
    limit: i64,
) -> Result<Vec<Milestone>, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let mut stmt = db
        .prepare(
            "SELECT tags, date(timestamp) as d FROM commits
             WHERE repo_id = ?1 AND tags IS NOT NULL AND tags != ''
             ORDER BY timestamp DESC LIMIT ?2",
        )
        .map_err(|e| e.to_string())?;

    let mut milestones = Vec::new();
    let rows: Vec<(String, String)> = stmt
        .query_map(params![repo_id, limit], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
        })
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();

    for (tags, date) in rows {
        for tag in tags.split(',').map(|t| t.trim()).filter(|t| !t.is_empty()) {
            milestones.push(Milestone {
                tag: tag.to_string(),
                date: date.clone(),
            });
        }
    }

    Ok(milestones)
}

// ─── Tauri Commands: Config ──────────────────────────────────────────────────

#[tauri::command]
fn get_config() -> Result<GlobalConfig, String> {
    Ok(load_config_file())
}

#[tauri::command]
fn set_config_value(key: String, value: String) -> Result<(), String> {
    let mut config = load_config_file();
    let json_val: serde_json::Value = serde_json::from_str(&format!("\"{}\"", value))
        .unwrap_or(serde_json::Value::String(value.clone()));

    // Parse booleans and numbers
    let parsed_val = match value.as_str() {
        "true" => serde_json::Value::Bool(true),
        "false" => serde_json::Value::Bool(false),
        "null" => serde_json::Value::Null,
        v => v
            .parse::<f64>()
            .map(|n| serde_json::json!(n))
            .unwrap_or(json_val),
    };

    // Convert config to Value, set nested key, convert back
    let mut config_val =
        serde_json::to_value(&config).map_err(|e| e.to_string())?;
    let keys: Vec<&str> = key.split('.').collect();
    let mut current = &mut config_val;
    for (i, k) in keys.iter().enumerate() {
        if i == keys.len() - 1 {
            current[k] = parsed_val.clone();
        } else {
            if !current[k].is_object() {
                current[k] = serde_json::json!({});
            }
            current = &mut current[k];
        }
    }

    config = serde_json::from_value(config_val).map_err(|e| e.to_string())?;
    save_config_file(&config)
}

// ─── Tauri Commands: Cloud ───────────────────────────────────────────────────

#[tauri::command]
fn cloud_is_configured() -> bool {
    let config = load_config_file();
    config.cloud_token.is_some() && !config.cloud_token.as_ref().unwrap().is_empty()
}

#[tauri::command]
async fn cloud_login_start(state: State<'_, AppState>) -> Result<DeviceCodeData, String> {
    let config = load_config_file();
    let api_url = cloud_api_url(&config);

    let resp = state
        .http
        .post(format!("{}/api/v1/auth/device-code", api_url))
        .header("Content-Type", "application/json")
        .send()
        .await
        .map_err(|e| e.to_string())?;

    let result: DeviceCodeResponse = resp.json().await.map_err(|e| e.to_string())?;
    Ok(result.data)
}

#[tauri::command]
async fn cloud_login_poll(
    state: State<'_, AppState>,
    device_code: String,
) -> Result<Option<String>, String> {
    let config = load_config_file();
    let api_url = cloud_api_url(&config);

    let resp = state
        .http
        .post(format!("{}/api/v1/auth/device-poll", api_url))
        .json(&serde_json::json!({ "deviceCode": device_code }))
        .send()
        .await
        .map_err(|e| e.to_string())?;

    let result: DevicePollResponse = resp.json().await.map_err(|e| e.to_string())?;

    if result.data.confirmed {
        if let Some(token) = &result.data.token {
            let mut config = load_config_file();
            config.cloud_enabled = true;
            config.cloud_token = Some(token.clone());
            save_config_file(&config)?;
            return Ok(Some(token.clone()));
        }
    }
    Ok(None)
}

#[tauri::command]
fn cloud_logout() -> Result<(), String> {
    let mut config = load_config_file();
    config.cloud_enabled = false;
    config.cloud_token = None;
    save_config_file(&config)
}

#[tauri::command]
async fn cloud_get_profile(state: State<'_, AppState>) -> Result<CloudProfile, String> {
    let config = load_config_file();
    let api_url = cloud_api_url(&config);
    let token = config.cloud_token.ok_or("Not logged in")?;

    let resp = state
        .http
        .get(format!("{}/api/v1/profile", api_url))
        .header("Authorization", format!("Bearer {}", token))
        .send()
        .await
        .map_err(|e| e.to_string())?;

    let result: CloudApiResponse<CloudProfile> =
        resp.json().await.map_err(|e| e.to_string())?;
    result.data.ok_or_else(|| "No profile data".to_string())
}

#[tauri::command]
async fn cloud_update_profile(
    state: State<'_, AppState>,
    field: String,
    value: String,
) -> Result<(), String> {
    let config = load_config_file();
    let api_url = cloud_api_url(&config);
    let token = config.cloud_token.ok_or("Not logged in")?;

    let mut body = serde_json::Map::new();
    body.insert(field, serde_json::Value::String(value));

    state
        .http
        .patch(format!("{}/api/v1/profile", api_url))
        .header("Authorization", format!("Bearer {}", token))
        .json(&body)
        .send()
        .await
        .map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
async fn cloud_publish_daily(
    state: State<'_, AppState>,
    repo_id: i64,
    date: String,
) -> Result<String, String> {
    let config = load_config_file();
    let api_url = cloud_api_url(&config);
    let token = config.cloud_token.as_ref().ok_or("Not logged in")?.clone();

    // Get repo info
    let (repo_name, repo_path) = {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        let mut stmt = db
            .prepare("SELECT name, path FROM repos WHERE id = ?1")
            .map_err(|e| e.to_string())?;
        stmt.query_row(params![repo_id], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
        })
        .map_err(|e| e.to_string())?
    };

    let repo_slug = std::path::Path::new(&repo_path)
        .file_name()
        .map(|n| n.to_string_lossy().to_lowercase().replace(' ', "-"))
        .unwrap_or_else(|| repo_name.to_lowercase());

    // Get commits and summary
    let (commits_count, lines_added, lines_removed, files_changed, commit_messages, user_notes, ai_draft) = {
        let db = state.db.lock().map_err(|e| e.to_string())?;

        let summary: Option<(i64, i64, i64, i64, Option<String>, Option<String>)> = db
            .query_row(
                "SELECT commits_count, lines_added, lines_removed, files_touched, user_notes, ai_draft
                 FROM daily_summaries WHERE repo_id = ?1 AND date = ?2",
                params![repo_id, date],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?, row.get(4)?, row.get(5)?)),
            )
            .ok();

        let mut stmt = db
            .prepare("SELECT message FROM commits WHERE repo_id = ?1 AND date(timestamp) = ?2")
            .map_err(|e| e.to_string())?;
        let messages: Vec<String> = stmt
            .query_map(params![repo_id, date], |row| row.get::<_, Option<String>>(0))
            .map_err(|e| e.to_string())?
            .filter_map(|r| r.ok().flatten())
            .collect();

        let (cc, la, lr, fc) = summary
            .as_ref()
            .map(|(c, a, r, f, _, _)| (*c, *a, *r, *f))
            .unwrap_or((messages.len() as i64, 0, 0, 0));

        let un = summary.as_ref().and_then(|(_, _, _, _, n, _)| n.clone());
        let ad = summary.as_ref().and_then(|(_, _, _, _, _, d)| d.clone());

        (cc, la, lr, fc, messages, un, ad)
    };

    // Get module activity
    let module_activity = {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        let mut stmt = db
            .prepare(
                "SELECT module, SUM(changes) as total FROM file_activity
                 WHERE repo_id = ?1 AND date = ?2 GROUP BY module ORDER BY total DESC",
            )
            .map_err(|e| e.to_string())?;

        let rows: Vec<(String, i64)> = stmt
            .query_map(params![repo_id, date], |row| {
                Ok((row.get::<_, String>(0)?, row.get::<_, i64>(1)?))
            })
            .map_err(|e| e.to_string())?
            .filter_map(|r| r.ok())
            .collect();

        let total: i64 = rows.iter().map(|(_, c)| c).sum();
        let mut map = serde_json::Map::new();
        for (module, changes) in rows {
            let pct = if total > 0 { changes as f64 / total as f64 } else { 0.0 };
            map.insert(module, serde_json::json!(pct));
        }
        serde_json::Value::Object(map)
    };

    let body = serde_json::json!({
        "repoName": repo_name,
        "repoSlug": repo_slug,
        "date": date,
        "commitsCount": commits_count,
        "linesAdded": lines_added,
        "linesRemoved": lines_removed,
        "filesChanged": files_changed,
        "commitMessages": serde_json::to_string(&commit_messages).unwrap_or_default(),
        "moduleActivity": serde_json::to_string(&module_activity).unwrap_or_default(),
        "userNotes": user_notes,
        "aiDraft": ai_draft,
    });

    let resp = state
        .http
        .post(format!("{}/api/v1/digests", api_url))
        .header("Authorization", format!("Bearer {}", token))
        .json(&body)
        .send()
        .await
        .map_err(|e| e.to_string())?;

    let result: CloudApiResponse<DigestPublishData> =
        resp.json().await.map_err(|e| e.to_string())?;

    if let Some(data) = result.data {
        // Mark as published in cloud
        let _ = state
            .http
            .patch(format!("{}/api/v1/digests/{}", api_url, data.id))
            .header("Authorization", format!("Bearer {}", token))
            .json(&serde_json::json!({ "isPublished": true }))
            .send()
            .await;

        // Mark published locally
        {
            let db = state.db.lock().map_err(|e| e.to_string())?;
            let now = Local::now().to_rfc3339();
            let _ = db.execute(
                "UPDATE daily_summaries SET published = 1, published_at = ?3 WHERE repo_id = ?1 AND date = ?2",
                params![repo_id, date, now],
            );
        }
    }

    // Get profile URL
    let profile_url = match state
        .http
        .get(format!("{}/api/v1/profile", api_url))
        .header("Authorization", format!("Bearer {}", token))
        .send()
        .await
    {
        Ok(resp) => {
            let profile: CloudApiResponse<CloudProfile> =
                resp.json().await.unwrap_or(CloudApiResponse { success: false, data: None, message: None });
            profile
                .data
                .map(|p| format!("worktale.dev/{}", p.username))
                .unwrap_or_else(|| "worktale.dev".into())
        }
        Err(_) => "worktale.dev".into(),
    };

    Ok(profile_url)
}

#[tauri::command]
async fn cloud_publish_weekly(state: State<'_, AppState>) -> Result<WeeklyDigestResponse, String> {
    let config = load_config_file();
    let api_url = cloud_api_url(&config);
    let token = config.cloud_token.ok_or("Not logged in")?;

    let resp = state
        .http
        .post(format!("{}/api/v1/weekly", api_url))
        .header("Authorization", format!("Bearer {}", token))
        .json(&serde_json::json!({}))
        .send()
        .await
        .map_err(|e| e.to_string())?;

    let result: CloudApiResponse<WeeklyDigestResponse> =
        resp.json().await.map_err(|e| e.to_string())?;
    result.data.ok_or_else(|| "No weekly digest data".to_string())
}

#[tauri::command]
async fn cloud_standup(state: State<'_, AppState>) -> Result<String, String> {
    let config = load_config_file();
    let api_url = cloud_api_url(&config);
    let token = config.cloud_token.ok_or("Not logged in")?;

    let resp = state
        .http
        .post(format!("{}/api/v1/standup", api_url))
        .header("Authorization", format!("Bearer {}", token))
        .json(&serde_json::json!({}))
        .send()
        .await
        .map_err(|e| e.to_string())?;

    let status = resp.status();
    let body = resp.text().await.map_err(|e| e.to_string())?;

    if !status.is_success() {
        return Err(format!("API error ({}): {}", status.as_u16(), body));
    }

    let result: CloudApiResponse<AiTextResponse> =
        serde_json::from_str(&body).map_err(|e| format!("Failed to parse response: {e}\nBody: {body}"))?;
    Ok(result
        .data
        .and_then(|d| d.output)
        .unwrap_or_else(|| "No standup generated.".into()))
}

#[tauri::command]
async fn cloud_retro(state: State<'_, AppState>, days: i64) -> Result<String, String> {
    let config = load_config_file();
    let api_url = cloud_api_url(&config);
    let token = config.cloud_token.ok_or("Not logged in")?;

    let resp = state
        .http
        .post(format!("{}/api/v1/retro", api_url))
        .header("Authorization", format!("Bearer {}", token))
        .json(&serde_json::json!({ "days": days }))
        .send()
        .await
        .map_err(|e| e.to_string())?;

    let status = resp.status();
    let body = resp.text().await.map_err(|e| e.to_string())?;

    if !status.is_success() {
        return Err(format!("API error ({}): {}", status.as_u16(), body));
    }

    let result: CloudApiResponse<AiTextResponse> =
        serde_json::from_str(&body).map_err(|e| format!("Failed to parse response: {e}\nBody: {body}"))?;
    Ok(result
        .data
        .and_then(|d| d.output)
        .unwrap_or_else(|| "No retrospective generated.".into()))
}

#[tauri::command]
async fn cloud_timeline(
    state: State<'_, AppState>,
    page: i64,
) -> Result<PagedResponse<TimelineEntry>, String> {
    let config = load_config_file();
    let api_url = cloud_api_url(&config);
    let token = config.cloud_token.ok_or("Not logged in")?;

    let resp = state
        .http
        .get(format!(
            "{}/api/v1/timeline?page={}&pageSize=20",
            api_url, page
        ))
        .header("Authorization", format!("Bearer {}", token))
        .send()
        .await
        .map_err(|e| e.to_string())?;

    resp.json().await.map_err(|e| e.to_string())
}

// ─── Tauri Commands: AI Sessions ─────────────────────────────────────────────

#[tauri::command]
fn get_ai_sessions_by_date(
    state: State<AppState>,
    repo_id: i64,
    date: String,
) -> Result<Vec<AiSession>, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let mut stmt = db
        .prepare("SELECT id, repo_id, date, provider, model, tool, cost_usd, input_tokens, output_tokens, tools_used, mcp_servers, duration_secs, commits, note, timestamp FROM ai_sessions WHERE repo_id = ?1 AND date = ?2 ORDER BY timestamp DESC")
        .map_err(|e| e.to_string())?;

    let sessions = stmt
        .query_map(params![repo_id, date], |row| {
            Ok(AiSession {
                id: row.get(0)?,
                repo_id: row.get(1)?,
                date: row.get(2)?,
                provider: row.get(3)?,
                model: row.get(4)?,
                tool: row.get(5)?,
                cost_usd: row.get(6)?,
                input_tokens: row.get(7)?,
                output_tokens: row.get(8)?,
                tools_used: row.get(9)?,
                mcp_servers: row.get(10)?,
                duration_secs: row.get(11)?,
                commits: row.get(12)?,
                note: row.get(13)?,
                timestamp: row.get(14)?,
            })
        })
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();

    Ok(sessions)
}

#[tauri::command]
fn get_ai_session_stats(
    state: State<AppState>,
    repo_id: i64,
    days: i64,
) -> Result<AiSessionStats, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let since = Local::now().date_naive() - chrono::Duration::days(days);
    let since_str = date_string(&since);

    let mut stmt = db
        .prepare("SELECT provider, model, tool, cost_usd, input_tokens, output_tokens, duration_secs, tools_used, mcp_servers FROM ai_sessions WHERE repo_id = ?1 AND date >= ?2")
        .map_err(|e| e.to_string())?;

    let rows: Vec<(Option<String>, Option<String>, Option<String>, f64, i64, i64, i64, Option<String>, Option<String>)> = stmt
        .query_map(params![repo_id, since_str], |row| {
            Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?, row.get(4)?, row.get(5)?, row.get(6)?, row.get(7)?, row.get(8)?))
        })
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();

    let mut stats = AiSessionStats {
        total_sessions: rows.len() as i64,
        total_cost: 0.0,
        total_input_tokens: 0,
        total_output_tokens: 0,
        total_duration_secs: 0,
        providers: Vec::new(),
        models: Vec::new(),
        tools: Vec::new(),
        tools_used_frequency: Vec::new(),
        mcp_servers_used: Vec::new(),
    };

    let mut provider_map: std::collections::HashMap<String, i64> = std::collections::HashMap::new();
    let mut model_map: std::collections::HashMap<String, i64> = std::collections::HashMap::new();
    let mut tool_map: std::collections::HashMap<String, i64> = std::collections::HashMap::new();
    let mut tools_freq: std::collections::HashMap<String, i64> = std::collections::HashMap::new();
    let mut mcp_freq: std::collections::HashMap<String, i64> = std::collections::HashMap::new();

    for (provider, model, tool, cost, inp, out, dur, tools_used, mcp) in &rows {
        stats.total_cost += cost;
        stats.total_input_tokens += inp;
        stats.total_output_tokens += out;
        stats.total_duration_secs += dur;

        if let Some(p) = provider { *provider_map.entry(p.clone()).or_default() += 1; }
        if let Some(m) = model { *model_map.entry(m.clone()).or_default() += 1; }
        if let Some(t) = tool { *tool_map.entry(t.clone()).or_default() += 1; }

        if let Some(tu) = tools_used {
            if let Ok(arr) = serde_json::from_str::<Vec<String>>(tu) {
                for t in arr { *tools_freq.entry(t).or_default() += 1; }
            }
        }
        if let Some(ms) = mcp {
            if let Ok(arr) = serde_json::from_str::<Vec<String>>(ms) {
                for s in arr { *mcp_freq.entry(s).or_default() += 1; }
            }
        }
    }

    let mut to_sorted = |map: std::collections::HashMap<String, i64>| -> Vec<(String, i64)> {
        let mut v: Vec<_> = map.into_iter().collect();
        v.sort_by(|a, b| b.1.cmp(&a.1));
        v
    };

    stats.providers = to_sorted(provider_map);
    stats.models = to_sorted(model_map);
    stats.tools = to_sorted(tool_map);
    stats.tools_used_frequency = to_sorted(tools_freq);
    stats.mcp_servers_used = to_sorted(mcp_freq);

    Ok(stats)
}

#[tauri::command]
fn get_daily_ai_summary(
    state: State<AppState>,
    repo_id: i64,
    start_date: String,
    end_date: String,
) -> Result<Vec<DailyAiSummary>, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let mut stmt = db
        .prepare("SELECT date, COUNT(*) as sessions, COALESCE(SUM(cost_usd), 0) as cost, COALESCE(SUM(input_tokens + output_tokens), 0) as tokens FROM ai_sessions WHERE repo_id = ?1 AND date >= ?2 AND date <= ?3 GROUP BY date ORDER BY date ASC")
        .map_err(|e| e.to_string())?;

    let results = stmt
        .query_map(params![repo_id, start_date, end_date], |row| {
            Ok(DailyAiSummary {
                date: row.get(0)?,
                sessions: row.get(1)?,
                cost: row.get(2)?,
                tokens: row.get(3)?,
            })
        })
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();

    Ok(results)
}

// ─── Tauri Commands: Digest Generation ───────────────────────────────────────

#[tauri::command]
fn generate_digest(
    state: State<AppState>,
    repo_id: i64,
    date: String,
) -> Result<String, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;

    // Get commits
    let mut stmt = db
        .prepare(
            "SELECT message FROM commits WHERE repo_id = ?1 AND date(timestamp) = ?2 ORDER BY timestamp ASC",
        )
        .map_err(|e| e.to_string())?;

    let messages: Vec<Option<String>> = stmt
        .query_map(params![repo_id, date], |row| row.get::<_, Option<String>>(0))
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();

    // Get summary
    let summary = db
        .query_row(
            "SELECT commits_count, lines_added, lines_removed, files_touched
             FROM daily_summaries WHERE repo_id = ?1 AND date = ?2",
            params![repo_id, date],
            |row| {
                Ok((
                    row.get::<_, i64>(0)?,
                    row.get::<_, i64>(1)?,
                    row.get::<_, i64>(2)?,
                    row.get::<_, i64>(3)?,
                ))
            },
        )
        .unwrap_or((messages.len() as i64, 0, 0, 0));

    // Get modules
    let mut mod_stmt = db
        .prepare(
            "SELECT module, SUM(changes) as total FROM file_activity
             WHERE repo_id = ?1 AND date = ?2 GROUP BY module ORDER BY total DESC",
        )
        .map_err(|e| e.to_string())?;

    let mod_rows: Vec<(String, i64)> = mod_stmt
        .query_map(params![repo_id, date], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, i64>(1)?))
        })
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();

    let mod_total: i64 = mod_rows.iter().map(|(_, c)| c).sum();

    // Build digest markdown
    let d = NaiveDate::parse_from_str(&date, "%Y-%m-%d").unwrap_or_default();
    let date_display = d.format("%B %e, %Y").to_string();

    let mut md = format!("## {}\n\n### What I built\n", date_display);

    let mut seen = std::collections::HashSet::new();
    for msg in &messages {
        if let Some(m) = msg {
            let mut cleaned = m.clone();
            // Strip conventional commit prefix
            if let Some(idx) = cleaned.find(": ") {
                let prefix = &cleaned[..idx];
                if ["feat", "fix", "refactor", "chore", "docs", "test", "style", "perf", "ci", "build", "revert"]
                    .iter()
                    .any(|p| prefix.starts_with(p))
                {
                    let rest = &cleaned[idx + 2..];
                    cleaned = if prefix.starts_with("feat") {
                        format!("Added {}", rest[..1].to_lowercase() + &rest[1..])
                    } else if prefix.starts_with("fix") {
                        format!("Fixed {}", rest[..1].to_lowercase() + &rest[1..])
                    } else if prefix.starts_with("refactor") {
                        format!("Refactored {}", rest[..1].to_lowercase() + &rest[1..])
                    } else {
                        format!("{}{}", &rest[..1].to_uppercase(), &rest[1..])
                    };
                }
            }
            if seen.insert(cleaned.clone()) {
                md.push_str(&format!("- {}\n", cleaned));
            }
        }
    }

    md.push_str(&format!(
        "\n### Stats\n- {} commits, +{} / -{} lines, {} files touched\n",
        summary.0, summary.1, summary.2, summary.3
    ));

    if !mod_rows.is_empty() {
        md.push_str("\n### Areas\n- ");
        let parts: Vec<String> = mod_rows
            .iter()
            .take(5)
            .map(|(module, changes)| {
                let pct = if mod_total > 0 {
                    (*changes as f64 / mod_total as f64 * 100.0).round() as i64
                } else {
                    0
                };
                format!("{} ({}%)", module, pct)
            })
            .collect();
        md.push_str(&parts.join(", "));
        md.push('\n');
    }

    Ok(md)
}

// ─── Tauri Commands: Git Operations ──────────────────────────────────────────

#[tauri::command]
fn check_is_git_repo(path: String) -> bool {
    std::path::Path::new(&path).join(".git").exists()
}

#[tauri::command]
fn get_current_branch(path: String) -> Result<String, String> {
    let output = std::process::Command::new("git")
        .args(["rev-parse", "--abbrev-ref", "HEAD"])
        .current_dir(&path)
        .output()
        .map_err(|e| e.to_string())?;

    Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
}

#[tauri::command]
fn get_git_user_email(path: String) -> Result<String, String> {
    let output = std::process::Command::new("git")
        .args(["config", "user.email"])
        .current_dir(&path)
        .output()
        .map_err(|e| e.to_string())?;

    Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
}

#[tauri::command]
fn open_in_browser(url: String) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    std::process::Command::new("cmd")
        .args(["/c", "start", &url])
        .spawn()
        .map_err(|e| e.to_string())?;

    #[cfg(target_os = "macos")]
    std::process::Command::new("open")
        .arg(&url)
        .spawn()
        .map_err(|e| e.to_string())?;

    #[cfg(target_os = "linux")]
    std::process::Command::new("xdg-open")
        .arg(&url)
        .spawn()
        .map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
fn get_today_string() -> String {
    today_string()
}

// ─── App Run ─────────────────────────────────────────────────────────────────

pub fn run() {
    let db = open_db().expect("Failed to open Worktale database");
    let http = Client::new();

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(AppState {
            db: Mutex::new(db),
            http,
        })
        .invoke_handler(tauri::generate_handler![
            // Repos
            get_all_repos,
            get_repo_by_path,
            get_repo_by_id,
            remove_repo,
            // Commits
            get_commits_by_date,
            get_recent_commits,
            get_commit_count,
            get_commit_stats_range,
            // Daily summaries
            get_daily_summary,
            get_daily_summaries_range,
            update_user_notes,
            update_ai_draft,
            mark_published,
            get_unpublished_days,
            mark_all_published,
            // File activity
            get_module_activity_by_date,
            get_top_modules,
            // Streaks
            get_active_dates,
            get_streak_info,
            get_working_hour_distribution,
            get_estimated_coding_time,
            get_most_active_month,
            get_milestones,
            // Config
            get_config,
            set_config_value,
            // Cloud
            cloud_is_configured,
            cloud_login_start,
            cloud_login_poll,
            cloud_logout,
            cloud_get_profile,
            cloud_update_profile,
            cloud_publish_daily,
            cloud_publish_weekly,
            cloud_standup,
            cloud_retro,
            cloud_timeline,
            // AI Sessions
            get_ai_sessions_by_date,
            get_ai_session_stats,
            get_daily_ai_summary,
            // Digest
            generate_digest,
            // Git
            check_is_git_repo,
            get_current_branch,
            get_git_user_email,
            open_in_browser,
            get_today_string,
        ])
        .run(tauri::generate_context!())
        .expect("Error running Worktale Desktop");
}
