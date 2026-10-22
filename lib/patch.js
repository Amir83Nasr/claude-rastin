'use strict';

const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

// ── MARKERS ────────────────────────────────────────────────────────────

// The leading newline belongs to the marker so removal restores the file
// byte-for-byte (patched = base + START + payload + END).
const START = '\n/* rastin:start */\n';
const END = '\n/* rastin:end */\n';

// Start/end markers written by yechielby.claude-code-rtl. Rastin takes over
// the same files; these blocks are stripped before its own patch lands.
const FOREIGN_BLOCKS = [
  [
    '/* RTL Text Support for Claude Code VS Code / Cursor / Antigravity Extension - Added by script */',
    '/* End RTL Text Support for Claude Code VS Code / Cursor / Antigravity Extension */',
  ],
  ['/* RTL Toggle Button - Added by script */', '/* End RTL Toggle Button */'],
  ['/* RTL Plan Preview Start */', '/* RTL Plan Preview End */'],
  [
    '/* RTL Plan Preview JS Start */',
    '/* RTL Plan Preview JS End */',
  ],
];

// Prefix payload.js gives the copied user font; any file with it that the
// current settings do not reference is stale and is removed.
const USER_FONT_PREFIX = 'rastin-user-font';

const LOCK = '.rastin.lock';
const LOCK_TIMEOUT_MS = 15000;
const LOCK_STALE_MS = 30000;
const TMP_SUFFIX = '.rastin-tmp-';

const EXTENSION_DIRS = [
  '.vscode',
  '.vscode-server',
  '.cursor',
  '.cursor-server',
  '.antigravity',
  '.antigravity-ide',
  '.antigravity-server',
  '.antigravity-ide-server',
  '.kiro',
  '.kiro-server',
];

// ── TARGET DISCOVERY ───────────────────────────────────────────────────

/**
 * Locate every installed Claude Code extension whose webview bundle exists.
 * @returns {Promise<Array<{name: string, dir: string, cssPath: string,
 *   jsPath: string, extensionPath: string, fontsDir: string}>>}
 */
async function findTargets() {
  const targets = [];
  for (const relative of EXTENSION_DIRS) {
    const root = path.join(os.homedir(), relative, 'extensions');
    const names = await fs.readdir(root).catch(() => []);
    for (const name of names) {
      if (!name.startsWith('anthropic.claude-code-')) continue;
      const dir = path.join(root, name);
      const webview = path.join(dir, 'webview');
      const cssPath = path.join(webview, 'index.css');
      const jsPath = path.join(webview, 'index.js');
      const ok = await Promise.all([exists(cssPath), exists(jsPath)]);
      if (!ok[0] || !ok[1]) continue;
      targets.push({
        name,
        dir,
        cssPath,
        jsPath,
        extensionPath: path.join(dir, 'extension.js'),
        fontsDir: path.join(webview, 'fonts'),
      });
    }
  }
  return targets;
}

async function exists(file) {
  return fs
    .access(file)
    .then(() => true)
    .catch(() => false);
}

// ── MARKER SURGERY ─────────────────────────────────────────────────────

/**
 * Remove every complete start/end block. An unterminated start marker is
 * reported instead of guessed at, so a half-written foreign patch can never
 * be truncated silently.
 * @returns {{text: string, removed: number, unmatched: string[]}}
 */
function stripBlocks(text, pairs) {
  let out = text;
  let removed = 0;
  const unmatched = [];
  for (const [start, end] of pairs) {
    let from = 0;
    for (;;) {
      const open = out.indexOf(start, from);
      if (open === -1) break;
      const close = out.indexOf(end, open + start.length);
      if (close === -1) {
        unmatched.push(start);
        break;
      }
      out = out.slice(0, open) + out.slice(close + end.length);
      removed += 1;
      from = open;
    }
  }
  return { text: out, removed, unmatched };
}

