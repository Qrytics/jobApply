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

// Array profile data (managed separately from simple fields)
let profileExperiences = [];
let profileProjects    = [];
let profileSkills      = [];

// ─── Initialise ──────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  await loadProfile();
  await loadRules();
  bindTabSwitcher();
  bindProfileSave();
  bindFillButton();
  bindRuleModal();
  bindRepeatable();
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
  profileExperiences = profile.experiences || [];
  profileProjects    = profile.projects    || [];
  profileSkills      = profile.skills      || [];
  renderExperiences();
  renderProjects();
  renderSkills();
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

// ─── Repeatable sections ──────────────────────────────────────────────────────
function bindRepeatable() {
  document.getElementById('add-experience').addEventListener('click', () => {
    profileExperiences.push({ title: '', company: '', startDate: '', endDate: '', description: '' });
    renderExperiences();
    document.getElementById('experiences-list').lastElementChild?.scrollIntoView({ behavior: 'smooth' });
  });

  document.getElementById('add-project').addEventListener('click', () => {
    profileProjects.push({ name: '', description: '', url: '' });
    renderProjects();
    document.getElementById('projects-list').lastElementChild?.scrollIntoView({ behavior: 'smooth' });
  });

  document.getElementById('skill-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      const skill = e.target.value.trim().replace(/,+$/, '');
      if (skill && !profileSkills.includes(skill)) {
        profileSkills.push(skill);
        renderSkills();
      }
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
      <textarea data-field="description" rows="2" placeholder="Key responsibilities…">${escHtml(exp.description || '')}</textarea>
    </div>
  `;
  div.querySelector('.btn-remove-item').addEventListener('click', () => {
    profileExperiences.splice(index, 1);
    renderExperiences();
  });
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
      <textarea data-field="description" rows="2" placeholder="What the project does…">${escHtml(proj.description || '')}</textarea>
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
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
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
 * Supports: text inputs, textareas, native selects, autocomplete/combobox fields,
 * state abbreviation normalization, and repeating sections (experiences/projects/skills).
 *
 * @param {object} profile     - User profile from storage
 * @param {Array}  customRules - User-defined keyword rules
 * @returns {Promise<number>} count of fields filled
 */
async function fillFields(profile, customRules) {

  // ── Timing constants (ms) ──────────────────────────────────────────────────
  const AUTOCOMPLETE_DROPDOWN_DELAY = 500; // wait for autocomplete dropdown to appear
  const AUTOCOMPLETE_CLICK_DELAY    = 100; // settle after clicking an option
  const AUTOCOMPLETE_DISMISS_DELAY  = 150; // settle after dismissing with Escape
  const SKILL_ADD_DELAY             = 400; // wait for new skill input after clicking Add
  const REPEATING_SECTION_ADD_DELAY = 600; // wait for new form group after clicking Add

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
  // Build reverse map: abbreviation → Title Case full name
  const ABBR_TO_STATE = Object.fromEntries(
    Object.entries(STATE_TO_ABBR).map(([full, abbr]) => [
      abbr,
      full.replace(/\b\w/g, c => c.toUpperCase()),
    ])
  );

  // Returns the value variants to try for a state field: [abbr, full] or [full, abbr]
  function stateVariants(val) {
    const lo = val.toLowerCase().trim();
    const up = val.toUpperCase().trim();
    if (STATE_TO_ABBR[lo]) return [STATE_TO_ABBR[lo], val];   // "Texas"  → ["TX", "Texas"]
    if (ABBR_TO_STATE[up]) return [val, ABBR_TO_STATE[up]];   // "TX"     → ["TX", "Texas"]
    return [val];
  }

  // ── Default keyword map ────────────────────────────────────────────────────
  const DEFAULT_RULES = [
    { keywords: ['first name','firstname','given name','first_name','fname'], value: profile.firstName },
    { keywords: ['last name','lastname','surname','family name','last_name','lname'], value: profile.lastName },
    { keywords: ['full name','fullname','your name'], value: `${profile.firstName || ''} ${profile.lastName || ''}`.trim() },
    { keywords: ['email','e-mail','email address'], value: profile.email },
    { keywords: ['phone','telephone','mobile','cell','contact number','phone number'], value: profile.phone },
    { keywords: ['street address','address line 1','address line1','address 1','mailing address','home address','street'], value: profile.address },
    { keywords: ['city','town'], value: profile.city },
    { keywords: ['state','province','region'], value: profile.state },
    { keywords: ['zip','postal','post code','postcode','zipcode'], value: profile.zipCode },
    { keywords: ['job title','position','title','role','desired position','applying for'], value: profile.jobTitle },
    { keywords: ['current company','employer','current employer','company name','organization'], value: profile.company },
    { keywords: ['years of experience','years experience','experience years','how many years'], value: profile.yearsExp },
    { keywords: ['salary','expected salary','desired salary','compensation','pay'], value: profile.salary },
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
  (customRules || []).forEach(rule => {
    if (rule.keyword && rule.value) {
      allRules.push({ keyword: rule.keyword.toLowerCase(), value: rule.value, matchType: rule.matchType || 'contains' });
    }
  });

  // ── Helper: get label/context text for a field ─────────────────────────────
  function getFieldText(el) {
    const parts = [];
    if (el.placeholder) parts.push(el.placeholder);
    if (el.name) parts.push(el.name.replace(/[_\-]/g, ' '));
    if (el.id)   parts.push(el.id.replace(/[_\-]/g, ' '));
    const ariaLabel = el.getAttribute('aria-label');
    if (ariaLabel) parts.push(ariaLabel);
    if (el.id) {
      const labelEl = document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
      if (labelEl) parts.push(labelEl.textContent);
    }
    const parentLabel = el.closest('label');
    if (parentLabel) parts.push(parentLabel.textContent);
    const parent = el.parentElement;
    if (parent) {
      const prevLabel = parent.querySelector('label, .label, [class*="label"]');
      if (prevLabel) parts.push(prevLabel.textContent);
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

  // Returns true if this element's label context contains a state-related keyword
  function isStateEl(el) {
    return /\bstate\b|\bprovince\b|\bregion\b/.test(getFieldText(el));
  }

  // ── Helper: set value + fire React/Vue/etc synthetic events ───────────────
  function setValue(el, value) {
    const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, 'value');
    if (setter) setter.set.call(el, value);
    else el.value = value;
    el.dispatchEvent(new Event('input',  { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }

  // ── Fill a native <select> ─────────────────────────────────────────────────
  function fillSelect(el, value) {
    const variants = isStateEl(el) ? stateVariants(value) : [value];
    for (const v of variants) {
      const lo = v.toLowerCase().trim();
      const opt = Array.from(el.options).find(
        o => o.text.trim().toLowerCase() === lo || o.value.trim().toLowerCase() === lo
      );
      if (opt) {
        el.value = opt.value;
        el.dispatchEvent(new Event('change', { bubbles: true }));
        return true;
      }
    }
    return false; // no matching option – skip
  }

  // ── Find the visible dropdown/listbox associated with an autocomplete ──────
  function findVisibleDropdown(el) {
    // Check aria-controls / aria-owns / list attribute first
    for (const attr of ['aria-controls', 'aria-owns', 'list']) {
      const id = el.getAttribute(attr);
      if (id) {
        const linked = document.getElementById(id);
        if (linked) return linked;
      }
    }
    // Fall back to any visible listbox in the document
    const candidates = document.querySelectorAll('[role="listbox"], [role="menu"], .dropdown, .suggestions, .autocomplete-results');
    for (const c of candidates) {
      const r = c.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) return c;
    }
    return null;
  }

  // ── Fill an autocomplete/combobox input (type → wait → click option or skip)
  async function fillAutocomplete(el, rawValue) {
    const variants = isStateEl(el) ? stateVariants(rawValue) : [rawValue];

    for (const value of variants) {
      setValue(el, value);
      el.focus();
      el.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'ArrowDown' }));
      el.dispatchEvent(new Event('input', { bubbles: true }));

      await new Promise(r => setTimeout(r, AUTOCOMPLETE_DROPDOWN_DELAY));

      const dropdown = findVisibleDropdown(el);
      if (!dropdown) {
        // No autocomplete dropdown appeared – treat as plain text input
        return true;
      }

      const lo = value.toLowerCase();
      const optEls = dropdown.querySelectorAll('[role="option"], li, .item');
      const match = Array.from(optEls).find(o => {
        const t = o.textContent.trim().toLowerCase();
        return t === lo || t.startsWith(lo) || t.includes(lo);
      });

      if (match) {
        match.click();
        await new Promise(r => setTimeout(r, AUTOCOMPLETE_CLICK_DELAY));
        return true;
      }

      // This variant didn't match – clear and try next variant
      setValue(el, '');
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      await new Promise(r => setTimeout(r, AUTOCOMPLETE_DISMISS_DELAY));
    }

    return false; // no variant matched – field left empty (skipped)
  }

  function isAutocomplete(el) {
    return el.getAttribute('role') === 'combobox' ||
           el.getAttribute('aria-autocomplete') === 'list' ||
           el.getAttribute('aria-autocomplete') === 'both';
  }

  // ── Fill one element ───────────────────────────────────────────────────────
  async function fillOne(el, value) {
    if (!value || el.disabled || el.readOnly) return false;
    if (el.tagName === 'SELECT') return fillSelect(el, value);
    if (isAutocomplete(el))     return await fillAutocomplete(el, value);
    // Plain text / textarea
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

  // Definitions for each repeating type
  const REPEAT_DEFS = [
    {
      items:       experiences,
      btnKeywords: ['experience', 'employment', 'work history', 'job'],
      fieldMap: {
        title:       /\b(title|position|role)\b/i,
        company:     /\b(company|employer|organization)\b/i,
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
      fieldMap:    null, // skills are single-value fields
    },
  ];

  // Find a button whose text/label includes "add" AND any of the given keywords
  function findAddButton(keywords) {
    const btns = document.querySelectorAll('button, [role="button"], a[role="button"]');
    return Array.from(btns).find(btn => {
      const text = (btn.textContent || btn.getAttribute('aria-label') || '').trim().toLowerCase();
      return /\badd\b/.test(text) && keywords.some(kw => text.includes(kw));
    }) || null;
  }

  // Count fillable fields inside a container
  function countFields(container) {
    return container.querySelectorAll(
      'input:not([type="hidden"]):not([type="submit"]):not([type="button"]):not([type="reset"]):not([type="file"]):not([type="checkbox"]):not([type="radio"]), textarea, select'
    ).length;
  }

  // Fill fields within a container according to a fieldMap and item object
  async function fillGroup(container, item, fieldMap) {
    const fields = container.querySelectorAll(
      'input:not([type="hidden"]):not([type="submit"]):not([type="button"]):not([type="reset"]):not([type="file"]):not([type="checkbox"]):not([type="radio"]), textarea, select'
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
      // Skills: one input per skill; click "Add" then fill the new input
      for (let i = 0; i < def.items.length; i++) {
        if (i > 0) {
          addBtn.click();
          await new Promise(r => setTimeout(r, SKILL_ADD_DELAY));
        }
        // Find the skill input (pick the last visible one after clicking Add)
        const skillInputs = document.querySelectorAll(
          'input[class*="skill" i], input[id*="skill" i], input[name*="skill" i], input[placeholder*="skill" i]'
        );
        const input = skillInputs.length ? skillInputs[skillInputs.length - 1] : null;
        if (input && !input.disabled && !input.readOnly) {
          if (await fillOne(input, def.items[i])) filledCount++;
        }
      }
    } else {
      // Structured repeating section (experiences, projects)
      // The add button's parent contains the repeated item containers as siblings
      const parent = addBtn.parentElement;
      let existingGroups = Array.from(parent.children).filter(
        c => c !== addBtn && countFields(c) >= 1
      );

      // If no groups found in direct parent, walk up one level
      if (!existingGroups.length && addBtn.parentElement?.parentElement) {
        const grandParent = addBtn.parentElement.parentElement;
        existingGroups = Array.from(grandParent.children).filter(
          c => !c.contains(addBtn) && countFields(c) >= 1
        );
      }

      // Fill first item in the first existing group
      if (existingGroups.length > 0 && def.items[0]) {
        await fillGroup(existingGroups[0], def.items[0], def.fieldMap);
      }

      // Click Add for each subsequent item and fill the newly created group
      for (let i = 1; i < def.items.length; i++) {
        addBtn.click();
        await new Promise(r => setTimeout(r, REPEATING_SECTION_ADD_DELAY));

        // Detect newly added group
        const afterGroups = Array.from(parent.children).filter(
          c => c !== addBtn && countFields(c) >= 1
        );
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
