'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const {
  patchTarget,
  removeTarget,
  stripBlocks,
  versionIn,
  START,
  END,
  FOREIGN_BLOCKS,
} = require('../lib/patch.js');

const CSS = 'body { color: red; }\n';
const JS = 'console.log("app");\n';
const EXTENSION = 'const app = 1;\n';

const FOREIGN_CSS = `${FOREIGN_BLOCKS[0][0]}
.YBYrtl { direction: rtl; }
${FOREIGN_BLOCKS[0][1]}
`;
const FOREIGN_JS = `${FOREIGN_BLOCKS[1][0]}
(function () {})();
${FOREIGN_BLOCKS[1][1]}
`;
const FOREIGN_EXT = `${FOREIGN_BLOCKS[2][0]}
#content { direction: rtl; }
${FOREIGN_BLOCKS[2][1]}
`;

async function fixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'rastin-'));
  const webview = path.join(root, 'webview');
  await fs.mkdir(path.join(webview, 'fonts'), { recursive: true });

  const target = {
    name: 'anthropic.claude-code-9.9.9',
    dir: root,
    cssPath: path.join(webview, 'index.css'),
    jsPath: path.join(webview, 'index.js'),
    extensionPath: path.join(root, 'extension.js'),
    fontsDir: path.join(webview, 'fonts'),
  };
  await fs.writeFile(target.cssPath, CSS);
  await fs.writeFile(target.jsPath, JS);
  await fs.writeFile(target.extensionPath, EXTENSION);

  const fontsSource = path.join(root, 'payload-fonts');
  await fs.mkdir(fontsSource);
  await fs.writeFile(path.join(fontsSource, 'Regular.woff2'), 'regular-font');
  await fs.writeFile(path.join(fontsSource, 'Bold.woff2'), 'bold-font');

  const payload = {
    css: '/* injected css */\n',
    js: '/* injected js */\n',
    fonts: [
      { from: 'Regular.woff2', to: 'rastin-regular.woff2' },
      { from: 'Bold.woff2', to: 'rastin-bold.woff2' },
    ],
    fontsSource,
  };

  return { root, target, payload };
}

test('apply patches css/js, copies fonts, keeps the base intact', async (t) => {
  const { root, target, payload } = await fixture();
  t.after(() => fs.rm(root, { recursive: true, force: true }));

  const changed = await patchTarget(target, payload, '1.2.3');
  assert.ok(changed.some((entry) => entry.endsWith('index.css')));
  assert.ok(changed.some((entry) => entry.endsWith('index.js')));

  const css = await fs.readFile(target.cssPath, 'utf8');
  assert.ok(css.startsWith(CSS));
  assert.ok(css.includes(START));
  assert.ok(css.includes(END));
  assert.equal(versionIn(css), '1.2.3');

  const js = await fs.readFile(target.jsPath, 'utf8');
  assert.ok(js.startsWith(JS));
  assert.ok(js.includes('/* injected js */'));

  assert.equal(
    await fs.readFile(
      path.join(target.fontsDir, 'rastin-regular.woff2'),
      'utf8',
    ),
    'regular-font',
  );
});

test('a second apply is a no-op (no stacked blocks)', async (t) => {
  const { root, target, payload } = await fixture();
  t.after(() => fs.rm(root, { recursive: true, force: true }));

  await patchTarget(target, payload, '1.2.3');
  const onceCss = await fs.readFile(target.cssPath, 'utf8');
  const onceJs = await fs.readFile(target.jsPath, 'utf8');

  const changed = await patchTarget(target, payload, '1.2.3');
  assert.deepEqual(changed, []);
  assert.equal(await fs.readFile(target.cssPath, 'utf8'), onceCss);
  assert.equal(await fs.readFile(target.jsPath, 'utf8'), onceJs);
  assert.equal(onceCss.split(START).length, 2);
});

test('remove restores the original files byte-for-byte', async (t) => {
  const { root, target, payload } = await fixture();
  t.after(() => fs.rm(root, { recursive: true, force: true }));

  await patchTarget(target, payload, '1.2.3');
  await removeTarget(target, payload);

  assert.equal(await fs.readFile(target.cssPath, 'utf8'), CSS);
  assert.equal(await fs.readFile(target.jsPath, 'utf8'), JS);
  assert.equal(
    await fs
      .access(path.join(target.fontsDir, 'rastin-regular.woff2'))
      .then(() => true)
      .catch(() => false),
    false,
  );
});

