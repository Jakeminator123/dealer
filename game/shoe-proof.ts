// Shoe proof commit/reveal of the local engine: the commitment is fixed before the burn card,
// replayShuffle rebuilds a shoe order from its recorded random words, verifyShoe reconciles
// a closed shoe. Kept because core.ts uses openProof/replayShuffle unchanged; the lab never
// needs to trust it, but tests use verifyShoe to prove burn, cut and draw accounting.
// Ported from scoutgaming services/game/games/blackjack/shoe-proof.mjs at commit 0fe56ace3
// (git blob 6337904a116359aaf765a5993d341ad95f1285ad). Logic unchanged; only types added.
//
// Scout's header, kept: ported from Kevin's vendor/croupier/shoe-proof.mjs @ 5aa7ed1.
// v1 material remains byte-compatible. v2 binds the between-round reserve policy
// to new commitments; a legacy open v1 shoe can adopt it only at closure.
// Key order of hashed objects is part of the persisted TEXT contract.
import { createHash } from 'node:crypto';
import { SHOE_RULES, SHOE_RESERVE_POLICY, roundCardReserve } from './shoe-rules.ts';
import type { ShoeRules } from './shoe-rules.ts';
import { verifyJournal } from './rng.ts';
import type { RngJournalEntry } from './rng.ts';
import type { Card, Rank, Suit } from './round.ts';
import type { RngReceipt } from './random-port.ts';

/** A physical card of the unshuffled eight-deck shoe (serial 1–416). */
export interface PhysicalCard { r: Rank; s: Suit; serial: number }
export interface ProofDraw { position: number; kind: 'burn' | 'deal'; card: PhysicalCard | Card }
export interface ShoeReserve { policy: string; boxes: number; minimum: number }
export interface ShoeProof {
  version: 1 | 2; shoeId: string; rules: ShoeRules; nonce: string; samples: number[]; draws: ProofDraw[];
  policy?: string; commitment: string; rng?: RngReceipt;
  closed?: boolean; reason?: 'cut-card' | 'round-reserve'; reserve?: ShoeReserve; remaining?: PhysicalCard[];
  legacy?: boolean; commandDraws?: ProofDraw[];
}
export interface ClosingEvidence { status: 'verified' | 'incomplete'; proofDigest?: string; reason?: string; policy?: string; boxes?: number }
export interface ShoeVerification { status: 'verified' | 'incomplete' | 'failed'; checks: Array<{ name: string; pass: boolean; incomplete?: boolean }>; disclaimer: string }

export const digest = (value: unknown): string => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const ranks = ['A','2','3','4','5','6','7','8','9','10','J','Q','K'] as Rank[];
const suits = ['♠','♥','♦','♣'] as Suit[];
const material = (p: ShoeProof) => ({version:p.version,shoeId:p.shoeId,rules:p.rules,nonce:p.nonce,samples:p.samples,
  ...(p.version === 2 ? {policy:p.policy} : {})});

export function openProof(shoeId: string, rules: ShoeRules, samples: number[], nonce: string, policy: string | null = null): ShoeProof {
  if (typeof nonce !== 'string' || !/^[a-f0-9]{64}$/.test(nonce)) throw Error('Invalid shoe nonce');
  if (policy !== null && policy !== SHOE_RESERVE_POLICY) throw Error('Unknown shoe policy');
  const proof = {version:policy === null ? 1 : 2,shoeId,rules:{...rules},nonce,samples,draws:[],
    ...(policy === null ? {} : {policy})} as unknown as ShoeProof;
  proof.commitment = digest(material(proof));
  return proof;
}

// Independent replay, preserving the engine's existing rejection threshold.
export function replayShuffle(samples: readonly number[], decks=8): PhysicalCard[] {
  if(decks!==8 || !Array.isArray(samples) || samples.length>10000)throw Error('Invalid shuffle transcript');
  const cards: PhysicalCard[]=[];let cursor=0;
  for(let d=0;d<decks;d++)for(const s of suits)for(const r of ranks)cards.push({r,s,serial:cards.length+1});
  for(let i=cards.length-1;i>0;i--){
    const n=i+1,max=Math.floor(0xFFFFFFFF/n)*n;let value;
    do {value=samples[cursor++];if(!Number.isInteger(value)||value<0||value>0xFFFFFFFF)throw Error('Missing or invalid random sample');}while(value>=max);
    const j=value%n;[cards[i],cards[j]]=[cards[j],cards[i]];
  }
  if(cursor!==samples.length)throw Error('Unused random samples');
  return cards.reverse(); // The engine pops from the end.
}

