// The lip-sync facts as the studio's view Lipsync reads them (GET /api/lipsync in tools/preview.ts): data/lipsync.json
// through the strict reader (tools/lipsync-register.ts), with a still for each proof and for the base pictures, and the
// film of each dealer's mouth proof, taken from proof folders that really lie under assets/proofs/; and what the speech
// register (data/speech.json) sets per dealer: the bank id, the rest film, the language and the voice by name and model
// (never the name of the line that holds an account's key). Read-only: nothing here writes.
import {readFile, readdir, realpath} from 'node:fs/promises';
import path from 'node:path';
import {StoreError} from './placement-store.ts';
import {LIPSYNC_FILE, pickFilm, pickStill, readLipsync, type Lipsync} from './lipsync-register.ts';

export const SPEECH_FILE = 'data/speech.json';
/** A proof's picture or film for the page, as an address of the lab server, and the proof it opens in Prov. */
export type Still = {proof: string; name: string; path: string; kind: 'video' | 'image'};
/** What the speech register sets for one dealer; voice is null where it names no voice the register has. */
export type SpeechSet = {bankId: string; rest: string; language: string; voice: {name: string; provider: string; model: string; languages: string[]} | null};
/** Per dealer id; null when the register could not be read (the view then says okänt, not inte gjort). */
export type SpeechSets = Record<string, SpeechSet> | null;
/**
 * The page's still for the base pictures: the rest film's own mouth, first in the strip, beside the model's mouth in four
 * sizes (proof paow-realtid-mun-3, Jakob 2026-11-17). Chosen for the view; the facts file names no picture. When the file is
 * not on this machine the view says it in words only.
 */
export const BASE_STILL = {proof: 'paow-realtid-mun-3', file: 'paow-realtid-mun-3-2-stillbild.png'} as const;
export type LipsyncAnswer = Lipsync & {stills: {base: Still | null; proofs: Record<string, Still | null>; films: Record<string, Still | null>}; speech: SpeechSets};

const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const word = (v: unknown): v is string => typeof v === 'string' && v.length > 0 && v.length <= 120;

/**
 * The speech register's settings per dealer, only the fields the view shows and only where they are plain words. A missing
 * file is no dealer set up (an empty record); a file that is no JSON or no object is null.
 */
export function speechSets(raw: unknown): SpeechSets {
  if (!object(raw) || !object(raw.dealers)) return null;
  const voices = object(raw.voices) ? raw.voices : {};
  const out: Record<string, SpeechSet> = {};
  for (const [id, d] of Object.entries(raw.dealers)) {
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id) || !object(d) || !word(d.bankId) || !word(d.rest) || !word(d.language)) continue;
    const v = word(d.voice) ? voices[d.voice] : null;
    const voice = object(v) && word(v.name) && word(v.provider) && word(v.modelId)
      ? {name: v.name, provider: v.provider, model: v.modelId, languages: object(v.languages) ? Object.keys(v.languages).filter(k => /^[a-z]{2}$/.test(k)) : []}
      : null;
    out[id] = {bankId: d.bankId, rest: d.rest, language: d.language, voice};
  }
  return out;
}

async function readSpeech(root: string): Promise<SpeechSets> {
  let text: string;
  try { text = await readFile(path.join(root, ...SPEECH_FILE.split('/')), 'utf8'); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return {}; throw error; }
  try { return speechSets(JSON.parse(text)); } catch { return null; }
}

export async function lipsyncAnswer(root: string): Promise<LipsyncAnswer> {
  let text: string;
  try { text = await readFile(path.join(root, ...LIPSYNC_FILE.split('/')), 'utf8'); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') throw new StoreError(404, `${LIPSYNC_FILE} finns inte.`); throw error; }
  let raw: unknown;
  try { raw = JSON.parse(text); } catch { throw new StoreError(422, `${LIPSYNC_FILE} är inte giltig JSON.`); }
  const facts = readLipsync(raw); // a LipsyncError (422) names every problem

  const base = await realpath(path.join(root, 'assets', 'proofs')).catch(() => null);
  /** A proof's folder: its files and labels, only where it really lies under assets/proofs/; null otherwise. */
  async function folder(id: string): Promise<{names: string[]; labels: Record<string, unknown> | null} | null> {
    if (!base) return null;
    const at = await realpath(path.join(base, id)).catch(() => null);
    if (at !== path.join(base, id)) return null;
    const names = (await readdir(at, {withFileTypes: true}).catch(() => [])).filter(entry => entry.isFile()).map(entry => entry.name);
    let labels: Record<string, unknown> | null = null;
    try { const info: unknown = JSON.parse(await readFile(path.join(at, 'proof.json'), 'utf8')); if (object(info) && object(info.labels)) labels = info.labels; } catch {}
    return {names, labels};
  }
  const still = (proof: string, name: string, kind: Still['kind']): Still => ({proof, name, path: `assets/proofs/${proof}/${name}`, kind});

  const proofs: Record<string, Still | null> = {};
  for (const p of facts.proofs) {
    const found = await folder(p.id), pick = found ? pickStill(found.names, found.labels) : null;
    proofs[p.id] = pick ? still(p.id, pick.name, pick.kind) : null;
  }
  // The film of the proof each dealer's mouth was chosen in, to be seen in motion beside its still.
  const films: Record<string, Still | null> = {};
  for (const d of facts.dealers ?? []) {
    if (!d.mouth || d.mouth.proof in films) continue;
    const found = await folder(d.mouth.proof), name = found ? pickFilm(found.names, found.labels) : null;
    films[d.mouth.proof] = name ? still(d.mouth.proof, name, 'video') : null;
  }
  const baseFolder = await folder(BASE_STILL.proof);
  const baseStill = baseFolder?.names.includes(BASE_STILL.file) ? still(BASE_STILL.proof, BASE_STILL.file, 'image') : null;
  return {...facts, stills: {base: baseStill, proofs, films}, speech: await readSpeech(root)};
}
