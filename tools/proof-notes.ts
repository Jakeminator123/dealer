// What Jakob has said about the proofs in the studio's Granska, part Prov (data/proof-notes.json), for the main agent:
//
//   node tools/proof-notes.ts                    what he has said that the main agent has not read or answered, newest first
//   node tools/proof-notes.ts --alla             every note, newest first, with the main agent's answer
//   node tools/proof-notes.ts --answer 3 "Text"  the main agent's answer to note 3 (shown under his word as "Huvudagenten: …")
//   node tools/proof-notes.ts --read 3           note 3 is read, without an answer
//
// His word is written only by the page, on his click; this tool never writes it (tools/proof-notes-register.ts).
// Read his notes with this tool before a reply to him (.claude/skills/visa-for-jakob/SKILL.md).
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {proofNotesStore} from './proof-notes-store.ts';
import {noteLine, unreadNotes, type Note} from './proof-notes-register.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** The tool's text for a list of notes. */
export function listing(notes: readonly Note[], all: boolean): string {
  if (!notes.length) return all ? 'Jakob har inte skrivit något om proven.' : 'Inget nytt från Jakob i Prov.';
  return notes.map(n => [noteLine(n), ...(all && n.answer ? [`    Huvudagenten: ${n.answer.text.replace(/\n/g, ' / ')}`] : []), ...(all && !n.read ? ['    (inte läst)'] : [])].join('\n')).join('\n');
}

async function main(argv: string[]) {
  const store = proofNotesStore(root);
  const id = (value: string | undefined) => {
    const n = Number(value);
    if (!Number.isSafeInteger(n) || n < 1) throw Error('Ange anteckningens nummer, till exempel 3.');
    return n;
  };
  if (argv[0] === '--answer') {
    const n = id(argv[1]), text = argv.slice(2).join(' ');
    if (!text.trim()) throw Error('Skriv svaret efter numret: --answer 3 "Text".');
    await store.answerNote(n, text);
    console.log(`Svaret står under anteckning ${n}; den är läst.`);
    return;
  }
  if (argv[0] === '--read') { const n = id(argv[1]); await store.markRead(n); console.log(`Anteckning ${n} är läst.`); return; }
  if (argv.length && argv[0] !== '--alla') throw Error('Okänt val. Utan val: det olästa; --alla, --answer <nr> "<text>", --read <nr>.');
  const {register} = await store.read();
  const all = argv[0] === '--alla';
  const notes = all ? [...register.notes].sort((a, b) => b.at.localeCompare(a.at) || b.id - a.id) : unreadNotes(register);
  console.log(listing(notes, all));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).catch(error => { console.error((error as Error).message); process.exitCode = 1; });
}
