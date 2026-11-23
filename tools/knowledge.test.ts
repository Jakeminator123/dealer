// Offline tests for the bot's knowledge (tools/knowledge.ts): the cleaning that must stop anything private from reaching a
// half-public site, in the documents, the bank and the proofs, and the last scan of what is built.
import test from 'node:test';
import assert from 'node:assert/strict';
import {buildGraph, type BankData, type BankJob, type MotionRecord} from '../src/clip-graph.ts';
import {LOCAL, bankSections, breaks, cleanDoc, cleanLine, hasLocalPath, knowledgeLeaks, placeWords, prioFrom, proofSections, scanLeaks, unwrap, type Removed} from './knowledge.ts';
import type {Knowledge} from '../cloud/studio/bot-search.ts';
import {findTextLeaks, type Proof} from './studio-freeze.ts';
import {verdictOf} from '../studio/lib/verdict.ts';

const release = {blocked: {folders: ['trailer*'], names: ['Göran', 'Astrid', 'Kevin']}};

// A document with every kind of thing that must go, and the plain facts that must stay.
const DOC = [
  '# Dealer — överlämning',
  '',
  'Ada är dealern. Arbetet ligger i C:/Users/someone/dev/dealer och skisserna i D:/dealer-scratch/tmp/paow/LASMIG.md.',
  '',
  '## Läget i banken (räknat 2026-11-12)',
  '',
  '- **33 huvudfilmer.** Tjugo är godkända rakt av.',
  '- **Krediter:** jobbfilens tak är helt intecknat.',
  '- Senast rapporterade saldo är 18 173.',
  '- Boten kostar cirka 0,2 kr per fråga. Svaren är korta.',
  '- Material med Göran används inte. Ada är kvar.',
  '- Reklamfilmen version 3 ligger i ett prov.',
  '- Lösenordet "ordet" står aldrig i koden.',
  '- Projektet har ID `prj_7zd112w6MIX9YnpcR7Nj64Ke50yk` och lagringen store_qeojzIHuA5ewT4uO.',
  '- Runway-workspace Jakob, ID `67037521`.',
  '- Nyckeln ligger i OPENAI_API_KEY i Vercel. Studion visar filmerna.',
  '- Sajten https://dealer-delta-eosin.vercel.app/ är publik. Scout finns på https://www.scoutgaming.tech/ för den som vill.',
  '- Kartan: [nodkartan](http://127.0.0.1:4319/studio/karta/?kant=READY%3EP4.C1) visar linjerna.',
  '- En lång mening som bryts',
  '  över två rader och som nämner Kevin på andra raden.',
  '',
  '| Del | Läge |',
  '| --- | --- |',
  '| P1 | Godkänd |',
  '| P2 | Kevin tittade på den |',
  '| P3 | 40 credits |',
  '',
  '```sh',
  'node tools/secret.ts C:/Users/someone/x',
  '```',
  '',
  '## Astrid (Jakobs beslut)',
  '',
  'Allt här handlar om en spärrad person och ska bort helt.',
  '',
  '## Före avslut av en session',
  '',
  'Rutiner för agenter som botens läsare inte behöver se alls.',
].join('\n');

test('the cleaning keeps the facts and removes costs, blocked names, trailers, passwords, ids, keys, addresses and paths', () => {
  const {sections, removed} = cleanDoc({kalla: 'HANDOFF', id: 'handoff', text: DOC, dropHeadings: /^Före avslut av en session$/, prio: prioFrom(['Läget i banken'], 0)}, release);
  const all = sections.map(s => `${s.titel}\n${s.text}`).join('\n');
  for (const kept of ['Ada är dealern.', '33 huvudfilmer.', 'Tjugo är godkända rakt av.', 'Svaren är korta.', 'Ada är kvar.', 'Studion visar filmerna.', '| P1 | Godkänd |', 'Scout finns på https://www.scoutgaming.tech/', 'nodkartan (/studio/karta/?kant=READY%3EP4.C1) visar linjerna']) assert.ok(all.includes(kept), `kept: ${kept}`);
  for (const gone of ['someone', 'dealer-scratch', 'Krediter', 'intecknat', 'saldo', '18 173', '0,2 kr', 'kostar', 'Göran', 'Reklamfilm', 'ordet" står', 'Lösenord', 'prj_', 'store_', '67037521', 'OPENAI_API_KEY', 'vercel.app', '127.0.0.1', 'Kevin', 'credits', 'node tools/secret.ts', 'Astrid', 'spärrad person', 'Rutiner för agenter']) assert.ok(!all.includes(gone), `gone: ${gone}`);
  assert.ok(all.includes(`${LOCAL}`), 'a path becomes the local token');
  assert.equal(sections[0].titel, 'HANDOFF › Inledning');
  assert.ok(sections.some(s => s.titel === 'HANDOFF › Läget i banken (räknat 2026-11-12)' && s.prio === 0), 'a heading with a note keeps its core priority');
  for (const rule of ['kostnad', 'spärrat namn', 'reklamfilm', 'lösenord', 'id', 'miljövariabel', 'adress', 'kodblock', 'avsnitt', 'sökväg ersatt'] as const) assert.ok((removed[rule] ?? 0) > 0, `counted: ${rule}`);
});

