/**
 * Webview installer, appended to Claude Code's webview/index.js after
 * src/direction.js. Every paragraph-sized block decides its own direction by
 * its leading word run; the message root only handles bare text. Flow arrows
 * are mirrored per block, so an RTL paragraph never mirrors an LTR one.
 */
(function () {
  'use strict';

  var D = globalThis.__rastinDirection;
  if (!D || typeof document === 'undefined') return;

  // Message roots: assistant markdown, the user bubble wrapper, and todo
  // item text (todos live inside a tool block, outside the markdown root).
  var TODO_CONTENT = '[class*="todoItem_"] [class*="content_"]';
  var MARKDOWN_ROOT = '[class*="root_"]';
  var ROOT_SELECTOR =
    '[data-testid="assistant-message"] [class*="root_"],' +
    '[class*="userMessage_"],' +
    TODO_CONTENT;

  // Paragraph-sized blocks that get their own verdict.
  var BLOCK_SELECTOR =
    'p,li,h1,h2,h3,h4,h5,h6,blockquote,td,th,ul,ol,table,dl,dt,dd';

  var ISLAND = D.SEAT_ISLAND;

  function inIsland(element) {
    return !!(element.closest && element.closest(ISLAND));
  }

  function orientBlock(block) {
    D.orientSeat(block);
    D.mirrorSeatArrows(block, block.ownerDocument);
  }

  function orientRoot(root) {
    // Markdown inside a tool card is still prose: orient it instead of
    // inheriting the card's LTR chrome. Code blocks remain islands.
    if (
      inIsland(root) &&
      !root.matches(TODO_CONTENT) &&
      !root.matches(MARKDOWN_ROOT)
    )
      return;

    var blocks = root.querySelectorAll(BLOCK_SELECTOR);
    var oriented = false;
    for (var i = 0; i < blocks.length; i++) {
      var block = blocks[i];
      if (inIsland(block)) continue;
      orientBlock(block);
      oriented = true;
    }

    // The root still decides the bubble side (user row) and covers plain
    // text that markdown did not wrap in a paragraph.
    D.orientSeat(root);
    if (!oriented) D.mirrorSeatArrows(root, root.ownerDocument);
  }

  function sweep() {
    if (!document.querySelectorAll) return;
    for (var root of document.querySelectorAll(ROOT_SELECTOR)) {
      orientRoot(root);
    }
  }

  var pending = new Set();
  var sweepQueued = false;
  var rafId = 0;
  var schedule =
    typeof requestAnimationFrame === 'function'
      ? requestAnimationFrame
      : function (cb) {
          return setTimeout(cb, 0);
        };
  var cancel =
    typeof cancelAnimationFrame === 'function'
      ? cancelAnimationFrame
      : clearTimeout;

  function flush() {
    rafId = 0;
    if (sweepQueued) {
      sweepQueued = false;
      sweep();
    } else {
      for (var root of pending) orientRoot(root);
    }
    pending.clear();
  }

  function queue() {
    if (rafId) return;
    rafId = schedule(flush);
  }

  var observer = new MutationObserver(function (records) {
    for (var record of records) {
      var target = record.target;
      var host =
        target !== null &&
        typeof target === 'object' &&
        target.nodeType === 3
          ? target.parentElement
          : target;
      if (host === null || typeof host !== 'object' || !('closest' in host)) {
        if (record.type === 'childList') sweepQueued = true;
        continue;
      }
      var root = host.closest(ROOT_SELECTOR);
      if (root === null || root === undefined) {
        if (record.type === 'childList') sweepQueued = true;
        continue;
      }
      pending.add(root);
    }
    if (pending.size > 0 || sweepQueued) queue();
  });

  function start() {
    sweep();
    if (document.body) {
      observer.observe(document.body, {
        childList: true,
        subtree: true,
        characterData: true,
      });
    }
    if (document.fonts && document.fonts.load) {
      document.fonts.load('13px "IRANYekanX"').catch(function () {});
      document.fonts.load('700 13px "IRANYekanX"').catch(function () {});
    }
  }

  if (document.body) start();
  else document.addEventListener('DOMContentLoaded', start, { once: true });
})();
