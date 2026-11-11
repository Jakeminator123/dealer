// Tests for game/rng.ts (ported game-rng/1) and game/random-port.ts: deterministic seeded and
// replay modes, exact HMAC counter stream, rejection sampling bounds, receipts and chain,
// journal verification, secure non-repetition. Ported from scoutgaming
// test/games/rng/game-rng.mjs (commit 0fe56ace3) without its chi-square statistics.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, createHmac } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { canonicalJson, chainOf, createRng, genesisOf, MAX_RANGE, receiptOf, RNG_VERSION, verifyJournal } from '../game/rng.ts';
import type { CreateRngOptions, RngJournalEntry } from '../game/rng.ts';
import { journaledDraw, RandomPortError, rngReceipt, secureRandom } from '../game/random-port.ts';

const gameDir = resolve(dirname(fileURLToPath(import.meta.url)), '../game');
const sha256 = (text: string) => createHash('sha256').update(text).digest('hex');
const seeded = (seed: string, extra: Partial<CreateRngOptions> = {}) => createRng({ mode: 'seeded', seed, allowDeterministic: true, ...extra });
const replay = (samples: number[], extra: Partial<CreateRngOptions> = {}) => createRng({ mode: 'replay', samples, allowDeterministic: true, ...extra });

test('seeded and replay require the explicit deterministic flag; secure refuses seeds and unknown options', () => {
  assert.throws(() => createRng({ mode: 'seeded', seed: 'x' }), /allowDeterministic/);
  assert.throws(() => createRng({ mode: 'replay', samples: [1] }), /allowDeterministic/);
  assert.throws(() => createRng({ mode: 'secure', seed: 'x' }), /Secure mode/);
  assert.throws(() => createRng({ mode: 'secure', allowDeterministic: true }), /Secure mode/);
  assert.throws(() => createRng({ mode: 'secure', forcedResult: 7 } as unknown as CreateRngOptions), /Unknown RNG option/);
  assert.throws(() => createRng({ mode: 'insecure' } as unknown as CreateRngOptions), /mode/);
  assert.throws(() => seeded(''), /non-empty/);
  assert.throws(() => replay([2 ** 32]), /32-bit/);
  assert.equal(createRng({ mode: 'secure' }).mode, 'secure');
});

test('arguments outside the documented ranges are refused', () => {
  const rng = seeded('ranges');
  assert.throws(() => rng.int(5, 5), RangeError);
  assert.throws(() => rng.int(0, MAX_RANGE + 1), RangeError);
  assert.throws(() => rng.int(0.5, 3), TypeError);
  assert.throws(() => rng.shuffle('abc' as unknown as string[]), TypeError);
  assert.throws(() => rng.drawWithoutReplacement([1, 2], 3), RangeError);
  assert.throws(() => rng.rouletteSpin([0]), RangeError);
  assert.equal(rng.int(-3, -2), -3);
  assert.ok(rng.int(0, MAX_RANGE) < MAX_RANGE);
});

test('the seeded source is HMAC-SHA256 in counter mode exactly as documented', () => {
  for (const seed of ['lab-seed', 'x'.repeat(100)]) {
    const words = seeded(seed).fillUint32(new Uint32Array(24));
    for (let block = 0; block < 3; block++) {
      const message = Buffer.alloc(RNG_VERSION.length + '/seeded'.length + 8);
      message.write(`${RNG_VERSION}/seeded`);
      message.writeBigUInt64BE(BigInt(block), message.length - 8);
      const expected = createHmac('sha256', seed).update(message).digest();
      for (let i = 0; i < 8; i++) assert.equal(words[block * 8 + i], expected.readUInt32BE(4 * i));
    }
  }
});

