'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const { JSDOM } = require('jsdom');

const office = require('../lib/office.js');

const root = path.join(__dirname, '..');
// The scripts the patch loads, so the tests run what ships.
const ENGINE = fs.readFileSync(
  path.join(root, 'webview', 'direction.js'),
  'utf8',
);
const INSTALLER = fs.readFileSync(
  path.join(root, 'markdown', 'office.js'),
  'utf8',
);

// ── FIXTURES ───────────────────────────────────────────────────────────

const PAGE = `<!DOCTYPE html>
<html>

<head>
    <meta charset='utf-8'>
    <title>Markdown Editor</title>
</head>

<body>
    <div id="vditor"></div>
</body>
<script src="dist/index.min.js"></script>
<script src="index.js" type="module"></script>
</html>
`;

const WYSIWYG = `
<h1 data-block="0">سلام دنیا</h1>
<p data-block="0">Here is the fix for it</p>
<ul data-block="0"><li data-marker="-">سلام</li><li data-marker="-">Add retry logic</li></ul>
<blockquote data-block="0"><p data-block="0">سلام دنیا</p></blockquote>
<table data-block="0"><tbody><tr><td>توضیح فارسی</td><td>Left to right text</td></tr></tbody></table>
<p data-block="0">​<code data-marker="\`">​pnpm test</code>​ را اجرا کن</p>
<div class="vditor-wysiwyg__block" data-type="code-block" data-block="0"><pre class="vditor-wysiwyg__pre"><code>const x = 1;</code></pre><pre class="vditor-wysiwyg__preview"><code>const x = 1;</code></pre></div>
`;

// The shape Lute renders for the same source in IR mode.
const IR = `
<h1 data-block="0" class="vditor-ir__node" data-marker="#"><span class="vditor-ir__marker vditor-ir__marker--heading" data-type="heading-marker"># </span>سلام دنیا</h1>
<p data-block="0">Here is the fix for it</p>
<ul data-tight="true" data-marker="-" data-block="0"><li data-marker="-">سلام</li><li data-marker="-">Add retry logic</li></ul>
<blockquote data-block="0"><p data-block="0">سلام دنیا</p></blockquote>
<table data-block="0"><tbody><tr><td>توضیح فارسی</td><td>Left to right text</td></tr></tbody></table>
<p data-block="0"><span data-type="code" class="vditor-ir__node"><span class="vditor-ir__marker">\`</span><code data-newline="1">pnpm test</code><span class="vditor-ir__marker">\`</span></span> را اجرا کن</p>
<div data-block="0" data-type="code-block" class="vditor-ir__node"><span data-type="code-block-open-marker">\`\`\`</span><pre class="vditor-ir__marker--pre vditor-ir__marker"><code class="language-js">const x = 1;</code></pre><span data-type="code-block-close-marker">\`\`\`</span></div>
`;

function page(body, config, wrapper = 'vditor-wysiwyg') {
  const dom = new JSDOM(
    `<!doctype html><html><body><div class="${wrapper}"><pre class="vditor-reset" contenteditable="true">${body}</pre></div></body></html>`,
    { runScripts: 'outside-only', pretendToBeVisual: true },
  );
  const window = dom.window;
  window.eval(ENGINE);
  if (config !== undefined) window.__rastinPreview = config;
  window.eval(INSTALLER);
  window.__rastinOffice.install(
    window.__rastinDirection,
    window.document,
    window.__rastinPreview,
  );
  return window;
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 250));

async function fixture() {
  const home = await fsp.mkdtemp(path.join(os.tmpdir(), 'rastin-office-'));
  const name = 'cweijan.vscode-office-9.9.9';
  const dir = path.join(home, '.vscode', 'extensions', name);
  const htmlPath = path.join(dir, office.HTML);
  await fsp.mkdir(path.dirname(htmlPath), { recursive: true });
  await fsp.writeFile(htmlPath, PAGE);
  return { home, target: { name, dir, htmlPath } };
}

async function patchInput() {
  return {
    assets: await office.loadAssets(root),
    config: office.script({
      enabled: true,
      officeViewer: true,
      direction: 'auto',
    }),
    version: '1.2.3',
  };
}

