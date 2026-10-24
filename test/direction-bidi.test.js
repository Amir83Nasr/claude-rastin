'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const { detectSeatDir, orientSeat, seatText } = require('../src/direction.js');

// ── HELPERS ─────────────────────────────────────────────────────────────

const verdict = (text) => detectSeatDir(text)?.dir ?? null;

// Each row: [text, expected dir (null = no verdict)]. A failing row prints
// its text, so a regression names the exact paragraph.
function table(rows) {
  for (const [text, expected] of rows) {
    assert.equal(verdict(text), expected, JSON.stringify(text));
  }
}

// ── FILE NAMES AT THE START OF A PERSIAN BLOCK ──────────────────────────

test('Persian after a leading file name reads RTL (regression examples)', () => {
  table([
    [
      'public-slot-row.tsx — نشان واریز کنار قیمت، ستون جنسیت و چیدمان موبایل',
      'rtl',
    ],
    ['vendor-schedule-tab.tsx — طراحی هماهنگ و دیالوگ جزئیات جلسه', 'rtl'],
    [
      'public-vendor-slot-row.test.tsx — قالب گرید و تست‌های واریز/جنسیت به‌روز شد',
      'rtl',
    ],
    ['**Skeleton** — هماهنگ با چیدمان ردیف‌های جدید.', 'rtl'],
  ]);
});

test('the same examples in backticks and list items read RTL', () => {
  table([
    ['- `public-slot-row.tsx` — نشان واریز کنار قیمت، ستون جنسیت', 'rtl'],
    ['- `vendor-schedule-tab.tsx` — طراحی هماهنگ و دیالوگ جلسه', 'rtl'],
    ['* `public-vendor-slot-row.test.tsx` — قالب گرید به‌روز شد', 'rtl'],
    ['1. `public-slot-row.tsx` — نشان واریز', 'rtl'],
    ['- **Skeleton** — هماهنگ با چیدمان ردیف‌های جدید.', 'rtl'],
    ['### `public-slot-row.tsx` — نشان واریز', 'rtl'],
    ['> `public-slot-row.tsx` — نشان واریز', 'rtl'],
  ]);
});

test('Persian after file paths, URLs, emails, and versions reads RTL', () => {
  table([
    ['src/components/public-slot-row.tsx — نشان واریز', 'rtl'],
    ['./lib/payload.js را بخوان', 'rtl'],
    ['https://example.com/path — توضیح فارسی', 'rtl'],
    ['amir@example.com — توضیح فارسی', 'rtl'],
    ['v1.2.3 — توضیح فارسی', 'rtl'],
    ['package.json را به‌روز کن', 'rtl'],
  ]);
});

test('identifiers stay neutral at the start of a Persian block', () => {
  table([
    ['fooBar() را ببین', 'rtl'],
    ['getApiKeys() را صدا بزن', 'rtl'],
    ['FOO_BAR را ببین', 'rtl'],
    ['snake_case را ببین', 'rtl'],
    ['fooBar و bazQux را ببین', 'rtl'],
  ]);
});

// ── ENGLISH STAYS LTR ───────────────────────────────────────────────────

test('English-only paragraphs and list items stay LTR', () => {
  table([
    ['Here is the fix', 'ltr'],
    ['Hello world', 'ltr'],
    ['Hello', 'ltr'],
    ['- Add retry logic to the fetch call', 'ltr'],
    ['1. Run the tests before commit', 'ltr'],
    ['### Summary of the change', 'ltr'],
    ['> Quoted English sentence here', 'ltr'],
  ]);
});

test('English descriptions after a file name stay LTR', () => {
  table([
    [
      'public-slot-row.tsx — deposit badge next to the price, gender column, and mobile layout',
      'ltr',
    ],
    [
      '- `public-slot-row.tsx` — deposit badge next to the price, gender column, and mobile layout',
      'ltr',
    ],
    [
      '- `vendor-schedule-tab.tsx` — matching design and session-details dialog',
      'ltr',
    ],
    [
      '- `public-vendor-slot-row.test.tsx` — updated grid template and deposit/gender tests',
      'ltr',
    ],
    ['- **Skeleton** — matching the layout of the new rows.', 'ltr'],
    ['- [x] `public-slot-row.tsx` — deposit badge added', 'ltr'],
    ['api.ts returns the parsed payload', 'ltr'],
  ]);
});

