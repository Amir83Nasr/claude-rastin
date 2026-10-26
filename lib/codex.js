'use strict';

const fsSync = require('node:fs');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const bridge = require('./bridge');
const payload = require('./payload');
const {
  EXTENSION_DIRS,
  copyFonts,
  exists,
  stripBlocks,
  withLock,
  writeAtomic,
  writeIfChanged,
} = require('./patch');

// ── TARGET ─────────────────────────────────────────────────────────────

// Codex (openai.chatgpt) serves a Vite-built React app from webview/. Rastin
// adds its own stylesheet and scripts next to the app's files and links them
// from the page, so the hashed app bundles are never touched and a Codex
// update only needs the page re-patched.
const TARGET_PREFIX = 'openai.chatgpt-';
const HTML = 'webview/index.html';
const STYLESHEET = 'webview/rastin.codex.css';
const CONFIG = 'webview/rastin.codex.config.js';
const FONTS_DIR = 'webview/rastin-fonts';

// The stylesheet sits in webview/, and the page's <base> points there too,
// so the copied faces are one relative folder away.
const FONT_DIR_URL = 'rastin-fonts';

// The page loads these in order: the settings, the shared engine, then the
// Codex installer. The stylesheet is generated from the settings instead of
// copied, so it is not in ASSETS.
const ASSETS = [
  { from: 'webview/direction.js', to: 'webview/rastin.direction.js' },
  { from: 'webview/codex.js', to: 'webview/rastin.codex.js' },
];

// The leading newline belongs to START so removal restores the page
// byte-for-byte. HTML has no comment-free delimiter to conflict with.
const START = '\n<!-- rastin:start -->\n';
const END = '<!-- rastin:end -->\n';

// The prose roots the installer orients: assistant replies, and user
// messages (Codex marks those by tone, not by text style).
const MESSAGE_ROOTS = [
  "[data-markdown-text-style='assistant-message']",
  "[data-markdown-text-tone='user-message']",
].join(', ');

// The composer already gives every paragraph `dir="auto"` through its
// ProseMirror schema; touching that DOM would fight the editor. A forced
// direction still reaches it through CSS. The class prefix is the stable
// half of Codex's hashed CSS-module names.
const COMPOSER =
  "[class*='RichTextInput_'] .ProseMirror, " +
  '.ProseMirror[data-composer-markdown]';

const ROOTS = `${MESSAGE_ROOTS}, ${COMPOSER}`;

const BLOCKS =
  'p, li, h1, h2, h3, h4, h5, h6, blockquote, td, th, ul, ol, table, dl, dt, dd';

// ── DISCOVERY ──────────────────────────────────────────────────────────

/**
 * Locate every installed Codex extension whose webview page exists.
 * @param {{home?: string}} [options] overridable for tests
 * @returns {Promise<Array<{name: string, dir: string, htmlPath: string,
 *   fontsDir: string}>>}
 */
async function findTargets({ home = os.homedir() } = {}) {
  const targets = [];
  for (const relative of EXTENSION_DIRS) {
    const root = path.join(home, relative, 'extensions');
    for (const name of await fs.readdir(root).catch(() => [])) {
      if (!name.startsWith(TARGET_PREFIX)) continue;
      const dir = path.join(root, name);
      const htmlPath = path.join(dir, HTML);
      if (!(await exists(htmlPath))) continue;
      targets.push({
        name,
        dir,
        htmlPath,
        fontsDir: path.join(dir, FONTS_DIR),
      });
    }
  }
  return targets;
}

// ── SETTINGS BRIDGE ────────────────────────────────────────────────────

// The Codex switch stands in for the per-surface switch the other installers
// read; all surfaces share the same direction.
function settings({ enabled, codex, direction } = {}) {
  return bridge.values({ enabled, direction }, codex);
}

function script(values) {
  return bridge.script(settings(values), '__rastinCodex');
}

