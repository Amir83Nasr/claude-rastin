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

test('invalid user values fall back instead of leaking into CSS', () => {
  const payload = build({ root, fontWeight: 'bold;}', lineHeight: NaN });
  assert.match(payload.css, /--rastin-font-weight:\s*400/);
  assert.match(payload.css, /--rastin-line-height:\s*1\.5/);
});

test('bundled font assets exist', () => {
  for (const font of ['IRANYekanX-Regular.woff2', 'IRANYekanX-Bold.woff2']) {
    assert.ok(fs.existsSync(path.join(root, 'fonts', font)), font);
  }
});

test('font family, code family, and size land in the variables', () => {
  const payload = build({
    root,
    fontFamily: 'Vazirmatn',
    codeFontFamily: 'Fira Code',
    fontSize: 15,
  });
  assert.match(
    payload.css,
    /--rastin-font-family: 'Vazirmatn', 'IRANYekanX'/,
  );
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
  assert.match(
    payload.css,
    /--rastin-font-family: 'RastinUser', 'IRANYekanX'/,
  );
  const extra = payload.fonts.find((font) => font.family === 'RastinUser');
  assert.equal(extra.from, file);
  assert.equal(extra.to, 'rastin-user-font.woff2');
});

test('a missing or unsupported font file falls back to IranYekanX', () => {
  const missing = build({ root, fontFile: '/nowhere/nope.woff2' });
  assert.equal(missing.css.includes('RastinUser'), false);
  assert.equal(missing.fonts.length, 2);

  const unsupported = build({ root, fontFile: path.join(root, 'README.md') });
  assert.equal(unsupported.css.includes('RastinUser'), false);
});

test('theme claude adds its palette, vscode leaves colors alone', () => {
  const claude = build({ root, theme: 'claude' });
  assert.match(claude.css, /--app-primary-background: #141413/);
  assert.match(claude.css, /body\.vscode-light/);

  const plain = build({ root, theme: 'vscode' });
  assert.equal(plain.css.includes('--app-primary-background'), false);
});
