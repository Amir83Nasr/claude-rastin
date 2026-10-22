/**
 * Leading-run seat direction engine, shared by the injected webview script
 * and the Node tests (single source of truth, inlined at patch time).
 *
 * A single LTR tech term ("Merge کن") stays RTL; two or more consecutive
 * LTR words from the start lock the seat to LTR (a real English opening).
 * A leading label ("skipped:", "Note:", "Step 1:") does not vote: the run
 * after its colon decides, so "skipped: 2 files سلام" can still read RTL.
 */

// ── RANGES ──────────────────────────────────────────────────────────────

// Hebrew + Arabic blocks (covers Persian); Latin + Cyrillic + Greek as LTR.
const RTL_RANGE =
  /[\u0590-\u05FF\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB1D-\uFDFF\uFE70-\uFEFF]/;
const LTR_RANGE = /[A-Za-z\u00C0-\u024F\u0370-\u03FF\u0400-\u04FF]/;

const MIN_LTR_WORDS = 2;
const SCAN_CHARS = 2000;
const SCAN_WORDS = 12;

// A short Latin label at the start of a block, followed by its colon. It is
// an English island label, not prose: "skipped: 2 files" should not lock the
// whole paragraph to LTR before its Persian continuation loads.
const LEADING_LABEL =
  /^\s*(?:[A-Za-z][A-Za-z0-9._/-]{0,19}|\d{1,3}[.)]?)(?:\s+\d{1,3}[.)]?)?\s*[:：]\s*/;

function stripLeadingLabel(text) {
  const match = LEADING_LABEL.exec(text);
  if (match === null) return text;
  const rest = text.slice(match[0].length);
  return rest.trim() === '' ? text : rest;
}

// ── DETECTION ───────────────────────────────────────────────────────────

/**
 * Leading-run direction of a seat's own text.
 * @param {string} text seat textContent.
 * @returns {{dir: 'rtl'|'ltr', locked: boolean}|null} null when no letters yet.
 */
function detectSeatDir(text) {
  text = stripLeadingLabel(text);
  const words = [];
  let current = null;
  let scanned = 0;
  for (const ch of text) {
    if (scanned >= SCAN_CHARS || words.length >= SCAN_WORDS) break;
    scanned += 1;
    let d = null;
    if (RTL_RANGE.test(ch)) d = 'rtl';
    else if (LTR_RANGE.test(ch)) d = 'ltr';
    if (d === null) {
      if (current !== null) {
        words.push(current);
        current = null;
      }
      continue;
    }
    if (current === null) current = d;
    else if (current !== d) {
      words.push(current);
      current = d;
    }
  }
  if (current !== null) words.push(current);
  if (words.length === 0) return null;
  if (words[0] === 'rtl') return { dir: 'rtl', locked: false };
  let run = 0;
  for (const w of words) {
    if (w !== 'ltr') break;
    run += 1;
  }
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
  if (seat.getAttribute('data-rastin-dir') === 'ltr') return undefined;
  const verdict = detectSeatDir(seatText(seat));
  if (verdict === null) return undefined;
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
