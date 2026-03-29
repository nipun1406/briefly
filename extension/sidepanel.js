'use strict';
// sidepanel.js — Briefly V2

// ─── Data Schema ──────────────────────────────────────────────────────────────
const DEFAULT_PROFILE = {
  personal: { name:'', email:'', phone:'', location:'', linkedin:'', github:'', website:'' },
  modules: {
    education:      [],
    workExperience: [],
    projects:       [],
    achievements:   [],
    courses:        [],
  }
};

const MODULE_CONFIG = [
  {
    key: 'education', label: 'Education', icon: '🎓',
    fields: [
      { key:'institution', placeholder:'University of…' },
      { key:'degree',      placeholder:'B.Sc. Computer Science' },
      { key:'field',       placeholder:'Major / Specialization' },
      { key:'startDate',   placeholder:'Sep 2020', half:true },
      { key:'endDate',     placeholder:'May 2024', half:true },
      { key:'gpa',         placeholder:'3.8 / 4.0', half:true },
    ],
    bullets: true,
  },
  {
    key: 'workExperience', label: 'Work Experience', icon: '💼',
    fields: [
      { key:'company',   placeholder:'Acme Corp' },
      { key:'title',     placeholder:'Software Engineer' },
      { key:'location',  placeholder:'Remote / Sydney, AU', half:true },
      { key:'startDate', placeholder:'Jan 2023', half:true },
      { key:'endDate',   placeholder:'Present',  half:true },
    ],
    bullets: true,
  },
  {
    key: 'projects', label: 'Projects', icon: '🚀',
    fields: [
      { key:'name', placeholder:'Project Name' },
      { key:'tech', placeholder:'React, Node, Postgres' },
      { key:'url',  placeholder:'https://github.com/…' },
    ],
    bullets: true,
  },
  {
    key: 'achievements', label: 'Achievements', icon: '🏆',
    fields: [
      { key:'title',       placeholder:"Dean's List / Hackathon Winner" },
      { key:'date',        placeholder:'2023', half:true },
      { key:'description', placeholder:'Brief details…' },
    ],
    bullets: false,
  },
  {
    key: 'courses', label: 'Courses & Training', icon: '📚',
    fields: [
      { key:'name',     placeholder:'Machine Learning Specialization' },
      { key:'provider', placeholder:'Coursera / Udemy', half:true },
      { key:'date',     placeholder:'2023',             half:true },
      { key:'grade',    placeholder:'Pass / 95%',       half:true },
    ],
    bullets: false,
  },
];

// ─── State ────────────────────────────────────────────────────────────────────
const state = {
  profile:      structuredClone(DEFAULT_PROFILE),
  settings:     {},
  jd:           null,
  chatHistory:  [],
  detailedMode: false,
  parsedResumeText: null,
};

// ─── Init ─────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  await loadStorage();
  renderProfileModules();
  populateProfileForm();
  populateSettingsForm();
  refreshJDStatus();
  bindTabNav();
  bindApplicationTab();
  bindProfileTab();
  bindSettingsTab();
  bindStorageTab();
});

async function loadStorage() {
  const data = await chrome.storage.local.get(['profile', 'settings', 'jd']);
  if (data.profile)  state.profile  = data.profile;
  if (data.settings) state.settings = data.settings;
  if (data.jd)       state.jd       = data.jd;
}

// ─── Tabs ─────────────────────────────────────────────────────────────────────
function bindTabNav() {
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById(`tab-${btn.dataset.tab}`).classList.add('active');
      if (btn.dataset.tab === 'storage') refreshStorageExplorer();
    });
  });
}

