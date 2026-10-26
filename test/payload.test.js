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
  assert.match(payload.css, /--rastin-line-height:\s*2/);
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

test('insight banners stay left even inside an RTL root', () => {
  // The ★ header and ─ footer are block-level fit-content <code>: under an
  // RTL paragraph their auto margins would put the box on the right. The
  // code island rule already gives them LTR text; only the box needs pinning.
  const css = build({ root }).css;
  const rule = css.match(
    /\[class\*='insightHeader_'\],\s*\[class\*='insightFooter_'\]\s*\{[^}]*\}/,
  );
  assert.ok(rule, 'insight rule is missing');
  assert.match(rule[0], /margin-left: 0;/);
  assert.match(rule[0], /margin-right: auto;/);
});

test('a Persian todo list takes its card header with it', () => {
  // The tool card header is LTR chrome, so "Update Todos" stayed on the left
  // while an RTL list sat on the right. When every item reads RTL the card is
  // a Persian list and the header follows; any Latin item keeps the LTR
  // header. CSS only: the installer's dir attributes flip it as items change.
  const css = build({ root }).css;
  const start = css.indexOf("[class*='toolUse_']:has(");
  assert.ok(start >= 0, 'todo header rule is missing');
  const rule = css.slice(start, css.indexOf('}', start) + 1);
  assert.ok(
    rule.includes("[class*='todoItem_'] [class*='content_'][dir='rtl']"),
  );
  assert.ok(rule.includes(':not('));
  assert.ok(
    rule.includes("[class*='todoItem_'] [class*='content_'][dir='ltr']"),
  );
  assert.ok(rule.includes("[class*='toolSummary_']"));
  assert.match(rule, /direction: rtl;/);
  assert.match(rule, /text-align: start;/);
});

test('the question panel is oriented like message prose', () => {
  // The AskUserQuestion panel renders outside every message root, so its
  // lines need their own seats: the installer must select them, and the
  // stylesheet must align them and flip an RTL option row.
  const payload = build({ root });
  for (const name of ['optionLabel_', 'optionDescription_', 'navTab_']) {
    assert.ok(payload.js.includes(`[class*="${name}"]`), name);
  }
  assert.ok(payload.js.includes('[class*="previewBody_"]'));
  assert.ok(payload.css.includes("[class*='permissionRequestHeader_']"));
  assert.match(
    payload.css,
    /\[role='radio'\]:has\(\[class\*='optionLabel_'\]\[dir='rtl'\]\)/,
  );
});

test('invalid user values fall back instead of leaking into CSS', () => {
  const payload = build({ root, fontWeight: 'bold;}', lineHeight: NaN });
  assert.match(payload.css, /--rastin-font-weight:\s*400/);
  assert.match(payload.css, /--rastin-line-height:\s*2/);
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
  const css = build({ root }).css;
  assert.equal(css.includes('--vscode-chat-font-size'), false);
  // 0 is the documented "keep the host size" value, not an 8px request.
  assert.equal(
    build({ root, fontSize: 0 }).css.includes('--vscode-chat-font-size'),
    false,
  );
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
  assert.match(claude.css, /--app-primary-background: #262624/);
  assert.match(claude.css, /body\.vscode-light:not/);
  assert.match(claude.css, /body\.vscode-dark:not/);

  const plain = build({ root, theme: 'vscode' });
  assert.equal(plain.css.includes('--app-primary-background'), false);
});

test('explicit claude themes ignore the VS Code light/dark class', () => {
  const dark = build({ root, theme: 'claude-dark' }).css;
  assert.equal(dark.includes('body.vscode-light'), false);
  // The palette lands on <body>, where VS Code puts the theme and
  // high-contrast classes; `:root` would never see them.
  assert.match(dark, /body:not\(\[class\*="high-contrast"\]\) \{/);
  assert.match(dark, /--app-primary-background: #262624/);
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
  // The palette block is the override; prose CSS may still read host vars
  // like --app-button-background, so match the block, not that substring.
  assert.equal(
    build({ root, theme: 'solarized' }).css.includes('/* claude palette'),
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

test('rastin.direction auto leaves every paragraph to the engine', () => {
  const payload = build({ root, direction: 'auto' });
  // The engine reads the override; only the build-time assignment is absent.
  assert.equal(payload.js.includes('globalThis.__rastinForcedDir ='), false);
  assert.equal(payload.css.includes('/* rastin.direction'), false);
});

test('rastin.direction rtl pins the engine and the bidi-aware lines', () => {
  const payload = build({ root, direction: 'rtl' });
  assert.match(payload.js, /^globalThis\.__rastinForcedDir = 'rtl';/);
  assert.match(
    payload.css,
    /\[class\*='mentionMirror_'\][\s\S]*?direction: rtl !important;/,
  );
  // Roots start from the stylesheet, so a forced chat is pinned before the
  // observer's first pass instead of flashing the auto RTL/ltr default.
  assert.match(
    payload.css,
    /\[data-testid='assistant-message'\] \[class\*='root_'\],[\s\S]*?direction: rtl !important;/,
  );
  // Code and tool islands must stay LTR: the forced rule names prose seats,
  // composer, and panels only.
  const marker = payload.css.indexOf('/* rastin.direction: rtl */');
  const forced = payload.css.slice(marker);
  assert.equal(forced.includes("[class*='toolUse_']"), false);
  assert.equal(forced.includes('codeBlockWrapper_'), false);
});

test('rastin.direction ltr also moves the "Other" placeholder left', () => {
  const payload = build({ root, direction: 'ltr' });
  assert.match(payload.js, /^globalThis\.__rastinForcedDir = 'ltr';/);
  assert.match(payload.css, /\[class\*='otherInput_'\][\s\S]*?left: 8px;/);
});

test('an unknown direction value falls back to auto', () => {
  const payload = build({ root, direction: 'sideways' });
  assert.equal(payload.js.includes('globalThis.__rastinForcedDir ='), false);
  assert.equal(payload.css.includes('/* rastin.direction'), false);
});
