/**
 * Webview installer, appended to Claude Code's webview/index.js after
 * src/direction.js (auto mode only). It orients each message's markdown
 * root by its leading word run and mirrors RTL flow arrows.
 */
(function () {
  'use strict';

  var D = globalThis.__rastinDirection;
  if (!D || typeof document === 'undefined') return;

  var SEAT_SELECTOR =
    '[data-testid="assistant-message"] [class*="root_"],' +
    '[class*="userMessage_"]';

  function orient(seat) {
    D.orientSeat(seat);
    D.mirrorSeatArrows(seat, seat.ownerDocument);
  }

  function sweep() {
    if (!document.querySelectorAll) return;
    for (var seat of document.querySelectorAll(SEAT_SELECTOR)) orient(seat);
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
      for (var seat of pending) orient(seat);
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
      var seat = host.closest(SEAT_SELECTOR);
      if (seat === null || seat === undefined) {
        if (record.type === 'childList') sweepQueued = true;
        continue;
      }
      pending.add(seat);
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