test('a bare technical token is LTR, not undecided', () => {
  table([
    ['https://example.com', 'ltr'],
    ['amir@example.com', 'ltr'],
    ['public-slot-row.tsx', 'ltr'],
    ['`pnpm test`', 'ltr'],
    ['const x = 1;', 'ltr'],
  ]);
});

test('an English opening locks LTR even with Persian after it', () => {
  assert.deepEqual(detectSeatDir('Here is the fix برای مشکل'), {
    dir: 'ltr',
    locked: true,
  });
  assert.equal(verdict('Add retry logic به fetch'), 'ltr');
  assert.equal(verdict('run the tests و بعد بگو'), 'ltr');
});

// ── MARKDOWN FORMATTING ─────────────────────────────────────────────────

test('inline code never votes for the paragraph', () => {
  table([
    ['`pnpm test` را اجرا کن', 'rtl'],
    ['`npm run build` را اجرا کن', 'rtl'],
    ['`run the tests` را انجام بده', 'rtl'],
    ['- `git status` را ببین', 'rtl'],
    ['متن `pnpm test` را اجرا کن', 'rtl'],
    ['Update `foo.ts` را انجام بده', 'rtl'],
    ['`foo` bar baz را ببین', 'ltr'],
  ]);
});

test('fenced code is skipped, and an unfinished fence does not leak', () => {
  table([
    ['```bash\npnpm test\n```\nرا اجرا کن', 'rtl'],
    ['```js\nconst x = 1;\n```', 'ltr'],
    ['سلام\n```js\nconst x = 1;\n```', 'rtl'],
    // Mid-stream: the closing fence has not arrived yet.
    ['نتیجه را ببین ```bash\nrun the tests now', 'rtl'],
    ['`run the tests now', 'ltr'],
  ]);
});

test('bold, italic, and strikethrough markers are not words', () => {
  table([
    ['**public-slot-row.tsx** را ببین', 'rtl'],
    ['*public-slot-row.tsx* را ببین', 'rtl'],
    ['_public-slot-row.tsx_ را ببین', 'rtl'],
    ['__public-slot-row.tsx__ را ببین', 'rtl'],
    ['_italic_ — توضیح فارسی', 'rtl'],
    ['*italic* — توضیح فارسی', 'rtl'],
    ['**Here is the fix** برای مشکل', 'ltr'],
    ['**Fix the bug** کن', 'ltr'],
    ['_Here is the fix_ برای مشکل', 'ltr'],
  ]);
});

test('links read by their text, not their URL', () => {
  table([
    ['[public-slot-row.tsx](src/public-slot-row.tsx) را ببین', 'rtl'],
    ['[docs](https://example.com) — توضیح فارسی', 'rtl'],
    ['[نشان واریز](https://example.com/very/long/path) را ببین', 'rtl'],
    ['[Read the docs](https://example.com) را بخوان', 'ltr'],
    ['[Read the docs](https://example.com) — explanation', 'ltr'],
  ]);
});

test('task-list checkboxes and block markers are syntax, not words', () => {
  table([
    ['- [ ] `public-slot-row.tsx` — نشان واریز اضافه شد', 'rtl'],
    ['- [x] `public-slot-row.tsx` — badge واریز اضافه شد', 'rtl'],
    ['- [X] `foo.ts` را به‌روز کن', 'rtl'],
    ['* [ ] `foo.ts` را به‌روز کن', 'rtl'],
    ['- [x] Add retry logic to the fetch call', 'ltr'],
    ['10. `foo.ts` را بخوان', 'rtl'],
  ]);
});

test('a heading label never locks, in markdown or plain form', () => {
  table([
    ['**Note:** این یک تست است', 'rtl'],
    ['**Note** — توضیح فارسی', 'rtl'],
    ['- **Note:** this is a test سلام', 'rtl'],
    ['**Open in New Tab**: `Cmd+Shift+Esc`. هر مکالمه مستقل داره.', 'rtl'],
    ['**Open in New Tab**: `Cmd+Shift+Esc`.', 'ltr'],
    ['**Note:** this is a test', 'ltr'],
  ]);
  assert.equal(detectSeatDir('**Note:** this is a test').locked, false);
  assert.equal(
    detectSeatDir('**Open in New Tab**: `Cmd+Shift+Esc`.').locked,
    false,
  );
});

