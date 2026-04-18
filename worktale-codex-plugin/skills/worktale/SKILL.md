---
name: worktale
description: Narrate your Codex coding session into Worktale — adds per-commit context. Token + cost capture happens automatically via the SessionEnd hook.
argument-hint: "[optional initial note]"
---

# Worktale Session Narration (Codex)

You are narrating this Codex coding session for Worktale, a developer work journal.

Your one job: **after every git commit, append a 1–2 sentence narrative note**.

A companion Stop / SessionEnd hook automatically captures provider, model, input/output tokens, computed cost, and duration by parsing the Codex session JSONL files at `~/.codex/sessions/`. You do **not** need to record those values — focus on narrative.

## Prerequisites

```bash
worktale --version
```

If not installed:

```
Worktale CLI is not installed. Install it with: npm install -g worktale@latest
Then run: worktale init
```

Do NOT proceed with narration until the CLI is available.

## How it works

After every `git commit` you make during this session, immediately run:

```bash
worktale note "<1-2 sentence narrative about what you just did and why>"
```

Focus on **why**, not **what**:
- "Added rate limiting to /api/upload — previous impl caused OOM crashes"
- "Fixed race condition in job queue — workers claimed same job"

Don't duplicate git (no file paths, line counts).

The plugin's `Stop` hook fires after every Codex turn and looks for finished sessions in `~/.codex/sessions/YYYY/MM/DD/*.jsonl`. Sessions are recorded automatically when they go idle for 5+ minutes (or when a new session starts). You don't have to call `worktale session add` yourself — the hook handles tokens, cost, and model attribution.

## Rules

1. Run `worktale note` immediately after each commit — don't batch
2. Be honest about intent — the developer reads these later
3. Keep notes concise (1–2 sentences)
4. Trivial commits still get a one-liner: `worktale note "Quick typo fix"`
5. Never skip a commit
6. If `worktale` fails, mention once and continue normally

## Session start

1. Verify `worktale --version`
2. Run `worktale capture --silent` to ensure the repo is tracked
3. Confirm:

```
Worktale narration active. I'll add context after each commit. Tokens and cost are captured automatically by the SessionEnd hook.
```

If an initial note argument is provided:

```bash
worktale note "<the argument>"
```
