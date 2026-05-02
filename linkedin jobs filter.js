// ==UserScript==
// @name         LinkedIn Jobs - Auto Filter
// @namespace    http://tampermonkey.net/
// @version      1.3
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
    // Cover both search-page and collections-page layouts
    const cards = document.querySelectorAll(
      'main li.scaffold-layout__list-item, main li[data-occludable-job-id], main div.job-card-container'
    );
    cards.forEach(processCard);
    processDismissQueue();
  }

  window.addEventListener('load', () => setTimeout(runFilter, 1500));

  function startObserving() {
    const mainEl = document.querySelector('main');
    if (mainEl) {
      const observer = new MutationObserver(runFilter);
      observer.observe(mainEl, { childList: true, subtree: true });
    } else {
      setTimeout(startObserving, 500);
    }
  }
  startObserving();
})();