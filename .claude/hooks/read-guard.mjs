// A guard on the Read tool (PreToolUse hook, .claude/settings.json): a large text file is never read whole.
// Jakob 2026-11-18: big files are to be kept out "för att spara pengar", while an agent can still get all the
// context it needs. AGENTS.md says a document is looked up one section at a time; this makes it hold for every
// session and subagent: a Read of a document or a register over DOC_KB, or of a code file over CODE_KB, without a
// `limit` of at most MAX_LINES is refused, with a line that says how to read the part that is needed. Code gets the
// higher limit because a module is often needed whole; the two code files above it carry data. Pictures, PDFs and
// notebooks are not text and pass.
// Plain JavaScript on purpose (the repo's code is TypeScript): the hook must run in whatever Node the harness finds.
// It fails open: any error here lets the Read through.
import { statSync } from 'node:fs';
import path from 'node:path';

const DOC_KB = 32, CODE_KB = 100, MAX_LINES = 400;
const DOCS = new Set(['.md', '.txt', '.json', '.jsonl', '.csv', '.log', '.yml', '.yaml', '.svg', '.xml']);
const CODE = new Set(['.ts', '.tsx', '.js', '.mjs', '.cjs', '.html', '.css', '.py', '.sh', '.cmd', '.ps1']);

let input = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => { input += chunk; });
process.stdin.on('end', () => {
  try {
    const call = JSON.parse(input);
    if (call.tool_name !== 'Read') process.exit(0);
    const file = call.tool_input?.file_path, limit = call.tool_input?.limit;
    const ext = typeof file === 'string' ? path.extname(file).toLowerCase() : '', cap = DOCS.has(ext) ? DOC_KB : CODE.has(ext) ? CODE_KB : 0;
    if (!cap) process.exit(0);
    const kb = statSync(file).size / 1024;
    if (kb <= cap || (Number.isInteger(limit) && limit > 0 && limit <= MAX_LINES)) process.exit(0);
    const root = process.env.CLAUDE_PROJECT_DIR ?? call.cwd ?? process.cwd();
    const shown = path.relative(root, file).startsWith('..') ? file : path.relative(root, file).split(path.sep).join('/');
    process.stderr.write(`Read guard: ${shown} is ${Math.round(kb)} KB (roughly ${Math.round(kb * 145 / 1000) * 1000 || 1000} words) and is not read whole. `
      + `Find the part you need with Grep (a heading, a key, an id) and Read it with offset and limit, at most ${MAX_LINES} lines a time. `
      + 'If you need all of it, read it in consecutive parts. (.claude/hooks/read-guard.mjs; AGENTS.md, "Läs först".)\n');
    process.exit(2);
  } catch { process.exit(0); }
});
