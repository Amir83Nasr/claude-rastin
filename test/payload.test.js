'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const { build } = require('../lib/payload.js');

const root = path.join(__dirname, '..');

test('build embeds the weight and line-height variables', () => {
  const payload = build({ root, fontWeight: 600, lineHeight: 1.8 });
  assert.match(payload.css, /--rastin-font-weight:\s*600/);
  assert.match(payload.css, /--rastin-line-height:\s*1\.8/);
  assert.ok(payload.css.includes('@font-face'));
});

test('build always ships the auto-direction installer', () => {
  const payload = build({ root });
  assert.ok(payload.js.includes('BLOCK_SELECTOR'));
  assert.ok(payload.js.includes('__rastinDirection'));
  assert.match(payload.css, /--rastin-font-weight:\s*400/);
  assert.match(payload.css, /--rastin-line-height:\s*1\.5/);
});

test('the composer rule matches plaintext-only contenteditable', () => {
  // Claude marks the composer contenteditable="plaintext-only", and the
  // mention mirror paints the glyphs over the input that paints the caret.
  // A selector for [contenteditable="true"] alone leaves the input LTR
  // while the mirror is RTL, so every caret sits one line-width off.
  const css = build({ root }).css;
  assert.ok(css.includes("[contenteditable]:not([contenteditable='false'])"));
  assert.ok(css.includes("[class*='mentionMirror_']"));
});

test('invalid user values fall back instead of leaking into CSS', () => {
  const payload = build({ root, fontWeight: 'bold;}', lineHeight: NaN });
  assert.match(payload.css, /--rastin-font-weight:\s*400/);
  assert.match(payload.css, /--rastin-line-height:\s*1\.5/);
});

test('bundled font assets exist', () => {
  for (const font of [
    'IRANYekanX-UltraLight.woff2',
    'IRANYekanX-Light.woff2',
    'IRANYekanX-Regular.woff2',
    'IRANYekanX-Bold.woff2',
  ]) {
    assert.ok(fs.existsSync(path.join(root, 'fonts', font)), font);
  }
});

test('the bundled family ships light faces', () => {
  const css = build({ root, fontWeight: 300 }).css;
  for (const weight of [200, 300, 400, 700]) {
    assert.match(css, new RegExp(`font-weight: ${weight};`));
  }
  assert.match(css, /--rastin-font-weight: 300;/);
  // Anything below the lightest face clamps to it.
  assert.match(
    build({ root, fontWeight: 100 }).css,
    /--rastin-font-weight: 200;/,
  );
});

test('a user font file is declared at the requested weight', () => {
  const file = path.join(root, 'fonts', 'IRANYekanX-Light.woff2');
  const css = build({ root, fontFile: file, fontWeight: 300 }).css;
  assert.match(
    css,
    /font-family: 'RastinUser';\n  font-style: normal;\n  font-weight: 300;/,
  );
});

test('font family, code family, and size land in the variables', () => {
  const payload = build({
    root,
    fontFamily: 'Vazirmatn',
    codeFontFamily: 'Fira Code',
    fontSize: 15,
  });
  assert.match(payload.css, /--rastin-font-family: 'Vazirmatn', 'IRANYekanX'/);
  assert.match(payload.css, /--rastin-code-font: 'Fira Code', ui-monospace/);
  assert.match(payload.css, /--vscode-chat-font-size: 15px !important/);
});

test('no size override means the host size stays', () => {
  assert.equal(build({ root }).css.includes('--vscode-chat-font-size'), false);
});

test('a family name cannot inject CSS', () => {
  const payload = build({ root, fontFamily: "X';} body { display: none } /*" });
  assert.equal(payload.css.includes('display:none'), false);
  assert.equal(payload.css.includes("';}"), false);
  assert.match(payload.css, /--rastin-font-family: 'X body display none'/);
});

test('a font file becomes RastinUser and is copied by absolute path', () => {
  const file = path.join(root, 'fonts', 'IRANYekanX-Regular.woff2');
  const payload = build({ root, fontFile: file });
  assert.match(payload.css, /font-family: 'RastinUser'/);
  assert.match(payload.css, /--rastin-font-family: 'RastinUser', 'IRANYekanX'/);
  const extra = payload.fonts.find((font) => font.family === 'RastinUser');
  assert.equal(extra.from, file);
  // Content-hashed name, so a swapped font cannot come from the cache.
  assert.match(extra.to, /^rastin-user-font-[0-9a-f]{8}\.woff2$/);
});

test('a missing or unsupported font file falls back to IranYekanX', () => {
  const missing = build({ root, fontFile: '/nowhere/nope.woff2' });
  assert.equal(missing.css.includes('RastinUser'), false);
  assert.equal(missing.fonts.length, build({ root }).fonts.length);

  const unsupported = build({ root, fontFile: path.join(root, 'README.md') });
  assert.equal(unsupported.css.includes('RastinUser'), false);
});

test('theme claude adds its palette, vscode leaves colors alone', () => {
  const claude = build({ root, theme: 'claude' });
  assert.match(claude.css, /--app-primary-background: #faf9f5/);
  assert.match(claude.css, /--app-primary-background: #141413/);
  assert.match(claude.css, /body\.vscode-light:not/);
  assert.match(claude.css, /body\.vscode-dark:not/);

  const plain = build({ root, theme: 'vscode' });
  assert.equal(plain.css.includes('--app-primary-background'), false);
});

test('explicit claude themes ignore the VS Code light/dark class', () => {
  const dark = build({ root, theme: 'claude-dark' }).css;
  assert.equal(dark.includes('body.vscode-light'), false);
  assert.match(dark, /:root:not\(\[class\*="high-contrast"\]\),/);
  assert.match(dark, /--app-primary-background: #141413/);
  assert.equal(dark.includes('--app-primary-background: #faf9f5'), false);

  const light = build({ root, theme: 'claude-light' }).css;
  assert.match(light, /--app-primary-background: #faf9f5/);
  assert.equal(light.includes('body.vscode-dark'), false);
  assert.equal((light.match(/claude palette/g) || []).length, 1);
});

test('every palette block keeps high contrast untouched', () => {
  for (const theme of ['claude', 'claude-light', 'claude-dark']) {
    const blocks =
      build({ root, theme }).css.match(/\/\* claude palette[\s\S]*?\n\}/g) ||
      [];
    assert.ok(blocks.length > 0, theme);
    for (const block of blocks) {
      assert.ok(block.split('\n')[1].includes('high-contrast'), block);
    }
  }
});

test('an unknown theme value falls back to the VS Code colors', () => {
  assert.equal(
    build({ root, theme: 'solarized' }).css.includes('--app-'),
    false,
  );
});

test('line height steps by 0.1 in the settings UI', () => {
  const pkg = JSON.parse(
    fs.readFileSync(path.join(root, 'package.json'), 'utf8'),
  );
  const props = pkg.contributes.configuration.properties;
  // A number field steps by 1, so the 0.1 steps come from the enum list.
  const heights = props['rastin.lineHeight'].enum;
  assert.ok(heights.includes(1.5));
  for (let i = 1; i < heights.length; i += 1) {
    assert.ok(Math.abs(heights[i] - heights[i - 1] - 0.1) < 1e-9);
  }
  assert.equal(props['rastin.fontSize'].type, 'integer');
  assert.ok(props['rastin.theme'].enum.includes('claude-dark'));
  assert.ok(props['rastin.theme'].enum.includes('claude-light'));
});
