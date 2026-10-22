'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const {
  detectSeatDir,
  mirrorSeatArrows,
  orientSeat,
  seatText,
} = require('../src/direction.js');

test('Persian prose reads RTL', () => {
  assert.deepEqual(detectSeatDir('سلام دنیا'), {
    dir: 'rtl',
    locked: false,
  });
});

test('Hebrew prose reads RTL', () => {
  assert.deepEqual(detectSeatDir('שלום עולם'), {
    dir: 'rtl',
    locked: false,
  });
});

test('three English words lock LTR', () => {
  assert.deepEqual(detectSeatDir('Here is the fix'), {
    dir: 'ltr',
    locked: true,
  });
});

test('a lone English term followed by Persian stays RTL', () => {
  assert.deepEqual(detectSeatDir('Merge کن'), {
    dir: 'rtl',
    locked: false,
  });
});

test('an English opening locks LTR before Persian follows', () => {
  assert.deepEqual(detectSeatDir('Fix the bug کن'), {
    dir: 'ltr',
    locked: true,
  });
});

test('one finished English word stays provisional LTR', () => {
  assert.deepEqual(detectSeatDir('Hello'), {
    dir: 'ltr',
    locked: false,
  });
});

test('a leading English label does not lock the paragraph to LTR', () => {
  assert.deepEqual(detectSeatDir('skipped: 2 files سلام'), {
    dir: 'rtl',
    locked: false,
  });
});

test('a label followed by a lone English word stays provisional LTR', () => {
  assert.deepEqual(detectSeatDir('skipped: 2 files'), {
    dir: 'ltr',
    locked: false,
  });
});

test('label cases from the DSH direction suite', () => {
  assert.equal(detectSeatDir('Note: این یک تست است').dir, 'rtl');
  assert.equal(detectSeatDir('Step 1: سلام').dir, 'rtl');
  assert.equal(detectSeatDir('Here is the fix برای مشکل').dir, 'ltr');
  assert.equal(detectSeatDir('Merge کن').dir, 'rtl');
});

test('file names and camelCase tokens do not outvote Persian prose', () => {
  const lines = [
    'use-online-status.ts — هوک useSyncExternalStore روی online/offline. اسنپ‌شات سرور true است.',
    'offline-cache.ts — اسنپ‌شات‌های localStorage با prefix toopset:offline:؛ هر دسترسی try/catch.',
    'offline-banner.tsx — بنر با توکن‌های status-pending, آیکون Hugeicons.',
    'api.ts — isOfflineError(err) (status 0) و OFFLINE_MESSAGE؛ پیام خطای اتصال آفلاین صریح شد.',
  ];
  for (const line of lines) {
    assert.equal(detectSeatDir(line).dir, 'rtl', line);
  }
});

test('a technical English line still reads LTR', () => {
  assert.deepEqual(detectSeatDir('api.ts returns the parsed payload'), {
    dir: 'ltr',
    locked: true,
  });
});

test('a skipped todo line with commands and Airplane reads RTL', () => {
  const line =
    'skipped: تست انتها-به-انتها با pnpm build && pnpm start و حالت Airplane. add when: قبل از انتشار نسخه PWA.';
  assert.equal(detectSeatDir(line).dir, 'rtl');
});

test('a Persian sentence with product names stays RTL', () => {
  assert.equal(detectSeatDir('از GitHub Actions استفاده می‌کنیم').dir, 'rtl');
  assert.equal(detectSeatDir('GitHub Actions را تنظیم کن').dir, 'rtl');
});

test('Persian opening stays RTL when English prose follows', () => {
  assert.equal(detectSeatDir('سلام Hello world this').dir, 'rtl');
  assert.equal(detectSeatDir('خطا: API key is invalid').dir, 'ltr');
});

test('a skipped line keeps RTL when English commands fill the rest', () => {
  const line =
    'skipped: بررسی offline mode با pnpm build && pnpm start و cache. add when: بعد از انتشار.';
  assert.equal(detectSeatDir(line).dir, 'rtl');
});

test('digits and punctuation alone yield no verdict', () => {
  assert.equal(detectSeatDir('123 456 — ()'), null);
});