test('a multi-word label is a heading, not the opening sentence', () => {
  table([
    ['checked or cleaned: بیشتر از صفر', 'rtl'],
    ['only when checked: این تغییر', 'rtl'],
    ['backend app main: بررسی', 'rtl'],
    ['- `language: persian` → اگر پاسخ‌ها را انگلیسی می‌خواهی، نگذار.', 'rtl'],
    [
      '- `admin.py:864–867` — `eitaa_id`, description `"شناسه ایتا"`, default `Amir83Nasr`.',
      'rtl',
    ],
    // Four or more words before the separator read as prose, not a label.
    ['Here is the fix: سلام', 'ltr'],
  ]);
  assert.equal(detectSeatDir('checked or cleaned: بیشتر از صفر').locked, false);
});

test('a Persian-only heading carries the block', () => {
  table([
    [
      '**۱. خطای درگاه** — [messaging_service.py](backend/app/services/m.py)',
      'rtl',
    ],
    ['**تغییر** — [a.ts](a.ts#L1) را ببین', 'rtl'],
  ]);
});

test('a quoted Persian phrase in a code span still votes', () => {
  // The span holds Persian prose, not a command, so dropping it would let
  // the surrounding Latin words carry the block LTR.
  table([
    ['- `ALL_USERS` incl. admin `امیرحسین نصراللهی`/`09306853363`.', 'rtl'],
    ['`admin.py:874` — legacy `messenger_id` (`نام کاربری قدیمی`).', 'rtl'],
  ]);
});

test('a short English opening does not outvote Persian prose', () => {
  table([
    ['Site + repo بررسی می‌کنم، بعد هر ۳ تغییر اعمال می‌کنم.', 'rtl'],
    ['Repo scan پس‌زمینه / موزیک / انیمیشن مکعب.', 'rtl'],
    ['Proxy request را به POST تبدیل می‌کند. دوباره با GET صریح:', 'rtl'],
    // A genuinely English-heavy line still locks LTR.
    ['Here is the fix برای مشکل', 'ltr'],
  ]);
  assert.equal(
    detectSeatDir('Site + repo بررسی می‌کنم، بعد هر ۳ تغییر').locked,
    false,
  );
});

test('a link still streaming never locks the item LTR', () => {
  // Mid-stream the destination is only part of a token; the URL half must
  // not pin the list item left before its Persian text arrives.
  const partial = [
    '- [backend/app/main.py:161](backend/',
    '- [backend/app/main.py:161](backend/app/main.py',
    '- [backend/app/main.py:161](backend/app/main.py#L',
  ];
  for (const text of partial) {
    assert.equal(detectSeatDir(text).locked, false, text);
  }
  // The Persian arrives and the item reads RTL.
  assert.equal(
    verdict(
      '- [backend/app/main.py:161](backend/app/main.py#L161): همین کار برای لاگ',
    ),
    'rtl',
  );
});

test('a Persian term quoted in English prose does not flip the block', () => {
  table([
    [
      'Expected failure — the test asserts the old "منوی اصلی" header, but the new home screen greets with "👋 سلام".',
      'ltr',
    ],
    [
      '**توضیحات ریپو (about):** > 🧩 NINEFOLD — a 3D Sudoku Odyssey · 81 handcrafted levels across nine realms.',
      'ltr',
    ],
    // A Persian opening sentence still wins over English that follows it.
    [
      '"روی حالت auto mode هی ارور میگیره برای انجام کار" — in auto mode it keeps erroring while trying to do work.',
      'rtl',
    ],
  ]);
});

test('a quoted Persian code span in English prose reads LTR', () => {
  table([
    [
      '- The `aria-label="امتیاز مجموعه"` was added so tests can tell the top badge from the review line.',
      'ltr',
    ],
  ]);
});

// ── MIXED CONTENT ───────────────────────────────────────────────────────

test('a Persian opening word decides, whatever follows', () => {
  table([
    ['سلام Hello world this is long', 'rtl'],
    ['سلام ... Hello world', 'rtl'],
    ['از GitHub Actions استفاده می‌کنیم', 'rtl'],
    ['GitHub Actions را تنظیم کن', 'rtl'],
    ['Merge کن', 'rtl'],
    ['Hello سلام', 'rtl'],
    ['OK سلام دنیا', 'rtl'],
  ]);
});

