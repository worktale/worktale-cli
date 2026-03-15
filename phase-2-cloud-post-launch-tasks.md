# Phase 2: Cloud — Post-Launch Marketing Site Updates

Tasks to complete when Worktale Cloud ships. The marketing site currently uses "coming soon" / "Phase 2" / future-tense language for cloud features. Once cloud is live, these need to flip to present tense with real documentation and CTAs.

---

## Must fix at launch

### 1. Remove "Phase 2" labels from docs.html

**File:** `marketing/docs.html`

- **Line ~769:** `cloudEnabled` config key labeled "(Phase 2)" — remove or rename
- **Line ~773:** `cloudToken` config key labeled "(Phase 2)" — remove or rename
- **Line ~838:** "unless you explicitly opt in to Cloud (Phase 2)" — drop the phase reference

### 2. Replace "Coming soon" on `worktale publish` command

**File:** `marketing/docs.html` (line ~492)

The publish command has a `Coming soon` badge and placeholder description. Replace with real usage documentation, flags, and examples.

### 3. Convert early-access email form to real signup

**File:** `marketing/index.html` (line ~1934)

"Get early access when Cloud launches" + noundry.com email capture form needs to become a real sign-up / login CTA pointing to the cloud product.

---

## Update at launch (lower priority)

### 4. Flip future tense on lander.html

**File:** `marketing/lander.html` (line ~392)

> "Worktale Cloud **will** turn it into a shareable portfolio."

Change to present tense once live.

### 5. Update pricing tag on alternatives page

**File:** `marketing/worktale-alternatives.html`

Worktale is currently tagged `free`. Once cloud is a paid product, consider updating to `freemium` to match how competitors (WakaTime, RescueTime) are labeled.

### 6. Update legal pages

**Files:** `marketing/privacy.html`, `marketing/terms.html`

Both say cloud "is planned for a future release" and "will require account creation and consent." Update to reflect cloud is now live, link to cloud-specific terms if applicable.

---

## No changes needed

These areas are already well-positioned and consistent:

- **CLI free forever / cloud paid** — messaging is identical across index, docs, blog, FAQ, and comparison pages
- **Opt-in, metadata-only sync** — correctly qualified everywhere
- **Cloud feature list** (profiles, cross-repo timelines, weekly digests, standup generator) — consistent across all pages
- **Blog posts** — use soft "is coming" / "we're building" language that ages fine