test('every form of a path of this machine becomes the token, and the words around it stay', () => {
  const cases: [string, string][] = [
    ['Säkerhetskopian ligger i `D:/dealer-archive/V2-backup-studio/` nu.', 'Säkerhetskopian ligger i `‹lokal mapp›` nu.'],
    ['Repot ligger på C:\\Users\\jakem\\dev\\super-feature-sg\\dealer.', 'Repot ligger på ‹lokal mapp›.'],
    ['Arkivet: D:\\dealer-archive\\snyggare-dealer och c:\\\\Users\\\\jakem\\\\x.', 'Arkivet: ‹lokal mapp› och ‹lokal mapp›.'],
    ['Se [arkivet](D:/dealer-archive/V2-backup-studio/README.md) först.', 'Se arkivet först.'],
    ['Se [kvittot](file:///C:/Users/jakem/evidence/x.json) och <file:///D:/dealer-archive/x> också.', 'Se kvittot och ‹lokal mapp› också.'],
    ['I Git Bash: /c/Users/jakem/dev/dealer och /d/dealer-scratch/tmp.', 'I Git Bash: ‹lokal mapp› och ‹lokal mapp›.'],
    ['Node skriver \\\\?\\c:\\Users\\jakem\\dev\\studio\\package.json.', 'Node skriver ‹lokal mapp›.'],
    ['En delning \\\\nas\\media\\film.mp4 och \\\\wsl$\\Ubuntu\\home\\x i dag.', 'En delning ‹lokal mapp› och ‹lokal mapp› i dag.'],
    ['Minnet ligger i ~/.claude/projects/x/memory.', 'Minnet ligger i ‹lokal mapp›.'],
    ['Mappen C:\\Users\\Jakob Eberg\\Desktop\\x syns.', 'Mappen ‹lokal mapp› syns.'],
    ['Slasket i %USERPROFILE%\\AppData\\Local\\Temp och $HOME/.config/x går.', 'Slasket i ‹lokal mapp› och ‹lokal mapp› går.'],
    ['**D:/dealer-scratch/tmp/huvudagent** är slask.', '**‹lokal mapp›** är slask.'],
    ['| Arkiv | `D:\\dealer-archive\\snyggare-dealer` |', '| Arkiv | `‹lokal mapp›` |'],
  ];
  for (const [given, wanted] of cases) {
    const removed: Removed = {};
    assert.equal(cleanLine(given, release, removed), wanted, given);
    // A link's target goes with the link's own rule; every other path is counted.
    if (!given.includes('](')) assert.ok((removed['sökväg ersatt'] ?? 0) > 0, `counted: ${given}`);
  }
  // What only looks like a path stays as it was.
  const plain = 'Se /studio/karta/ och A/B, kl. 21:40, 1/2 och https://www.scoutgaming.tech/x i Spela.';
  assert.equal(cleanLine(plain, release, {}), plain);
  // A heading that names a path keeps its section, with the token in its title.
  const {sections} = cleanDoc({kalla: 'DRIFT', id: 'drift', text: '# D\n\n## Kopian på D:/dealer-archive/V2-backup-studio/\n\nSäkerhetskopian görs före varje flytt av gamla labbets flikar.'}, release);
  assert.equal(sections.at(-1)!.titel, `DRIFT › Kopian på ${LOCAL}`);
  for (const leak of ['/c/Users/x/y', 'C:\\Users\\x', '\\\\?\\c:\\x', '~/.claude/x', '`D:/dealer-archive/V2-backup-studio/`']) assert.ok(hasLocalPath(leak), leak);
});

