console.log("top");
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
const root = '/Users/amir/.claude/projects';
const blocks = new Set();
for (const proj of fs.readdirSync(root)) {
  const dir = path.join(root, proj);
  let files = [];
  try {
    files = fs.readdirSync(dir).filter((f) => f.endsWith('.jsonl'));
  } catch {
    continue;
  }
  for (const f of files) {
    for (const line of fs.readFileSync(path.join(dir, f), 'utf8').split('\n')) {
      if (!line) continue;
      let j;
      try {
        j = JSON.parse(line);
      } catch {
        continue;
      }
      const content = j?.message?.content;
      if (!Array.isArray(content)) continue;
      for (const c of content) {
        if (c.type !== 'text' || !c.text) continue;
        for (const p of c.text.split(/\n{2,}/)) {
          const t = p.trim();
          if (t) blocks.add(t);
        }
      }
    }
  }
}
const list = [...blocks];
const faN = (t) => (t.match(/[؀-ۿ]/g) || []).length;
const laN = (t) => (t.match(/[A-Za-z]/g) || []).length;
for (const [name, test] of Object.entries(rules)) {
  let flips = 0,
    wrongBreak = 0;
  const flipped = [];
  for (const t of list) {
    const v = vs.detectSeatDir(t);
    if (!v || v.dir !== 'ltr') continue;
    const { fa, la } = counts(t);
    if (!test(fa, la)) continue;
    flips++;
    // Regression check: blocks whose *characters* are Latin-heavy really are English.
    const f = faN(t),
      l = laN(t);
    if (f < l) {
      wrongBreak++;
      flipped.push(t);
    }
  }
  console.log(
    `${name.padEnd(20)} flips=${String(flips).padStart(3)} char-latin-heavy-flips=${wrongBreak}`,
  );
  if (wrongBreak)
    for (const t of flipped.slice(0, 4))
      console.log('   ! ' + t.slice(0, 140).replace(/\n/g, ' ⏎ '));
}
