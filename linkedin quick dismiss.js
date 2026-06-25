// ==UserScript==
// @name         LinkedIn Quick Dismiss
// @namespace    http://tampermonkey.net/
// @version      1.1
// @description  Adds a local-only dismiss button to LinkedIn feed posts — removes from view without touching the algorithm
// @match        https://www.linkedin.com/*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function () {
  "use strict";

  const STORAGE_KEY = "li-dismissed-posts";
  const BUTTON_CLASS = "liqd-dismiss-btn";
  const MAX_STORED = 2000;

  // ── Persistence ──────────────────────────────────────────────────────
  function loadDismissed() {
    try {
      return new Set(JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]"));
    } catch {
      return new Set();
    }
  }

  function saveDismissed(set) {
    const entries = [...set];
    if (entries.length > MAX_STORED) entries.splice(0, entries.length - MAX_STORED);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  }

  const dismissed = loadDismissed();

  // ── Styles ───────────────────────────────────────────────────────────
  document.head.appendChild(
    Object.assign(document.createElement("style"), {
      textContent: `
        .${BUTTON_CLASS} {
          all: unset;
          cursor: pointer;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 32px;
          height: 32px;
          border-radius: 50%;
          color: rgba(0, 0, 0, 0.45);
          transition: background 0.15s ease, color 0.15s ease;
        }
        .${BUTTON_CLASS}:hover {
          background: rgba(0, 0, 0, 0.08);
          color: #b91c1c;
        }
        .${BUTTON_CLASS} svg {
          width: 16px;
          height: 16px;
          fill: currentColor;
          pointer-events: none;
        }
      `,
    })
  );

  // Build SVG via DOM API — avoids LinkedIn's Trusted Types policy that silently blocks innerHTML
  function makeDismissSvg() {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 16 16");
    svg.setAttribute("aria-hidden", "true");
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", "M14 3.41 9.41 8 14 12.59 12.59 14 8 9.41 3.41 14 2 12.59 6.59 8 2 3.41 3.41 2 8 6.59 12.59 2z");
    svg.appendChild(path);
    return svg;
  }

  // ── Helpers ──────────────────────────────────────────────────────────
  function getPostId(post) {
    const key = post.getAttribute("componentkey") || "";
    // Strip "expanded" prefix and "FeedType_..." suffix to isolate the stable post hash
    const id = key.replace(/^expanded/, "").replace(/FeedType_.+$/, "");
    return id || key;
  }

  function getFeedItemRoot(post) {
    // The outermost wrapper is div[data-lazy-mount-id], sitting 4 levels above the listitem.
    // Use closest() so we don't rely on a fixed number of hops.
    return post.closest("[data-lazy-mount-id]") ?? post.parentElement ?? post;
  }

  function collapseAndRemove(root) {
    const h = root.offsetHeight;
    root.style.cssText = `
      overflow: hidden;
      max-height: ${h}px;
      transition: opacity 0.2s ease, max-height 0.3s ease,
                  margin 0.3s ease, padding 0.3s ease;
    `;
    void root.offsetHeight;
    root.style.opacity = "0";
    root.style.maxHeight = "0";
    root.style.margin = "0";
    root.style.padding = "0";
    setTimeout(() => root.remove(), 350);
  }

  // ── Button injection ─────────────────────────────────────────────────
  function injectButton(post) {
    if (post.querySelector(`.${BUTTON_CLASS}`)) return;

    const btn = document.createElement("button");
    btn.className = BUTTON_CLASS;
    btn.appendChild(makeDismissSvg());
    btn.title = "Dismiss (local only — no algorithm signal)";
    btn.setAttribute("aria-label", "Dismiss post locally");
    btn.setAttribute("type", "button");

    btn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      const id = getPostId(post);
      if (id) {
        dismissed.add(id);
        saveDismissed(dismissed);
      }
      collapseAndRemove(getFeedItemRoot(post));
    }, true);

    // Prefer placing before the native "Hide post by" button; fall back to after
    // the control-menu button (present on promoted posts that have no hide button).
    const hideBtn = post.querySelector('button[aria-label^="Hide post by"]');
    const menuBtn = post.querySelector('button[aria-label^="Open control menu for post by"]');
    if (hideBtn) {
      hideBtn.parentNode.insertBefore(btn, hideBtn);
    } else if (menuBtn) {
      menuBtn.after(btn);
    } else {
      post.appendChild(btn);
    }
  }

  // ── Auto-hide previously dismissed posts ─────────────────────────────
  function autoDismissIfSeen(post) {
    const id = getPostId(post);
    if (!id || !dismissed.has(id)) return;
    getFeedItemRoot(post).style.display = "none";
  }

  // ── Scan ─────────────────────────────────────────────────────────────
  function scanPosts() {
    document
      .querySelectorAll('[role="listitem"][componentkey*="FeedType_"]:not([data-liqd])')
      .forEach((post) => {
        post.setAttribute("data-liqd", "1");
        autoDismissIfSeen(post);
        injectButton(post);
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
