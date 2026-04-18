# Worktale Plugin for GitHub Copilot CLI

**AI session tracking for your daily work journal — with real token + cost capture.**

When active, Copilot:

1. **Per commit:** the agent appends a 1–2 sentence narrative note to your daily [Worktale](https://worktale.org) journal via `worktale note`.
2. **At session end:** a Stop / SessionEnd hook parses Copilot's session-state JSONL files at `~/.copilot/session-state/<sessionId>/events.jsonl` and automatically records **provider, model, input + cached tokens, output tokens, computed cost, tools used, MCP servers, and duration** to your local Worktale DB.

Copilot CLI persists every API call as an `assistant.usage` event with token usage AND a pre-computed `cost` field — the plugin reads those rollups directly. **No rate-table guessing required.**

## Install

```bash
# 1. Clone this repo
git clone https://github.com/worktale/worktale-copilot-plugin.git

# 2. Install the agent (per-commit narrative)
mkdir -p .github/copilot
cp worktale-copilot-plugin/agents/worktale.md .github/copilot/

# 3. Register the Stop hook (auto token + cost capture)
mkdir -p ~/.copilot/hooks
cp worktale-copilot-plugin/hooks/session-track.mjs ~/.copilot/hooks/
mkdir -p ~/.copilot
cp worktale-copilot-plugin/hooks/hooks.json ~/.copilot/hooks.json
# Then update ~/.copilot/hooks.json command path to the absolute location:
# "command": "node /home/you/.copilot/hooks/session-track.mjs"
```

Requires the [Worktale CLI](https://www.npmjs.com/package/worktale) **v1.4.0+**:

```bash
npm install -g worktale@latest
cd your-repo
worktale init
```

## How the hook works

Copilot fires the `Stop` hook after every turn. The script:

1. Scans `~/.copilot/session-state/` (also checks `%LOCALAPPDATA%\copilot\session-state\` on Windows).
2. Skips sessions whose `events.jsonl` was modified in the last 5 minutes (treats them as still-active).
3. Skips sessions already recorded (tracked in `~/.worktale/copilot-processed.json`).
4. For each newly-finished session: parses the JSONL, sums `assistant.usage` events for cost + tokens (with a `session.shutdown.modelMetrics` fallback), extracts model from `session.start.selectedModel` or per-call `model` field, captures tool names from `tool.execution_start` (including MCP `mcpToolName` + `mcpServerName`), then shells out to `worktale session add` with the aggregate.

## Why this is the most accurate cost number

Copilot computes its own `cost` value on every API call. The hook just sums those — the recorded number matches what Copilot itself charges to your subscription. No model-rate guessing, no inference price drift.

## Usage in a Copilot session

In your Copilot session, mention `@worktale` or invoke the agent. The agent will:

```bash
# After each commit
worktale note "Fixed race condition in job queue — claim query wasn't using SELECT FOR UPDATE"
```

That's it. At session end, the hook runs the equivalent of:

```bash
worktale session add \
  --provider github \
  --tool copilot \
  --model claude-sonnet-4.5 \
  --input-tokens 43500 \
  --output-tokens 4200 \
  --cost 0.1410 \
  --duration 270 \
  --tools-used shell,get_issue \
  --mcp-servers github
```

## View your data

```bash
worktale today                    # today's commits + AI sessions
worktale session list             # recent sessions
worktale session stats --days 30  # cost & token rollup
worktale dash                     # interactive TUI
```

## License

MIT
