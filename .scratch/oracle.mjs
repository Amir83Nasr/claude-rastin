import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire('/Users/amir/Projects/vscode-rastin/');
const vs = require('/Users/amir/Projects/vscode-rastin/src/direction.js');
const sh = await import('/Users/amir/projects/dsh-rastin/src/direction.js');

const faN = (t) => (t.match(/[؀-ۿ]/g) || []).length;
const laN = (t) => (t.match(/[A-Za-z]/g) || []).length;

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
const stat = { vs: { ok: 0, bad: 0 }, sh: { ok: 0, bad: 0 } };
const badVs = [],
  badSh = [];
for (const t of blocks) {
  const fa = faN(t),
    la = laN(t),
    tot = fa + la;
  if (tot < 10) continue;
  const share = fa / tot;
  if (share > 0.75) {
    const a = vs.detectSeatDir(t)?.dir ?? null;
    const b = sh.detectSeatDir(t)?.dir ?? null;
    if (a === 'rtl') stat.vs.ok++;
    else if (a === 'ltr') {
      stat.vs.bad++;
      badVs.push(t);
    }
    if (b === 'rtl') stat.sh.ok++;
    else if (b === 'ltr') {
      stat.sh.bad++;
      badSh.push(t);
    }
  } else if (share < 0.05) {
    const a = vs.detectSeatDir(t)?.dir ?? null;
    const b = sh.detectSeatDir(t)?.dir ?? null;
    if (a === 'ltr') stat.vs.ok++;
    else if (a === 'rtl') {
      stat.vs.bad++;
      badVs.push(t);
    }
    if (b === 'ltr') stat.sh.ok++;
    else if (b === 'rtl') {
      stat.sh.bad++;
      badSh.push(t);
    }
  }
}
console.log(stat);
console.log(
  '\n--- vscode engine misses (persian-heavy judged ltr, or latin-heavy judged rtl):',
  badVs.length,
);
const uniq = [...new Set(badVs.map((t) => t.slice(0, 200)))];
for (const t of uniq.slice(0, 20)) console.log('  ' + t.replace(/\n/g, ' ⏎ '));
console.log('\n--- dsh engine misses:', badSh.length);
for (const t of [...new Set(badSh.map((t) => t.slice(0, 200)))].slice(0, 20))
  console.log('  ' + t.replace(/\n/g, ' ⏎ '));
