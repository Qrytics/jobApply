// popup.js — jobApply Chrome Extension

// ─── Tab / Side-Panel mode detection ─────────────────────────────────────────
const params      = new URLSearchParams(window.location.search);
const isTabMode   = params.get('mode') === 'tab';
const sourceTabId = params.get('sourceTab') ? parseInt(params.get('sourceTab'), 10) : null;

if (isTabMode) {
  document.body.classList.add('tab-mode');
  document.addEventListener('DOMContentLoaded', () => {
    const btn = document.getElementById('open-tab-btn');
    if (btn) btn.style.display = 'none';
  });
}

// ─── Profile fields (id → storage key) ──────────────────────────────────────
const PROFILE_FIELDS = [
  'firstName', 'lastName', 'email', 'phone',
  'address', 'addressLine2', 'city', 'state', 'zipCode',
  'jobTitle', 'company', 'yearsExp', 'salary',
  'linkedin', 'github', 'website', 'coverLetter'
];

const URL_FIELDS = ['linkedin', 'github', 'website'];

// ─── State ───────────────────────────────────────────────────────────────────
let rules = [];
let editingRuleId = null;
let modalKeywords = [];

let profileExperiences = [];
let profileProjects    = [];
let profileSkills      = [];

// ─── Scroll position persistence ─────────────────────────────────────────────
let scrollSaveTimer = null;

function saveScrollPositions() {
  const positions = {};
  document.querySelectorAll('.tab-content').forEach(el => {
    positions[el.id] = el.scrollTop;
  });
  chrome.storage.local.get('uiState').then(r => {
    const uiState = r.uiState || {};
    uiState.scrollPositions = positions;
    chrome.storage.local.set({ uiState });
  });
}

function scheduleScrollSave() {
  clearTimeout(scrollSaveTimer);
  scrollSaveTimer = setTimeout(saveScrollPositions, 300);
}

async function restoreScrollPositions() {
  const r = await chrome.storage.local.get('uiState');
  const positions = (r.uiState || {}).scrollPositions || {};
  document.querySelectorAll('.tab-content').forEach(el => {
    if (positions[el.id] !== undefined) {
      el.scrollTop = positions[el.id];
    }
  });
}

// ─── Initialise ──────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  await loadProfile();
  await loadRules();
  await restoreLastTab();
  bindTabSwitcher();
  bindProfileSave();
  bindFillButton();
  bindRuleModal();
  bindRepeatable();
  bindUrlValidators();
  initAllAutoResize();
  bindClosePanelButton();
  bindOpenTabButton();
  bindThemeToggle();
  setTimeout(restoreScrollPositions, 50);
  document.querySelectorAll('.tab-content').forEach(el => {
    el.addEventListener('scroll', scheduleScrollSave, { passive: true });
  });
});

// ─── Tabs ─────────────────────────────────────────────────────────────────────
function activateTab(tabName) {
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
  const btn = document.querySelector(`.tab-btn[data-tab="${tabName}"]`);
  const content = document.getElementById(`tab-${tabName}`);
  if (btn) btn.classList.add('active');
  if (content) content.classList.add('active');
}

function bindTabSwitcher() {
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const tabName = btn.dataset.tab;
      activateTab(tabName);
      chrome.storage.local.get('uiState').then(r => {
        const uiState = r.uiState || {};
        uiState.activeTab = tabName;
        chrome.storage.local.set({ uiState });
      });
    });
  });
}

async function restoreLastTab() {
  const r = await chrome.storage.local.get('uiState');
  const savedTab = (r.uiState || {}).activeTab;
  if (savedTab) activateTab(savedTab);
}

// ─── Close Panel / Tab ────────────────────────────────────────────────────────
function bindClosePanelButton() {
  document.getElementById('close-panel-btn')?.addEventListener('click', () => {
    window.close();
  });
}

// ─── Open in Full Tab ─────────────────────────────────────────────────────────
function bindOpenTabButton() {
  document.getElementById('open-tab-btn')?.addEventListener('click', async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const tabId = tab ? tab.id : '';
    const url = chrome.runtime.getURL(`popup.html?mode=tab&sourceTab=${tabId}`);
    chrome.tabs.create({ url });
  });
}

// ─── Theme toggle (dark / light mode) ────────────────────────────────────────
function applyTheme(isDark) {
  document.documentElement.classList.toggle('dark', isDark);
  document.body.classList.toggle('dark', isDark);
}

function bindThemeToggle() {
  const btn = document.getElementById('theme-toggle-btn');
  if (!btn) return;
  btn.addEventListener('click', async () => {
    const isDark = !document.documentElement.classList.contains('dark');
    applyTheme(isDark);
    localStorage.setItem('jobApplyTheme', isDark ? 'dark' : 'light');
    const r = await chrome.storage.local.get('uiState');
    const uiState = r.uiState || {};
    uiState.theme = isDark ? 'dark' : 'light';
    await chrome.storage.local.set({ uiState });
  });
}