function versionIn(css) {
  const match = css.match(/\/\* rastin:start \*\/\n\/\* rastin ([^*]+) \*\//);
  return match ? match[1].trim() : null;
}

// ── WRITES ─────────────────────────────────────────────────────────────

async function writeAtomic(file, data) {
  const stat = await fs.stat(file).catch(() => null);
  const tmp = file + TMP_SUFFIX + process.pid;
  try {
    await fs.writeFile(tmp, data, 'utf8');
    if (stat) await fs.chmod(tmp, stat.mode & 0o777);
    await fs.rename(tmp, file);
  } catch (error) {
    await fs.rm(tmp, { force: true }).catch(() => {});
    throw error;
  }
}

async function writeIfChanged(file, current, next) {
  if (current === next) return false;
  await writeAtomic(file, next);
  return true;
}

function guardSize(before, after, label) {
  if (before.length > 20000 && after.length < before.length * 0.5) {
    throw new Error(
      `Rastin: refusing to shrink ${label} from ${before.length} to ${after.length} bytes`,
    );
  }
}

// ── LOCK ───────────────────────────────────────────────────────────────

async function withLock(dir, run) {
  const lock = path.join(dir, LOCK);
  const deadline = Date.now() + LOCK_TIMEOUT_MS;
  let handle = null;
  while (handle === null) {
    try {
      handle = await fs.open(lock, 'wx');
      await handle.writeFile(String(process.pid));
    } catch (error) {
      if (handle) await handle.close().catch(() => {});
      handle = null;
      if (error.code !== 'EEXIST') throw error;
      const stat = await fs.stat(lock).catch(() => null);
      if (stat && Date.now() - stat.mtimeMs > LOCK_STALE_MS) {
        await fs.rm(lock, { force: true }).catch(() => {});
        continue;
      }
      if (Date.now() > deadline) {
        throw new Error(`Rastin: patch lock timeout in ${dir}`);
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
  try {
    return await run();
  } finally {
    await handle.close().catch(() => {});
    await fs.rm(lock, { force: true }).catch(() => {});
  }
}

// ── PATCH ──────────────────────────────────────────────────────────────

async function copyFonts(target, payload) {
  await fs.mkdir(target.fontsDir, { recursive: true });
  const copied = [];
  for (const font of payload.fonts) {
    const from = path.isAbsolute(font.from)
      ? font.from
      : path.join(payload.fontsSource, font.from);
    const to = path.join(target.fontsDir, font.to);
    const [source, destination] = await Promise.all([
      fs.readFile(from),
      fs.readFile(to).catch(() => null),
    ]);
    if (destination && source.equals(destination)) continue;
    await fs.writeFile(to, source);
    copied.push(font.to);
  }

  const keep = new Set(payload.fonts.map((font) => font.to));
  for (const name of await fs.readdir(target.fontsDir).catch(() => [])) {
    if (!name.startsWith(USER_FONT_PREFIX) || keep.has(name)) continue;
    await fs.rm(path.join(target.fontsDir, name), { force: true });
    copied.push(name);
  }
  return copied;
}

async function patchTarget(target, payload, version) {
  return withLock(target.dir, async () => {
    const [css, js, extension] = await Promise.all([
      fs.readFile(target.cssPath, 'utf8'),
      fs.readFile(target.jsPath, 'utf8'),
      fs.readFile(target.extensionPath, 'utf8').catch(() => null),
    ]);

    const cssBase = stripBlocks(css, [[START, END], ...FOREIGN_BLOCKS]);
    const jsBase = stripBlocks(js, [[START, END], ...FOREIGN_BLOCKS]);
    const extensionBase =
      extension === null
        ? null
        : stripBlocks(extension, FOREIGN_BLOCKS);

    const unmatched = [
      ...cssBase.unmatched,
      ...jsBase.unmatched,
      ...(extensionBase ? extensionBase.unmatched : []),
    ];
    if (unmatched.length > 0) {
      throw new Error(
        `Rastin: found an unterminated patch marker in ${target.name}; run Claude RTL: Deactivate first`,
      );
    }

    const cssNext =
      cssBase.text.replace(/\s+$/, '') +
      '\n' +
      START +
      `/* rastin ${version} */\n` +
      payload.css +
      END;

    const jsNext =
      payload.js === null
        ? jsBase.text
        : jsBase.text.replace(/\s+$/, '') +
          '\n' +
          START +
          `/* rastin ${version} */\n` +
          payload.js +
          END;

    guardSize(css, cssNext, `${target.name}/index.css`);
    guardSize(js, jsNext, `${target.name}/index.js`);

    const changed = [];
    const fonts = await copyFonts(target, payload);
    if (fonts.length > 0) changed.push(`${target.name}: fonts`);

    if (await writeIfChanged(target.cssPath, css, cssNext)) {
      changed.push(`${target.name}: index.css`);
    }
    if (await writeIfChanged(target.jsPath, js, jsNext)) {
      changed.push(`${target.name}: index.js`);
    }
    if (
      extensionBase &&
      (await writeIfChanged(
        target.extensionPath,
        extension,
        extensionBase.text,
      ))
    ) {
      changed.push(`${target.name}: extension.js`);
    }
    return changed;
  });
}

function keepBundled(name, payload) {
  return payload.fonts.some((font) => font.to === name);
}

async function removeTarget(target, payload) {
  return withLock(target.dir, async () => {
    const [css, js] = await Promise.all([
      fs.readFile(target.cssPath, 'utf8'),
      fs.readFile(target.jsPath, 'utf8'),
    ]);

    const cssBase = stripBlocks(css, [[START, END]]);
    const jsBase = stripBlocks(js, [[START, END]]);

    const changed = [];
    if (await writeIfChanged(target.cssPath, css, cssBase.text)) {
      changed.push(`${target.name}: index.css`);
    }
    if (await writeIfChanged(target.jsPath, js, jsBase.text)) {
      changed.push(`${target.name}: index.js`);
    }
    // extension.js is only touched for foreign cleanup during apply, never
    // by Rastin itself, so removal leaves it alone.

    const names = await fs.readdir(target.fontsDir).catch(() => []);
    for (const name of names) {
      if (!name.startsWith(USER_FONT_PREFIX) && !keepBundled(name, payload)) {
        continue;
      }
      await fs.rm(path.join(target.fontsDir, name), { force: true });
      changed.push(`${target.name}: ${name}`);
    }
    return changed;
  });
}

// ── PUBLIC API ─────────────────────────────────────────────────────────

/**
 * Apply (or refresh) the Rastin patch on every installed Claude Code.
 * @param {{payload: object, version: string}} options
 */
async function apply({ payload, version }) {
  const targets = await findTargets();
  const changed = [];
  const failed = [];
  for (const target of targets) {
    // One locked or read-only install must not block the others.
    try {
      changed.push(...(await patchTarget(target, payload, version)));
    } catch (error) {
      failed.push(`${target.name}: ${error.message}`);
    }
  }
  return { targets: targets.length, changed, failed };
}

/**
 * Remove the Rastin patch and its copied fonts.
 * @param {{payload: object}} options
 */
async function remove({ payload }) {
  const targets = await findTargets();
  const changed = [];
  const failed = [];
  for (const target of targets) {
    try {
      changed.push(...(await removeTarget(target, payload)));
    } catch (error) {
      failed.push(`${target.name}: ${error.message}`);
    }
  }
  return { targets: targets.length, changed, failed };
}

module.exports = {
  apply,
  remove,
  findTargets,
  patchTarget,
  removeTarget,
  stripBlocks,
  versionIn,
  START,
  END,
  FOREIGN_BLOCKS,
};
