// A cache to prevent spamming your Python backend
const checkedTitles = new Map();
const VIDEO_CARD_SELECTOR = [
  'ytd-rich-item-renderer',
  'ytd-video-renderer',
  'ytd-compact-video-renderer',
  'ytd-grid-video-renderer',
  'ytd-reel-item-renderer',
  'ytd-rich-grid-media'
].join(', ');

const TITLE_SELECTOR = [
  '#video-title',
  'a#video-title-link',
  'yt-formatted-string#video-title',
  'h3 a[href*="/watch"]',
  'a[href*="/watch"][title]'
].join(', ');

console.log('[YouTube Blocker] content.js loaded');

function normalizeText(text) {
  return text.toLowerCase().replace(/\s+/g, ' ').trim();
}

function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function getCardText(card, titleText) {
  const metadataText = [
    titleText,
    card.innerText || '',
    card.getAttribute('aria-label') || ''
  ];

  return metadataText.join(' ');
}

function getTitleText(card) {
  const titleElement = card.querySelector(TITLE_SELECTOR);
  if (!titleElement) return '';

  return (
    titleElement.getAttribute('title') ||
    titleElement.getAttribute('aria-label') ||
    titleElement.innerText ||
    titleElement.textContent ||
    ''
  ).trim();
}

function getBlockedKeywordMatch(videoText, blockedCategories) {
  const normalizedVideoText = normalizeText(videoText);

  return blockedCategories.find((category) => {
    const normalizedCategory = normalizeText(category);
    if (!normalizedCategory) return false;

    const categoryPattern = new RegExp(`(^|\\W)${escapeRegExp(normalizedCategory)}($|\\W)`, 'i');
    return categoryPattern.test(normalizedVideoText);
  });
}

function hideVideoCard(card) {
  const fullCard = card.closest(VIDEO_CARD_SELECTOR);
  const cardToHide = fullCard || card;
  cardToHide.style.setProperty('display', 'none', 'important');
  cardToHide.hidden = true;
  cardToHide.setAttribute('data-youtube-blocker-hidden', 'true');
}

async function filterYoutubeFeed() {
  // 1. Get your blocked list from the popup
  const data = await chrome.storage.local.get('blockedCategories');
  const blockedCategories = data.blockedCategories || [];
  
  // If no categories have been added in the popup yet, stop here
  if (blockedCategories.length === 0) return;

  // 2. Find all video cards on the YouTube Home, Search, and Sidebar feeds
  const videoCards = document.querySelectorAll(VIDEO_CARD_SELECTOR);

  videoCards.forEach(async (card) => {
    const titleText = getTitleText(card);
    if (!titleText) return;

    const cacheKey = `${normalizeText(blockedCategories.join('|'))}::${normalizeText(titleText)}`;

    if (checkedTitles.has(cacheKey)) {
      // If already blocked, keep it hidden
      if (checkedTitles.get(cacheKey) === 'block') {
        hideVideoCard(card);
      }
      return;
    }

    const videoText = getCardText(card, titleText);
    const keywordMatch = getBlockedKeywordMatch(videoText, blockedCategories);

    if (keywordMatch) {
      checkedTitles.set(cacheKey, 'block');
      hideVideoCard(card);
      console.log(`[YouTube Blocker] Hidden by keyword "${keywordMatch}": "${titleText}"`);
      return;
    }

    // Mark as pending so we don't send duplicate requests
    checkedTitles.set(cacheKey, 'pending');

    console.log(`[YouTube Blocker] Checking title: "${titleText}"`);

    // 3. Send the title to your running Python server
    try {
      const response = await fetch('http://localhost:8000/check-video', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: titleText,
          description: videoText,
          blocked_categories: blockedCategories
        })
      });

      if (!response.ok) {
        throw new Error(`Backend responded with ${response.status}`);
      }

      const result = await response.json();
      checkedTitles.set(cacheKey, result.action);
      console.log('[YouTube Blocker] Backend result:', {
        title: titleText,
        action: result.action,
        reason: result.reason,
        matchedCategory: result.matched_category,
        similarity: result.similarity
      });

      // 4. If Python says block, vanish it!
      if (result.action === 'block') {
        hideVideoCard(card);
        console.log(`[YouTube Blocker] Hidden by ${result.reason}: "${titleText}"`);
      }
    } catch (err) {
      console.error('[YouTube Blocker] Failed to connect to Python server:', err);
      checkedTitles.delete(cacheKey);
    }
  });
}

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === 'local' && changes.blockedCategories) {
    checkedTitles.clear();
    filterYoutubeFeed();
  }
});

filterYoutubeFeed();

// Run every 1.5 seconds to catch new videos as you scroll
setInterval(filterYoutubeFeed, 1500);
document.addEventListener('yt-navigate-finish', filterYoutubeFeed);
