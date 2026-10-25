'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const { FONT_FAMILY, USER_FONT_PREFIX } = require('./constants');

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
    face({ ...font, family: FONT_FAMILY, format: 'woff2' }),
  );
  if (extra) faces.push(face(extra));
  return faces.join('\n\n');
}

// ── MODE OVERRIDES ─────────────────────────────────────────────────────

// ── THEMES ─────────────────────────────────────────────────────────────

// Claude's own palette, mapped onto the semantic --app-* variables the
// webview uses. VS Code's colors already reach the webview, so `vscode` is
// simply "no override". High-contrast themes keep the host's colors.
// Values are claude.ai's `data-theme=claude` design tokens (HSL converted to
// hex): light surfaces are bg-100 ivory with bg-200/bg-300 steps and a white
// composer (bg-000); dark surfaces are bg-100 #262624 with a #30302e composer
// and bg-200/bg-300 steps. Text is text-000/text-400, the brand accent is
// accent-brand #d97757, buttons use brand-000 clay #c6613f, and borders are
// border-300 ink at low alpha, the way claude.ai draws them.
const PALETTES = {
  light: {
    'primary-background': '#faf9f5',
    'secondary-background': '#f5f4ed',
    'header-background': '#f5f4ed',
    'tool-background': '#f5f4ed',
    'primary-foreground': '#141413',
    'secondary-foreground': '#73726c',
    'widget-border': '#1f1e1d26',
    'primary-border-color': '#1f1e1d26',
    'transparent-inner-border': '#1f1e1d12',
    // Host aliases are resolved at <html>, so restate them with our colors.
    'root-background': '#f5f4ed',
    'plan-mode-color': '#d97757',
    'pill-background': 'color-mix(in srgb, #141413 8%, transparent)',
    'pill-hover-background': 'color-mix(in srgb, #141413 14%, transparent)',
    'pill-foreground': '#141413',
    'input-background': '#ffffff',
    'input-border': '#1f1e1d4d',
    'input-active-border': '#d97757',
    'input-foreground': '#141413',
    'input-placeholder-foreground': '#73726c',
    'input-secondary-background': '#ffffff',
    'input-secondary-foreground': '#141413',
    'list-hover-background': '#f0eee6',
    'list-active-background': '#e8e6dc',
    'list-active-foreground': '#141413',
    'ghost-button-hover-background': '#f0eee6',
    'menu-background': '#ffffff',
    'menu-foreground': '#141413',
    'menu-border': '#1f1e1d26',
    'menu-selection-background': '#f0eee6',
    'menu-selection-foreground': '#141413',
    'button-background': '#c6613f',
    'button-foreground': '#ffffff',
    'button-hover-background': '#b15434',
    'accent-color': '#d97757',
    'code-background': '#f5f4ed',
    'inline-code-background': '#f0eee6',
    'inline-code-foreground': '#8a2424',
    'link-foreground': '#1b67b2',
    'error-foreground': '#b53333',
    'warning-accent': '#875a08',
    'warning-foreground': '#5d4704',
    'warning-background': '#f8eedd',
    'success-foreground': '#005c08',
    'badge-background': '#e8e6dc',
    'badge-foreground': '#141413',
    'mention-chip-background': '#e8e6dc',
    'mention-chip-foreground': '#141413',
    'disabled-foreground': 'color-mix(in srgb, #73726c 50%, transparent)',
    'modal-background': '#00000040',
    'spinner-foreground': '#d97757',
    'status-unread': '#d97757',
    'status-busy': '#459315',
    'status-pending': '#875a08',
    'progressbar-background': '#d97757',
    'effort-fill-color': '#d97757',
    'recording-background': '#f9ecec',
    'recording-foreground': '#b53333',
    'list-drop-background': '#e8e6dc',
    'splitter-hover-background': '#d97757',
    // Native scrollbars and floating surfaces, which the host paints from
    // its own theme unless the palette names them. claude.ai uses border-300
    // at 35% for its scrollbars.
    'scrollbar-thumb': 'color-mix(in srgb, #1f1e1d 35%, transparent)',
    shadow: '#1f1e1d26',
  },
  dark: {
    'primary-background': '#262624',
    'secondary-background': '#1f1e1d',
    'header-background': '#1f1e1d',
    'tool-background': '#1f1e1d',
    'primary-foreground': '#faf9f5',
    'secondary-foreground': '#9c9a92',
    'widget-border': '#dedcd126',
    'primary-border-color': '#dedcd126',
    'transparent-inner-border': '#dedcd11a',
    // Host aliases are resolved at <html>, so restate them with our colors.
    'root-background': '#1f1e1d',
    'plan-mode-color': '#d97757',
    'pill-background': 'color-mix(in srgb, #faf9f5 10%, transparent)',
    'pill-hover-background': 'color-mix(in srgb, #faf9f5 18%, transparent)',
    'pill-foreground': '#faf9f5',
    'input-background': '#30302e',
    'input-border': '#dedcd14d',
    'input-active-border': '#d97757',
    'input-foreground': '#faf9f5',
    'input-placeholder-foreground': '#9c9a92',
    'input-secondary-background': '#30302e',
    'input-secondary-foreground': '#faf9f5',
    'list-hover-background': '#30302e',
    'list-active-background': '#3d3d3a',
    'list-active-foreground': '#faf9f5',
    'ghost-button-hover-background': '#30302e',
    'menu-background': '#30302e',
    'menu-foreground': '#faf9f5',
    'menu-border': '#dedcd126',
    'menu-selection-background': '#3d3d3a',
    'menu-selection-foreground': '#faf9f5',
    'button-background': '#c6613f',
    'button-foreground': '#ffffff',
    'button-hover-background': '#d97757',
    'accent-color': '#d97757',
    'code-background': '#141413',
    'inline-code-background': '#30302e',
    'inline-code-foreground': '#fe8181',
    'link-foreground': '#74abe2',
    'error-foreground': '#fe8181',
    'warning-accent': '#da9e25',
    'warning-foreground': '#da9e25',
    'warning-background': '#4b3902',
    'success-foreground': '#65bb30',
    'badge-background': '#3d3d3a',
    'badge-foreground': '#faf9f5',
    'mention-chip-background': '#3d3d3a',
    'mention-chip-foreground': '#faf9f5',
    'disabled-foreground': '#73726c',
    'modal-background': '#000000b3',
    'spinner-foreground': '#d97757',
    'status-unread': '#d97757',
    'status-busy': '#65bb30',
    'status-pending': '#da9e25',
    'progressbar-background': '#d97757',
    'effort-fill-color': '#d97757',
    'recording-background': 'color-mix(in srgb, #dd5353 20%, transparent)',
    'recording-foreground': '#fe8181',
    'list-drop-background': '#3d3d3a',
    'splitter-hover-background': '#d97757',
    'scrollbar-thumb': 'color-mix(in srgb, #dedcd1 35%, transparent)',
    shadow: '#00000066',
  },
};

