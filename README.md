# Briefly v2.1.1 — 100% OpenRouter Architecture

## Overview

Version 2.1.1 removes the Google Gemini API entirely. Every AI task — parsing, analysis, chat, and LaTeX generation — now routes exclusively through **OpenRouter**. This gives you a single API key, a unified billing dashboard, and the freedom to swap any underlying model at any time without touching code.

---

## What Changed in v2.1.1

| Area | Change |
|---|---|
| `manifest.json` | Version bumped to `2.1.1` |
| `background.js` | `callGemini` deleted; `GEMINI_BASE` / `GEMINI_MODEL` constants removed; single `callOpenRouter()` function handles all tasks; `handleGeminiChat` renamed `handleChat`; message type `ASK_GEMINI` → `ASK_AI` |
| `sidepanel.html` | Gemini API Key input removed; single model input replaced with two (Text Tasks / LaTeX Tasks) + live resolution preview; badges updated to "OpenRouter" |
| `sidepanel.css` | New styles: `.label-tag`, `.model-divider`, `.model-resolution-box`, `.input-mono` |
| `sidepanel.js` | `saveSettings` / `loadSettings` updated to `openRouterKey`, `textModel`, `latexModel`; all `geminiKey` references removed; chat sends `ASK_AI`; live model-preview logic added |

---

## Settings: Dual-Model Configuration

Open the **Settings** tab. You will find:

```
┌─────────────────────────────────────────┐
│  API Key                                │
│  OpenRouter API Key   [sk-or-…        ] │
├─────────────────────────────────────────┤
│  Model Configuration                    │
│                                         │
│  Text Tasks Model                       │
│  (Parsing · JD Analysis · Chat)         │
│  [anthropic/claude-3.5-sonnet         ] │
│                                         │
│  ─────── or separate LaTeX model ────── │
│                                         │
│  LaTeX Tasks Model                      │
│  (Resume · Cover Letter)                │
│  [anthropic/claude-3.5-sonnet         ] │
│                                         │
│  ┌─ Live Preview ──────────────────────┐│
│  │ ● Text tasks will use:  <model>    ││
│  │ ● LaTeX tasks will use: <model>    ││
│  └────────────────────────────────────┘│
└─────────────────────────────────────────┘
```

The **Live Preview** box updates in real time as you type, showing exactly which model will be used for each task type based on the fallback rules below.

---

## Model Fallback Logic

The fallback rules are identical in both `background.js` (actual execution) and `sidepanel.js` (preview display), keeping them always in sync.

```
resolveModel(taskType, { textModel, latexModel })
```

| Text Model | LaTeX Model | Text tasks use     | LaTeX tasks use    |
|------------|-------------|--------------------|--------------------|
| filled     | filled      | textModel          | latexModel         |
| filled     | **empty**   | textModel          | **textModel**      |
| **empty**  | filled      | **latexModel**     | latexModel         |
| **empty**  | **empty**   | default (Sonnet)   | default (Sonnet)   |

**TL;DR — one model for everything:** Fill only the Text Tasks field. The fallback rule will automatically use it for LaTeX generation too. Leave both empty and the hardcoded defaults (`anthropic/claude-3.5-sonnet`) are used for all tasks.

**Recommended split:** If you want to save cost on bulk JSON tasks while using a more capable model for document generation:
- Text Tasks: `google/gemini-flash-1.5` (fast, cheap, good at structured output)
- LaTeX Tasks: `anthropic/claude-3.5-sonnet` (better at following format constraints)

---

## JSON Safety Net

Since OpenRouter does not guarantee JSON-only output (unlike Gemini's `responseMimeType` flag), both `handleParseResume` and `handleExtractJDMeta` strip markdown fences before parsing:

```js
const cleanJson = raw.replace(/```json\n?|```/g, '').trim();
const result    = JSON.parse(cleanJson);
```

This handles cases where a model wraps its JSON response in a code block.

---

## Architecture: All Requests

```
sidepanel.js  ──message──▶  background.js
                                │
                                ├─ resolveModel('text',  settings)
                                │       ↓
                                │  PARSE_RESUME     ─▶ OpenRouter
                                │  EXTRACT_JD_META  ─▶ OpenRouter
                                │  ASK_AI           ─▶ OpenRouter
                                │
                                └─ resolveModel('latex', settings)
                                        ↓
                                   GENERATE_RESUME  ─▶ OpenRouter
                                   GENERATE_COVER   ─▶ OpenRouter
```

---

## Files Changed in This Update

Replace these files in your extension folder. All other files (`prompts.js`, `content.js`, `sidepanel.css` structure, `icons/`) carry over from v3/v2 unchanged, except `sidepanel.css` which has new model-config styles merged in.

```
extension/
├── manifest.json      ← version 2.1.1
├── background.js      ← OpenRouter-only; resolveModel(); no Gemini
├── sidepanel.html     ← dual model inputs; no Gemini key field
├── sidepanel.css      ← new model config styles
├── sidepanel.js       ← textModel/latexModel settings; ASK_AI; live preview
└── README.md          ← this file
```

The Docker compiler service and Google Apps Script are **unchanged**.

---

## OpenRouter Model IDs

Any model available on OpenRouter works. Some useful options:

| Use case | Model ID |
|---|---|
| Default (balanced) | `anthropic/claude-3.5-sonnet` |
| Fast / cheap text | `google/gemini-flash-1.5` |
| DeepSeek (cost-effective) | `deepseek/deepseek-chat` |
| Powerful LaTeX | `anthropic/claude-opus-4-5` |
| Local-style privacy | `meta-llama/llama-3.1-70b-instruct` |

Browse the full list at [openrouter.ai/models](https://openrouter.ai/models).
