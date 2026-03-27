// background.js — Service Worker for Briefly Extension

// ─── Side Panel Setup ─────────────────────────────────────────────────────────
chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: true })
  .catch(console.error);

// ─── Message Router ───────────────────────────────────────────────────────────
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const handlers = {
    SCRAPE_JD:           () => handleScrapeJD(sender, sendResponse),
    GENERATE_RESUME:     () => handleGenerateResume(message, sendResponse),
    GENERATE_COVER:      () => handleGenerateCover(message, sendResponse),
    REFINE_EXPERIENCE:   () => handleRefineExperience(message, sendResponse),
    ASK_GEMINI:          () => handleGeminiChat(message, sendResponse),
    LOG_APPLICATION:     () => handleLogApplication(message, sendResponse),
    GET_JD:              () => handleGetJD(sendResponse),
    CLEAR_JD:            () => handleClearJD(sendResponse),
    STORE_JD:            () => handleStoreJD(message, sender, sendResponse),
  };
  const fn = handlers[message.type];
  if (fn) { fn(); return true; } // keep channel open for async
});

// ─── JD Management ────────────────────────────────────────────────────────────
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
  // Priority selectors for job boards
  const selectors = [
    '[data-automation="jobDescription"]', // Seek
    '.job-description',
    '#job-description',
    '[class*="jobDescription"]',
    '[class*="job-description"]',
    '[class*="description"]',
    '.description__text',                 // LinkedIn
    '[data-testid="job-description"]',
    '.jobs-description',
    '#jobDescriptionText',                // Indeed
    '.jobsearch-jobDescriptionText',
    'article',
    'main',
  ];
  for (const sel of selectors) {
    const el = document.querySelector(sel);
    if (el && el.innerText.length > 200) return el.innerText.trim();
  }
  return document.body.innerText.trim().slice(0, 8000);
}

async function handleGetJD(sendResponse) {
  const data = await chrome.storage.local.get('jd');
  sendResponse({ jd: data.jd || null });
}

async function handleClearJD(sendResponse) {
  await chrome.storage.local.remove('jd');
  sendResponse({ success: true });
}

async function handleStoreJD(message, sender, sendResponse) {
  const domain = new URL(message.url).hostname;
  const jdData = { text: message.text, domain, url: message.url, title: message.title, scrapedAt: Date.now() };
  await chrome.storage.local.set({ jd: jdData });
  sendResponse({ success: true });
}

// ─── OpenRouter / Claude API ───────────────────────────────────────────────────
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
    throw new Error(`OpenRouter error ${res.status}: ${err}`);
  }
  const data = await res.json();
  return data.choices[0].message.content;
}

// ─── Resume Generation ────────────────────────────────────────────────────────
async function handleGenerateResume(message, sendResponse) {
  try {
    const settings = await getSettings();
    const { profile, jd, latexTemplate } = message;

    const system = `You are an expert resume writer and LaTeX typesetter. Your output must be ONLY valid LaTeX code with no markdown fences, no explanation text. The resume MUST fit on exactly ONE page. Be ruthlessly selective—prioritize experiences and skills most relevant to the job description.`;

    const user = `Generate a tailored resume in LaTeX using this template and data.

LATEX TEMPLATE:
${latexTemplate || settings.resumeTemplate || DEFAULT_RESUME_TEMPLATE}

CANDIDATE PROFILE:
${JSON.stringify(profile, null, 2)}

JOB DESCRIPTION:
${jd}

Requirements:
- Output ONLY the complete LaTeX document
- Must fit on 1 page strictly
- Prioritize and reword experience to match JD keywords
- Use strong action verbs and quantifiable achievements
- Keep formatting clean and ATS-friendly`;

    const latex = await callOpenRouter(settings.openRouterKey, settings.openRouterModel, system, user);
    sendResponse({ success: true, latex });
  } catch (e) {
    sendResponse({ success: false, error: e.message });
  }
}

// ─── Cover Letter Generation ───────────────────────────────────────────────────
async function handleGenerateCover(message, sendResponse) {
  try {
    const settings = await getSettings();
    const { profile, jd, latexTemplate } = message;

    const system = `You are an expert cover letter writer and LaTeX typesetter. Your output must be ONLY valid LaTeX code with no markdown fences, no explanation. The cover letter must be prose-heavy, genuine, and longer in content than a typical one-page resume. It must NOT simply restate resume bullet points—it should tell a compelling narrative.`;

    const user = `Generate a compelling cover letter in LaTeX using this template and data.

LATEX TEMPLATE:
${latexTemplate || settings.coverTemplate || DEFAULT_COVER_TEMPLATE}

CANDIDATE PROFILE:
${JSON.stringify(profile, null, 2)}

JOB DESCRIPTION:
${jd}

Requirements:
- Output ONLY the complete LaTeX document
- Must be prose-heavy narrative (NOT bullet points)
- Address ALL major requirements from the JD
- Should be physically longer/more text-dense than the resume
- 3-5 strong paragraphs: hook, relevant experience narrative, why this company, closing
- Show genuine enthusiasm and cultural fit
- Do not copy resume bullet points verbatim`;

    const latex = await callOpenRouter(settings.openRouterKey, settings.openRouterModel, system, user);
    sendResponse({ success: true, latex });
  } catch (e) {
    sendResponse({ success: false, error: e.message });
  }
}

