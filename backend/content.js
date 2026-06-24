// A cache to prevent spamming your Python backend
const checkedTitles = new Map();
const VIDEO_CARD_SELECTOR = [
  'ytd-rich-item-renderer',
  'ytd-video-renderer',
  'ytd-compact-video-renderer',
  'ytd-grid-video-renderer',
  'ytd-reel-item-renderer',
  'ytd-rich-grid-media',
  'ytd-reel-video-renderer',
  'ytd-reel-shelf-renderer',
  'ytd-rich-shelf-renderer',
  'ytd-shorts-shelf-renderer',
  'ytd-grid-shorts-renderer'
].join(', ');

const TITLE_SELECTOR = [
  '#video-title',
  'a#video-title-link',
  'yt-formatted-string#video-title',
  'h3 a[href*="/watch"]',
  'h3 a[href*="/shorts"]',
  'a[href*="/watch"][title]',
  'a[href*="/shorts"]'
].join(', ');

let isObserving = false;
let observer = null;

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
  const data = await chrome.storage.local.get(['blockedCategories', 'allowedCategories', 'mode']);
  const blockedCategories = data.blockedCategories || [];
  const allowedCategories = data.allowedCategories || [];
  const mode = data.mode || 'block';

  const videoCards = document.querySelectorAll(VIDEO_CARD_SELECTOR);

  if (mode === 'allow_only' && allowedCategories.length === 0) {
    videoCards.forEach((card) => hideVideoCard(card));
    return;
  }

  if (mode === 'block' && blockedCategories.length === 0) {
    return;
  }

  videoCards.forEach(async (card) => {
    const titleText = getTitleText(card);
    if (!isWatchPage() {
  return location.pathname.startsWith('/watch');
}

function getWatchPageTitleText() {
  const selectors = [
    'h1.title yt-formatted-string',
    'h1.title',
    'ytd-watch-metadata h1.title yt-formatted-string',
    'ytd-video-primary-info-renderer h1 yt-formatted-string',
    'yt-formatted-string.ytd-video-primary-info-renderer',
    '#container h1.title',
    'meta[property="og:title"]'
  ];

  for (const selector of selectors) {
    const element = document.querySelector(selector);
    if (!element) continue;

    const text = element.getAttribute('title') || element.getAttribute('aria-label') || element.innerText || element.textContent;
    if (text) return text.trim();

    if (selector === 'meta[property="og:title"]' && element.content) {
      return element.content.trim();
    }
  }

  return document.title.replace(/\s+-\s+YouTube\s*$/i, '').trim();
}

function hideWatchPage() {
  const player = document.querySelector('#player') || document.querySelector('ytd-player') || document.querySelector('.html5-video-player');
  const main = document.querySelector('#primary') || document.querySelector('#primary-inner') || document.querySelector('ytd-watch-flexy');

  if (player) {
    player.style.setProperty('display', 'none', 'important');
  }
  if (main) {
    main.style.setProperty('display', 'none', 'important');
  }

  const noticeId = 'youtube-blocker-watch-blocked';
  if (!document.getElementById(noticeId)) {
    const notice = document.createElement('div');
    notice.id = noticeId;
    notice.textContent = 'This video is blocked by the extension.';
    notice.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;display:flex;align-items:center;justify-content:center;background:#000;color:#fff;font-size:18px;z-index:999999;padding:20px;text-align:center;';
    document.body.appendChild(notice);
  }
}

function getWatchPageVideoText(titleText) {
  const description = document.querySelector('#description')?.innerText || document.querySelector('meta[name="description"]')?.content || '';
  return `${titleText}. ${description}`.trim();
}

function titleText) return;

    const categories = mode === 'allow_only' ? allowedCategories : blockedCategories;
    const cacheKey = `${mode}::${normalizeText(categories.join('|'))}::${normalizeText(titleText)}`;

    if (checkedTitles.has(cacheKey)) {
      if (checkedTitles.get(cacheKey) === 'block') {
        hideVideoCard(card);
      }
      return;
    }

    const videoText = getCardText(card, titleText);

    if (mode === 'block') {
      const keywordMatch = getBlockedKeywordMatch(videoText, blockedCategories);
      if (keywordMatch) {
        checkedTitles.set(cacheKey, 'block');
        hideVideoCard(card);
        console.log(`[YouTube Blocker] Hidden by keyword "${keywordMatch}": "${titleText}"`);
        return;
      }
    }

    checkedTitles.set(cacheKey, 'pending');

    console.log(`[YouTube Blocker] Checking title: "${titleText}"`);

    try {
      const response = await fetch('http://localhost:8000/check-video', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: titleText,
          description: videoText,
          blocked_categories: blockedCategories,
          allowed_categories: allowedCategories,
          mode,
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

function observeYoutubeFeed() {
  if (isObserving) return;

  const observerCallback = debounce(() => {
    checkedTitles.clear();
    filterYoutubeFeed();
  }, 300);

  observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      if (mutation.addedNodes.length > 0) {
        observerCallback();
        break;
      }
    }
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true,
  });
  isObserving = true;
}

function debounce(fn, delay) {
  let timeout;
  return (...args) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => fn(...args), delay);
  };
}

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === 'local' && (changes.blockedCategories || changes.allowedCategories || changes.mode)) {
    checkedTitles.clear();
    filterYoutubeFeed();
  }
});