// ─── APPLICATION TAB ──────────────────────────────────────────────────────────
function bindApplicationTab() {
  el('btn-rescan').addEventListener('click', handleRescan);
  el('btn-clear-jd').addEventListener('click', async () => {
    await sendMsg({ type: 'CLEAR_JD' });
    state.jd = null;
    refreshJDStatus();
  });

  el('btn-gen-resume').addEventListener('click', () => generateDoc('resume'));
  el('btn-gen-cover').addEventListener('click',  () => generateDoc('cover'));
  el('btn-dl-resume').addEventListener('click',  () => compileAndDownload('resume'));
  el('btn-dl-cover').addEventListener('click',   () => compileAndDownload('cover'));
  el('btn-refine').addEventListener('click', () => runRefineExperience());

  el('btn-send').addEventListener('click', sendChat);
  el('chat-input').addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendChat(); }});
  el('detailed-toggle').addEventListener('change', e => { state.detailedMode = e.target.checked; });

  el('btn-log').addEventListener('click', logApplication);

  // Copy buttons (delegated)
  document.addEventListener('click', e => {
    const btn = e.target.closest('.btn-copy');
    if (!btn) return;
    const text = el(btn.dataset.target)?.textContent || '';
    navigator.clipboard.writeText(text).then(() => {
      const orig = btn.textContent;
      btn.textContent = '✓ Copied'; btn.classList.add('copied');
      setTimeout(() => { btn.textContent = orig; btn.classList.remove('copied'); }, 1500);
    });
  });
}

// ── Re-scan: scrape → extract meta → auto-fill tracker → auto-refine ──────────
async function handleRescan() {
  const btn = el('btn-rescan');
  setBtnLoading(btn, true, '⏳ Scanning…');
  try {
    const res = await sendMsg({ type: 'SCRAPE_JD' });
    if (!res.success) return showToast(res.error, 'error');
    state.jd = res.jd;
    refreshJDStatus();

    // Auto-extract company + role
    if (state.settings.geminiKey && state.jd.text) {
      const meta = await sendMsg({ type: 'EXTRACT_JD_META', jd: state.jd.text });
      if (meta.success) {
        if (meta.company) el('apply-company').value = meta.company;
        if (meta.role)    el('apply-role').value    = meta.role;
      }
    }

    // Auto-trigger refine (non-blocking, no button loading)
    const workExp = state.profile.modules.workExperience;
    if (workExp.length && state.settings.openRouterKey) {
      runRefineExperience(); // fire and forget
    }
  } catch (e) { showToast(e.message, 'error'); }
  setBtnLoading(btn, false, '↻ Re-scan');
}

// ── Document Generation ────────────────────────────────────────────────────────
async function generateDoc(type) {
  if (!state.jd) return showToast('Please scan a JD first.');
  const btnId  = type === 'resume' ? 'btn-gen-resume' : 'btn-gen-cover';
  const outId  = type === 'resume' ? 'resume-output'  : 'cover-output';
  const codeId = type === 'resume' ? 'resume-code'    : 'cover-code';
  const msgType = type === 'resume' ? 'GENERATE_RESUME' : 'GENERATE_COVER';
  const label   = type === 'resume' ? '⬡ Resume' : '✉ Cover Letter';

  const btn = el(btnId);
  setBtnLoading(btn, true, '⏳ Generating…');
  try {
    const res = await sendMsg({
      type: msgType,
      profile: state.profile,
      jd: state.jd.text,
      latexTemplate: type === 'resume' ? state.settings.resumeTemplate : state.settings.coverTemplate,
    });
    if (res.success) {
      el(codeId).textContent = res.latex;
      el(outId).classList.remove('hidden');
    } else {
      showToast(res.error, 'error');
    }
  } catch (e) { showToast(e.message, 'error'); }
  setBtnLoading(btn, false, label);
}

// ── Compile & Download PDF ─────────────────────────────────────────────────────
async function compileAndDownload(type) {
  const codeId = type === 'resume' ? 'resume-code' : 'cover-code';
  const btnId  = type === 'resume' ? 'btn-dl-resume' : 'btn-dl-cover';
  const latex  = el(codeId)?.textContent?.trim();
  if (!latex) return showToast('Generate a document first.');

  const btn = el(btnId);
  setBtnLoading(btn, true, '⏳ Compiling…');
  try {
    const profile  = state.profile;
    const name     = (profile.personal.name || 'Name').replace(/\s+/g, '_');
    const company  = el('apply-company')?.value?.trim().replace(/\s+/g, '_') || 'Company';
    const role     = el('apply-role')?.value?.trim().replace(/\s+/g, '_') || 'Role';
    const docType  = type === 'resume' ? 'Resume' : 'CoverLetter';
    const filename = `${name}_${docType}_${company}_${role}`;

    const res = await sendMsg({ type: 'COMPILE_AND_SAVE', latex, filename });
    if (res.success) {
      showToast(`✓ Saved as ${res.filename}.pdf`, 'success');
    } else {
      showToast(res.error, 'error');
    }
  } catch (e) { showToast(e.message, 'error'); }
  setBtnLoading(btn, false, '⬇ PDF');
}

