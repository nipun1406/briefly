// sidepanel.js — Briefly Side Panel Logic

// ─── Data Schema ──────────────────────────────────────────────────────────────
const DEFAULT_PROFILE = {
  personal: {
    name: '', email: '', phone: '', location: '', linkedin: '', github: '', website: ''
  },
  // Each module is an array of entries — extensible: add any new module key
  modules: {
    education: [],       // { institution, degree, field, startDate, endDate, gpa, bullets }
    workExperience: [],  // { company, title, location, startDate, endDate, bullets }
    projects: [],        // { name, tech, url, bullets }
    achievements: [],    // { title, date, description }
    courses: [],         // { name, provider, date, grade }
    // Future: certifications: [], volunteering: [], publications: []
  }
};

const MODULE_CONFIG = [
  {
    key: 'education',
    label: 'Education',
    icon: '🎓',
    fields: [
      { key: 'institution', label: 'Institution', placeholder: 'University of…' },
      { key: 'degree',      label: 'Degree',      placeholder: 'B.Sc. Computer Science' },
      { key: 'field',       label: 'Field',        placeholder: 'Major / Specialization' },
      { key: 'startDate',   label: 'Start',        placeholder: 'Sep 2020', half: true },
      { key: 'endDate',     label: 'End',          placeholder: 'May 2024', half: true },
      { key: 'gpa',         label: 'GPA',          placeholder: '3.8 / 4.0', half: true },
    ],
    bullets: true,
  },
  {
    key: 'workExperience',
    label: 'Work Experience',
    icon: '💼',
    fields: [
      { key: 'company',   label: 'Company',   placeholder: 'Acme Corp' },
      { key: 'title',     label: 'Role',      placeholder: 'Software Engineer' },
      { key: 'location',  label: 'Location',  placeholder: 'Remote / Sydney, AU', half: true },
      { key: 'startDate', label: 'Start',     placeholder: 'Jan 2023', half: true },
      { key: 'endDate',   label: 'End',       placeholder: 'Present', half: true },
    ],
    bullets: true,
  },
  {
    key: 'projects',
    label: 'Projects',
    icon: '🚀',
    fields: [
      { key: 'name', label: 'Project Name', placeholder: 'My Awesome Project' },
      { key: 'tech', label: 'Tech Stack',   placeholder: 'React, Node, PostgreSQL' },
      { key: 'url',  label: 'URL / Repo',   placeholder: 'https://github.com/…', half: false },
    ],
    bullets: true,
  },
  {
    key: 'achievements',
    label: 'Achievements',
    icon: '🏆',
    fields: [
      { key: 'title',       label: 'Achievement', placeholder: 'Dean\'s List / Hackathon Winner' },
      { key: 'date',        label: 'Date',         placeholder: '2023', half: true },
      { key: 'description', label: 'Description',  placeholder: 'Brief details…' },
    ],
    bullets: false,
  },
  {
    key: 'courses',
    label: 'Courses & Training',
    icon: '📚',
    fields: [
      { key: 'name',     label: 'Course Name', placeholder: 'Machine Learning Specialization' },
      { key: 'provider', label: 'Provider',    placeholder: 'Coursera / Udemy', half: true },
      { key: 'date',     label: 'Date',        placeholder: '2023', half: true },
      { key: 'grade',    label: 'Grade',       placeholder: 'Pass / 95%', half: true },
    ],
    bullets: false,
  },
];

// ─── State ────────────────────────────────────────────────────────────────────
let state = {
  profile: structuredClone(DEFAULT_PROFILE),
  settings: {},
  jd: null,
  chatHistory: [],
  detailedMode: false,
  refinedExperience: null,
};

// ─── Init ─────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  await loadStorage();
  renderProfileModules();
  populateSettingsForm();
  populateProfileForm();
  refreshJDStatus();
  bindEvents();
});

async function loadStorage() {
  const data = await chrome.storage.local.get(['profile', 'settings', 'jd']);
  if (data.profile)  state.profile  = data.profile;
  if (data.settings) state.settings = data.settings;
  if (data.jd)       state.jd       = data.jd;
}