// closingEvidence is supplied by the atomic writer or by a verified audit chain,
// never read from the proof itself. Historical v1 cut proofs need no new fields.
export function verifyShoe(proof: ShoeProof, expectedCommitment: string = proof?.commitment, closingEvidence: ClosingEvidence | null = null): ShoeVerification {
  const checks: ShoeVerification['checks']=[];
  let incomplete=false;
  const check=(name: string,pass: unknown)=>checks.push({name,pass:Boolean(pass)});
  try {
    check('Closed shoe',proof.closed===true && ['cut-card','round-reserve'].includes(proof.reason as string));
    check('Eight decks / 416 cards / one burn / cut at 312',JSON.stringify(proof.rules)===JSON.stringify(SHOE_RULES));
    const knownPolicy = proof.version===1 ? proof.policy===undefined : proof.version===2 && proof.policy===SHOE_RESERVE_POLICY;
    check('Opening commitment',knownPolicy && /^[a-f0-9]{64}$/.test(proof.nonce) && digest(material(proof))===expectedCommitment && proof.commitment===expectedCommitment);
    const order=replayShuffle(proof.samples);
    check('416 unique physical cards',new Set(order.map(c=>c.serial)).size===416);
    check('Eight of every rank and suit',suits.every(s=>ranks.every(r=>order.filter(c=>c.r===r&&c.s===s).length===8)));
    const drawn=proof.draws,remaining=proof.remaining as PhysicalCard[];
    check('Complete accounting',drawn.length>=1 && drawn.length<=416 && drawn.length+remaining.length===416);
    const reserve = proof.reserve as ShoeReserve;
    const reserveValid = reserve && JSON.stringify(Object.keys(reserve).sort())===JSON.stringify(['boxes','minimum','policy'])
      && reserve.policy===SHOE_RESERVE_POLICY && Number.isInteger(reserve.boxes) && reserve.boxes>=1 && reserve.boxes<=7
      && reserve.minimum===roundCardReserve(reserve.boxes) && remaining.length<reserve.minimum && drawn.length<SHOE_RULES.cutAfter;
    check('Closing condition',proof.reason==='cut-card' ? drawn.length>=SHOE_RULES.cutAfter && reserve===undefined : reserveValid);
    check('Physical card identities are unique',new Set([...drawn.map(d=>d.card),...remaining].map(c=>c.serial)).size===416);
    check('Contiguous draws match RNG order',drawn.every((d,i)=>d.position===i+1 && d.kind===(i===0?'burn':'deal') && d.card.r===order[i]?.r && d.card.s===order[i]?.s && d.card.serial===order[i]?.serial));
    check('Action log matches every dealt card',JSON.stringify(proof.commandDraws)===JSON.stringify(drawn.slice(1)));
    check('Unused cards match remaining shoe',remaining.every((c,i)=>c.r===order[drawn.length+i]?.r && c.s===order[drawn.length+i]?.s && c.serial===order[drawn.length+i]?.serial));
    // Shoes shuffled through packages/game-rng carry the draw's journal receipt. The
    // replayed order (engine array, popped from the end) must reproduce receipt and chain.
    if(proof.rng!==undefined) {
      const entry={...proof.rng,outcome:[...order].reverse()} as unknown as RngJournalEntry;
      check('game-rng receipt matches the replayed shuffle',proof.rng?.op==='shuffle' && proof.rng.size===416 && proof.rng.sequence===1
        && proof.rng.words===proof.samples.length && verifyJournal([entry]).verified);
    }
    if(proof.version===2 || proof.reason==='round-reserve' || closingEvidence) {
      if(!closingEvidence || closingEvidence.status==='incomplete') {
        incomplete=true;
        checks.push({name:'Authenticated closing context',pass:false,incomplete:true});
      } else {
        check('Authenticated closing context',closingEvidence.status==='verified'
          && closingEvidence.proofDigest===digest(proof) && closingEvidence.reason===proof.reason
          && closingEvidence.policy===SHOE_RESERVE_POLICY
          && Number.isInteger(closingEvidence.boxes) && (closingEvidence.boxes as number)>=1 && (closingEvidence.boxes as number)<=7
          && (proof.reason!=='round-reserve' || closingEvidence.boxes===reserve.boxes && closingEvidence.policy===reserve.policy));
      }
    }
  } catch(error){checks.push({name:(error as Error).message,pass:false});}
  return {status:checks.some(c=>!c.pass&&!c.incomplete)?'failed':incomplete?'incomplete':'verified',checks,disclaimer:'Reconciles this recorded shuffle and shoe. Not independent RNG certification or proof against an operator rewriting all records.'};
}
