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
const LETTER = /\p{L}/u;

const MIN_LTR_WORDS = 2;
// A short English opening does not lock a paragraph whose prose is Persian:
// "Site + repo بررسی می‌کنم، بعد ..." reads right-to-left. The bar is high
// (four Persian words and a two-word margin) so mixed English-heavy lines
// keep their LTR opening.
const MIN_RTL_WORDS = 4;
const RTL_MARGIN = 2;
// The mirror case: a Persian term quoted inside English prose ("the old
// «منوی اصلی» header") must not drag the paragraph right. The bar is high —
// eight English words at three times the Persian count — so a Persian
// sentence that opens in English ("سلام Hello world") keeps its verdict.
const MIN_LTR_DOMINANT = 8;
const LTR_RATIO = 3;
const SCAN_CHARS = 2000;
const SCAN_TOKENS = 48;

// A short label at the start of a block, in any script, followed by a colon,
// an em/en dash, a pipe, or a spaced hyphen. It is a heading, not prose:
// "skipped: 2 files", "خطا: API key is invalid", "foo.ts — توضیح". A label
// may name a thing in a few words ("checked or cleaned: بیشتر از صفر"),
// because a heading is not a sentence; four or more words read as prose, so
// "Here is the fix: سلام" keeps its English opening. Claude writes labels in
// markdown too ("**Note:** ...", "- Note: ...", "### Note:"), so
// list/heading/emphasis wrappers are part of the label. A leading backtick is
// not one: it opens a code span, and the span is the label (WRAPPED_LABELS).
const PLAIN_LABEL =
  /^(?:\*\*|__|[*_])?\s*(?:\p{L}[\p{L}\p{N}._/()-]{0,39}(?:\s+\p{L}[\p{L}\p{N}._/()-]{0,39}){0,2}|\d{1,3}[.)]?)(?:\s+\d{1,3}[.)]?)?\s*(?:\*\*|__|[*_])?\s*(?:[:：→←]|[—–|]|-(?=\s))[\s*_~]*/u;

