'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');

const bridge = require('./bridge');

// ── PREVIEW ASSETS ─────────────────────────────────────────────────────

// Contributed from package.json. VS Code links STYLE and runs DIRECTION,
// CONFIG, and SCRIPT in every Markdown preview.
const DIRECTION = './webview/direction.js';
const STYLE = './markdown/preview.css';
const SCRIPT = './markdown/preview.js';
const CONFIG = './markdown/config.js';

// ── CONFIG FILE ────────────────────────────────────────────────────────

// A preview script cannot read VS Code settings, so the values it needs are
// written to the contributed config script. Only these two affect it.
function settings({ enabled, markdownPreview, direction } = {}) {
  return bridge.values({ enabled, direction }, markdownPreview);
}

// Written in Prettier's shape, so a checkout that runs the extension from
// source stays clean for `pnpm format:check`.
function script(values) {
  return bridge.script(settings(values));
}

/** @returns {string} absolute path of the generated script under `root`. */
function configPath(root) {
  return path.join(root, CONFIG);
}

/**
 * Refresh the preview config. A read-only install must not fail the chat
 * patch, so a failed write throws and the caller reports it.
 * @param {{root: string}} options plus rastin.* configuration values
 * @returns {Promise<boolean>} whether the file changed
 */
async function writeConfig({ root, ...values }) {
  const file = configPath(root);
  const next = script(values);
  const current = await fs.readFile(file, 'utf8').catch(() => null);
  if (current === next) return false;
  // The preview may load the file while it is being written, so replace it
  // in one step instead of truncating first.
  const tmp = `${file}.${process.pid}.tmp`;
  try {
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(tmp, next, 'utf8');
    await fs.rename(tmp, file);
  } catch (error) {
    await fs.rm(tmp, { force: true }).catch(() => {});
    throw error;
  }
  return true;
}

module.exports = {
  DIRECTION,
  STYLE,
  SCRIPT,
  CONFIG,
  settings,
  script,
  configPath,
  writeConfig,
};