const THEMES = {
  claude: null,
  'claude-light': 'light',
  'claude-dark': 'dark',
};

// Host variables that components read directly (scrollbar sliders, widget
// shadows, focus rings) are resolved inside the webview, so the palette has
// to restate them or they keep the VS Code theme's colors on a Claude chat.
const HOST_ALIASES = {
  'vscode-scrollbarSlider-background': 'app-scrollbar-thumb',
  'vscode-scrollbarSlider-hoverBackground': 'app-accent-color',
  'vscode-widget-shadow': 'app-shadow',
  'vscode-widget-border': 'app-widget-border',
  'vscode-focusBorder': 'app-accent-color',
  'vscode-editor-background': 'app-secondary-background',
  'vscode-sideBar-background': 'app-primary-background',
  'vscode-foreground': 'app-primary-foreground',
  'vscode-descriptionForeground': 'app-secondary-foreground',
  'vscode-disabledForeground': 'app-disabled-foreground',
  'vscode-errorForeground': 'app-error-foreground',
  'vscode-textLink-foreground': 'app-link-foreground',
  'vscode-panel-border': 'app-widget-border',
  'vscode-button-background': 'app-button-background',
  'vscode-button-foreground': 'app-button-foreground',
  'vscode-button-hoverBackground': 'app-button-hover-background',
  // Read directly by the chat CSS, so they need the palette too.
  'vscode-scrollbar-shadow': 'app-shadow',
  'vscode-scrollbarSlider-activeBackground': 'app-accent-color',
  'vscode-list-hoverBackground': 'app-list-hover-background',
  'vscode-list-activeSelectionBackground': 'app-list-active-background',
  'vscode-list-activeSelectionForeground': 'app-list-active-foreground',
  'vscode-list-highlightForeground': 'app-accent-color',
  'vscode-list-focusHighlightForeground': 'app-accent-color',
  'vscode-list-dropBackground': 'app-list-drop-background',
  'vscode-input-background': 'app-input-background',
  'vscode-input-foreground': 'app-input-foreground',
  'vscode-input-border': 'app-input-border',
  'vscode-input-placeholderForeground': 'app-input-placeholder-foreground',
  'vscode-inputOption-activeBorder': 'app-input-active-border',
  'vscode-inputOption-hoverBackground': 'app-ghost-button-hover-background',
  'vscode-menu-background': 'app-menu-background',
  'vscode-menu-foreground': 'app-menu-foreground',
  'vscode-menu-border': 'app-menu-border',
  'vscode-menu-selectionBackground': 'app-menu-selection-background',
  'vscode-menu-selectionForeground': 'app-menu-selection-foreground',
  'vscode-menu-selectionBorder': 'app-accent-color',
  'vscode-badge-background': 'app-badge-background',
  'vscode-badge-foreground': 'app-badge-foreground',
  'vscode-button-secondaryBackground': 'app-pill-background',
  'vscode-button-secondaryForeground': 'app-pill-foreground',
  'vscode-button-secondaryHoverBackground': 'app-pill-hover-background',
  'vscode-button-separator': 'app-widget-border',
  'vscode-progressBar-background': 'app-progressbar-background',
  'vscode-toolbar-hoverBackground': 'app-ghost-button-hover-background',
  'vscode-icon-foreground': 'app-secondary-foreground',
  'vscode-sideBarSectionHeader-border': 'app-widget-border',
  'vscode-sideBarActivityBarTop-border': 'app-widget-border',
};

