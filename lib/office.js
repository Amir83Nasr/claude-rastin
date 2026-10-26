'use strict';

const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const bridge = require('./bridge');
const {
  EXTENSION_DIRS,
  exists,
  stripBlocks,
  withLock,
  writeAtomic,
  writeIfChanged,
} = require('./patch');

// ── TARGET ─────────────────────────────────────────────────────────────

// Office Viewer (cweijan.vscode-office) serves its custom "Markdown Editor"
// from this page. The extension reads the file from disk whenever an editor
// opens, so a marked block in it reaches every editor until the extension is
// updated (which Rastin re-patches like any Claude Code build).
const TARGET_PREFIX = 'cweijan.vscode-office-';
const HTML = 'resource/markdown/index.html';
const CONFIG = 'resource/markdown/rastin.config.js';

// The page has a <base> pointing at its own directory, so the patched tags
// are relative. The engine is the same file the chat and the Markdown
// preview use.
const ASSETS = [
  { from: 'markdown/office.css', to: 'resource/markdown/rastin.css' },
  { from: 'webview/direction.js', to: 'resource/markdown/rastin.direction.js' },
  { from: 'markdown/office.js', to: 'resource/markdown/rastin.office.js' },
];

// The leading newline belongs to START so removal restores the page
// byte-for-byte. HTML has no comment-free delimiter to conflict with.
const START = '\n<!-- rastin:start -->\n';
const END = '<!-- rastin:end -->\n';

// ── DISCOVERY ──────────────────────────────────────────────────────────

/**
 * Locate every installed Office Viewer whose Markdown editor page exists.
 * @param {{home?: string}} [options] overridable for tests
 * @returns {Promise<Array<{name: string, dir: string, htmlPath: string}>>}
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
      targets.push({ name, dir, htmlPath });
    }
  }
  return targets;
}

// ── SETTINGS BRIDGE ────────────────────────────────────────────────────

// The Office Viewer switch stands in for the preview switch; both surfaces
// read the same generated global.
function settings({ enabled, officeViewer, direction } = {}) {
  return bridge.values({ enabled, direction }, officeViewer);
}

function script(values) {
  return bridge.script(settings(values));
}

// ── PAGE ───────────────────────────────────────────────────────────────

function block(version) {
  return (
    [
      `<!-- rastin ${version} -->`,
      '<link rel="stylesheet" href="rastin.css">',
      '<script src="rastin.config.js"></script>',
      '<script src="rastin.direction.js"></script>',
      '<script src="rastin.office.js"></script>',
    ].join('\n') + '\n'
  );
}

/**
 * Insert the marked block before `</html>`, or append it when the page has
 * no closing tag (an unexpected page is still better patched than skipped).
 */
function inject(html, version) {
  const close = html.lastIndexOf('</html>');
  const marked = START + block(version) + END;
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
 * Apply the assets, the settings script, and the page block to one install.
 * @param {{name: string, dir: string, htmlPath: string}} target
 * @param {{assets: Array<{to: string, data: Buffer}>, config: string,
 *   version: string}} patch
 * @returns {Promise<string[]>} changed file labels
 */
async function patchTarget(target, { assets, config, version }) {
  return withLock(target.dir, async () => {
    const html = await fs.readFile(target.htmlPath, 'utf8');
    const base = stripBlocks(html, [[START, END]]);
    if (base.unmatched.length > 0) {
      throw new Error(
        `Rastin: found an unterminated patch marker in ${target.name}`,
      );
    }

    const changed = [];
    for (const asset of assets) {
      const file = path.join(target.dir, asset.to);
      const current = await fs.readFile(file).catch(() => null);
      if (current !== null && current.equals(asset.data)) continue;
      await writeAtomic(file, asset.data);
      changed.push(`${target.name}: ${path.basename(asset.to)}`);
    }

    const configFile = path.join(target.dir, CONFIG);
    const currentConfig = await fs.readFile(configFile, 'utf8').catch(() => '');
    if (await writeIfChanged(configFile, currentConfig, config)) {
      changed.push(`${target.name}: ${path.basename(CONFIG)}`);
    }

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
    const files = [...ASSETS.map((asset) => asset.to), CONFIG];
    for (const relative of files) {
      const file = path.join(target.dir, relative);
      if (!(await exists(file))) continue;
      await fs.rm(file, { force: true });
      changed.push(`${target.name}: ${path.basename(relative)}`);
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
 * Apply (or refresh) the Office Viewer patch on every installed copy.
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
  for (const target of targets) {
    // One locked or read-only install must not block the others.
    try {
      changed.push(...(await patchTarget(target, { assets, config, version })));
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
  CONFIG,
  ASSETS,
  START,
  END,
  findTargets,
  settings,
  script,
  inject,
  loadAssets,
  patchTarget,
  removeTarget,
  apply,
  remove,
};
