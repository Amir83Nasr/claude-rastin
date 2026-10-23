import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire('/Users/amir/Projects/vscode-rastin/');
const vs = require('/Users/amir/Projects/vscode-rastin/src/direction.js');

const RTL_RE = /[֐-׿؀-ۿݐ-ݿࢠ-ࣿיִ-﷿ﹰ-﻿]/;
const TOKEN = /[\p{L}][\p{L}\p{M}\p{N}._/\\:(){}<>@#$%^&*+=|~`'-]*/gu;
const TECH = /[._/\\:(){}<>@#$%^&*+=|~`']/;
const CAMEL = /[a-z][A-Z]/;
const CAPS = /^[A-Z]{2,}$/;
const tech = (t) => TECH.test(t) || CAMEL.test(t) || CAPS.test(t);
function counts(text, limit = 2000) {
  let fa = 0,
    la = 0;
  for (const m of text.matchAll(TOKEN)) {
    if (m.index >= limit) break;
    const t = m[0];
    if (RTL_RE.test(t)) fa++;
    else if (/^[A-Za-z]/.test(t) && !tech(t)) la++;
  }
  return { fa, la };
}
const rules = {
  'fa>la': (fa, la) => fa > la,
  'fa>=la+2': (fa, la) => fa >= la + 2,
  'fa>=2la&fa>=4': (fa, la) => fa >= 2 * la && fa >= 4,
  'fa>=la+3': (fa, la) => fa >= la + 3,
  'fa>=0.65tot&fa>=4': (fa, la) => fa >= 0.65 * (fa + la) && fa >= 4,
};
