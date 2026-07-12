// ==UserScript==
// @name         Tekna Oslo - Hide Events
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  Hides Tekna Oslo event listings from unwanted event groups (e.g. Senior Forum, Seniorteknologene)
// @match        https://www.tekna.no/*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function () {
  'use strict';

  const FILTERED_GROUPS = [
  ];

  function matchesFilter(title) {
    return FILTERED_GROUPS.some(g => title.toLowerCase().startsWith(g.toLowerCase() + ':'));
  }

  function getTitle(item) {
    const el = item.querySelector('.course-block__row-info p');
    return el ? el.textContent.trim() : '';
  }

  function processItem(item) {
    if (item.dataset.thHidden) return;
    item.dataset.thHidden = 'true';

    const title = getTitle(item);
    if (matchesFilter(title)) {
      console.log(`[Tekna Hide] Hiding: "${title}"`);
      item.style.display = 'none';
    }
  }

  function scanEvents() {
    document.querySelectorAll('.course-block__list-item').forEach(processItem);
  }

  scanEvents();

  let scanQueued = false;
  const observer = new MutationObserver(() => {
    if (scanQueued) return;
    scanQueued = true;
    requestAnimationFrame(() => {
      scanEvents();
      scanQueued = false;
    });
  });

  observer.observe(document.body, { childList: true, subtree: true });
})();
