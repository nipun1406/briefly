// background.js — Briefly V2.1 Service Worker (ES Module)
import { Prompts } from './prompts.js';

const COMPILER_URL = 'http://localhost:3000/compile';
const GEMINI_MODEL = 'gemini-2.0-flash';
const GEMINI_BASE  = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}`;

// ─── Side Panel ────────────────────────────────────────────────────────────────
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(console.error);

// ─── Message Router ────────────────────────────────────────────────────────────
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  const map = {
    SCRAPE_JD:         () => handleScrapeJD(sendResponse),
    GET_JD:            () => handleGetJD(sendResponse),
    CLEAR_JD:          () => handleClearJD(sendResponse),
    GENERATE_RESUME:   () => handleGenerateResume(msg, sendResponse),
    GENERATE_COVER:    () => handleGenerateCover(msg, sendResponse),
    COMPILE_AND_SAVE:  () => handleCompileAndSave(msg, sendResponse),
    ASK_GEMINI:        () => handleGeminiChat(msg, sendResponse),
    PARSE_RESUME:      () => handleParseResume(msg, sendResponse),
    EXTRACT_JD_META:   () => handleExtractJDMeta(msg, sendResponse),
    LOG_APPLICATION:   () => handleLogApplication(msg, sendResponse),
    GET_ALL_STORAGE:   () => handleGetAllStorage(sendResponse),
    DELETE_STORAGE_KEY:() => handleDeleteStorageKey(msg, sendResponse),
    CLEAR_ALL_STORAGE: () => handleClearAllStorage(sendResponse),
  };
  const fn = map[msg.type];
  if (fn) { fn(); return true; }
});

// ─── JD ───────────────────────────────────────────────────────────────────────
async function handleScrapeJD(sendResponse) {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: extractPageText,
    });
    const text   = results[0]?.result || '';
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
    '[data-automation="jobDescription"]', '.job-description', '#job-description',
    '[class*="jobDescription"]', '[class*="job-description"]', '.description__text',
    '[data-testid="job-description"]', '.jobs-description', '#jobDescriptionText',
    '.jobsearch-jobDescriptionText', '[class*="posting-description"]',
    '[class*="job-details"]', 'article', 'main',
  ];
  for (const sel of selectors) {
    const el = document.querySelector(sel);
    if (el && el.innerText.trim().length > 200) return el.innerText.trim().slice(0, 12000);
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

// ─── Extract JD Meta (company, role, skill matches, role descriptions) ─────────
// Now accepts `profile` and passes both jd + profile into Prompts.extractJDMeta
async function handleExtractJDMeta(msg, sendResponse) {
  try {
    const settings = await getSettings();
    const { jd, profile } = msg;
    const prompt = Prompts.extractJDMeta(jd, profile);
    // requireJson: true → uses Gemini native JSON mode (responseMimeType)
    const raw = await callGemini(settings.geminiKey, prompt.system, prompt.user, [], 2048, true);
    const meta = JSON.parse(raw);
    sendResponse({
      success: true,
      company:                meta.company                || '',
      role:                   meta.role                   || '',
      workExRoleDescriptions: meta.workExRoleDescriptions || {},
      skillsExactMatch:       meta.skillsExactMatch       || [],
      skillsCloseMatch:       meta.skillsCloseMatch       || [],
    });
  } catch (e) {
    sendResponse({ success: false, error: e.message });
  }
}

// ─── Resume Parser ─────────────────────────────────────────────────────────────
async function handleParseResume(msg, sendResponse) {
  try {
    const settings = await getSettings();
    const prompt = Prompts.parseResume(msg.text);
    const raw    = await callGemini(settings.geminiKey, prompt.system, prompt.user, [], 4096, true);
    const profile = JSON.parse(raw);
    sendResponse({ success: true, profile });
  } catch (e) {
    sendResponse({ success: false, error: e.message });
  }
}

// ─── Document Generation ───────────────────────────────────────────────────────
async function handleGenerateResume(msg, sendResponse) {
  try {
    const settings = await getSettings();
    const prompt   = Prompts.generateResume(msg.profile, msg.jd, msg.latexTemplate || settings.resumeTemplate || '');
    const latex    = await callOpenRouter(settings.openRouterKey, settings.openRouterModel, prompt.system, prompt.user);
    sendResponse({ success: true, latex });
  } catch (e) {
    sendResponse({ success: false, error: e.message });
  }
}

async function handleGenerateCover(msg, sendResponse) {
  try {
    const settings = await getSettings();
    const prompt   = Prompts.generateCoverLetter(msg.profile, msg.jd, msg.latexTemplate || settings.coverTemplate || '');
    const latex    = await callOpenRouter(settings.openRouterKey, settings.openRouterModel, prompt.system, prompt.user);
    sendResponse({ success: true, latex });
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
      let errMsg = `Compiler error ${res.status}`;
      try {
        const j = await res.json();
        errMsg  = j.error || errMsg;
        if (j.log) errMsg += `\n\nLaTeX Log:\n${j.log}`;
      } catch (_) {}
      return sendResponse({ success: false, error: errMsg });
    }
    const buffer  = await res.arrayBuffer();
    const base64  = arrayBufferToBase64(buffer);
    const dataUrl = `data:application/pdf;base64,${base64}`;
    await chrome.downloads.download({
      url: dataUrl,
      filename: `${sanitizeFilename(filename || 'document')}.pdf`,
      saveAs: false,
    });
    sendResponse({ success: true, filename: sanitizeFilename(filename) });
  } catch (e) {
    sendResponse({ success: false, error: e.message });
  }
}

// ─── Gemini Chat ───────────────────────────────────────────────────────────────
async function handleGeminiChat(msg, sendResponse) {
  try {
    const settings = await getSettings();
    const { question, jd, profile, detailedMode, history } = msg;
    const prompt   = Prompts.chat(profile, jd, detailedMode);
    const answer   = await callGemini(
      settings.geminiKey, prompt.system, question, history || [],
      detailedMode ? 2048 : 512, false
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
    const payload  = {
      company: msg.company, role: msg.role, status: msg.status,
      date:    new Date().toISOString().split('T')[0],
      url:     msg.url || '', notes: msg.notes || '',
    };
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

// ─── Storage ───────────────────────────────────────────────────────────────────
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
      'Content-Type':  'application/json',
      'HTTP-Referer':  'chrome-extension://briefly',
      'X-Title':       'Briefly',
    },
    body: JSON.stringify({
      model:    model || 'anthropic/claude-3.5-sonnet',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user',   content: userPrompt   },
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

/**
 * @param {string}  apiKey
 * @param {string}  systemPrompt
 * @param {string}  userPrompt
 * @param {Array}   history       - [{role, content}] previous turns
 * @param {number}  maxTokens
 * @param {boolean} requireJson   - when true, adds responseMimeType:"application/json"
 */
async function callGemini(apiKey, systemPrompt, userPrompt, history = [], maxTokens = 1024, requireJson = false) {
  const generationConfig = { maxOutputTokens: maxTokens };
  if (requireJson) generationConfig.responseMimeType = 'application/json';

  const res = await fetch(`${GEMINI_BASE}:generateContent?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      system_instruction: { parts: [{ text: systemPrompt }] },
      contents: [
        ...history.map(h => ({
          role:  h.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: h.content }],
        })),
        { role: 'user', parts: [{ text: userPrompt }] },
      ],
      generationConfig,
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Gemini ${res.status}: ${err}`);
  }
  const data = await res.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
}

// ─── Utility ───────────────────────────────────────────────────────────────────
async function getSettings() {
  const d = await chrome.storage.local.get('settings');
  return d.settings || {};
}

function arrayBufferToBase64(buffer) {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

function sanitizeFilename(name) {
  return String(name || 'document').replace(/[^a-zA-Z0-9_\-\s]/g, '').trim().replace(/\s+/g, '_');
}
