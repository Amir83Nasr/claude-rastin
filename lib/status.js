'use strict';

/**
 * Status bar text and tooltip for the current settings. Kept free of the vscode
 * module so it can be tested directly.
 * @param {{enabled: boolean, direction: string, fontWeight: number,
 *   lineHeight: number}} settings
 * @returns {{text: string, tooltip: string}}
 */
function statusLabel({ enabled, direction, fontWeight, lineHeight }) {
  if (!enabled) {
    return {
      text: '$(globe) Rastin: Off',
      tooltip: 'Rastin is disabled. Click to enable.',
    };
  }
  const mode =
    direction === 'auto' ? 'automatic direction' : `forced ${direction}`;
  return {
    text: '$(globe) Rastin',
    tooltip: `Rastin: ${mode}, ${fontWeight} weight, line height ${lineHeight}. Click to manage.`,
  };
}

module.exports = { statusLabel };
