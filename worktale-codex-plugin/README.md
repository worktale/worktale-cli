# Worktale Plugin for OpenAI Codex

**AI session tracking for your daily work journal — with real token + cost capture.**

When active, Codex:

1. **Per commit:** the agent appends a 1–2 sentence narrative note to your daily [Worktale](https://worktale.org) journal via `worktale note`.
2. **At session end:** a Stop / SessionEnd hook parses the Codex session JSONL files at `~/.codex/sessions/YYYY/MM/DD/*.jsonl` and automatically records **provider, model, input tokens, cached tokens, output tokens, computed cost, and duration** to your local Worktale DB.

Codex DOES persist token usage to disk (see [CodexMonitor's prior art](https://github.com/Dimillian/CodexMonitor) — same source). The plugin reads those rollouts and computes cost from a built-in OpenAI rate table.

## Install

```bash
# 1. Clone this repo
git clone https://github.com/worktale/worktale-codex-plugin.git

# 2. Copy the skill so Codex picks it up
mkdir -p ~/.codex/skills/worktale
cp -r worktale-codex-plugin/skills/worktale/* ~/.codex/skills/worktale/

# 3. Register the SessionEnd hook
mkdir -p ~/.codex
cp worktale-codex-plugin/hooks/hooks.json ~/.codex/hooks.json

# 4. Make sure the hook script is somewhere stable
mkdir -p ~/.codex/hooks
cp worktale-codex-plugin/hooks/session-track.mjs ~/.codex/hooks/
# Then update ~/.codex/hooks.json to point at the absolute path:
# "command": "node /home/you/.codex/hooks/session-track.mjs"
```

Requires the [Worktale CLI](https://www.npmjs.com/package/worktale) **v1.4.0+**:

```bash
npm install -g worktale@latest
cd your-repo
worktale init
```

## How the hook works

Codex fires the `Stop` hook after every turn. The script:

1. Scans `~/.codex/sessions/` for recent `.jsonl` rollouts.
2. Skips files modified in the last 5 minutes (treats them as still-active).
3. Skips files already recorded (tracked in `~/.worktale/codex-processed.json`).
4. For each newly-finished session: parses the JSONL, sums `total_token_usage` deltas across `token_count` events, extracts model from `turn_context` events, computes cost against the built-in OpenAI rate table (GPT-5/4o/4.1/o3/o4 family + Codex-mini), and shells out to `worktale session add` with the aggregate.

The trade-off vs. Claude Code's hook: Codex doesn't fire a session-end event, only turn-end. So the very last session of a run gets recorded the next time Codex starts (or by manually running the script). Everything else is captured the same day.

## Cost rate table

The script ships with current published OpenAI rates (USD per 1M tokens):

| Model family | Input | Cached input | Output |
|---|---|---|---|
| `gpt-5`, `o3`, `o1`, `o4` | $15 | $7.50 | $60 |
| `gpt-5-mini`, `gpt-4.1-mini`, `o3-mini`, `o4-mini` | $1.10 (mini) / $0.30 (gpt-5-mini) | 50% | $4.40 / $2.40 |
| `gpt-4o` | $2.50 | $1.25 | $10 |
| `gpt-4o-mini`, `gpt-4.1-nano` | $0.15 / $0.10 | $0.075 / $0.05 | $0.60 / $0.40 |
| `codex-mini` | $1.50 | $0.75 | $6 |

Unknown models report tokens but $0 for cost. Update the table in `hooks/session-track.mjs` if rates change.

## Usage in a Codex session

In your Codex session, mention the worktale skill (or activate it by argument). Codex will:

```bash
# After each commit
worktale note "Fixed race condition in job queue — claim query wasn't using SELECT FOR UPDATE"
```

That's it. At session end, the hook runs the equivalent of:

```bash
worktale session add \
  --provider openai \
  --tool codex \
  --model gpt-5 \
  --input-tokens 13000 \
  --output-tokens 2300 \
  --cost 0.2955 \
  --duration 300
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
