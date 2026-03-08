// ==UserScript==
// @name         Reddit Quick Hide
// @namespace    http://tampermonkey.net/
// @version      7.1
// @description  Adds a visible Hide button to every post on your Reddit feed
// @match        https://www.reddit.com/*
// @match        https://*.reddit.com/*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function () {
  "use strict";

  const BUTTON_CLASS = "qh-hide-btn";
  const GQL_ENDPOINT = "https://www.reddit.com/svc/shreddit/graphql";

  // ── Styles ──────────────────────────────────────────────────────────
  document.head.appendChild(
    Object.assign(document.createElement("style"), {
      textContent: `
        .${BUTTON_CLASS} {
          all: unset;
          cursor: pointer;
          display: inline-flex;
          align-items: center;
          gap: 4px;
          padding: 4px 10px;
          border-radius: 20px;
          font-size: 12px;
          font-weight: 600;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
          color: #878a8c;
          background: transparent;
          transition: all 0.15s ease;
          line-height: 1;
          vertical-align: middle;
          position: relative;
          z-index: 100;
          pointer-events: auto;
        }
        .${BUTTON_CLASS}:hover {
          background: rgba(135, 138, 140, 0.15);
          color: #d32f2f;
        }
        .${BUTTON_CLASS} svg {
          width: 16px;
          height: 16px;
          fill: currentColor;
        }
        .${BUTTON_CLASS}.qh-busy {
          opacity: 0.4;
          pointer-events: none;
        }
      `,
    })
  );

  const HIDE_ICON = `<svg fill="currentColor" height="16" width="16" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg"><path d="M3.497 3.503a.9.9 0 10-1.273 1.273l.909.909A10.141 10.141 0 00.92 8.472a3.225 3.225 0 000 3.058A10.296 10.296 0 0010 16.973a10.13 10.13 0 003.709-.712l1.457 1.457a.897.897 0 001.274 0 .9.9 0 000-1.273L3.497 3.503zM10 15.172a8.497 8.497 0 01-7.495-4.494 1.448 1.448 0 010-1.354 8.436 8.436 0 011.9-2.365l2.069 2.068c-.062.271-.105.55-.105.84a3.77 3.77 0 003.767 3.767c.29 0 .569-.043.84-.106l1.31 1.31a8.284 8.284 0 01-2.284.335L10 15.172zm.476-7.237L8.874 6.333a3.722 3.722 0 011.26-.233 3.77 3.77 0 013.767 3.767c0 .444-.091.864-.233 1.26l-1.603-1.603a1.963 1.963 0 00-1.59-1.589zm8.605 3.595a10.297 10.297 0 01-2.22 2.792L15.59 13.05a8.512 8.512 0 001.905-2.372 1.448 1.448 0 000-1.354A8.496 8.496 0 007.69 5.15L6.282 3.742A10.249 10.249 0 0110 3.028c3.8 0 7.28 2.087 9.08 5.444a3.225 3.225 0 010 3.058z"></path></svg>`;

  // ── Helpers ─────────────────────────────────────────────────────────
  const btnLabel = (text) => `${HIDE_ICON} ${text}`;

  function getCsrfToken() {
    return document.cookie.match(/csrf_token=([^;]+)/)?.[1] ?? "";
  }

  function getPostId(post) {
    const raw = post.getAttribute("id") ||
                post.getAttribute("post-id") ||
                post.getAttribute("fullname") ||
                post.getAttribute("thingid") || "";
    if (!raw) return null;
    return raw.startsWith("t3_") ? raw : `t3_${raw}`;
  }

  /** Prevent an event from reaching Reddit's post-link overlay. */
  function blockEvent(e) {
    e.stopPropagation();
    e.stopImmediatePropagation();
  }

  // ── Core: hide via Reddit's GraphQL API ─────────────────────────────
  async function hidePost(post, btn) {
    btn.classList.add("qh-busy");
    btn.innerHTML = btnLabel("Hiding…");

    const fullname = getPostId(post);
    if (!fullname) {
      console.warn("[Quick Hide] Could not determine post ID");
      btn.innerHTML = btnLabel("Error");
      return;
    }

    try {
      const res = await fetch(GQL_ENDPOINT, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          operation: "UpdatePostHideState",
          variables: { input: { postId: fullname, hideState: "HIDDEN" } },
          csrf_token: getCsrfToken(),
        }),
      });

      if (res.ok) {
        // Animate out
        const h = post.offsetHeight;
        post.style.cssText = `
          overflow: hidden;
          max-height: ${h}px;
          transition: opacity 0.25s ease, max-height 0.35s ease,
                      margin 0.35s ease, padding 0.35s ease;
        `;
        void post.offsetHeight; // force reflow
        post.style.opacity = "0";
        post.style.maxHeight = "0";
        post.style.margin = "0";
        post.style.padding = "0";
        setTimeout(() => post.remove(), 400);
      } else {
        console.warn("[Quick Hide] API returned", res.status);
        btn.classList.remove("qh-busy");
        btn.innerHTML = btnLabel("Failed");
        setTimeout(() => { btn.innerHTML = btnLabel("Hide"); }, 2000);
      }
    } catch (err) {
      console.error("[Quick Hide]", err);
      btn.classList.remove("qh-busy");
      btn.innerHTML = btnLabel("Error");
      setTimeout(() => { btn.innerHTML = btnLabel("Hide"); }, 2000);
    }
  }

  // ── Button injection ────────────────────────────────────────────────
  function injectButton(post) {
    if (post.querySelector(`.${BUTTON_CLASS}`)) return;

    const btn = document.createElement("button");
    btn.className = BUTTON_CLASS;
    btn.innerHTML = btnLabel("Hide");
    btn.title = "Hide this post";

    btn.addEventListener("click", (e) => {
      e.preventDefault();
      blockEvent(e);
      hidePost(post, btn);
    }, true);
    btn.addEventListener("mousedown", blockEvent, true);
    btn.addEventListener("mouseup", blockEvent, true);

    // Insert next to the overflow menu in the credit bar
    const creditBar = post.querySelector('span[slot="credit-bar"]');
    if (creditBar) {
      const target = creditBar.querySelector("span.flex.items-center.ps-xs");
      if (target) {
        target.insertBefore(btn, target.firstChild);
        return;
      }
      creditBar.appendChild(btn);
      return;
    }
    post.appendChild(btn);
  }

  // ── Scanning with debounced observer ────────────────────────────────
  function scanPosts() {
    document.querySelectorAll("shreddit-post").forEach(injectButton);
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