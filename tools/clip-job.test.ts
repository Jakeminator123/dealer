// Offline contract tests for clip jobs. No network, media or ffmpeg.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {validateJob, validateJobFile, estimateCredits, requestBody, committedCredits, assertBudget, watchedSeconds, type ClipJob} from '../src/clip-job.ts';

const sha = 'a'.repeat(64);
const base = (): ClipJob => ({id: 'pamela-test-01', kind: 'DEAL', target: 'P4.C1', from: 'READY', to: 'RELEASE(P4.C1)', model: 'wan3', duration: 4, ratio: 'auto_1080p', audio: false,
  promptText: 'Locked camera. One continuous calm deal from the first image to the last image.', purpose: 'test',
  first: {file: {path: 'a.png', sha256: sha}}, last: {frame: {video: 'v.mp4', videoSha256: sha, index: 80}}});

test('the tracked job file is valid and every job is one action between two images', async () => {
  const file = validateJobFile(JSON.parse(await readFile('data/clip-jobs.json', 'utf8')));
  assert.ok(file.jobs.length > 0);
  for (const job of file.jobs) assert.ok(watchedSeconds(job) <= 6, `${job.id}: one action per clip, not a whole deal-and-return`);
});

test('a slow-motion job is still one short action once sped up, and only declared speeds are allowed', () => {
  assert.equal(watchedSeconds({...base(), duration: 8, playbackSpeed: 2}), 4);
  assert.equal(watchedSeconds({...base(), duration: 8}), 8);
  assert.throws(() => validateJob({...base(), playbackSpeed: 3}), /playbackSpeed/);
});

test('the request body carries exactly the documented wan3 first/last fields', () => {
  const body = requestBody(base(), 'data:first', 'data:last');
  assert.deepEqual(Object.keys(body), ['model', 'duration', 'ratio', 'audio', 'promptText', 'promptImage']);
  assert.deepEqual(body.promptImage, [{uri: 'data:first', position: 'first'}, {uri: 'data:last', position: 'last'}]);
  assert.equal(body.audio, false);
});

test('cost follows resolution and seconds', () => {
  assert.equal(estimateCredits(base()), 80);
  assert.equal(estimateCredits({...base(), ratio: 'auto_480p', duration: 3}), 15);
});

test('invalid jobs are refused before anything is prepared', () => {
  assert.throws(() => validateJob({...base(), audio: true}), /audio/);
  assert.throws(() => validateJob({...base(), duration: 1}), /duration/);
  assert.throws(() => validateJob({...base(), model: 'kling_4'}), /wan3/);
  assert.throws(() => validateJob({...base(), id: 'Bad Id'}), /kebab/);
  assert.throws(() => validateJob({...base(), first: {file: {path: 'a.png', sha256: 'short'}}}), /file reference/);
  assert.throws(() => validateJob({...base(), last: {}}), /exactly one/);
  assert.throws(() => validateJobFile({schemaVersion: 1, budget: {maximumCredits: 100}, jobs: [base(), base()]}), /Duplicate/);
});

test('a possibly sent request counts against the ceiling; a prepared one does not', () => {
  const receipts = [{status: 'PREPARED', estimatedCredits: 80}, {status: 'SUBMITTING', estimatedCredits: 60}, {status: 'SUCCEEDED', estimatedCredits: 60}, {status: 'FAILED', estimatedCredits: 40}];
  assert.equal(committedCredits(receipts), 160);
  assert.doesNotThrow(() => assertBudget(240, 160, 80));
  assert.throws(() => assertBudget(239, 160, 80), /ceiling/);
});
