// Tests for which spoken film the dealer has for a line, a phase or something written in the chat (src/speech-lines.ts).
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {SPOKEN_LINES, PHASE_LINE, CHAT_FALLBACK, CHAT_KEYS, chatKey, spokenFilm, spokenFilms, chatReply, type SpeechTake} from '../src/speech-lines.ts';

const register = JSON.parse(readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '../data/speech.json'), 'utf8')) as {lines: Record<string, Record<string, string>>; chat: Record<string, Record<string, string>>};
// A take as the clip bank hands it over: its record carries `speech` when it is a spoken film.
const take = (id: string, line: string, text: string, more: Partial<SpeechTake> & {voice?: string; language?: string; dealer?: string; seconds?: number} = {}): SpeechTake => ({
  id, dealer: more.dealer ?? 'paow', decision: more.decision ?? 'ACCEPTED', stage: 'DONE', inbox: more.inbox ?? true, fps: 24, frames: 47, media: {video: `assets/motions/${id}/source.mp4`},
  motion: {id, dealer: more.dealer ?? 'paow', source: {path: `assets/motions/${id}/source.mp4`, fps: 24, frames: 47, audio: true},
    speech: {line, language: more.language ?? 'sv', text, voice: more.voice ?? 'Jessica', soundStartsAtSeconds: 0.22, soundEndsAtSeconds: 0.22 + (more.seconds ?? 1.21)}}});
const rest: SpeechTake = {id: 'paow-vila-01-01', dealer: 'paow', decision: 'ACCEPTED', stage: 'DONE', inbox: false, fps: 30, frames: 118, media: {video: 'assets/motions/paow-vila-01-01/source.mp4'}, motion: {id: 'paow-vila-01-01', dealer: 'paow'}};
const TAKES: SpeechTake[] = [rest,
  take('paow-tal-placebets-sv-01', 'placebets', 'Lägg era insatser, tack.'),
  take('paow-tal-placebets-sv-03', 'placebets', 'Lägg era insatser, tack.', {voice: 'Sarah', seconds: 1.16}),
  take('paow-tal-goodluck-sv-01', 'goodluck', 'Insatserna är stängda. Lycka till vid mitt bord!', {seconds: 2.47}),
  take('paow-tal-dealerbust-sv-01', 'dealerbust', 'Dealern är över tjugoett! Grattis, bordet vinner.', {decision: 'REJECTED'}),
  take('paow-tal-dealerbust-sv-02', 'dealerbust', 'Dealern är över tjugoett! Grattis, bordet vinner.'),
  take('paow-tal-hej-sv-01', 'hej', 'Hej och välkommen till bordet!'),
  take('paow-tal-chat2-sv-01', 'chat2', 'Roligt att du är här.'),
  take('pamela-tal-placebets-sv-01', 'placebets', 'Lägg era insatser, tack.', {dealer: 'pamela', voice: 'Lily'}),
];

test('a line has its film: the clip, the text as it is read and where the sound lies', () => {
  const said = spokenFilm(TAKES, 'paow', 'goodluck')!;
  assert.deepEqual({key: said.key, clip: said.clip, video: said.video, text: said.text, voice: said.voice, fps: said.fps, frames: said.frames},
    {key: 'goodluck', clip: 'paow-tal-goodluck-sv-01', video: 'assets/motions/paow-tal-goodluck-sv-01/source.mp4', text: 'Insatserna är stängda. Lycka till vid mitt bord!', voice: 'Jessica', fps: 24, frames: 47});
  assert.equal(said.soundStart, 0.22); assert.ok(Math.abs(said.soundEnd! - 2.69) < 1e-9); assert.ok(Math.abs(said.seconds! - 47 / 24) < 1e-9);
  assert.equal(spokenFilm(TAKES, 'paow', 'insurance'), null, 'no film for the line: the caller shows its own text');
  assert.equal(spokenFilm(TAKES, 'paow', 'vila'), null);
  assert.equal(spokenFilm([rest], 'paow', 'placebets'), null, 'a rest take without speech is never a spoken film');
});

test('a phase of the round names its line', () => {
  assert.equal(spokenFilm(TAKES, 'paow', 'BETTING')!.key, 'placebets');
  assert.equal(spokenFilm(TAKES, 'paow', 'DEALING')!.clip, 'paow-tal-goodluck-sv-01');
  assert.equal(spokenFilm(TAKES, 'paow', 'DEALER'), null, 'the line exists, the film is not in these takes');
  for (const key of Object.values(PHASE_LINE)) assert.ok(register.lines.sv[key] ?? register.chat.sv[key], `${key} has a text`);
  for (const key of SPOKEN_LINES) assert.ok(register.lines.sv[key] && register.lines.en[key], `${key} has a text in both languages`);
});

