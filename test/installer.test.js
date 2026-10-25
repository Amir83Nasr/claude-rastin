'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');

const { JSDOM } = require('jsdom');

const { build } = require('../lib/payload.js');

const root = path.join(__dirname, '..');
// The script the patch injects, so the tests run what ships.
const SCRIPT = build({ root }).js;

function page(body) {
  const dom = new JSDOM(`<!doctype html><body>${body}</body>`, {
    runScripts: 'outside-only',
  });
  dom.window.eval(SCRIPT);
  return dom.window;
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 30));

test('each paragraph in an assistant message takes its own direction', () => {
  const window = page(
    '<div data-testid="assistant-message"><div class="root_-a1">' +
      '<p>سلام، این یک پاراگراف فارسی است</p>' +
      '<p>Here is the fix for it</p>' +
      '</div></div>',
  );
  const [persian, english] = window.document.querySelectorAll('p');
  assert.equal(persian.getAttribute('dir'), 'rtl');
  assert.equal(english.getAttribute('dir'), 'ltr');
});

test('code blocks stay LTR islands and get no direction of their own', () => {
  const window = page(
    '<div data-testid="assistant-message"><div class="root_-a1">' +
      '<div class="codeBlockWrapper_-b2"><p>سلام، این کد است</p></div>' +
      '</div></div>',
  );
  assert.equal(window.document.querySelector('p').hasAttribute('dir'), false);
});

test('paragraphs added after load are oriented by the observer', async () => {
  const window = page(
    '<div data-testid="assistant-message"><div class="root_-a1"></div></div>',
  );
  const root = window.document.querySelector('.root_-a1');
  const paragraph = window.document.createElement('p');
  paragraph.textContent = 'سلام دنیا، این متن تازه است';
  root.appendChild(paragraph);

  await settle();
  assert.equal(paragraph.getAttribute('dir'), 'rtl');
});
