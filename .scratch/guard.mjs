const RTL_RE = /[֐-׿؀-ۿݐ-ݿࢠ-ࣿיִ-﷿ﹰ-﻿]/;
const LTR_RE = /[A-Za-zÀ-ɏͰ-ϿЀ-ӿ]/;
const LEADING_LABEL = /^\s*(?:(?:[-*+>]|#{1,6}|\d{1,3}[.)])\s+)?(?:\*\*|__|[*_`])?\s*(?:\p{L}[\p{L}\p{N}._/-]{0,39}|\d{1,3}[.)]?)(?:\s+\d{1,3}[.)]?)?\s*(?:\*\*|__|[*_`])?\s*(?:[:：]|[—–|]|-(?=\s))[\s*_`~]*/u;
const TOKEN = /[\p{L}][\p{L}\p{M}\p{N}._/\\:(){}<>@#$%^&*+=|~`'-]*/gu;
const TECH = /[._/\\:(){}<>@#$%^&*+=|~`']/;
const CAMEL = /[a-z][A-Z]/;
const CAPS = /^[A-Z]{2,}$/;
const tech = t => TECH.test(t) || CAMEL.test(t) || CAPS.test(t);
function analyze(text) {
  const m = LEADING_LABEL.exec(text);
  let label = null;
  if (m) { const rest = text.slice(m[0].length); if (rest.trim() !== '') { label = m[0].trim(); text = rest; } }
  let fa = 0, la = 0, techN = 0;
  for (const mm of text.matchAll(TOKEN)) {
    if (mm.index >= 2000 || fa + la + techN >= 48) break;
    const t = mm[0];
    if (RTL_RE.test(t)) fa++;
    else if (LTR_RE.test(t)) { if (tech(t)) techN++; else la++; }
  }
  return { label, labelRtl: label ? RTL_RE.test(label) : false, fa, la, tech: techN };
}
const cases = [
  'Here is the fix برای مشکل',
  'Fix the bug کن',
  'Here is the fix',
  'سلام Hello world this',
  'Site + repo بررسی می‌کنم، بعد هر ۳ تغییر اعمال می‌کنم.',
  'Backend APIs آماده‌ست. حالا الگوی UI موجود را چک می‌کنم.',
  'MPG3 write پشتیبانی نمی‌شود. مسیر m4a (AAC 128k) می‌رم، universal loop است.',
  'skipped: 2 files سلام',
  'Note: this is a test',
  'Note: run the tests لطفا',
  'خطا: API key is invalid',
  'تغییر: [dialog.tsx](packages/ui/src/components/dialog.tsx)',
  'فایل: [app-sidebar.tsx](apps/web/components/app-sidebar.tsx)',
  'api.ts returns the parsed payload',
  'The user sent a new message while you were working: تومان رو از بیعانه حذف کن',
  'Top section, gallery, نظرات نیاز به بازطراحی دارن — بذار ساختار فعلی رو ببینم.',
  'Merge کن',
];
for (const c of cases) console.log(JSON.stringify(c.slice(0,60)).padEnd(64), analyze(c));