// ─── Work Experience Refinement ────────────────────────────────────────────────
async function handleRefineExperience(message, sendResponse) {
  try {
    const settings = await getSettings();
    const { workExperience, jd } = message;

    const system = `You are an expert resume writer specializing in tailoring work experience to job descriptions. Output ONLY valid JSON matching the exact input structure—no explanation, no markdown.`;

    const user = `Rewrite these work experience bullet points to align with the job description keywords and requirements. Preserve the facts but rephrase using JD terminology, action verbs, and quantifiable impact where possible.

WORK EXPERIENCE (JSON):
${JSON.stringify(workExperience, null, 2)}

JOB DESCRIPTION:
${jd}

Return a JSON array matching the same structure as the input, with refined "bullets" arrays. Output ONLY the JSON array.`;

    const raw = await callOpenRouter(settings.openRouterKey, settings.openRouterModel, system, user);
    const cleaned = raw.replace(/```json|```/g, '').trim();
    const refined = JSON.parse(cleaned);
    sendResponse({ success: true, refined });
  } catch (e) {
    sendResponse({ success: false, error: e.message });
  }
}

// ─── Gemini Chat ───────────────────────────────────────────────────────────────
async function handleGeminiChat(message, sendResponse) {
  try {
    const settings = await getSettings();
    const { question, jd, profile, detailedMode, history } = message;

    const conciseInstruction = detailedMode
      ? ''
      : 'IMPORTANT: Your response must be extremely concise—maximum 2-3 sentences. No preamble, no filler words.';

    const systemContext = `You are a helpful job application assistant. You have access to the candidate's profile and the job description.

${conciseInstruction}

CANDIDATE PROFILE SUMMARY:
${JSON.stringify(profile, null, 2)}

JOB DESCRIPTION:
${jd || 'No JD loaded yet.'}`;

    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${settings.geminiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: systemContext }] },
          contents: [
            ...(history || []).map(h => ({
              role: h.role === 'assistant' ? 'model' : 'user',
              parts: [{ text: h.content }],
            })),
            { role: 'user', parts: [{ text: question }] },
          ],
          generationConfig: { maxOutputTokens: detailedMode ? 2048 : 512 },
        }),
      }
    );
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Gemini error ${res.status}: ${err}`);
    }
    const data = await res.json();
    const answer = data.candidates?.[0]?.content?.parts?.[0]?.text || 'No response.';
    sendResponse({ success: true, answer });
  } catch (e) {
    sendResponse({ success: false, error: e.message });
  }
}

// ─── Google Sheets Logging ─────────────────────────────────────────────────────
async function handleLogApplication(message, sendResponse) {
  try {
    const settings = await getSettings();
    const { company, role, status } = message;
    const payload = {
      company,
      role,
      status,
      date: new Date().toISOString().split('T')[0],
      url: message.url || '',
    };
    const res = await fetch(settings.sheetsUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'type/plain;charset=utf-8' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error(`Sheets error: ${res.status}`);
    sendResponse({ success: true });
  } catch (e) {
    sendResponse({ success: false, error: e.message });
  }
}

// ─── Helpers ───────────────────────────────────────────────────────────────────
async function getSettings() {
  const data = await chrome.storage.local.get('settings');
  return data.settings || {};
}

// ─── Default LaTeX Templates ───────────────────────────────────────────────────
const DEFAULT_RESUME_TEMPLATE = `\\documentclass[10pt,a4paper]{article}
\\usepackage[margin=0.6in]{geometry}
\\usepackage{enumitem}
\\usepackage{hyperref}
\\usepackage{titlesec}
\\usepackage{parskip}
\\pagestyle{empty}
\\titleformat{\\section}{\\large\\bfseries}{}{0em}{}[\\titlerule]
\\begin{document}
% FILL WITH CANDIDATE DATA
\\end{document}`;

const DEFAULT_COVER_TEMPLATE = `\\documentclass[11pt,a4paper]{letter}
\\usepackage[margin=1in]{geometry}
\\usepackage{parskip}
\\begin{document}
% FILL WITH CANDIDATE DATA
\\end{document}`;