// ─── Tab Navigation ───────────────────────────────────────────────────────────
function bindEvents() {
  // Tabs
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById(`tab-${btn.dataset.tab}`).classList.add('active');
    });
  });

  // JD
  document.getElementById('btn-rescan').addEventListener('click', scrapeJD);
  document.getElementById('btn-clear-jd').addEventListener('click', clearJD);

  // Documents
  document.getElementById('btn-gen-resume').addEventListener('click', generateResume);
  document.getElementById('btn-gen-cover').addEventListener('click', generateCover);
  document.getElementById('btn-refine').addEventListener('click', refineExperience);

  // Chat
  document.getElementById('btn-chat-send').addEventListener('click', sendChat);
  document.getElementById('chat-input').addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendChat(); }
  });
  document.getElementById('detailed-mode-toggle').addEventListener('change', e => {
    state.detailedMode = e.target.checked;
  });

  // Log application
  document.getElementById('btn-applied').addEventListener('click', logApplication);

  // Settings
  document.getElementById('btn-save-settings').addEventListener('click', saveSettings);

  // Profile
  document.getElementById('btn-save-profile').addEventListener('click', saveProfile);

  // Copy buttons (delegated)
  document.addEventListener('click', e => {
    const btn = e.target.closest('.btn-copy');
    if (!btn) return;
    const targetId = btn.dataset.target;
    const el = document.getElementById(targetId);
    if (!el) return;
    navigator.clipboard.writeText(el.textContent).then(() => {
      const orig = btn.textContent;
      btn.textContent = '✓ Copied';
      btn.classList.add('copied');
      setTimeout(() => { btn.textContent = orig; btn.classList.remove('copied'); }, 1500);
    });
  });
}

// ─── JD ───────────────────────────────────────────────────────────────────────
async function scrapeJD() {
  showLoading('Scanning page…');
  try {
    const response = await sendMessage({ type: 'SCRAPE_JD' });
    if (response.success) {
      state.jd = response.jd;
      refreshJDStatus();
    } else {
      showError('Scan failed: ' + response.error);
    }
  } catch (e) { showError(e.message); }
  hideLoading();
}

async function clearJD() {
  await sendMessage({ type: 'CLEAR_JD' });
  state.jd = null;
  refreshJDStatus();
}

function refreshJDStatus() {
  const statusEl = document.getElementById('jd-status');
  const statusText = document.getElementById('jd-status-text');
  const preview = document.getElementById('jd-preview');

  if (state.jd) {
    statusEl.className = 'jd-status loaded';
    statusText.textContent = state.jd.title || state.jd.domain || 'JD loaded';
    preview.textContent = state.jd.text.slice(0, 300) + '…';
    preview.classList.remove('hidden');
  } else {
    statusEl.className = 'jd-status empty';
    statusText.textContent = 'No JD loaded — open a job posting and click Re-scan';
    preview.classList.add('hidden');
  }
}

// ─── Document Generation ──────────────────────────────────────────────────────
async function generateResume() {
  if (!state.jd) return showError('Please scan a JD first.');
  showLoading('Generating resume…');
  try {
    const response = await sendMessage({
      type: 'GENERATE_RESUME',
      profile: state.profile,
      jd: state.jd.text,
      latexTemplate: state.settings.resumeTemplate,
    });
    if (response.success) {
      document.getElementById('resume-code').textContent = response.latex;
      document.getElementById('resume-output').classList.remove('hidden');
    } else {
      showError(response.error);
    }
  } catch (e) { showError(e.message); }
  hideLoading();
}

async function generateCover() {
  if (!state.jd) return showError('Please scan a JD first.');
  showLoading('Writing cover letter…');
  try {
    const response = await sendMessage({
      type: 'GENERATE_COVER',
      profile: state.profile,
      jd: state.jd.text,
      latexTemplate: state.settings.coverTemplate,
    });
    if (response.success) {
      document.getElementById('cover-code').textContent = response.latex;
      document.getElementById('cover-output').classList.remove('hidden');
    } else {
      showError(response.error);
    }
  } catch (e) { showError(e.message); }
  hideLoading();
}

// ─── Experience Refinement ────────────────────────────────────────────────────
async function refineExperience() {
  if (!state.jd) return showError('Please scan a JD first.');
  const workExp = state.profile.modules.workExperience;
  if (!workExp.length) return showError('Add work experience in your Profile first.');
  showLoading('Tailoring experience bullets…');
  try {
    const response = await sendMessage({
      type: 'REFINE_EXPERIENCE',
      workExperience: workExp,
      jd: state.jd.text,
    });
    if (response.success) {
      state.refinedExperience = response.refined;
      renderRefinedExperience(response.refined);
    } else {
      showError(response.error);
    }
  } catch (e) { showError(e.message); }
  hideLoading();
}