test('the film is the dealer\'s own, never a rejected take, the newest first, and the voice asked for', () => {
  assert.equal(spokenFilm(TAKES, 'paow', 'dealerbust')!.clip, 'paow-tal-dealerbust-sv-02');
  assert.equal(spokenFilm(TAKES, 'pamela', 'placebets')!.voice, 'Lily');
  assert.equal(spokenFilm(TAKES, 'pamela', 'goodluck'), null);
  assert.equal(spokenFilm(TAKES, 'paow', 'placebets')!.clip, 'paow-tal-placebets-sv-03', 'the newest take when no voice is asked for');
  assert.equal(spokenFilm(TAKES, 'paow', 'placebets', {voice: 'Jessica'})!.clip, 'paow-tal-placebets-sv-01');
  assert.equal(spokenFilm(TAKES, 'paow', 'placebets', {language: 'en'}), null);
  // A take Jakob has judged goes before one that still waits in the inbox, whatever their numbers.
  const judged = TAKES.map(t => t.id === 'paow-tal-placebets-sv-01' ? {...t, inbox: false} : t);
  assert.equal(spokenFilm(judged, 'paow', 'placebets')!.clip, 'paow-tal-placebets-sv-01');
  assert.deepEqual(Object.keys(spokenFilms(TAKES, 'paow', {voice: 'Jessica'})).sort(), ['chat2', 'dealerbust', 'goodluck', 'hej', 'placebets']);
  // What he has approved is played until he has judged a newer take: a newer one nobody has judged does not take its place,
  // whether its record carries the inbox mark or not (2026-11-13: he approved blackjack 04, and 05 played).
  const line = 'Blackjack! Vackert spelat. Grattis!', approved = take('paow-tal-blackjack-sv-04', 'blackjack', line, {voice: 'Paow', inbox: false});
  for (const newer of [take('paow-tal-blackjack-sv-05', 'blackjack', line, {voice: 'Paow', decision: 'PENDING', inbox: false}), take('paow-tal-blackjack-sv-05', 'blackjack', line, {voice: 'Paow', decision: 'PENDING', inbox: true})])
    assert.equal(spokenFilm([rest, approved, newer], 'paow', 'blackjack', {voice: 'Paow'})!.clip, 'paow-tal-blackjack-sv-04');
  // A take he rejects is never played, and one set aside for a newer plays only when nothing else does.
  const unjudged = take('paow-tal-chat1-sv-04', 'chat1', 'Tack! Lycka till.', {voice: 'Paow', decision: 'PENDING', inbox: false});
  assert.equal(spokenFilm([rest, take('paow-tal-chat1-sv-03', 'chat1', 'Tack! Lycka till.', {voice: 'Paow', decision: 'REJECTED', inbox: false}), unjudged], 'paow', 'chat1')!.clip, 'paow-tal-chat1-sv-04');
  const aside = take('paow-tal-chat1-sv-05', 'chat1', 'Tack! Lycka till.', {voice: 'Paow', decision: 'SECONDARY', inbox: false});
  assert.equal(spokenFilm([rest, unjudged, aside], 'paow', 'chat1')!.clip, 'paow-tal-chat1-sv-04');
  assert.equal(spokenFilm([rest, aside], 'paow', 'chat1')!.clip, 'paow-tal-chat1-sv-05');
});

test('what the player writes is answered with one of the fixed replies', () => {
  const cases: [string, string][] = [['Hej!', 'hej'], ['hallå där', 'hej'], ['God kväll', 'hej'], ['hej då', 'hejda'], ['Godnatt, vi ses', 'hejda'], ['Vad heter du?', 'namn'], ['vem är du', 'namn'],
    ['Hur mår du?', 'hurmardu'], ['Hur funkar det här?', 'regler'], ['vilka är reglerna', 'regler'], ['Lycka till!', 'detsamma'], ['tack så mycket', 'varsagod'], ['Åh nej, otur', 'otur'],
    ['jag förlorade igen', 'otur'], ['YES! Jag vann', 'grattis'], ['Vad är klockan?', 'vetej'], ['who are you', 'namn'], ['thanks', 'varsagod']];
  for (const [written, key] of cases) assert.equal(chatKey(written), key, written);
  // Nothing that fits: the dummy's own four answers, in turn.
  assert.deepEqual([0, 1, 2, 3, 4, -1].map(n => chatKey('fantastiskt bord', n)), ['chat1', 'chat2', 'chat3', 'chat4', 'chat1', 'chat4']);
  assert.equal(chatKey('hejaklack'), 'chat1', 'a word is matched whole');
  for (const key of CHAT_KEYS) assert.ok(register.chat.sv[key], `the reply ${key} has a text in data/speech.json`);
  assert.deepEqual([...CHAT_FALLBACK], ['chat1', 'chat2', 'chat3', 'chat4']);
  assert.equal(chatReply(TAKES, 'paow', 'Hej Paow!')!.text, 'Hej och välkommen till bordet!');
  assert.equal(chatReply(TAKES, 'paow', 'vilket väder', 1)!.clip, 'paow-tal-chat2-sv-01');
  assert.equal(chatReply(TAKES, 'paow', 'vilket väder', 0), null, 'a reply without a film: the chat shows its text only');
});
