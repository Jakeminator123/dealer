import {createHash} from 'node:crypto';
import {dealersOf, type BankData} from '../src/clip-graph.ts';
import type {DealerAnswer, MediaAnswer, Role} from '../studio/lib/media.ts';
import type {Proof} from './studio-freeze.ts';

const motionFile = /^assets\/motions\/([a-z0-9]+(?:-[a-z0-9]+)*)\/(source(?:-reversed)?\.mp4|(?:first|last)\.webp)$/;

/** The catalog points only to media already in the static export or Blob plan. */
export function snapshotMaterial(bank: BankData, proofs: readonly Proof[], dealerIds: readonly string[], published: ReadonlyMap<string, number>): MediaAnswer {
  const dealers = new Map<string, DealerAnswer>(), owners = dealersOf(bank), added = new Set<string>();
  for (const id of dealerIds) dealers.set(id, {id, name: id[0].toUpperCase() + id.slice(1), entries: [], bank: {jobs: 0, derived: 0, edits: 0}});
  const add = (dealer: DealerAnswer, path: string, role: Role, name: string, fps: number | null = null) => {
    const key = `${dealer.id}/${path}`, bytes = published.get(path);
    if (bytes === undefined || added.has(key)) return;
    added.add(key);
    dealer.entries.push({id: `kopian-${createHash('sha256').update(key).digest('hex')}`, name, role, path, served: path, bytes, fps,
      exists: true, inside: true, width: null, height: null, frames: null, count: null, usedBy: []});
  };

  for (const kind of ['jobs', 'derived', 'edits'] as const) for (const {id} of bank[kind] ?? []) {
    const media = bank.media?.[id], dealer = dealers.get(owners[id]);
    if (!media || !dealer || ![media.video, media.reversed, media.first, media.last].some(path => path && motionFile.test(path) && published.has(path))) continue;
    dealer.bank[kind]++;
    // Material already renders the bank's films from its graph, so only list the stills as individual entries.
    dealer.films = {from: 'api/clip-bank', note: 'Tagningar i kopians klippbank.'};
    for (const [path, label] of [[media.first, 'Första bild'], [media.last, 'Sista bild']] as const) {
      const match = motionFile.exec(path ?? '');
      if (path && match?.[2].endsWith('.webp')) add(dealer, path, 'arbetsmaterial', `${label} · ${match[1]}`);
    }
  }

  for (const proof of proofs) {
    const owner = dealers.get(proof.id.split('-')[0]);
    for (const file of proof.files) {
      const match = /^assets\/proofs\/([a-z0-9][a-z0-9._-]*)\/([a-z0-9][a-z0-9._-]*\.(mp4|png))$/.exec(file.path);
      if (match?.[1] !== proof.id) continue;
      const video = match[3] === 'mp4';
      for (const dealer of owner ? [owner] : dealers.values()) add(dealer, file.path, video ? 'referens' : 'arbetsmaterial',
        `Prov · ${proof.id} · ${match[2]}`, video && Number.isFinite(proof.fps) && proof.fps > 0 ? proof.fps : null);
    }
  }
  return {schemaVersion: 1, readable: true, revision: null, problems: [], dealers: [...dealers.values()], measures: [], unassigned: []};
}