function renderRefinedExperience(entries) {
  const container = document.getElementById('refined-experience');
  container.innerHTML = '';
  entries.forEach((exp, idx) => {
    const bulletsHtml = (exp.bullets || []).map(b =>
      `<div class="exp-bullet">${escapeHtml(b)}</div>`
    ).join('');
    const blockId = `refined-bullets-${idx}`;
    const block = document.createElement('div');
    block.className = 'exp-block';
    block.innerHTML = `
      <div class="exp-block-header">
        <div>
          <div class="exp-title">${escapeHtml(exp.title || '')} @ ${escapeHtml(exp.company || '')}</div>
          <div class="exp-company">${escapeHtml(exp.startDate || '')}${exp.endDate ? ' – ' + escapeHtml(exp.endDate) : ''}</div>
        </div>
        <div class="exp-actions">
          <button class="btn-copy" data-target="${blockId}">⧉ Copy</button>
        </div>
      </div>
      <div class="exp-bullets" id="${blockId}-display">${bulletsHtml}</div>
      <pre id="${blockId}" style="display:none">${(exp.bullets || []).map(b => '• ' + b).join('\n')}</pre>
    `;
    container.appendChild(block);
  });
}

// ─── Chat ─────────────────────────────────────────────────────────────────────
async function sendChat() {
  const input = document.getElementById('chat-input');
  const question = input.value.trim();
  if (!question) return;
  input.value = '';

  appendChatMsg('user', question);

  const typingId = 'typing-' + Date.now();
  appendChatMsg('ai', '…', typingId);

  try {
    const response = await sendMessage({
      type: 'ASK_GEMINI',
      question,
      jd: state.jd?.text || '',
      profile: state.profile,
      detailedMode: state.detailedMode,
      history: state.chatHistory,
    });
    removeChatMsg(typingId);
    if (response.success) {
      state.chatHistory.push({ role: 'user', content: question });
      state.chatHistory.push({ role: 'assistant', content: response.answer });
      // Keep last 10 turns
      if (state.chatHistory.length > 20) state.chatHistory = state.chatHistory.slice(-20);
      appendChatMsg('ai', response.answer);
    } else {
      appendChatMsg('ai', '⚠ ' + response.error);
    }
  } catch (e) {
    removeChatMsg(typingId);
    appendChatMsg('ai', '⚠ ' + e.message);
  }
}

function appendChatMsg(role, text, id) {
  const container = document.getElementById('chat-messages');
  const msgId = id || `msg-${Date.now()}`;
  const div = document.createElement('div');
  div.className = `chat-msg chat-msg-${role}`;
  div.id = msgId;

  const copyBtn = role === 'ai' && !id
    ? `<div class="msg-actions"><button class="btn-copy" data-target="bubble-${msgId}">⧉ Copy</button></div>`
    : '';

  div.innerHTML = `
    <div class="bubble" id="bubble-${msgId}">${escapeHtml(text)}</div>
    ${copyBtn}
  `;
  container.appendChild(div);
  container.scrollTop = container.scrollHeight;
  return msgId;
}

function removeChatMsg(id) {
  document.getElementById(id)?.remove();
}

// ─── Log Application ──────────────────────────────────────────────────────────
async function logApplication() {
  const company = document.getElementById('apply-company').value.trim();
  const role = document.getElementById('apply-role').value.trim();
  const status = document.getElementById('apply-status').value;
  const feedback = document.getElementById('apply-feedback');

  if (!company || !role) {
    showFeedback(feedback, 'Please enter company and role.', 'error');
    return;
  }
  if (!state.settings.sheetsUrl) {
    showFeedback(feedback, 'Add your Google Script URL in Settings.', 'error');
    return;
  }

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  showLoading('Logging application…');
  try {
    const response = await sendMessage({
      type: 'LOG_APPLICATION',
      company, role, status,
      url: tab?.url || '',
    });
    if (response.success) {
      showFeedback(feedback, `✓ Logged "${role}" at ${company} as ${status}`, 'success');
    } else {
      showFeedback(feedback, response.error, 'error');
    }
  } catch (e) { showFeedback(feedback, e.message, 'error'); }
  hideLoading();
}

// ─── Settings ─────────────────────────────────────────────────────────────────
function populateSettingsForm() {
  const s = state.settings;
  setValue('openrouter-key', s.openRouterKey);
  setValue('openrouter-model', s.openRouterModel || 'anthropic/claude-3.5-sonnet');
  setValue('gemini-key', s.geminiKey);
  setValue('sheets-url', s.sheetsUrl);
  setValue('resume-template', s.resumeTemplate);
  setValue('cover-template', s.coverTemplate);
}

