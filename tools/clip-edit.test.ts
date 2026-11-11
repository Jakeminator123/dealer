// Offline contract tests for clip edits (aleph2 video to video). No network, media or ffmpeg.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {validateJobFile} from '../src/clip-job.ts';
import {validateEdit, validateEdits, sourceFacts, assertSourceAccepted, assertEditFitsSource, withinPlain1080p, billedSeconds, estimateEditCredits, sourceTransport, dataUriLength,
  uploadRequestBody, validateUploadTicket, editRequestBody, editWindow, assertSubmittable, ledgerIds, assertSharedBudget,
  EDIT_PROMPT_LIMIT, DATA_URI_LIMIT, type EditJob, type SourceFacts} from '../src/clip-edit.ts';

const sha = 'a'.repeat(64);
const base = (): EditJob => ({id: 'pamela-test-edit-01', source: {clip: 'pamela-test-01', sha256: sha}, model: 'aleph2',
  promptText: 'Keep this video identical. Correct one thing only: the card stays one plain solid blue.', purpose: 'test'});
const keyframe = (extra: object = {}) => ({frame: {video: 'v.mp4', videoSha256: sha, index: 69}, seconds: 2.3, ...extra});
const probe = (frames = 120, rate = '30/1', codec = 'h264', duration = String(frames / 30)) =>
  ({streams: [{codec_name: codec, pix_fmt: 'yuv420p', width: 1764, height: 1174, r_frame_rate: rate, avg_frame_rate: rate, nb_read_frames: String(frames)}], format: {duration}});
const facts = (frames = 120, rate = '30/1', codec = 'h264', bytes = 11_364_887): SourceFacts => sourceFacts(probe(frames, rate, codec), bytes);

// The aleph2 member of POST /v1/video_to_video in the documentation snapshot of 2026-11-10.
const DOCUMENTED = {properties: ['promptText', 'keyframes', 'videoUri', 'seed', 'ratio', 'targetAspectRatio', 'contentModeration', 'outputFormat', 'proresProfile', 'model'], required: ['videoUri', 'model'],
  keyframe: ['uri', 'seconds', 'at', 'range'], range: ['start_seconds', 'end_seconds']};

test('the tracked job file stays valid for clip jobs and its edits are valid on their own terms', async () => {
  const file = JSON.parse(await readFile('data/clip-jobs.json', 'utf8'));
  assert.ok(validateJobFile(file).jobs.length > 0);
  const edits = validateEdits(file), jobs = new Set(file.jobs.map((j: {id: string}) => j.id));
  assert.ok(edits.length > 0);
  for (const edit of edits) {
    assert.ok(!jobs.has(edit.id), `${edit.id}: an edit must not reuse a job id`);
    assert.ok(edit.promptText.length <= EDIT_PROMPT_LIMIT);
    assert.equal(edit.seed, undefined, `${edit.id}: no seed unless one is needed`);
  }
  assert.deepEqual(validateEdits({schemaVersion: 1, jobs: []}), []);
});

test('the request body carries exactly the documented aleph2 fields', () => {
  const plain = editRequestBody(base(), 'runway://upload-token');
  assert.deepEqual(plain, {model: 'aleph2', videoUri: 'runway://upload-token', promptText: base().promptText});
  const job = {...base(), seed: 7, keyframes: [keyframe({range: {start_seconds: 2, end_seconds: 4}, note: 'not sent'}), {file: {path: 'k.png', sha256: sha}, at: 0.6, range: {start_seconds: 2, end_seconds: 4}}]};
  const body = editRequestBody(validateEdit(job), 'data:video/mp4;base64,AAAA', ['data:image/png;base64,AAAA', 'runway://image-token']);
  assert.deepEqual(Object.keys(body), ['model', 'videoUri', 'promptText', 'keyframes', 'seed']);
  assert.deepEqual(body.keyframes, [{uri: 'data:image/png;base64,AAAA', seconds: 2.3, range: {start_seconds: 2, end_seconds: 4}}, {uri: 'runway://image-token', at: 0.6, range: {start_seconds: 2, end_seconds: 4}}]);
  assert.equal(body.seed, 7);
  for (const sent of [plain, body]) {
    for (const key of Object.keys(sent)) assert.ok(DOCUMENTED.properties.includes(key), `${key} is not a documented field`);
    for (const key of DOCUMENTED.required) assert.ok(key in sent, `${key} is required`);
    for (const key of ['ratio', 'targetAspectRatio', 'outputFormat', 'proresProfile', 'contentModeration', 'duration', 'audio']) assert.ok(!(key in sent), `${key} must not be sent`);
  }
  for (const k of body.keyframes!) {
    for (const key of Object.keys(k)) assert.ok(DOCUMENTED.keyframe.includes(key));
    assert.equal('seconds' in k, !('at' in k));
    assert.deepEqual(Object.keys(k.range!), DOCUMENTED.range);
  }
  assert.deepEqual(editRequestBody({...base(), keyframes: [keyframe()]}, 'runway://upload-token', ['data:image/png;base64,AAAA']).keyframes, [{uri: 'data:image/png;base64,AAAA', seconds: 2.3}]);
});

