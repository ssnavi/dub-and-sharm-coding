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
  'h2 yt-formatted-string',
  '#title',
  '#title yt-formatted-string',
  '#overlay #title',
  'a[href*="/watch"][title]',
  'a[href*="/shorts"]',
  'a[href*="/shorts"][aria-label]'
].join(', ');

const SHORTS_PAGE_SELECTOR = [
  'ytd-reel-video-renderer[is-active]',
  'ytd-reel-video-renderer[active]',
  'ytd-reel-video-renderer'
].join(', ');

const EDUCATION_REFERRER_DOMAINS = {
  canvas: ['instructure.com'],
  googleClassroom: ['classroom.google.com'],
  schoology: ['schoology.com']
};
const TRUSTED_YOUTUBE_NAVIGATION_KEY = 'trustedYoutubeNavigation';
const TRUSTED_YOUTUBE_NAVIGATION_MAX_AGE_MS = 2 * 60 * 1000;

let isObserving = false;
let observer = null;

console.log('[YouTube Blocker] content.js loaded');

if (isEducationSitePage()) {
  document.addEventListener('click', rememberTrustedYoutubeNavigation, true);
  console.log('[YouTube Blocker] education link allowlist listener active');
} else {
  startYoutubeFiltering();
}

function normalizeText(text) {
  return text.toLowerCase().replace(/\s+/g, ' ').trim();
}

function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function hostnameMatchesDomain(hostname, domain) {
  return hostname === domain || hostname.endsWith(`.${domain}`);
}

function getEnabledEducationSiteKeyForHostname(hostname, trustedEducationSites) {
  return Object.entries(EDUCATION_REFERRER_DOMAINS).find(([siteKey, domains]) => {
    return trustedEducationSites[siteKey] && domains.some((domain) => {
      return hostnameMatchesDomain(hostname, domain);
    });
  })?.[0] || '';
}

function getCurrentEducationSiteKey(trustedEducationSites) {
  return getEnabledEducationSiteKeyForHostname(location.hostname, trustedEducationSites);
}

function getTrustedEducationReferrerKey(trustedEducationSites) {
  if (!document.referrer) return '';

  try {
    const referrerHostname = new URL(document.referrer).hostname;
    return getEnabledEducationSiteKeyForHostname(referrerHostname, trustedEducationSites);
  } catch (err) {
    return '';
  }
}

function isYoutubeHostname(hostname) {
  return hostname === 'youtu.be' || hostname === 'youtube.com' || hostname.endsWith('.youtube.com');
}

function getYoutubeVideoId(url) {
  if (!isYoutubeHostname(url.hostname)) return '';

  if (url.hostname === 'youtu.be') {
    return url.pathname.split('/').filter(Boolean)[0] || '';
  }

  if (url.pathname.startsWith('/watch')) {
    return url.searchParams.get('v') || '';
  }

  if (url.pathname.startsWith('/shorts/')) {
    return url.pathname.split('/').filter(Boolean)[1] || '';
  }

  if (url.pathname.startsWith('/embed/')) {
    return url.pathname.split('/').filter(Boolean)[1] || '';
  }

  return '';
}

function getCurrentYoutubeVideoId() {
  return getYoutubeVideoId(new URL(location.href));
}

async function rememberTrustedYoutubeNavigation(event) {
  const link = event.target.closest?.('a[href]');
  if (!link) return;

  let linkUrl;
  try {
    linkUrl = new URL(link.href, location.href);
  } catch (err) {
    return;
  }

  const videoId = getYoutubeVideoId(linkUrl);
  if (!videoId) return;

  const { trustedEducationSites = {} } = await chrome.storage.local.get('trustedEducationSites');
  const sourceSite = getCurrentEducationSiteKey(trustedEducationSites);
  if (!sourceSite) return;

  await chrome.storage.local.set({
    [TRUSTED_YOUTUBE_NAVIGATION_KEY]: {
      videoId,
      sourceSite,
      timestamp: Date.now(),
    }
  });
}

