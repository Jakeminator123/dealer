import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, writeFileSync, readFileSync, existsSync, rmSync, utimesSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {parseList, labUrl, lockState, lockLine, takeLock, releaseLock, chromeArgs, STALE_MS, LAB} from './lab-look.ts';

test('every address is on the lab, with robot=1 so the page never takes the place of Jakob\'s tab', () => {
  assert.equal(labUrl('/studio/granska/'), `${LAB}/studio/granska/?robot=1`);
  assert.equal(labUrl('/studio/karta/?dealer=paow&kant=READY%3EP4.C1'), `${LAB}/studio/karta/?dealer=paow&kant=READY%3EP4.C1&robot=1`);
  assert.equal(labUrl('/studio/?robot=0&dealer=paow'), `${LAB}/studio/?robot=1&dealer=paow`, 'robot=0 would make it a person\'s tab');
  for (const away of ['https://example.com/', '//example.com/x', 'studio/', 'http://127.0.0.1:9391/json', 42]) assert.throws(() => labUrl(away), /labbet/);
});

test('a list is checked before Chrome starts: file names, addresses, sizes, clicks', () => {
  const ok = parseList(JSON.stringify([{name: 'karta-1', url: '/studio/karta/', wait: 4500, height: 2600, clicks: [{sel: 'button', text: 'Visa'}], facts: 'document.title'}]));
  assert.equal(ok[0].name, 'karta-1');
  const bad: Array<[unknown, RegExp]> = [
    [[], /minst en sida/],
    [{name: 'x', url: '/'}, /minst en sida/],
    [[{name: '../ut', url: '/studio/'}], /filnamn/],
    [[{name: 'a', url: '/studio/'}, {name: 'a', url: '/studio/'}], /finns redan/],
    [[{name: 'a', url: 'https://example.com/'}], /labbet/],
    [[{name: 'a', url: '/studio/', wait: -1}], /wait/],
    [[{name: 'a', url: '/studio/', width: 99999}], /width/],
    [[{name: 'a', url: '/studio/', clicks: [{text: 'Spara'}]}], /clicks/],
    [[{name: 'a', url: '/studio/', facts: 3}], /facts/],
  ];
  for (const [list, why] of bad) assert.throws(() => parseList(JSON.stringify(list)), why, JSON.stringify(list));
});

test('the lock: free without a file, held for 20 minutes, then stale', () => {
  const now = 1_000_000_000;
  assert.equal(lockState(undefined, now), 'free');
  assert.equal(lockState(now - 60_000, now), 'held');
  assert.equal(lockState(now - STALE_MS, now), 'held');
  assert.equal(lockState(now - STALE_MS - 1, now), 'stale');
  assert.equal(lockLine('huvudagenten', 'ser på Karta', 3, new Date('2026-11-17T22:50:00Z'), 42), 'huvudagenten 2026-11-17 22:50: ser på Karta, 3 min (labbtitt pid 42)');
});

function lockFolder() {
  const base = mkdtempSync(path.join(tmpdir(), 'dealer-las-'));
  return {file: path.join(base, 'gpu-och-headless.lock'), done: () => rmSync(base, {recursive: true, force: true})};
}

test('taking the lock: at once when free, over a stale one, and not over one that is held', async () => {
  const f = lockFolder(), said: string[] = [];
  try {
    assert.equal(await takeLock(f.file, 'mitt', {say: l => said.push(l)}), true);
    assert.equal(readFileSync(f.file, 'utf8').trim(), 'mitt');
    // Held by another: waits in steps of 5 s and gives up at the end, saying whose it is; the file is not touched.
    writeFileSync(f.file, 'talbanan: munnen\n');
    let clock = Date.now(), slept = 0;
    const held = await takeLock(f.file, 'mitt', {now: () => clock, sleep: async ms => { slept += ms; clock += ms; }, maxWaitMs: 20_000, say: l => said.push(l)});
    assert.equal(held, false);
    assert.equal(slept, 20_000);
    assert.deepEqual(said.slice(-2), ['väntar på låset: talbanan: munnen', 'LÅST: talbanan: munnen']);
    assert.equal(readFileSync(f.file, 'utf8').trim(), 'talbanan: munnen');
    // Left by a run that died over 20 minutes ago: taken over.
    const old = new Date(Date.now() - STALE_MS - 60_000);
    utimesSync(f.file, old, old);
    assert.equal(await takeLock(f.file, 'mitt', {say: l => said.push(l)}), true);
    assert.equal(readFileSync(f.file, 'utf8').trim(), 'mitt');
  } finally { f.done(); }
});

test('the lock is released only while it is still this run\'s', () => {
  const f = lockFolder();
  try {
    writeFileSync(f.file, 'mitt\n');
    assert.equal(releaseLock(f.file, 'mitt'), true);
    assert.ok(!existsSync(f.file));
    writeFileSync(f.file, 'en annan tog över\n');
    assert.equal(releaseLock(f.file, 'mitt'), false);
    assert.ok(existsSync(f.file));
    assert.equal(releaseLock(path.join(path.dirname(f.file), 'saknas.lock'), 'mitt'), false);
  } finally { f.done(); }
});

test('Chrome runs headless with its own profile and port', () => {
  const args = chromeArgs(9591, 'D:/dealer-scratch/tmp/labbtitt/profil-1');
  assert.ok(args.includes('--headless=new'));
  assert.ok(args.includes('--remote-debugging-port=9591'));
  assert.ok(args.includes('--user-data-dir=D:/dealer-scratch/tmp/labbtitt/profil-1'));
  assert.ok(!args.some(a => /9391|chrome-meshy/.test(a)), 'never Jakob\'s logged-in Chrome');
});