filterYoutubeFeed();
observeYoutubeFeed();

// Run every 1.5 seconds to catch new videos as you scroll
setInterval(filterYoutubeFeed, 1500);
window.addEventListener('yt-navigate-finish', filterYoutubeFeed);
window.addEventListener('yt-page-data-updated', filterYoutubeFeed);
window.addEventListener('spfdone', filterYoutubeFeed);
  filterWatchPage();
  }
});

filterYoutubeFeed();
filterCurrentShort();
filterWatchPage();
observeYoutubeFeed();

// Run every 1.5 seconds to catch new videos as you scroll
setInterval(filterYoutubeFeed, 1500);
setInterval(filterCurrentShort, 1500);
setInterval(filterWatchPage, 1500);
window.addEventListener('yt-navigate-finish', () => {
  filterYoutubeFeed();
  filterCurrentShort();
  filterWatchPage();
});
window.addEventListener('yt-page-data-updated', () => {
  filterYoutubeFeed();
  filterCurrentShort();
  filterWatchPage();
});
window.addEventListener('spfdone', () => {
  filterYoutubeFeed();
  filterCurrentShort();
  filterWatchPageasync function filterWatchPage() {
  if (!isWatchPage()) return;

  const settings = await getFilterSettings();
  const { blockedCategories, mode, categories } = settings;

  if (mode === 'block' && blockedCategories.length === 0) {
    return;
  }

  if (mode === 'allow_only' && categories.length === 0) {
    return;
  }

  const titleText = getWatchPageTitleText();
  if (!titleText) return;

  const videoText = getWatchPageVideoText(titleText);
  const cacheKey = `watch::${mode}::${normalizeText(categories.join('|'))}::${normalizeText(titleText)}`;

  if (checkedTitles.has(cacheKey)) {
    if (checkedTitles.get(cacheKey) === 'block') {
      hideWatchPage();
    }
    return;
  }

  checkedTitles.set(cacheKey, 'pending');

  try {
    const response = await fetch('http://localhost:8000/check-video', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: titleText,
        description: videoText,
        blocked_categories: blockedCategories,
        allowed_categories: settings.allowedCategories,
        mode,
      })
    });

    if (!response.ok) {
      throw new Error(`Backend responded with ${response.status}`);
    }

    const result = await response.json();
    checkedTitles.set(cacheKey, result.action);

    if (result.action === 'block') {
      hideWatchPage();
      console.log(`[YouTube Blocker] Watch page blocked by ${result.reason}: "${titleText}"`);
    }
  } catch (err) {
    console.error('[YouTube Blocker] Failed to connect to Python server on watch page:', err);
    checkedTitles.delete(cacheKey);
  }
}

