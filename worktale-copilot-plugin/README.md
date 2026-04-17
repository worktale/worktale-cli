# Worktale Plugin for GitHub Copilot CLI

**AI session tracking for your daily work journal.**

When active, Copilot:

1. After every commit, appends a 1–2 sentence narrative note to your daily [Worktale](https://worktale.org) journal.
2. At session wrap-up, records session metadata — **provider, model, tool, tools used, commits** — to your local Worktale DB.

Copilot's plugin hook payload does not expose token counts or cost, so those fields are left blank.

## Install

Install the plugin per the [Copilot CLI plugin install flow](https://docs.github.com/en/copilot/how-tos/copilot-cli/customize-copilot/plugins-creating), or drop the agent file into your project:

```bash
mkdir -p .github/copilot
cp worktale-copilot-plugin/agents/worktale.md .github/copilot/
```

Requires the [Worktale CLI](https://www.npmjs.com/package/worktale) **v1.4.0+**:

```bash
npm install -g worktale@latest
cd your-repo
worktale init
```

## Usage

In your Copilot session, mention `@worktale` or invoke the agent. Copilot will:

```bash
# After each commit
worktale note "Fixed race condition in job queue — claim query wasn't using SELECT FOR UPDATE"

# At session end
worktale session add \
  --provider github \
  --tool copilot \
  --model gpt-5 \
  --tools-used shell,read,write,edit,search \
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
