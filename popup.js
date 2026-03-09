// popup.js — jobApply Chrome Extension

// ─── Profile fields (id → storage key) ──────────────────────────────────────
const PROFILE_FIELDS = [
  'firstName', 'lastName', 'email', 'phone',
  'address', 'city', 'state', 'zipCode',
  'jobTitle', 'company', 'yearsExp', 'salary',
  'linkedin', 'github', 'website', 'coverLetter'
];

// ─── State ───────────────────────────────────────────────────────────────────
let rules = [];          // array of { id, keyword, value, matchType }
let editingRuleId = null;

// ─── Initialise ──────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  await loadProfile();
  await loadRules();
  bindTabSwitcher();
  bindProfileSave();
  bindFillButton();
  bindRuleModal();
});

// ─── Tabs ────────────────────────────────────────────────────────────────────
function bindTabSwitcher() {
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById(`tab-${btn.dataset.tab}`).classList.add('active');
    });
  });
}

// ─── Profile ─────────────────────────────────────────────────────────────────
async function loadProfile() {
  const result = await chrome.storage.local.get('profile');
  const profile = result.profile || {};
  PROFILE_FIELDS.forEach(id => {
    const el = document.getElementById(id);
    if (el && profile[id] !== undefined) el.value = profile[id];
  });
}

function bindProfileSave() {
  document.getElementById('profile-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const profile = {};
    PROFILE_FIELDS.forEach(id => {
      const el = document.getElementById(id);
      if (el) profile[id] = el.value.trim();
    });
    await chrome.storage.local.set({ profile });
    showStatus('save-status', '✓ Profile saved!', 'success');
  });
}