test('only an upload or an inline file is ever sent, one URI per keyframe', () => {
  assert.throws(() => editRequestBody(base(), 'https://example.com/video.mp4'), /only a runway/);
  assert.throws(() => editRequestBody(base(), 'assets/motions/x/source.mp4'), /only a runway/);
  assert.throws(() => editRequestBody(base(), 'data:image/png;base64,AAAA'), /only a runway/);
  assert.throws(() => editRequestBody({...base(), keyframes: [keyframe()]}, 'runway://upload-token', ['data:video/mp4;base64,AAAA']), /only a runway/);
  assert.throws(() => editRequestBody({...base(), keyframes: [keyframe()]}, 'runway://upload-token'), /one URI per keyframe/);
  assert.throws(() => editRequestBody(base(), 'data:video/mp4;base64,' + 'A'.repeat(DATA_URI_LIMIT)), /length/);
});

test('cost follows whole seconds of the source clip and never falls under the minimum', () => {
  assert.equal(estimateEditCredits(facts(120)), 112);
  assert.equal(estimateEditCredits(facts(60)), 56);
  assert.equal(estimateEditCredits(facts(150)), 140);
  assert.equal(estimateEditCredits(facts(900)), 840);
  assert.equal(billedSeconds(facts(121)), 5);
  assert.equal(estimateEditCredits(facts(121)), 140);
  assert.equal(estimateEditCredits({seconds: 1, containerSeconds: 1}), 56);
  assert.equal(estimateEditCredits({seconds: 4, containerSeconds: 4.2}), 140);
});

test('source clips outside the documented limits are refused', () => {
  assert.doesNotThrow(() => assertSourceAccepted(facts(120)));
  assert.doesNotThrow(() => assertSourceAccepted(facts(60)));
  assert.doesNotThrow(() => assertSourceAccepted(facts(900)));
  assert.doesNotThrow(() => assertSourceAccepted(facts(96, '24000/1001', 'hevc')));
  assert.throws(() => assertSourceAccepted(facts(59)), /2–30 seconds/);
  assert.throws(() => assertSourceAccepted(facts(901)), /2–30 seconds/);
  assert.throws(() => assertSourceAccepted(sourceFacts(probe(120, '30/1', 'h264', '31.5'), 1000)), /2–30 seconds/);
  assert.throws(() => assertSourceAccepted(facts(240, '60/1')), /30 fps or lower/);
  assert.throws(() => assertSourceAccepted(facts(120, '30/1', 'vp9')), /codec/);
  assert.throws(() => sourceFacts({streams: []}, 1000), /No video stream/);
  assert.throws(() => sourceFacts(probe(0), 1000), /Unreadable/);
  assert.equal(withinPlain1080p({width: 1920, height: 1080}), true);
  assert.equal(withinPlain1080p({width: 1080, height: 1920}), true);
  assert.equal(withinPlain1080p({width: 1764, height: 1174}), false);
});

test('a clip that fits a data URI goes inline, a larger one needs an upload within its limits', () => {
  assert.equal(dataUriLength('video/mp4', 3), 26);
  assert.equal(sourceTransport(3_000_000), 'DATA_URI');
  assert.equal(sourceTransport(3_749_982), 'DATA_URI');
  assert.equal(sourceTransport(3_749_983), 'UPLOAD');
  assert.equal(sourceTransport(11_364_887), 'UPLOAD');
  assert.equal(sourceTransport(200_000_000), 'UPLOAD');
  assert.throws(() => sourceTransport(200_000_001), /ephemeral upload/);
});

test('the upload request and its answer follow the documented shape', () => {
  assert.deepEqual(uploadRequestBody('source.mp4'), {filename: 'source.mp4', type: 'ephemeral'});
  const ticket = {uploadUrl: 'https://storage.example.com/', fields: {key: 'a', policy: 'b'}, runwayUri: 'runway://token-of-some-length'};
  assert.equal(validateUploadTicket(ticket), ticket);
  assert.throws(() => validateUploadTicket({...ticket, uploadUrl: 'http://storage.example.com/'}), /HTTPS/);
  assert.throws(() => validateUploadTicket({...ticket, fields: {key: 1}}), /form fields/);
  assert.throws(() => validateUploadTicket({...ticket, fields: undefined}), /form fields/);
  assert.throws(() => validateUploadTicket({...ticket, runwayUri: 'https://example.com/video.mp4'}), /runway:/);
  assert.throws(() => validateUploadTicket(null), /HTTPS/);
});

