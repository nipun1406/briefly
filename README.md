# Briefly V2 — Upgrade Guide & Reference

## Project Structure

```
briefly-v2/
├── docker/
│   ├── server.js            LaTeX compiler microservice
│   ├── package.json
│   ├── Dockerfile
│   └── docker-compose.yml
│
├── extension/
│   ├── manifest.json        MV3 + "downloads" permission
│   ├── background.js        Service worker (all AI + API logic)
│   ├── content.js           Page text extractor
│   ├── sidepanel.html       UI — 4 tabs: Apply / Profile / Settings / Storage
│   ├── sidepanel.css
│   ├── sidepanel.js
│   └── icons/
│       ├── icon16.png
│       ├── icon32.png
│       ├── icon48.png
│       └── icon128.png
│
└── sheets/
    └── code.gs              Google Apps Script with dropdown validation
```

---

## Part 1 — Docker LaTeX Compiler

### Quick Start

```bash
cd docker/
docker compose up --build -d
```

The service starts at **http://localhost:3000**.

**Test it:**
```bash
# Health check
curl http://localhost:3000/health

# Compile a minimal document
curl -X POST http://localhost:3000/compile \
  -H "Content-Type: application/json" \
  -d '{"latex": "\\documentclass{article}\\begin{document}Hello\\end{document}", "filename": "test"}' \
  --output test.pdf
```

**Stop:**
```bash
docker compose down
```

### Behaviour Notes
- Each compile runs in an isolated `/tmp/briefly_<uuid>/` directory
- **30-second timeout** — returns `504` with the log tail if exceeded
- **Two pdflatex passes** — ensures correct cross-references and page layout
- Cleanup happens in `finally` — temp files are always deleted, even on error
- If pdflatex fails, a JSON body `{ error, log }` is returned (last 4 KB of `.log` file)

---

## Part 2 — Extension Installation

```bash
cd extension/
# Icons are already generated. Load unpacked in Chrome:
```

1. `chrome://extensions/` → Enable **Developer Mode**
2. **Load unpacked** → select the `extension/` folder
3. The ⬡ icon appears in your toolbar → click to open the side panel

---

## Part 3 — Settings Tab

| Field | Value |
|---|---|
| OpenRouter API Key | `sk-or-…` from openrouter.ai |
| OpenRouter Model | `anthropic/claude-3.5-sonnet` (default) |
| Gemini API Key | `AIza…` from aistudio.google.com |
| Google Script URL | Deployed Web App URL |
| Resume Template | Upload a `.tex` file |
| Cover Letter Template | Upload a `.tex` file |

Templates are stored as strings in `chrome.storage.local`. Clear them from the Settings UI.

---

## Part 4 — Google Sheets

1. New Google Sheet → **Extensions → Apps Script**
2. Paste `sheets/code.gs` (replace all existing code) → Save
3. **Deploy → New deployment**
   - Type: **Web App**
   - Execute as: **Me**
   - Who has access: **Anyone**
4. Authorize → copy URL → paste in Briefly Settings
5. Test by visiting the URL in your browser (GET returns status JSON)

The script auto-creates an **Applications** tab with:
- Frozen header row (blue)
- Status column with a dropdown: `Applied / OA / Interview / Rejected / Offer`
- Row colour-coding by status
- Validation applied to all future rows AND per-row on append

---

## V2 Change Log

### New Features
- **Resume Parser** — upload PDF/TXT → Gemini extracts structured profile data → auto-fills all inputs
- **Template uploads** — `.tex` files stored in storage instead of textarea
- **Non-blocking UI** — no more full-screen loading overlay; only the clicked button disables
- **Smart Re-scan** — extracts Company + Role via Gemini and auto-fills the Tracker; auto-triggers bullet refinement
- **PDF Download** — LaTeX is compiled by the Docker service; PDF saved via `chrome.downloads` as `Name_DocType_Company_Role.pdf`
- **Storage Explorer** tab — view all `chrome.storage.local` keys with size, preview, delete, and clear-all
- **Offer status** — added to tracker dropdown and Sheets validation

### Bug Fixes
- Gemini model updated to `gemini-2.0-flash`
- Sheets `fetch` now sends `Content-Type: text/plain` (avoids CORS preflight)
- `downloads` permission added to `manifest.json`

### Embellishment Guardrails (Claude)
**Allowed:** metric embellishment, keyword rephrasing, reordering tech stack  
**Forbidden:** changing company/university/project names, GPAs, inventing skills not in profile

---

## Troubleshooting

| Problem | Fix |
|---|---|
| Docker build slow | First build installs TeX Live (~400 MB). Subsequent builds use cache. |
| `pdflatex` timeout | Check for `\usepackage` requiring network or missing fonts; simplify template |
| PDF not downloading | Ensure Docker is running on port 3000; check Chrome's download folder |
| Gemini parse fails | File may be scanned PDF (image-only); try a text-based PDF or paste as TXT |
| Sheets 403 | Re-deploy the Apps Script and ensure access is set to "Anyone" |
| Re-scan doesn't fill Company/Role | Gemini key missing in Settings, or JD text too short |