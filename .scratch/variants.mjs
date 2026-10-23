import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire('/Users/amir/Projects/vscode-rastin/');
const base = require('/Users/amir/Projects/vscode-rastin/src/direction.js');
const RTL_RANGE = /[֐-׿؀-ۿݐ-ݿࢠ-ࣿיִ-﷿ﹰ-﻿]/;
const LTR_RANGE = /[A-Za-zÀ-ɏͰ-ϿЀ-ӿ]/;
const LEADING_LABEL = /^\s*(?:(?:[-*+>]|#{1,6}|\d{1,3}[.)])\s+)?(?:\*\*|__|[*_`])?\s*(?:\p{L}[\p{L}\p{N}._/-]{0,39}|\d{1,3}[.)]?)(?:\s+\d{1,3}[.)]?)?\s*(?:\*\*|__|[*_`])?\s*(?:[:：]|[—–|]|-(?=\s))[\s*_`~]*/u;
const TOKEN = /[\p{L}][\p{L}\p{M}\p{N}._/\\:(){}<>@#$%^&*+=|~`'-]*/gu;
const TECH_MARK = /[._/\\:(){}<>@#$%^&*+=|~`']/;
const CAMEL = /[a-z][A-Z]/;
const CAPS = /^[A-Z]{2,}$/;
const tech = t => TECH_MARK.test(t) || CAMEL.test(t) || CAPS.test(t);
function verdict(text, rule) {
  const m = LEADING_LABEL.exec(text);
  let labeled = false;
  if (m) { const rest = text.slice(m[0].length); if (rest.trim() !== '') { text = rest; labeled = true; } }
  const tokens = [];
  for (const mm of text.matchAll(TOKEN)) {
    if (mm.index >= 2000 || tokens.length >= 48) break;
    const t = mm[0];
    const dir = RTL_RANGE.test(t) ? 'rtl' : LTR_RANGE.test(t) ? 'ltr' : null;
    if (dir === null) continue;
    tokens.push({ dir, technical: dir === 'ltr' && tech(t) });
  }
  if (tokens.length === 0) return null;
  const prose = tokens.filter(t => !t.technical);
  const words = (prose.length ? prose : tokens).map(t => t.dir);
  const rtl = words.filter(w => w === 'rtl').length;
  const ltr = words.length - rtl;
  const dominate = rule(rtl, ltr);
  if (words[0] === 'rtl') return { dir: 'rtl', locked: false };
  let run = 0;
  while (run < words.length && words[run] === 'ltr') run += 1;
  if (run >= 2 && !labeled) return dominate ? { dir: 'rtl', locked: false } : { dir: 'ltr', locked: true };
  if (dominate) return { dir: 'rtl', locked: false };
  if (words.includes('rtl')) return { dir: 'rtl', locked: false };
  return { dir: 'ltr', locked: false };
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
      const c = j?.message?.content;
      if (!Array.isArray(c)) continue;
      for (const x of c) {
        if (x.type !== 'text' || !x.text) continue;
        for (const p of x.text.split(/\n{2,}/)) { const t = p.trim(); if (t) blocks.add(t); }
      }
    }
  }
}
const list = [...blocks];
const cf = t => (t.match(/[؀-ۿ]/g)||[]).length;
const cl = t => (t.match(/[A-Za-z]/g)||[]).length;
const variants = {
  'A rtl>=4&&rtl>=ltr+2': (r,l) => r >= 4 && r >= l + 2,
  'B rtl>=3&&rtl>=2ltr': (r,l) => r >= 3 && r >= 2 * l,
  'C rtl>=3&&rtl>ltr': (r,l) => r >= 3 && r > l,
  'D rtl>=4&&rtl>ltr': (r,l) => r >= 4 && r > l,
};
const report = [];
for (const [name, rule] of Object.entries(variants)) {
  const flips = [];
  for (const t of list) {
    const a = base.detectSeatDir(t)?.dir ?? null;
    const b = verdict(t, rule)?.dir ?? null;
    if (a !== b) flips.push(t);
  }
  const risky = flips.filter(t => cl(t) > cf(t));
  report.push(`### ${name}: flips=${flips.length} of ${list.length}, latinCharMajority=${risky.length}`);
  report.push('sample risky:');
  for (const t of risky.slice(0, 12)) report.push('  - ' + t.slice(0, 150).replace(/\n/g, ' | '));
}
fs.writeFileSync('/Users/amir/Projects/vscode-rastin/.scratch/variants.txt', report.join('\n'));
console.log('written');