function paletteBlock(selector, palette, name) {
  const vars = Object.entries(palette)
    .map(([key, value]) => `  --app-${key}: ${value};`)
    // The host writes --vscode-* inline on <html>; declaring them on <body>
    // keeps them because the inner element's value wins for its subtree.
    .concat(
      Object.entries(HOST_ALIASES).map(
        ([host, app]) => `  --${host}: var(--${app});`,
      ),
    )
    // Native scrollbars follow the palette instead of the editor's scheme.
    .concat(`  color-scheme: ${name};`);
  return `/* claude palette: ${name} */\n${selector} {\n${vars.join('\n')}\n}`;
}

// `high-contrast` styles must stay the host's, so every selector excludes it.
const HC = ':not([class*="high-contrast"])';

function themeCss(theme) {
  if (!(theme in THEMES)) return null;
  const fixed = THEMES[theme];
  if (fixed) {
    // The theme class lands on <body>, so the palette does too; `:root`
    // would never see the host's high-contrast class.
    return paletteBlock(`body${HC}`, PALETTES[fixed], fixed);
  }
  return [
    paletteBlock(`body.vscode-light${HC}`, PALETTES.light, 'light'),
    paletteBlock(`body.vscode-dark${HC}`, PALETTES.dark, 'dark'),
  ].join('\n\n');
}

// ── FORCED DIRECTION ───────────────────────────────────────────────────

