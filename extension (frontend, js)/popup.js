const BLOCKED_STORAGE_KEY = 'blockedCategories';
const ALLOWED_STORAGE_KEY = 'allowedCategories';
const EDUCATION_SITES_STORAGE_KEY = 'trustedEducationSites';

const categoryInput = document.getElementById('category-input');
const addCategoryButton = document.getElementById('add-btn');
const tagsContainer = document.getElementById('tag-container');
const modeSelect = document.getElementById('mode-select');
const settingsInfo = document.getElementById('settings-info');
const educationSiteToggles = document.querySelectorAll('[data-education-site]');

function getCategories(storageKey) {
  return new Promise((resolve) => {
    chrome.storage.local.get({ [storageKey]: [] }, (result) => {
      resolve(Array.isArray(result[storageKey]) ? result[storageKey] : []);
    });
  });
}

function setCategories(storageKey, categories) {
  return new Promise((resolve) => {
    chrome.storage.local.set({ [storageKey]: categories }, () => {
      resolve();
    });
  });
}

function getMode() {
  return new Promise((resolve) => {
    chrome.storage.local.get({ mode: 'block' }, (result) => {
      resolve(result.mode || 'block');
    });
  });
}

function setMode(mode) {
  return new Promise((resolve) => {
    chrome.storage.local.set({ mode }, () => {
      resolve();
    });
  });
}

function getTrustedEducationSites() {
  return new Promise((resolve) => {
    chrome.storage.local.get({ [EDUCATION_SITES_STORAGE_KEY]: {} }, (result) => {
      resolve(result[EDUCATION_SITES_STORAGE_KEY] || {});
    });
  });
}

function setTrustedEducationSites(sites) {
  return new Promise((resolve) => {
    chrome.storage.local.set({ [EDUCATION_SITES_STORAGE_KEY]: sites }, () => {
      resolve();
    });
  });
}

function renderTags(categories) {
  tagsContainer.innerHTML = '';

  categories.forEach((category, index) => {
    const tag = document.createElement('div');
    tag.className = 'category-tag';

    const text = document.createElement('span');
    text.textContent = category;
    tag.appendChild(text);

    const removeButton = document.createElement('button');
    removeButton.type = 'button';
    removeButton.className = 'remove-tag';
    removeButton.textContent = '×';
    removeButton.addEventListener('click', () => removeCategory(index));

    tag.appendChild(removeButton);
    tagsContainer.appendChild(tag);
  });
}

async function addCategory() {
  const value = categoryInput.value.trim();
  if (!value) {
    return;
  }

  const mode = await getMode();
  const storageKey = mode === 'allow_only' ? ALLOWED_STORAGE_KEY : BLOCKED_STORAGE_KEY;
  const categories = await getCategories(storageKey);
  categories.push(value);
  await setCategories(storageKey, categories);
  categoryInput.value = '';
  renderTags(categories);
}

async function removeCategory(index) {
  const mode = await getMode();
  const storageKey = mode === 'allow_only' ? ALLOWED_STORAGE_KEY : BLOCKED_STORAGE_KEY;
  const categories = await getCategories(storageKey);
  categories.splice(index, 1);
  await setCategories(storageKey, categories);
  renderTags(categories);
}

function updateInfoText(mode) {
  settingsInfo.textContent =
    mode === 'allow_only'
      ? 'Only videos matching your allowed categories will be shown.'
      : 'Videos matching blocked categories will be hidden.';
}

async function initializePopup() {
  const mode = await getMode();
  modeSelect.value = mode;
  updateInfoText(mode);

  const storageKey = mode === 'allow_only' ? ALLOWED_STORAGE_KEY : BLOCKED_STORAGE_KEY;
  const categories = await getCategories(storageKey);
  renderTags(categories);

  const trustedEducationSites = await getTrustedEducationSites();
  educationSiteToggles.forEach((toggle) => {
    toggle.checked = Boolean(trustedEducationSites[toggle.dataset.educationSite]);
  });
}

async function handleModeChange() {
  const mode = modeSelect.value;
  await setMode(mode);
  updateInfoText(mode);
  const storageKey = mode === 'allow_only' ? ALLOWED_STORAGE_KEY : BLOCKED_STORAGE_KEY;
  const categories = await getCategories(storageKey);
  renderTags(categories);
}

async function handleEducationSiteToggle(event) {
  const trustedEducationSites = await getTrustedEducationSites();
  trustedEducationSites[event.target.dataset.educationSite] = event.target.checked;
  await setTrustedEducationSites(trustedEducationSites);
}

categoryInput.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') {
    event.preventDefault();
    addCategory();
  }
});

addCategoryButton.addEventListener('click', addCategory);
modeSelect.addEventListener('change', handleModeChange);
educationSiteToggles.forEach((toggle) => {
  toggle.addEventListener('change', handleEducationSiteToggle);
});

document.addEventListener('DOMContentLoaded', initializePopup);
