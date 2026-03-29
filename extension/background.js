'use strict';
// background.js — Briefly V2 Service Worker

const COMPILER_URL   = 'http://localhost:3000/compile';
const GEMINI_MODEL   = 'gemini-2.0-flash';
const GEMINI_BASE    = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}`;

// ─── Side Panel ────────────────────────────────────────────────────────────────
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(console.error);

// ─── Message Router ────────────────────────────────────────────────────────────
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  const map = {
    SCRAPE_JD:          () => handleScrapeJD(sender, sendResponse),
    GET_JD:             () => handleGetJD(sendResponse),
    CLEAR_JD:           () => handleClearJD(sendResponse),
    GENERATE_RESUME:    () => handleGenerateResume(msg, sendResponse),
    GENERATE_COVER:     () => handleGenerateCover(msg, sendResponse),
    REFINE_EXPERIENCE:  () => handleRefineExperience(msg, sendResponse),
    COMPILE_AND_SAVE:   () => handleCompileAndSave(msg, sendResponse),
    ASK_GEMINI:         () => handleGeminiChat(msg, sendResponse),
    PARSE_RESUME:       () => handleParseResume(msg, sendResponse),
    EXTRACT_JD_META:    () => handleExtractJDMeta(msg, sendResponse),
    LOG_APPLICATION:    () => handleLogApplication(msg, sendResponse),
    GET_ALL_STORAGE:    () => handleGetAllStorage(sendResponse),
    DELETE_STORAGE_KEY: () => handleDeleteStorageKey(msg, sendResponse),
    CLEAR_ALL_STORAGE:  () => handleClearAllStorage(sendResponse),
  };
  const fn = map[msg.type];
  if (fn) { fn(); return true; }
});

// ─── JD ───────────────────────────────────────────────────────────────────────
async function handleScrapeJD(sender, sendResponse) {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: extractPageText,
    });
    const text = results[0]?.result || '';
    const domain = new URL(tab.url).hostname;
    const jdData = { text, domain, url: tab.url, title: tab.title, scrapedAt: Date.now() };
    await chrome.storage.local.set({ jd: jdData });
    sendResponse({ success: true, jd: jdData });
  } catch (e) {
    sendResponse({ success: false, error: e.message });
  }
}

function extractPageText() {
  const selectors = [
    '[data-automation="jobDescription"]',
    '.job-description', '#job-description',
    '[class*="jobDescription"]', '[class*="job-description"]',
    '.description__text', '[data-testid="job-description"]',
    '.jobs-description', '#jobDescriptionText',
    '.jobsearch-jobDescriptionText', '[class*="posting-description"]',
    '[class*="job-details"]', 'article', 'main',
  ];
  for (const sel of selectors) {
    const el = document.querySelector(sel);
    if (el && el.innerText.trim().length > 200)
      return el.innerText.trim().slice(0, 12000);
  }
  return document.body.innerText.trim().slice(0, 12000);
}

async function handleGetJD(sendResponse) {
  const d = await chrome.storage.local.get('jd');
  sendResponse({ jd: d.jd || null });
}

async function handleClearJD(sendResponse) {
  await chrome.storage.local.remove('jd');
  sendResponse({ success: true });
}

// ─── Extract Company + Role from JD ───────────────────────────────────────────
async function handleExtractJDMeta(msg, sendResponse) {
  try {
    const settings = await getSettings();
    const system = `You extract structured metadata from job descriptions. Respond ONLY with a JSON object — no markdown, no preamble.`;
    const user = `Extract the company name and job role/title from this job description. Return exactly: {"company": "...", "role": "..."}

JOB DESCRIPTION:
${msg.jd}`;
    const raw = await callGemini(settings.geminiKey, system, user, [], 256);
    const clean = raw.replace(/```json|```/g, '').trim();
    const meta = JSON.parse(clean);
    sendResponse({ success: true, company: meta.company || '', role: meta.role || '' });
  } catch (e) {
    sendResponse({ success: false, error: e.message });
  }
}

// ─── Resume Parser ─────────────────────────────────────────────────────────────
async function handleParseResume(msg, sendResponse) {
  try {
    const settings = await getSettings();
    const system = `You are an expert resume parser. Extract structured data from resume text and return ONLY a JSON object matching the schema exactly — no markdown, no explanation.`;
    const user = `Parse this resume text into the following JSON schema. Fill all fields you can find; use empty strings/arrays for missing data.

SCHEMA:
{
  "personal": { "name":"","email":"","phone":"","location":"","linkedin":"","github":"","website":"" },
  "modules": {
    "education": [{ "institution":"","degree":"","field":"","startDate":"","endDate":"","gpa":"","bullets":[] }],
    "workExperience": [{ "company":"","title":"","location":"","startDate":"","endDate":"","bullets":[] }],
    "projects": [{ "name":"","tech":"","url":"","bullets":[] }],
    "achievements": [{ "title":"","date":"","description":"" }],
    "courses": [{ "name":"","provider":"","date":"","grade":"" }]
  }
}

