---
name: worktale
description: Narrate your coding session into Worktale — automatically tracks AI sessions with context, decisions, cost, and tool usage after each commit
argument-hint: "[optional initial note]"
allowed-tools: Bash, Read, Grep, Glob
---

# Worktale Session Tracking (Claude Code)

You are tracking this coding session for Worktale, a developer work journal. After every commit, you record **structured AI session data** — the model, tools used, and a narrative of what was built and why.

## Prerequisites

When this skill activates, verify the CLI is available:

```bash
worktale --version
```

If not installed: `npm install -g worktale` then `worktale init`.

## After Every Commit

Immediately after each `git commit`, run this command to record the AI session:

```bash
worktale session add \
  --provider "anthropic" \
  --model "<your current model name, e.g. claude-opus-4-6>" \
  --tool "claude-code" \
  --tools-used "<comma-separated list of tools you used: Read,Edit,Bash,Grep,Glob,Write,Agent,etc>" \
  --note "<1-2 sentence narrative about what you just did and why>"
```

### Determining your values

- **--provider**: Always `"anthropic"` for Claude Code
- **--model**: Use your actual model name (e.g., `claude-opus-4-6`, `claude-sonnet-4-6`)
- **--tool**: Always `"claude-code"`
- **--tools-used**: List the tools you actually used since the last commit. Common tools: `Read`, `Edit`, `Write`, `Bash`, `Grep`, `Glob`, `Agent`, `WebSearch`, `WebFetch`. Only include tools you actually invoked.
- **--note**: A 1-2 sentence narrative (see below)

### Optional fields (include when available)

- **--mcp-servers**: If you used MCP tools, list the server names (e.g., `"github,linear,slack"`)
- **--commits**: The SHA of the commit you just made (e.g., `"abc1234"`)
- **--duration**: Estimated seconds spent on this unit of work

## What to Write in --note

Write from the perspective of a coding partner narrating the session. Focus on:
- **Why** the change was made (the intent, the problem being solved)
- **Key decisions** (trade-offs, alternatives considered)
- **Problems solved** (bugs found, root causes identified)

Keep notes concise (1-2 sentences). Do NOT describe file paths or line counts — the git diff already captures that.

### Good notes
- `"Added rate limiting to /api/upload — previous impl allowed unlimited requests causing OOM crashes"`
- `"Fixed race condition in job queue — workers claimed same job due to missing SELECT FOR UPDATE"`
- `"Refactored auth middleware for compliance — session tokens now encrypted in cookies instead of localStorage"`

### Bad notes (too mechanical)
- `"Changed auth.ts"` — the git diff already shows this
- `"Updated 3 files"` — meaningless

## Rules

1. Run `worktale session add` **immediately after each commit** — don't batch them
2. Keep notes **concise** (1-2 sentences max)
3. Focus on **intent and context**, not file paths or line counts
4. If the commit is trivial, keep brief: `--note "Quick typo fix in README"`
5. Never skip a commit — even small ones deserve a one-liner
6. If `worktale` fails, mention it once and continue normally
7. Be accurate about **--tools-used** — only list tools you actually invoked

## Session Start

When this skill activates:

1. Verify `worktale --version` succeeds
2. Run `worktale capture --silent` to ensure the repo is being tracked
3. Confirm to the user:

```
Worktale session tracking active. I'll record AI session data after each commit.
```

If an initial note argument was provided, save it immediately:

```bash
worktale session add --provider "anthropic" --model "<model>" --tool "claude-code" --note "<the argument>"
```
