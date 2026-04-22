// ==UserScript==
// @name         LinkedIn Jobs - Auto Filter
// @namespace    http://tampermonkey.net/
// @version      1.2
// @description  Auto-dismiss and highlight LinkedIn job cards matching predefined roles or companies
// @author       You
// @match        https://www.linkedin.com/jobs/*
// @grant        none
// ==/UserScript==

(function () {
  'use strict';

  // ============================================================
  //  CONFIGURE YOUR FILTERS HERE
  // ============================================================

  const FILTERED_ROLES = [
  ];

  const FILTERED_COMPANIES = [
  ];

  // 'highlight' = orange border + faded (testing mode)
  // 'hide'      = display:none
  const VISUAL_MODE = 'highlight';

  const CLICK_DISMISS = true;
  const DISMISS_DELAY_MS = 600;

  // ============================================================

  function matchesFilter(text, filters) {
    return filters.some(f => text.toLowerCase().includes(f.toLowerCase()));
  }

  function getJobTitle(card) {
    const el = card.querySelector('.artdeco-entity-lockup__title');
    return el ? el.textContent.trim() : '';
  }

  function getCompany(card) {
    const el = card.querySelector('.artdeco-entity-lockup__subtitle');
    return el ? el.textContent.trim() : '';
  }

  function isDismissed(card) {
    const container = card.querySelector('.job-card-container');
    return container && container.classList.contains('job-card-list--is-dismissed');
  }

  function applyVisual(card) {
    if (VISUAL_MODE === 'hide') {
      card.style.display = 'none';
    } else {
      card.style.outline = '3px solid orange';
      card.style.opacity = '0.4';
    }
  }

  const dismissQueue = [];

  function processCard(card) {
    // KEY FIX: skip empty shell cards — only process once .job-card-container exists
    if (!card.querySelector('.job-card-container')) return;

    // Skip already processed cards
    if (card.dataset.lfProcessed) return;
    card.dataset.lfProcessed = 'true';

    if (isDismissed(card)) {
      applyVisual(card);
      return;
    }

    const title   = getJobTitle(card);
    const company = getCompany(card);
    const matched = matchesFilter(title, FILTERED_ROLES) || matchesFilter(company, FILTERED_COMPANIES);

    if (matched) {
      console.log(`[LI Filter] Matched: "${title.replace(/\s+/g,' ').substring(0, 40)}" @ "${company}"`);
      applyVisual(card);
      if (CLICK_DISMISS) dismissQueue.push(card);
    }
  }

  let dismissRunning = false;
  async function processDismissQueue() {
    if (dismissRunning) return;
    dismissRunning = true;
    while (dismissQueue.length > 0) {
      const card = dismissQueue.shift();
      const btn = card.querySelector('button[aria-label*="Dismiss"]');
      if (btn) {
        btn.click();
        await new Promise(r => setTimeout(r, DISMISS_DELAY_MS));
      }
    }
    dismissRunning = false;
  }

  function runFilter() {
    document.querySelectorAll('main li.scaffold-layout__list-item').forEach(processCard);
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