function isValidUrlFormat(value) {
  if (!value) return null;
  try {
    const u = new URL(value);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

async function isUrlReachable(url) {
  try {
    // mode:'no-cors' returns an opaque response when the server replies, but throws a
    // TypeError (network/DNS error) when the domain doesn't exist — which is exactly
    // the distinction we need to detect "gibberish" domains vs real ones.
    await fetch(url, { method: 'HEAD', mode: 'no-cors', signal: AbortSignal.timeout(5000) });
    return true;
  } catch {
    return false;
  }
}

const urlCheckTimers = {};

async function updateUrlStatus(fieldId) {
  const input  = document.getElementById(fieldId);
  const status = document.getElementById(`${fieldId}-status`);
  if (!input || !status) return;

  const value = input.value.trim();

  if (!value) {
    status.textContent = '';
    status.className = 'url-status';
    return;
  }

  if (!isValidUrlFormat(value)) {
    status.textContent = '✗';
    status.className = 'url-status invalid';
    return;
  }

  status.textContent = '…';
  status.className = 'url-status checking';

  const reachable = await isUrlReachable(value);
  // Only update if the field still has the same value (user may have kept typing)
  if (input.value.trim() === value) {
    if (reachable) {
      status.textContent = '✓';
      status.className = 'url-status valid';
    } else {
      status.textContent = '✗';
      status.className = 'url-status invalid';
    }
  }
}

function scheduleUrlCheck(fieldId) {
  clearTimeout(urlCheckTimers[fieldId]);
  urlCheckTimers[fieldId] = setTimeout(() => updateUrlStatus(fieldId), 500);
}

function bindUrlValidators() {
  URL_FIELDS.forEach(id => {
    const input = document.getElementById(id);
    if (!input) return;
    input.addEventListener('input', () => scheduleUrlCheck(id));
    scheduleUrlCheck(id);
  });
}

// ─── Auto-resize textarea ─────────────────────────────────────────────────────
function initAutoResize(el) {
  el.style.overflow = 'hidden';
  el.style.resize   = 'none';
  const resize = () => {
    el.style.height = 'auto';
    el.style.height = el.scrollHeight + 'px';
  };
  el.addEventListener('input', resize);
  setTimeout(resize, 0);
}

function initAllAutoResize() {
  document.querySelectorAll('textarea').forEach(initAutoResize);
}

// ─── Profile ──────────────────────────────────────────────────────────────────
async function loadProfile() {
  const result = await chrome.storage.local.get('profile');
  const profile = result.profile || {};
  PROFILE_FIELDS.forEach(id => {
    const el = document.getElementById(id);
    if (el && profile[id] !== undefined) el.value = profile[id];
  });
  profileExperiences = profile.experiences || [];
  profileProjects    = profile.projects    || [];
  profileSkills      = profile.skills      || [];
  renderExperiences();
  renderProjects();
  renderSkills();
  URL_FIELDS.forEach(updateUrlStatus);
}

function bindProfileSave() {
  document.getElementById('profile-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const profile = {};
    PROFILE_FIELDS.forEach(id => {
      const el = document.getElementById(id);
      if (el) profile[id] = el.value.trim();
    });
    profile.experiences = collectExperiences();
    profile.projects    = collectProjects();
    profile.skills      = profileSkills.slice();
    await chrome.storage.local.set({ profile });
    showStatus('save-status', '✓ Profile saved!', 'success');
  });
}

// ─── Skills helpers ───────────────────────────────────────────────────────────
function addSkillsFromText(text) {
  const parts = text.split(',').map(s => s.trim()).filter(Boolean);
  let changed = false;
  for (const skill of parts) {
    if (skill && !profileSkills.includes(skill)) {
      profileSkills.push(skill);
      changed = true;
    }
  }
  if (changed) renderSkills();
}

// ─── Repeatable sections ──────────────────────────────────────────────────────
function bindRepeatable() {
  document.getElementById('add-experience').addEventListener('click', () => {
    profileExperiences = collectExperiences();
    profileExperiences.push({ title: '', company: '', startDate: '', endDate: '', description: '' });
    renderExperiences();
    document.getElementById('experiences-list').lastElementChild?.scrollIntoView({ behavior: 'smooth' });
  });

  document.getElementById('add-project').addEventListener('click', () => {
    profileProjects = collectProjects();
    profileProjects.push({ name: '', description: '', url: '' });
    renderProjects();
    document.getElementById('projects-list').lastElementChild?.scrollIntoView({ behavior: 'smooth' });
  });

  document.getElementById('skill-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      addSkillsFromText(e.target.value);
      e.target.value = '';
    }
  });

  document.getElementById('skill-input').addEventListener('paste', (e) => {
    const pasted = (e.clipboardData || window.clipboardData).getData('text');
    if (pasted.includes(',')) {
      e.preventDefault();
      addSkillsFromText(e.target.value + pasted);
      e.target.value = '';
    }
  });
}

// ── Experiences ───────────────────────────────────────────────────────────────
function renderExperiences() {
  const list = document.getElementById('experiences-list');
  list.innerHTML = '';
  profileExperiences.forEach((exp, i) => list.appendChild(createExperienceCard(exp, i)));
}

function createExperienceCard(exp, index) {
  const div = document.createElement('div');
  div.className = 'repeatable-item';
  div.dataset.index = index;
  div.innerHTML = `
    <div class="repeatable-item-header">
      <span class="repeatable-item-label">Experience ${index + 1}</span>
      <button type="button" class="btn-remove-item" title="Remove">✕</button>
    </div>
    <div class="form-row two-col">
      <div class="form-group">
        <label>Job Title</label>
        <input type="text" data-field="title" value="${escHtml(exp.title || '')}" placeholder="Software Engineer" />
      </div>
      <div class="form-group">
        <label>Company</label>
        <input type="text" data-field="company" value="${escHtml(exp.company || '')}" placeholder="Acme Corp" />
      </div>
    </div>
    <div class="form-row two-col">
      <div class="form-group">
        <label>Start Date</label>
        <input type="text" data-field="startDate" value="${escHtml(exp.startDate || '')}" placeholder="Jan 2021" />
      </div>
      <div class="form-group">
        <label>End Date</label>
        <input type="text" data-field="endDate" value="${escHtml(exp.endDate || '')}" placeholder="Present" />
      </div>
    </div>
    <div class="form-group">
      <label>Description</label>
      <textarea data-field="description" placeholder="Key responsibilities…">${escHtml(exp.description || '')}</textarea>
    </div>
  `;
  div.querySelector('.btn-remove-item').addEventListener('click', () => {
    profileExperiences.splice(index, 1);
    renderExperiences();
  });
  div.querySelectorAll('textarea').forEach(initAutoResize);
  return div;
}