// ── Experience Refinement ──────────────────────────────────────────────────────
async function runRefineExperience() {
  if (!state.jd) return;
  const workExp = state.profile.modules.workExperience;
  if (!workExp.length) return;

  const btn = el('btn-refine');
  setBtnLoading(btn, true, '⏳ Tailoring…');
  el('refine-hint').classList.add('hidden');
  try {
    const res = await sendMsg({ type: 'REFINE_EXPERIENCE', workExperience: workExp, jd: state.jd.text });
    if (res.success) renderRefinedExperience(res.refined);
    else showToast(res.error, 'error');
  } catch (e) { showToast(e.message, 'error'); }
  setBtnLoading(btn, false, '↻ Tailor to JD');
}

function renderRefinedExperience(entries) {
  const container = el('refined-experience');
  container.innerHTML = '';
  entries.forEach((exp, idx) => {
    const blockId = `rf-${idx}`;
    const bulletsHtml = (exp.bullets || []).map(b => `<div class="exp-bullet">${escHtml(b)}</div>`).join('');
    const div = document.createElement('div');
    div.className = 'exp-block';
    div.innerHTML = `
      <div class="exp-block-header">
        <div>
          <div class="exp-title">${escHtml(exp.title||'')} @ ${escHtml(exp.company||'')}</div>
          <div class="exp-company">${escHtml(exp.startDate||'')}${exp.endDate ? ' – '+escHtml(exp.endDate) : ''}</div>
        </div>
        <div class="row-gap">
          <button class="btn-copy" data-target="${blockId}-hidden">⧉ Copy</button>
        </div>
      </div>
      <div class="exp-bullets">${bulletsHtml}</div>
      <pre id="${blockId}-hidden" style="display:none">${(exp.bullets||[]).map(b=>'• '+b).join('\n')}</pre>`;
    container.appendChild(div);
  });
}

// ── Chat ────────────────────────────────────────────────────────────────────────
async function sendChat() {
  const input = el('chat-input');
  const q = input.value.trim();
  if (!q) return;
  input.value = '';
  appendBubble('user', q);
  const typingId = appendBubble('ai', '…');

  try {
    const res = await sendMsg({
      type: 'ASK_GEMINI', question: q,
      jd: state.jd?.text || '', profile: state.profile,
      detailedMode: state.detailedMode, history: state.chatHistory,
    });
    removeBubble(typingId);
    const answer = res.success ? res.answer : '⚠ ' + res.error;
    if (res.success) {
      state.chatHistory.push({ role:'user', content:q });
      state.chatHistory.push({ role:'assistant', content:answer });
      if (state.chatHistory.length > 20) state.chatHistory = state.chatHistory.slice(-20);
    }
    appendBubble('ai', answer, true);
  } catch(e) { removeBubble(typingId); appendBubble('ai', '⚠ '+e.message, false); }
}

function appendBubble(role, text, withCopy = false) {
  const container = el('chat-messages');
  const id = `bubble-${Date.now()}-${Math.random().toString(36).slice(2,6)}`;
  const div = document.createElement('div');
  div.className = `chat-msg chat-msg-${role}`;
  div.id = id;
  const copyRow = (withCopy && role === 'ai')
    ? `<div class="msg-actions"><button class="btn-copy" data-target="${id}-text">⧉ Copy</button></div>`
    : '';
  div.innerHTML = `<div class="bubble" id="${id}-text">${escHtml(text)}</div>${copyRow}`;
  container.appendChild(div);
  container.scrollTop = container.scrollHeight;
  return id;
}
function removeBubble(id) { el(id)?.remove(); }

