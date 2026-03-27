# Briefly — Chrome Extension

An AI-powered job application assistant with resume generation, cover letters, Q&A chat, and Google Sheets tracking.

---

## Installation

1. **Download / clone** this folder to your computer
2. Open Chrome → `chrome://extensions/`
3. Enable **Developer Mode** (top-right toggle)
4. Click **"Load unpacked"** → select this folder
5. The extension icon (⬡) will appear in your toolbar

---

## First-Time Setup (Settings Tab)

| Field | What to enter |
|---|---|
| **OpenRouter API Key** | From [openrouter.ai/keys](https://openrouter.ai/keys) — used for Claude (resume & cover letter) |
| **OpenRouter Model** | Default: `anthropic/claude-3.5-sonnet` — or any model on OpenRouter |
| **Gemini API Key** | From [aistudio.google.com](https://aistudio.google.com) → Get API key |
| **Google Script URL** | From your deployed Apps Script (see below) |
| **Resume LaTeX Template** | Paste your full `.tex` resume template |
| **Cover Letter LaTeX Template** | Paste your full `.tex` cover letter template |

---

## Google Sheets Integration

1. Open a new Google Sheet
2. Go to **Extensions → Apps Script**
3. Paste the contents of `google_apps_script.js` and save
4. Click **Deploy → New deployment**
   - Type: **Web App**
   - Execute as: **Me**
   - Who has access: **Anyone**
5. Click Deploy, authorize, and **copy the Web App URL**
6. Paste into Briefly → Settings → Google Script Web App URL

The sheet will auto-create a tab called "Applications" with color-coded status rows.

---

## How to Use

### Scanning a Job Description
1. Navigate to any job posting (LinkedIn, Seek, Indeed, company website, etc.)
2. Open the side panel (click the ⬡ icon)
3. Click **↻ Re-scan** — the JD text is extracted and stored
4. The green dot + title confirms the JD is loaded
5. The JD **persists** as you navigate within the same domain

### Generating Documents
- **⬡ Generate Resume** — tailored LaTeX using your profile + JD
- **✉ Cover Letter** — prose-heavy LaTeX cover letter, longer than resume
- All output has a **⧉ Copy** button for one-click copying

### Refining Experience
- Click **↻ Tailor to JD** in the Refine Experience panel
- Each work entry is rewritten with JD keywords in its own block
- Each block has its own Copy button

### Quick Q&A (Gemini)
- Type any question about the role, company, or your application
- Responses are **2-3 sentences max** by default
- Toggle **Detailed** for longer explanations
- Chat history is maintained within the session

### Logging Applications
1. Fill in Company, Role, and Status
2. Click **✓ Log Application**
3. Data is sent to your Google Sheet via POST

---

## Profile Data Schema

The profile is stored in `chrome.storage.local` and structured for extensibility:

```json
{
  "personal": { "name": "", "email": "", ... },
  "modules": {
    "education":      [ { "institution": "", "degree": "", "bullets": [] } ],
    "workExperience": [ { "company": "", "title": "", "bullets": [] } ],
    "projects":       [ { "name": "", "tech": "", "bullets": [] } ],
    "achievements":   [ { "title": "", "date": "", "description": "" } ],
    "courses":        [ { "name": "", "provider": "", "date": "" } ]
  }
}
```

**Adding new modules** (e.g. Certifications): add an entry to `MODULE_CONFIG` in `sidepanel.js` — no other code changes needed.

---

## File Structure

```
job-assistant-extension/
├── manifest.json          # MV3 manifest
├── background.js          # Service worker: API calls, JD storage, routing
├── content.js             # Injected into pages for text extraction
├── sidepanel.html         # Side panel UI
├── sidepanel.css          # Styles
├── sidepanel.js           # Side panel logic
├── google_apps_script.js  # Paste into Google Apps Script
├── icons/
│   ├── icon16.png
│   ├── icon32.png
│   ├── icon48.png
│   └── icon128.png
└── README.md
```

---

## LaTeX Tips

- Paste your full working `.tex` template in Settings
- Include placeholder comments like `% CANDIDATE NAME HERE` so the AI knows where to insert data
- For best 1-page results, keep your template tight (narrow margins, 10pt font)
- Compile generated LaTeX at [overleaf.com](https://overleaf.com) or locally with `pdflatex`

---

## Troubleshooting

| Problem | Fix |
|---|---|
| "No JD loaded" persists | Some SPAs need a manual Re-scan after the page fully loads |
| API error 401 | Check your API key in Settings |
| Sheets POST fails | Ensure the Web App is deployed as "Anyone" can access |
| LaTeX won't compile | Paste into Overleaf to see errors; ask the Q&A to fix them |