function collectExperiences() {
  return Array.from(document.querySelectorAll('#experiences-list .repeatable-item')).map(item => ({
    title:       item.querySelector('[data-field="title"]')?.value.trim()       || '',
    company:     item.querySelector('[data-field="company"]')?.value.trim()     || '',
    startDate:   item.querySelector('[data-field="startDate"]')?.value.trim()   || '',
    endDate:     item.querySelector('[data-field="endDate"]')?.value.trim()     || '',
    description: item.querySelector('[data-field="description"]')?.value.trim() || '',
  }));
}

// ── Projects ──────────────────────────────────────────────────────────────────
function renderProjects() {
  const list = document.getElementById('projects-list');
  list.innerHTML = '';
  profileProjects.forEach((proj, i) => list.appendChild(createProjectCard(proj, i)));
}

function createProjectCard(proj, index) {
  const div = document.createElement('div');
  div.className = 'repeatable-item';
  div.dataset.index = index;
  div.innerHTML = `
    <div class="repeatable-item-header">
      <span class="repeatable-item-label">Project ${index + 1}</span>
      <button type="button" class="btn-remove-item" title="Remove">✕</button>
    </div>
    <div class="form-group">
      <label>Project Name</label>
      <input type="text" data-field="name" value="${escHtml(proj.name || '')}" placeholder="My Awesome App" />
    </div>
    <div class="form-group">
      <label>Description</label>
      <textarea data-field="description" placeholder="What the project does…">${escHtml(proj.description || '')}</textarea>
    </div>
    <div class="form-group">
      <label>URL</label>
      <input type="url" data-field="url" value="${escHtml(proj.url || '')}" placeholder="https://github.com/you/project" />
    </div>
  `;
  div.querySelector('.btn-remove-item').addEventListener('click', () => {
    profileProjects.splice(index, 1);
    renderProjects();
  });
  div.querySelectorAll('textarea').forEach(initAutoResize);
  return div;
}

function collectProjects() {
  return Array.from(document.querySelectorAll('#projects-list .repeatable-item')).map(item => ({
    name:        item.querySelector('[data-field="name"]')?.value.trim()        || '',
    description: item.querySelector('[data-field="description"]')?.value.trim() || '',
    url:         item.querySelector('[data-field="url"]')?.value.trim()         || '',
  }));
}

// ── Skills ────────────────────────────────────────────────────────────────────
function renderSkills() {
  const container = document.getElementById('skills-tags');
  container.innerHTML = '';
  profileSkills.forEach((skill, i) => {
    const tag = document.createElement('span');
    tag.className = 'tag';
    tag.innerHTML = `${escHtml(skill)} <button type="button" class="tag-remove" title="Remove">✕</button>`;
    tag.querySelector('.tag-remove').addEventListener('click', () => {
      profileSkills.splice(i, 1);
      renderSkills();
    });
    container.appendChild(tag);
  });
}

// ─── Rules ────────────────────────────────────────────────────────────────────
async function loadRules() {
  const result = await chrome.storage.local.get('rules');
  // Migrate old { keyword } format to new { keywords: [] }
  rules = (result.rules || []).map(r => ({
    ...r,
    keywords: r.keywords || (r.keyword ? [r.keyword] : []),
  }));
  renderRules();
}

async function saveRules() {
  await chrome.storage.local.set({ rules });
}

function renderRules() {
  const list = document.getElementById('rules-list');
  list.innerHTML = '';

  if (rules.length === 0) {
    list.innerHTML = '<div class="empty-rules">No custom rules yet. Add one below!</div>';
    return;
  }

  rules.forEach(rule => {
    const kws = rule.keywords || (rule.keyword ? [rule.keyword] : []);
    const card = document.createElement('div');
    card.className = 'rule-card';
    card.innerHTML = `
      <div class="rule-card-body">
        <div class="rule-keywords">${kws.map(k => `<span class="rule-keyword-tag">"${escHtml(k)}"</span>`).join('')}</div>
        <div class="rule-value">→ ${escHtml(rule.value)}</div>
        <span class="rule-match-badge">${matchTypeLabel(rule.matchType)}</span>
      </div>
      <div class="rule-actions">
        <button class="rule-btn edit" data-id="${rule.id}" title="Edit">✏️</button>
        <button class="rule-btn delete" data-id="${rule.id}" title="Delete">🗑️</button>
      </div>
    `;
    list.appendChild(card);
  });

  list.querySelectorAll('.rule-btn.edit').forEach(btn => {
    btn.addEventListener('click', () => openEditModal(btn.dataset.id));
  });

  list.querySelectorAll('.rule-btn.delete').forEach(btn => {
    btn.addEventListener('click', () => deleteRule(btn.dataset.id));
  });
}

function matchTypeLabel(type) {
  return { contains: 'Contains', exact: 'Exact', startsWith: 'Starts with' }[type] || type;
}

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