// ── ORIENTATION ─────────────────────────────────────────────────────────

test('every block takes its own direction in WYSIWYG mode', () => {
  const { document } = page(WYSIWYG);
  assert.equal(document.querySelector('h1').getAttribute('dir'), 'rtl');
  assert.equal(document.querySelector('p').getAttribute('dir'), 'ltr');
  const items = document.querySelectorAll('li');
  assert.equal(items[0].getAttribute('dir'), 'rtl');
  assert.equal(items[1].getAttribute('dir'), 'ltr');
  const cells = document.querySelectorAll('td');
  assert.equal(cells[0].getAttribute('dir'), 'rtl');
  assert.equal(cells[1].getAttribute('dir'), 'ltr');
  assert.ok(
    document.querySelector('.vditor-reset').hasAttribute('data-rastin-office'),
  );
});

test('IR markers and wrappers do not hide the prose', () => {
  const { document } = page(IR, undefined, 'vditor-ir');
  const heading = document.querySelector('h1');
  assert.equal(heading.getAttribute('dir'), 'rtl');
  assert.equal(document.querySelector('p').getAttribute('dir'), 'ltr');
  const items = document.querySelectorAll('li');
  assert.equal(items[0].getAttribute('dir'), 'rtl');
  assert.equal(items[1].getAttribute('dir'), 'ltr');
});

test('code and math stay LTR islands without a dir', () => {
  const ir = page(IR, undefined, 'vditor-ir').document;
  assert.equal(ir.querySelector('code').hasAttribute('dir'), false);
  assert.equal(
    ir.querySelector('.vditor-ir__marker--pre').hasAttribute('dir'),
    false,
  );
  assert.equal(
    ir.querySelector('[data-type="code-block"]').hasAttribute('dir'),
    false,
  );

  const wys = page(WYSIWYG).document;
  assert.equal(wys.querySelector('pre').hasAttribute('dir'), false);
  assert.equal(wys.querySelector('code').hasAttribute('dir'), false);
});

test('flow arrows mirror in RTL blocks only', () => {
  const { document } = page('<p>سلام ← دنیا</p><p>Hello world → there</p>');
  const [rtl, ltr] = document.querySelectorAll('p');
  assert.ok(rtl.querySelector('[data-rastin-mirror]'));
  assert.equal(ltr.querySelector('[data-rastin-mirror]'), null);
});

test('a rendered preview outside the editor is left alone', () => {
  const dom = new JSDOM(
    `<!doctype html><html><body><div class="vditor-wysiwyg"><pre class="vditor-reset" contenteditable="true"><p>سلام دنیا</p></pre></div><div class="vditor-preview"><pre class="vditor-reset"><p>سلام دنیا</p></pre></div></body></html>`,
    { runScripts: 'outside-only', pretendToBeVisual: true },
  );
  dom.window.eval(ENGINE);
  dom.window.eval(INSTALLER);
  dom.window.__rastinOffice.install(
    dom.window.__rastinDirection,
    dom.window.document,
  );
  const roots = dom.window.document.querySelectorAll('.vditor-reset');
  assert.ok(roots[0].hasAttribute('data-rastin-office'));
  assert.equal(roots[1].hasAttribute('data-rastin-office'), false);
  assert.equal(roots[1].querySelector('p').hasAttribute('dir'), false);
});

test('an editor update is re-oriented after the DOM changes', async () => {
  const window = page('<p>Here is the fix for it</p>');
  const root = window.document.querySelector('.vditor-reset');
  const paragraph = window.document.createElement('p');
  paragraph.textContent = 'سلام دنیا';
  root.append(paragraph);
  await settle();
  assert.equal(paragraph.getAttribute('dir'), 'rtl');
});

// Places the caret the way the browser does, then runs one installer pass.
function typeAt(window, node, offset) {
  const range = window.document.createRange();
  range.setStart(node, offset);
  range.collapse(true);
  const selection = window.getSelection();
  selection.removeAllRanges();
  selection.addRange(range);
  window.__rastinOffice.install(
    window.__rastinDirection,
    window.document,
    window.__rastinPreview,
  );
}

