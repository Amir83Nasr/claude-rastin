'use strict';

// Shared by the Node side (patch.js and payload.js). The webview never reads
// these, so the values are only ever compared here.

const FONT_FAMILY = 'IRANYekanX';

// Prefix of the user font copies in the webview's fonts folder. patch.js
// prunes stale copies by it, so payload.js must name them with the same value.
const USER_FONT_PREFIX = 'rastin-user-font';

module.exports = { FONT_FAMILY, USER_FONT_PREFIX };