test('emoji prefix does not vote', () => {
  assert.deepEqual(detectSeatDir('🎉 سلام'), {
    dir: 'rtl',
    locked: false,
  });
});

test('seatText falls back to textContent without a DOM', () => {
  assert.equal(seatText({ textContent: 'سلام Merge کن' }), 'سلام Merge کن');
});

function fakeSeat(text) {
  const attributes = new Map();
  return {
    textContent: text,
    getAttribute: (name) => (attributes.has(name) ? attributes.get(name) : null),
    setAttribute: (name, value) => attributes.set(name, value),
    removeAttribute: (name) => attributes.delete(name),
    attributes,
  };
}

test('orientSeat writes the verdict on the seat', () => {
  const seat = fakeSeat('سلام دنیا');
  assert.equal(orientSeat(seat), 'write');
  assert.equal(seat.getAttribute('dir'), 'rtl');
  assert.equal(orientSeat(seat), 'skip');
});

test('a locked LTR seat ignores Persian appended after its English opening', () => {
  const seat = fakeSeat('Here is the fix');
  orientSeat(seat);
  assert.equal(seat.getAttribute('dir'), 'ltr');
  assert.equal(seat.getAttribute('data-rastin-dir'), 'ltr');

  seat.textContent = 'Here is the fix: سلام';
  assert.equal(orientSeat(seat), undefined);
  assert.equal(seat.getAttribute('dir'), 'ltr');
});

test('a reused locked seat drops the lock when its text is now Persian', () => {
  const seat = fakeSeat('Here is the fix');
  orientSeat(seat);
  assert.equal(seat.getAttribute('data-rastin-dir'), 'ltr');

  seat.textContent = 'skipped: تست انتها-به-انتها با pnpm build';
  assert.equal(orientSeat(seat), 'write');
  assert.equal(seat.getAttribute('dir'), 'rtl');
  assert.equal(seat.getAttribute('data-rastin-dir'), null);
});

function link(parent, node) {
  node.parentNode = parent;
  node.parentElement = parent;
  node.replaceWith = function (...nodes) {
    for (const next of nodes) link(parent, next);
    const index = parent.childNodes.indexOf(node);
    parent.childNodes.splice(index, 1, ...nodes);
  };
  return node;
}

function linkedSeat(text) {
  const attributes = new Map();
  const seat = {
    nodeType: 1,
    childNodes: [],
    getAttribute: (name) => (attributes.has(name) ? attributes.get(name) : null),
    setAttribute: (name, value) => attributes.set(name, value),
    normalize() {
      const merged = [];
      for (const node of this.childNodes) {
        const last = merged[merged.length - 1];
        if (node.nodeType === 3 && last?.nodeType === 3) {
          last.nodeValue += node.nodeValue;
        } else {
          merged.push(node);
        }
      }
      this.childNodes = merged;
    },
  };
  seat.childNodes.push(link(seat, { nodeType: 3, nodeValue: text }));
  return seat;
}

function fakeDocument() {
  return {
    createElement: () => {
      const attributes = new Map();
      return {
        nodeType: 1,
        tagName: 'SPAN',
        textContent: '',
        getAttribute: (name) =>
          attributes.has(name) ? attributes.get(name) : null,
        setAttribute: (name, value) => attributes.set(name, value),
      };
    },
    createTextNode: (value) => ({ nodeType: 3, nodeValue: value }),
  };
}

test('flow arrows mirror inside RTL and restore inside LTR', () => {
  const seat = linkedSeat('← سلام →');
  const doc = fakeDocument();
  seat.setAttribute('dir', 'rtl');

  assert.equal(mirrorSeatArrows(seat, doc), 1);
  assert.equal(seat.childNodes.length, 3);
  assert.equal(seat.childNodes[0].getAttribute('data-rastin-mirror'), '');
  assert.equal(seat.childNodes[0].textContent, '←');
  assert.equal(seat.childNodes[1].nodeValue, ' سلام ');
  assert.equal(seat.childNodes[2].textContent, '→');

  seat.setAttribute('dir', 'ltr');
  assert.equal(mirrorSeatArrows(seat, doc), 2);
  assert.equal(seat.childNodes.length, 1);
  assert.equal(seat.childNodes[0].nodeValue, '← سلام →');
});