async function deleteRule(id) {
  rules = rules.filter(r => r.id !== id);
  await saveRules();
  renderRules();
}

// ─── Rule Modal ───────────────────────────────────────────────────────────────
function renderModalKeywords() {
  const container = document.getElementById('rule-keywords-tags');
  if (!container) return;
  container.innerHTML = '';
  modalKeywords.forEach((kw, i) => {
    const tag = document.createElement('span');
    tag.className = 'tag';
    tag.innerHTML = `${escHtml(kw)} <button type="button" class="tag-remove" title="Remove">✕</button>`;
    tag.querySelector('.tag-remove').addEventListener('click', () => {
      modalKeywords.splice(i, 1);
      renderModalKeywords();
    });
    container.appendChild(tag);
  });
}

function bindRuleModal() {
  document.getElementById('add-rule-btn').addEventListener('click', () => openAddModal());
  document.getElementById('modal-cancel').addEventListener('click', closeModal);
  document.getElementById('modal-save').addEventListener('click', saveModalRule);

  document.getElementById('rule-keyword-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      const kw = e.target.value.trim().replace(/,+$/, '');
      if (kw && !modalKeywords.includes(kw)) {
        modalKeywords.push(kw);
        renderModalKeywords();
      }
      e.target.value = '';
    }
  });
}

function openAddModal() {
  editingRuleId = null;
  modalKeywords = [];
  renderModalKeywords();
  document.getElementById('modal-title').textContent = 'Add Rule';
  document.getElementById('rule-keyword-input').value = '';
  document.getElementById('rule-value').value = '';
  document.getElementById('rule-match').value = 'contains';
  document.getElementById('rule-modal').classList.remove('hidden');
  document.getElementById('rule-keyword-input').focus();
}

function openEditModal(id) {
  const rule = rules.find(r => r.id === id);
  if (!rule) return;
  editingRuleId = id;
  modalKeywords = [...(rule.keywords || (rule.keyword ? [rule.keyword] : []))];
  renderModalKeywords();
  document.getElementById('modal-title').textContent = 'Edit Rule';
  document.getElementById('rule-keyword-input').value = '';
  document.getElementById('rule-value').value = rule.value;
  document.getElementById('rule-match').value = rule.matchType;
  document.getElementById('rule-modal').classList.remove('hidden');
  document.getElementById('rule-keyword-input').focus();
}

function closeModal() {
  document.getElementById('rule-modal').classList.add('hidden');
  editingRuleId = null;
}

async function saveModalRule() {
  // Commit any text still in the input field
  const kwInput = document.getElementById('rule-keyword-input');
  const pending = kwInput ? kwInput.value.trim().replace(/,$/, '') : '';
  if (pending && !modalKeywords.includes(pending)) {
    modalKeywords.push(pending);
    if (kwInput) kwInput.value = '';
    renderModalKeywords();
  }

  if (!modalKeywords.length) {
    document.getElementById('rule-keyword-input')?.focus();
    return;
  }

  const value     = document.getElementById('rule-value').value.trim();
  const matchType = document.getElementById('rule-match').value;

  if (editingRuleId) {
    const rule = rules.find(r => r.id === editingRuleId);
    if (rule) {
      rule.keywords  = [...modalKeywords];
      rule.value     = value;
      rule.matchType = matchType;
    }
  } else {
    rules.push({ id: crypto.randomUUID(), keywords: [...modalKeywords], value, matchType });
  }

  await saveRules();
  renderRules();
  closeModal();
}

// ─── Fill Button ──────────────────────────────────────────────────────────────
function bindFillButton() {
  document.getElementById('fill-btn').addEventListener('click', async () => {
    const statusEl = document.getElementById('fill-status');
    statusEl.textContent = '';
    statusEl.className = 'fill-status';

    const result = await chrome.storage.local.get(['profile', 'rules']);
    const profile     = result.profile || {};
    const customRules = result.rules   || [];

    let tabId;
    if (isTabMode && sourceTabId) {
      tabId = sourceTabId;
    } else {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab || !tab.id) {
        showFillStatus('Could not access the current tab.', 'error');
        return;
      }
      tabId = tab.id;
    }

    try {
      const [{ result: count }] = await chrome.scripting.executeScript({
        target: { tabId },
        func: fillFields,
        args: [profile, customRules]
      });

      if (count === 0) {
        showFillStatus('No matching fields found on this page.', 'error');
      } else {
        showFillStatus(`✓ Filled ${count} field${count !== 1 ? 's' : ''}!`, 'success');
      }
    } catch (err) {
      showFillStatus(`Error: ${err.message}`, 'error');
    }
  });
}

function showFillStatus(msg, type) {
  const el = document.getElementById('fill-status');
  el.textContent = msg;
  el.className = `fill-status ${type}`;
}

function showStatus(elId, msg) {
  const el = document.getElementById(elId);
  el.textContent = msg;
  setTimeout(() => { el.textContent = ''; }, 2500);
}

// ─── Content Function (injected into the page) ────────────────────────────────
/**
 * Runs inside the target page context.
 * Scans all interactive fields, matches labels/placeholders/names against
 * the user's profile and custom rules, and fills matching fields.
 *
 * Enhanced support for: Workday, Greenhouse, Lever, iCIMS, Taleo, ADP,
 * React/Vue/Angular controlled inputs, autocomplete/combobox widgets,
 * native selects, and repeating sections (experiences/projects/skills).
 *
 * @param {object} profile     - User profile from storage
 * @param {Array}  customRules - User-defined keyword rules
 * @returns {Promise<number>} count of fields filled
 */
