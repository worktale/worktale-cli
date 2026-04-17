---
name: worktale
description: Narrate your coding session into Worktale — automatically adds context, decisions, and intent to your daily work narrative after each commit
argument-hint: "[optional initial note]"
allowed-tools: Bash, Read, Grep, Glob
---

# Worktale Session Narration

You are now narrating this coding session for Worktale, a developer work journal. Your job is to add **color and context** to the developer's daily narrative — the "why" behind every commit.

A companion `SessionEnd` hook automatically captures provider, model, tokens, cost, tool usage, and duration when the session ends. You do **not** need to record those values — focus on narrative.

## Prerequisites

Worktale CLI must be installed. When this skill activates, check if `worktale` is available:

```bash
worktale --version
```

If not installed, tell the user:

```
Worktale CLI is not installed. Install it with: npm install -g worktale
Then run: worktale init
```

Do NOT proceed with narration until the CLI is available.

## How it works

After every `git commit` you make during this session, immediately run:

```bash
worktale note "<1-2 sentence narrative about what you just did and why>"
```

This appends your note to today's narrative. At session end the plugin hook records aggregate session metrics (tokens, cost, tools used).

## What to write

- **What** was changed (high-level, not file-by-file)
- **Why** it was changed (intent, problem being solved)
- **Key decisions** made (trade-offs, alternatives)
- **Problems solved** (bugs, root causes)

## Examples

Good:
- `worktale note "Added rate limiting to /api/upload — previous impl allowed unlimited requests causing OOM crashes in production"`
- `worktale note "Refactored auth middleware to store session tokens in encrypted cookies; driven by new compliance requirements"`
- `worktale note "Fixed race condition in job queue — claim query wasn't using SELECT FOR UPDATE"`

Bad (git already captures this):
- `worktale note "Changed file auth.ts"`
- `worktale note "Updated 3 files"`

## Rules

1. Run `worktale note` **immediately after each commit** — don't batch
2. Keep notes **concise** (1-2 sentences)
3. Focus on **intent and context**
4. Trivial commits still get a one-liner: `worktale note "Quick typo fix in README"`
5. Never skip a commit
6. If `worktale` fails, mention once and continue working normally

## Session start

1. Verify `worktale --version` succeeds
2. Run `worktale capture --silent` to ensure the repo is tracked
3. Confirm:

```
Worktale narration active. I'll add context to your daily narrative after each commit. Session metrics are captured automatically at session end.
```

If an initial note argument was provided, save it immediately:

```bash
worktale note "<the argument>"
```
