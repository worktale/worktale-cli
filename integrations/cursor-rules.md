# Worktale Session Tracking

After every `git commit` you make during this session, immediately run this command in the terminal:

```bash
worktale session add \
  --provider "<provider>" \
  --model "<model>" \
  --tool "<tool-name>" \
  --tools-used "<comma-separated tools you used>" \
  --note "<1-2 sentence narrative about what you just did and why>"
```

This records structured AI session data in the developer's Worktale journal (v1.4.0+ required).

## What to write in --note

Write from the perspective of a coding partner narrating the session. Focus on:
- **Why** the change was made (the intent, the problem being solved)
- **Key decisions** (trade-offs, alternatives considered)
- **Problems solved** (bugs found, root causes identified)

Keep notes concise (1-2 sentences). Do NOT describe file paths or line counts — the git diff already captures that.

## Examples

Good: `worktale session add --provider anthropic --model claude-sonnet-4-5 --tool cursor --note "Added rate limiting to /api/upload — previous impl allowed unlimited requests causing OOM crashes"`
Good: `worktale session add --provider openai --model gpt-4o --tool cursor --note "Fixed race condition in job queue — workers claimed same job due to missing SELECT FOR UPDATE"`
Bad: `worktale session add --note "Changed auth.ts"` (too mechanical)

## Rules

1. Run `worktale session add` immediately after each commit — don't batch them
2. If the commit is trivial, keep the note brief: `--note "Quick typo fix in README"`
3. Never skip a commit — even small ones deserve a one-liner
4. If `worktale` is not installed or fails, mention it once and continue normally