function direction(value) {
  return value === 'rtl' || value === 'ltr' ? value : null;
}

// ── STYLESHEET ─────────────────────────────────────────────────────────

// A forced chat restates direction in CSS as well, because Codex puts
// `dir="auto"` on its markdown roots and on every composer paragraph. The
// installer's marker on <html> keeps the rule inert until Rastin runs.
function forcedCss(value) {
  const root = `html[data-rastin-codex][data-rastin-codex-dir='${value}']`;
  return [
    `${root} :is(${ROOTS}) {`,
    `  direction: ${value} !important;`,
    '  text-align: start !important;',
    '}',
    '',
    `${root} :is(${ROOTS}) :is(${BLOCKS}) {`,
    `  direction: ${value} !important;`,
    '  text-align: start !important;',
    '  unicode-bidi: isolate !important;',
    '}',
  ].join('\n');
}

function read(root, relative) {
  return fsSync.readFileSync(path.join(root, relative), 'utf8');
}

/**
 * Build the stylesheet the page loads: the font faces and variables the
 * shared payload knows, then the Codex rules.
 * @returns {{data: Buffer, fonts: object[], fontsSource: string}}
 */
function stylesheet(values, root) {
  const extra = payload.userFont(
    values.fontFile,
    payload.weight(values.fontWeight),
  );
  const vars = payload.fontVariables(values, extra);

  // Codex reads its chat size from this token in the markdown roots and the
  // composer. 0 keeps the host's own size.
  const requested = Number(values.fontSize);
  if (Number.isFinite(requested) && requested > 0) {
    const size = Math.min(Math.max(requested, 8), 32);
    vars.push(`  --codex-chat-font-size: ${size}px !important;`);
  }

  const blocks = [
    payload.fontFaces(extra, FONT_DIR_URL),
    `:root {\n${vars.join('\n')}\n}`,
    read(root, 'webview/codex.css'),
  ];
  const forced = direction(values.direction);
  if (forced) blocks.push(forcedCss(forced));

  return {
    data: Buffer.from(blocks.join('\n\n') + '\n'),
    fonts: extra ? [...payload.FONTS, extra] : payload.FONTS,
    fontsSource: path.join(root, 'fonts'),
  };
}

// ── PAGE ───────────────────────────────────────────────────────────────

function block(version) {
  return (
    [
      `<!-- rastin ${version} -->`,
      '<link rel="stylesheet" href="rastin.codex.css">',
      '<script src="rastin.codex.config.js"></script>',
      '<script src="rastin.direction.js"></script>',
      '<script src="rastin.codex.js"></script>',
    ].join('\n') + '\n'
  );
}

/**
 * Insert the marked block before `</body>`, or `</html>` for a page without
 * one (an unexpected page is still better patched than skipped).
 */
function inject(html, version) {
  const marked = START + block(version) + END;
  const body = html.lastIndexOf('</body>');
  if (body !== -1) return html.slice(0, body) + marked + html.slice(body);
  const close = html.lastIndexOf('</html>');
  if (close === -1) return html.replace(/\s*$/, '') + marked;
  return html.slice(0, close) + marked + html.slice(close);
}

// ── PATCH ──────────────────────────────────────────────────────────────

async function loadAssets(root) {
  return Promise.all(
    ASSETS.map(async (asset) => ({
      ...asset,
      data: await fs.readFile(path.join(root, asset.from)),
    })),
  );
}

/**
 * Apply the generated stylesheet, the scripts, the settings, the fonts, and
 * the page block to one install.
 * @param {{name: string, dir: string, htmlPath: string,
 *   fontsDir: string}} target
 * @param {{assets: Array<{to: string, data: Buffer}>,
 *   styles: {data: Buffer, fonts: object[], fontsSource: string},
 *   config: string, version: string}} patch
 * @returns {Promise<string[]>} changed file labels
 */