test('a word being typed does not flip its block', () => {
  const window = page('<p>Hello world</p>');
  const p = window.document.querySelector('p');
  const text = p.firstChild;
  for (const typed of ['Hello worldس', 'Hello worldسل', 'Hello worldسلام']) {
    text.nodeValue = typed;
    typeAt(window, text, typed.length);
    assert.equal(p.getAttribute('dir'), 'ltr', typed);
  }
  // A finished word votes: the space ends the Persian word.
  text.nodeValue = 'Hello worldسلام ';
  typeAt(window, text, text.nodeValue.length);
  assert.equal(p.getAttribute('dir'), 'rtl');
});

test('a new line takes its direction from its first letter', () => {
  const window = page('<p>Hello world</p>');
  const p = window.document.createElement('p');
  window.document.querySelector('.vditor-reset').append(p);
  p.append('س');
  typeAt(window, p.firstChild, 1);
  assert.equal(p.getAttribute('dir'), 'rtl');
});

test('a replaced block is oriented before any timer runs', async () => {
  const window = page('<p>Hello world</p>');
  const root = window.document.querySelector('.vditor-reset');
  // Vditor swaps the block for a fresh element on most keystrokes.
  const fresh = window.document.createElement('p');
  fresh.textContent = 'سلام دنیا';
  root.querySelector('p').replaceWith(fresh);
  for (let i = 0; i < 3; i++) await Promise.resolve();
  assert.equal(fresh.getAttribute('dir'), 'rtl');
});