test('invalid edits are refused before anything is prepared', () => {
  assert.doesNotThrow(() => validateEdit(base()));
  assert.throws(() => validateEdit({...base(), id: 'Bad Id'}), /kebab/);
  assert.throws(() => validateEdit({...base(), model: 'kling_4'}), /aleph2/);
  assert.throws(() => validateEdit({...base(), source: {clip: '../other', sha256: sha}}), /source/);
  assert.throws(() => validateEdit({...base(), source: {clip: 'pamela-test-01', sha256: 'short'}}), /source/);
  assert.throws(() => validateEdit({...base(), source: {clip: 'pamela-test-edit-01', sha256: sha}}), /own source/);
  assert.throws(() => validateEdit({...base(), promptText: 'x'.repeat(EDIT_PROMPT_LIMIT + 1)}), /prompt/);
  assert.throws(() => validateEdit({...base(), promptText: 'too short'}), /prompt/);
  assert.throws(() => validateEdit({...base(), purpose: ''}), /purpose/);
  assert.throws(() => validateEdit({...base(), seed: -1}), /seed/);
  assert.throws(() => validateEdit({...base(), seed: 4294967296}), /seed/);
  assert.throws(() => validateEdit({...base(), seed: 1.5}), /seed/);
  assert.throws(() => validateEdit({...base(), ratio: '1280:720'}), /unknown field ratio/);
  assert.throws(() => validateEdit({...base(), duration: 4}), /unknown field duration/);
  assert.throws(() => validateEdits({edits: [base(), base()]}), /Duplicate/);
  assert.throws(() => validateEdits({jobs: [{id: 'pamela-test-edit-01'}], edits: [base()]}), /Duplicate/);
  assert.throws(() => validateEdits({derived: [{id: 'pamela-test-edit-01'}], edits: [base()]}), /Duplicate/);
  assert.throws(() => validateEdits({edits: {}}), /array/);
});

test('keyframes and the edit window follow the documented rules', () => {
  const window = {start_seconds: 2, end_seconds: 4};
  assert.doesNotThrow(() => validateEdit({...base(), keyframes: [keyframe({range: window})]}));
  assert.deepEqual(editWindow(validateEdit({...base(), keyframes: [keyframe({range: window})]})), window);
  assert.equal(editWindow(base()), null);
  assert.equal(editWindow({...base(), keyframes: [keyframe()]}), null);
  assert.throws(() => validateEdit({...base(), keyframes: []}), /1–5/);
  assert.throws(() => validateEdit({...base(), keyframes: Array.from({length: 6}, () => keyframe())}), /1–5/);
  assert.throws(() => validateEdit({...base(), keyframes: [{seconds: 2.3}]}), /exactly one of frame or file/);
  assert.throws(() => validateEdit({...base(), keyframes: [{...keyframe(), file: {path: 'k.png', sha256: sha}}]}), /exactly one of frame or file/);
  assert.throws(() => validateEdit({...base(), keyframes: [{file: {path: 'k.png', sha256: 'short'}, seconds: 1}]}), /file reference/);
  assert.throws(() => validateEdit({...base(), keyframes: [keyframe({at: 0.5})]}), /exactly one of seconds or at/);
  assert.throws(() => validateEdit({...base(), keyframes: [{frame: keyframe().frame}]}), /exactly one of seconds or at/);
  assert.throws(() => validateEdit({...base(), keyframes: [keyframe({seconds: 31})]}), /seconds must be/);
  assert.throws(() => validateEdit({...base(), keyframes: [{frame: keyframe().frame, at: 1.2}]}), /fraction/);
  assert.throws(() => validateEdit({...base(), keyframes: [keyframe({uri: 'https://example.com/a.png'})]}), /unknown field uri/);
  // Whole seconds, start before end, the keyframe inside, the end exclusive.
  assert.throws(() => validateEdit({...base(), keyframes: [keyframe({range: {start_seconds: 2.2, end_seconds: 2.8}})]}), /whole seconds/);
  assert.throws(() => validateEdit({...base(), keyframes: [keyframe({range: {start_seconds: 3, end_seconds: 3}})]}), /whole seconds/);
  assert.throws(() => validateEdit({...base(), keyframes: [keyframe({range: {start_seconds: 2}})]}), /whole seconds/);
  assert.throws(() => validateEdit({...base(), keyframes: [keyframe({range: {start_seconds: 0, end_seconds: 2}})]}), /inside its range/);
  // Learned from the API on 2026-11-11 (HTTP 400): an edit range must span at least two seconds.
  assert.throws(() => validateEdit({...base(), keyframes: [keyframe({range: {start_seconds: 2, end_seconds: 3}})]}), /shorter than two seconds/);
  assert.throws(() => validateEdit({...base(), keyframes: [keyframe({seconds: 4, range: window})]}), /inside its range/);
  assert.doesNotThrow(() => validateEdit({...base(), keyframes: [keyframe({seconds: 2, range: window})]}));
  // All keyframes or none, and one window per request.
  assert.throws(() => validateEdit({...base(), keyframes: [keyframe({range: window}), keyframe({seconds: 2.7})]}), /all keyframes/);
  assert.throws(() => validateEdit({...base(), keyframes: [keyframe({seconds: 1.5, range: {start_seconds: 1, end_seconds: 3}}), keyframe({range: window})]}), /same range/);
  assert.doesNotThrow(() => validateEdit({...base(), keyframes: [keyframe({range: window}), keyframe({seconds: 2.7, range: window})]}));
});

