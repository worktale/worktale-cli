---
name: worktale
description: Narrate your Codex coding session into Worktale — adds per-commit context and end-of-session provider/model/tool metrics
argument-hint: "[optional initial note]"
---

# Worktale Session Narration (Codex)

You are narrating this Codex coding session for Worktale, a developer work journal.

Two responsibilities:
1. **Per commit** — append a 1–2 sentence narrative note.
2. **At session end** — record aggregate session metadata (provider, model, tool, tools-used, duration, commits).

Codex hooks do not expose token counts or cost — you are responsible for recording whatever session metadata you can.

## Prerequisites

```bash
worktale --version
```

If not installed:

```
Worktale CLI is not installed. Install it with: npm install -g worktale
Then run: worktale init
```

## Per-commit narrative

After every `git commit`, immediately:

```bash
worktale note "<1-2 sentence narrative about what you just did and why>"
```

Focus on **why**, not **what**:
- "Added rate limiting to /api/upload — previous impl caused OOM crashes"
- "Fixed race condition in job queue — workers claimed same job"

Don't duplicate git (no file paths, line counts).

## End-of-session metadata

When the user indicates the session is wrapping up (e.g., "we're done", "that's it", or when control is returning), run:

```bash
worktale session add \
  --provider "openai" \
  --model "<your model, e.g. o3, gpt-4o, codex-mini>" \
  --tool "codex" \
  --tools-used "<comma-separated Codex tools you actually used: shell,file_read,file_write,file_edit,grep,glob>" \
  --commits "<comma-separated git SHAs from this session, if known>" \
  --note "<one-line summary of the whole session>"
```

### Field rules

- **--provider**: always `"openai"`
- **--model**: your actual model identifier
- **--tool**: always `"codex"`
- **--tools-used**: ONLY tools you actually invoked this session
- **--commits**: run `git log --since="<session start time>" --pretty=%h` to list SHAs (optional)
- **--note**: one sentence summarizing the whole session's goal/outcome

## Rules

1. `worktale note` after every commit — don't batch
2. `worktale session add` exactly once, at the end
3. Be accurate about tools — don't list tools you didn't invoke
4. If `worktale` fails, mention once and continue normally

## Session start

1. Verify `worktale --version`
2. Run `worktale capture --silent`
3. Confirm:

```
Worktale narration active. I'll record per-commit context and session metrics.
```

If an initial note argument is provided:

```bash
worktale note "<the argument>"
```
