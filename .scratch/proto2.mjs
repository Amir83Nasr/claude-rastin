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

// new verdict
function next(text) {
  const v = vs.detectSeatDir(text);
  if (!v || v.dir !== 'ltr') return v;
  const { fa, la } = counts(text);
  if (fa > la && fa > 0) return { dir: 'rtl', locked: false };
  return v;
}

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
let flips = [];
for (const t of list) {
  const a = vs.detectSeatDir(t)?.dir ?? null;
  const b = next(t)?.dir ?? null;
  if (a !== b) flips.push(t);
}
console.log('blocks', list.length, 'flips', flips.length);
// Sample 25 evenly across flips for eyeballing
const step = Math.max(1, Math.floor(flips.length / 25));
const seen = new Set();
for (let i = 0; i < flips.length; i += step) {
  const t = flips[i];
  const k = t.slice(0, 40);
  if (seen.has(k)) continue;
  seen.add(k);
  const { fa, la } = counts(t);
  console.log(`\n[fa=${fa} la=${la}] ${t.slice(0, 170).replace(/\n/g, ' ⏎ ')}`);
}
