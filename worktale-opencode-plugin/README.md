# Worktale Plugin for OpenCode

Records per-session tokens, cost, model, provider, tool usage, and duration from [OpenCode](https://opencode.ai) into your local [Worktale](https://worktale.org) journal.

## What it captures

OpenCode pre-computes cost on every assistant message. This plugin listens for `message.updated` events and `tool.execute.after` events, aggregates them per session, and shells out to `worktale session add` after 60 seconds of session inactivity.

| Field | Source | Automated? |
|---|---|---|
| Provider | `message.providerID` | ✅ |
| Model | `message.modelID` | ✅ |
| Input tokens (incl. cache) | `message.tokens.input + cache.read + cache.write` | ✅ |
| Output tokens (incl. reasoning) | `message.tokens.output + tokens.reasoning` | ✅ |
| Cost (USD) | `message.cost` (pre-computed by OpenCode) | ✅ |
| Tools used | `tool.execute.after` events | ✅ |
| Duration | First-to-last touch within session | ✅ |

Cost is **read directly** from OpenCode — no rate table guesswork.

## Install

### 1. Install the Worktale CLI

```bash
npm install -g worktale@latest    # requires v1.4.0+
cd your-repo
worktale init
```

### 2. Drop the plugin into your project

```bash
mkdir -p .opencode/plugins
curl -o .opencode/plugins/worktale.ts \
  https://raw.githubusercontent.com/worktale/worktale-cli/main/worktale-opencode-plugin/src/index.ts
```

### 3. Reference it in `.opencode/opencode.jsonc`

```jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": [
    "./.opencode/plugins/worktale.ts"
  ]
}
```

That's it. Next time you run OpenCode in this project, the plugin loads automatically. Sessions get recorded ~60s after they go idle.

### Global install (all projects)

```bash
mkdir -p ~/.config/opencode/plugins
curl -o ~/.config/opencode/plugins/worktale.ts \
  https://raw.githubusercontent.com/worktale/worktale-cli/main/worktale-opencode-plugin/src/index.ts
```

Then add to `~/.config/opencode/opencode.jsonc`:

```jsonc
{
  "plugin": [
    "~/.config/opencode/plugins/worktale.ts"
  ]
}
```

## How aggregation works

1. Each assistant `message.updated` event carries the message's full snapshot — the plugin replaces any previous state for that `messageID` (handles streaming updates correctly without double-counting).
2. Each `tool.execute.after` event adds the tool name to the session's tool set.
3. Both kinds of event reset a 60-second debounce timer for that session.
4. When the timer fires (no new events for 60s), the plugin sums tokens + cost across all messages in the session and runs:

```bash
worktale session add \
  --provider <providerID> \
  --tool opencode \
  --model <modelID> \
  --input-tokens <input + cache.read + cache.write> \
  --output-tokens <output + reasoning> \
  --cost <pre-computed by OpenCode> \
  --duration <session-seconds> \
  --tools-used <comma-separated>
```

Sessions with fewer than 100 total tokens are skipped.

## View your data

```bash
worktale today                    # today's commits + AI sessions
worktale session list             # recent sessions
worktale session stats --days 30  # cost & token rollup
worktale dash                     # interactive TUI
```

## Trade-offs

- **Multiple records per session:** if a single OpenCode session has natural pauses longer than 60s between bursts of activity, each burst becomes a separate Worktale record. The cumulative cost is the same; just split across rows. Use `worktale session stats` to roll up.
- **Active-on-shutdown loss:** if you close OpenCode mid-debounce (within 60s of the last assistant message), that session's record never gets written. Adjust `FLUSH_DELAY_MS` in the plugin if this matters.
- **Per-project state:** OpenCode loads the plugin per-project, so state isn't shared across concurrent projects. Each project's sessions are tracked independently.

## Dry-run mode

Set `WORKTALE_PLUGIN_DRY_RUN=1` in the OpenCode environment. Instead of calling `worktale`, the plugin logs what it *would* have recorded. Useful for verifying the wiring without polluting your journal.

## License

MIT