test('the same seed gives the same sequence, journal and proof; another seed does not', () => {
  const run = (seed: string) => {
    const journal: RngJournalEntry[] = [];
    const rng = seeded(seed, { journal: entry => journal.push(entry) });
    const deck = Array.from({ length: 52 }, (_, card) => card);
    const values = [rng.int(0, 37), rng.float(), rng.shuffle(deck), rng.drawWithoutReplacement(deck, 5), rng.rouletteSpin(deck)];
    return { values, journal, proof: rng.proof() };
  };
  const first = run('replay-me'), second = run('replay-me'), other = run('replay-me-2');
  assert.deepEqual(second, first);
  assert.notDeepEqual(other.values, first.values);
  assert.notEqual(other.proof.receipt, first.proof.receipt);
  assert.equal(first.proof.seedHash, sha256('replay-me'));
  assert.deepEqual(first.journal.map(e => e.op), ['int', 'float', 'shuffle', 'draw', 'rouletteSpin']);
});

test('secure mode never repeats a sequence and names no seed', () => {
  const a = createRng({ mode: 'secure' }), b = createRng({ mode: 'secure' });
  assert.notDeepEqual(a.fillUint32(new Uint32Array(16)), b.fillUint32(new Uint32Array(16)));
  const deck = Array.from({ length: 52 }, (_, card) => card);
  assert.notDeepEqual(a.shuffle(deck), b.shuffle(deck));
  assert.equal(a.proof().mode, 'secure');
  assert.equal('seedHash' in a.proof(), false);
});

test('rejection sampling discards exactly the words at or above range * floor((2^32 - 1) / range)', () => {
  for (const range of [2, 37, 416, 3 * 2 ** 30]) {
    const limit = range * Math.floor(0xFFFFFFFF / range);
    const journal: RngJournalEntry[] = [];
    const rng = replay([0xFFFFFFFF, limit, limit - 1], { journal: entry => journal.push(entry) });
    assert.equal(rng.int(0, range), (limit - 1) % range);
    assert.equal(journal[0].words, 3);
    assert.equal(journal[0].rejections, 2);
  }
  assert.throws(() => replay([0xFFFFFFFF]).int(0, 2), /exhausted/);
  // Every shuffle step of a 416-card shoe accepts word j < i + 1 as j: the stacked lab shoe relies on it.
  const order = replay(Array.from({ length: 415 }, () => 0)).shuffle(Array.from({ length: 416 }, (_, i) => i));
  assert.equal(order.length, 416);
});

test('receipts and the chain are sha256 over the canonical outcome sequence', () => {
  const journal: RngJournalEntry[] = [];
  const rng = seeded('receipts', { journal: entry => journal.push(entry) });
  rng.shuffle([{ s: '♠', r: 'A' }, { s: '♥', r: '10' }, { s: '♦', r: 'K' }]);
  rng.int(1, 7);
  let chain = genesisOf('seeded', sha256('receipts'));
  for (const entry of journal) {
    assert.equal(entry.receipt, sha256(`${RNG_VERSION}\n${entry.op}\n${canonicalJson(entry.outcome)}`));
    chain = sha256(`${chain}\n${entry.receipt}`);
    assert.equal(entry.chain, chain);
    assert.equal(entry.mode, 'seeded');
  }
  assert.equal(rng.proof().receipt, chain);
  assert.equal(canonicalJson({ s: '♠', r: 'A' }), '{"r":"A","s":"♠"}');
  assert.equal(receiptOf('int', 4), sha256(`${RNG_VERSION}\nint\n4`));
  assert.equal(chainOf('a', 'b'), sha256('a\nb'));
  assert.throws(() => canonicalJson({ at: new Date(0) }), /JSON data/);
  assert.throws(() => canonicalJson([Number.NaN]), /finite/);
});

test('verifyJournal accepts an intact journal and finds edits, gaps and reordering', () => {
  const journal: RngJournalEntry[] = [];
  const rng = createRng({ mode: 'secure', journal: entry => journal.push(entry) });
  for (let i = 0; i < 4; i++) rng.rouletteSpin(Array.from({ length: 37 }, (_, pocket) => pocket));
  assert.equal(verifyJournal(journal).verified, true);
  const other = ((journal[2].outcome as { index: number }).index + 1) % 37;
  const edited = journal.map((entry, index) => index === 2 ? { ...entry, outcome: { index: other, pocket: other } } : entry);
  assert.match(verifyJournal(edited).problems.join(), /entry 3: receipt/);
  assert.match(verifyJournal([journal[0], journal[2], journal[3]]).problems.join(), /sequence 3, expected 2/);
  assert.equal(verifyJournal([]).verified, false);
});

