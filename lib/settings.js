'use strict';

const pkg = require('../package.json');

const PREFIX = 'rastin.';

// Defaults come from package.json's contributes.configuration, so the value
// shown in the Settings UI and the value Rastin falls back to cannot drift.
const DEFAULTS = Object.fromEntries(
  Object.entries(pkg.contributes.configuration.properties).map(
    ([id, schema]) => [id.slice(PREFIX.length), schema.default],
  ),
);

module.exports = { DEFAULTS };
