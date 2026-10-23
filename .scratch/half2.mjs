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