async function getTrustedEducationNavigationKey(trustedEducationSites) {
  const referrerKey = getTrustedEducationReferrerKey(trustedEducationSites);
  if (referrerKey) return referrerKey;

  const data = await chrome.storage.local.get(TRUSTED_YOUTUBE_NAVIGATION_KEY);
  const trustedNavigation = data[TRUSTED_YOUTUBE_NAVIGATION_KEY];
  if (!trustedNavigation) return '';

  const isFresh = Date.now() - trustedNavigation.timestamp <= TRUSTED_YOUTUBE_NAVIGATION_MAX_AGE_MS;
  const videoIdMatches = trustedNavigation.videoId && trustedNavigation.videoId === getCurrentYoutubeVideoId();
  const siteStillEnabled = trustedEducationSites[trustedNavigation.sourceSite];

  return isFresh && videoIdMatches && siteStillEnabled ? trustedNavigation.sourceSite : '';
}

function isEducationSitePage() {
  return Object.values(EDUCATION_REFERRER_DOMAINS).some((domains) => {
    return domains.some((domain) => hostnameMatchesDomain(location.hostname, domain));
  });
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

  const titleText = titleElement ? (
    titleElement.getAttribute('title') ||
    titleElement.getAttribute('aria-label') ||
    titleElement.innerText ||
    titleElement.textContent ||
    ''
  ).trim() : '';

  if (titleText) return titleText;

  const shortsLink = card.querySelector('a[href*="/shorts"]');
  const shortsLinkText = shortsLink ? (
    shortsLink.getAttribute('title') ||
    shortsLink.getAttribute('aria-label') ||
    shortsLink.innerText ||
    shortsLink.textContent ||
    ''
  ).trim() : '';

  if (shortsLinkText) return shortsLinkText;

  return (
    card.getAttribute('aria-label') ||
    card.innerText ||
    ''
  ).trim();
}

function getCurrentShortTitleText(shortCard) {
  const titleText = getTitleText(shortCard);
  if (titleText) return titleText;

  const metaTitle = document.querySelector('meta[property="og:title"]')?.content || '';
  if (metaTitle) return metaTitle.replace(/\s+-\s+YouTube\s*$/i, '').trim();

  return document.title.replace(/\s+-\s+YouTube\s*$/i, '').trim();
}

