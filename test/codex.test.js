'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const { JSDOM } = require('jsdom');

const codex = require('../lib/codex.js');

const root = path.join(__dirname, '..');
// The scripts the page patch loads, so the tests run what ships.
const ENGINE = fs.readFileSync(
  path.join(root, 'webview', 'direction.js'),
  'utf8',
);
const INSTALLER = fs.readFileSync(
  path.join(root, 'webview', 'codex.js'),
  'utf8',
);

// ── FIXTURES ───────────────────────────────────────────────────────────

const PAGE = `<!DOCTYPE html>
<html>

<head>
    <meta charset='utf-8'>
    <title>Codex</title>
    <script type="module" crossorigin src="./assets/index-abc123.js"></script>
    <link rel="stylesheet" crossorigin href="./assets/app-initial-def456.css">
</head>

<body>
    <div id="root"></div>
</body>

</html>
`;

function values(overrides = {}) {
  return {
    enabled: true,
    codex: true,
    direction: 'auto',
    fontWeight: 300,
    lineHeight: 2,
    fontSize: 0,
    ...overrides,
  };
}

const ASSISTANT = `
<div data-message-author-role="assistant" data-turn="1">
  <div data-markdown-text-style="assistant-message">
    <p>سلام، این یک پاراگراف فارسی است</p>
    <p>Here is the fix for it</p>
    <ul><li>سلام</li><li>Add retry logic</li></ul>
    <pre><code>const x = 1;</code></pre>
  </div>
</div>
`;

function page(body, config) {
  const dom = new JSDOM(`<!doctype html><html><body>${body}</body></html>`, {
    runScripts: 'outside-only',
    pretendToBeVisual: true,
  });
  const window = dom.window;
  window.eval(ENGINE);
  if (config !== undefined) window.__rastinCodex = config;
  window.eval(INSTALLER);
  return window;
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 60));

async function fixture() {
  const home = await fsp.mkdtemp(path.join(os.tmpdir(), 'rastin-codex-'));
  const name = 'openai.chatgpt-9.9.9';
  const dir = path.join(home, '.vscode', 'extensions', name);
  const htmlPath = path.join(dir, codex.HTML);
  await fsp.mkdir(path.dirname(htmlPath), { recursive: true });
  await fsp.writeFile(htmlPath, PAGE);
  return {
    home,
    target: {
      name,
      dir,
      htmlPath,
      fontsDir: path.join(dir, codex.FONTS_DIR),
    },
  };
}

async function patchInput(overrides) {
  return {
    assets: await codex.loadAssets(root),
    styles: codex.stylesheet(values(), root),
    config: codex.script(values(overrides)),
    version: '1.2.3',
  };
}

// ── ORIENTATION ─────────────────────────────────────────────────────────

test('every prose block takes its own direction', () => {
  const { document } = page(ASSISTANT);
  const paragraphs = document.querySelectorAll(
    '[data-markdown-text-style="assistant-message"] p',
  );
  assert.equal(paragraphs[0].getAttribute('dir'), 'rtl');
  assert.equal(paragraphs[1].getAttribute('dir'), 'ltr');
  const items = document.querySelectorAll('li');
  assert.equal(items[0].getAttribute('dir'), 'rtl');
  assert.equal(items[1].getAttribute('dir'), 'ltr');
  assert.ok(document.documentElement.hasAttribute('data-rastin-codex'));
});

test('user messages are oriented by their tone marker', () => {
  const window = page(
    '<div data-markdown-text-tone="user-message">' +
      '<p>Here is the fix for it</p><p>سلام دنیا</p></div>',
  );
  const [english, persian] = window.document.querySelectorAll('p');
  assert.equal(english.getAttribute('dir'), 'ltr');
  assert.equal(persian.getAttribute('dir'), 'rtl');
});

test('code stays an LTR island without a dir of its own', () => {
  const { document } = page(ASSISTANT);
  assert.equal(document.querySelector('pre').hasAttribute('dir'), false);
  assert.equal(document.querySelector('code').hasAttribute('dir'), false);
});

test('copy and writing UI inside a message are left alone', () => {
  const { document } = page(
    '<div data-markdown-text-style="assistant-message">' +
      '<div data-markdown-copy="exclude"><p>Here is the fix for it</p></div>' +
      '<div data-writing-block-variant="diff"><p>Here is the fix for it</p></div>' +
      '<p>سلام دنیا</p></div>',
  );
  const [copy, writing, prose] = document.querySelectorAll('p');
  assert.equal(copy.hasAttribute('dir'), false);
  assert.equal(writing.hasAttribute('dir'), false);
  assert.equal(prose.getAttribute('dir'), 'rtl');
});

test('the composer keeps the direction ProseMirror gives it', () => {
  const { document } = page(
    '<div data-markdown-text-style="assistant-message"><p>سلام دنیا</p></div>' +
      '<div class="RichTextInput_x1"><div class="ProseMirror">' +
      '<p dir="auto">Here is the fix for it</p></div></div>',
  );
  const composer = document.querySelector('.ProseMirror p');
  assert.equal(composer.getAttribute('dir'), 'auto');
});

