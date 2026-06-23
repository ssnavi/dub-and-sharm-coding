const STORAGE_KEY = 'blockedCategories';

const categoryInput = document.getElementById('category-input');
const addCategoryButton = document.getElementById('add-btn');
const tagsContainer = document.getElementById('tag-container');

function getBlockedCategories() {
  return new Promise((resolve) => {
    chrome.storage.local.get({ [STORAGE_KEY]: [] }, (result) => {
      resolve(Array.isArray(result[STORAGE_KEY]) ? result[STORAGE_KEY] : []);
    });
  });
}

function setBlockedCategories(categories) {
  return new Promise((resolve) => {
    chrome.storage.local.set({ [STORAGE_KEY]: categories }, () => {
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

  const categories = await getBlockedCategories();
  categories.push(value);
  await setBlockedCategories(categories);
  categoryInput.value = '';
  renderTags(categories);
}

async function removeCategory(index) {
  const categories = await getBlockedCategories();
  categories.splice(index, 1);
  await setBlockedCategories(categories);
  renderTags(categories);
}

async function initializePopup() {
  const categories = await getBlockedCategories();
  renderTags(categories);
}

categoryInput.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') {
    event.preventDefault();
    addCategory();
  }
});

addCategoryButton.addEventListener('click', addCategory);

document.addEventListener('DOMContentLoaded', initializePopup);
