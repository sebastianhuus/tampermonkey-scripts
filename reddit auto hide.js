// ==UserScript==
// @name         Reddit Auto Hide
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  Automatically hides Reddit posts whose titles match configurable keyword filters
// @match        https://www.reddit.com/*
// @match        https://*.reddit.com/*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function () {
  "use strict";

  // ── Config ───────────────────────────────────────────────────────────
  // Add keywords or phrases (case-insensitive). Regex patterns also work.
  const FILTERS = [];

  const SHOW_COUNTER = true; // show a badge with the hidden post count

  // ── Helpers ──────────────────────────────────────────────────────────
  const compiled = FILTERS.map((f) =>
    f instanceof RegExp
      ? f
      : new RegExp(f.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"),
  );

  function matchesFilter(title) {
    return compiled.some((re) => re.test(title));
  }

  function getTitle(post) {
    // shreddit-post exposes the title as an attribute and/or inner element
    return (
      post.getAttribute("post-title") ||
      post.querySelector('[slot="title"]')?.textContent ||
      post.querySelector("h1,h2,h3")?.textContent ||
      ""
    );
  }

  // ── Counter badge ────────────────────────────────────────────────────
  let hiddenCount = 0;

  document.head.appendChild(
    Object.assign(document.createElement("style"), {
      textContent: `
        #qh-auto-counter {
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
        #qh-auto-counter.visible {
          opacity: 1;
        }
      `,
    }),
  );

  let counter, counterTimer;

  function bumpCounter() {
    if (!SHOW_COUNTER) return;
    hiddenCount++;
    if (!counter) {
      counter = document.createElement("div");
      counter.id = "qh-auto-counter";
      document.body.appendChild(counter);
    }
    counter.textContent = `Auto-hidden: ${hiddenCount} post${hiddenCount === 1 ? "" : "s"}`;
    counter.classList.add("visible");
    clearTimeout(counterTimer);
    counterTimer = setTimeout(() => counter.classList.remove("visible"), 3000);
  }

  // ── Hide ─────────────────────────────────────────────────────────────
  function collapsePost(post) {
    post.dataset.qhAutoHidden = "1";
    const h = post.offsetHeight;
    post.style.cssText = `
      overflow: hidden;
      max-height: ${h}px;
      transition: opacity 0.2s ease, max-height 0.3s ease,
                  margin 0.3s ease, padding 0.3s ease;
    `;
    void post.offsetHeight;
    post.style.opacity = "0";
    post.style.maxHeight = "0";
    post.style.margin = "0";
    post.style.padding = "0";
    setTimeout(() => post.remove(), 350);
  }

  // ── Scan ─────────────────────────────────────────────────────────────
  function scanPosts() {
    document
      .querySelectorAll("shreddit-post:not([data-qh-auto-hidden])")
      .forEach((post) => {
        const title = getTitle(post);
        if (title && matchesFilter(title)) {
          console.log(`[Auto Hide] Hiding: "${title}"`);
          collapsePost(post);
          bumpCounter();
        }
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
