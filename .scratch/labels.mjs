import fs from 'node:fs';
import path from 'node:path';
const RTL_RE = /[֐-׿؀-ۿݐ-ݿࢠ-ࣿיִ-﷿ﹰ-﻿]/;
const LEADING_LABEL = /^\s*(?:(?:[-*+>]|#{1,6}|\d{1,3}[.)])\s+)?(?:\*\*|__|[*_`])?\s*(?:\p{L}[\p{L}\p{N}._/-]{0,39}|\d{1,3}[.)]?)(?:\s+\d{1,3}[.)]?)?\s*(?:\*\*|__|[*_`])?\s*(?:[:：]|[—–|]|-(?=\s))[\s*_`~]*/u;
const TOKEN = /[\p{L}][\p{L}\p{M}\p{N}._/\\:(){}<>@#$%^&*+=|~`'-]*/gu;
const TECH = /[._/\\:(){}<>@#$%^&*+=|~`']/;
const CAMEL = /[a-z][A-Z]/;
const CAPS = /^[A-Z]{2,}$/;
const tech = t => TECH.test(t) || CAMEL.test(t) || CAPS.test(t);
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
const out = [];
for (const t of blocks) {
  const m = LEADING_LABEL.exec(t);
  if (!m) continue;
  const rest = t.slice(m[0].length);
  if (rest.trim() === '') continue;
  if (!RTL_RE.test(m[0])) continue;   // Persian label only
  let fa = 0, la = 0;
  for (const mm of rest.matchAll(TOKEN)) {
    if (mm.index >= 2000 || fa + la >= 48) break;
    const k = mm[0];
    if (RTL_RE.test(k)) fa++;
    else if (/^[A-Za-z]/.test(k) && !tech(k)) la++;
  }
  if (la > fa * 2 && la >= 4) out.push(`[fa=${fa} la=${la}] ${t.slice(0,140).replace(/\n/g,' | ')}`);
}
fs.writeFileSync('/Users/amir/Projects/vscode-rastin/.scratch/labels.txt', out.join('\n'));
console.log('persian-labeled latin-dominant blocks:', out.length);