async function fillFields(profile, customRules) {

  // ── Timing constants (ms) ──────────────────────────────────────────────────
  const AUTOCOMPLETE_DROPDOWN_DELAY  = 500;
  const AUTOCOMPLETE_CLICK_DELAY     = 100;
  const AUTOCOMPLETE_DISMISS_DELAY   = 150;
  const SKILL_ADD_DELAY              = 400;
  const REPEATING_SECTION_ADD_DELAY  = 600;

  // ── State lookup tables ────────────────────────────────────────────────────
  const STATE_TO_ABBR = {
    'alabama':'AL','alaska':'AK','arizona':'AZ','arkansas':'AR','california':'CA',
    'colorado':'CO','connecticut':'CT','delaware':'DE','florida':'FL','georgia':'GA',
    'hawaii':'HI','idaho':'ID','illinois':'IL','indiana':'IN','iowa':'IA',
    'kansas':'KS','kentucky':'KY','louisiana':'LA','maine':'ME','maryland':'MD',
    'massachusetts':'MA','michigan':'MI','minnesota':'MN','mississippi':'MS',
    'missouri':'MO','montana':'MT','nebraska':'NE','nevada':'NV','new hampshire':'NH',
    'new jersey':'NJ','new mexico':'NM','new york':'NY','north carolina':'NC',
    'north dakota':'ND','ohio':'OH','oklahoma':'OK','oregon':'OR','pennsylvania':'PA',
    'rhode island':'RI','south carolina':'SC','south dakota':'SD','tennessee':'TN',
    'texas':'TX','utah':'UT','vermont':'VT','virginia':'VA','washington':'WA',
    'west virginia':'WV','wisconsin':'WI','wyoming':'WY','district of columbia':'DC',
    'puerto rico':'PR','guam':'GU','virgin islands':'VI',
  };
  const ABBR_TO_STATE = Object.fromEntries(
    Object.entries(STATE_TO_ABBR).map(([full, abbr]) => [
      abbr,
      full.replace(/\b\w/g, c => c.toUpperCase()),
    ])
  );

  function stateVariants(val) {
    const lo = val.toLowerCase().trim();
    const up = val.toUpperCase().trim();
    if (STATE_TO_ABBR[lo]) return [STATE_TO_ABBR[lo], val];
    if (ABBR_TO_STATE[up]) return [val, ABBR_TO_STATE[up]];
    return [val];
  }

  // ── Phone normalization & variants ─────────────────────────────────────────
  // Produces common US phone format strings to try when filling a phone field.
  const PHONE_AREA = 3, PHONE_EXCHANGE = 6; // digit slice indices for 10-digit number

  function phoneVariants(raw) {
    if (!raw) return [];
    const digits = raw.replace(/\D/g, '');
    // Normalise to 10 digits (strip leading country code 1 from 11-digit US numbers)
    let d = null;
    if (digits.length === 10) {
      d = digits;
    } else if (digits.length === 11 && digits[0] === '1') {
      d = digits.slice(1);
    }
    if (!d) return [raw]; // unrecognised length – return original only
    const area     = d.slice(0, PHONE_AREA);
    const exchange = d.slice(PHONE_AREA, PHONE_EXCHANGE);
    const line     = d.slice(PHONE_EXCHANGE);
    return [...new Set([
      raw,
      `(${area}) ${exchange}-${line}`,
      `${area}-${exchange}-${line}`,
      `${area}.${exchange}.${line}`,
      `+1 (${area}) ${exchange}-${line}`,
      `+1${d}`,
      `+1 ${area} ${exchange} ${line}`,
      d,
    ])];
  }

  function isPhoneField(el) {
    if (el.type === 'tel') return true;
    const text = getFieldText(el);
    return /\bphone\b|\btelephone\b|\bmobile\b|\bcell\b/.test(text);
  }

  // ── Default keyword map ────────────────────────────────────────────────────
  const DEFAULT_RULES = [
    { keywords: ['first name','firstname','given name','first_name','fname','legal first name'], value: profile.firstName },
    { keywords: ['last name','lastname','surname','family name','last_name','lname','legal last name'], value: profile.lastName },
    { keywords: ['full name','fullname','your name','legal name','applicant name'], value: `${profile.firstName || ''} ${profile.lastName || ''}`.trim() },
    { keywords: ['email','e-mail','email address','work email'], value: profile.email },
    { keywords: ['phone','telephone','mobile','cell','contact number','phone number','work phone'], value: profile.phone },
    { keywords: ['street address','address line 1','address line1','address 1','mailing address','home address','street'], value: profile.address },
    { keywords: ['address line 2','address2','apt','suite','unit','apartment','floor','address line2'], value: profile.addressLine2 },
    { keywords: ['city','town','municipality'], value: profile.city },
    { keywords: ['state','province','region'], value: profile.state },
    { keywords: ['zip','postal','post code','postcode','zipcode','zip code'], value: profile.zipCode },
    { keywords: ['job title','position','title','role','desired position','applying for','desired role'], value: profile.jobTitle },
    { keywords: ['current company','employer','current employer','company name','organization','organisation'], value: profile.company },
    { keywords: ['years of experience','years experience','experience years','how many years','total experience'], value: profile.yearsExp },
    { keywords: ['salary','expected salary','desired salary','compensation','pay','wage'], value: profile.salary },
    { keywords: ['linkedin','linkedin url','linkedin profile'], value: profile.linkedin },
    { keywords: ['github','github url','github profile'], value: profile.github },
    { keywords: ['website','portfolio','personal site','personal website','personal url','portfolio url'], value: profile.website },
    { keywords: ['cover letter','coverletter','covering letter','letter of interest'], value: profile.coverLetter },
  ];

  const allRules = [];
  DEFAULT_RULES.forEach(rule => {
    if (!rule.value) return;
    rule.keywords.forEach(kw => {
      allRules.push({ keyword: kw, value: rule.value, matchType: 'contains' });
    });
  });

  // Support both old ({ keyword }) and new ({ keywords }) custom rule formats
  (customRules || []).forEach(rule => {
    const kws = rule.keywords || (rule.keyword ? [rule.keyword] : []);
    kws.forEach(kw => {
      if (kw && rule.value) {
        allRules.push({ keyword: kw.toLowerCase(), value: rule.value, matchType: rule.matchType || 'contains' });
      }
    });
  });

  // ── Helper: get label/context text for a field ─────────────────────────────
  function getFieldText(el) {
    const parts = [];

    if (el.placeholder) parts.push(el.placeholder);
    if (el.name)  parts.push(el.name.replace(/[_\-]/g, ' '));
    if (el.id)    parts.push(el.id.replace(/[_\-]/g, ' '));
    if (el.title) parts.push(el.title);

    const ariaLabel = el.getAttribute('aria-label');
    if (ariaLabel) parts.push(ariaLabel);

    // Workday: data-automation-id
    const autoId = el.getAttribute('data-automation-id');
    if (autoId) parts.push(autoId.replace(/[_\-]/g, ' '));

    // iCIMS / Taleo / ADP: various data attributes
    ['data-label','data-name','data-field-name','data-field-label'].forEach(attr => {
      const v = el.getAttribute(attr);
      if (v) parts.push(v);
    });

    // Linked <label for="id">
    if (el.id) {
      try {
        const labelEl = document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
        if (labelEl) parts.push(labelEl.textContent);
      } catch { /* CSS.escape may throw for unusual id values; safe to skip */ }
    }

    // Wrap <label>
    const parentLabel = el.closest('label');
    if (parentLabel) parts.push(parentLabel.textContent);

    // Sibling label in the same direct parent
    const parent = el.parentElement;
    if (parent) {
      const prevLabel = parent.querySelector('label, .label, [class*="label"]');
      if (prevLabel) parts.push(prevLabel.textContent);
    }

    // Walk up to MAX_ANCESTOR_DEPTH levels to find a containing form-group /
    // fieldset label. Depth of 4 covers most framework DOM nesting patterns
    // (e.g. input → div → form-group → form-section → fieldset).
    const MAX_ANCESTOR_DEPTH = 4;
    let ancestor = el.parentElement;
    for (let depth = 0; depth < MAX_ANCESTOR_DEPTH && ancestor; depth++, ancestor = ancestor.parentElement) {
      const labelledBy = ancestor.getAttribute('aria-labelledby');
      if (labelledBy) {
        const lbEl = document.getElementById(labelledBy);
        if (lbEl) { parts.push(lbEl.textContent); break; }
      }
      if (/form.?group|form.?field|form.?row|field.?container|input.?wrapper/i.test(ancestor.className || '')) {
        const lbl = ancestor.querySelector('label, [class*="label"], legend, [class*="title"]');
        if (lbl) { parts.push(lbl.textContent); break; }
      }
    }

    return parts.join(' ').toLowerCase().trim();
  }

  function matchesRule(fieldText, rule) {
    const kw = rule.keyword.toLowerCase();
    switch (rule.matchType) {
      case 'exact':      return fieldText === kw;
      case 'startsWith': return fieldText.startsWith(kw);
      case 'contains':
      default:           return fieldText.includes(kw);
    }
  }

  function findValue(el) {
    const fieldText = getFieldText(el);
    if (!fieldText) return null;
    for (let i = allRules.length - 1; i >= 0; i--) {
      if (matchesRule(fieldText, allRules[i])) return allRules[i].value;
    }
    return null;
  }

  function isStateEl(el) {
    return /\bstate\b|\bprovince\b|\bregion\b/.test(getFieldText(el));
  }

  // ── Helper: set value + fire React/Vue/Angular synthetic events ────────────
  function setValue(el, value) {
    const tag    = el.tagName;
    const proto  = tag === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, 'value');
    if (setter && setter.set) setter.set.call(el, value);
    else el.value = value;
    el.dispatchEvent(new Event('input',  { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    // Workday / Angular also listen for blur
    el.dispatchEvent(new FocusEvent('blur', { bubbles: true }));
  }

  // ── Fill a native <select> ─────────────────────────────────────────────────
  function fillSelect(el, value) {
    const variants = isStateEl(el) ? stateVariants(value) : [value];
    for (const v of variants) {
      const lo  = v.toLowerCase().trim();
      const opt = Array.from(el.options).find(
        o => o.text.trim().toLowerCase() === lo || o.value.trim().toLowerCase() === lo
      );
      if (opt) {
        el.value = opt.value;
        el.dispatchEvent(new Event('change', { bubbles: true }));
        return true;
      }
    }
    return false;
  }

  // ── Find the visible dropdown/listbox for an autocomplete ──────────────────
  function findVisibleDropdown(el) {
    for (const attr of ['aria-controls', 'aria-owns', 'list']) {
      const id = el.getAttribute(attr);
      if (id) {
        const linked = document.getElementById(id);
        if (linked) return linked;
      }
    }
    const candidates = document.querySelectorAll(
      '[role="listbox"], [role="menu"], .dropdown, .suggestions, ' +
      '.autocomplete-results, [class*="dropdown"], [class*="suggestion"]'
    );
    for (const c of candidates) {
      const r = c.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) return c;
    }
    return null;
  }

  // ── Fill an autocomplete/combobox input ────────────────────────────────────
  async function fillAutocomplete(el, rawValue) {
    const variants = isStateEl(el) ? stateVariants(rawValue) : [rawValue];

    for (const value of variants) {
      setValue(el, value);
      el.focus();
      el.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'ArrowDown' }));
      el.dispatchEvent(new Event('input', { bubbles: true }));

      await new Promise(r => setTimeout(r, AUTOCOMPLETE_DROPDOWN_DELAY));

      const dropdown = findVisibleDropdown(el);
      if (!dropdown) return true;

      const lo     = value.toLowerCase();
      const optEls = dropdown.querySelectorAll('[role="option"], li, .item, [class*="option"]');
      const match  = Array.from(optEls).find(o => {
        const t = o.textContent.trim().toLowerCase();
        return t === lo || t.startsWith(lo) || t.includes(lo);
      });

      if (match) {
        match.click();
        await new Promise(r => setTimeout(r, AUTOCOMPLETE_CLICK_DELAY));
        return true;
      }

      setValue(el, '');
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      await new Promise(r => setTimeout(r, AUTOCOMPLETE_DISMISS_DELAY));
    }
    return false;
  }

  function isAutocomplete(el) {
    return el.getAttribute('role') === 'combobox' ||
           el.getAttribute('aria-autocomplete') === 'list' ||
           el.getAttribute('aria-autocomplete') === 'both';
  }

  // ── Fill a phone field, trying multiple number formats ─────────────────────
  async function fillPhone(el, rawPhone) {
    const variants = phoneVariants(rawPhone);
    for (const fmt of variants) {
      setValue(el, fmt);
      // Accept the format if the field reports validity (or doesn't support it)
      if (el.validity && el.validity.valid) return true;
    }
    // No format passed validity – fall back to the original stored value
    setValue(el, rawPhone);
    return true;
  }

  // ── Fill one element ───────────────────────────────────────────────────────
  async function fillOne(el, value) {
    if (!value || el.disabled || el.readOnly) return false;
    if (el.tagName === 'SELECT')  return fillSelect(el, value);
    if (isAutocomplete(el))       return await fillAutocomplete(el, value);
    if (isPhoneField(el))         return await fillPhone(el, value);
    const v = isStateEl(el) ? stateVariants(value)[0] : value;
    setValue(el, v);
    return true;
  }

  // ── Scan & fill all standard fields ───────────────────────────────────────
  let filledCount = 0;
  const FILLABLE =
    'input:not([type="hidden"]):not([type="submit"]):not([type="button"])' +
    ':not([type="reset"]):not([type="file"]):not([type="checkbox"]):not([type="radio"])';
  const allEls = [
    ...document.querySelectorAll(FILLABLE),
    ...document.querySelectorAll('textarea'),
    ...document.querySelectorAll('select'),
  ];
  for (const el of allEls) {
    const value = findValue(el);
    if (value && await fillOne(el, value)) filledCount++;
  }

  // ── Repeating sections (experiences, projects, skills) ─────────────────────
  const experiences = profile.experiences || [];
  const projects    = profile.projects    || [];
  const skills      = profile.skills      || [];

  const REPEAT_DEFS = [
    {
      items:       experiences,
      btnKeywords: ['experience', 'employment', 'work history', 'job'],
      fieldMap: {
        title:       /\b(title|position|role)\b/i,
        company:     /\b(company|employer|organization|organisation)\b/i,
        startDate:   /\bstart\b|\bfrom\b|\bbegin/i,
        endDate:     /\bend\b|\bto\b|\buntil\b|\bthrough\b|\bcurrent/i,
        description: /\b(description|responsibilities|duties|summary|detail)\b/i,
      },
    },
    {
      items:       projects,
      btnKeywords: ['project'],
      fieldMap: {
        name:        /\b(project\s*name|name)\b/i,
        description: /\b(description|summary|detail)\b/i,
        url:         /\b(url|link|website)\b/i,
      },
    },
    {
      items:       skills,
      btnKeywords: ['skill'],
      fieldMap:    null,
    },
  ];

  // ── Find the "Add" / "Add Another" button for a repeating section ────────
  function getSectionHeadingText(el) {
    // Walk up ancestors (up to 8 levels) looking for a heading element
    // that describes the section this element belongs to.
    let node = el.parentElement;
    for (let d = 0; d < 8 && node; d++, node = node.parentElement) {
      // Direct child headings
      const headings = node.querySelectorAll(
        ':scope > h1, :scope > h2, :scope > h3, :scope > h4, :scope > h5, :scope > h6,' +
        ':scope > [class*="heading"], :scope > [class*="title"], :scope > [class*="section-header"],' +
        ':scope > legend'
      );
      for (const h of headings) {
        const t = h.textContent.trim();
        if (t) return t.toLowerCase();
      }
      // aria-labelledby on the ancestor
      const labelledBy = node.getAttribute('aria-labelledby');
      if (labelledBy) {
        const labelEl = document.getElementById(labelledBy);
        if (labelEl) return labelEl.textContent.trim().toLowerCase();
      }
    }
    return '';
  }

  function findAddButton(keywords) {
    const allBtns = document.querySelectorAll('button, [role="button"], a[role="button"]');

    // Strategy 1: button text contains both "add" and a section keyword
    const byText = Array.from(allBtns).find(btn => {
      const text = (btn.textContent || btn.getAttribute('aria-label') || '').trim().toLowerCase();
      return /\badd\b/.test(text) && keywords.some(kw => text.includes(kw));
    });
    if (byText) return byText;

    // Strategy 2: Workday — data-automation-id="add-button" whose ancestor
    // section heading matches one of the keywords.
    const wdBtns = document.querySelectorAll('[data-automation-id="add-button"]');
    for (const btn of wdBtns) {
      const headingText = getSectionHeadingText(btn);
      if (headingText && keywords.some(kw => headingText.includes(kw))) return btn;
    }

    // Strategy 3: generic "Add" / "Add Another" button (no keyword in its own
    // text) whose nearest section heading matches a keyword.
    const addOnlyBtns = Array.from(allBtns).filter(btn => {
      const text = (btn.textContent || btn.getAttribute('aria-label') || '').trim().toLowerCase();
      return /^\s*add(\s+another)?\s*$/i.test(text);
    });
    for (const btn of addOnlyBtns) {
      const headingText = getSectionHeadingText(btn);
      if (headingText && keywords.some(kw => headingText.includes(kw))) return btn;
    }

    return null;
  }

  // ── Find existing repeating entry groups relative to the add button ────────
  function findExistingGroups(addBtn) {
    // Walk up until we find a container that holds entry groups with fields.
    let container = addBtn.parentElement;
    for (let depth = 0; depth < 6 && container; depth++, container = container.parentElement) {
      // Direct children that are not the button itself and contain fields
      const byFields = Array.from(container.querySelectorAll(':scope > *')).filter(
        c => !c.contains(addBtn) && countFields(c) >= 1
      );
      if (byFields.length) return { groups: byFields, container };

      // Children that contain a "Delete" / "Remove" button (Workday pattern)
      const withDelete = Array.from(container.querySelectorAll(':scope > *')).filter(c => {
        if (c.contains(addBtn)) return false;
        return Array.from(c.querySelectorAll('button, [role="button"]')).some(
          b => /\bdelete\b|\bremove\b/i.test(b.textContent || b.getAttribute('aria-label') || '')
        );
      });
      if (withDelete.length) return { groups: withDelete, container };
    }
    return { groups: [], container: addBtn.parentElement };
  }

  function countFields(container) {
    return container.querySelectorAll(
      'input:not([type="hidden"]):not([type="submit"]):not([type="button"])' +
      ':not([type="reset"]):not([type="file"]):not([type="checkbox"]):not([type="radio"]), textarea, select'
    ).length;
  }

  async function fillGroup(container, item, fieldMap) {
    const fields = container.querySelectorAll(
      'input:not([type="hidden"]):not([type="submit"]):not([type="button"])' +
      ':not([type="reset"]):not([type="file"]):not([type="checkbox"]):not([type="radio"]), textarea, select'
    );
    for (const el of fields) {
      if (el.disabled || el.readOnly) continue;
      const ft = getFieldText(el);
      for (const [prop, regex] of Object.entries(fieldMap)) {
        if (regex.test(ft) && item[prop]) {
          if (await fillOne(el, item[prop])) filledCount++;
          break;
        }
      }
    }
  }

  for (const def of REPEAT_DEFS) {
    if (!def.items.length) continue;

    const addBtn = findAddButton(def.btnKeywords);
    if (!addBtn) continue;

    const isSkills = def.fieldMap === null;

    if (isSkills) {
      // Workday skills: a multi-select combobox where you type each skill.
      // First try to find a dedicated skills input; fall back to any visible
      // combobox/input near the Add button.
      const skillInputCandidates = [
        ...document.querySelectorAll(
          'input[data-automation-id="skills"], input[data-automation-id*="skill" i],' +
          'input[class*="skill" i], input[id*="skill" i], input[name*="skill" i],' +
          'input[placeholder*="skill" i]'
        ),
        ...Array.from(document.querySelectorAll('input[role="combobox"], input[aria-autocomplete]')).filter(
          el => /skill/i.test(getSectionHeadingText(el))
        ),
      ];

      for (let i = 0; i < def.items.length; i++) {
        // Pick the first visible, enabled skill input each iteration (the
        // active tag-entry field in Workday re-renders after each selection).
        const input = skillInputCandidates.find(
          el => !el.disabled && !el.readOnly && el.offsetParent !== null
        ) ?? null;
        if (input) {
          if (await fillOne(input, def.items[i])) filledCount++;
          await new Promise(r => setTimeout(r, SKILL_ADD_DELAY));
        }
      }
    } else {
      let { groups: existingGroups, container } = findExistingGroups(addBtn);

      if (existingGroups.length > 0 && def.items[0]) {
        await fillGroup(existingGroups[0], def.items[0], def.fieldMap);
      }

      for (let i = 1; i < def.items.length; i++) {
        addBtn.click();
        await new Promise(r => setTimeout(r, REPEATING_SECTION_ADD_DELAY));

        // Re-discover groups from the same container after the click
        const { groups: afterGroups } = findExistingGroups(addBtn);
        if (afterGroups.length > existingGroups.length) {
          const newGroup = afterGroups[afterGroups.length - 1];
          await fillGroup(newGroup, def.items[i], def.fieldMap);
          existingGroups = afterGroups;
        }
      }
    }
  }

  return filledCount;
}