RESUME TEXT:
${msg.text}

Return ONLY the JSON object.`;
    const raw = await callGemini(settings.geminiKey, system, user, [], 4096);
    const clean = raw.replace(/```json|```/g, '').trim();
    const profile = JSON.parse(clean);
    sendResponse({ success: true, profile });
  } catch (e) {
    sendResponse({ success: false, error: e.message });
  }
}

// ─── Document Generation ───────────────────────────────────────────────────────

// ── Shared embellishment guardrails injected into every generation prompt ──
const GUARDRAILS = `
STRICT EMBELLISHMENT RULES — YOU MUST FOLLOW THESE:
ALLOWED:
  - Slight metric embellishment (e.g. "improved performance by ~15%" → "~20%") if reasonable
  - Rephrasing bullets using JD keywords and action verbs
  - Reordering / emphasising existing tech stack items that match the JD

FORBIDDEN — NEVER DO ANY OF THE FOLLOWING:
  - Change company names, university names, or project names
  - Change or round up GPAs
  - Add tools, languages, or frameworks not mentioned anywhere in the candidate profile (e.g. do NOT add "AWS" if AWS does not appear in the profile)
  - Invent achievements, certifications, or responsibilities not in the original data
  - Change job titles or employment dates
`;

async function handleGenerateResume(msg, sendResponse) {
  try {
    const settings = await getSettings();
    const system = `You are an expert resume writer and LaTeX typesetter. Output ONLY valid LaTeX — no markdown fences, no explanation. The resume MUST fit on exactly ONE page.
${GUARDRAILS}`;
    const user = `Generate a tailored, 1-page resume in LaTeX.

LATEX TEMPLATE:
${msg.latexTemplate || settings.resumeTemplate || DEFAULT_RESUME_TEMPLATE}

CANDIDATE PROFILE:
${JSON.stringify(msg.profile, null, 2)}

JOB DESCRIPTION:
${msg.jd}

Output ONLY the complete LaTeX document.`;
    const latex = await callOpenRouter(settings.openRouterKey, settings.openRouterModel, system, user);
    sendResponse({ success: true, latex });
  } catch (e) {
    sendResponse({ success: false, error: e.message });
  }
}

async function handleGenerateCover(msg, sendResponse) {
  try {
    const settings = await getSettings();
    const system = `You are an expert cover letter writer and LaTeX typesetter. Output ONLY valid LaTeX — no markdown fences, no explanation. The cover letter must be prose-heavy, narrative, and longer in content than a one-page resume.
${GUARDRAILS}`;
    const user = `Generate a compelling cover letter in LaTeX.

LATEX TEMPLATE:
${msg.latexTemplate || settings.coverTemplate || DEFAULT_COVER_TEMPLATE}

CANDIDATE PROFILE:
${JSON.stringify(msg.profile, null, 2)}

JOB DESCRIPTION:
${msg.jd}

Requirements:
- Output ONLY the complete LaTeX document
- 3–5 prose paragraphs: hook, narrative, why this company, closing
- Do NOT use bullet points
- Must be physically longer/denser than the resume
- Address ALL major JD requirements
- Do not restate resume bullets verbatim`;
    const latex = await callOpenRouter(settings.openRouterKey, settings.openRouterModel, system, user);
    sendResponse({ success: true, latex });
  } catch (e) {
    sendResponse({ success: false, error: e.message });
  }
}

async function handleRefineExperience(msg, sendResponse) {
  try {
    const settings = await getSettings();
    const system = `You are an expert resume writer. Output ONLY a valid JSON array — no markdown, no explanation.
${GUARDRAILS}`;
    const user = `Rewrite these work experience bullet points to align with the JD keywords. Preserve all facts; only rephrase using JD terminology and strong action verbs.

WORK EXPERIENCE (JSON):
${JSON.stringify(msg.workExperience, null, 2)}

JOB DESCRIPTION:
${msg.jd}

