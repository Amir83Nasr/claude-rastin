/**
 * Leading-run seat direction engine, shared by the injected webview script
 * and the Node tests (single source of truth, inlined at patch time).
 *
 * The first prose word decides, the way DSH reads a paragraph. Technical
 * tokens (file names, paths, camelCase, ALL_CAPS constants) stay neutral:
 * Claude writes "use-online-status.ts — هوک ..." and the file name must not
 * start an English run. Two English prose words lock LTR ("Here is the
 * fix"); a Persian word before that run keeps the paragraph RTL even when
 * English commands follow ("skipped: تست ... pnpm build"). A leading label
 * in any script ("skipped:", "Note:", "خطا:", "foo.ts —") is metadata, not
 * prose: the words after its separator decide.
 */

// ── RANGES ──────────────────────────────────────────────────────────────

// Hebrew + Arabic blocks (covers Persian); Latin + Cyrillic + Greek as LTR.
const RTL_RANGE =
  /[\u0590-\u05FF\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB1D-\uFDFF\uFE70-\uFEFF]/;
const LTR_RANGE = /[A-Za-z\u00C0-\u024F\u0370-\u03FF\u0400-\u04FF]/;

const MIN_LTR_WORDS = 2;
const SCAN_CHARS = 2000;
const SCAN_TOKENS = 48;

// A short label at the start of a block, in any script, followed by a colon,
// an em/en dash, a pipe, or a spaced hyphen. It is a heading, not prose:
// "skipped: 2 files", "خطا: API key is invalid", "foo.ts — توضیح".
const LEADING_LABEL =
  /^\s*(?:\p{L}[\p{L}\p{N}._/-]{0,39}|\d{1,3}[.)]?)(?:\s+\d{1,3}[.)]?)?\s*(?:[:：]|[—–|]|-(?=\s))\s*/u;

