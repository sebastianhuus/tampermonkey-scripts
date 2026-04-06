// ==UserScript==
// @name         Reddit Quick Block
// @namespace    http://tampermonkey.net/
// @version      2.0
// @description  Adds a Block button to Reddit comments with undo toast
// @match        https://www.reddit.com/*
// @match        https://*.reddit.com/*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function () {
  "use strict";

  const BUTTON_CLASS = "qb-block-btn";
  const GQL_ENDPOINT = "https://www.reddit.com/svc/shreddit/graphql";
  const TOAST_DURATION = 5000; // ms before block is committed

  // ── Styles ───────────────────────────────────────────────────────────
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
        .${BUTTON_CLASS}.qb-busy {
          opacity: 0.4;
          pointer-events: none;
        }

        /* ── Comment pending state ── */
        .qb-pending {
          opacity: 0.35;
          pointer-events: none;
          transition: opacity 0.2s ease;
        }

        /* ── Toast container ── */
        #qb-toast-container {
          position: fixed;
          bottom: 24px;
          left: 50%;
          transform: translateX(-50%);
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 8px;
          z-index: 99999;
          pointer-events: none;
        }

        .qb-toast {
          pointer-events: auto;
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 12px 16px;
          background: #1c1c1c;
          color: #fff;
          border-radius: 8px;
          font-size: 13px;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
          font-weight: 500;
          box-shadow: 0 4px 16px rgba(0,0,0,0.4);
          position: relative;
          overflow: hidden;
          min-width: 260px;
          animation: qb-slide-in 0.2s ease;
        }

        @keyframes qb-slide-in {
          from { opacity: 0; transform: translateY(12px); }
          to   { opacity: 1; transform: translateY(0); }
        }

        .qb-toast.qb-toast-out {
          animation: qb-slide-out 0.2s ease forwards;
        }

        @keyframes qb-slide-out {
          from { opacity: 1; transform: translateY(0); }
          to   { opacity: 0; transform: translateY(12px); }
        }

        .qb-toast-label {
          flex: 1;
        }

        .qb-toast-undo {
          all: unset;
          cursor: pointer;
          color: #ff6314;
          font-weight: 700;
          font-size: 13px;
          padding: 2px 4px;
          border-radius: 4px;
          transition: opacity 0.15s;
          white-space: nowrap;
        }

        .qb-toast-undo:hover { opacity: 0.75; }

        /* Progress bar along the bottom of the toast */
        .qb-toast-bar {
          position: absolute;
          bottom: 0;
          left: 0;
          height: 3px;
          width: 100%;
          background: #ff6314;
          transform-origin: left;
          animation: qb-drain linear forwards;
        }
      `,
    })
  );

  // Inject the progress bar keyframes with the right duration dynamically
  const barStyle = document.createElement("style");
  barStyle.textContent = `
    @keyframes qb-drain {
      from { transform: scaleX(1); }
      to   { transform: scaleX(0); }
    }
  `;
  document.head.appendChild(barStyle);

  // ── Toast manager ────────────────────────────────────────────────────
  function getToastContainer() {
    let el = document.getElementById("qb-toast-container");
    if (!el) {
      el = document.createElement("div");
      el.id = "qb-toast-container";
      document.body.appendChild(el);
    }
    return el;
  }

  function showUndoToast(username, onUndo, onCommit) {
    const container = getToastContainer();

    const toast = document.createElement("div");
    toast.className = "qb-toast";
    toast.innerHTML = `
      <span class="qb-toast-label">Blocked <strong>u/${username}</strong></span>
      <button class="qb-toast-undo">Undo</button>
      <div class="qb-toast-bar" style="animation-duration: ${TOAST_DURATION}ms"></div>
    `;
    container.appendChild(toast);

    function dismiss(callback) {
      clearTimeout(timer);
      toast.classList.add("qb-toast-out");
      setTimeout(() => {
        toast.remove();
        callback?.();
      }, 200);
    }

    const timer = setTimeout(() => dismiss(onCommit), TOAST_DURATION);

    toast.querySelector(".qb-toast-undo").addEventListener("click", () => {
      dismiss(onUndo);
    });
  }

  // ── Helpers ──────────────────────────────────────────────────────────
  const BLOCK_ICON = `<svg fill="currentColor" height="16" width="16" viewBox="0 0 20 20"><path d="M10 2a8 8 0 100 16A8 8 0 0010 2zm-6 8a6 6 0 018.88-5.27L4.73 14.88A5.965 5.965 0 014 10zm6 6a5.965 5.965 0 01-3.88-1.44L15.27 5.12A6 6 0 0110 16z"/></svg>`;
  const btnLabel = (text) => `${BLOCK_ICON} ${text}`;

  function getCsrfToken() {
    return document.cookie.match(/csrf_token=([^;]+)/)?.[1] ?? "";
  }

  function getAuthorInfo(comment) {
    const overflow = comment.querySelector("shreddit-overflow-menu");
    if (!overflow) return null;
    const redditorId = overflow.getAttribute("author-id");
    const username = overflow.getAttribute("author-name") || comment.getAttribute("author");
    return redditorId ? { redditorId, username } : null;
  }

  function isOwnComment(comment) {
    const actionRow = comment.querySelector("shreddit-comment-action-row");
    const overflow = comment.querySelector("shreddit-overflow-menu");
    if (!actionRow || !overflow) return false;
    return actionRow.getAttribute("user-id") === overflow.getAttribute("author-id");
  }

  function blockEvent(e) {
    e.stopPropagation();
    e.stopImmediatePropagation();
  }

  // ── API calls ────────────────────────────────────────────────────────
  async function setBlockState(redditorId, blockState) {
    return fetch(GQL_ENDPOINT, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        operation: "UpdateRedditorBlockState",
        variables: { input: { redditorId, blockState } },
        csrf_token: getCsrfToken(),
      }),
    });
  }

  // ── Animate comment out and remove ───────────────────────────────────
  function collapseComment(comment) {
    const h = comment.offsetHeight;
    comment.style.cssText = `
      overflow: hidden;
      max-height: ${h}px;
      transition: opacity 0.25s ease, max-height 0.35s ease,
                  margin 0.35s ease, padding 0.35s ease;
    `;
    void comment.offsetHeight;
    comment.style.opacity = "0";
    comment.style.maxHeight = "0";
    comment.style.margin = "0";
    comment.style.padding = "0";
    setTimeout(() => comment.remove(), 400);
  }

  // ── Core block flow ──────────────────────────────────────────────────
  async function handleBlock(comment, btn) {
    const info = getAuthorInfo(comment);
    if (!info) {
      console.warn("[Quick Block] Could not find author info");
      return;
    }

    // 1. Fire the block API immediately
    let blockOk = false;
    try {
      const res = await setBlockState(info.redditorId, "BLOCKED");
      blockOk = res.ok;
    } catch (err) {
      console.error("[Quick Block]", err);
    }

    if (!blockOk) {
      btn.classList.remove("qb-busy");
      btn.innerHTML = btnLabel("Failed");
      setTimeout(() => { btn.innerHTML = btnLabel("Block"); }, 2000);
      return;
    }

    // 2. Dim the comment while the toast is showing
    comment.classList.add("qb-pending");

    // 3. Show the undo toast
    showUndoToast(
      info.username,
      // ── Undo callback ──
      async () => {
        comment.classList.remove("qb-pending");
        btn.classList.remove("qb-busy");
        btn.innerHTML = btnLabel("Block");
        try {
          await setBlockState(info.redditorId, "UNBLOCKED");
        } catch (err) {
          console.error("[Quick Block] Unblock failed", err);
        }
      },
      // ── Commit callback (toast expired) ──
      () => {
        collapseComment(comment);
      }
    );
  }

  // ── Button injection ─────────────────────────────────────────────────
  function injectButton(comment) {
    if (comment.querySelector(`.${BUTTON_CLASS}`)) return;
    if (isOwnComment(comment)) return;
    if (!getAuthorInfo(comment)) return;

    const btn = document.createElement("button");
    btn.className = BUTTON_CLASS;
    btn.innerHTML = btnLabel("Block");
    btn.title = "Block this user";

    btn.addEventListener("click", (e) => {
      e.preventDefault();
      blockEvent(e);
      btn.classList.add("qb-busy");
      btn.innerHTML = btnLabel("Blocking…");
      handleBlock(comment, btn);
    }, true);
    btn.addEventListener("mousedown", blockEvent, true);
    btn.addEventListener("mouseup", blockEvent, true);

    const actionRow = comment.querySelector('div[slot="actionRow"]');
    if (actionRow) {
      actionRow.appendChild(btn);
    } else {
      comment.appendChild(btn);
    }
  }

  // ── Scanning with debounced observer ─────────────────────────────────
  function scanComments() {
    document.querySelectorAll("shreddit-comment").forEach(injectButton);
  }

  scanComments();

  let scanQueued = false;
  const observer = new MutationObserver(() => {
    if (scanQueued) return;
    scanQueued = true;
    requestAnimationFrame(() => {
      scanComments();
      scanQueued = false;
    });
  });
  observer.observe(document.body, { childList: true, subtree: true });
})();