async function saveSettings() {
  const settings = {
    openRouterKey:  document.getElementById('openrouter-key').value.trim(),
    openRouterModel: document.getElementById('openrouter-model').value.trim(),
    geminiKey:      document.getElementById('gemini-key').value.trim(),
    sheetsUrl:      document.getElementById('sheets-url').value.trim(),
    resumeTemplate: document.getElementById('resume-template').value,
    coverTemplate:  document.getElementById('cover-template').value,
  };
  state.settings = settings;
  await chrome.storage.local.set({ settings });
  const fb = document.getElementById('settings-feedback');
  showFeedback(fb, '✓ Settings saved', 'success');
}

// ─── Profile Modules ──────────────────────────────────────────────────────────
function renderProfileModules() {
  const container = document.getElementById('profile-modules');
  container.innerHTML = '';

  // Personal info panel
  const personalPanel = document.createElement('div');
  personalPanel.className = 'module-panel';
  personalPanel.innerHTML = `
    <div class="module-header" data-module="personal">
      <div class="module-title"><span class="module-icon">👤</span> Personal Info</div>
      <span class="module-chevron">▾</span>
    </div>
    <div class="module-body" id="module-body-personal">
      <div class="entry-row">
        <input class="input" placeholder="Full Name" data-field="personal.name" />
        <input class="input" placeholder="Email" data-field="personal.email" />
      </div>
      <div class="entry-row">
        <input class="input" placeholder="Phone" data-field="personal.phone" />
        <input class="input" placeholder="Location" data-field="personal.location" />
      </div>
      <div class="entry-row">
        <input class="input" placeholder="LinkedIn URL" data-field="personal.linkedin" />
        <input class="input" placeholder="GitHub URL" data-field="personal.github" />
      </div>
      <input class="input" placeholder="Portfolio / Website" data-field="personal.website" />
    </div>
  `;
  container.appendChild(personalPanel);

  // Render each module
  MODULE_CONFIG.forEach(mod => {
    const panel = buildModulePanel(mod);
    container.appendChild(panel);
  });

  // Collapse toggle
  document.querySelectorAll('.module-header').forEach(header => {
    header.addEventListener('click', () => {
      const bodyId = `module-body-${header.dataset.module}`;
      const body = document.getElementById(bodyId);
      if (!body) return;
      const isOpen = body.classList.contains('open');
      body.classList.toggle('open', !isOpen);
      header.classList.toggle('open', !isOpen);
    });
  });
}

function buildModulePanel(mod) {
  const panel = document.createElement('div');
  panel.className = 'module-panel';
  panel.innerHTML = `
    <div class="module-header" data-module="${mod.key}">
      <div class="module-title"><span class="module-icon">${mod.icon}</span> ${mod.label}</div>
      <span class="module-chevron">▾</span>
    </div>
    <div class="module-body" id="module-body-${mod.key}">
      <div id="entries-${mod.key}"></div>
      <button class="btn-add-entry" data-module="${mod.key}">+ Add ${mod.label.replace(/s$/, '')}</button>
    </div>
  `;
  panel.querySelector('.btn-add-entry').addEventListener('click', () => {
    addModuleEntry(mod, document.getElementById(`entries-${mod.key}`));
  });
  return panel;
}

function addModuleEntry(mod, container, data = {}) {
  const entryEl = document.createElement('div');
  entryEl.className = 'module-entry';

  const halfFields = mod.fields.filter(f => f.half);
  const fullFields = mod.fields.filter(f => !f.half);

  let fieldsHtml = '';
  // Full-width fields
  fullFields.forEach(f => {
    fieldsHtml += `<input class="input" placeholder="${f.placeholder}" data-key="${f.key}" value="${escapeAttr(data[f.key] || '')}" />`;
  });
  // Half-width fields in pairs
  for (let i = 0; i < halfFields.length; i += 2) {
    const a = halfFields[i], b = halfFields[i + 1];
    fieldsHtml += `<div class="entry-row">
      <input class="input" placeholder="${a.placeholder}" data-key="${a.key}" value="${escapeAttr(data[a.key] || '')}" />
      ${b ? `<input class="input" placeholder="${b.placeholder}" data-key="${b.key}" value="${escapeAttr(data[b.key] || '')}" />` : ''}
    </div>`;
  }

  let bulletsHtml = '';
  if (mod.bullets) {
    const bullets = data.bullets || [''];
    bulletsHtml = `
      <div class="bullets-label">Bullet Points</div>
      <div class="bullets-container">
        ${bullets.map(b => bulletInputHtml(b)).join('')}
      </div>
      <button class="btn-add-bullet" type="button">+</button>
    `;
  }

  entryEl.innerHTML = `
    <button class="btn-remove-entry" title="Remove">✕</button>
    ${fieldsHtml}
    ${bulletsHtml}
  `;

  entryEl.querySelector('.btn-remove-entry').addEventListener('click', () => entryEl.remove());

  if (mod.bullets) {
    entryEl.querySelector('.btn-add-bullet').addEventListener('click', () => {
      const bulletsContainer = entryEl.querySelector('.bullets-container');
      const div = document.createElement('div');
      div.className = 'bullet-input-row';
      div.innerHTML = bulletInputHtml('');
      div.querySelector('.btn-remove-bullet')?.addEventListener('click', () => div.remove());
      bulletsContainer.appendChild(div);
    });

    // Bind remove on existing bullets
    entryEl.querySelectorAll('.btn-remove-bullet').forEach(btn => {
      btn.addEventListener('click', () => btn.closest('.bullet-input-row').remove());
    });
  }

  container.appendChild(entryEl);
}

