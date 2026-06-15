// ==UserScript==
// @name         Reddit Hide Geo Posts
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  Hides Reddit "Posts near you" / "Popular in your country" geo-recommended posts
// @match        https://www.reddit.com/*
// @match        https://*.reddit.com/*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function () {
  "use strict";

  const SHOW_COUNTER = true;

  document.head.appendChild(
    Object.assign(document.createElement("style"), {
      textContent: `
        #qh-geo-counter {
          position: fixed;
          bottom: 24px;
          right: 24px;
          background: #1c1c1c;
          color: #fff;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
          font-size: 12px;
          font-weight: 600;
          padding: 6px 12px;
          border-radius: 20px;
          z-index: 99999;
          pointer-events: none;
          opacity: 0;
          transition: opacity 0.3s ease;
        }
        #qh-geo-counter.visible {
          opacity: 1;
        }
      `,
    }),
  );

  let hiddenCount = 0;
  let counter, counterTimer;

  function bumpCounter() {
    if (!SHOW_COUNTER) return;
    hiddenCount++;
    if (!counter) {
      counter = document.createElement("div");
      counter.id = "qh-geo-counter";
      document.body.appendChild(counter);
    }
    counter.textContent = `Geo-hidden: ${hiddenCount} post${hiddenCount === 1 ? "" : "s"}`;
    counter.classList.add("visible");
    clearTimeout(counterTimer);
    counterTimer = setTimeout(() => counter.classList.remove("visible"), 3000);
  }

  function collapsePost(article) {
    article.dataset.qhGeoHidden = "1";
    const h = article.offsetHeight;
    article.style.cssText = `
      overflow: hidden;
      max-height: ${h}px;
      transition: opacity 0.2s ease, max-height 0.3s ease,
                  margin 0.3s ease, padding 0.3s ease;
    `;
    void article.offsetHeight;
    article.style.opacity = "0";
    article.style.maxHeight = "0";
    article.style.margin = "0";
    article.style.padding = "0";
    setTimeout(() => article.remove(), 350);
  }

  function scanPosts() {
    // recommendation-source contains "geo" for all geo recommendation types:
    // "users_in_geo_also_like" (Popular in your country)
    // "geo_explore_subreddits" (Popular near you)
    document
      .querySelectorAll(
        "shreddit-post[recommendation-source*='geo']:not([data-qh-geo-hidden])",
      )
      .forEach((post) => {
        // collapse the wrapping <article> so the whole card disappears cleanly
        const article = post.closest("article") ?? post;
        if (article.dataset.qhGeoHidden) return;
        const title = post.getAttribute("post-title") || post.id || "(geo post)";
        console.log(`[Geo Hide] Hiding: "${title}"`);
        collapsePost(article);
        bumpCounter();
      });
  }

  scanPosts();

  let scanQueued = false;
  const observer = new MutationObserver(() => {
    if (scanQueued) return;
    scanQueued = true;
    requestAnimationFrame(() => {
      scanPosts();
      scanQueued = false;
    });
  });

  observer.observe(document.body, { childList: true, subtree: true });
})();