Return a JSON array with the same structure as input, with refined "bullets" arrays. Output ONLY the JSON array.`;
    const raw = await callOpenRouter(settings.openRouterKey, settings.openRouterModel, system, user);
    const clean = raw.replace(/```json|```/g, '').trim();
    const refined = JSON.parse(clean);
    sendResponse({ success: true, refined });
  } catch (e) {
    sendResponse({ success: false, error: e.message });
  }
}

// ─── Compile LaTeX → PDF → Download ───────────────────────────────────────────
async function handleCompileAndSave(msg, sendResponse) {
  try {
    const { latex, filename } = msg;
    const res = await fetch(COMPILER_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ latex, filename }),
    });

    if (!res.ok) {
      // Try to parse error JSON from compiler
      let errMsg = `Compiler error ${res.status}`;
      try {
        const errJson = await res.json();
        errMsg = errJson.error || errMsg;
        if (errJson.log) errMsg += `\n\nLaTeX Log:\n${errJson.log}`;
      } catch (_) {}
      return sendResponse({ success: false, error: errMsg });
    }

    // Convert response to blob URL for chrome.downloads
    const buffer = await res.arrayBuffer();
    const base64 = arrayBufferToBase64(buffer);
    const dataUrl = `data:application/pdf;base64,${base64}`;

    const safeFilename = sanitizeFilename(filename || 'document');
    await chrome.downloads.download({
      url: dataUrl,
      filename: `${safeFilename}.pdf`,
      saveAs: false,
    });

    sendResponse({ success: true, filename: safeFilename });
  } catch (e) {
    sendResponse({ success: false, error: e.message });
  }
}

function arrayBufferToBase64(buffer) {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

function sanitizeFilename(name) {
  return name.replace(/[^a-zA-Z0-9_\-\s]/g, '').trim().replace(/\s+/g, '_');
}

// ─── Gemini Chat ───────────────────────────────────────────────────────────────
async function handleGeminiChat(msg, sendResponse) {
  try {
    const settings = await getSettings();
    const { question, jd, profile, detailedMode, history } = msg;
    const concise = detailedMode ? '' : 'IMPORTANT: Maximum 2–3 sentences. No filler words.';
    const system = `You are a helpful job application assistant with access to the candidate profile and job description.
${concise}

CANDIDATE PROFILE:
${JSON.stringify(profile, null, 2)}

JOB DESCRIPTION:
${jd || 'No JD loaded.'}`;

    const answer = await callGemini(
      settings.geminiKey, system, question, history || [],
      detailedMode ? 2048 : 512
    );
    sendResponse({ success: true, answer });
  } catch (e) {
    sendResponse({ success: false, error: e.message });
  }
}

// ─── Google Sheets Logging ─────────────────────────────────────────────────────
async function handleLogApplication(msg, sendResponse) {
  try {
    const settings = await getSettings();
    const payload = {
      company: msg.company,
      role:    msg.role,
      status:  msg.status,
      date:    new Date().toISOString().split('T')[0],
      url:     msg.url || '',
      notes:   msg.notes || '',
    };
    // Google Apps Script doPost requires text/plain to avoid CORS preflight
    const res = await fetch(settings.sheetsUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error(`Sheets HTTP ${res.status}`);
    sendResponse({ success: true });
  } catch (e) {
    sendResponse({ success: false, error: e.message });
  }
}

// ─── Storage Explorer ─────────────────────────────────────────────────────────
async function handleGetAllStorage(sendResponse) {
  const all = await chrome.storage.local.get(null);
  sendResponse({ success: true, data: all });
}

async function handleDeleteStorageKey(msg, sendResponse) {
  await chrome.storage.local.remove(msg.key);
  sendResponse({ success: true });
}

async function handleClearAllStorage(sendResponse) {
  await chrome.storage.local.clear();
  sendResponse({ success: true });
}

// ─── API Helpers ───────────────────────────────────────────────────────────────
async function callOpenRouter(apiKey, model, systemPrompt, userPrompt) {
  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'chrome-extension://briefly',
      'X-Title': 'Briefly',
    },
    body: JSON.stringify({
      model: model || 'anthropic/claude-3.5-sonnet',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      max_tokens: 4096,
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`OpenRouter ${res.status}: ${err}`);
  }
  const data = await res.json();
  return data.choices[0].message.content;
}

async function callGemini(apiKey, systemPrompt, userPrompt, history = [], maxTokens = 1024) {
  const res = await fetch(
    `${GEMINI_BASE}:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: systemPrompt }] },
        contents: [
          ...history.map(h => ({
            role: h.role === 'assistant' ? 'model' : 'user',
            parts: [{ text: h.content }],
          })),
          { role: 'user', parts: [{ text: userPrompt }] },
        ],
        generationConfig: { maxOutputTokens: maxTokens },
      }),
    }
  );
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Gemini ${res.status}: ${err}`);
  }
  const data = await res.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text || 'No response.';
}

async function getSettings() {
  const d = await chrome.storage.local.get('settings');
  return d.settings || {};
}

// ─── Default Templates ─────────────────────────────────────────────────────────
const DEFAULT_RESUME_TEMPLATE = String.raw`\documentclass[10pt,a4paper]{article}
\usepackage[margin=0.6in]{geometry}
\usepackage{enumitem,hyperref,titlesec,parskip}
\pagestyle{empty}
\titleformat{\section}{\large\bfseries}{}{0em}{}[\titlerule]
\begin{document}
% INSERT CANDIDATE CONTENT HERE
\end{document}`;

const DEFAULT_COVER_TEMPLATE = String.raw`\documentclass[11pt,a4paper]{letter}
\usepackage[margin=1in]{geometry}
\usepackage{parskip}
\begin{document}
% INSERT COVER LETTER CONTENT HERE
\end{document}`;
