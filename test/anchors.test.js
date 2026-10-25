'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const { ANCHORS, CORE_ANCHORS, missingAnchors } = require('../lib/anchors.js');
const { apply } = require('../lib/patch.js');
const { build } = require('../lib/payload.js');

const root = path.join(__dirname, '..');

// Every file whose selectors reach Claude Code's DOM.
const SELECTOR_SOURCES = [
  'lib/payload.js',
  'webview/direction.js',
  'webview/installer.js',
  'webview/payload.css',
];

test('missingAnchors matches the prefix and ignores the hash suffix', () => {
  const css = '.root_-a7MRw{} .userMessage_xY1{}';
  assert.deepEqual(
    missingAnchors(css, ['root_', 'userMessage_', 'todoItem_']),
    ['todoItem_'],
  );
});

test('every class selector in the injected sources is a known anchor', () => {
  const used = new Set();
  for (const file of SELECTOR_SOURCES) {
    const text = fs.readFileSync(path.join(root, file), 'utf8');
    for (const [, name] of text.matchAll(
      /\[class\*=['"]?([A-Za-z_]+)['"]?\]/g,
    )) {
      used.add(name);
    }
  }
  assert.deepEqual(
    [...used].filter((name) => !ANCHORS.includes(name)),
    [],
    'add the new selector to lib/anchors.js ANCHORS',
  );
  assert.deepEqual(
    ANCHORS.filter((name) => !used.has(name)),
    [],
    'remove the stale anchor from lib/anchors.js ANCHORS',
  );
});

test('core anchors are a subset of all anchors', () => {
  assert.deepEqual(
    CORE_ANCHORS.filter((name) => !ANCHORS.includes(name)),
    [],
  );
});

// apply() finds Claude Code under os.homedir(), so each test points HOME at a
// temporary home that holds one fake Claude Code build.
async function withFakeClaudeCode(t, css) {
  const home = await fsp.mkdtemp(path.join(os.tmpdir(), 'rastin-home-'));
  const previous = process.env.HOME;
  process.env.HOME = home;
  t.after(async () => {
    if (previous === undefined) delete process.env.HOME;
    else process.env.HOME = previous;
    await fsp.rm(home, { recursive: true, force: true });
  });

  const webview = path.join(
    home,
    '.vscode',
    'extensions',
    'anthropic.claude-code-9.9.9',
    'webview',
  );
  await fsp.mkdir(path.join(webview, 'fonts'), { recursive: true });
  await fsp.writeFile(path.join(webview, 'index.css'), css);
  await fsp.writeFile(path.join(webview, 'index.js'), 'void 0;\n');
  return build({ root });
}

test('apply reports a build that lost its core anchors', async (t) => {
  const payload = await withFakeClaudeCode(t, '.answer_x{}\n');
  const result = await apply({ payload, version: '1.2.3' });
  assert.equal(result.unanchored.length, 1);
  assert.equal(result.unanchored[0].name, 'anthropic.claude-code-9.9.9');
  assert.deepEqual(result.unanchored[0].missing, CORE_ANCHORS);
});

test('apply stays quiet for a build that has every core anchor', async (t) => {
  const css = CORE_ANCHORS.map((name) => `.${name}-h1{}`).join('\n');
  const payload = await withFakeClaudeCode(t, css);
  const result = await apply({ payload, version: '1.2.3' });
  assert.equal(result.targets, 1);
  assert.deepEqual(result.unanchored, []);
});
