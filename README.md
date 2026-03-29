# Briefly V2.1 — Change Log & Reference

## What Changed in V2.1

### 1. `prompts.js` (new file)
All AI prompts are now centralised in a single ES module. Import them anywhere with:
```js
import { Prompts, GUARDRAILS } from './prompts.js';
```
Prompts covered: `extractJDMeta`, `parseResume`, `chat`, `generateResume`, `generateCoverLetter`.

### 2. `manifest.json`
- `"type": "module"` added to the `background` block so the service worker can use ES module `import` syntax.

### 3. `background.js`
- Imports `Prompts` from `./prompts.js` — all prompt strings removed from background.
- `callGemini` gains a `requireJson` parameter. When `true`, `generationConfig.responseMimeType` is set to `"application/json"`, activating Gemini's native JSON mode (no more manual JSON stripping).
- `handleExtractJDMeta` now accepts `msg.profile` and passes both `jd` and `profile` into `Prompts.extractJDMeta(jd, profile)`.
- `REFINE_EXPERIENCE` handler and all related logic **removed**.

### 4. Profile Tab — Skills Module
A dedicated **Skills** panel is now rendered inside the Profile tab with three tag-input groups:
- **Languages** — Python, TypeScript, Go, …
- **Frameworks & Libraries** — React, FastAPI, PyTorch, …
- **Tools & Platforms** — Docker, AWS, GitHub Actions, …

Tags are added by pressing **Enter** or clicking **+**, and removed by clicking **✕** on each tag. The skills are saved as `profile.modules.skills.{ languages, frameworks, tools }` — matching the `parseResume` schema in `prompts.js`.

When **Parse & Auto-fill Profile** is used, Gemini automatically populates all three skill groups.

### 5. Apply Tab — JD Analysis Panel
After **Re-scan**, a new **JD Analysis** panel appears (or updates) with:

| Section | Colour | Content |
|---|---|---|
| Exact Skill Matches | 🟢 Green pills | Skills in your profile that appear verbatim in the JD |
| Close Skill Matches | 🟡 Amber pills | Skills in your profile closely related to JD requirements |
| Tailored Role Summaries | 🔵 Blue cards | A 2–3 sentence description per work experience role, tailored to the JD |

The **Company** and **Role** tracker inputs are still auto-filled as before.

### 6. Tailored Bullets — Removed
The old "Refine Experience" / "Tailored Bullets" panel is gone. The `workExRoleDescriptions` from `extractJDMeta` replaces it with a richer, JD-aware narrative per role.

---

## File Structure (Extension Folder)

```
extension/
├── manifest.json       ← "type": "module" added to background
├── background.js       ← ES module; imports Prompts; no REFINE_EXPERIENCE
├── prompts.js          ← NEW: all AI prompt builders
├── content.js          ← unchanged
├── sidepanel.html      ← JD Analysis section; Skills in Profile; no Tailored Bullets
├── sidepanel.css       ← pill, role-card, skill-tag styles added
├── sidepanel.js        ← Skills module; JD analysis rendering; refine logic removed
└── icons/
```

---

## Gemini JSON Mode

`callGemini(..., requireJson = true)` sets:
```json
{ "responseMimeType": "application/json" }
```
This tells Gemini to return a guaranteed-valid JSON string — no markdown fences, no preamble. Used for `EXTRACT_JD_META` and `PARSE_RESUME`. The `chat` path keeps `requireJson = false`.

---

## Re-scan Flow (V2.1)

```
Click ↻ Re-scan
  │
  ├─ SCRAPE_JD        → background extracts page text, stores jd
  │
  └─ EXTRACT_JD_META  → Gemini (JSON mode) analyses jd + full profile
       │
       ├─ company, role          → auto-fill tracker inputs
       ├─ skillsExactMatch       → green pills
       ├─ skillsCloseMatch       → amber pills
       └─ workExRoleDescriptions → blue role summary cards
```

---

## Notes

- The background service worker is now an **ES Module**. This means you cannot use `importScripts()` inside it — use `import` statements at the top level only.
- Skills entered manually in the Profile tab are included in the profile sent to `extractJDMeta`, so the skill-matching analysis is always based on your complete, up-to-date profile.
- The Docker LaTeX compiler (`docker/`) and Google Apps Script (`sheets/code.gs`) are **unchanged** from V2.
