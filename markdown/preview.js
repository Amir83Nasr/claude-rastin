/**
 * Markdown preview installer, contributed through `markdown.previewScripts`
 * next to webview/direction.js and the generated markdown/config.js.
 *
 * The preview loads contributed scripts with `async`, so the first install
 * waits for `load`: by then the engine and the config have both run. VS Code
 * updates an open preview by morphing `.markdown-body` and then dispatching
 * `vscode.markdown.updateContent`; the morph drops the attributes written
 * here, so that event re-orients the document.
 */
(function () {
  'use strict';

  // Paragraph-sized blocks decide their own direction, like the chat.
  const BLOCK_SELECTOR =
    'p,li,h1,h2,h3,h4,h5,h6,blockquote,td,th,ul,ol,table,dl,dt,dd';

  // Code is an LTR island: it does not vote and never takes a dir of its own.
  const ISLAND = 'pre,code,kbd,samp';

  const ROOT = '.markdown-body';

  function inIsland(element) {
    return !!(element.closest && element.closest(ISLAND));
  }

  /** Give every prose block under `root` its own direction and its arrows. */
  function orient(D, root, doc) {
    const blocks = root.querySelectorAll(BLOCK_SELECTOR);
    for (const block of blocks) {
      if (inIsland(block)) continue;
      D.orientSeat(block);
      D.mirrorSeatArrows(block, doc);
    }
  }

  /**
   * Orient the preview. The config carries the settings a preview script
   * cannot read for itself; a missing config (or a failed load) means the
   * defaults, so direction stays automatic.
   * @returns {boolean} whether the document was oriented
   */
  function install(D, doc, config) {
    if (!D || !doc) return false;
    const values = config || {};
    if (values.enabled === false) return false;

    const root = doc.querySelector(ROOT);
    if (!root) return false;

    // The stylesheet is static and always loads, so every rule is keyed on
    // this marker; with Rastin off the host styles stay untouched.
    root.setAttribute('data-rastin-preview', '');

    const forced = values.direction;
    if (forced === 'rtl' || forced === 'ltr') {
      globalThis.__rastinForcedDir = forced;
      // The host starts the wrapper at dir="auto"; a forced preview is
      // pinned before the first pass, for content markdown did not wrap.
      root.setAttribute('dir', forced);
    } else {
      delete globalThis.__rastinForcedDir;
    }

    orient(D, root, doc);
    return true;
  }

  // An update replaces or morphs blocks, so coalesce into one frame instead
  // of one sweep per mutation batch.
  let pending = false;
  let frame = 0;
  const schedule =
    typeof requestAnimationFrame === 'function'
      ? requestAnimationFrame
      : (callback) => setTimeout(callback, 0);

  function flush(D, doc) {
    frame = 0;
    if (!pending) return;
    pending = false;
    install(D, doc, globalThis.__rastinPreview);
  }

  function queue(D, doc) {
    pending = true;
    if (frame) return;
    frame = schedule(() => flush(D, doc));
  }

  function start() {
    install(globalThis.__rastinDirection, document, globalThis.__rastinPreview);
    window.addEventListener('vscode.markdown.updateContent', () =>
      queue(globalThis.__rastinDirection, document),
    );
  }

  const api = { BLOCK_SELECTOR, ISLAND, ROOT, orient, install };

  globalThis.__rastinMarkdownPreview = api;
  if (typeof module === 'object' && module.exports) module.exports = api;

  if (typeof document !== 'undefined') {
    if (document.readyState === 'complete') start();
    else window.addEventListener('load', start, { once: true });
  }
})();
