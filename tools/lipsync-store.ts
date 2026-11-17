// The lip-sync facts as the studio's view Lipsync reads them (GET /api/lipsync in tools/preview.ts): data/lipsync.json
// through the strict reader (tools/lipsync-register.ts), with a still for each proof and for the base pictures, taken from
// proof folders that really lie under assets/proofs/. Read-only: nothing here writes, and the register is the speech lane's.
// Tests: tools/lipsync-store.test.ts.
import {readFile, readdir, realpath} from 'node:fs/promises';
import path from 'node:path';
import {StoreError} from './placement-store.ts';
import {LIPSYNC_FILE, pickStill, readLipsync, type Lipsync} from './lipsync-register.ts';

/** A proof's picture or film for the page, as an address of the lab server, and the proof it opens in Prov. */
export type Still = {proof: string; name: string; path: string; kind: 'video' | 'image'};
/**
 * The page's still for the base pictures: the rest film's own mouth, first in the strip, beside the model's mouth in four
 * sizes (proof paow-realtid-mun-3, Jakob 2026-11-17). Chosen for the view; the facts file names no picture. When the file is
 * not on this machine the view says it in words only.
 */
export const BASE_STILL = {proof: 'paow-realtid-mun-3', file: 'paow-realtid-mun-3-2-stillbild.png'} as const;
export type LipsyncAnswer = Lipsync & {stills: {base: Still | null; proofs: Record<string, Still | null>}};

const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

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
  const baseFolder = await folder(BASE_STILL.proof);
  const baseStill = baseFolder?.names.includes(BASE_STILL.file) ? still(BASE_STILL.proof, BASE_STILL.file, 'image') : null;
  return {...facts, stills: {base: baseStill, proofs}};
}