test('migrates yechielby patches before injecting', async (t) => {
  const { root, target, payload } = await fixture();
  t.after(() => fs.rm(root, { recursive: true, force: true }));

  await fs.writeFile(target.cssPath, CSS + FOREIGN_CSS);
  await fs.writeFile(target.jsPath, JS + FOREIGN_JS);
  await fs.writeFile(target.extensionPath, EXTENSION + FOREIGN_EXT);

  await patchTarget(target, payload, '1.2.3');

  const css = await fs.readFile(target.cssPath, 'utf8');
  const js = await fs.readFile(target.jsPath, 'utf8');
  const extension = await fs.readFile(target.extensionPath, 'utf8');
  for (const [start, end] of FOREIGN_BLOCKS) {
    assert.equal(css.includes(start), false);
    assert.equal(js.includes(start), false);
    assert.equal(css.includes(end), false);
    assert.equal(js.includes(end), false);
    assert.equal(extension.includes(start), false);
    assert.equal(extension.includes(end), false);
  }
  assert.ok(css.startsWith(CSS));
  assert.ok(css.includes('/* injected css */'));
  assert.equal(extension.trimEnd(), EXTENSION.trimEnd());
});

test('re-applies after a Claude Code update replaces the bundle', async (t) => {
  const { root, target, payload } = await fixture();
  t.after(() => fs.rm(root, { recursive: true, force: true }));

  await patchTarget(target, payload, '0.0.9');
  const updatedCss = 'body { color: blue; }\n';
  const updatedJs = 'console.log("new");\n';
  await fs.writeFile(target.cssPath, updatedCss);
  await fs.writeFile(target.jsPath, updatedJs);

  await patchTarget(target, payload, '1.2.3');
  const css = await fs.readFile(target.cssPath, 'utf8');
  assert.ok(css.startsWith(updatedCss));
  assert.equal(css.split(START).length, 2);
  assert.equal(versionIn(css), '1.2.3');
});

test('removes the script half when payload.js is null', async (t) => {
  const { root, target, payload } = await fixture();
  t.after(() => fs.rm(root, { recursive: true, force: true }));

  await patchTarget(target, payload, '1.2.3');
  await patchTarget(target, { ...payload, js: null }, '1.2.3');

  const js = await fs.readFile(target.jsPath, 'utf8');
  assert.equal(js, JS);
});

test('rejects an unterminated foreign marker instead of guessing', async (t) => {
  const { root, target, payload } = await fixture();
  t.after(() => fs.rm(root, { recursive: true, force: true }));

  await fs.writeFile(target.cssPath, CSS + FOREIGN_BLOCKS[0][0] + '\n');

  await assert.rejects(
    () => patchTarget(target, payload, '1.2.3'),
    /unterminated patch marker/,
  );
});

test('stripBlocks handles repeated blocks', () => {
  const text = `base\n${START}a${END}${START}b${END}`;
  const result = stripBlocks(text, [[START, END]]);
  assert.equal(result.removed, 2);
  assert.equal(result.text, 'base\n');
});

test('copies a user font referenced by absolute path', async (t) => {
  const { root, target, payload } = await fixture();
  t.after(() => fs.rm(root, { recursive: true, force: true }));

  const file = path.join(root, 'user.woff2');
  await fs.writeFile(file, 'user-font');

  const changed = await patchTarget(
    target,
    {
      ...payload,
      fonts: [{ from: file, to: 'rastin-user-font.woff2' }],
    },
    '1.2.3',
  );
  assert.ok(changed.includes(`${target.name}: fonts`));
  assert.equal(
    await fs.readFile(
      path.join(target.fontsDir, 'rastin-user-font.woff2'),
      'utf8',
    ),
    'user-font',
  );
});

test('prunes a stale user font when the font file changes', async (t) => {
  const { root, target, payload } = await fixture();
  t.after(() => fs.rm(root, { recursive: true, force: true }));

  const first = path.join(root, 'first.woff2');
  const second = path.join(root, 'second.woff2');
  await fs.writeFile(first, 'first-font');
  await fs.writeFile(second, 'second-font');

  await patchTarget(
    target,
    {
      ...payload,
      fonts: [{ from: first, to: 'rastin-user-font-11111111.woff2' }],
    },
    '1.2.3',
  );
  await patchTarget(
    target,
    {
      ...payload,
      fonts: [{ from: second, to: 'rastin-user-font-22222222.woff2' }],
    },
    '1.2.4',
  );

  const names = await fs.readdir(target.fontsDir);
  assert.deepEqual(names, ['rastin-user-font-22222222.woff2']);
});

test('remove deletes the copied user font', async (t) => {
  const { root, target, payload } = await fixture();
  t.after(() => fs.rm(root, { recursive: true, force: true }));

  const file = path.join(root, 'user.woff2');
  await fs.writeFile(file, 'user-font');
  const fonts = [
    ...payload.fonts,
    { from: file, to: 'rastin-user-font-abcdef12.woff2' },
  ];
  await patchTarget(target, { ...payload, fonts }, '1.2.3');
  await removeTarget(target, { ...payload, fonts });

  const names = await fs.readdir(target.fontsDir);
  assert.deepEqual(names, []);
});