// ── Log Application ────────────────────────────────────────────────────────────
async function logApplication() {
  const company = el('apply-company').value.trim();
  const role    = el('apply-role').value.trim();
  const status  = el('apply-status').value;
  const notes   = el('apply-notes').value.trim();
  const fb      = el('apply-feedback');
  if (!company || !role) return showFeedback(fb, 'Enter company and role.', 'error');
  if (!state.settings.sheetsUrl) return showFeedback(fb, 'Add Google Script URL in Settings.', 'error');

  const btn = el('btn-log');
  setBtnLoading(btn, true, '⏳ Logging…');
  const [tab] = await chrome.tabs.query({ active:true, currentWindow:true });
  try {
    const res = await sendMsg({ type:'LOG_APPLICATION', company, role, status, notes, url:tab?.url||'' });
    if (res.success) showFeedback(fb, `✓ Logged "${role}" at ${company}`, 'success');
    else showFeedback(fb, res.error, 'error');
  } catch(e) { showFeedback(fb, e.message, 'error'); }
  setBtnLoading(btn, false, '✓ Log Application');
}

// ─── PROFILE TAB ─────────────────────────────────────────────────────────────
function bindProfileTab() {
  const uploadInput = el('resume-upload');
  const parseBtn    = el('btn-parse-resume');
  const fb          = el('parse-feedback');

  uploadInput.addEventListener('change', () => {
    const file = uploadInput.files[0];
    if (!file) return;
    el('resume-upload-name').textContent = file.name;
    parseBtn.disabled = false;
    state.parsedResumeText = null; // reset

    const reader = new FileReader();
    if (file.type === 'application/pdf') {
      reader.readAsArrayBuffer(file);
      reader.onload = async () => {
        // Basic PDF text extraction — pull readable strings from binary
        const bytes = new Uint8Array(reader.result);
        let text = '';
        for (let i = 0; i < bytes.length - 1; i++) {
          if (bytes[i] >= 32 && bytes[i] < 127) text += String.fromCharCode(bytes[i]);
          else if (bytes[i] === 10 || bytes[i] === 13) text += '\n';
        }
        // Filter only lines that look like real text
        text = text.split('\n')
          .filter(l => l.trim().length > 3 && /[a-zA-Z]/.test(l))
          .join('\n');
        state.parsedResumeText = text.slice(0, 12000);
      };
    } else {
      reader.readAsText(file);
      reader.onload = () => { state.parsedResumeText = reader.result.slice(0, 12000); };
    }
  });

  parseBtn.addEventListener('click', async () => {
    if (!state.parsedResumeText) return showFeedback(fb, 'File still loading, try again.', 'error');
    if (!state.settings.geminiKey) return showFeedback(fb, 'Add Gemini API key in Settings.', 'error');
    setBtnLoading(parseBtn, true, '⏳ Parsing…');
    try {
      const res = await sendMsg({ type:'PARSE_RESUME', text: state.parsedResumeText });
      if (res.success) {
        // Merge parsed into state, preserving empty-module defaults
        state.profile = deepMergeProfile(res.profile);
        await chrome.storage.local.set({ profile: state.profile });
        // Re-render the form with new data
        renderProfileModules();
        populateProfileForm();
        showFeedback(fb, '✓ Profile auto-filled! Review and save.', 'success');
      } else {
        showFeedback(fb, res.error, 'error');
      }
    } catch(e) { showFeedback(fb, e.message, 'error'); }
    setBtnLoading(parseBtn, false, '⬡ Parse & Auto-fill Profile');
  });

  el('btn-save-profile').addEventListener('click', saveProfile);
}

function deepMergeProfile(parsed) {
  const base = structuredClone(DEFAULT_PROFILE);
  if (parsed.personal) Object.assign(base.personal, parsed.personal);
  if (parsed.modules) {
    Object.keys(base.modules).forEach(key => {
      if (Array.isArray(parsed.modules[key]) && parsed.modules[key].length)
        base.modules[key] = parsed.modules[key];
    });
  }
  return base;
}

