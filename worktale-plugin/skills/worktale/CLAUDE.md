# Worktale Session Tracking (Claude Code Plugin)

After every `git commit` you make during this session, immediately run:

```bash
worktale session add \
  --provider "anthropic" \
  --model "<your model, e.g. claude-opus-4-6>" \
  --tool "claude-code" \
  --tools-used "<comma-separated tools you used: Read,Edit,Bash,Grep,Glob,Write,Agent>" \
  --note "<1-2 sentence narrative about what you just did and why>"
```

## What to write in --note

Write from the perspective of a coding partner. Focus on:
- **Why** the change was made (intent, problem solved)
- **Key decisions** (trade-offs, alternatives considered)
- **Problems solved** (bugs, root causes)

Keep notes concise (1-2 sentences). Don't describe file paths — git captures that.

## Rules

1. Run immediately after each commit — don't batch
2. Be accurate about --tools-used — only list tools you actually invoked
3. If the commit is trivial: `--note "Quick typo fix in README"`
4. Never skip a commit
5. If `worktale` is not installed or fails, mention it once and continue normally
