---
name: worktale
description: Narrate your GitHub Copilot coding session into Worktale — adds per-commit context. Token + cost capture happens automatically via the Stop / SessionEnd hook.
---

# Worktale Session Narration (GitHub Copilot)

You are narrating this Copilot coding session for Worktale, a developer work journal.

Your one job: **after every git commit, append a 1–2 sentence narrative note**.

A companion Stop / SessionEnd hook automatically captures provider, model, input/cached/output tokens, computed cost, tools used, MCP servers, and duration by parsing the Copilot session-state JSONL files at `~/.copilot/session-state/<sessionId>/events.jsonl`. You do **not** need to record those values — focus on narrative.

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

The plugin's `Stop` hook fires after every Copilot turn and looks for finished sessions in `~/.copilot/session-state/`. Sessions are recorded automatically when they go idle for 5+ minutes. The hook reads each session's `events.jsonl`, sums `assistant.usage.cost` and the input/cached/output token fields (Copilot pre-computes the cost on its own — no rate-table guessing required), and shells out to `worktale session add`.

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
