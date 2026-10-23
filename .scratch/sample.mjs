import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire('/Users/amir/Projects/vscode-rastin/');
const vs = require('/Users/amir/Projects/vscode-rastin/src/direction.js');
const RTL_RE = /[؀-ۿ]/;
const TOKEN = /[\p{L}][\p{L}\p{M}\p{N}._/\\:(){}<>@#$%^&*+=|~`'-]*/gu;
const TECH = /[._/\\:(){}<>@#$%^&*+=|~`']/;
const CAMEL = /[a-z][A-Z]/;
const CAPS = /^[A-Z]{2,}$/;
const tech = t => TECH.test(t) || CAMEL.test(t) || CAPS.test(t);
function counts(text) {
  let fa = 0, la = 0;
  for (const m of text.matchAll(TOKEN)) {
    if (m.index >= 2000) break;
    const t = m[0];
    if (RTL_RE.test(t)) fa++;
    else if (/^[A-Za-z]/.test(t) && !tech(t)) la++;
  }
  return { fa, la };
}
const root = '/Users/amir/.claude/projects';
const blocks = new Set();
for (const proj of fs.readdirSync(root)) {
  const dir = path.join(root, proj);
  let files = [];
  try { files = fs.readdirSync(dir).filter(f => f.endsWith('.jsonl')); } catch { continue; }
  for (const f of files) {
    for (const line of fs.readFileSync(path.join(dir, f), 'utf8').split('\n')) {
      if (!line) continue;
      let j; try { j = JSON.parse(line); } catch { continue; }
      const content = j?.message?.content;
      if (!Array.isArray(content)) continue;
      for (const c of content) {
        if (c.type !== 'text' || !c.text) continue;
        for (const p of c.text.split(/\n{2,}/)) { const t = p.trim(); if (t) blocks.add(t); }
      }
    }
  }
}
const rows = [];
for (const t of blocks) {
  const v = vs.detectSeatDir(t);
  if (!v || v.dir !== 'ltr') continue;
  const c = counts(t);
  if (c.fa === 0) continue;
  rows.push({ t, ...c, locked: v.locked, ratio: c.fa / Math.max(1, c.fa + c.la) });
}
rows.sort((a,b)=>b.ratio-a.ratio);
const out = rows.slice(0, 45).map(r => `[fa=${r.fa} la=${r.la} lock=${r.locked} r=${r.ratio.toFixed(2)}] ${r.t.slice(0,180).replace(/\n/g,' | ')}`).join('\n');
fs.writeFileSync('/Users/amir/Projects/vscode-rastin/.scratch/sample.txt', out);
console.log('rows', rows.length, 'written');
