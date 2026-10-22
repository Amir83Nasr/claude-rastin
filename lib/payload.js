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

const FAMILY = 'IRANYekanX';
const USER_FAMILY = 'RastinUser';

const FONT_FORMATS = {
  '.woff2': 'woff2',
  '.woff': 'woff',
  '.ttf': 'truetype',
  '.otf': 'opentype',
};

const BASE_STACK = [
  '-apple-system',
  'BlinkMacSystemFont',
  "'Segoe UI'",
  "'PingFang SC'",
  "'Hiragino Sans GB'",
  "'Microsoft YaHei'",
  "'Helvetica Neue'",
  'Helvetica',
  'Arial',
  'sans-serif',
].join(', ');

const MONO_STACK = [
  'ui-monospace',
  'SFMono-Regular',
  'Menlo',
  'Consolas',
  'monospace',
].join(', ');

// ── CSS HELPERS ────────────────────────────────────────────────────────

// Settings land in another extension's files, so every injected value is
// reduced to letters, digits, spaces and `. _ -` before it reaches CSS.
function familyName(value) {
  const clean = String(value === undefined || value === null ? '' : value)
    .replace(/[^\p{L}\p{N}\s._-]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 64);
  return clean === '' ? null : clean;
}

function clamp(value, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return 0;
  return Math.min(Math.max(number, min), max);
}

function face({ family, weight, to, format }) {
  return `@font-face {
  font-family: '${family}';
  font-style: normal;
  font-weight: ${weight};
  font-display: swap;
  src: url('fonts/${to}') format('${format}');
}`;
}

// A user font is copied next to the bundled faces and served from the same
// webview source, because the webview CSP blocks `data:` fonts.
function userFont(file) {
  if (!file) return null;
  const ext = path.extname(String(file)).toLowerCase();
  const format = FONT_FORMATS[ext];
  if (!format) return null;
  const from = path.resolve(String(file));
  if (!fs.existsSync(from)) return null;
  return {
    from,
    to: `rastin-user-font${ext}`,
    // One file, so declare Regular and let the browser synthesize bold.
    weight: 400,
    format,
    family: USER_FAMILY,
  };
}

function fontFaces(extra) {
  const faces = FONTS.map((font) =>
    face({ ...font, family: FAMILY, format: 'woff2' }),
  );
  if (extra) faces.push(face(extra));
  return faces.join('\n\n');
}

// ── MODE OVERRIDES ─────────────────────────────────────────────────────


// ── THEMES ─────────────────────────────────────────────────────────────

// Claude's own warm palette. VS Code's colors already reach the webview, so
// only the Claude palette needs rules of its own.
const CLAUDE_THEME = `/* claude palette */
:root.vscode-dark,
:root.vscode-high-contrast,
body.vscode-dark,
body.vscode-high-contrast {
  --app-primary-background: #141413;
  --app-secondary-background: #1b1a18;
  --app-primary-foreground: #faf9f5;
  --app-secondary-foreground: #d5d3cd;
  --app-button-background: #c6613f;
  --app-button-foreground: #faf9f5;
}

:root.vscode-light,
:root.vscode-high-contrast-light,
body.vscode-light,
body.vscode-high-contrast-light {
  --app-primary-background: #faf9f5;
  --app-secondary-background: #f0eee6;
  --app-primary-foreground: #141413;
  --app-secondary-foreground: #3d3d3a;
  --app-button-background: #c6613f;
  --app-button-foreground: #faf9f5;
}`;

// ── BUILD ──────────────────────────────────────────────────────────────

function read(root, relative) {
  return fs.readFileSync(path.join(root, relative), 'utf8');
}

function weight(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 400;
  return Math.min(Math.max(Math.round(number / 100) * 100, 300), 700);
}

function clamp(value, fallback, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(Math.max(number, min), max);
}

function variables(settings, extra) {
  const family = familyName(settings.fontFamily);
  const stack = [
    extra ? `'${extra.family}'` : null,
    family ? `'${family}'` : null,
    `'${FAMILY}'`,
    BASE_STACK,
  ]
    .filter(Boolean)
    .join(', ');

  const code = familyName(settings.codeFontFamily);
  const vars = [
    `  --rastin-font-family: ${stack};`,
    `  --rastin-code-font: ${
      code
        ? `'${code}', ${MONO_STACK}`
        : `var(--vscode-editor-font-family, ui-monospace), ${MONO_STACK}`
    };`,
    `  --rastin-font-weight: ${weight(settings.fontWeight)};`,
    `  --rastin-line-height: ${clamp(settings.lineHeight, 1.5, 1.2, 2.4)};`,
  ];

  // Claude writes the chat size as an inline style from its own setting, so
  // the override needs !important to win.
  const size = clamp(settings.fontSize, 0, 8, 32);
  if (size > 0) vars.push(`  --vscode-chat-font-size: ${size}px !important;`);

  return `:root {\n${vars.join('\n')}\n}`;
}

/**
 * Build the injected CSS/JS for the current settings.
 * @param {{root: string}} settings plus rastin.* configuration values
 */
function build(settings = {}) {
  const { root } = settings;
  const extra = userFont(settings.fontFile);
  const blocks = [
    fontFaces(extra),
    variables(settings, extra),
    read(root, 'src/payload.css'),
  ];
  if (settings.theme === 'claude') blocks.push(CLAUDE_THEME);

  return {
    css: blocks.join('\n\n') + '\n',
    // Every message's paragraphs are oriented at runtime, so the engine and
    // its installer always ship.
    js:
      read(root, 'src/direction.js') +
      '\n\n' +
      read(root, 'src/installer.js'),
    fonts: extra ? [...FONTS, extra] : FONTS,
    fontsSource: path.join(root, 'fonts'),
  };
}

module.exports = { build, FONTS };
