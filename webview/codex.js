/**
 * Codex (openai.chatgpt) webview installer. The page patch loads it after
 * the generated rastin.codex.config.js and the shared webview/direction.js.
 * Assistant replies and user messages are oriented per prose block; the
 * composer needs no pass because ProseMirror already gives every paragraph
 * `dir="auto"`, and a forced direction reaches it through the stylesheet.
 */
(function () {
  'use strict';

  // Codex marks assistant replies by text style and user messages by tone;
  // the composer is handled in CSS only.
  const MESSAGE_ROOTS =
    '[data-markdown-text-style="assistant-message"],' +
    '[data-markdown-text-tone="user-message"]';

  // Paragraph-sized blocks that get their own verdict.
  const BLOCK_SELECTOR =
    'p,li,h1,h2,h3,h4,h5,h6,blockquote,td,th,ul,ol,table,dl,dt,dd';

  // UI that lives inside a message but is not prose: copy targets, writing
  // blocks, and the learning card. Code sits inside the markdown root too,
  // and the shared island list already covers pre/code.
  const CODEX_ISLAND = [
    '[data-markdown-copy="exclude"]',
    '[data-writing-block-variant]',
    '[data-conversation-component="learning"]',
  ].join(',');

  const MARKER = 'data-rastin-codex';
  const DIR_MARKER = 'data-rastin-codex-dir';

  /** Give every prose block under `root` its own direction and arrows. */
  function orientRoot(D, root, doc) {
    const island = D.SEAT_ISLAND + ',' + CODEX_ISLAND;
    for (const block of root.querySelectorAll(BLOCK_SELECTOR)) {
      if (block.closest && block.closest(island)) continue;
      D.orientSeat(block);
      D.mirrorSeatArrows(block, doc);
    }
  }

  /**
   * Orient every message root. The config carries the settings a webview
   * cannot read for itself; a missing config means the defaults.
   * @returns {boolean} whether a message root was oriented
   */
  function install(D, doc, config) {
    if (!D || !doc) return false;
    const values = config || {};
    if (values.enabled === false) return false;

    const roots = doc.querySelectorAll(MESSAGE_ROOTS);
    if (roots.length === 0) return false;

    const forced =
      values.direction === 'rtl' || values.direction === 'ltr'
        ? values.direction
        : null;
    if (forced) {
      globalThis.__rastinForcedDir = forced;
      doc.documentElement.setAttribute(DIR_MARKER, forced);
    } else {
      delete globalThis.__rastinForcedDir;
      doc.documentElement.removeAttribute(DIR_MARKER);
    }

    // The stylesheet is inert until this marker lands, so the host keeps its
    // own font and alignment while no chat is on screen.
    doc.documentElement.setAttribute(MARKER, '');
    for (const root of roots) orientRoot(D, root, doc);
    return true;
  }

  function start() {
    const D = globalThis.__rastinDirection;
    if (!D || typeof document === 'undefined') return;

    const config = globalThis.__rastinCodex;
    // A disabled Rastin has nothing to watch: the generated config only
    // changes with a reload, which restarts this script.
    if (config && config.enabled === false) return;

    install(D, document, config);

    if (typeof MutationObserver !== 'function') return;

    const pending = new Set();
    let frame = 0;
    let observer;

    const schedule =
      typeof requestAnimationFrame === 'function'
        ? requestAnimationFrame
        : function (cb) {
            return setTimeout(cb, 0);
          };

    function flush() {
      frame = 0;
      if (!document.documentElement.hasAttribute(MARKER)) {
        // The first message arrived after the script ran.
        install(D, document, globalThis.__rastinCodex);
      } else {
        for (const root of pending) {
          if (root.isConnected) orientRoot(D, root, document);
        }
      }
      pending.clear();
      // Arrow spans and dir writes are mutations of our own; dropping the
      // records keeps a pass from scheduling the next one.
      observer.takeRecords();
    }

    function enqueue(node) {
      if (!node || node.nodeType !== 1) return;
      const root =
        typeof node.closest === 'function' ? node.closest(MESSAGE_ROOTS) : null;
      if (root) pending.add(root);
      if (typeof node.querySelectorAll !== 'function') return;
      for (const inner of node.querySelectorAll(MESSAGE_ROOTS)) {
        pending.add(inner);
      }
    }

    observer = new MutationObserver(function (records) {
      for (const record of records) {
        if (record.type === 'childList') {
          for (const node of record.addedNodes) enqueue(node);
        }
        const target = record.target;
        enqueue(
          target !== null && target.nodeType === 1
            ? target
            : target.parentElement,
        );
      }
      if (pending.size > 0 && frame === 0) frame = schedule(flush);
    });

    // Codex mounts the chat after this script runs and streams replies into
    // it, so observe the document rather than a root.
    observer.observe(document.body || document.documentElement, {
      childList: true,
      subtree: true,
      characterData: true,
    });
  }

  const api = {
    MESSAGE_ROOTS,
    BLOCK_SELECTOR,
    CODEX_ISLAND,
    MARKER,
    DIR_MARKER,
    orientRoot,
    install,
  };

  globalThis.__rastinCodexInstaller = api;
  if (typeof module === 'object' && module.exports) module.exports = api;

  if (typeof document !== 'undefined') {
    if (document.body) start();
    else window.addEventListener('DOMContentLoaded', start, { once: true });
  }
})();
