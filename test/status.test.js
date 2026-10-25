'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const { statusLabel } = require('../lib/status.js');

const ON = { enabled: true, direction: 'auto', fontWeight: 300, lineHeight: 2 };

test('a disabled Rastin shows Off and offers to enable', () => {
  const label = statusLabel({ ...ON, enabled: false });
  assert.equal(label.text, '$(globe) Rastin: Off');
  assert.match(label.tooltip, /Click to enable/);
});

test('automatic direction is named in the tooltip', () => {
  const label = statusLabel(ON);
  assert.equal(label.text, '$(globe) Rastin');
  assert.equal(
    label.tooltip,
    'Rastin: automatic direction, 300 weight, line height 2. Click to manage.',
  );
});

test('a forced direction is named in the tooltip', () => {
  const label = statusLabel({ ...ON, direction: 'rtl' });
  assert.match(label.tooltip, /Rastin: forced rtl, 300 weight/);
});
