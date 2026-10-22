'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const { detectSeatDir, orientSeat, seatText } = require('../src/direction.js');

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

test('two English words lock LTR', () => {
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
    attributes,
  };
}

test('orientSeat writes the verdict on the seat', () => {
  const seat = fakeSeat('سلام دنیا');
  assert.equal(orientSeat(seat), 'write');
  assert.equal(seat.getAttribute('dir'), 'rtl');
  assert.equal(orientSeat(seat), 'skip');
});

test('a locked LTR seat never flips back after Persian streams in', () => {
  const seat = fakeSeat('Here is the fix');
  orientSeat(seat);
  assert.equal(seat.getAttribute('dir'), 'ltr');
  assert.equal(seat.getAttribute('data-rastin-dir'), 'ltr');

  seat.textContent = 'Here is the fix: سلام';
  assert.equal(orientSeat(seat), undefined);
  assert.equal(seat.getAttribute('dir'), 'ltr');
});
