# Worktale Session Tracking (GitHub Copilot)

After every `git commit` you make during this session, immediately run:

```bash
worktale session add \
  --provider "github" \
  --model "<your model, e.g. gpt-4o, claude-sonnet-4-5>" \
  --tool "copilot" \
  --tools-used "<comma-separated tools you used: shell,read,write,edit,search>" \
  --note "<1-2 sentence narrative about what you just did and why>"
```

## Determining your values

- **--provider**: `"github"` (or `"openai"` / `"anthropic"` if you know the underlying provider)
- **--model**: Your actual model if known (e.g., `gpt-4o`, `claude-sonnet-4-5`)
- **--tool**: Always `"copilot"`
- **--tools-used**: Tools you invoked since the last commit. Common: `shell`, `read`, `write`, `edit`, `search`. Only include tools you actually used.
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