test('English-heavy Persian sentences are not forced to RTL by one word', () => {
  table([
    ['Here is the fix برای مشکل', 'ltr'],
    ['a b سلام', 'ltr'],
    ['This turn failed API key is invalid', 'ltr'],
  ]);
});

// ── LEADING NUMBERS, PUNCTUATION, SYMBOLS ───────────────────────────────

test('digits, punctuation, quotes, and emoji before a word do not vote', () => {
  table([
    ['123 سلام', 'rtl'],
    ['۱۲۳ سلام', 'rtl'],
    ['(سلام)', 'rtl'],
    ['«نقل قول»', 'rtl'],
    ['"quoted" سلام', 'rtl'],
    ['“quoted” سلام', 'rtl'],
    ['... سلام', 'rtl'],
    ['🎉 سلام', 'rtl'],
    ['(Hello world)', 'ltr'],
    ['... Hello world', 'ltr'],
    ['3 files changed', 'ltr'],
  ]);
});

test('blocks with no letters have no verdict', () => {
  table([
    ['', null],
    ['   ', null],
    ['\n\t', null],
    ['!!!', null],
    ['123 456 — ()', null],
    ['🎉', null],
    ['---', null],
    ['```\n```', null],
    ['۱۲۳', null],
  ]);
});

// ── SCRIPTS AND UNICODE ─────────────────────────────────────────────────

test('Persian, Arabic, and Hebrew read RTL; other scripts read LTR', () => {
  table([
    ['سلام دنیا', 'rtl'],
    ['مرحبا بالعالم', 'rtl'],
    ['שלום עולם', 'rtl'],
    ['Привет мир', 'ltr'],
    ['Οδυσσέας', 'ltr'],
    ['Café résumé naïve', 'ltr'],
  ]);
});

test('Persian text with ZWNJ and Arabic-Indic digits stays RTL', () => {
  table([
    ['می‌خواهم این را تست کنم', 'rtl'],
    ['اسنپ‌شات‌های سرور', 'rtl'],
    ['٣ مورد در صف', 'rtl'],
    ['۳ مورد', 'rtl'],
  ]);
});

test('RTL control characters do not change the verdict', () => {
  table([
    ['‏‏سلام دنیا', 'rtl'],
    ['‎Hello world', 'ltr'],
    ['‫سلام‬', 'rtl'],
  ]);
});

// ── MULTILINE ───────────────────────────────────────────────────────────

test('multiline blocks read their leading run', () => {
  table([
    ['سلام\nEnglish paragraph here', 'rtl'],
    ['Hello\nسلام', 'rtl'],
    ['Hello world\nسلام دنیا', 'ltr'],
    ['- `a.ts` — نشان\n- `b.ts` — deposit badge next to', 'rtl'],
    // A labeled block never locks, so a Persian word later in it still wins.
    ['- `a.ts` — deposit badge next to\n- `b.ts` — نشان', 'rtl'],
    ['- `a.ts` — deposit badge next to\n- `b.ts` — badge', 'ltr'],
  ]);
});

test('list items decide one by one, so a mixed list keeps both directions', () => {
  const items = [
    ['`public-slot-row.tsx` — نشان واریز کنار قیمت', 'rtl'],
    ['`vendor-schedule-tab.tsx` — matching design and dialog', 'ltr'],
    ['`public-vendor-slot-row.test.tsx` — قالب گرید و تست', 'rtl'],
    ['**Skeleton** — matching the layout of the new rows.', 'ltr'],
  ];
  for (const [text, expected] of items) {
    assert.equal(verdict(text), expected, text);
  }
});

// ── BOUNDS ──────────────────────────────────────────────────────────────

test('very long blocks are scanned within the cap and stay correct', () => {
  const filler = 'x'.repeat(5000);
  assert.equal(verdict(`سلام ${filler}`), 'rtl');
  assert.equal(verdict(`${filler} سلام`), 'ltr');
  // Code spans collapse to one space each; the cap counts what remains.
  assert.equal(verdict(`${'`a` '.repeat(200)}سلام`), 'rtl');
});