// Wrappers before the content proper: a list or heading marker and a task
// checkbox ("- [x] ..."). They are syntax, not words, so they never vote.
const BLOCK_START =
  /^\s*(?:(?:[-*+>]|#{1,6}|\d{1,3}[.)])\s+)?(?:\[[ xX]\]\s+)?/;

// What turns a heading into a label rather than prose. A backtick is not
// consumed: in "**Note**: `cmd` و ..." it opens the code span that follows.
const SEPARATOR = /^\s*(?:[:：→←]|[—–|]|-(?=\s))[\s*_~]*/;

// A wrapped label: `code`, [link](url), or **bold**. Unlike a plain label it
// may hold several words, so a bold heading ("**Open in New Tab**:") leaves
// the verdict to the prose after it instead of locking its own script.
const WRAPPED_LABELS = [
  /^`[^`\n]{1,80}`/,
  /^\[[^\]\n]{1,80}\]\([^)\n]{0,300}\)/,
  /^(?:\*\*|__)[^\n]{1,80}?(?:\*\*|__)/,
];

// A wrapped label may carry its separator inside the wrapper ("**Note:**").
const LABEL_ENDS_IN_SEPARATOR = /[:：—–|]\s*$/;

// Code never votes for prose: a command reads left-to-right, and a Persian
// sentence that opens with one is still Persian. Fences are removed whole,
// and an unterminated fence or span (mid-stream) is dropped to end of line.
const FENCED_CODE = /```[\s\S]*?```/g;
const FENCE_OPEN = /```[\s\S]*$/;
const INLINE_CODE = /`[^`\n]*`/g;
const INLINE_CODE_OPEN = /`[^`\n]*$/;
const LINK_DESTINATION = /\]\([^)\n]*\)/g;

// Emphasis delimiters are markup, not words: keep what they wrap, drop the
// markers. Underscores stay inside identifiers ("FOO_BAR"), so only a pair
// that brackets a whole word is stripped.
const BOLD_PAIR =
  /(?<![\p{L}\p{N}])(?:\*\*|__)(?=\S)([^\n]{1,400}?)(?<=\S)(?:\*\*|__)(?![\p{L}\p{N}])/gu;
const ITALIC_PAIR =
  /(?<![\p{L}\p{N}])_(?=\S)([^\n]{1,400}?)(?<=\S)_(?![\p{L}\p{N}])/gu;
const ASTERISK = /\*/g;

// One token: a letter-led run that keeps identifier punctuation inside, so
// "use-online-status.ts" is one word, not four. It also keeps URLs,
// "online/offline", "try/catch", and "clearCache()" together.
const TOKEN = /[\p{L}][\p{L}\p{M}\p{N}._/\\:(){}<>@#$%^&*+=|~`'-]*/gu;

// Latin tokens that name code rather than prose. They do not vote, but they
// are the fallback verdict when a block contains nothing else.
const TECH_MARK = /[._/\\:(){}<>@#$%^&*+=|~`']/;
const CAMEL_CASE = /[a-z][A-Z]/;
const ALL_CAPS = /^[A-Z]{2,}$/;

function isTechnical(token) {
  return (
    TECH_MARK.test(token) || CAMEL_CASE.test(token) || ALL_CAPS.test(token)
  );
}

function stripLeadingLabel(text) {
  const plain = PLAIN_LABEL.exec(text);
  if (plain !== null) {
    const rest = text.slice(plain[0].length);
    if (rest.trim() !== '') return { text: rest, labeled: plain[0] };
  }
  for (const wrapped of WRAPPED_LABELS) {
    const match = wrapped.exec(text);
    if (match === null) continue;
    let rest = text.slice(match[0].length);
    const separator = SEPARATOR.exec(rest);
    // `[file](url) — توضیح`, `**Note:** توضیح`, and `**Open in New Tab**: ...`
    // all head their block; a wrapper with no separator is content, not a
    // heading (`**Fix the bug** کن` stays an English opening).
    if (separator === null && !LABEL_ENDS_IN_SEPARATOR.test(match[0])) continue;
    if (separator !== null) rest = rest.slice(separator[0].length);
    if (rest.trim() === '') break;
    return { text: rest, labeled: match[0] };
  }
  return { text, labeled: null };
}

// Code is not prose in either script: a command opening a Persian sentence
// ("`pnpm test` را اجرا کن") must not start an English run, and its Latin
// words must not lock the block LTR. A span that holds Persian letters is a
// quoted Persian phrase, not a command, so it keeps its vote
// ("`admin.py:864` — ... `شناسه ایتا برای پشتیبانی`"). Fences go first so the
// ``` markers and their body disappear as one unit; an unterminated fence or
// span (a block still streaming) is dropped to the end of the line.
function codeVote(span) {
  if (!RTL_RANGE.test(span)) return ' ';
  // Keep the words, drop the delimiters: a surviving backtick would let the
  // "unterminated span" rule below swallow the rest of the line.
  return span.replace(/`/g, ' ');
}

function stripCode(text) {
  return text
    .replace(FENCED_CODE, ' ')
    .replace(FENCE_OPEN, ' ')
    .replace(INLINE_CODE, codeVote)
    .replace(INLINE_CODE_OPEN, codeVote);
}

// The rest is markup, not words: emphasis markers, a link's URL, and stray
// `*` (list bullets were consumed above). Stripping the markers keeps the
// text they wrap, so a bold heading still reads in its own script.
function stripMarkup(text) {
  return text
    .replace(BOLD_PAIR, '$1')
    .replace(ITALIC_PAIR, '$1')
    .replace(ASTERISK, '')
    .replace(LINK_DESTINATION, ' ');
}

/**
 * What the verdict reads: block markers, a leading label, and markup gone.
 * A block that is nothing but code falls back to the code itself, so a pure
 * fence or command still gets a verdict of its own.
 */
function readBlock(text) {
  const start = BLOCK_START.exec(text);
  const content = start === null ? text : text.slice(start[0].length);
  const leading = stripLeadingLabel(content);
  const markup = stripMarkup(leading.text);
  const prose = stripCode(markup);
  return {
    text: LETTER.test(prose) ? prose : markup,
    label: leading.labeled,
  };
}
// ── DETECTION ───────────────────────────────────────────────────────────

/**
 * Leading-run direction of a seat's own text, in the spirit of DSH: the
 * first *prose* word decides, a two-word English opening locks LTR, and a
 * Persian word anywhere before that run ends keeps the seat RTL. Technical
 * tokens (file names, paths, camelCase, ALL_CAPS constants) are neutral:
 * Claude writes "use-online-status.ts — هوک ..." and the file name must not
 * start an English run. Code (inline spans and fences) and markup never
 * vote, so a Persian line that opens with `pnpm test`, a filename in
 * backticks, a link, or bold text still reads RTL. A leading label in any
 * script ("skipped:", "Note:", "خطا:", "foo.ts —") is metadata, not prose,
 * so the words after it decide.
 * @param {string} text seat textContent.
 * @returns {{dir: 'rtl'|'ltr', locked: boolean}|null} null when no letters yet.
 */
function detectSeatDir(text) {
  // A label can head either script, so its Latin words never lock the seat:
  // English after it ("Note: this is a test") stays provisional LTR and a
  // Persian word further in ("Note: run the tests ... و تست شد") still reads
  // RTL. A Persian label carries the block only when nothing else is left to
  // read ("**۱. خطای درگاه** — [file](...)"), never over its prose
  // ("خطا: API key is invalid").
  const block = readBlock(text);
  const prose = block.text;
  const labeled = block.label !== null;

  const tokens = [];
  for (const match of prose.matchAll(TOKEN)) {
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
  if (tokens.length === 0)
    return labeled && RTL_RANGE.test(block.label)
      ? { dir: 'rtl', locked: false }
      : null;

  // Ignore identifier-shaped tokens when choosing the opening word; fall
  // back to them for a block that contains nothing but code/file names.
  // A fallback run is all technical, so it can only suggest LTR: it must
  // never lock, or a link half-streamed ("- [a.ts](backend/") would pin the
  // whole item left before its Persian text arrives.
  const words = tokens.filter((token) => !token.technical);
  const fallback = words.length === 0;

  // Nothing but code, file names, and URLs: the shape is LTR, but a Persian
  // label still carries the block ("**۱. خطای درگاه** — [file](...)"), and
  // the verdict never locks so the prose can still flip it once it streams in.
  if (fallback)
    return labeled && RTL_RANGE.test(block.label)
      ? { dir: 'rtl', locked: false }
      : { dir: 'ltr', locked: false };

  const verdict = words.map((token) => token.dir);
  const rtl = verdict.filter((dir) => dir === 'rtl').length;
  const ltr = verdict.length - rtl;

  // A Persian term quoted inside English prose ("the old «منوی اصلی» header,
  // but the new home screen greets with «سلام»") is a seam, not a Persian
  // sentence: the block reads LTR. Unlocked, so a Persian-heavy continuation
  // can still flip it.
  if (ltr >= MIN_LTR_DOMINANT && ltr >= rtl * LTR_RATIO)
    return { dir: 'ltr', locked: false };

  // No English run yet could lock: a sentence quoted in the other script
  // ("روی حالت auto mode هی ارور میگیره..." — in auto mode it errors...) is a
  // Persian sentence that happens to quote English code-speech in the middle.
  // Treat a leading Persian segment followed by English as Persian, the same
  // way the user reads it (fa=8 la=61 above).
  if (verdict[0] === 'rtl') return { dir: 'rtl', locked: false };

  let run = 0;
  while (run < verdict.length && verdict[run] === 'ltr') run += 1;
  const persianDominates =
    rtl >= MIN_RTL_WORDS && rtl >= verdict.length - rtl + RTL_MARGIN;
  if (run >= MIN_LTR_WORDS && !labeled && !persianDominates)
    return { dir: 'ltr', locked: true };
  if (verdict.includes('rtl')) return { dir: 'rtl', locked: false };
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
  // rastin.direction: rtl/ltr pins every seat, so the chat reads one way
  // regardless of script. Arrows are still mirrored and the stale-lock
  // bookkeeping is dropped: nothing can override a forced direction.
  const forced = globalThis.__rastinForcedDir;
  if (forced === 'rtl' || forced === 'ltr') {
    if (seat.hasAttribute?.('data-rastin-dir'))
      seat.removeAttribute('data-rastin-dir');
    if (seat.getAttribute('dir') === forced) return 'skip';
    seat.setAttribute('dir', forced);
    return 'write';
  }

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

const api = {
  detectSeatDir,
  seatText,
  orientSeat,
  mirrorSeatArrows,
  SEAT_ISLAND,
};

if (typeof globalThis !== 'undefined') globalThis.__rastinDirection = api;
if (typeof module === 'object' && module.exports) module.exports = api;