test('guidance times and the edit window must lie inside the measured clip', () => {
  const window = {start_seconds: 2, end_seconds: 4}, clip = facts(120);
  assert.doesNotThrow(() => assertEditFitsSource(base(), clip));
  assert.doesNotThrow(() => assertEditFitsSource({...base(), keyframes: [keyframe({range: window})]}, clip));
  assert.doesNotThrow(() => assertEditFitsSource({...base(), keyframes: [{frame: keyframe().frame, at: 0.6, range: window}]}, clip));
  assert.doesNotThrow(() => assertEditFitsSource({...base(), keyframes: [keyframe({seconds: 3.5, range: {start_seconds: 2, end_seconds: 4}})]}, clip));
  assert.throws(() => assertEditFitsSource({...base(), keyframes: [{frame: keyframe().frame, at: 0.4, range: window}]}, clip), /inside its range/);
  assert.throws(() => assertEditFitsSource({...base(), keyframes: [keyframe({seconds: 4.5})]}, clip), /after the end/);
  assert.throws(() => assertEditFitsSource({...base(), keyframes: [keyframe({seconds: 2.3, range: window})]}, facts(75)), /window ends after/);
});

test('one ceiling covers clip jobs and edits; a prepared receipt does not count, a possibly sent one does', () => {
  assert.deepEqual(ledgerIds([{id: 'job-a'}, {id: 'job-b'}], [{id: 'edit-a'}]), ['job-a', 'job-b', 'edit-a']);
  const jobReceipts = [{status: 'SUCCEEDED', estimatedCredits: 80}, {status: 'PREPARED', estimatedCredits: 80}];
  const editReceipts = [{status: 'SUBMITTING', estimatedCredits: 112}, {status: 'FAILED', estimatedCredits: 56}, {status: 'PREPARED', estimatedCredits: 112}];
  assert.equal(assertSharedBudget(360, [...jobReceipts, ...editReceipts], 112), 248);
  assert.throws(() => assertSharedBudget(359, [...jobReceipts, ...editReceipts], 112), /ceiling/);
  assert.doesNotThrow(() => assertSharedBudget(359, jobReceipts, 112), 'the same order passes when the edits are left out, which is why both are counted');
  // A receipt that cannot be counted stops the order instead of counting as nothing.
  assert.throws(() => assertSharedBudget(5000, [{status: 'SUCCEEDED'} as never], 112), /cannot be counted/);
  assert.throws(() => assertSharedBudget(5000, [], Number.NaN), /no readable estimate/);
});

test('an order is sent once: any lock, task or status other than PREPARED refuses a new submit', () => {
  assert.doesNotThrow(() => assertSubmittable({status: 'PREPARED'}, false));
  assert.throws(() => assertSubmittable({status: 'PREPARED'}, true), /never resubmit/);
  for (const status of ['SUBMITTING', 'PENDING', 'THROTTLED', 'RUNNING', 'SUCCEEDED', 'FAILED', 'CANCELLED', undefined]) assert.throws(() => assertSubmittable({status}, false), /never resubmit/);
  assert.throws(() => assertSubmittable({status: 'PREPARED', taskId: '47fb3a79-6adb-4cd9-8d98-a2fbeb6a45fe'}, false), /never resubmit/);
  // A failed upload leaves the receipt PREPARED and unlocked: nothing was ordered, so a deliberate new submit is allowed.
  assert.doesNotThrow(() => assertSubmittable({status: 'PREPARED', uploads: [{status: 'FAILED'}]} as never, false));
});
