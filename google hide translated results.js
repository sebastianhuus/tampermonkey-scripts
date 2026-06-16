// ==UserScript==
// @name         Google - Hide Translated Results
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  Removes Google search results linking to machine-translated Reddit pages (URLs containing reddit.com and ?tl=)
// @match        https://www.google.com/search*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function () {
  "use strict";

  function removeTranslatedResults() {
    document.querySelectorAll('a[href*="reddit.com"][href*="?tl="]').forEach((link) => {
      const card = link.closest(".MjjYud");
      if (card && !card.dataset.tlRemoved) {
        card.dataset.tlRemoved = "1";
        card.remove();
      }
    });
  }

  removeTranslatedResults();

  const observer = new MutationObserver(() => {
    removeTranslatedResults();
  });

  observer.observe(document.body, { childList: true, subtree: true });
})();
