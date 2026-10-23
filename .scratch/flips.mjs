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
const flips = [];
for (const t of blocks) {
  const v = vs.detectSeatDir(t);
  if (!v || v.dir !== 'ltr') continue;
  const { fa, la } = counts(t);
  if (!(fa >= 2 * la && fa >= 4)) continue;
  const charFa = (t.match(/[؀-ۿ]/g)||[]).length;
  const charLa = (t.match(/[A-Za-z]/g)||[]).length;
  flips.push({ t, fa, la, charFa, charLa, locked: v.locked });
}
flips.sort((a,b) => (a.charLa - a.charFa) - (b.charLa - b.charFa));
fs.writeFileSync('/Users/amir/Projects/vscode-rastin/.scratch/flips.txt',
  flips.map(f => `[fa=${f.fa} la=${f.la} charFa=${f.charFa} charLa=${f.charLa} lock=${f.locked}]\n${f.t.slice(0,260).replace(/\n/g,' | ')}\n`).join('\n'));
console.log('flips', flips.length);