// ─── Rules ───────────────────────────────────────────────────────────────────
async function loadRules() {
  const result = await chrome.storage.local.get('rules');
  rules = result.rules || [];
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
    const card = document.createElement('div');
    card.className = 'rule-card';
    card.innerHTML = `
      <div class="rule-card-body">
        <div class="rule-keyword">"${escHtml(rule.keyword)}"</div>
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
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

async function deleteRule(id) {
  rules = rules.filter(r => r.id !== id);
  await saveRules();
  renderRules();
}

// ─── Rule Modal ───────────────────────────────────────────────────────────────
function bindRuleModal() {
  document.getElementById('add-rule-btn').addEventListener('click', () => openAddModal());
  document.getElementById('modal-cancel').addEventListener('click', closeModal);
  document.getElementById('modal-save').addEventListener('click', saveModalRule);
  document.getElementById('rule-modal').addEventListener('click', (e) => {
    if (e.target === e.currentTarget) closeModal();
  });
}

function openAddModal() {
  editingRuleId = null;
  document.getElementById('modal-title').textContent = 'Add Rule';
  document.getElementById('rule-keyword').value = '';
  document.getElementById('rule-value').value = '';
  document.getElementById('rule-match').value = 'contains';
  document.getElementById('rule-modal').classList.remove('hidden');
  document.getElementById('rule-keyword').focus();
}

function openEditModal(id) {
  const rule = rules.find(r => r.id === id);
  if (!rule) return;
  editingRuleId = id;
  document.getElementById('modal-title').textContent = 'Edit Rule';
  document.getElementById('rule-keyword').value = rule.keyword;
  document.getElementById('rule-value').value = rule.value;
  document.getElementById('rule-match').value = rule.matchType;
  document.getElementById('rule-modal').classList.remove('hidden');
  document.getElementById('rule-keyword').focus();
}

function closeModal() {
  document.getElementById('rule-modal').classList.add('hidden');
  editingRuleId = null;
}

async function saveModalRule() {
  const keyword = document.getElementById('rule-keyword').value.trim();
  const value = document.getElementById('rule-value').value.trim();
  const matchType = document.getElementById('rule-match').value;

  if (!keyword) {
    document.getElementById('rule-keyword').focus();
    return;
  }

  if (editingRuleId) {
    const rule = rules.find(r => r.id === editingRuleId);
    if (rule) { rule.keyword = keyword; rule.value = value; rule.matchType = matchType; }
  } else {
    rules.push({ id: crypto.randomUUID(), keyword, value, matchType });
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

    // Gather profile + rules to pass into content script
    const result = await chrome.storage.local.get(['profile', 'rules']);
    const profile = result.profile || {};
    const customRules = result.rules || [];

    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || !tab.id) {
      showFillStatus('Could not access the current tab.', 'error');
      return;
    }

    try {
      const [{ result: count }] = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
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
 * This function runs inside the target page context.
 * It scans all interactive fields, matches labels/placeholders/names against
 * the user's profile and custom rules, and fills matching fields.
 *
 * @param {object} profile  - User profile from storage
 * @param {Array}  customRules - User-defined keyword rules
 * @returns {number} count of fields filled
 */
function fillFields(profile, customRules) {
  // ── Default keyword map ──────────────────────────────────────────────────
  const DEFAULT_RULES = [
    // First name
    { keywords: ['first name', 'firstname', 'given name', 'first_name', 'fname'], value: profile.firstName, matchType: 'contains' },
    // Last name
    { keywords: ['last name', 'lastname', 'surname', 'family name', 'last_name', 'lname'], value: profile.lastName, matchType: 'contains' },
    // Full name (fill with firstName + lastName)
    { keywords: ['full name', 'fullname', 'your name'], value: `${profile.firstName || ''} ${profile.lastName || ''}`.trim(), matchType: 'contains' },
    // Email
    { keywords: ['email', 'e-mail', 'email address'], value: profile.email, matchType: 'contains' },
    // Phone
    { keywords: ['phone', 'telephone', 'mobile', 'cell', 'contact number', 'phone number'], value: profile.phone, matchType: 'contains' },
    // Address — avoid matching 'email address' by requiring 'street' or explicit 'address line'
    { keywords: ['street address', 'address line 1', 'address line1', 'address 1', 'mailing address', 'home address', 'street'], value: profile.address, matchType: 'contains' },
    // City
    { keywords: ['city', 'town'], value: profile.city, matchType: 'contains' },
    // State
    { keywords: ['state', 'province', 'region'], value: profile.state, matchType: 'contains' },
    // ZIP / Postal
    { keywords: ['zip', 'postal', 'post code', 'postcode', 'zipcode'], value: profile.zipCode, matchType: 'contains' },
    // Job title
    { keywords: ['job title', 'position', 'title', 'role', 'desired position', 'applying for'], value: profile.jobTitle, matchType: 'contains' },
    // Company
    { keywords: ['current company', 'employer', 'current employer', 'company name', 'organization'], value: profile.company, matchType: 'contains' },
    // Years of experience
    { keywords: ['years of experience', 'years experience', 'experience years', 'how many years'], value: profile.yearsExp, matchType: 'contains' },
    // Salary
    { keywords: ['salary', 'expected salary', 'desired salary', 'compensation', 'pay'], value: profile.salary, matchType: 'contains' },
    // LinkedIn
    { keywords: ['linkedin', 'linkedin url', 'linkedin profile'], value: profile.linkedin, matchType: 'contains' },
    // GitHub
    { keywords: ['github', 'github url', 'github profile'], value: profile.github, matchType: 'contains' },
    // Website / Portfolio — avoid matching generic 'url' fields (e.g. LinkedIn URL)
    { keywords: ['website', 'portfolio', 'personal site', 'personal website', 'personal url', 'portfolio url'], value: profile.website, matchType: 'contains' },
    // Cover letter
    { keywords: ['cover letter', 'coverletter', 'covering letter', 'letter of interest'], value: profile.coverLetter, matchType: 'contains' },
  ];

  // Build the final rules list: default rules expanded per-keyword,
  // followed by custom user rules
  const allRules = [];

  DEFAULT_RULES.forEach(rule => {
    if (!rule.value) return;
    rule.keywords.forEach(kw => {
      allRules.push({ keyword: kw, value: rule.value, matchType: 'contains' });
    });
  });

  customRules.forEach(rule => {
    if (rule.keyword && rule.value) {
      allRules.push({ keyword: rule.keyword.toLowerCase(), value: rule.value, matchType: rule.matchType || 'contains' });
    }
  });

  // ── Helper: get text associated with a field ─────────────────────────────
  function getFieldText(el) {
    const parts = [];

    // placeholder
    if (el.placeholder) parts.push(el.placeholder);

    // name / id attributes
    if (el.name) parts.push(el.name.replace(/[_\-]/g, ' '));
    if (el.id)   parts.push(el.id.replace(/[_\-]/g, ' '));

    // aria-label
    const ariaLabel = el.getAttribute('aria-label');
    if (ariaLabel) parts.push(ariaLabel);

    // <label for="..."> or wrapping <label>
    if (el.id) {
      const labelEl = document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
      if (labelEl) parts.push(labelEl.textContent);
    }
    const parentLabel = el.closest('label');
    if (parentLabel) parts.push(parentLabel.textContent);

    // Nearby preceding label-like elements
    const parent = el.parentElement;
    if (parent) {
      const prevLabel = parent.querySelector('label, .label, [class*="label"]');
      if (prevLabel) parts.push(prevLabel.textContent);
    }

    return parts.join(' ').toLowerCase().trim();
  }

  // ── Helper: match keyword against field text ─────────────────────────────
  function matchesRule(fieldText, rule) {
    const kw = rule.keyword.toLowerCase();
    switch (rule.matchType) {
      case 'exact':      return fieldText === kw;
      case 'startsWith': return fieldText.startsWith(kw);
      case 'contains':
      default:           return fieldText.includes(kw);
    }
  }

  // ── Helper: find best matching rule value for a field ────────────────────
  function findValue(el) {
    const fieldText = getFieldText(el);
    if (!fieldText) return null;

    // Custom rules take priority (listed last but we iterate reversed)
    for (let i = allRules.length - 1; i >= 0; i--) {
      const rule = allRules[i];
      if (matchesRule(fieldText, rule)) return rule.value;
    }
    return null;
  }

  // ── Helper: set value and fire React/Vue/etc synthetic events ────────────
  function setValue(el, value) {
    const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
      el.tagName === 'TEXTAREA' ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype,
      'value'
    );

    if (nativeInputValueSetter) {
      nativeInputValueSetter.set.call(el, value);
    } else {
      el.value = value;
    }

    el.dispatchEvent(new Event('input',  { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }

  // ── Scan & fill ──────────────────────────────────────────────────────────
  let filledCount = 0;

  // Select text-like inputs; exclude non-fillable types
  const FILLABLE_INPUT_SELECTOR =
    'input:not([type="hidden"]):not([type="submit"]):not([type="button"])' +
    ':not([type="reset"]):not([type="file"]):not([type="checkbox"]):not([type="radio"])';

  const inputs    = document.querySelectorAll(FILLABLE_INPUT_SELECTOR);
  const textareas = document.querySelectorAll('textarea');

  [...inputs, ...textareas].forEach(el => {
    if (el.disabled || el.readOnly) return;
    const value = findValue(el);
    if (value) {
      setValue(el, value);
      filledCount++;
    }
  });

  return filledCount;
}