function isWatchPage() {
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

function stopWatchPlayer() {
  const video = document.querySelector('video');
  if (video) {
    try {
      video.pause();
      video.removeAttribute('src');
      video.load();
    } catch (err) {
      console.warn('[YouTube Blocker] Failed to stop HTML5 video', err);
    }
  }

  const player = document.querySelector('#player') || document.querySelector('ytd-player') || document.querySelector('.html5-video-player');
  if (player && player.pause) {
    try {
      player.pause();
    } catch (err) {
      console.warn('[YouTube Blocker] Failed to pause player', err);
    }
  }

  const playerApi = window.ytplayer?.config?.args || null;
  if (window.YT && window.YT.Player) {
    try {
      const iframe = document.querySelector('iframe[src*="youtube.com/embed"]');
      if (iframe && iframe.contentWindow) {
        window.YT.Player(iframe).stopVideo();
      }
    } catch (err) {
      console.warn('[YouTube Blocker] Failed to stop YT iframe player', err);
    }
  }
}

function hideWatchPage() {
  stopWatchPlayer();

  const main = document.querySelector('#primary') || document.querySelector('#primary-inner') || document.querySelector('ytd-watch-flexy');
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

function isShortsPage() {
  return location.pathname.startsWith('/shorts/');
}

function isElementInViewport(element) {
  const rect = element.getBoundingClientRect();
  const viewportHeight = window.innerHeight || document.documentElement.clientHeight;
  const viewportWidth = window.innerWidth || document.documentElement.clientWidth;

  return (
    rect.width > 0 &&
    rect.height > 0 &&
    rect.top < viewportHeight * 0.75 &&
    rect.bottom > viewportHeight * 0.25 &&
    rect.left < viewportWidth &&
    rect.right > 0
  );
}

function getCurrentShortCards() {
  const activeShorts = document.querySelectorAll(
    'ytd-reel-video-renderer[is-active], ytd-reel-video-renderer[active]'
  );

  if (activeShorts.length > 0) {
    return [...activeShorts];
  }

  return [...document.querySelectorAll('ytd-reel-video-renderer')]
    .filter(isElementInViewport)
    .slice(0, 1);
}

function skipHiddenShort() {
  if (!isShortsPage()) return;

  const nextButton = document.querySelector([
    'button[aria-label="Next video"]',
    'button[aria-label="Next"]',
    'ytd-reel-video-renderer button[aria-label="Next video"]'
  ].join(', '));

  if (nextButton) {
    nextButton.click();
    return;
  }

  window.dispatchEvent(new KeyboardEvent('keydown', {
    key: 'ArrowDown',
    code: 'ArrowDown',
    keyCode: 40,
    which: 40,
    bubbles: true,
  }));
}

async function getFilterSettings() {
  const data = await chrome.storage.local.get([
    'blockedCategories',
    'allowedCategories',
    'mode',
    'trustedEducationSites'
  ]);
  const blockedCategories = data.blockedCategories || [];
  const allowedCategories = data.allowedCategories || [];
  const mode = data.mode || 'block';
  const categories = mode === 'allow_only' ? allowedCategories : blockedCategories;
  const trustedEducationSites = data.trustedEducationSites || {};
  const trustedEducationReferrer = await getTrustedEducationNavigationKey(trustedEducationSites);

  return {
    blockedCategories,
    allowedCategories,
    mode,
    categories,
    trustedEducationReferrer,
  };
}

async function evaluateAndHideCard(card, titleText, videoText, settings, options = {}) {
  const { blockedCategories, allowedCategories, mode, categories } = settings;
  const cacheKey = `${mode}::${normalizeText(categories.join('|'))}::${normalizeText(titleText)}`;

  if (checkedTitles.has(cacheKey)) {
    if (checkedTitles.get(cacheKey) === 'block') {
      hideVideoCard(card);
      if (options.skipWhenHidden) skipHiddenShort();
    }
    return;
  }

  if (mode === 'block') {
    const keywordMatch = getBlockedKeywordMatch(videoText, blockedCategories);
    if (keywordMatch) {
      checkedTitles.set(cacheKey, 'block');
      hideVideoCard(card);
      if (options.skipWhenHidden) skipHiddenShort();
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
      if (options.skipWhenHidden) skipHiddenShort();
      console.log(`[YouTube Blocker] Hidden by ${result.reason}: "${titleText}"`);
    }
  } catch (err) {
    console.error('[YouTube Blocker] Failed to connect to Python server:', err);
    checkedTitles.delete(cacheKey);
  }
}

async function filterYoutubeFeed() {
  const settings = await getFilterSettings();
  const { blockedCategories, mode, categories } = settings;

  if (settings.trustedEducationReferrer) {
    console.log(`[YouTube Blocker] Allowing YouTube link from trusted education site: ${settings.trustedEducationReferrer}`);
    return;
  }

  const videoCards = document.querySelectorAll(VIDEO_CARD_SELECTOR);

  if (mode === 'block' && blockedCategories.length === 0) {
    return;
  }

  videoCards.forEach(async (card) => {
    const titleText = getTitleText(card);
    if (!titleText) return;

    const videoText = getCardText(card, titleText);
    evaluateAndHideCard(card, titleText, videoText, settings);
  });
}

async function filterCurrentShort() {
  if (!isShortsPage()) return;

  const settings = await getFilterSettings();
  const { blockedCategories, mode, categories } = settings;

  if (settings.trustedEducationReferrer) {
    console.log(`[YouTube Blocker] Allowing Short from trusted education site: ${settings.trustedEducationReferrer}`);
    return;
  }

  if (mode === 'block' && blockedCategories.length === 0) {
    return;
  }

  if (mode === 'allow_only' && categories.length === 0) {
    return;
  }

  const shortCards = getCurrentShortCards();

  shortCards.forEach((shortCard) => {
    const titleText = getCurrentShortTitleText(shortCard);
    if (!titleText) return;

    const videoText = getCardText(shortCard, titleText);
    evaluateAndHideCard(shortCard, titleText, videoText, settings, {
      skipWhenHidden: true,
    });
  });
}

async function filterWatchPage() {
  if (!isWatchPage()) return;

  const settings = await getFilterSettings();
  const { blockedCategories, mode, categories } = settings;

  if (settings.trustedEducationReferrer) {
    console.log(`[YouTube Blocker] Allowing watch page from trusted education site: ${settings.trustedEducationReferrer}`);
    return;
  }

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

function observeYoutubeFeed() {
  if (isObserving) return;

  const observerCallback = debounce(() => {
    checkedTitles.clear();
    filterYoutubeFeed();
    filterCurrentShort();
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

function startYoutubeFiltering() {
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (
      areaName === 'local' &&
      (
        changes.blockedCategories ||
        changes.allowedCategories ||
        changes.mode ||
        changes.trustedEducationSites
      )
    ) {
      checkedTitles.clear();
      filterYoutubeFeed();
      filterCurrentShort();
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
    filterWatchPage();
  });
}
