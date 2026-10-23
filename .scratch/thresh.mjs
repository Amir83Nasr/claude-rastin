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
const rules = {
  '2fa>=la+4': (fa,la) => fa >= 2*la && fa >= 4,
  '3fa>=la+6': (fa,la) => fa >= 3*la && fa >= 6,
  '2fa>=la+6': (fa,la) => fa >= 2*la && fa >= 6,
  '3fa>=la+4': (fa,la) => fa >= 3*la && fa >= 4,
};
for (const [name, test] of Object.entries(rules)) {
  const hits = [];
  for (const t of blocks) {
    const v = vs.detectSeatDir(t);
    if (!v || v.dir !== 'ltr') continue;
    const { fa, la } = counts(t);
    if (!test(fa, la)) continue;
    const cf = (t.match(/[؀-ۿ]/g)||[]).length, cl = (t.match(/[A-Za-z]/g)||[]).length;
    hits.push({ t, fa, la, cf, cl, latinCharShare: cl/(cf+cl||1) });
  }
  hits.sort((a,b)=>b.latinCharShare-a.latinCharShare);
  const risky = hits.filter(h => h.latinCharShare > 0.5);
  console.log(`\n### ${name}: flips=${hits.length} latinCharMajority=${risky.length}`);
  for (const h of risky.slice(0,6)) console.log(`  [fa=${h.fa} la=${h.la} latinChars=${(h.latinCharShare*100).toFixed(0)}%] ${h.t.slice(0,150).replace(/\n/g,' | ')}`);
}
