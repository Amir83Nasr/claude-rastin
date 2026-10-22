'use strict';

const fs = require('node:fs');
const path = require('node:path');

// ── FONT ASSETS ────────────────────────────────────────────────────────

const FONTS = [
  {
    from: 'IRANYekanX-Regular.woff2',
    to: 'rastin-iranyekanx-regular.woff2',
    weight: 400,
  },
  {
    from: 'IRANYekanX-Bold.woff2',
    to: 'rastin-iranyekanx-bold.woff2',
    weight: 700,
  },
];

// Copied next to Claude Code's own webview assets so the webview CSP
// (font-src cspSource, no data:) serves them.
function fontFaces() {
  return FONTS.map(
    (font) => `@font-face {
  font-family: 'IRANYekanX';
  font-style: normal;
  font-weight: ${font.weight};
  font-display: swap;
  src: url('fonts/${font.to}') format('woff2');
}`,
  ).join('\n\n');
}

// ── MODE OVERRIDES ─────────────────────────────────────────────────────

const LTR_MODE = `/* ltr mode */
[data-testid="assistant-message"] [class*="root_"],
[class*="userMessage_"] [class*="root_"],
[class*="userMessage_"],
[class*="messageInput_"] [contenteditable="true"],
[class*="messageInput_"] textarea,
[class*="mentionMirror_"],
[class*="otherInput_"] textarea,
[class*="otherInput_"] [contenteditable] {
  direction: ltr;
}`;

// ── BUILD ──────────────────────────────────────────────────────────────

function read(root, relative) {
  return fs.readFileSync(path.join(root, relative), 'utf8');
}

/**
 * Build the injected CSS/JS for one mode.
 * @param {{root: string, mode: 'auto'|'rtl'|'ltr'}} options
 */
function build({ root, mode }) {
  const css = [fontFaces(), read(root, 'src/payload.css')];
  if (mode === 'ltr') css.push(LTR_MODE);

  return {
    css: css.join('\n\n') + '\n',
    // Auto mode needs the DOM observer; rtl/ltr are pure CSS.
    js:
      mode === 'auto'
        ? read(root, 'src/direction.js') +
          '\n\n' +
          read(root, 'src/installer.js')
        : null,
    fonts: FONTS,
    fontsSource: path.join(root, 'fonts'),
  };
}

module.exports = { build, FONTS };