// rastin.direction: rtl/ltr makes the engine pin every seat (dir attribute)
// without reading the text; the stylesheet then keys bubbles, quotes, todos,
// option rows, and alignment off `dir`. What `dir` cannot reach is the group
// that renders bidi-aware (`unicode-bidi: plaintext`): the composer, the
// plain-markdown roots, and question/permission copy. A forced chat restates
// those in one direction, so an English line cannot flip back on its own.
const FORCED_TARGETS = [
  // Message roots inherit RTL from webview/payload.css, so a forced LTR chat
  // must restate them in CSS as well as through the engine's dir attribute:
  // the chat reads right before the observer's first pass.
  "[data-testid='assistant-message'] [class*='root_']",
  "[class*='userMessage_'] [class*='root_']",
  "[class*='userMessage_']",
  "[class*='previewBody_'] [class*='root_']",
  // Mirrors the `plaintext` roots in webview/payload.css.
  "[data-testid='assistant-message'] [data-engine-markdown='plain']",
  "[data-testid='assistant-message'] [class*='markdownPlain_']",
  // The composer, its mention mirror, and the "Other" answer input.
  "[class*='messageInput_'][contenteditable]:not([contenteditable='false'])",
  "[class*='messageInput_'] [contenteditable]:not([contenteditable='false'])",
  "[class*='messageInput_'] textarea",
  "[class*='mentionMirror_']",
  "[class*='otherInput_'] textarea",
  "[class*='otherInput_'] [contenteditable]",
  "[class*='rejectMessageInput_'] [contenteditable]",
  // Question, permission, and answer copy outside the message roots.
  "[class*='questionBlock_']",
  "[class*='questionHeader_']",
  "[class*='questionTextLarge_']",
  "[class*='navTab_']",
  "[class*='answerText_']",
  "[class*='optionText_']",
  "[class*='optionContent_']",
  "[class*='optionLabel_']",
  "[class*='optionDescription_']",
  "[class*='previewCaption_']",
  "[class*='permissionRequestContent_']",
  "[class*='permissionRequestHeader_']",
  "[class*='permissionRequestDescription_']",
  "[class*='permissionRequestInput_']",
  "[class*='errorMessage_']",
];

function forcedCss(value) {
  const rules = [
    `${FORCED_TARGETS.join(',\n')} {
  direction: ${value} !important;
  text-align: start !important;
  unicode-bidi: isolate !important;
}`,
  ];
  // The "Other" placeholder is pinned to the physical right for the RTL
  // composer; a forced LTR chat moves it back.
  if (value === 'ltr') {
    rules.push(`[class*='otherInput_'] [class*='placeholder_'],
[class*='rejectMessageInput_'] [class*='placeholder_'] {
  left: 8px;
  right: auto;
}`);
  }
  return `/* rastin.direction: ${value} */\n${rules.join('\n\n')}`;
}

/** @returns {'rtl'|'ltr'|null} null for `auto` (or an unknown value). */
function direction(value) {
  return value === 'rtl' || value === 'ltr' ? value : null;
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
    family && family !== FONT_FAMILY ? `'${family}'` : null,
    `'${FONT_FAMILY}'`,
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
    `  --rastin-line-height: ${clamp(settings.lineHeight, 2, 1.2, 2.4)};`,
  ];

  // Claude writes the chat size as an inline style from its own setting, so
  // the override needs !important to win.
  // 0 (the default) means "keep Claude Code's own size", so it must not be
  // clamped up to the 8px floor.
  const requested = Number(settings.fontSize);
  if (Number.isFinite(requested) && requested > 0) {
    const size = Math.min(Math.max(requested, 8), 32);
    vars.push(`  --vscode-chat-font-size: ${size}px !important;`);
  }

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
    read(root, 'webview/payload.css'),
  ];
  const theme = themeCss(settings.theme);
  if (theme) blocks.push(theme);
  const fixed = direction(settings.direction);
  if (fixed) blocks.push(forcedCss(fixed));

  return {
    css: blocks.join('\n\n') + '\n',
    // Every message's paragraphs are oriented at runtime, so the engine and
    // its installer always ship.
    js:
      (fixed ? `globalThis.__rastinForcedDir = '${fixed}';\n\n` : '') +
      read(root, 'webview/direction.js') +
      '\n\n' +
      read(root, 'webview/installer.js'),
    fonts: extra ? [...FONTS, extra] : FONTS,
    fontsSource: path.join(root, 'fonts'),
  };
}

module.exports = { build, FONTS };