test('flow arrows mirror in RTL blocks only', () => {
  const { document } = page(
    '<div data-markdown-text-style="assistant-message">' +
      '<p>سلام ← دنیا</p><p>Hello world → there</p></div>',
  );
  const [rtl, ltr] = document.querySelectorAll('p');
  assert.ok(rtl.querySelector('[data-rastin-mirror]'));
  assert.equal(ltr.querySelector('[data-rastin-mirror]'), null);
});

test('a reply mounted after load is oriented by the observer', async () => {
  const window = page('<main></main>');
  const { document } = window;
  assert.equal(
    document.documentElement.hasAttribute('data-rastin-codex'),
    false,
  );

  const message = document.createElement('div');
  message.setAttribute('data-markdown-text-style', 'assistant-message');
  message.innerHTML = '<p>سلام دنیا</p><p>Here is the fix for it</p>';
  document.querySelector('main').append(message);

  await settle();
  const [persian, english] = document.querySelectorAll('p');
  assert.equal(persian.getAttribute('dir'), 'rtl');
  assert.equal(english.getAttribute('dir'), 'ltr');
  assert.ok(document.documentElement.hasAttribute('data-rastin-codex'));
});

test('text streamed into an existing reply is re-oriented', async () => {
  const window = page(ASSISTANT);
  const { document } = window;
  const root = document.querySelector('[data-markdown-text-style]');
  const paragraph = document.createElement('p');
  paragraph.textContent = 'سلام دنیا';
  root.append(paragraph);

  await settle();
  assert.equal(paragraph.getAttribute('dir'), 'rtl');
});

// ── SETTINGS ────────────────────────────────────────────────────────────

test('the master switch leaves Codex alone', () => {
  const { document } = page(ASSISTANT, {
    enabled: false,
    direction: 'auto',
  });
  assert.equal(
    document.documentElement.hasAttribute('data-rastin-codex'),
    false,
  );
  assert.equal(document.querySelector('p').hasAttribute('dir'), false);
});

test('the Codex switch leaves Codex alone', () => {
  // The page reads the values the bridge derives, so the surface switch
  // reaches it already folded into `enabled`.
  const { document } = page(
    ASSISTANT,
    codex.settings({ enabled: true, codex: false, direction: 'auto' }),
  );
  assert.equal(document.querySelector('p').hasAttribute('dir'), false);
});

test('a forced direction pins every block and the page', () => {
  const rtl = page(ASSISTANT, { enabled: true, direction: 'rtl' });
  assert.equal(
    rtl.document.documentElement.getAttribute('data-rastin-codex-dir'),
    'rtl',
  );
  assert.equal(rtl.__rastinForcedDir, 'rtl');
  for (const block of rtl.document.querySelectorAll('p,li')) {
    assert.equal(block.getAttribute('dir'), 'rtl');
  }

  const ltr = page(ASSISTANT, { enabled: true, direction: 'ltr' });
  assert.equal(ltr.__rastinForcedDir, 'ltr');
  for (const block of ltr.document.querySelectorAll('p,li')) {
    assert.equal(block.getAttribute('dir'), 'ltr');
  }
});

test('the config script reflects the settings', () => {
  assert.equal(
    codex.script({ enabled: true, codex: true, direction: 'auto' }),
    '/* Generated by Rastin on activation; do not edit. */\n' +
      "globalThis.__rastinCodex = { enabled: true, direction: 'auto' };\n",
  );
  assert.match(
    codex.script({ enabled: true, codex: true, direction: 'rtl' }),
    /direction: 'rtl'/,
  );
  assert.equal(codex.settings({ enabled: false }).enabled, false);
  assert.equal(codex.settings({ codex: false }).enabled, false);
  assert.equal(codex.settings({}).enabled, true);
  assert.equal(codex.settings({ direction: 'sideways' }).direction, 'auto');
});

// ── STYLESHEET ─────────────────────────────────────────────────────────

