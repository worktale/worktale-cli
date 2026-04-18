# Worktale Session Narration

After every `git commit` you make during this session, immediately run this command:

```bash
worktale session add \
  --tool windsurf \
  --note "<1-2 sentence narrative about what you just did and why>" \
  --write-note
```

`--write-note` records the session metrics **and** appends the narrative to today's daily log in one command (Worktale CLI v1.5.0+ required). The developer will see the narrative in their EOD digest automatically — no separate `worktale note` call needed.

## What to write

Write from the perspective of a coding partner narrating the session. Focus on:
- **Why** the change was made (the intent, the problem being solved)
- **Key decisions** (trade-offs, alternatives considered)
- **Problems solved** (bugs found, root causes identified)

Keep notes concise (1-2 sentences). Do NOT describe file paths or line counts — the git diff already captures that.

## Examples

Good: `worktale note "Added rate limiting to /api/upload — previous impl allowed unlimited requests causing OOM crashes"`
Good: `worktale note "Fixed race condition in job queue — workers claimed same job due to missing SELECT FOR UPDATE"`
Bad: `worktale note "Changed auth.ts"` (too mechanical)

## Rules

1. Run `worktale note` immediately after each commit — don't batch them
2. If the commit is trivial, keep the note brief: `worktale note "Quick typo fix in README"`
3. Never skip a commit — even small ones deserve a one-liner
4. If `worktale` is not installed or fails, mention it once and continue normally
