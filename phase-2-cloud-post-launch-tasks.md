# Phase 2: Cloud — Post-Launch Marketing Site Updates

**Cloud is live as of 2026-03-30.** API at `api.worktale.dev`, dashboard at `worktale.dev`, profiles at `worktale.dev/{username}`.

All marketing site updates completed on 2026-03-30.

---

## Completed

### 1. ~~Remove "Phase 2" labels from docs.html~~ DONE

- `cloudEnabled` / `cloudToken` config descriptions updated to link to worktale.dev
- "Phase 2" references removed from data storage section
- `worktale publish` command updated from "Coming soon" placeholder to real Beta description

### 2. ~~Convert early-access email form to real CTA~~ DONE

Replaced noundry.com email capture form with direct "Try Worktale Cloud" button linking to worktale.dev.

### 3. ~~Flip future tense on lander.html~~ DONE

Updated lander.html and lander-proof.html — "will turn" changed to "turns".

### 4. ~~Update legal pages~~ DONE

privacy.html and terms.html section 7 updated from "Future" to "Beta" with real descriptions.

### 5. ~~Update blog posts~~ DONE

- v1-launch blog: "Cloud is coming" → "Cloud is here"
- v1-1-ai-agents blog: "(eventually)" → active, "We're building" → "is now live in beta"

### 6. ~~Update LLM docs~~ DONE

- llm.txt: "Coming Soon" → "Beta", publish command description updated
- llms.txt: Updated to mention optional cloud sync

### 7. ~~Update nav/footer~~ DONE

Header and footer cloud links now point to worktale.dev.

### 8. ~~New blog post~~ DONE

Created `blog/worktale-cloud-beta.html` — full announcement post. Registered in vite.config.js, blog.html, and sitemap.xml.

### 9. ~~FAQ schema~~ DONE

Updated JSON-LD FAQ answer from "will be a paid product when it launches" to "now available in beta".

---

## Still pending

### Pricing tag on alternatives page

**File:** `marketing/worktale-alternatives.html`

Worktale is currently tagged `free`. Once cloud becomes a paid product post-beta, update to `freemium`.