// ─── Profile Module Rendering ─────────────────────────────────────────────────
function renderProfileModules() {
  const container = el('profile-modules');
  container.innerHTML = '';

  // Personal info
  const personalPanel = document.createElement('div');
  personalPanel.className = 'module-panel';
  personalPanel.innerHTML = `
    <div class="module-header" data-module="personal">
      <div class="module-title"><span class="module-icon">👤</span> Personal Info</div>
      <span class="module-chevron">▾</span>
    </div>
    <div class="module-body" id="module-body-personal">
      <div class="entry-row">
        <input class="input" placeholder="Full Name"  data-field="personal.name" />
        <input class="input" placeholder="Email"      data-field="personal.email" />
      </div>
      <div class="entry-row">
        <input class="input" placeholder="Phone"      data-field="personal.phone" />
        <input class="input" placeholder="Location"   data-field="personal.location" />
      </div>
      <div class="entry-row">
        <input class="input" placeholder="LinkedIn"   data-field="personal.linkedin" />
        <input class="input" placeholder="GitHub"     data-field="personal.github" />
      </div>
      <input class="input" placeholder="Portfolio / Website" data-field="personal.website" />
    </div>`;
  container.appendChild(personalPanel);

  MODULE_CONFIG.forEach(mod => {
    const panel = buildModulePanel(mod);
    container.appendChild(panel);
  });

  // Collapse toggles
  container.querySelectorAll('.module-header').forEach(header => {
    header.addEventListener('click', () => {
      const body = el(`module-body-${header.dataset.module}`);
      if (!body) return;
      const open = body.classList.contains('open');
      body.classList.toggle('open', !open);
      header.classList.toggle('open', !open);
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
      <button class="btn-add-entry" data-module="${mod.key}">+ Add ${mod.label.replace(/s$/,'')}</button>
    </div>`;
  panel.querySelector('.btn-add-entry').addEventListener('click', () => {
    addModuleEntry(mod, el(`entries-${mod.key}`));
  });
  return panel;
}

function addModuleEntry(mod, container, data = {}) {
  const entryEl = document.createElement('div');
  entryEl.className = 'module-entry';

  const fullFields = mod.fields.filter(f => !f.half);
  const halfFields = mod.fields.filter(f =>  f.half);

  let html = '';
  fullFields.forEach(f => {
    html += `<input class="input" placeholder="${f.placeholder}" data-key="${f.key}" value="${escAttr(data[f.key]||'')}" />`;
  });
  for (let i = 0; i < halfFields.length; i += 2) {
    const a = halfFields[i], b = halfFields[i+1];
    html += `<div class="entry-row">
      <input class="input" placeholder="${a.placeholder}" data-key="${a.key}" value="${escAttr(data[a.key]||'')}" />
      ${b ? `<input class="input" placeholder="${b.placeholder}" data-key="${b.key}" value="${escAttr(data[b.key]||'')}" />` : ''}
    </div>`;
  }

  if (mod.bullets) {
    const bullets = (data.bullets && data.bullets.length) ? data.bullets : [''];
    html += `<div class="bullets-label">Bullet Points</div>
      <div class="bullets-container">${bullets.map(b => bulletRowHtml(b)).join('')}</div>
      <button class="btn-add-bullet" type="button">+</button>`;
  }

  entryEl.innerHTML = `<button class="btn-remove-entry" title="Remove">✕</button>${html}`;
  entryEl.querySelector('.btn-remove-entry').addEventListener('click', () => entryEl.remove());

  if (mod.bullets) {
    entryEl.querySelector('.btn-add-bullet').addEventListener('click', () => {
      const bc = entryEl.querySelector('.bullets-container');
      const div = document.createElement('div');
      div.innerHTML = bulletRowHtml('');
      bc.appendChild(div.firstElementChild);
      bc.lastElementChild?.querySelector('.btn-remove-bullet')?.addEventListener('click', e => e.target.closest('.bullet-input-row').remove());
    });
    entryEl.querySelectorAll('.btn-remove-bullet').forEach(b => b.addEventListener('click', e => e.target.closest('.bullet-input-row').remove()));
  }

  container.appendChild(entryEl);
}

function bulletRowHtml(value) {
  return `<div class="bullet-input-row">
    <input class="input" placeholder="Bullet point…" value="${escAttr(value)}" />
    <button class="btn-remove-bullet" type="button">✕</button>
  </div>`;
}

function populateProfileForm() {
  const p = state.profile;
  Object.entries(p.personal || {}).forEach(([key, val]) => {
    const input = document.querySelector(`[data-field="personal.${key}"]`);
    if (input) input.value = val;
  });
  MODULE_CONFIG.forEach(mod => {
    const entries = p.modules[mod.key] || [];
    const container = el(`entries-${mod.key}`);
    if (!container) return;
    container.innerHTML = '';
    entries.forEach(entry => addModuleEntry(mod, container, entry));
  });
}

async function saveProfile() {
  const personal = {};
  document.querySelectorAll('[data-field^="personal."]').forEach(input => {
    personal[input.dataset.field.replace('personal.','')] = input.value.trim();
  });
  const modules = {};
  MODULE_CONFIG.forEach(mod => {
    const container = el(`entries-${mod.key}`);
    if (!container) return;
    modules[mod.key] = Array.from(container.querySelectorAll('.module-entry')).map(entry => {
      const obj = {};
      entry.querySelectorAll('[data-key]').forEach(i => { obj[i.dataset.key] = i.value.trim(); });
      if (mod.bullets) obj.bullets = Array.from(entry.querySelectorAll('.bullet-input-row input')).map(i => i.value.trim()).filter(Boolean);
      return obj;
    });
  });
  state.profile = { personal, modules };
  await chrome.storage.local.set({ profile: state.profile });
  const btn = el('btn-save-profile');
  const orig = btn.textContent;
  btn.textContent = '✓ Saved!';
  setTimeout(() => btn.textContent = orig, 1500);
}

// ─── SETTINGS TAB ─────────────────────────────────────────────────────────────
function bindSettingsTab() {
  // Template file uploads
  bindTemplateUpload('resume-tpl-upload', 'resume-tpl-name', 'resume-tpl-preview', 'resume-tpl-loaded', 'resumeTemplate');
  bindTemplateUpload('cover-tpl-upload',  'cover-tpl-name',  'cover-tpl-preview',  'cover-tpl-loaded',  'coverTemplate');

  document.querySelectorAll('.btn-clear-tpl').forEach(btn => {
    btn.addEventListener('click', async () => {
      const key = btn.dataset.tpl;
      delete state.settings[key];
      await chrome.storage.local.set({ settings: state.settings });
      const prefix = key === 'resumeTemplate' ? 'resume-tpl' : 'cover-tpl';
      el(`${prefix}-name`).textContent = 'Upload .tex file…';
      el(`${prefix}-preview`).classList.add('hidden');
    });
  });

  el('btn-save-settings').addEventListener('click', saveSettings);
}

function bindTemplateUpload(inputId, nameId, previewId, loadedId, storageKey) {
  el(inputId).addEventListener('change', async () => {
    const file = el(inputId).files[0];
    if (!file) return;
    const text = await file.text();
    state.settings[storageKey] = text;
    el(nameId).textContent = 'Upload .tex file…';
    el(loadedId).textContent = `✓ ${file.name}`;
    el(previewId).classList.remove('hidden');
  });
}

function populateSettingsForm() {
  const s = state.settings;
  setVal('s-or-key',   s.openRouterKey);
  setVal('s-or-model', s.openRouterModel || 'anthropic/claude-3.5-sonnet');
  setVal('s-gem-key',  s.geminiKey);
  setVal('s-sheets',   s.sheetsUrl);

  if (s.resumeTemplate) { el('resume-tpl-loaded').textContent = '✓ template.tex (cached)'; el('resume-tpl-preview').classList.remove('hidden'); }
  if (s.coverTemplate)  { el('cover-tpl-loaded').textContent  = '✓ template.tex (cached)'; el('cover-tpl-preview').classList.remove('hidden'); }
}

async function saveSettings() {
  state.settings = {
    ...state.settings,                          // keep templates
    openRouterKey:   el('s-or-key').value.trim(),
    openRouterModel: el('s-or-model').value.trim(),
    geminiKey:       el('s-gem-key').value.trim(),
    sheetsUrl:       el('s-sheets').value.trim(),
  };
  await chrome.storage.local.set({ settings: state.settings });
  const fb = el('settings-feedback');
  showFeedback(fb, '✓ Settings saved', 'success');
}

// ─── STORAGE TAB ─────────────────────────────────────────────────────────────
function bindStorageTab() {
  el('btn-refresh-storage').addEventListener('click', refreshStorageExplorer);
  el('btn-clear-all-storage').addEventListener('click', async () => {
    if (!confirm('Clear ALL storage? This deletes your profile, settings, and JD.')) return;
    await sendMsg({ type: 'CLEAR_ALL_STORAGE' });
    state.profile  = structuredClone(DEFAULT_PROFILE);
    state.settings = {};
    state.jd       = null;
    refreshStorageExplorer();
    refreshJDStatus();
  });
}

async function refreshStorageExplorer() {
  const res = await sendMsg({ type: 'GET_ALL_STORAGE' });
  const list = el('storage-list');
  list.innerHTML = '';
  if (!res.success || !Object.keys(res.data).length) {
    list.innerHTML = '<p class="hint-text" style="text-align:center;padding:10px 0">Storage is empty.</p>';
    return;
  }
  Object.entries(res.data).forEach(([key, value]) => {
    const str = JSON.stringify(value);
    const size = new Blob([str]).size;
    const row = document.createElement('div');
    row.className = 'storage-row';
    row.innerHTML = `
      <div class="storage-row-header">
        <span class="storage-key">${escHtml(key)}</span>
        <div class="row-gap">
          <span class="storage-size">${formatBytes(size)}</span>
          <button class="btn-delete-key" data-key="${escAttr(key)}">Delete</button>
        </div>
      </div>
      <div class="storage-preview">${escHtml(str.slice(0, 120))}${str.length > 120 ? '…' : ''}</div>`;
    row.querySelector('.btn-delete-key').addEventListener('click', async e => {
      const k = e.target.dataset.key;
      await sendMsg({ type: 'DELETE_STORAGE_KEY', key: k });
      row.remove();
    });
    list.appendChild(row);
  });
}

function formatBytes(b) {
  if (b < 1024) return `${b} B`;
  if (b < 1048576) return `${(b/1024).toFixed(1)} KB`;
  return `${(b/1048576).toFixed(2)} MB`;
}

// ─── JD Status ────────────────────────────────────────────────────────────────
function refreshJDStatus() {
  const statusEl  = el('jd-status');
  const statusTxt = el('jd-status-text');
  const preview   = el('jd-preview');
  if (state.jd) {
    statusEl.className = 'jd-status loaded';
    statusTxt.textContent = state.jd.title || state.jd.domain || 'JD loaded';
    preview.textContent = state.jd.text.slice(0, 300) + '…';
    preview.classList.remove('hidden');
  } else {
    statusEl.className = 'jd-status empty';
    statusTxt.textContent = 'No JD loaded — open a job posting and Re-scan';
    preview.classList.add('hidden');
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function el(id) { return document.getElementById(id); }
function setVal(id, val) { const e = el(id); if (e && val !== undefined) e.value = val; }

function sendMsg(msg) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(msg, res => {
      if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
      else resolve(res);
    });
  });
}

function setBtnLoading(btn, loading, label) {
  if (!btn) return;
  btn.disabled = loading;
  btn.textContent = label;
  btn.classList.toggle('loading', loading);
}

function showToast(msg, type = 'error') {
  const toast = document.createElement('div');
  const bg = type === 'success' ? '#3dd68c' : '#f06060';
  toast.style.cssText = `position:fixed;bottom:14px;left:50%;transform:translateX(-50%);background:${bg};color:#fff;padding:8px 16px;border-radius:8px;font-size:12px;z-index:9999;max-width:88%;text-align:center;box-shadow:0 4px 16px #0004;`;
  toast.textContent = msg;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 4000);
}

function showFeedback(el, msg, type) {
  el.textContent = msg;
  el.className = `feedback ${type}`;
  el.classList.remove('hidden');
  setTimeout(() => el.classList.add('hidden'), 3500);
}

function escHtml(s)  { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
function escAttr(s)  { return String(s||'').replace(/"/g,'&quot;'); }