test('the snapshot\'s check reads the knowledge decoded: "mål:" at the end of a line is no drive, a real path is found', () => {
  const k = (text: string): Knowledge => ({schemaVersion: 1, byggd: '2026-11-12T00:00:00Z', kallor: ['HANDOFF'], karna: [{id: 'handoff/y', titel: 'T', text}], avsnitt: []});
  const textLeaks = (t: string) => findTextLeaks(t, release);
  const fine = k('Forge-standardens mål:\n\n| Plats | Läge |');
  assert.ok(findTextLeaks(JSON.stringify(fine), release).length, 'read as JSON text, the escape looks like a path');
  assert.deepEqual(knowledgeLeaks(fine, release, textLeaks), []);
  assert.ok(knowledgeLeaks(k('Ligger i C:\\Users\\x\\y.'), release, textLeaks).some(f => f.includes('lokal sökväg')));
  assert.ok(findTextLeaks(JSON.stringify(k('Ligger i C:\\Users\\x\\y.')), release).length, 'read as JSON text, a backslash path is found too: the rule takes the doubled backslash of a string in code');
  assert.ok(knowledgeLeaks({...fine, kallor: ['D:/dealer-archive/x']}, release, textLeaks).length, 'the sources are checked too');
});

test('a balance and a cost go with their sentence; a parenthesis that breaks a rule goes and its sentence stays', () => {
  const removed: Removed = {};
  assert.equal(cleanLine('- Servern äger regler, kort, sko och saldo.', release, removed), null);
  assert.equal(cleanLine('- Planen visar kostnaden innan något betalt skickas.', release, removed), null);
  assert.equal(breaks('Det kostar 5 USD', release), 'kostnad');
  assert.equal(breaks('git@github.com:someone/repo.git', release), 'adress');
  assert.equal(cleanLine('Filmen är godkänd (Kevin sade nej) och spelas.', release, removed), 'Filmen är godkänd och spelas.');
});

test('hard-wrapped paragraphs are joined before sentences are judged, and code blocks never pass', () => {
  const removed: Removed = {};
  assert.deepEqual(unwrap('En mening som\nfortsätter här.\n\n- punkt\n  fortsättning\n| a | b |\n```\nkod\n```', removed), ['En mening som fortsätter här.', '', '- punkt fortsättning', '| a | b |']);
  assert.equal(removed.kodblock, 1);
});

// A small bank: one accepted deal with notes that must be cleaned, one rejected, one waiting take.
const sha = 'a'.repeat(64);
const job = (id: string, from: string, to: string): BankJob => ({id, kind: from === 'READY' ? 'DEAL' : 'RETURN', target: (from === 'READY' ? to : from).replace(/^\w+\((.+)\)$/, '$1'), from, to, model: 'wan3', duration: 4,
  ratio: 'auto_1080p', audio: false, promptText: 'Locked camera.', first: {file: {path: 'C:/Users/someone/start.png', sha256: sha}}, last: {file: {path: `assets/anchors/${id}/anchor.png`, sha256: sha}}, purpose: 'prov'});
const done = (review: MotionRecord['review']): MotionRecord => ({source: {fps: 30, frames: 120, sha256: sha}, review, motion: {physicalEndSide: 'FRONT'}});
function smallBank(): BankData {
  const jobs = [job('paow-p6-c1-plan-deal-01', 'READY', 'LAND(P6.C1)'), job('paow-p6-c1-plan-deal-02', 'READY', 'LAND(P6.C1)'), job('paow-p6-c1-plan-deal-03', 'READY', 'LAND(P6.C1)')];
  return {jobs, motions: {
    'paow-p6-c1-plan-deal-01': done({decision: 'ACCEPTED', userAccepted: true, userReview: 'Jakob 2026-11-11: Väldigt bra. Kevin tyckte annat. Den kostade 40 credits.'}),
    'paow-p6-c1-plan-deal-02': done({decision: 'REJECTED', userReview: 'Jakob 2026-11-11: Kortet är för stort.'}),
    'paow-p6-c1-plan-deal-03': done({decision: 'PENDING'}),
  }, receipts: Object.fromEntries(jobs.map(j => [j.id, {status: 'SUCCEEDED', estimatedCredits: 100}])), media: Object.fromEntries(jobs.map(j => [j.id, {video: `assets/motions/${j.id}/source.mp4`}]))};
}

