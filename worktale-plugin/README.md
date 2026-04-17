# Worktale Plugin for Claude Code

**AI session tracking for your daily work journal.**

Git captures the *what*. This plugin captures the *why* and the *how*.

When you activate `/worktale` in Claude Code:

1. After every commit, the agent appends a 1–2 sentence narrative note to your daily [Worktale](https://worktale.org) journal.
2. At session end, a `SessionEnd` hook parses the transcript and records aggregate metrics to Worktale: **provider, model, tokens, cost, tools used, MCP servers, and duration**.

All data stays local. Metrics live in your Worktale SQLite DB; cloud sync is opt-in via `worktale publish`.

## Install

```bash
/plugin marketplace add worktale/worktale-plugin
/plugin install worktale-plugin@worktale-plugin
```

Requires the [Worktale CLI](https://www.npmjs.com/package/worktale) **v1.4.0+**:

```bash
npm install -g worktale@latest
cd your-repo
worktale init
```

## Usage

```
/worktale
```

The agent confirms narration is active. After every commit, it runs:

```bash
worktale note "Fixed race condition in job queue — claim query wasn't using SELECT FOR UPDATE"
```

At session end, the hook automatically runs:

```bash
worktale session add \
  --provider anthropic \
  --tool claude-code \
  --model <detected-model> \
  --input-tokens <sum-from-transcript> \
  --output-tokens <sum-from-transcript> \
  --cost <computed-from-rates> \
  --tools-used Read,Edit,Bash,... \
  --mcp-servers <detected> \
  --duration <session-seconds>
```

## View your data

```bash
worktale today      # Today's sessions + narrative
worktale session list
worktale session stats
worktale dash       # Interactive TUI
```

## How tokens/cost are computed

The hook reads `transcript_path` from the `SessionEnd` payload, parses the JSONL, and sums `usage.input_tokens`, `usage.output_tokens`, `usage.cache_read_input_tokens`, and `usage.cache_creation_input_tokens` across every assistant message. Cost is computed from a built-in Anthropic rate table (Opus/Sonnet/Haiku 4.x). Unknown models report $0 for cost but full token counts.

## License

MIT