test('unbalanced markup does not hang or throw', () => {
  const nasty = [
    '*'.repeat(5000),
    '_'.repeat(5000),
    '`'.repeat(5001),
    '['.repeat(2000) + '](' + 'x'.repeat(2000),
    '**' + 'a '.repeat(3000),
    '_' + 'a_ '.repeat(3000),
  ];
  for (const text of nasty) {
    const started = Date.now();
    detectSeatDir(text);
    assert.ok(Date.now() - started < 500, text.slice(0, 20));
  }
});

// ── INTEGRATION: orientSeat + seatText ON A DOM-SHAPED SEAT ─────────────

function element(tag, children = [], islands = false) {
  const attributes = new Map();
  const node = {
    nodeType: 1,
    tagName: tag.toUpperCase(),
    childNodes: children,
    getAttribute: (name) =>
      attributes.has(name) ? attributes.get(name) : null,
    setAttribute: (name, value) => attributes.set(name, value),
    removeAttribute: (name) => attributes.delete(name),
    hasAttribute: (name) => attributes.has(name),
    // Mirrors SEAT_ISLAND's tag half; class-based islands use `islands`.
    matches: () => islands || tag === 'code' || tag === 'pre',
  };
  return node;
}

const text = (value) => ({ nodeType: 3, nodeValue: value });

test('an inline <code> island does not vote on a Persian list item', () => {
  // <li><code>use-online-status.ts</code> — هوک روی online/offline</li>
  const li = element('li', [
    element('code', [text('Here is the fix for the')]),
    text(' — هوک روی online/offline'),
  ]);
  assert.equal(seatText(li), ' — هوک روی online/offline');
  assert.equal(orientSeat(li), 'write');
  assert.equal(li.getAttribute('dir'), 'rtl');
});

test('a tool-card island above a Persian paragraph does not flip it', () => {
  const root = element('div', [
    element('div', [text('Running the full test suite now')], true),
    text('همه تست‌ها پاس شدند.'),
  ]);
  assert.equal(orientSeat(root), 'write');
  assert.equal(root.getAttribute('dir'), 'rtl');
});

test('English list items under a Persian list get their own LTR verdict', () => {
  const persian = element('li', [
    element('code', [text('public-slot-row.tsx')]),
    text(' — نشان واریز کنار قیمت'),
  ]);
  const english = element('li', [
    element('code', [text('vendor-schedule-tab.tsx')]),
    text(' — matching design and session-details dialog'),
  ]);
  orientSeat(persian);
  orientSeat(english);
  assert.equal(persian.getAttribute('dir'), 'rtl');
  assert.equal(english.getAttribute('dir'), 'ltr');
  assert.equal(english.getAttribute('data-rastin-dir'), 'ltr');
  assert.equal(persian.getAttribute('data-rastin-dir'), null);
});

test('a seat of only an island has no verdict and keeps inherited dir', () => {
  const li = element('li', [element('code', [text('pnpm test')])]);
  assert.equal(orientSeat(li), undefined);
  assert.equal(li.getAttribute('dir'), null);
});

test('streaming a Persian list item: file name first, Persian later', () => {
  const li = element('li', [text('public-slot-row.tsx')]);
  // Only a technical token so far: provisional LTR, no lock.
  assert.equal(orientSeat(li), 'write');
  assert.equal(li.getAttribute('dir'), 'ltr');
  assert.equal(li.getAttribute('data-rastin-dir'), null);

  // The Persian arrives: the item flips to RTL.
  li.childNodes = [text('public-slot-row.tsx — نشان واریز')];
  assert.equal(orientSeat(li), 'write');
  assert.equal(li.getAttribute('dir'), 'rtl');
});

test('streaming an English list item: file name first, English later', () => {
  const li = element('li', [text('public-slot-row.tsx — deposit')]);
  orientSeat(li);
  assert.equal(li.getAttribute('data-rastin-dir'), null);

  li.childNodes = [
    text('public-slot-row.tsx — deposit badge next to the price'),
  ];
  orientSeat(li);
  assert.equal(li.getAttribute('dir'), 'ltr');
  // Labeled, so no lock: a Persian word that arrives later can still flip it.
  assert.equal(li.getAttribute('data-rastin-dir'), null);
});
