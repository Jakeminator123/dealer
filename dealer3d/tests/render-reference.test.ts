import {strict as assert} from 'node:assert';
import {mkdtemp, readFile, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {test} from 'node:test';
import {renderSettings, reserveOutput, verifyVideo} from '../tools/render-reference.ts';

const motion = {fps: 30, frameCount: 90, frames: Array(90).fill({})};

test('reference follows the source duration and uses one-based contact sheets', () => {
  const defaults = renderSettings({}, motion);
  assert.equal(defaults.frameCount, 90);
  assert.equal(defaults.lastTime, 89 / 30);
  assert.equal(defaults.eye, 'film');
  assert.equal(defaults.sheet[0], 1);
  assert.equal(defaults.sheet.at(-1), 90);
  assert.equal(new Set(defaults.sheet).size, 16);
  assert.deepEqual(renderSettings({eye: '7', seconds: '1', sheet: '3,8,30', closeup: '7,9', crop: '560:440:760:560'}, motion),
    {eye: '7', frameCount: 30, lastTime: 29 / 30, sheet: [3, 8, 30], columns: 4, closeup: {frames: [7, 9], crop: '560:440:760:560'}});
});

test('invalid eyes, frame numbers, cropping and durations fail before rendering', () => {
  for (const values of [{eye: '1,7'}, {sheet: '0,90'}, {sheet: '4,4'}, {sheet: '91'}, {seconds: 'inf'},
    {seconds: '0.01'}, {columns: '0'}, {closeup: '1'}, {crop: '2:2:0:0'}, {closeup: '1', crop: '10:10:1760:1170'}]) {
    assert.throws(() => renderSettings(values, motion));
  }
  assert.throws(() => renderSettings({}, {...motion, frames: []}), /Rörelsedata/);
});

test('a second process cannot reuse the output name or overwrite its content', async t => {
  const root = await mkdtemp(path.join(tmpdir(), 'dealer-render-test-'));
  t.after(() => rm(root, {recursive: true, force: true}));
  const out = path.join(root, 'render');
  const outcomes = await Promise.allSettled([reserveOutput(out), reserveOutput(out)]);
  assert.equal(outcomes.filter(outcome => outcome.status === 'fulfilled').length, 1);
  assert.match(await readFile(path.join(out, 'ofullstandig.txt'), 'utf8'), /renderingen påbörjades/i);
  const original = path.join(out, 'referens.mp4');
  await writeFile(original, 'original');
  await assert.rejects(reserveOutput(out), /Utdatamappen finns redan/);
  assert.equal(await readFile(original, 'utf8'), 'original');
});

test('ffprobe must confirm the codec, dimensions, pixel format, frame rate, frame count and duration', () => {
  const video = {codec_name: 'h264', width: 1764, height: 1174, pix_fmt: 'yuv420p', r_frame_rate: '30/1', nb_frames: '90', duration: '3.000000'};
  assert.doesNotThrow(() => verifyVideo(video, 90));
  for (const broken of [undefined, {...video, codec_name: 'av1'}, {...video, width: 980}, {...video, pix_fmt: 'rgb24'},
    {...video, r_frame_rate: '29/1'}, {...video, nb_frames: '89'}, {...video, duration: '4.000000'}]) {
    assert.throws(() => verifyVideo(broken, 90), /ffprobe/);
  }
});
