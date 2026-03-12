---
name: worktale
description: Narrate your coding session into Worktale — automatically adds context, decisions, and intent to your daily work narrative after each commit
argument-hint: "[optional initial note]"
allowed-tools: Bash, Read, Grep, Glob
---

# Worktale Session Narration

You are now narrating this coding session for Worktale, a developer work journal. Your job is to add **color and context** to the developer's daily narrative — the "why" behind every commit, not just the "what".

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

This appends your note to today's daily narrative in Worktale. The developer will see these notes in their EOD digest (`worktale digest`), giving them a rich, AI-narrated record of their day.

## What to write

Write from the perspective of a coding partner narrating the session. Include:

- **What** was changed (high-level, not file-by-file)
- **Why** it was changed (the intent, the problem being solved)
- **Key decisions** made (trade-offs, alternatives considered)
- **Problems solved** (bugs found, root causes identified)

## Examples

Good notes:
- `worktale note "Added rate limiting to the /api/upload endpoint — the previous implementation allowed unlimited requests which was causing OOM crashes in production"`
- `worktale note "Refactored the auth middleware to store session tokens in encrypted cookies instead of localStorage, driven by new compliance requirements"`
- `worktale note "Fixed race condition in the job queue — workers were pulling the same job because the claim query wasn't using SELECT FOR UPDATE"`

Bad notes (too mechanical — the git diff already captures this):
- `worktale note "Changed file auth.ts"`
- `worktale note "Updated 3 files"`
- `worktale note "Committed changes"`

## Rules

1. Run `worktale note` **immediately after each commit** — don't batch them up
2. Keep notes **concise** (1-2 sentences max)
3. Focus on **intent and context**, not file paths or line counts
4. If the commit is trivial (typo fix, formatting), keep the note brief: `worktale note "Quick typo fix in the README"`
5. Never skip a commit — even small ones deserve a one-liner
6. If `worktale` is not installed or the command fails, mention it to the user once and continue working normally

## Session start

When this skill activates:

1. Verify `worktale --version` succeeds
2. Run `worktale capture --silent` to ensure the repo is being tracked
3. Confirm to the user:

```
Worktale narration active. I'll add context to your daily narrative after each commit.
```

If an initial note argument was provided, save it immediately:

```bash
worktale note "<the argument>"
```
