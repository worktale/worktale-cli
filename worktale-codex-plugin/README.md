# Worktale Plugin for OpenAI Codex

**AI session tracking for your daily work journal.**

When active, Codex:

1. After every commit, appends a 1–2 sentence narrative note to your daily [Worktale](https://worktale.org) journal.
2. At session wrap-up, records session metadata — **provider, model, tool, tools used, duration, commits** — to your local Worktale DB.

Codex does not expose token counts to plugins, so cost and token totals are not captured. Everything else is.

## Install

Copy the plugin into your Codex skills directory:

```bash
mkdir -p ~/.codex/skills/worktale
cp -r worktale-codex-plugin/skills/worktale/* ~/.codex/skills/worktale/
```

Requires the [Worktale CLI](https://www.npmjs.com/package/worktale) **v1.4.0+**:

```bash
npm install -g worktale@latest
cd your-repo
worktale init
```

## Usage

In your Codex session, activate the skill (or invoke it by name). Codex will:

```bash
# After each commit
worktale note "Fixed race condition in job queue — claim query wasn't using SELECT FOR UPDATE"

# At session end
worktale session add \
  --provider openai \
  --tool codex \
  --model o3 \
  --tools-used shell,file_read,file_write,grep \
  --commits abc1234,def5678 \
  --note "Paid down auth debt and shipped the new rate limiter"
```

## View your data

```bash
worktale today
worktale session list
worktale session stats
worktale dash
```

## License

MIT
