# Worktale Session Tracking (Codex)

After every `git commit` you make during this session, immediately run:

```bash
worktale session add \
  --provider "openai" \
  --model "<your model, e.g. o3, gpt-4o, codex-mini>" \
  --tool "codex" \
  --tools-used "<comma-separated tools you used: shell,file_read,file_write,file_edit,grep>" \
  --note "<1-2 sentence narrative about what you just did and why>"
```

## Determining your values

- **--provider**: Always `"openai"` for Codex
- **--model**: Your actual model (e.g., `o3`, `gpt-4o`, `codex-mini`)
- **--tool**: Always `"codex"`
- **--tools-used**: Tools you invoked since the last commit. Codex tools: `shell`, `file_read`, `file_write`, `file_edit`, `grep`, `glob`. Only include tools you actually used.
- **--note**: 1-2 sentence narrative (see below)

## What to write in --note

Focus on **why**, not **what**:
- "Added rate limiting to /api/upload — previous impl caused OOM crashes"
- "Fixed race condition in job queue — workers claimed same job"

Don't: "Changed auth.ts" (too mechanical)

## Rules

1. Run immediately after each commit — don't batch
2. Be accurate about --tools-used
3. Trivial commits: `--note "Quick typo fix"`
4. Never skip a commit
5. If `worktale` fails, mention once and continue
