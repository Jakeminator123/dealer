// The project's skills (.claude/skills/<name>/SKILL.md, AGENTS.md names them): each is thin (when it applies, the rules
// most often broken, a pointer to the one document that holds the procedure), so what a test can hold is that the format
// is one every tool reads (the Agent Skills standard: name = folder, lowercase and hyphens, at most 64 characters; a
// description of at most 1024) and that every document, tool and register a skill points to still exists.
import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync, readdirSync, readFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root = path.resolve(fileURLToPath(new URL('../', import.meta.url)));
const folder = path.join(root, '.claude', 'skills');
const skills = readdirSync(folder, {withFileTypes: true}).filter(e => e.isDirectory()).map(e => e.name).sort();

function read(name: string) {
  const text = readFileSync(path.join(folder, name, 'SKILL.md'), 'utf8').replaceAll('\r\n', '\n');
  const m = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/.exec(text);
  assert.ok(m, `${name}: SKILL.md begins with front matter between --- lines`);
  const fields = Object.fromEntries(m[1].split('\n').map(line => { const i = line.indexOf(':'); return [line.slice(0, i).trim(), line.slice(i + 1).trim()]; }));
  return {fields, body: m[2]};
}

test('there are skills, each a folder with SKILL.md', () => {
  assert.ok(skills.length > 0, 'the folder holds skills'); // how many is the project's choice; each one's form is held below
  for (const name of skills) assert.ok(existsSync(path.join(folder, name, 'SKILL.md')), name);
});

test('each skill has the standard\'s front matter: name = folder, and a description', () => {
  for (const name of skills) {
    const {fields} = read(name);
    assert.deepEqual(Object.keys(fields).sort(), ['description', 'name'], name);
    assert.equal(fields.name, name);
    assert.match(name, /^[a-z0-9]+(?:-[a-z0-9]+)*$/);
    assert.ok(name.length <= 64, name);
    assert.ok(fields.description.length > 0 && fields.description.length <= 1024, `${name}: description ${fields.description.length} characters`);
    assert.ok(!/[<>]/.test(fields.description), `${name}: no angle brackets in the description`);
  }
});

test('every link and every repo path a skill names exists', () => {
  const missing: string[] = [];
  for (const name of skills) {
    const {body} = read(name);
    for (const [, target] of body.matchAll(/\]\(([^)#]+)(?:#[^)]*)?\)/g)) if (!existsSync(path.resolve(folder, name, target))) missing.push(`${name}: link ${target}`);
    for (const [, ref] of body.matchAll(/`([^`\s]+)`/g)) {
      const file = ref.replace(/[),.;:]+$/, '');
      if (/[<>*…]/.test(file) || !/^(?:tools|data|docs|src|studio|game|pages|motions|placements|evidence)\/[\w./-]+\.\w+$|^(?:AGENTS|HANDOFF|README)\.md$/.test(file)) continue;
      if (!existsSync(path.join(root, file))) missing.push(`${name}: ${file}`);
    }
    for (const skill of body.matchAll(/skill `([a-z0-9-]+)`/g)) if (!skills.includes(skill[1])) missing.push(`${name}: skill ${skill[1]}`);
  }
  assert.deepEqual(missing, []);
});
