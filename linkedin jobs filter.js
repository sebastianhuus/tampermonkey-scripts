// ==UserScript==
// @name         LinkedIn Jobs - Auto Filter
// @namespace    http://tampermonkey.net/
// @version      1.4
// @description  Auto-dismiss and highlight LinkedIn job cards matching predefined roles or companies
// @match        https://www.linkedin.com/jobs/*
// @grant        none
// ==/UserScript==

(function () {
  'use strict';

  const FILTERED_ROLES = [];

  const FILTERED_COMPANIES = [
  ];

  const VISUAL_MODE = 'highlight'; // 'highlight' or 'hide'
  const CLICK_DISMISS = true;
  const DISMISS_DELAY_MS = 600;

  function matchesFilter(text, filters) {
    return filters.some(f => text.toLowerCase().includes(f.toLowerCase()));
  }

  // Resolve the actual .job-card-container element regardless of wrapper
  function getContainer(el) {
    if (el.classList.contains('job-card-container')) return el;
    return el.querySelector('.job-card-container');
  }

  function getJobTitle(container) {
    const el = container.querySelector('.artdeco-entity-lockup__title a, .artdeco-entity-lockup__title');
    return el ? el.textContent.trim() : '';
  }

  function getCompany(container) {
    const el = container.querySelector('.artdeco-entity-lockup__subtitle');
    return el ? el.textContent.trim() : '';
  }

  function isDismissed(container) {
    return container.classList.contains('job-card-list--is-dismissed');
  }

  function applyVisual(container) {
    if (VISUAL_MODE === 'hide') {
      container.style.display = 'none';
    } else {
      container.style.outline = '3px solid orange';
      container.style.opacity = '0.4';
    }
  }

  // --- Top Picks / collections tab (obfuscated markup, no artdeco classes) ---

  function getCollectionTitle(card) {
    const btn = card.querySelector('button[aria-label*="Dismiss"]');
    if (!btn) return '';
    return btn.getAttribute('aria-label')
      .replace(/^Dismiss\s+/i, '')
      .replace(/\s+job\s*$/i, '')
      .trim();
  }

  function getCollectionCompany(card) {
    // Company <p> is immediately before a sibling <p> whose text is "•"
    for (const p of card.querySelectorAll('p')) {
      const next = p.nextElementSibling;
      if (next && next.tagName === 'P' && next.textContent.trim() === '•') {
        return p.textContent.trim();
      }
    }
    return '';
  }

  function processCollectionCard(card) {
    if (card.dataset.lfProcessed) return;
    card.dataset.lfProcessed = 'true';

    const title   = getCollectionTitle(card);
    const company = getCollectionCompany(card);
    const matched = matchesFilter(title, FILTERED_ROLES) || matchesFilter(company, FILTERED_COMPANIES);

    if (matched) {
      console.log(`[LI Filter] Collection match: "${title.replace(/\s+/g,' ').substring(0, 40)}" @ "${company}"`);
      applyVisual(card);
      if (CLICK_DISMISS) dismissQueue.push(card);
    }
  }

  // --- Standard job list cards ---

  const dismissQueue = [];

  function processCard(el) {
    const container = getContainer(el);
    if (!container) return;
    if (container.dataset.lfProcessed) return;
    container.dataset.lfProcessed = 'true';

    if (isDismissed(container)) {
      applyVisual(container);
      return;
    }

    const title   = getJobTitle(container);
    const company = getCompany(container);
    const matched = matchesFilter(title, FILTERED_ROLES) || matchesFilter(company, FILTERED_COMPANIES);

    if (matched) {
      console.log(`[LI Filter] Matched: "${title.replace(/\s+/g,' ').substring(0, 40)}" @ "${company}"`);
      applyVisual(container);
      if (CLICK_DISMISS) dismissQueue.push(container);
    }
  }

  let dismissRunning = false;
  async function processDismissQueue() {
    if (dismissRunning) return;
    dismissRunning = true;
    while (dismissQueue.length > 0) {
      const container = dismissQueue.shift();
      const btn = container.querySelector('button[aria-label*="Dismiss"]');
      if (btn) {
        btn.click();
        await new Promise(r => setTimeout(r, DISMISS_DELAY_MS));
      }
    }
    dismissRunning = false;
  }

  function runFilter() {
    // Standard search/recommended pages
    document.querySelectorAll(
      'main li.scaffold-layout__list-item, main li[data-occludable-job-id], main div.job-card-container'
    ).forEach(processCard);

    // Top Picks tab — obfuscated markup, card root is an <a> with currentJobId in href
    document.querySelectorAll('main a[href*="currentJobId"]').forEach(processCollectionCard);

    processDismissQueue();
  }

  window.addEventListener('load', () => setTimeout(runFilter, 1500));

  let activeObserver = null;

  function startObserving() {
    const mainEl = document.querySelector('main');
    if (mainEl) {
      if (activeObserver) activeObserver.disconnect();
      activeObserver = new MutationObserver(runFilter);
      activeObserver.observe(mainEl, { childList: true, subtree: true });
    } else {
      setTimeout(startObserving, 500);
    }
  }
  startObserving();

  // Re-run on SPA navigation (LinkedIn uses History API — no page reload on email link clicks)
  function onSpaNav() {
    if (location.pathname.startsWith('/jobs')) {
      setTimeout(() => { startObserving(); runFilter(); }, 1500);
    }
  }

  const _push = history.pushState.bind(history);
  const _replace = history.replaceState.bind(history);
  history.pushState = function (...args) { _push(...args); onSpaNav(); };
  history.replaceState = function (...args) { _replace(...args); onSpaNav(); };
  window.addEventListener('popstate', onSpaNav);
})();