// One token: a letter-led run that keeps identifier punctuation inside, so
// "use-online-status.ts" is one word, not four. It also keeps URLs,
// "online/offline", "try/catch", and "clearCache()" together.
const TOKEN =
  /[\p{L}][\p{L}\p{M}\p{N}._/\\:(){}<>@#$%^&*+=|~`'-]*/gu;

// Latin tokens that name code rather than prose. They do not vote, but they
// are the fallback verdict when a block contains nothing else.
const TECH_MARK = /[._/\\:(){}<>@#$%^&*+=|~`']/;
const CAMEL_CASE = /[a-z][A-Z]/;
const ALL_CAPS = /^[A-Z]{2,}$/;

function isTechnical(token) {
  return TECH_MARK.test(token) || CAMEL_CASE.test(token) || ALL_CAPS.test(token);
}

function stripLeadingLabel(text) {
  const match = LEADING_LABEL.exec(text);
  if (match === null) return text;
  const rest = text.slice(match[0].length);
  return rest.trim() === '' ? text : rest;
}

// ── DETECTION ───────────────────────────────────────────────────────────

/**
 * Leading-run direction of a seat's own text, in the spirit of DSH: the
 * first *prose* word decides, a two-word English opening locks LTR, and a
 * Persian word anywhere before that run ends keeps the seat RTL. Technical
 * tokens (file names, paths, camelCase, ALL_CAPS constants) are neutral:
 * Claude writes "use-online-status.ts — هوک ..." and the file name must not
 * start an English run. A leading label in any script ("skipped:", "Note:",
 * "خطا:", "foo.ts —") is metadata, not prose, so the words after it decide.
 * @param {string} text seat textContent.
 * @returns {{dir: 'rtl'|'ltr', locked: boolean}|null} null when no letters yet.
 */
function detectSeatDir(text) {
  text = stripLeadingLabel(text);

  const tokens = [];
  for (const match of text.matchAll(TOKEN)) {
    if (match.index >= SCAN_CHARS || tokens.length >= SCAN_TOKENS) break;
    const token = match[0];
    const dir = RTL_RANGE.test(token)
      ? 'rtl'
      : LTR_RANGE.test(token)
        ? 'ltr'
        : null;
    if (dir === null) continue;
    tokens.push({ dir, technical: dir === 'ltr' && isTechnical(token) });
  }
  if (tokens.length === 0) return null;

  // Ignore identifier-shaped tokens when choosing the opening word; fall
  // back to them for a block that contains nothing but code/file names.
  const prose = tokens.filter((token) => !token.technical);
  const words = (prose.length > 0 ? prose : tokens).map((token) => token.dir);

  if (words[0] === 'rtl') return { dir: 'rtl', locked: false };

  let run = 0;
  while (run < words.length && words[run] === 'ltr') run += 1;
  if (run >= MIN_LTR_WORDS) return { dir: 'ltr', locked: true };
  if (words.includes('rtl')) return { dir: 'rtl', locked: false };
  return { dir: 'ltr', locked: false };
}

// Subtrees whose text must not vote on the seat direction: they render as
// LTR islands (own CSS rules) but their English words would otherwise flip
// a Persian seat's leading run. Exact-match selectors only (no *=).
const SEAT_ISLAND =
  'pre,code,[class*="codeBlockWrapper_"],[class*="toolUse_"],' +
  '[class*="toolBody"],[class*="toolSummary_"],[class*="toolResult_"],' +
  '[class*="thinkingContent_"],[class*="userMessageAttachments"]';

/**
 * Seat prose for the direction verdict: textContent minus LTR-island
 * subtrees, capped at SCAN_CHARS. DOM-free fallback: seats without
 * childNodes (tests, SSR) read raw textContent.
 */
function seatText(seat, limit = SCAN_CHARS) {
  const raw = seat.textContent ?? '';
  const roots = seat.childNodes;
  if (!roots || typeof roots.length !== 'number') return raw;
  const stack = [];
  for (let i = roots.length - 1; i >= 0; i--) stack.push(roots[i]);
  let out = '';
  while (stack.length > 0) {
    const node = stack.pop();
    if (node.nodeType === 3) {
      out += node.nodeValue ?? '';
      if (out.length >= limit) break;
    } else if (node.nodeType === 1) {
      if (typeof node.matches === 'function' && node.matches(SEAT_ISLAND))
        continue;
      const kids = node.childNodes;
      if (kids && kids.length) {
        for (let i = kids.length - 1; i >= 0; i--) stack.push(kids[i]);
      }
    }
  }
  return out;
}

/**
 * Orient one seat from its leading word run.
 * @returns {'write'|'skip'|undefined} undefined when locked LTR or no letters.
 */
function orientSeat(seat) {
  const verdict = detectSeatDir(seatText(seat));
  if (verdict === null) return undefined;

  // A locked seat normally stays LTR while English text streams in. If the
  // node was reused and now starts in Persian, the old lock is stale: drop
  // it instead of pinning a Persian paragraph to the left.
  if (seat.getAttribute('data-rastin-dir') === 'ltr') {
    if (verdict.dir === 'ltr') return undefined;
    seat.removeAttribute('data-rastin-dir');
  }

  if (seat.getAttribute('dir') === verdict.dir) return 'skip';
  if (verdict.locked) seat.setAttribute('data-rastin-dir', 'ltr');
  seat.setAttribute('dir', verdict.dir);
  return 'write';
}

// ── ARROW MIRROR ────────────────────────────────────────────────────────

// Flow arrows mirrored in RTL prose (glyph flip, copy intact). CSS cannot
// retarget one char, so each arrow gets an inline-block mirror span holding
// the exact char.
const ARROW_PART = /([←→⇐⇒])/u;

/**
 * Mirror flow arrows of an RTL seat, unwrap on LTR.
 * @returns {number} wrapped/unwrapped node count (0 when already correct).
 */
function mirrorSeatArrows(seat, doc = seat?.ownerDocument) {
  if (!doc || typeof doc.createElement !== 'function') return 0;
  const rtl = seat.getAttribute?.('dir') !== 'ltr';
  const roots = seat.childNodes;
  if (!roots || typeof roots.length !== 'number') return 0;
  const stack = [...roots].reverse();
  let changed = 0;
  while (stack.length > 0) {
    const node = stack.pop();
    if (node.nodeType === 1) {
      if (
        typeof node.getAttribute === 'function' &&
        node.getAttribute('data-rastin-mirror') !== null
      ) {
        if (!rtl) {
          node.replaceWith(doc.createTextNode(node.textContent ?? ''));
          changed += 1;
        }
        continue;
      }
      if (typeof node.matches === 'function' && node.matches(SEAT_ISLAND))
        continue;
      if (node.childNodes?.length)
        for (let i = node.childNodes.length - 1; i >= 0; i--)
          stack.push(node.childNodes[i]);
    } else if (node.nodeType === 3 && rtl) {
      const text = node.nodeValue ?? '';
      if (!ARROW_PART.test(text)) continue;
      const nodes = [];
      for (const part of text.split(ARROW_PART)) {
        if (part === '') continue;
        if (ARROW_PART.test(part)) {
          const span = doc.createElement('span');
          span.setAttribute('data-rastin-mirror', '');
          span.textContent = part;
          nodes.push(span);
        } else {
          nodes.push(doc.createTextNode(part));
        }
      }
      node.replaceWith(...nodes);
      changed += 1;
    }
  }
  // Merge split text runs back after an unwrap so streaming diffs stay cheap.
  if (!rtl) seat.normalize?.();
  return changed;
}

// ── EXPORTS ─────────────────────────────────────────────────────────────

const api = { detectSeatDir, seatText, orientSeat, mirrorSeatArrows, SEAT_ISLAND };

if (typeof globalThis !== 'undefined') globalThis.__rastinDirection = api;
if (typeof module === 'object' && module.exports) module.exports = api;
