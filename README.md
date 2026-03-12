# Worktale

**Your dev story, told beautifully.**

You ship code behind firewalls. To private repos. In silence. Months of brilliant work — invisible. Even to you.

Worktale is a local-first CLI that turns your git history into a personal record of everything you actually built. No account. No cloud. No code leaves your machine.

One command to set up. Zero friction after that.

```
npm install -g worktale
cd your-repo
worktale init
```

That's it. Worktale installs a silent post-commit hook, scans your existing history, and starts tracking. Every commit you make from that point forward is captured automatically.

Or scan all your repos at once — no hooks, no commitment:

```
cd ~/projects
worktale batch --since 3m
```

This recursively finds every git repo under the current directory and imports the last 3 months of commit history. Nothing is modified in your repos.

### 🤖 NEW: Claude Code Integration (v1.1.0+)

Worktale has a **Claude Code plugin** that turns your AI coding agent into a session narrator. After every commit, the agent automatically adds rich context — intent, decisions, trade-offs — to your daily work log.

```
# In Claude Code:
/plugin marketplace add worktale/worktale-plugin
/plugin install worktale-plugin@worktale-plugin
/worktale
```

That's it. The agent narrates as you code. Your end-of-day digest writes itself.

> **Requires Worktale CLI v1.1.0+** — `npm install -g worktale@latest`

[Full plugin docs →](https://worktale.org/plugin.html)

---

## What You Get

**A daily journal you never have to write.** Worktale captures commit metadata — messages, line counts, files changed, timestamps — and organizes it into a browsable, searchable personal work log.

**An interactive dashboard in your terminal.** Three views: today's overview, a day-by-day log with editable notes, and a full history with heatmaps and streak tracking. Navigate with keyboard shortcuts. No browser required.

**AI-powered digests (optional, local-only).** Generate end-of-day summaries using a local Ollama instance. Your commit messages never leave your machine. The default template mode doesn't use AI at all.

**End-of-day nudges.** A shell prompt reminder that asks if you want to write up your day. Configurable time, easy to install or remove.

---

## Commands

| Command | What it does |
|---------|-------------|
| `worktale init` | Initialize in current repo — hooks, history scan, config |
| `worktale batch` | Recursively scan for repos and import history (no hooks) |
| `worktale dash` | Interactive TUI dashboard |
| `worktale today` | Today's commits, lines, files, coding time |
| `worktale status` | One-line summary with streak |
| `worktale log` | Multi-day history (default 7 days) |
| `worktale digest` | Generate a work summary (template or AI) |
| `worktale note` | Append a note to today's work narrative |
| `worktale repos` | List all tracked repositories |
| `worktale config` | View or modify settings |
| `worktale hook` | Install, uninstall, or check status of git hooks |
| `worktale capture` | Capture latest commit (used by git hooks) |
| `worktale nudge` | Manage end-of-day reminders |
| `worktale publish` | Cloud publishing (coming soon) |

Run `worktale --help` or `worktale <command> --help` for full details.

### Batch mode

Scan all your repos at once without installing hooks. Great for getting an at-a-glance view of everything you've built.

```bash
worktale batch                    # All history (can be slow for large repos)
worktale batch --since 3m         # Last 3 months only (fast)
worktale batch --since 6w         # Last 6 weeks
worktale batch --depth 2          # Only search 2 levels deep
```

Accepts shorthand periods: `30d` (days), `6w` (weeks), `3m` (months), `1y` (years).

### Hook management

Manage git hooks independently of `worktale init`. Useful after a batch scan when you decide you want live capture on specific repos.

```bash
worktale hook install             # Install hooks in current repo
worktale hook install /path/to    # Install in a specific repo
worktale hook uninstall           # Remove hooks (preserves other hooks)
worktale hook status              # Check if hooks are installed
```

If the repo isn't tracked yet, `hook install` automatically registers it in the database.

### AI agent integration (v1.1.0+)

Worktale integrates with every major AI coding agent. The agent runs `worktale note` after each commit, adding rich context — intent, decisions, problems solved — to your daily narrative.

| Platform | Install | Type |
|----------|---------|------|
| **Claude Code** | See two-step install below | Plugin |
| **Copilot CLI** | `/plugin install worktale/worktale-copilot-plugin` | Plugin + hooks |
| **Codex CLI** | `git clone` → `~/.agents/skills/worktale/` | Skill |
| **Cursor** | Copy `integrations/cursor-rules.md` → `.cursor/rules/worktale.md` | Rules |
| **Cline** | Copy `integrations/cline-rules.md` → `.clinerules/worktale.md` | Rules |
| **Windsurf** | Copy `integrations/windsurf-rules.md` → `.windsurf/rules/worktale.md` | Rules |

```bash
# Claude Code example:
/plugin marketplace add worktale/worktale-plugin
/plugin install worktale-plugin@worktale-plugin
/worktale

# The agent narrates each commit:
# worktale note "Refactored auth middleware for compliance — replaced session token storage"
# worktale note "Fixed race condition in job queue — workers were claiming same job"
```

The notes appear in `worktale digest` and the TUI dashboard alongside your git stats, giving you a complete picture of what you built and why.

You can also use `worktale note` manually from any script or CI pipeline:

```bash
worktale note "Deployed v2.1.0 to production"
```

> **Requires Worktale CLI v1.1.0+** — [Full integration docs →](https://worktale.org/plugin.html)

---

## Privacy

This isn't a privacy policy checkbox. It's the architecture.

- All data lives in a local SQLite database (`~/.worktale/worktale.db`)
- No telemetry. No analytics. No network requests.
- The `.worktale/` directory is auto-added to `.gitignore`
- Git hooks capture metadata only — never file contents
- AI digests run against a local Ollama instance. Nothing external.

Your code stays on your machine. Always.

---

## How It Works

**Per-repo setup (`worktale init`):**
1. Detects your repo, creates a `.worktale/` config directory, installs a post-commit git hook, and scans your entire commit history using a background worker thread
2. Every `git commit` silently triggers `worktale capture` — recording the SHA, message, line counts, file changes, branch, and tags
3. Data is stored in a SQLite database with WAL mode for performance
4. Use the CLI or TUI to browse, search, and summarize your activity

**Bulk import (`worktale batch`):**
1. Recursively walks from the current directory, finding all git repos
2. Skips build output (`bin`, `obj`, `dist`, `target`, `build`), dependencies (`node_modules`, `vendor`, `packages`), and other non-repo directories for speed
3. Imports commit history for each repo into the shared database — optionally filtered by `--since`
4. No hooks installed, no files created in your repos. Read-only scan.

The hook supports both bash and PowerShell for cross-platform compatibility (Windows, macOS, Linux).

---

## Configuration

Global config lives at `~/.worktale/config.json`. Per-repo config lives at `<repo>/.worktale/config.json`.

```bash
worktale config get nudgeTime        # "17:00"
worktale config set ai.provider ollama
worktale config path                 # show config file location
```

Supports dot-notation for nested keys. Values are auto-parsed (booleans, numbers, null).

---

## Requirements

- Node.js >= 18.0.0
- A git repository

That's the whole list.

---

## Development

```bash
git clone https://github.com/worktale/worktale-cli.git
cd worktale-cli
npm install
npm run build    # tsup dual build (CLI + worker)
npm test         # vitest — 425 tests
```

The project is TypeScript compiled to ESM. The TUI is built with Ink 5 (React 18 for terminals). The database uses better-sqlite3 with native bindings.

---

## License

MIT

---

Built by [Plu(rr)al](https://plurral.com).