function bulletInputHtml(value) {
  return `<div class="bullet-input-row">
    <input class="input" placeholder="Bullet point…" value="${escapeAttr(value)}" />
    <button class="btn-remove-bullet" type="button" style="background:transparent;border:1px solid var(--border);border-radius:4px;color:var(--text-muted);cursor:pointer;padding:4px 7px;">✕</button>
  </div>`;
}

function populateProfileForm() {
  const p = state.profile;
  // Personal
  Object.entries(p.personal || {}).forEach(([key, val]) => {
    const el = document.querySelector(`[data-field="personal.${key}"]`);
    if (el) el.value = val;
  });

  // Modules
  MODULE_CONFIG.forEach(mod => {
    const entries = p.modules[mod.key] || [];
    const container = document.getElementById(`entries-${mod.key}`);
    if (!container) return;
    entries.forEach(entry => addModuleEntry(mod, container, entry));
  });
}

async function saveProfile() {
  // Collect personal
  const personal = {};
  document.querySelectorAll('[data-field^="personal."]').forEach(el => {
    const key = el.dataset.field.replace('personal.', '');
    personal[key] = el.value.trim();
  });

  // Collect modules
  const modules = {};
  MODULE_CONFIG.forEach(mod => {
    const container = document.getElementById(`entries-${mod.key}`);
    if (!container) return;
    modules[mod.key] = Array.from(container.querySelectorAll('.module-entry')).map(entryEl => {
      const entry = {};
      entryEl.querySelectorAll('[data-key]').forEach(input => {
        entry[input.dataset.key] = input.value.trim();
      });
      if (mod.bullets) {
        entry.bullets = Array.from(entryEl.querySelectorAll('.bullet-input-row input'))
          .map(i => i.value.trim()).filter(Boolean);
      }
      return entry;
    });
  });

  state.profile = { personal, modules };
  await chrome.storage.local.set({ profile: state.profile });

  const btn = document.getElementById('btn-save-profile');
  const orig = btn.textContent;
  btn.textContent = '✓ Saved!';
  setTimeout(() => btn.textContent = orig, 1500);
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function sendMessage(msg) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(msg, response => {
      if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
      else resolve(response);
    });
  });
}

function showLoading(text) {
  document.getElementById('loading-text').textContent = text || 'Loading…';
  document.getElementById('loading-overlay').classList.remove('hidden');
}

function hideLoading() {
  document.getElementById('loading-overlay').classList.add('hidden');
}

function showError(msg) {
  hideLoading();
  // Toast-style: temporary message appended
  const toast = document.createElement('div');
  toast.style.cssText = 'position:fixed;bottom:16px;left:50%;transform:translateX(-50%);background:#f06060;color:#fff;padding:8px 16px;border-radius:8px;font-size:12px;z-index:9999;max-width:90%;text-align:center';
  toast.textContent = msg;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 4000);
}

function showFeedback(el, msg, type) {
  el.textContent = msg;
  el.className = `feedback ${type}`;
  el.classList.remove('hidden');
  setTimeout(() => el.classList.add('hidden'), 3000);
}

function setValue(id, val) {
  const el = document.getElementById(id);
  if (el && val !== undefined) el.value = val;
}

function escapeHtml(str) {
  return String(str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

function escapeAttr(str) {
  return String(str || '').replace(/"/g, '&quot;');
}