test('task items keep the checkbox on their own start side', () => {
  const css = fs.readFileSync(
    path.join(root, 'markdown', 'office.css'),
    'utf8',
  );
  assert.match(
    css,
    /:is\(ul, ol\):has\(> li\.vditor-task\)\s*\{\s*padding-inline: 2em;/,
  );
  assert.match(
    css,
    /li\.vditor-task input\[type='checkbox'\]\s*\{\s*margin-inline: -1\.6em 0\.2em;/,
  );
  // A list with a blank line between its items wraps each item in a <p>, so
  // the checkbox is a grandchild of the <li>. A child selector would leave
  // every loose task item on Vditor's physical left margin.
  assert.doesNotMatch(css, /li\.vditor-task > input/);
});

// ── SETTINGS ────────────────────────────────────────────────────────────

test('the master switch leaves the editor alone', () => {
  const { document } = page('<p>سلام دنیا</p>', {
    enabled: false,
    direction: 'auto',
  });
  assert.equal(document.querySelector('p').hasAttribute('dir'), false);
  assert.equal(
    document.querySelector('.vditor-reset').hasAttribute('data-rastin-office'),
    false,
  );
});

test('a forced direction pins every block and the editor root', () => {
  const rtl = page('<p>Here is the fix for it</p>', {
    enabled: true,
    direction: 'rtl',
  }).document;
  assert.equal(rtl.querySelector('p').getAttribute('dir'), 'rtl');
  assert.equal(rtl.querySelector('.vditor-reset').getAttribute('dir'), 'rtl');

  const ltr = page('<p>سلام دنیا</p>', {
    enabled: true,
    direction: 'ltr',
  }).document;
  assert.equal(ltr.querySelector('p').getAttribute('dir'), 'ltr');
});

test('the config script reflects the settings', () => {
  assert.equal(
    office.script({ enabled: true, officeViewer: true, direction: 'auto' }),
    '/* Generated by Rastin on activation; do not edit. */\n' +
      "globalThis.__rastinPreview = { enabled: true, direction: 'auto' };\n",
  );
  assert.match(
    office.script({ enabled: true, officeViewer: true, direction: 'rtl' }),
    /direction: 'rtl'/,
  );
  assert.equal(office.settings({ enabled: false }).enabled, false);
  assert.equal(office.settings({ officeViewer: false }).enabled, false);
  assert.equal(office.settings({}).enabled, true);
  assert.equal(office.settings({ direction: 'sideways' }).direction, 'auto');
});

// ── PATCH ───────────────────────────────────────────────────────────────

test('apply writes the assets, config, and marked page block', async (t) => {
  const { home, target } = await fixture();
  t.after(() => fsp.rm(home, { recursive: true, force: true }));

  const result = await office.apply({
    root,
    home,
    version: '1.2.3',
    enabled: true,
    officeViewer: true,
    direction: 'auto',
  });
  assert.equal(result.targets, 1);
  assert.deepEqual(result.failed, []);

  const html = await fsp.readFile(target.htmlPath, 'utf8');
  assert.ok(html.startsWith(PAGE.slice(0, PAGE.indexOf('</html>'))));
  assert.ok(html.includes(office.START));
  assert.ok(html.includes('<!-- rastin 1.2.3 -->'));
  assert.ok(html.includes('<script src="rastin.office.js"></script>'));
  assert.ok(html.trimEnd().endsWith('</html>'));

  for (const asset of office.ASSETS) {
    assert.deepEqual(
      await fsp.readFile(path.join(target.dir, asset.to)),
      await fsp.readFile(path.join(root, asset.from)),
    );
  }
  assert.match(
    await fsp.readFile(path.join(target.dir, office.CONFIG), 'utf8'),
    /__rastinPreview = \{ enabled: true, direction: 'auto' \}/,
  );
});

test('a second apply is a no-op, a new version replaces the block', async (t) => {
  const { home, target } = await fixture();
  t.after(() => fsp.rm(home, { recursive: true, force: true }));

  const input = await patchInput();
  await office.patchTarget(target, input);
  const once = await fsp.readFile(target.htmlPath, 'utf8');
  assert.deepEqual(await office.patchTarget(target, input), []);
  assert.equal(await fsp.readFile(target.htmlPath, 'utf8'), once);

  await office.patchTarget(target, { ...input, version: '1.2.4' });
  const next = await fsp.readFile(target.htmlPath, 'utf8');
  assert.ok(next.includes('<!-- rastin 1.2.4 -->'));
  assert.equal(next.split(office.START).length, 2);
});

test('remove restores the page and deletes the generated files', async (t) => {
  const { home, target } = await fixture();
  t.after(() => fsp.rm(home, { recursive: true, force: true }));

  await office.patchTarget(target, await patchInput());
  const result = await office.remove({ home });
  assert.equal(result.targets, 1);
  assert.deepEqual(result.failed, []);
  assert.equal(await fsp.readFile(target.htmlPath, 'utf8'), PAGE);

  for (const asset of office.ASSETS) {
    assert.equal(fs.existsSync(path.join(target.dir, asset.to)), false);
  }
  assert.equal(fs.existsSync(path.join(target.dir, office.CONFIG)), false);
});

test('installs are discovered in every supported extension directory', async (t) => {
  const { home, target } = await fixture();
  t.after(() => fsp.rm(home, { recursive: true, force: true }));

  const cursor = path.join(
    home,
    '.cursor',
    'extensions',
    'cweijan.vscode-office-8.0.0',
  );
  await fsp.mkdir(path.join(cursor, 'resource', 'markdown'), {
    recursive: true,
  });
  await fsp.writeFile(path.join(cursor, office.HTML), PAGE);
  // A directory with the prefix but no editor page is not a target.
  await fsp.mkdir(
    path.join(home, '.vscode', 'extensions', 'cweijan.vscode-office-broken'),
  );

  const targets = await office.findTargets({ home });
  assert.deepEqual(targets.map(({ name }) => name).sort(), [
    'cweijan.vscode-office-8.0.0',
    target.name,
  ]);
});

// ── PACKAGING ───────────────────────────────────────────────────────────

test('the setting ships on by default', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json')));
  assert.equal(
    pkg.contributes.configuration.properties['rastin.officeViewer'].default,
    true,
  );
});

test('the stylesheet follows the direction and keeps code LTR', () => {
  const css = fs.readFileSync(
    path.join(root, 'markdown', 'office.css'),
    'utf8',
  );
  assert.match(
    css,
    /\.vditor-reset\[data-rastin-office\]\s*:is\(pre, code, kbd, samp\)/,
  );
  assert.match(css, /padding-right: 2em/);
  assert.match(css, /border-inline-start-width: 5px/);
  assert.match(css, /\[data-rastin-mirror\]/);
});
