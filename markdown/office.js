/**
 * Office Viewer (cweijan.vscode-office) Markdown editor installer. The page
 * patch loads it after the generated rastin.config.js and the shared
 * webview/direction.js, and gives it a `.vditor-reset` root in either edit
 * mode (WYSIWYG and IR). The engine, not the selectors, is what this shares
 * with the chat and the built-in Markdown preview.
 */
(function () {
  'use strict';

  // Both modes render the same block tags; IR adds `data-block` wrappers but
  // keeps the tag, so one selector covers them.
  const BLOCK_SELECTOR =
    'p,li,h1,h2,h3,h4,h5,h6,blockquote,td,th,ul,ol,table,dl,dt,dd';

  // Rendered code and math are LTR islands: they do not vote and never take
  // a dir of their own. The IR editor root is itself a <pre>, so bare `pre`
  // is not an island here.
  const ISLAND = [
    '.vditor-wysiwyg__block',
    '.vditor-wysiwyg__pre',
    '.vditor-wysiwyg__preview',
    '.vditor-ir__node[data-type="code-block"]',
    '.vditor-ir__node[data-type="math-block"]',
    '.vditor-ir__node[data-type="math-inline"]',
    '.vditor-ir__node[data-type="yaml-front-matter"]',
    '.vditor-ir__marker--pre',
    '.vditor-ir__preview',
    'pre code',
    'code',
    'kbd',
    'samp',
  ].join(',');

  const ROOT = '.vditor-wysiwyg .vditor-reset, .vditor-ir .vditor-reset';

  // Set on each editor root, the same marker idea as the preview stylesheet:
  // the CSS is static and inert until the installer reaches the document.
  const MARKER = 'data-rastin-office';

  // Caret moves fire in bursts; one pass after the burst is enough.
  const DELAY = 120;

  // The run of letters that ends the text before the caret: a word in progress.
  const PARTIAL_WORD = /[\p{L}\p{M}\p{N}]+$/u;

  function inIsland(element) {
    return !!(element.closest && element.closest(ISLAND));
  }

  /**
   * Whether the caret is inside `seat`. Splitting a text node under the
   * caret would move it, so the block being edited keeps its text intact.
   */
  function caretIn(seat, doc) {
    const selection =
      typeof doc.getSelection === 'function' ? doc.getSelection() : null;
    if (!selection || selection.rangeCount === 0) return false;
    const node = selection.anchorNode;
    return node !== null && seat.contains(node);
  }

  /**
   * The block's prose with the word under the caret left out. A word still
   * being typed must not vote: its first letters can read as the other
   * direction, and the block would flip on every keystroke. A block with no
   * finished words yet votes with what it has, so a new line takes its
   * direction at once.
   */
  function settledText(D, block, doc) {
    const selection = doc.getSelection();
    const range = doc.createRange();
    range.setStart(block, 0);
    range.setEnd(selection.anchorNode, selection.anchorOffset);
    const partial = PARTIAL_WORD.exec(range.toString())?.[0] ?? '';
    const text = D.seatText(block);
    const settled =
      partial && text.endsWith(partial) ? text.slice(0, -partial.length) : text;
    return settled.trim() ? settled : text;
  }

  /** Give every prose block under `root` its own direction and its arrows. */
  function orient(D, root, doc) {
    for (const block of root.querySelectorAll(BLOCK_SELECTOR)) {
      if (inIsland(block)) continue;
      if (caretIn(block, doc)) {
        D.orientSeat(block, settledText(D, block, doc));
      } else {
        D.orientSeat(block);
        D.mirrorSeatArrows(block, doc);
      }
    }
  }

  /**
   * Orient every open editor. The config carries the settings a webview
   * cannot read for itself; a missing config means the defaults.
   * @returns {boolean} whether an editor was oriented
   */
  function install(D, doc, config) {
    if (!D || !doc) return false;
    const values = config || {};
    if (values.enabled === false) return false;

    const roots = doc.querySelectorAll(ROOT);
    if (roots.length === 0) return false;

    const forced =
      values.direction === 'rtl' || values.direction === 'ltr'
        ? values.direction
        : null;
    if (forced) globalThis.__rastinForcedDir = forced;
    else delete globalThis.__rastinForcedDir;

    for (const root of roots) {
      root.setAttribute(MARKER, '');
      // The editor starts with no dir; a forced direction pins the root
      // before the first pass, for text Vditor did not wrap in a block.
      if (forced) root.setAttribute('dir', forced);
      orient(D, root, doc);
    }
    return true;
  }

  function start() {
    const D = globalThis.__rastinDirection;
    install(D, document, globalThis.__rastinPreview);

    if (typeof MutationObserver !== 'function') return;

    // Vditor replaces the block being typed on most keystrokes, and the new
    // block has no direction until a pass sets one. Observer callbacks run as
    // microtasks, before the browser paints, so the pass lands before the wrong
    // direction is ever shown. A timer would paint it for a frame first.
    // The pass rewrites text nodes of its own (the LTR-seat normalize and the
    // arrow spans), and engines report those writes even when nothing changed.
    // Dropping the records keeps a pass from scheduling the next one.
    const observer = new MutationObserver(() => {
      install(D, document, globalThis.__rastinPreview);
      observer.takeRecords();
    });

    // The editor is created after this script runs, and both modes rewrite
    // their DOM while typing, so observe the document rather than a root.
    observer.observe(document.body || document.documentElement, {
      childList: true,
      subtree: true,
      characterData: true,
    });

    // A block that was being edited keeps its arrows unwrapped until the
    // caret leaves it. Caret moves change no DOM, so they schedule the pass.
    let timer = 0;
    const later = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        install(D, document, globalThis.__rastinPreview);
      }, DELAY);
    };
    document.addEventListener('selectionchange', later);
    document.addEventListener('focusout', later, true);
  }

  const api = { BLOCK_SELECTOR, ISLAND, ROOT, MARKER, orient, install };

  globalThis.__rastinOffice = api;
  if (typeof module === 'object' && module.exports) module.exports = api;

  if (typeof document !== 'undefined') {
    // The page loads this script synchronously before Vditor builds, so the
    // observer already sees the first editor appear.
    if (document.body) start();
    else window.addEventListener('DOMContentLoaded', start, { once: true });
  }
})();