test('the stylesheet serves the copied faces from its own folder', () => {
  const css = codex.stylesheet(values(), root).data.toString();
  assert.match(
    css,
    /src: url\('rastin-fonts\/rastin-iranyekanx-light\.woff2'\)/,
  );
  assert.doesNotMatch(css, /url\('fonts\//);
  assert.match(css, /--rastin-font-family:/);
  assert.match(css, /--rastin-line-height: 2;/);
  // 0 keeps the host's size, so the token is not written at all.
  assert.doesNotMatch(css, /--codex-chat-font-size/);
});

test('a chat font size overrides the host token', () => {
  const css = codex.stylesheet(values({ fontSize: 15 }), root).data.toString();
  assert.match(css, /--codex-chat-font-size: 15px !important;/);
});

test('a forced direction is restated in CSS for the roots and composer', () => {
  const css = codex
    .stylesheet(values({ direction: 'rtl' }), root)
    .data.toString();
  assert.match(
    css,
    /html\[data-rastin-codex\]\[data-rastin-codex-dir='rtl'\] :is\(/,
  );
  assert.match(css, /direction: rtl !important;/);
  assert.match(css, /RichTextInput_/);
});

test('the Codex rules stay inert until the installer marks the page', () => {
  const css = fs.readFileSync(path.join(root, 'webview', 'codex.css'), 'utf8');
  assert.match(css, /^html\[data-rastin-codex\]/m);
  assert.match(css, /--font-code-family: var\(--rastin-code-font\)/);
});

// ── PATCH ───────────────────────────────────────────────────────────────

test('apply writes the assets, config, fonts, and marked page block', async (t) => {
  const { home, target } = await fixture();
  t.after(() => fsp.rm(home, { recursive: true, force: true }));

  const result = await codex.apply({
    root,
    home,
    version: '1.2.3',
    ...values(),
  });
  assert.equal(result.targets, 1);
  assert.deepEqual(result.failed, []);

  const html = await fsp.readFile(target.htmlPath, 'utf8');
  assert.ok(html.startsWith(PAGE.slice(0, PAGE.indexOf('</body>'))));
  assert.ok(html.includes(codex.START));
  assert.ok(html.includes('<!-- rastin 1.2.3 -->'));
  assert.ok(html.includes('<link rel="stylesheet" href="rastin.codex.css">'));
  assert.ok(html.includes('<script src="rastin.codex.js"></script>'));
  assert.ok(html.trimEnd().endsWith('</html>'));
  // The host's own build stays untouched.
  assert.ok(html.includes('./assets/index-abc123.js'));

  for (const asset of codex.ASSETS) {
    assert.deepEqual(
      await fsp.readFile(path.join(target.dir, asset.to)),
      await fsp.readFile(path.join(root, asset.from)),
    );
  }
  assert.match(
    await fsp.readFile(path.join(target.dir, codex.CONFIG), 'utf8'),
    /__rastinCodex = \{ enabled: true, direction: 'auto' \}/,
  );
  assert.ok(
    fs.existsSync(
      path.join(target.dir, codex.FONTS_DIR, 'rastin-iranyekanx-light.woff2'),
    ),
  );
});

test('a second apply is a no-op, a new version replaces the block', async (t) => {
  const { home, target } = await fixture();
  t.after(() => fsp.rm(home, { recursive: true, force: true }));

  const input = await patchInput();
  await codex.patchTarget(target, input);
  const once = await fsp.readFile(target.htmlPath, 'utf8');
  assert.deepEqual(await codex.patchTarget(target, input), []);
  assert.equal(await fsp.readFile(target.htmlPath, 'utf8'), once);

  await codex.patchTarget(target, { ...input, version: '1.2.4' });
  const next = await fsp.readFile(target.htmlPath, 'utf8');
  assert.ok(next.includes('<!-- rastin 1.2.4 -->'));
  assert.equal(next.split(codex.START).length, 2);
});

test('remove restores the page and deletes the generated files', async (t) => {
  const { home, target } = await fixture();
  t.after(() => fsp.rm(home, { recursive: true, force: true }));

  await codex.patchTarget(target, await patchInput());
  const result = await codex.remove({ home });
  assert.equal(result.targets, 1);
  assert.deepEqual(result.failed, []);
  assert.equal(await fsp.readFile(target.htmlPath, 'utf8'), PAGE);

  for (const asset of codex.ASSETS) {
    assert.equal(fs.existsSync(path.join(target.dir, asset.to)), false);
  }
  assert.equal(fs.existsSync(path.join(target.dir, codex.CONFIG)), false);
  assert.equal(fs.existsSync(path.join(target.dir, codex.STYLESHEET)), false);
  assert.equal(fs.existsSync(path.join(target.dir, codex.FONTS_DIR)), false);
});

test('installs are discovered in every supported extension directory', async (t) => {
  const { home, target } = await fixture();
  t.after(() => fsp.rm(home, { recursive: true, force: true }));

  const cursor = path.join(
    home,
    '.cursor',
    'extensions',
    'openai.chatgpt-8.0.0',
  );
  await fsp.mkdir(path.join(cursor, 'webview'), { recursive: true });
  await fsp.writeFile(path.join(cursor, codex.HTML), PAGE);
  // A directory with the prefix but no webview page is not a target.
  await fsp.mkdir(
    path.join(home, '.vscode', 'extensions', 'openai.chatgpt-broken'),
  );

  const targets = await codex.findTargets({ home });
  assert.deepEqual(targets.map(({ name }) => name).sort(), [
    'openai.chatgpt-8.0.0',
    target.name,
  ]);
});

// ── PACKAGING ───────────────────────────────────────────────────────────

test('the setting ships on by default', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json')));
  assert.equal(
    pkg.contributes.configuration.properties['rastin.codex'].default,
    true,
  );
});
