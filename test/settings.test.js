'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const pkg = require('../package.json');
const { DEFAULTS } = require('../lib/settings.js');

const properties = pkg.contributes.configuration.properties;

test('defaults cover every rastin setting in package.json', () => {
  const declared = Object.keys(properties).map((id) =>
    id.replace('rastin.', ''),
  );
  assert.deepEqual(Object.keys(DEFAULTS).sort(), declared.sort());
});

test('defaults are the values package.json declares', () => {
  for (const [id, schema] of Object.entries(properties)) {
    assert.equal(DEFAULTS[id.replace('rastin.', '')], schema.default, id);
  }
});

test('the font weight default is Light (300)', () => {
  assert.equal(DEFAULTS.fontWeight, 300);
});