test('the bank as text: what plays, verdicts with Jakob\'s words cleaned, what waits, and seat words for the search', () => {
  const removed: Removed = {}, graph = buildGraph(smallBank()), sections = bankSections(graph, release, removed);
  const summary = sections.find(s => s.id === 'banken/lage')!, p6 = sections.find(s => s.id === 'banken/ready-p6-c1')!;
  // what the text says, however it is worded: the round's count, the take that waits, the seat in words, his words, the verdict
  assert.match(summary.text, /\b33\b/, 'the main films a round needs');
  assert.ok(summary.text.includes('paow-p6-c1-plan-deal-03'), 'the take that waits for Jakob is named');
  assert.ok(p6.text.includes(placeWords('P6.C1')), 'the seat in the words the search expands');
  assert.match(p6.text, /Väldigt bra\./);
  assert.ok(p6.text.includes(verdictOf(graph.takes['paow-p6-c1-plan-deal-02']).label.toLowerCase()), 'the rejected take carries its verdict');
  const all = sections.map(s => s.text).join('\n');
  for (const gone of ['Kevin', 'credits', 'kostade', 'someone', 'estimatedCredits']) assert.ok(!all.includes(gone), gone);
  assert.equal(sections.find(s => s.id === 'banken/filmer')!.prio, 4);
  assert.match(placeWords('D.C2'), /hålkort/, 'the hole card is called so, as the search knows it'); assert.notEqual(placeWords('D.C1'), placeWords('D.C2'));
});

test('proofs: blocked and trailer proofs are left out whole; the list says what is in the copy', () => {
  const proof = (id: string, title: string, description = ''): Proof => ({id, title, description, labels: {'a.mp4': 'Användbar'}, verdicts: null, updatedAt: null, chapters: null, fps: 30, files: [{name: 'a.mp4', path: `assets/proofs/${id}/a.mp4`, kind: 'video', bytes: 1}]});
  const removed: Removed = {};
  const sections = proofSections([proof('ada-film', 'Ada-film 2', 'Version 2 med ljud. Den kostade mycket.'), proof('trailer-noir-3', 'Reklamfilm 3'), proof('helkropp', 'Helkropp', 'Prov med Astrid.')], new Set(['ada-film']), release, removed);
  const list = sections[0].text;
  assert.ok(list.includes('Ada-film 2 (ada-film)') && list.includes('Version 2 med ljud.'), list);
  // whether a proof is in the copy is said, in whatever words: the same proof outside the copy gives another list
  const one = (onSite: Set<string>) => proofSections([proof('ada-film', 'Ada-film 2')], onSite, release, {})[0].text;
  assert.notEqual(one(new Set(['ada-film'])), one(new Set()));
  assert.ok(!/trailer|Reklamfilm|Astrid|Helkropp|kostade/.test(sections.map(s => `${s.titel} ${s.text}`).join(' ')));
  assert.equal(sections.length, 2);
});

test('the last scan finds what the cleaning would have removed, and a token pattern', () => {
  const k = (text: string, id = 'handoff/x'): Knowledge => ({schemaVersion: 1, byggd: '', kallor: [], karna: [{id, titel: 'T', text}], avsnitt: []});
  assert.deepEqual(scanLeaks(k('Ada delar ut kort.'), release), []);
  for (const leak of ['Det kostade 40 credits.', 'Kevin sade nej.', 'Ligger i D:/dealer-scratch/tmp.', 'ID 12345678 i Runway.', 'Sätt BLOB_READ_WRITE_TOKEN.', 'Lösenordet är x.', 'Se https://vercel.com/x.', 'Trailern.'])
    assert.ok(scanLeaks(k(leak), release).length, leak);
  const token = 'sk-' + 'Q'.repeat(40);
  assert.ok(scanLeaks(k(`nyckel ${token}`), release).some(f => f.includes('hemlighet')));
});