test('a throwing journal fails the operation closed and leaves a sequence gap', () => {
  let calls = 0;
  const rng = seeded('closed', { journal: () => { calls += 1; if (calls === 1) throw Error('log unavailable'); } });
  assert.throws(() => rng.int(0, 37), /log unavailable/);
  rng.int(0, 37);
  assert.equal(rng.proof().operations, 2);
});

test('recorded secure samples replay to the same shuffle', () => {
  const journal: RngJournalEntry[] = [];
  const rng = createRng({ mode: 'secure', recordSamples: true, journal: entry => journal.push(entry) });
  const shoe = Array.from({ length: 416 }, (_, serial) => serial + 1);
  const order = rng.shuffle(shoe);
  const [entry] = journal;
  assert.equal(entry.samples?.length, entry.words);
  const replayed: RngJournalEntry[] = [];
  assert.deepEqual(replay([...(entry.samples as number[])], { journal: item => replayed.push(item) }).shuffle(shoe), order);
  assert.equal(replayed[0].receipt, entry.receipt);
});

test('random port: journaledDraw proves one draw; secureRandom refuses options; receipts drop outcome and words', () => {
  assert.throws(() => secureRandom({ seed: 'x' } as unknown as undefined), /takes no seed/);
  const port = secureRandom();
  assert.match(port.nonce(), /^[a-f0-9]{64}$/);
  assert.match(port.uuid(), /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  const { result, entry } = journaledDraw(port, rng => rng.shuffle([1, 2, 3]));
  assert.deepEqual([...result].sort(), [1, 2, 3]);
  assert.equal(entry.sequence, 1);
  const receipt = rngReceipt(entry);
  assert.ok(!('outcome' in receipt) && !('samples' in receipt) && receipt.receipt === entry.receipt);
  const fake = { ...port, rng: () => ({ mode: 'secure', shuffle: (items: number[]) => [...items] }) } as unknown as typeof port;
  assert.throws(() => journaledDraw(fake, rng => rng.shuffle([1, 2])), RandomPortError);
});

test('provenance.json names every engine file, with a Scout blob for each port', () => {
  const provenance = JSON.parse(readFileSync(join(gameDir, 'provenance.json'), 'utf8'));
  const listed = [...provenance.ported, ...provenance.new].map((row: { file: string }) => row.file).sort();
  assert.deepEqual(listed, readdirSync(gameDir).filter(name => name.endsWith('.ts')).map(name => `game/${name}`).sort());
  for (const row of provenance.ported) {
    assert.match(row.blob, /^[0-9a-f]{40}$/, row.file);
    assert.ok(row.scoutPath && row.deviations, row.file);
    assert.ok(readFileSync(join(gameDir, row.file.slice('game/'.length)), 'utf8').includes(row.blob), `${row.file} names its blob in its header`);
  }
});

test('the engine folder uses node built-ins only and never Math.random', () => {
  const files = readdirSync(gameDir).filter(name => name.endsWith('.ts'));
  assert.ok(files.includes('rng.ts') && files.includes('core.ts'));
  for (const name of files) {
    const source = readFileSync(join(gameDir, name), 'utf8');
    assert.ok(!/Math\s*\.\s*random/.test(source), `${name} mentions Math.random`);
    const imports = [...source.matchAll(/\bfrom\s+['"]([^'"]+)['"]|\bimport\s*\(\s*['"]([^'"]+)['"]/g)].map(m => m[1] ?? m[2]);
    for (const specifier of imports) assert.ok(specifier.startsWith('node:') || /^\.\/[a-z-]+\.ts$/.test(specifier), `${name} imports ${specifier}`);
  }
});
