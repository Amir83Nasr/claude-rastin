'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const { JSDOM } = require('jsdom');

const preview = require('../lib/preview.js');

const root = path.join(__dirname, '..');
// The scripts the preview contributes, so the tests run what ships.
const ENGINE = fs.readFileSync(
  path.join(root, 'webview', 'direction.js'),
  'utf8',
);
const INSTALLER = fs.readFileSync(
  path.join(root, 'markdown', 'preview.js'),
  'utf8',
);

function page(body, config) {
  const dom = new JSDOM(
    `<!doctype html><html><body><div class="markdown-body" dir="auto">${body}</div></body></html>`,
    { runScripts: 'outside-only', pretendToBeVisual: true },
  );
  const window = dom.window;
  window.eval(ENGINE);
  if (config !== undefined) window.__rastinPreview = config;
  window.eval(INSTALLER);
  window.__rastinMarkdownPreview.install(
    window.__rastinDirection,
    window.document,
    window.__rastinPreview,
  );
  return window;
}

function loaded(window) {
  if (window.document.readyState === 'complete') return Promise.resolve();
  return new Promise((resolve) =>
    window.addEventListener('load', resolve, { once: true }),
  );
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 60));

// ── ORIENTATION ─────────────────────────────────────────────────────────

test('each markdown block takes its own direction', () => {
  const { document } = page(
    '<h1>سلام دنیا</h1><p>Here is the fix for it</p>' +
      '<ul><li>سلام</li><li>Add retry logic to the fetch</li></ul>',
  );
  assert.equal(document.querySelector('h1').getAttribute('dir'), 'rtl');
  assert.equal(document.querySelector('p').getAttribute('dir'), 'ltr');
  const items = document.querySelectorAll('li');
  assert.equal(items[0].getAttribute('dir'), 'rtl');
  assert.equal(items[1].getAttribute('dir'), 'ltr');
  // The static stylesheet only applies under this marker.
  assert.ok(
    document
      .querySelector('.markdown-body')
      .hasAttribute('data-rastin-preview'),
  );
});

test('quotes and table cells follow their own text', () => {
  const { document } = page(
    '<blockquote><p>سلام دنیا</p></blockquote>' +
      '<table><tbody><tr><td>توضیح فارسی</td><td>Left to right text</td></tr></tbody></table>',
  );
  assert.equal(document.querySelector('blockquote').getAttribute('dir'), 'rtl');
  const cells = document.querySelectorAll('td');
  assert.equal(cells[0].getAttribute('dir'), 'rtl');
  assert.equal(cells[1].getAttribute('dir'), 'ltr');
});

test('code is an LTR island: it does not vote and gets no dir', () => {
  const { document } = page(
    '<p><code>pnpm test</code> را اجرا کن</p>' +
      '<pre><code>const x = 1;</code></pre>',
  );
  assert.equal(document.querySelector('p').getAttribute('dir'), 'rtl');
  assert.equal(document.querySelector('pre').hasAttribute('dir'), false);
  assert.equal(document.querySelector('pre code').hasAttribute('dir'), false);
});

test('flow arrows mirror in RTL and stay untouched in LTR', () => {
  const { document } = page('<p>سلام ← دنیا</p><p>Hello world → there</p>');
  const [rtl, ltr] = document.querySelectorAll('p');
  const arrow = rtl.querySelector('[data-rastin-mirror]');
  assert.ok(arrow);
  assert.equal(arrow.textContent, '←');
  assert.equal(ltr.querySelector('[data-rastin-mirror]'), null);
});

// ── SETTINGS ────────────────────────────────────────────────────────────

test('the master switch leaves the preview alone', () => {
  const { document } = page('<p>سلام دنیا</p>', {
    enabled: false,
    direction: 'auto',
  });
  assert.equal(document.querySelector('p').hasAttribute('dir'), false);
  assert.equal(
    document
      .querySelector('.markdown-body')
      .hasAttribute('data-rastin-preview'),
    false,
  );
});

