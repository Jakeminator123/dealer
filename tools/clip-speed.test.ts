// tools/clip-speed.ts, the contract of a film's own speed (Jakob 2026-11-23: "den nya standarden för respektive klipp"): only
// the field playbackSpeed on the one film changes in data/clip-jobs.json, 1× takes the field away, and a rest film, an unknown
// film, another speed or a file in another form is refused with nothing written.
import assert from 'node:assert/strict';
import {mkdtemp, mkdir, readFile, readdir, rm, writeFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {JOBS, setClipSpeed, withClipSpeed} from './clip-speed.ts';

const data = {
  schemaVersion: 1,
  jobs: [{id: 'giv-plats-4', kind: 'DEAL', from: 'A2', to: 'A2', target: 'seat-4', duration: 4}, {id: 'vila', kind: 'IDLE', from: 'IDLE', to: 'IDLE'}],
  derived: [{id: 'ta-kort', source: 'giv-plats-4', from: 'A1', to: 'A2', startFrame: 0, endFrame: 40}],
  edits: [{id: 'giv-plats-4-fix', source: 'giv-plats-4'}],
};
const text = `${JSON.stringify(data, null, 2)}\n`;

test('farten sätts på filmen: bara fältet ändras, och 1× tar bort det', () => {
  const set = withClipSpeed(text, 'giv-plats-4', 2);
  assert.ok(set.ok);
  assert.equal(set.text, text.replace('      "duration": 4\n', '      "duration": 4,\n      "playbackSpeed": 2\n'), 'resten av filen är densamma, tecken för tecken');
  const changed = withClipSpeed(set.text, 'giv-plats-4', 1.25);
  assert.ok(changed.ok && JSON.parse(changed.text).jobs[0].playbackSpeed === 1.25);
  const back = withClipSpeed(set.text, 'giv-plats-4', 1);
  assert.ok(back.ok); assert.equal(back.text, text, '1× är som filmat: fältet finns inte');
  // A film cut from another (derived) carries its own.
  const cut = withClipSpeed(text, 'ta-kort', 1.5);
  assert.ok(cut.ok); assert.equal(JSON.parse(cut.text).derived[0].playbackSpeed, 1.5); assert.equal(JSON.parse(cut.text).jobs[0].playbackSpeed, undefined);
});

test('farten sätts inte: vila, okänd film, annan fart, och en fil som inte är skriven som verktygen skriver den', () => {
  const no = (of: string, id: unknown, speed: unknown) => { const r = withClipSpeed(of, id, speed); assert.equal(r.ok, false); return r.ok ? null : [r.status, r.error]; };
  assert.deepEqual(no(text, 'vila', 2), [422, 'Vila och tal går alltid som filmat.']);
  assert.equal(no(text, 'finns-inte', 2)![0], 404);
  assert.equal(no(text, 'giv-plats-4-fix', 2)![0], 422, 'en rättad kopia har källfilmens fart');
  for (const speed of [3, 0.5, 1.1, '2', null]) assert.deepEqual(no(text, 'giv-plats-4', speed), [422, 'Farten är 1×, 1,25×, 1,5× eller 2×.']);
  assert.equal(no(text, '../x', 2)![0], 400);
  // Another indent or line ending would be rewritten whole by a save: refused instead.
  assert.equal(no(JSON.stringify(data), 'giv-plats-4', 2)![0], 409);
  assert.equal(no(text.replaceAll('\n', '\r\n'), 'giv-plats-4', 2)![0], 409);
});

test('filen skrivs bara när något ändras, och ingen tillfällig fil blir kvar', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'clip-speed-'));
  try {
    await mkdir(path.join(root, 'data')); await writeFile(path.join(root, JOBS), text);
    assert.deepEqual(await setClipSpeed('giv-plats-4', 1.5, root), {ok: true, id: 'giv-plats-4', speed: 1.5});
    assert.equal(JSON.parse(await readFile(path.join(root, JOBS), 'utf8')).jobs[0].playbackSpeed, 1.5);
    assert.equal((await setClipSpeed('vila', 2, root)).ok, false);
    assert.deepEqual(await setClipSpeed('giv-plats-4', 1, root), {ok: true, id: 'giv-plats-4', speed: 1});
    assert.equal(await readFile(path.join(root, JOBS), 'utf8'), text);
    assert.deepEqual(await readdir(path.join(root, 'data')), ['clip-jobs.json']);
  } finally { await rm(root, {recursive: true, force: true}); }
});