async function patchTarget(target, { assets, styles, config, version }) {
  return withLock(target.dir, async () => {
    const html = await fs.readFile(target.htmlPath, 'utf8');
    const base = stripBlocks(html, [[START, END]]);
    if (base.unmatched.length > 0) {
      throw new Error(
        `Rastin: found an unterminated patch marker in ${target.name}`,
      );
    }

    const changed = [];
    const files = [{ to: STYLESHEET, data: styles.data }, ...assets];
    for (const file of files) {
      const destination = path.join(target.dir, file.to);
      const current = await fs.readFile(destination).catch(() => null);
      if (current !== null && current.equals(file.data)) continue;
      await writeAtomic(destination, file.data);
      changed.push(`${target.name}: ${path.basename(file.to)}`);
    }

    const configFile = path.join(target.dir, CONFIG);
    const currentConfig = await fs.readFile(configFile, 'utf8').catch(() => '');
    if (await writeIfChanged(configFile, currentConfig, config)) {
      changed.push(`${target.name}: ${path.basename(CONFIG)}`);
    }

    const fonts = await copyFonts(target, styles);
    if (fonts.length > 0) changed.push(`${target.name}: fonts`);

    const next = inject(base.text, version);
    if (await writeIfChanged(target.htmlPath, html, next)) {
      changed.push(`${target.name}: index.html`);
    }
    return changed;
  });
}

async function removeTarget(target) {
  return withLock(target.dir, async () => {
    const changed = [];
    const files = [...ASSETS.map((asset) => asset.to), STYLESHEET, CONFIG];
    for (const relative of files) {
      const file = path.join(target.dir, relative);
      if (!(await exists(file))) continue;
      await fs.rm(file, { force: true });
      changed.push(`${target.name}: ${path.basename(relative)}`);
    }

    // The folder holds only Rastin's copies, so it goes as a whole.
    if (await exists(target.fontsDir)) {
      await fs.rm(target.fontsDir, { recursive: true, force: true });
      changed.push(`${target.name}: fonts`);
    }

    const html = await fs.readFile(target.htmlPath, 'utf8');
    const base = stripBlocks(html, [[START, END]]);
    if (await writeIfChanged(target.htmlPath, html, base.text)) {
      changed.push(`${target.name}: index.html`);
    }
    return changed;
  });
}

// ── PUBLIC API ─────────────────────────────────────────────────────────

/**
 * Apply (or refresh) the Codex patch on every installed copy.
 * @param {{root: string, version: string, home?: string}} options plus
 *   rastin.* values
 * @returns {Promise<{targets: number, changed: string[],
 *   failed: string[]}>}
 */
async function apply({ root, version, home, ...values }) {
  const targets = await findTargets({ home });
  const changed = [];
  const failed = [];
  if (targets.length === 0) return { targets: 0, changed, failed };

  const assets = await loadAssets(root);
  const config = script(values);
  const styles = stylesheet(values, root);
  for (const target of targets) {
    // One locked or read-only install must not block the others.
    try {
      changed.push(
        ...(await patchTarget(target, { assets, styles, config, version })),
      );
    } catch (error) {
      failed.push(`${target.name}: ${error.message}`);
    }
  }
  return { targets: targets.length, changed, failed };
}

/** Remove the patch and its generated files. */
async function remove({ home } = {}) {
  const targets = await findTargets({ home });
  const changed = [];
  const failed = [];
  for (const target of targets) {
    try {
      changed.push(...(await removeTarget(target)));
    } catch (error) {
      failed.push(`${target.name}: ${error.message}`);
    }
  }
  return { targets: targets.length, changed, failed };
}

module.exports = {
  TARGET_PREFIX,
  HTML,
  STYLESHEET,
  CONFIG,
  FONTS_DIR,
  ASSETS,
  START,
  END,
  MESSAGE_ROOTS,
  ROOTS,
  findTargets,
  settings,
  script,
  inject,
  stylesheet,
  loadAssets,
  patchTarget,
  removeTarget,
  apply,
  remove,
};