test('a forced direction pins every block and the wrapper', () => {
  const rtl = page('<p>Here is the fix for it</p>', {
    enabled: true,
    direction: 'rtl',
  }).document;
  assert.equal(rtl.querySelector('p').getAttribute('dir'), 'rtl');
  assert.equal(rtl.querySelector('.markdown-body').getAttribute('dir'), 'rtl');

  const ltr = page('<p>سلام دنیا</p>', {
    enabled: true,
    direction: 'ltr',
  }).document;
  assert.equal(ltr.querySelector('p').getAttribute('dir'), 'ltr');
});

test('an update re-orients the morphed DOM', async () => {
  const window = page('<p>سلام دنیا</p>');
  await loaded(window);

  const paragraph = window.document.querySelector('p');
  const root = window.document.querySelector('.markdown-body');
  // VS Code's diff drops attributes the new HTML does not carry.
  paragraph.removeAttribute('dir');
  paragraph.removeAttribute('data-rastin-dir');
  root.removeAttribute('data-rastin-preview');
  paragraph.textContent = 'Here is the fix for it';

  window.dispatchEvent(new window.CustomEvent('vscode.markdown.updateContent'));
  await settle();
  assert.equal(paragraph.getAttribute('dir'), 'ltr');
  assert.ok(root.hasAttribute('data-rastin-preview'));
});

// ── GENERATED CONFIG ────────────────────────────────────────────────────

test('the config script reflects the settings', () => {
  assert.equal(
    preview.script({ enabled: true, markdownPreview: true, direction: 'auto' }),
    '/* Generated by Rastin on activation; do not edit. */\n' +
      "globalThis.__rastinPreview = { enabled: true, direction: 'auto' };\n",
  );
  assert.match(
    preview.script({ enabled: true, direction: 'rtl' }),
    /direction: 'rtl'/,
  );
});

test('either switch turns the preview off, and bad values fall back', () => {
  assert.equal(preview.settings({ enabled: false }).enabled, false);
  assert.equal(preview.settings({ markdownPreview: false }).enabled, false);
  assert.equal(preview.settings({}).enabled, true);
  assert.equal(preview.settings({ direction: 'sideways' }).direction, 'auto');
});

test('writeConfig writes once and only when a value changes', async (t) => {
  const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'rastin-preview-'));
  t.after(() => fsp.rm(dir, { recursive: true, force: true }));

  const settings = { enabled: true, markdownPreview: true, direction: 'auto' };
  assert.equal(await preview.writeConfig({ root: dir, ...settings }), true);
  assert.equal(
    await fsp.readFile(preview.configPath(dir), 'utf8'),
    preview.script(settings),
  );
  assert.equal(await preview.writeConfig({ root: dir, ...settings }), false);

  assert.equal(
    await preview.writeConfig({ root: dir, ...settings, direction: 'rtl' }),
    true,
  );
  assert.match(
    await fsp.readFile(preview.configPath(dir), 'utf8'),
    /direction: 'rtl'/,
  );
});

// ── PACKAGING ───────────────────────────────────────────────────────────

test('the preview assets are contributed and exist', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json')));
  const contributes = pkg.contributes;
  assert.deepEqual(contributes['markdown.previewStyles'], [preview.STYLE]);
  assert.deepEqual(contributes['markdown.previewScripts'], [
    preview.CONFIG,
    preview.DIRECTION,
    preview.SCRIPT,
  ]);
  // config.js is generated on activation and is not shipped, so it is the
  // one contribution that may be missing from a clean checkout.
  for (const asset of [preview.STYLE, preview.DIRECTION, preview.SCRIPT]) {
    assert.ok(fs.existsSync(path.join(root, asset)), asset);
  }
  assert.equal(
    pkg.contributes.configuration.properties['rastin.markdownPreview'].default,
    true,
  );
});

test('the preview stylesheet keeps code LTR and quotes directional', () => {
  const css = fs.readFileSync(path.join(root, preview.STYLE), 'utf8');
  assert.match(
    css,
    /\.markdown-body\[data-rastin-preview\]\s*:is\(pre, code, kbd, samp\)/,
  );
  assert.match(css, /border-inline-start-width: 5px/);
  assert.match(css, /\[data-rastin-mirror\]/);
});
