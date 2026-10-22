'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

// ── FONT ASSETS ────────────────────────────────────────────────────────

const FONTS = [
  {
    from: 'IRANYekanX-UltraLight.woff2',
    to: 'rastin-iranyekanx-ultralight.woff2',
    weight: 200,
  },
  {
    from: 'IRANYekanX-Light.woff2',
    to: 'rastin-iranyekanx-light.woff2',
    weight: 300,
  },
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
// Shares patch.js's prefix so stale copies can be pruned.
const USER_FONT_PREFIX = 'rastin-user-font';

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
function userFont(file, requested) {
  if (!file) return null;
  const ext = path.extname(String(file)).toLowerCase();
  const format = FONT_FORMATS[ext];
  if (!format) return null;
  const from = path.resolve(String(file));
  let data;
  try {
    data = fs.readFileSync(from);
  } catch {
    return null;
  }
  // The name carries the content hash: a new font must never be served from
  // the webview's cache under an old URL.
  const hash = crypto.createHash('sha1').update(data).digest('hex').slice(0, 8);
  return {
    from,
    to: `${USER_FONT_PREFIX}-${hash}${ext}`,
    // One file, so declare it at the weight prose asks for: a Light file then
    // renders light, and heavier text is synthesized from it.
    weight: requested,
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

// Claude's own warm palette, mapped onto the semantic --app-* variables the
// webview uses. VS Code's colors already reach the webview, so `vscode` is
// simply "no override". High-contrast themes keep the host's colors.
const PALETTES = {
  light: {
    'primary-background': '#faf9f5',
    'secondary-background': '#f0eee6',
    'header-background': '#f4f2eb',
    'tool-background': '#f7f5ee',
    'primary-foreground': '#141413',
    'secondary-foreground': '#5f5c55',
    'widget-border': '#ddd9cd',
    'primary-border-color': '#ddd9cd',
    'transparent-inner-border': '#00000012',
    // Host aliases are resolved at <html>, so restate them with our colors.
    'root-background': '#f0eee6',
    'plan-mode-color': '#c6613f',
    'pill-background': 'color-mix(in srgb, #141413 10%, transparent)',
    'pill-hover-background': 'color-mix(in srgb, #141413 18%, transparent)',
    'pill-foreground': '#141413',
    'input-background': '#ffffff',
    'input-border': '#cfcabd',
    'input-active-border': '#c6613f',
    'input-foreground': '#141413',
    'input-placeholder-foreground': '#8a867c',
    'input-secondary-background': '#ffffff',
    'input-secondary-foreground': '#141413',
    'list-hover-background': '#ece9df',
    'list-active-background': '#e4e0d4',
    'list-active-foreground': '#141413',
    'ghost-button-hover-background': '#ece9df',
    'menu-background': '#faf9f5',
    'menu-foreground': '#141413',
    'menu-border': '#ddd9cd',
    'menu-selection-background': '#e4e0d4',
    'menu-selection-foreground': '#141413',
    'button-background': '#c6613f',
    'button-foreground': '#faf9f5',
    'button-hover-background': '#b15434',
    'accent-color': '#c6613f',
    'code-background': '#ece9df',
    'inline-code-background': '#eae6da',
    'inline-code-foreground': '#9c4626',
    'link-foreground': '#a9491f',
    'error-foreground': '#b3261e',
    'warning-accent': '#b37517',
    'warning-foreground': '#5c4413',
    'warning-background': '#fdf3e1',
    'success-foreground': '#3f7d4e',
    'badge-background': '#e0dbcd',
    'badge-foreground': '#141413',
    'mention-chip-background': '#e4ded0',
    'mention-chip-foreground': '#7c3a1d',
    'disabled-foreground': '#a29d92',
    'modal-background': '#00000040',
    'spinner-foreground': '#c6613f',
    'status-unread': '#c6613f',
  },
  dark: {
    'primary-background': '#141413',
    'secondary-background': '#1b1a18',
    'header-background': '#1b1a18',
    'tool-background': '#1b1a18',
    'primary-foreground': '#faf9f5',
    'secondary-foreground': '#a8a49c',
    'widget-border': '#33312d',
    'primary-border-color': '#33312d',
    'transparent-inner-border': '#ffffff14',
    // Host aliases are resolved at <html>, so restate them with our colors.
    'root-background': '#1b1a18',
    'plan-mode-color': '#c6613f',
    'pill-background': 'color-mix(in srgb, #faf9f5 10%, transparent)',
    'pill-hover-background': 'color-mix(in srgb, #faf9f5 18%, transparent)',
    'pill-foreground': '#faf9f5',
    'input-background': '#24231f',
    'input-border': '#3b3934',
    'input-active-border': '#d97757',
    'input-foreground': '#faf9f5',
    'input-placeholder-foreground': '#8f8b83',
    'input-secondary-background': '#24231f',
    'input-secondary-foreground': '#faf9f5',
    'list-hover-background': '#26241f',
    'list-active-background': '#33302a',
    'list-active-foreground': '#faf9f5',
    'ghost-button-hover-background': '#26241f',
    'menu-background': '#1b1a18',
    'menu-foreground': '#faf9f5',
    'menu-border': '#33312d',
    'menu-selection-background': '#33302a',
    'menu-selection-foreground': '#faf9f5',
    'button-background': '#c6613f',
    'button-foreground': '#faf9f5',
    'button-hover-background': '#d97757',
    'accent-color': '#d97757',
    'code-background': '#24231f',
    'inline-code-background': '#26241f',
    'inline-code-foreground': '#e8a087',
    'link-foreground': '#e59a7d',
    'error-foreground': '#ff8a80',
    'warning-accent': '#e5a54b',
    'warning-foreground': '#faf9f5',
    'warning-background': '#24231f',
    'success-foreground': '#89d185',
    'badge-background': '#33302a',
    'badge-foreground': '#faf9f5',
    'mention-chip-background': '#2e2b26',
    'mention-chip-foreground': '#e8a087',
    'disabled-foreground': '#6f6b64',
    'modal-background': '#000000b3',
    'spinner-foreground': '#d97757',
    'status-unread': '#d97757',
  },
};

const THEMES = {
  claude: null,
  'claude-light': 'light',
  'claude-dark': 'dark',
};

function paletteBlock(selector, palette, name) {
  const vars = Object.entries(palette).map(
    ([key, value]) => `  --app-${key}: ${value};`,
  );
  return `/* claude palette: ${name} */\n${selector} {\n${vars.join('\n')}\n}`;
}

// `high-contrast` styles must stay the host's, so every selector excludes it.
const HC = ':not([class*="high-contrast"])';

function themeCss(theme) {
  if (!(theme in THEMES)) return null;
  const fixed = THEMES[theme];
  if (fixed) {
    return paletteBlock(`:root${HC},\nbody${HC}`, PALETTES[fixed], fixed);
  }
  return [
    paletteBlock(`body.vscode-light${HC}`, PALETTES.light, 'light'),
    paletteBlock(`body.vscode-dark${HC}`, PALETTES.dark, 'dark'),
  ].join('\n\n');
}

// ── BUILD ──────────────────────────────────────────────────────────────

function read(root, relative) {
  return fs.readFileSync(path.join(root, relative), 'utf8');
}

function weight(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 400;
  return Math.min(Math.max(Math.round(number / 100) * 100, 200), 700);
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
    family && family !== FAMILY ? `'${family}'` : null,
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
  const extra = userFont(settings.fontFile, weight(settings.fontWeight));
  const blocks = [
    fontFaces(extra),
    variables(settings, extra),
    read(root, 'src/payload.css'),
  ];
  const theme = themeCss(settings.theme);
  if (theme) blocks.push(theme);

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
