// Orders for Runway, prepared in the studio's view Beställ and placed later by an ordering agent (tools/order-clerk.md).
// Pure: the order's shape and its check, the steps a dealer can be ordered for with their defaults, what goes out per take
// (requestOf), the cost from the price table in data/order-policy.json, the policy check (also for a group of drafts),
// where a deal bara dit to a seat ends (seatEndOf: the seat's own landing picture, else the cut frame of the bank's film),
// the hash the approval freezes, and the status a person sees. The choices of a deal (hand, handbyte, how the card lands
// and turns, the text's style, tur och retur or bara dit) and the plan's cards as an order sees them, with the seats where
// the left hand would cross her body; the bank's takes a reference film can be chosen from (referenceCandidates). No fs,
// no network, no hashing (the caller hashes hashInput()); the studio builds it in.
// Tests: tools/order-model.test.ts.
import { dealersOf, parseEdge } from './clip-graph.ts';
import type {ReviewEvidence} from './review-evidence.ts';

// ── Words ───────────────────────────────────────────────────────────────────
export const ORDER_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const FILE_NAME = /^[a-z0-9][a-z0-9-]*\.(?:png|jpg|mp4)$/;
export const TEXT_LIMIT = 6000;
export const EXTRA_LIMIT = 600;
export const TAKES_MAX = 4;

export type Kind = 'STILL' | 'FILM';
/**
 * How the card turns: at its place after the carry, in Jakob's six steps of 2026-11-13 (nyp, dra, för fram, vrid, vänd
 * upp, lägg: brought forward back up and low along the felt, then rolled up onto its long edge and over at the place);
 * on the way by a turn of the wrist, the hand turned until the card lies (FREE; from template 9, Jakob 2026-11-17: "måste
 * hon vrida över handleden"; before, any turn a human hand can make, no fixed edge, Jakob 2026-11-12); or turned about the
 * long side on the way like a key, as Pamela's films do, the hand turned until the card lies too (LONG_EDGE). Both turns on
 * the way are valid (Jakob 2026-11-17: "Båda dessa två sätt är giltiga … både vrida som en nyckel samt den andra.
 * Huvudsaken är att rätt sida kommer upp mot spelaren och att korten har symetriskt samma storlek som de rimligen borde
 * ha, och/eller som väljs i labbet och att det är gult till blått som görs."). Folding it over the short edge was an idea
 * Jakob has dropped.
 */
export type FlipAxis = 'AT_PLACE' | 'FREE' | 'LONG_EDGE';
export const FLIP_AXES: readonly FlipAxis[] = ['AT_PLACE', 'FREE', 'LONG_EDGE'];
export const FLIP_LABEL: Record<FlipAxis, string> = {
  AT_PLACE: 'Vänd vid platsen',
  FREE: 'Handleden vänder kortet på vägen',
  LONG_EDGE: 'Rullas kring långsidan på vägen',
};
/**
 * The turn a new deal starts with: how the plan turns the card (Placering, Rörelse, "Hur kortet vänds"): at its place (the
 * plan's turnAt PLACE), else on the way as the plan's flipAxis says (FREE, the wrist; LONG_EDGE, like a key). Jakob
 * 2026-11-13: the orders are driven from Placering, so the plan's word rules here too; his six steps (the turn at the place)
 * are chosen there per card, not written over the plan by the step. Without the plan's word the hand turns it as it can (FREE).
 */
export const defaultFlip = (_step: string, turnAt?: 'AIR' | 'PLACE' | null, axis?: 'FREE' | 'LONG_EDGE' | null): FlipAxis => (turnAt === 'PLACE' ? 'AT_PLACE' : (axis ?? 'FREE'));

/**
 * Which hand deals. The shoe stands at the right of the picture, by her left hand; both anchors 2.1 and 2.2 show that hand
 * on the card. LH: the left hand takes the card and lays it. RH: the right hand reaches over to the shoe, takes it and lays
 * it. PASS (handbyte): the left hand takes it and gives it to the right hand low in front of her body; the right lays it.
 * Stored as the plan stores it (Intent.takeHand and Intent.pass): hand = the hand that takes the card, pass = it is handed over.
 */
export type HandChoice = 'LH' | 'RH' | 'PASS';
export const HAND_CHOICES: readonly HandChoice[] = ['LH', 'RH', 'PASS'];
export const HAND_LABEL: Record<HandChoice, string> = { LH: 'Vänster hela vägen', RH: 'Höger hela vägen', PASS: 'Handbyte' };
export const handChoiceOf = (m: { hand: 'LH' | 'RH'; pass?: boolean }): HandChoice => (m.pass ? 'PASS' : m.hand);
export const handsOf = (choice: HandChoice): { hand: 'LH' | 'RH'; pass: boolean } => (choice === 'PASS' ? { hand: 'LH', pass: true } : { hand: choice, pass: false });

/**
 * The text's style (template 4, 2026-11-13). KORT: only the movement in the order it happens, positive, nothing of her
 * look and no list of bans, the turn said once (the default for a film). MINIMAL: Jakob's trial: the card's colours and
 * that one card goes from the shoe to where the last picture shows it, nothing about how. UTFÖRLIG: the long text of
 * template 3 (her look, every joint, the list of bans); every order made before template 4 is Utförlig. Its words go
 * against today's rules (a drag becomes a lift, the turn is said without the wrist), so no new order is written with it
 * (Jakob 2026-11-17: "Rensa gammalt otydligt skit i projektet"); it stays a style so that the orders stored with it are
 * read and show their own text. A still is written Kort (what is there, said positively, no list of bans); Minimal says
 * nothing a still can use.
 */
export type TextStyle = 'KORT' | 'MINIMAL' | 'UTFÖRLIG';
/** Every style a stored order can have. A new order takes one of stylesFor. */
export const TEXT_STYLES: readonly TextStyle[] = ['KORT', 'MINIMAL', 'UTFÖRLIG'];
export const STYLE_LABEL: Record<TextStyle, string> = { KORT: 'Kort', MINIMAL: 'Minimal', UTFÖRLIG: 'Utförlig' };
export const STYLE_ABOUT: Record<TextStyle, string> = {
  KORT: 'Bara rörelsen, i den ordning den sker. Inget om hennes utseende, inga förbud; vändningen i en mening.',
  MINIMAL: 'Jakobs prov: kortets färger och att ett kort går från skon dit sista bilden visar. Inget om hur. Inte för en bild.',
  UTFÖRLIG: 'Den långa texten från de första beställningarna: hennes utseende, varje led och listan över det som inte får hända. Skrivs inte längre för en ny beställning.',
};
const NEW_FILM_STYLES: readonly TextStyle[] = ['KORT', 'MINIMAL'];
const NEW_STILL_STYLES: readonly TextStyle[] = ['KORT'];
/** The styles a new order can be written in: the step's own, else Kort and Minimal (a still Kort only). Never Utförlig. */
export const stylesFor = (kind: Kind, step?: { styles?: readonly TextStyle[] } | null): readonly TextStyle[] => step?.styles ?? (kind === 'STILL' ? NEW_STILL_STYLES : NEW_FILM_STYLES);
/** A new order is written Kort, a still too; only an order made before template 4 reads as Utförlig (styleOf). */
export const defaultStyle = (_kind?: Kind): TextStyle => 'KORT';
/** A stored order's style: its own, else Utförlig (every order before template 4 was written with the long text). */
export const styleOf = (prompt: { style?: TextStyle | null } | null | undefined): TextStyle => prompt?.style ?? 'UTFÖRLIG';

/** A deal ends at the place on the seat's own end picture (bara dit, the recipe), or goes there and back to the shoe in one film (tur och retur). */
export type Shape = 'ROUND_TRIP' | 'ONE_WAY';
export const SHAPE_LABEL: Record<Shape, string> = { ROUND_TRIP: 'Tur och retur', ONE_WAY: 'Bara dit' };

/**
 * The card's size in one order (Jakob 2026-11-13: "en helt annan storlek, bara för att se om det funkar"): a factor about
 * the card's own centre on the last picture, the saved plan untouched. 1 is the plan's size; any other is a trial.
 */
export const CARD_SCALES = [1, 1.25, 1.5, 2] as const;
export const scaleWords = (factor: number | null | undefined) => (!factor || factor === 1 ? 'som planen' : `${Math.round(factor * 100)} %`);
/**
 * A card's outline grown about its own centre, stopped where the first corner meets the picture's edge, as the plan's
 * scaleCards stops a card (src/placement-model.ts); factor is the one used (smaller than asked where it stopped).
 */
export function scaleQuad(q: readonly (readonly [number, number])[], asked: number, size: { width: number; height: number } = { width: 1764, height: 1174 }): { quad: [number, number][]; factor: number } {
  const cx = q.reduce((s, p) => s + p[0], 0) / q.length, cy = q.reduce((s, p) => s + p[1], 0) / q.length;
  let f = asked;
  if (asked > 1) {
    for (const [x, y] of q) {
      const dx = x - cx, dy = y - cy;
      if (dx > 0) f = Math.min(f, (size.width - 1 - cx) / dx); else if (dx < 0) f = Math.min(f, cx / -dx);
      if (dy > 0) f = Math.min(f, (size.height - 1 - cy) / dy); else if (dy < 0) f = Math.min(f, cy / -dy);
    }
    f = Math.max(1, f);
  }
  return { quad: q.map(([x, y]) => [cx + (x - cx) * f, cy + (y - cy) * f] as [number, number]), factor: Math.round(f * 1000) / 1000 };
}

/** How the card lands. Every card leaves the shoe closed (yellow back up); open lands with the blue face up, so it turns. */
export const LANDS_LABEL: Record<'BACK' | 'FRONT', string> = { BACK: 'Stängt → stängt', FRONT: 'Stängt → öppet' };

/** Stored on the order. A draft (UTKAST) can change; an approved order (GODKÄND) never does; AVBRUTEN is set aside. */
export type OrderStatus = 'UTKAST' | 'GODKÄND' | 'AVBRUTEN';
/** A take after approval, in the receipt (assets/orders/<id>/receipt.json, written only by tools/order-put.ts). */
export const TAKE_FLOW = ['GODKÄND', 'LAGD', 'KLAR', 'HÄMTAD', 'EFTERARBETAD', 'MÄTT', 'GRANSKAD', 'INFÖRD'] as const;
export type TakeStatus = (typeof TAKE_FLOW)[number] | 'OSÄKER' | 'MISSLYCKAD' | 'AVBRUTEN';
/** What a person sees for an order: before approval the draft's state, after it how its takes stand. */
export type Shown = 'UTKAST' | 'VÄNTAR' | 'KLAR_ATT_TRYCKA' | TakeStatus;
export const SHOWN_LABEL: Record<Shown, string> = {
  UTKAST: 'Utkast',
  VÄNTAR: 'Väntar',
  KLAR_ATT_TRYCKA: 'Klar att godkänna',
  GODKÄND: 'Godkänd, i kön',
  LAGD: 'Lagd',
  OSÄKER: 'Osäker',
  KLAR: 'Klar hos Runway',
  HÄMTAD: 'Hämtad',
  EFTERARBETAD: 'Efterarbetad',
  MÄTT: 'Mätt',
  GRANSKAD: 'Granskad',
  INFÖRD: 'Införd',
  MISSLYCKAD: 'Misslyckad',
  AVBRUTEN: 'Avbruten',
};

// ── The order (data/orders/<id>.json) ───────────────────────────────────────
/** A picture that is not made yet: a role of the register that must hold (gäller), or one entry that must. */
export type Waits = { dealer: string; label: string; role?: string; node?: string; entry?: string };
/** The card drawn on a picture where the placement plan says (as the lab draws it, src/card-plan.ts planCardQuad; `as` names the rule). */
export type Drawn = {
  target: string;
  side: 'FRONT' | 'BACK';
  as: string;
  plan: { path: string; sha256: string; updatedAt: string | null };
  texture: { video: string; frame: number; sha256: string; quadFrom: string };
  quad: [number, number][];
  centre: [number, number];
  measured: { centre: [number, number]; area: number; box: [number, number]; changedElsewhere: number } | null;
  measuredOffsetPx: number | null;
  /** The card drawn at this factor of the plan's size about its centre (the order's motion.cardScale; stopped at the picture's edge). Absent: the plan's size. */
  scale?: number;
};
export type GoesAs = 'startFrame' | 'endFrame' | 'referenceImage';
/**
 * A pose figure: of the person in the source picture only the part inside `keep` (a polygon in bank pixels) is kept; the
 * rest of the person is filled with the picture's own green (a smooth model of it plus its own grain). Everything needed
 * to cut it again is here: the source (picture.from and its hash), the polygon and the settings.
 */
export type Cut = {
  keep: [number, number][];
  what: string;
  source: { sha256: string };
  /** tools/order-images.ts CUT at the time of cutting. */
  settings: Record<string, number>;
  filledPx: number;
  keptPx: number;
  green: [number, number, number];
  /**
   * The figure's green brought to the anchor it is sent with (tools/order-images.ts matchGreen): the anchor's file, and
   * the median of the plainly green pixels of the anchor, of the figure before and after. Absent on figures cut before
   * 2026-11-13; null while the anchor waits.
   */
  matched?: { anchorSha256: string; anchor: [number, number, number]; before: [number, number, number]; after: [number, number, number] } | null;
  /**
   * A figure laid on the dealer's own shoe (tools/order-images.ts poseOnShoe; from 2026-11-13): of the source only the
   * forearm and hand (keep, and `sleeve` where black is her sleeve), laid on the anchor cut down to the dealer's shoe and
   * card (`shoe`), moved `by` px so that the middle of the source card's top side meets the middle of her window card's
   * (both cards' corners and top sides). filledPx and green are then of the anchor's cut, keptPx the arm's. by and cards
   * are null while the anchor waits (the arm alone on green). Absent on the figures cut before.
   */
  laid?: {
    sleeve: [number, number][];
    shoe: [number, number][];
    by: [number, number] | null;
    cards: { source: { quad: [number, number][]; top: [[number, number], [number, number]] }; anchor: { quad: [number, number][]; top: [[number, number], [number, number]] } } | null;
  } | null;
};
/**
 * One picture that goes out. name: the file in assets/orders/<id>/ ("first.png"); path and sha256 are null while it waits.
 * from: where it was copied or built from (a register entry, a frame of a film). cut: how a pose figure was cut.
 */
export type Picture = {
  name: string;
  label: string;
  goesAs: GoesAs;
  tag?: string;
  path: string | null;
  sha256: string | null;
  width?: number | null;
  height?: number | null;
  /** cut: the picture is the cut frame of a round trip in the bank (cutFrameOf): the film and the frame, where its return begins. */
  from: { entry?: string; path?: string; frame?: number; built?: string; note?: string; cut?: { clip: string; frame: number; ret: string; shoeFrom?: string | null } | null } | null;
  waits?: Waits | null;
  drawn?: Drawn | null;
  /** Other cards of the plan drawn on the same picture (the hole card's turn drew the dealer's first card, open, until round 6). */
  drawnBeside?: Drawn[] | null;
  cut?: Cut | null;
  /** When a draft followed a newer anchor chosen in Material: when, and what the picture was before. */
  replaced?: { at: string; was: string; entry: string | null; sha256: string | null } | null;
};
/**
 * A reference film (FINNS): a take of the bank copied into the order's folder (path, sha256) with its length. clips: the
 * bank's take it was chosen as; dealer: whose it is (another dealer's film is allowed as a reference and is named
 * wherever it is shown); from: the bank's film it was copied from, its edge, Jakob's verdict and, when the film holds more
 * than the take, the take's frames. dealer and from are absent on orders made before 2026-11-13.
 */
export type Reference =
  | { status: 'INGEN'; why: string }
  | { status: 'SAKNAS'; why: string; candidates: string[] }
  | {
      status: 'FINNS'; clips: string[]; path: string; sha256: string; seconds: number; goesTo: string; approvedStraight: boolean;
      dealer?: string;
      from?: { film: string; path: string; sha256: string; edge: string; verdict: RefVerdict; words: string | null; frames: [number, number] | null; also: string[] };
    };
export type Generation = {
  provider: 'runway-app';
  tool: 'generate_image' | 'generate_video';
  model: string;
  /** Every parameter that goes out besides text and pictures, by its name in the tool. */
  params: Record<string, string | number | boolean>;
};
/**
 * How the card moves in a deal. hand: the hand that takes it from the shoe; pass: it is handed over to the other hand,
 * which lays it (handbyte; only from left to right). side: how it lands (BACK closed, FRONT open); turn: it is turned on
 * the way (every card leaves the shoe closed). fromPlan: hand, pass and side are what Placering says for the card.
 * A GIV-2.3 with TWO_HANDS always hands off from LH to RH. Some historical files stored pass=false for that grip;
 * frozen files retain their original encoding. Orders made before 2026-11-13 lack pass (read as false).
 * cardScale: the card's size on the last picture as a factor of the
 * plan's (CARD_SCALES), a trial; absent: the plan's size. planned: what Placering said for the card when the draft was made,
 * its grip and its turn in the order's words (defaultFlip of the plan's turnAt and flipAxis; null where the plan lays it
 * closed). The grip of an order is its step's (GIV-2.2 drags), so where the plan said otherwise this is where that stays
 * said, also after the plan changes (PlannedMotion, plannedDiffers). Absent on orders made before 2026-11-17.
 */
export type Motion = { grip: Grip; hand: 'LH' | 'RH'; pass: boolean; turn: boolean; flipAxis: FlipAxis | null; target: string | null; side: 'FRONT' | 'BACK'; fromPlan: boolean; cardScale?: number; planned?: PlannedMotion };
export const twoHandMotion = (step: StepKey, grip: Motion['grip'] | undefined) =>
  step === 'GIV-2.3' && grip === 'TWO_HANDS' ? { hand: 'LH', pass: true } as const : null;
export type PlannedMotion = { grip: 'PINCH' | 'DRAG'; flipAxis: FlipAxis | null };
/** What Placering says for a card, as an order stores it (Motion.planned): its grip and how it turns, null where it lands closed. */
export const plannedOf = (seat: Pick<SeatPlan, 'grip' | 'turnAt' | 'flipAxis' | 'side'>): PlannedMotion => ({ grip: seat.grip, flipAxis: seat.side === 'FRONT' ? defaultFlip('', seat.turnAt, seat.flipAxis) : null });
/** Where a deal differs from what Placering said for its card: the grip, and the turn of a card that is turned both ways. */
export function plannedDiffers(m: Pick<Motion, 'grip' | 'turn' | 'flipAxis'>, planned: PlannedMotion | null | undefined): ('grip' | 'turn')[] {
  if (!planned) return [];
  return [...(planned.grip !== m.grip ? ['grip' as const] : []), ...(m.turn && planned.flipAxis && m.flipAxis && planned.flipAxis !== m.flipAxis ? ['turn' as const] : [])];
}
/**
 * A draft's choices with what does not apply taken out: no turn for a card that is not turned (flipAxis null). Drafts made
 * before 2026-11-13 stored one anyway; the store reads them through this, and writes them clean on their next change.
 */
export function tidyMotion(m: Motion | null): Motion | null {
  return m && !m.turn && m.flipAxis !== null ? { ...m, flipAxis: null } : m;
}
export type Order = {
  schemaVersion: 1;
  id: string;
  title: string;
  /** One line in Jakob's words: what the order makes (summaryOf). */
  summary?: string;
  /** Audited display-text corrections. Reconstructing each previous summary must reproduce its original order hash. */
  summaryCorrections?: {before: string | null; orderSha256: string; at: string; reason: string}[];
  group?: { id: string; label: string } | null;
  dealer: string;
  kind: Kind;
  /**
   * The step: a film between two anchors (edge "READY>P4.C1"), or the picture a still makes (makes). shape: a deal goes to
   * the place and back (ROUND_TRIP) or ends on the landing picture (ONE_WAY); every other film is one way.
   */
  step: { key: StepKey; label: string; edge: string | null; shape: Shape | null; cutInto: string[]; makes?: { role: string; entry?: string; label: string } | null };
  motion: Motion | null;
  pictures: Picture[];
  reference: Reference;
  generation: Generation;
  /** style: absent on orders made before template 4 (read as Utförlig, styleOf). */
  /**
   * place: the plan's point for the card that the place words were written from, where the last picture draws no card of
   * its own (an A3, a bank film's frame): a sent text is history, so it is reproduced from this and never from the plan of
   * now (tools/order-store.ts textOf, src/order-prompts.ts orderPrompt). Absent on orders written before 2026-11-18.
   */
  prompt: { template: string; style?: TextStyle; text: string; sha256: string; extra: string | null; middle: boolean; place?: [number, number] | null };
  takes: number;
  cost: { perTake: number; total: number; worstPerTake: number; worstTotal: number; basis: string };
  limits: { maxCredits: number; stopBelowCredits: number };
  notes: string[];
  created: string;
  createdBy: string;
  /**
   * The approval freezes the order's hash: Jakob's click in the studio (by jakob), or the main agent on his mandate (by
   * huvudagent, with mandate: whose word and when; Jakob 2026-11-13: "beställ lämpliga filmer automatiskt utan mitt
   * godkännande"). The same policy limits hold for both.
   */
  approval: Approval | null;
  /** A draft set aside (AVBRUTEN): when, by whom and why; shown in the studio and the protocol. */
  setAside?: { at: string; by: string; why: string } | null;
  status: OrderStatus;
};

/** Who may approve: Jakob by his click, or the main agent on his mandate (it then carries mandate). */
export const APPROVERS = ['jakob', 'huvudagent'] as const;
export type Approval = { by: (typeof APPROVERS)[number]; at: string; orderSha256: string; mandate?: string };
/** "Godkänd av Jakob", "Godkänd av huvudagenten på Jakobs uppdrag": whose approval it is, in words. */
export const approvalWords = (a: Pick<Approval, 'by'>) => (a.by === 'huvudagent' ? 'Godkänd av huvudagenten på Jakobs uppdrag' : 'Godkänd av Jakob');

// ── Steps and their defaults (bestall-plan "Defaults per kind of step") ─────
/** An anchor a film starts or ends on: rest, the pinch, the hand over the card, and both hands at the shoe just before the deal (2.3, Jakob 2026-11-18). */
export type Anchor = '1' | '2.1' | '2.2' | '2.3';
/** How the card leaves the shoe: PINCH from 2.1, DRAG from 2.2; TWO_HANDS from 2.3 (the hand at the shoe strokes it out, the other takes, turns and lays it). */
export type Grip = 'PINCH' | 'DRAG' | 'TWO_HANDS';
export type StepKey = 'INGANG-2.1' | 'INGANG-2.2' | 'INGANG-2.3' | 'GIV-2.1' | 'GIV-2.2' | 'GIV-2.3' | 'RETUR-2.1' | 'RETUR-2.2' | 'RETUR-2.3' | 'RETUR-1' | 'UTGANG' | 'UTGANG-2.2' | 'HALKORT' | 'VILA' | 'ANKARE-2.1' | 'ANKARE-2.2';
/**
 * A step says what a film or still is between: its anchors, whether it carries a card and with which grip, and for a still
 * the picture it makes. How it is ordered (model, resolution, seconds, shape, takes, reference film, last picture, template)
 * is NOT said here: that is the step's one recipe in data/order-methods.json (src/order-methods.ts recipeFor).
 */
export type StepDef = {
  key: StepKey;
  group: string;
  label: string;
  kind: Kind;
  /**
   * The anchor the film starts on and the one it ends on ("1", "2.1", "2.2", "2.3"), or the still's base picture. A return
   * (start LAND) starts on the seat's landing picture instead and ends on `to`; its `from` is the same anchor.
   */
  from: Anchor;
  to: Anchor | null;
  start?: 'LAND';
  card: boolean;
  grip?: Grip;
  /** A still's ratio and size (the picture's geometry, the same whatever model makes it). */
  ratio?: string;
  imageSize?: string;
  /** Why the step cannot be ordered here (yet). */
  off?: string;
  makes?: { role: string; node?: string; label: string };
  /** The graph's edge when it is not an anchor-to-anchor one (the hole card's turn: IDLE>REVEAL(D.C2)). */
  edge?: string;
  /**
   * A step about one card of the plan that is not chosen (the hole card's turn: D.C2), and the cards both of its pictures
   * draw on the anchor it starts on: the first with the card as it lies before (`before`), the last as it lies after.
   */
  target?: string;
  cards?: { target: string; before: 'FRONT' | 'BACK'; after: 'FRONT' | 'BACK' }[];
  /** The text styles it is written in, when not every style of its kind (a step made after template 3 has no long text). */
  styles?: readonly TextStyle[];
};
export const STEPS: readonly StepDef[] = [
  { key: 'INGANG-2.1', group: 'Ingång', label: 'Ankare 1 → 2.1', kind: 'FILM', from: '1', to: '2.1', card: false },
  { key: 'INGANG-2.2', group: 'Ingång', label: 'Ankare 1 → 2.2', kind: 'FILM', from: '1', to: '2.2', card: false },
  // Anchor 2.3 (Jakob 2026-11-18): both hands at the shoe just before the deal, her eyes on the hand that strokes the card
  // out. The entry and the deal wait for the anchor's picture like every step whose anchor does not hold yet.
  { key: 'INGANG-2.3', group: 'Ingång', label: 'Ankare 1 → 2.3', kind: 'FILM', from: '1', to: '2.3', card: false, styles: ['KORT', 'MINIMAL'] },
  { key: 'GIV-2.1', group: 'Giv från ankare 2.1', label: 'Nyp, ett kort till platsen', kind: 'FILM', from: '2.1', to: '2.1', card: true, grip: 'PINCH' },
  { key: 'GIV-2.2', group: 'Giv från ankare 2.2', label: 'Släp, ett kort till platsen', kind: 'FILM', from: '2.2', to: '2.2', card: true, grip: 'DRAG' },
  { key: 'GIV-2.3', group: 'Giv från ankare 2.3', label: 'Två händer, ett kort till platsen', kind: 'FILM', from: '2.3', to: '2.3', card: true, grip: 'TWO_HANDS', styles: ['KORT', 'MINIMAL'] },
  // A return is a film of its own (one action per film, 2026-11-13): from the seat's landing picture back to an anchor.
  // It can be ordered where a landing picture holds for the seat (landingMissing says what is lacking otherwise).
  { key: 'RETUR-2.1', group: 'Retur från landningen', label: 'Tillbaka till nypet (2.1)', kind: 'FILM', from: '2.1', to: '2.1', start: 'LAND', card: true, grip: 'PINCH' },
  { key: 'RETUR-2.2', group: 'Retur från landningen', label: 'Tillbaka över skon (2.2)', kind: 'FILM', from: '2.2', to: '2.2', start: 'LAND', card: true, grip: 'DRAG' },
  { key: 'RETUR-2.3', group: 'Retur från landningen', label: 'Prov: höger hand tillbaka till 2.3', kind: 'FILM', from: '2.3', to: '2.3', start: 'LAND', card: true, styles: ['KORT'], off: 'Provet förbereds via Beställs API med namngiven A3 och giv.' },
  { key: 'RETUR-1', group: 'Retur från landningen', label: 'Tillbaka till vila (1)', kind: 'FILM', from: '1', to: '1', start: 'LAND', card: true, grip: 'PINCH' },
  // The steps a round needs that Beställ could not order before 2026-11-13 (the dealer's second card is GIV-2.1 to D.C2):
  // the hand leaving the shoe for rest (READY>IDLE), and the hole card turned open from rest and the hand back to rest
  // (IDLE>REVEAL(D.C2)), whose pictures are anchor 1 with only the hole card drawn where the plan says: the game draws
  // every lying card itself, and with both drawn she lifted both together (round 6, 2026-11-13).
  { key: 'UTGANG', group: 'Utgång', label: 'Ankare 2.1 → 1: handen lämnar skon och vilar', kind: 'FILM', from: '2.1', to: '1', card: false, styles: ['KORT', 'MINIMAL'] },
  // The way out from the drag at the shoe (READY-B>IDLE, anchor 2.2 to anchor 1), so that a round can go through 2.2 by rest
  // (the main agent's decision 2026-11-13): the hand that lies over the card in the window lifts off it and comes to rest.
  { key: 'UTGANG-2.2', group: 'Utgång', label: 'Ankare 2.2 → 1: handen lämnar kortet i skon och vilar', kind: 'FILM', from: '2.2', to: '1', card: false, styles: ['KORT', 'MINIMAL'] },
  {
    key: 'HALKORT', group: 'Hålkortet', label: 'Hålkortet vänds upp från vila, handen tillbaka', kind: 'FILM', from: '1', to: '1', card: false, target: 'D.C2', edge: 'IDLE>REVEAL(D.C2)',
    cards: [{ target: 'D.C2', before: 'BACK', after: 'FRONT' }], styles: ['KORT', 'MINIMAL'],
  },
  { key: 'VILA', group: 'Vila', label: 'Vila, samma bild först och sist', kind: 'FILM', from: '1', to: '1', card: false },
  { key: 'ANKARE-2.1', group: 'Bild', label: 'Ankare 2.1 (nyp)', kind: 'STILL', from: '1', to: null, card: false, ratio: '4:3', imageSize: '4K', makes: { role: 'ankare-2.1', node: 'READY', label: 'ankare 2.1' } },
  { key: 'ANKARE-2.2', group: 'Bild', label: 'Ankare 2.2 (släp)', kind: 'STILL', from: '1', to: null, card: false, ratio: '4:3', imageSize: '4K', makes: { role: 'ankare-2.2', node: 'READY-B', label: 'ankare 2.2' } },
];
export const stepOf = (key: string): StepDef | null => STEPS.find((s) => s.key === key) ?? null;
/** The anchors in Jakob's words: "ankare 2.1 (nyp): tummen och pekfingret på kortet i skons fönster". */
export const ANCHOR_WORDS: Record<Anchor, string> = {
  '1': 'ankare 1 (vila): båda händerna på bordet',
  '2.1': 'ankare 2.1 (nyp): tummen och pekfingret på kortet i skons fönster',
  '2.2': 'ankare 2.2 (släp): handen över kortet i skons öppning',
  '2.3': 'ankare 2.3 (två händer): båda händerna vid skon precis före draget',
};

// ── The landing picture (a return starts on it, a deal "bara dit" ends on it) ──
/** The register's node and role of a seat's landing picture: LAND(P4.C1), role landning, with the card on the table. */
export const landingNode = (target: string) => `LAND(${target})`;
export const LANDING_ROLE = 'landning';
/**
 * Ankare 3, "A3" (Jakob 2026-11-18: "en bra och logisk slutbildsankare (A3P'n') för respektive possition"): a seat's landing
 * picture is for ONE card place and ONE hand, the hand whose fingertips rest on the card (entry.hand; absent: the left, as
 * every landing picture made before from the bank's one-hand deals). A deal from anchor 2.3 is laid by the right hand, so
 * it ends on the seat's A3 for the right hand, and an A3 for one hand is never the end of a deal laid with the other.
 */
export type HandOf = { hand?: string };
const handOf = (e: HandOf): 'LH' | 'RH' => (e.hand === 'RH' ? 'RH' : 'LH');
/** "A3 · P4", "A3 · Dealer": what a seat's A3 is called. */
export const a3Name = (target: string): string => `A3 · ${target === 'D.C1' ? 'Dealer' : target === 'D.C2' ? 'Hålkort' : target.replace(/\.C1$/, '').replace(/\.C2$/, ' kort 2')}`;
const isLanding = <E extends { role: string; node?: string; card?: string } & HandOf>(e: E, target: string, hand: 'LH' | 'RH') => e.role === LANDING_ROLE && e.node === landingNode(target) && e.card === target && handOf(e) === hand;
/** The landing picture of a seat that holds for a hand: role landning, node LAND(<seat>), state gäller, the card on that seat, that hand at it. */
export function landingOf<E extends { role: string; node?: string; state?: string; card?: string } & HandOf>(entries: readonly E[], target: string | null | undefined, hand: 'LH' | 'RH' = 'LH'): E | null {
  return target ? (entries.find((e) => isLanding(e, target, hand) && e.state === 'gäller') ?? null) : null;
}
/** A seat's A3 pictures for a hand that do not hold yet (kandidat): what a draft can take as its last picture only as a named exception. */
export function a3Candidates<E extends { id: string; role: string; node?: string; state?: string; card?: string } & HandOf>(entries: readonly E[], target: string | null | undefined, hand: 'LH' | 'RH'): E[] {
  return target ? entries.filter((e) => isLanding(e, target, hand) && e.state === 'kandidat') : [];
}
/** What a return lacks where no landing picture holds for the seat it starts from, in Jakob's words. */
export const landingMissing = (dealerName: string, target: string | null | undefined) =>
  `Ingen landningsbild gäller för ${genitive(dealerName)} ${seatWords(target)}. En retur som egen film börjar på den: gör en gällande i Material (roll landning, ${landingNode(target ?? 'P4.C1')}).`;

/**
 * The last picture of a deal bara dit by rule, where no landing picture holds (STANDARD.md of the reference-film trials,
 * D:/dealer-scratch/tmp/giv-experiment-2/; the main agent's decision 2026-11-17): the last frame of the deal in one of
 * the dealer's own round-trip films from the same anchor to the seat (never a frame whose written-down picture check says
 * it does not hold, BankFacts.cutChecks), cut where the bank split it into deal and return,
 * whose return Jakob approved straight (his own verdict: ACCEPTED or Primär, not a variant, not one given in his place;
 * his rule: material for new films is only takes he approved straight). It is not a new picture but the border of a film
 * he has approved, so it needs no verdict of its own: a new deal that ends there is cut straight into that return
 * (`endsOn`, and returnFits in src/clip-graph.ts). Same hand as the deal laid with. First the film whose return is his
 * Primär, then the one whose deal is, then the rest by name. The tools take the frame out of the film and check it as a
 * picture before it is used (the card plain and on the plan, the shoe's card plain, else the shoe from anchor 1).
 */
export type CutFrame = { clip: string; frame: number; deal: string; ret: string; primary: boolean; dealPrimary: boolean; words: string | null; path: string };
/**
 * The picture check of a cut frame as it is written down (data/cut-frames.json, by tools/order-cut-frames.ts, which has the
 * films): whether the laid card lies on the plan's card, what it lacks, and whether the shoe's card is printed (the store
 * then puts the shoe back from anchor 1). A frame written down as not holding is no end picture (cutFrameOf leaves it out);
 * one not written down is offered, and the store's own check when the draft is made is the last word.
 */
export type CutCheck = { holds: boolean; problems: string[]; windowPrinted: boolean; offFromPlan: number | null };
export const cutCheckKey = (clip: string, frame: number, target: string) => `${clip}@${frame}>${target}`;
/** The checks of the file as cutFrameOf reads them (BankFacts.cutChecks); what does not hold its shape is left out. */
export function readCutChecks(value: unknown): Record<string, CutCheck> {
  const frames = (value as { frames?: unknown } | null)?.frames;
  const out: Record<string, CutCheck> = {};
  for (const f of Array.isArray(frames) ? frames : []) {
    const c = f as Partial<CutCheck & { clip: string; frame: number; target: string }> | null;
    if (!c || typeof c.clip !== 'string' || !Number.isInteger(c.frame) || typeof c.target !== 'string' || typeof c.holds !== 'boolean') continue;
    out[cutCheckKey(c.clip, c.frame!, c.target)] = { holds: c.holds, problems: Array.isArray(c.problems) ? c.problems.map(String) : [], windowPrinted: !!c.windowPrinted, offFromPlan: typeof c.offFromPlan === 'number' ? c.offFromPlan : null };
  }
  return out;
}
export function cutFrameOf(bank: BankFacts, want: { dealer: string; step: Pick<StepDef, 'from' | 'card' | 'start' | 'kind'>; target: string | null; hand?: 'LH' | 'RH' | null }): CutFrame[] {
  if (want.step.kind !== 'FILM' || !want.step.card || want.step.start === 'LAND' || !want.target) return [];
  // An archived take is out of play (Karta, 2026-11-18): neither its deal nor its return gives a last frame.
  const node = ANCHOR_NODE[want.step.from], hand = want.hand ?? 'LH', derived = (bank.derived ?? []).filter((d) => !isArchived(bank, d.id) && !isArchived(bank, d.clip));
  const owners = dealersOf(bank as never);
  const out: CutFrame[] = [];
  for (const r of derived) {
    if (r.from !== want.target || r.to !== node || (r.dealer ?? owners[r.id]) !== want.dealer) continue;
    const deal = derived.find((d) => d.clip === r.clip && d.from === node && d.to === want.target && d.frames[1] === r.frames[0] - 1);
    if (!deal) continue;
    const back = bank.motions?.[r.id], review = back?.review;
    const straight = (review?.decision === 'ACCEPTED' || review?.decision === 'MAIN') && review.acceptedAs !== 'VARIANT' && review.userAccepted === true && !review.provisional;
    const laidWith = back?.motion?.releaseHand ?? bank.motions?.[deal.id]?.motion?.releaseHand ?? 'LH';
    if (!straight || laidWith !== hand) continue;
    // A frame whose picture check is written down as not holding (its card lies off the plan's) is no end picture.
    if (bank.cutChecks?.[cutCheckKey(r.clip, deal.frames[1], want.target)]?.holds === false) continue;
    out.push({ clip: r.clip, frame: deal.frames[1], deal: deal.id, ret: r.id, primary: review.acceptedAs === 'MAIN', dealPrimary: bank.motions?.[deal.id]?.review?.acceptedAs === 'MAIN', words: verdictOf(review).words, path: `assets/motions/${r.clip}/source.mp4` });
  }
  return out.sort((a, b) => Number(b.primary) - Number(a.primary) || Number(b.dealPrimary) - Number(a.dealPrimary) || a.clip.localeCompare(b.clip));
}
/** Where a deal ends in the bank's own film, when its last picture is a cut frame: the film and the frame, for the return that continues it. */
export function endsOnOf(pictures: readonly { goesAs: string; from?: { cut?: { clip?: string; frame?: number } | null } | null }[]): { clip: string; frame: number } | null {
  const cut = pictures.find((p) => p.goesAs === 'endFrame')?.from?.cut;
  return cut && typeof cut.clip === 'string' && Number.isInteger(cut.frame) ? { clip: cut.clip, frame: cut.frame! } : null;
}
/**
 * Where a deal bara dit to a seat ends (Jakob 2026-11-18: a landing "bör rimligtvis tas bort helt, eller så bör vi skapa nya
 * bilder för respektive position"; the main agent's decision the same night): on THAT seat's own end picture. Its landing
 * picture where one holds for the seat (LANDNING), else the cut frame of the bank's own film from the same anchor to the
 * seat (SNITTRUTA, cutFrameOf); a seat with neither has none (null), and the deal cannot be ordered bara dit to it. One
 * seat's picture never stands in for another seat.
 */
export type SeatEnd<E> = { kind: 'LANDNING'; entry: E; candidate?: boolean } | { kind: 'SNITTRUTA'; cut: CutFrame };
/**
 * want.hand: the hand that lays the card (the seat's A3 for that hand). want.chosen: an A3 candidate named as an exception
 * ("med kandidaten som sista bild"): it is the end only where it is that seat's A3 for that hand and a candidate; then
 * candidate is true, so that every view says it is not his choice.
 */
export function seatEndOf<E extends { id?: string; role: string; node?: string; state?: string; card?: string } & HandOf>(entries: readonly E[], bank: BankFacts | null, want: { dealer: string; step: Pick<StepDef, 'from' | 'card' | 'start' | 'kind'>; target: string | null; hand?: 'LH' | 'RH' | null; chosen?: string | null }): SeatEnd<E> | null {
  if (want.chosen) {
    const named = a3Candidates(entries as readonly (E & { id: string })[], want.target, want.hand ?? 'LH').find((e) => e.id === want.chosen);
    return named ? { kind: 'LANDNING', entry: named, candidate: true } : null;
  }
  const landing = landingOf(entries, want.target, want.hand ?? 'LH');
  if (landing) return { kind: 'LANDNING', entry: landing };
  const cut = bank ? cutFrameOf(bank, want)[0] : null;
  return cut ? { kind: 'SNITTRUTA', cut } : null;
}
/**
 * Why a deal bara dit cannot be ordered to a seat without an end picture, and the two ways to get one, in Jakob's words.
 * Both are for the hand that lays the card (landingOf, cutFrameOf): laid with the right hand, the words say so, since a
 * landing picture for the left hand may well hold for the seat.
 */
export const seatEndMissing = (dealerName: string, target: string | null | undefined, from: Anchor, lays: 'LH' | 'RH' = 'LH') =>
  lays === 'RH'
    ? `${cap(seatWords(target))} har ingen slutbild för ${genitive(dealerName)} giv från ankare ${from} med höger hand vid kortet: ingen landningsbild för höger hand gäller för platsen, och banken har ingen egen film dit, lagd med höger hand, vars retur du har godkänt rakt. Gör en landningsbild för platsen med höger hand vid kortet gällande i Material, eller godkänn en sådan retur från platsen i Granska.`
    : `${cap(seatWords(target))} har ingen slutbild för ${genitive(dealerName)} giv från ankare ${from}: ingen landningsbild gäller för platsen, och banken har ingen egen film dit vars retur du har godkänt rakt. Gör en landningsbild för platsen gällande i Material, eller godkänn en retur från platsen i Granska.`;
/** "landningsbilden Plats 4, landning" or "ruta 126 ur paow-giv-2-2-p4-01-01, där returen börjar": a seat's end picture in words. */
export const seatEndWords = (end: SeatEnd<{ name?: string }> | null): string => (!end ? 'ingen slutbild' : end.kind === 'LANDNING' ? `landningsbilden${end.entry.name ? ` ${end.entry.name}` : ''}` : cutFrameWords(end.cut));
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
/** A take the bank has set aside for good (review.archived, written from Karta): never a reference film, never a last frame. */
export const isArchived = (bank: Pick<BankFacts, 'motions'>, id: string): boolean => !!bank.motions?.[id]?.review?.archived;

/** A reference sends the whole file, so an archived segment blocks its source and the source's corrected copies. */
export function archivedReferenceIds(bank: Pick<BankFacts, 'motions' | 'derived' | 'edits'>): Set<string> {
  const ids = new Set(Object.keys(bank.motions ?? {}).filter((id) => isArchived(bank, id)));
  const dependents = new Map<string, string[]>();
  const link = (source: string, id: string) => {
    const children = dependents.get(source);
    if (children) children.push(id);
    else dependents.set(source, [id]);
  };
  for (const take of bank.derived ?? []) {
    if (isArchived(bank, take.id)) ids.add(take.clip);
    link(take.clip, take.id);
    // register-order --fixed names the original segment, but a reference sends the whole corrected file.
    if (typeof take.editOf === 'string') link(take.editOf, take.clip);
  }
  for (const edit of bank.edits ?? []) {
    if (typeof edit.source?.clip === 'string') link(edit.source.clip, edit.id);
  }
  // The set visits newly added ids once, even if edit provenance contains a cycle.
  for (const id of ids) {
    for (const dependent of dependents.get(id) ?? []) ids.add(dependent);
  }
  return ids;
}

/** "ruta 126 ur paow-giv-2-2-p4-01-01, där returen börjar (Jakobs ja: …)". */
export const cutFrameWords = (c: Pick<CutFrame, 'clip' | 'frame' | 'words'>) => `ruta ${c.frame} ur ${c.clip}, där returen börjar${c.words ? ` (Jakob: ”${c.words}”)` : ''}`;

/** "Paows", "Agnes". */
export const genitive = (name: string) => (/[sxz]$/i.test(name) ? name : `${name}s`);
/** "plats 4", "plats 4, andra kortet", "dealerns plats". */
export function seatWords(target: string | null | undefined): string {
  const m = /^P(\d)\.C(\d)$/.exec(target ?? '');
  if (m) return `plats ${m[1]}${m[2] === '1' ? '' : ', kort ' + m[2]}`;
  // The dealer's second card is the hole card (it lands closed); her first keeps the words it was ordered with.
  if (target === 'D.C2') return 'dealerns hålkort';
  if (target === 'D.C3') return 'dealerns tredje kort';
  return /^D\./.test(target ?? '') ? 'dealerns plats' : 'platsen';
}
/**
 * What an order makes, in one line: the pictures it goes between and nothing of how she moves (Jakob 2026-11-17: only what is
 * sent to Runway is described; the movement is said by the text that is sent and by nothing else). "Gör en film av Paow: ett
 * kort från ankare 2.1 till plats 4, bara dit." Shown on the order's card and at the top of "Det här skickas"; an order
 * stored before 2026-11-18 keeps the line it was made with.
 */
export type SummaryMotion = Pick<Motion, 'target'>;
export function summaryOf(step: Pick<StepDef, 'key'>, dealerName: string, motion: SummaryMotion | null, shape: Shape | null = null): string {
  const def = stepOf(step.key);
  if (!def) return '';
  const seat = seatWords(motion?.target);
  if (def.kind === 'STILL') return `Gör ${genitive(dealerName)} ${def.makes?.label ?? 'ankare'} ur hennes ankare ${def.from}.`;
  if (def.cards?.length) return `Gör en film av ${dealerName}: hålkortet vänds upp, från och till ankare ${def.from}.`;
  if (def.card && def.start === 'LAND') return `Gör en film av ${dealerName}: från kortet på ${seat} till ankare ${def.to ?? def.from}.`;
  if (def.card) return `Gör en film av ${dealerName}: ett kort från ankare ${def.from} till ${seat}, ${shape === 'ONE_WAY' ? 'bara dit' : 'tur och retur'}.`;
  if (!def.to || def.to === def.from) return `Gör en vilofilm av ${dealerName}: från och till ankare ${def.from}.`;
  return `Gör en film av ${dealerName}: från ankare ${def.from} till ankare ${def.to}.`;
}
/** The graph's node of an anchor ("2.1" → READY). */
export const ANCHOR_NODE: Record<Anchor, string> = { '1': 'IDLE', '2.1': 'READY', '2.2': 'READY-B', '2.3': 'READY-C' };
/** The register's role of an anchor. */
export const ANCHOR_ROLE: Record<Anchor, string> = { '1': 'ankare-1', '2.1': 'ankare-2.1', '2.2': 'ankare-2.2', '2.3': 'ankare-2.3' };
/** The edge a film step is filed under, in the graph's notation: READY>P4.C1, IDLE>READY. */
export function edgeOf(step: StepDef, target: string | null): string | null {
  if (step.kind !== 'FILM') return null;
  if (step.edge) return step.edge;
  if (step.card && target) return step.start === 'LAND' ? `${target}>${ANCHOR_NODE[step.to ?? step.from]}` : step.to === '1' ? `${target}>IDLE` : `${ANCHOR_NODE[step.from]}>${target}`;
  return `${ANCHOR_NODE[step.from]}>${ANCHOR_NODE[step.to ?? step.from]}`;
}
/** The bank's edges a film is cut into: a round trip gives the deal and the return, every other film its one edge. */
export function cutIntoOf(step: StepDef, target: string | null, shape: Shape | null): string[] {
  if (step.kind !== 'FILM' || !step.card || !target) return [];
  const edge = edgeOf(step, target)!;
  return step.start !== 'LAND' && shape !== 'ONE_WAY' ? [edge, `${target}>${ANCHOR_NODE[step.from]}`] : [edge];
}
/** The cards a deal can be ordered to: the first card of every seat, the dealer's first, and her hole card (lands closed). */
export const SEAT_TARGETS = ['P1.C1', 'P2.C1', 'P3.C1', 'P4.C1', 'P5.C1', 'P6.C1', 'P7.C1', 'D.C1', 'D.C2', 'D.C3'];
/** "Alla sju": the first card to every player. */
export const ALL_SEVEN = SEAT_TARGETS.filter((t) => t.startsWith('P'));
/** "plats 1, 2 och 3", "plats 1–7", "dealerns plats". */
export function seatList(targets: readonly string[]): string {
  const n = targets.map((t) => /^P(\d)\.C1$/.exec(t)?.[1]).filter((x): x is string => !!x).map(Number).sort((a, b) => a - b);
  const rest = targets.filter((t) => !/^P\d\.C1$/.test(t)).map(seatWords);
  const run = n.length > 2 && n.every((v, i) => !i || v === n[i - 1] + 1) ? [`${n[0]}–${n[n.length - 1]}`] : n.map(String);
  const words = [...(run.length ? [`plats ${run.length > 1 ? `${run.slice(0, -1).join(', ')} och ${run[run.length - 1]}` : run[0]}`] : []), ...rest];
  return words.length > 1 ? `${words.slice(0, -1).join(', ')} och ${words[words.length - 1]}` : (words[0] ?? '');
}

// ── The plan as an order sees it (GET /api/orders: plan) ────────────────────
/**
 * One card of the placement plan in film pixels: its centre and outline (drawn as the last picture draws it), what
 * Placering says about it (how it lands, which hand, handbyte, grip, where and how it turns), and whether the left hand from the
 * shoe would cross her body to lay it there (crossesBody).
 */
export type SeatPlan = {
  target: string;
  centre: [number, number];
  quad: [number, number][];
  side: 'FRONT' | 'BACK';
  startSide: 'FRONT' | 'BACK';
  hand: 'LH' | 'RH';
  pass: boolean;
  grip: 'PINCH' | 'DRAG';
  turnAt: 'AIR' | 'PLACE';
  /** How it is turned on the way (the plan's flipAxis): FREE, the wrist; LONG_EDGE, like a key. */
  flipAxis: 'FREE' | 'LONG_EDGE';
  crosses: boolean;
};
export type PlanAnswer = { path: string; sha256: string; updatedAt: string | null; midline: number; halfCard: number; seats: Record<string, SeatPlan> };
/**
 * Her midline and half a card, from the plan alone: the dealer's own two cards lie centred in front of her (D.C1 and
 * D.C2, x 850 and 912 in the plan of 2026-11-11; Paow's torso between the arms is centred at x 867 in her anchor 1), and
 * the card is the seat-4 card. Without them, the picture's middle and the plan's card of 87 px.
 */
export function bodyLine(centres: Readonly<Record<string, readonly [number, number]>>, quads: Readonly<Record<string, readonly (readonly [number, number])[]>>): { midline: number; halfCard: number } {
  const own = ['D.C1', 'D.C2'].map((t) => centres[t]).filter(Boolean);
  const midline = own.length ? own.reduce((s, c) => s + c[0], 0) / own.length : 1763 / 2;
  const q = quads['P4.C1'];
  const halfCard = q ? (Math.max(...q.map((p) => p[0])) - Math.min(...q.map((p) => p[0]))) / 2 : 43.5;
  return { midline: Math.round(midline * 10) / 10, halfCard: Math.round(halfCard * 10) / 10 };
}
/**
 * The left hand comes from the shoe at the right of the picture. A card that lands left of her midline by more than half a
 * card makes it reach across her body (P1–P3 in the plan of 2026-11-11; P4 lies in front of her). A fact about the seat,
 * shown where a seat is chosen; nothing is set or suggested by it (a handbyte fell in its trials and is no default).
 */
export const crossesBody = (x: number, line: { midline: number; halfCard: number }) => x < line.midline - line.halfCard;

// ── Models: what each takes (from the tools' schemas, 2026-11-12; Kling 3.0 4K 2026-11-13) ──
/**
 * A model as the sheet offers it and the store sends it. durations, resolutions: what the tool takes. frames: it takes a
 * last picture with the first, so it can make every film step here; middle: a reference picture beside them; videos: a
 * reference film beside them. ratio: the ratio always sent with it; without one none goes out, and shape says what the
 * film's shape is then. audio: always on (no generateAudio: the tool refuses false), off (generateAudio: false goes out) or
 * none (a still). about: one line in the sheet; note: what to know, on "Det här skickas"; delivered: when the film does not
 * come in the bank's frame. A new model is one entry here and its price in data/order-policy.json.
 */
export type ModelDef = {
  id: string;
  tool: Generation['tool'];
  label: string;
  durations?: [number, number];
  resolutions?: string[];
  frames?: boolean;
  middle?: boolean;
  videos?: boolean;
  /** The length a reference film may have, in seconds (Kling 4: 3–30 s each, Runway's schema 2026-11-13). */
  referenceSeconds?: [number, number];
  ratio?: string;
  shape?: string;
  audio: 'always' | 'off' | 'none';
  about: string;
  note: string;
  delivered?: string;
  /** Why it is not offered for a new order (an order made with it still reads and validates). */
  off?: string;
};
export const MODELS: Record<string, ModelDef> = {
  'kling-4': { id: 'kling-4', tool: 'generate_video', label: 'Kling 4', durations: [3, 30], resolutions: ['720p', '1080p'], frames: true, middle: true, videos: true, referenceSeconds: [3, 30], shape: 'följer första bilden', audio: 'always', about: 'Ljudet alltid på; tas bort efteråt.', note: 'Följer första och sista bild; ljudet är alltid på och tas bort i efterarbetet.' },
  wan3: { id: 'wan3', tool: 'generate_video', label: 'WAN 3', durations: [2, 30], resolutions: ['480p', '720p', '1080p'], frames: true, middle: false, videos: false, ratio: 'adaptive', audio: 'off', about: 'Ger bankens 1764 × 1174 direkt.', note: 'Två bilder och en text; ratio adaptive ger bankens 1764 × 1174.' },
  // Runway's generate_video schema 2026-11-13: 3–15 s, resolution fixed 4k ("omit or pass 4k"), audio optional, no reference
  // pictures or films. Its model table says it takes an end frame; the endFrame field's own list of models leaves it out.
  'kling-3-4k': {
    id: 'kling-3-4k', tool: 'generate_video', label: 'Kling 3.0 4K', durations: [3, 15], resolutions: ['4k'], frames: true, middle: false, videos: false, audio: 'off',
    shape: 'okänt om 4K-filmen följer första bildens form eller kommer i 16:9 (3840 × 2160)',
    about: 'Ljudet av; skalas till bankens 1764 × 1174 efteråt.',
    note: 'Verktygets schema 2026-11-13: 3–15 s, upplösningen fast 4k, ljud valbart (här av), inga referensbilder eller referensfilmer. Osäkert: modelltabellen säger att den tar sista bild (Runways API-sida likaså), men endFrame-fältets egen lista nämner den inte; vägrar verktyget blir tagningen misslyckad utan film. Schemat säger inte heller om filmen följer första bildens form eller kommer i 16:9.',
    delivered: 'Filmen levereras i 4K och skalas i efterarbetet till bankens 1764 × 1174; 4K-originalet sparas orört som source.mp4.',
    // Tried 2026-11-13 (paow-ingang-2-1-02): no sharper than WAN 3 in the bank's frame, softer tattoos, 172 credits against 80.
    off: 'Provad 2026-11-13 (paow-ingang-2-1-02): inte skarpare än WAN 3 i bankens ruta, mjukare tatueringar, 172 krediter mot 80. Jakob: ”det är dumt att ta ett klipp i 4K om övriga klipp inte är i 4K”.',
  },
  'nano-banana-pro': { id: 'nano-banana-pro', tool: 'generate_image', label: 'Nano Banana Pro', audio: 'none', about: 'Redigerar dealerns egen bild.', note: 'Redigering av dealerns egen bild med referensbilder (@tagg i texten).' },
};
/** The models that can make a step: a still the picture models, a film every model that takes a first and a last picture. */
export function modelsFor(step: Pick<StepDef, 'kind'>): ModelDef[] {
  return Object.values(MODELS).filter((m) => (step.kind === 'STILL' ? m.tool === 'generate_image' : m.tool === 'generate_video' && !!m.frames));
}
/** A model by its id when it can make the step, else null. Which model a step is ordered with is its recipe's (src/order-methods.ts). */
export function modelFor(step: Pick<StepDef, 'kind'>, id: string | null | undefined): ModelDef | null {
  return id ? (modelsFor(step).find((m) => m.id === id) ?? null) : null;
}
/**
 * The generation parameters by name, as the tool takes them, for a step made with a model: a still's ratio and size; a
 * film's resolution (the one asked for when the model takes it, else the model's last and highest), its length, and what
 * the model always gets (WAN 3: ratio adaptive; a model whose sound can be switched off: no sound).
 */
export function paramsOf(step: StepDef, model: ModelDef, choice: { duration?: number; resolution?: string | null } = {}): Record<string, string | number | boolean> {
  if (step.kind === 'STILL') return { ratio: step.ratio!, imageSize: step.imageSize! };
  const wanted = choice.resolution ?? '1080p';
  const resolution = !model.resolutions || model.resolutions.includes(wanted) ? wanted : model.resolutions[model.resolutions.length - 1];
  return { resolution, duration: choice.duration ?? model.durations?.[0] ?? 0, ...(model.ratio ? { ratio: model.ratio } : {}), ...(model.audio === 'off' ? { generateAudio: false } : {}) };
}
/** A length the model takes: the one asked for, brought within the model's range. */
export const lengthFor = (model: Pick<ModelDef, 'durations'>, seconds: number) => (model.durations ? Math.min(model.durations[1], Math.max(model.durations[0], seconds)) : seconds);
/**
 * The length of a film that follows a reference film: the reference's own, in whole seconds the model takes, never shorter
 * than the reference (the text says "with the same timing", and the reference ends as the last picture does, so a still
 * tail costs nothing while a cut end loses the lay). 3,97 s → 4; 4,2 s → 5.
 */
export const lengthOfReference = (model: Pick<ModelDef, 'durations'>, referenceSeconds: number) => lengthFor(model, Math.ceil(referenceSeconds - 0.1));

// ── A reference film from the bank ──────────────────────────────────────────
/** Jakob's verdict on a take of the bank, as it is shown beside a reference film. */
export type RefVerdict = 'GODKÄND' | 'VARIANT' | 'EJ_DÖMD' | 'UNDERKÄND';
export const REF_VERDICT_LABEL: Record<RefVerdict, string> = { GODKÄND: 'godkänd', VARIANT: 'variant', EJ_DÖMD: 'ej dömd', UNDERKÄND: 'underkänd' };
const VERDICT_RANK: Record<RefVerdict, number> = { GODKÄND: 0, VARIANT: 1, EJ_DÖMD: 2, UNDERKÄND: 3 };
/** How near a take is to what is ordered: the same step and seat, the same seat from another grip, the same step to another seat. */
export const REF_MATCH_LABEL = ['samma steg och plats', 'samma plats, annat grepp', 'samma steg, annan plats'] as const;
/** The bank as GET /api/clip-bank answers it (src/clip-graph.ts BankData), only what a reference needs. */
export type BankFacts = {
  jobs?: { id: string; from: string; to: string; duration?: number; dealer?: string }[];
  derived?: { id: string; from: string; to: string; clip: string; frames: [number, number]; dealer?: string; editOf?: string; kind?: string }[];
  edits?: { id: string; source?: { clip?: string }; dealer?: string }[];
  motions?: Record<string, { source?: { sha256?: string; fps?: number; frames?: number }; review?: { decision?: string; acceptedAs?: string; userAccepted?: boolean; userReview?: string; provisional?: unknown; archived?: unknown }; motion?: { releaseHand?: string } } | null | undefined>;
  media?: Record<string, { video?: string | null } | null | undefined>;
  /**
   * The check of a film as a reference (src/deal-check.ts checkReference), by film: one that fails it (the card on edge
   * before the turn, a colour change without an edge, larger than a real card) is not offered first.
   */
  referenceChecks?: Record<string, { pass: boolean; clean?: boolean; codes?: string[] } | null | undefined>;
  /**
   * Rendered reference films (trial 2C2, 2026-11-18): the 3D lane's dummy dealing to a seat as the bank's camera sees it,
   * its hand read off an approved deal of a real dealer, kept as assets/references/docka/<id>/source.mp4 with its receipt,
   * listed in a register of its own (data/rendered-references.json: the id, the edge it shows, the seat, the deal it is read
   * from, its hash, length and reference check). Offered before a take of the bank for the same step and seat: it has no
   * other dealer's hand in it, and it is made to pass the reference check (one turn, mid-way, a real card's size).
   */
  rendered?: RenderedReference[];
  /** The picture checks of cut frames, by cutCheckKey (data/cut-frames.json): a frame that does not hold is left out of cutFrameOf. */
  cutChecks?: Record<string, CutCheck>;
};
/** A rendered reference film as its register lists it (data/rendered-references.json, read by tools/order-store.ts). lays: the hand that lays the card (absent: the left). */
export type RenderedReference = { id: string; edge: string; path: string; sha256: string; seconds: number; fromDeal?: string; capture?: string; lays?: 'LH' | 'RH'; check?: { pass: boolean; clean?: boolean; codes?: string[] } | null };
/**
 * The pose with the card just drawn out onto the felt, which the bank's drag deals start from ("DRAWN>LAND(P4.C1)"): as a
 * reference such a film shows the drag to the seat, so it counts as a deal from anchor 2.2 (trial 2A, 2026-11-17, held with one).
 */
const DRAWN_AS = 'READY-B';
/**
 * A take of the bank that can go as a reference film: the take, the film it lies in (assets/motions/<film>/source.mp4;
 * a take cut from a longer film sends the whole film, and `frames` says which part is the take, `also` the other takes
 * cut from it), whose it is, Jakob's verdict and his words, the film's length and whether the model takes that length.
 */
export type RefCandidate = {
  take: string; film: string; path: string; dealer: string; edge: string; goesTo: string | null;
  /** RENDERED: the dummy's film for the seat (BankFacts.rendered), read off a real deal; BANK: a take of the bank. */
  kind?: 'BANK' | 'RENDERED';
  /** For a rendered film: the deal its hand is read off. */
  fromDeal?: string | null;
  match: 0 | 1 | 2; verdict: RefVerdict; approvedStraight: boolean; words: string | null;
  /** The reference check of its film, where one has been run: whether it passes and the codes of what fails or is remarked. */
  check?: { pass: boolean; clean?: boolean; codes?: string[] } | null;
  /** The hand that lays the card in the film (the bank's motion.releaseHand; the left where nothing is said). */
  lays?: 'LH' | 'RH';
  seconds: number | null; frames: [number, number] | null; also: string[]; fits: boolean; sha256: string | null;
};
/** Jakob's verdict from a take's review: underkänd, godkänd straight or as a variant, else not judged; his words without the date. */
export function verdictOf(review: { decision?: string; acceptedAs?: string; userAccepted?: boolean; userReview?: string } | null | undefined): { verdict: RefVerdict; straight: boolean; words: string | null } {
  const words = typeof review?.userReview === 'string' ? review.userReview.replace(/^\S+ \d{4}-\d{2}-\d{2}: /, '').trim() || null : null;
  const d = review?.decision;
  if (d === 'REJECTED') return { verdict: 'UNDERKÄND', straight: false, words };
  if (d === 'ACCEPTED' || d === 'MAIN') return review?.acceptedAs === 'VARIANT' ? { verdict: 'VARIANT', straight: false, words } : { verdict: 'GODKÄND', straight: review?.userAccepted === true, words };
  return { verdict: 'EJ_DÖMD', straight: false, words };
}
/** The edge a film step shows, in the graph's notation: a deal from its anchor to the seat, a return from the seat to its anchor, else anchor to anchor. */
export function wantedEdge(step: StepDef, target: string | null): string | null {
  if (step.kind !== 'FILM') return null;
  if (step.edge) return step.edge;
  if (step.card) return target ? edgeOf(step, target) : null;
  return `${ANCHOR_NODE[step.from]}>${ANCHOR_NODE[step.to ?? step.from]}`;
}
/**
 * The bank's takes a reference film can be chosen from for a step: takes of the same step and seat first, then the same
 * seat from another grip, then the same step to another seat. Within that a take Jakob has rejected comes last, the
 * dealer's own before another dealer's, then by his verdict. One per film (the best placed take names it). A film with an
 * archived take is never offered because the whole file goes out.
 */
export function referenceCandidates(bank: BankFacts, want: { dealer: string; step: StepDef; target: string | null; model?: Pick<ModelDef, 'referenceSeconds'> | null }): RefCandidate[] {
  const w = parseEdge(wantedEdge(want.step, want.target) ?? '');
  if (!w) return [];
  const owners = dealersOf(bank as never);
  const jobs = bank.jobs ?? [], derived = bank.derived ?? [], edits = bank.edits ?? [];
  const archived = archivedReferenceIds(bank);
  const byId = new Map(jobs.map((j) => [j.id, j]));
  const takes = [
    ...jobs.map((j) => ({ id: j.id, from: j.from, to: j.to, film: j.id, frames: null as [number, number] | null })),
    ...edits.flatMap((x) => { const src = byId.get(x.source?.clip ?? ''); return src ? [{ id: x.id, from: src.from, to: src.to, film: x.id, frames: null }] : []; }),
    ...derived.map((d) => ({ id: d.id, from: d.from, to: d.to, film: d.clip, frames: d.frames })),
  ];
  const range = want.model?.referenceSeconds ?? null;
  const out: RefCandidate[] = [];
  for (const t of takes) {
    const e = parseEdge(`${t.from === 'DRAWN' ? DRAWN_AS : t.from}>${t.to}`);
    if (!e || typeof t.film !== 'string') continue;
    const sameHub = w.kind === 'RETURN' ? e.to === w.to : e.from === w.from;
    const match = e.id === w.id ? 0 : e.base === w.base ? 1 : e.kind === w.kind && sameHub && w.target && e.target && e.target !== w.target ? 2 : null;
    if (match === null) continue;
    if (bank.media && t.id in bank.media && !bank.media[t.id]?.video) continue;
    if (archived.has(t.id) || archived.has(t.film)) continue;
    const record = bank.motions?.[t.id], source = record?.source ?? bank.motions?.[t.film]?.source;
    const seconds = source?.frames && source.fps ? Math.round((source.frames / source.fps) * 1000) / 1000 : (byId.get(t.film)?.duration ?? null);
    const whole = !t.frames || !source?.frames || (t.frames[0] <= 0 && t.frames[1] >= source.frames - 1);
    const { verdict, straight, words } = verdictOf(record?.review);
    out.push({
      take: t.id, film: t.film, path: `assets/motions/${t.film}/source.mp4`, dealer: owners[t.id] ?? 'pamela', edge: `${t.from}>${t.to}`, goesTo: e.target,
      match, verdict, approvedStraight: straight, words, seconds, frames: whole ? null : t.frames, also: derived.filter((d) => d.clip === t.film && d.id !== t.id).map((d) => d.id),
      fits: !range || (seconds !== null && seconds >= range[0] && seconds <= range[1]), sha256: source?.sha256 ?? null,
      check: bank.referenceChecks?.[t.film] ?? null, lays: record?.motion?.releaseHand === 'RH' ? 'RH' : 'LH',
    });
  }
  // A film whose reference check fails comes after every one that passes or is not checked, within its match.
  const key = (c: RefCandidate) => [c.match, c.verdict === 'UNDERKÄND' ? 1 : 0, c.check && !c.check.pass ? 1 : 0, c.dealer === want.dealer ? 0 : 1, VERDICT_RANK[c.verdict]];
  // The dummy's films for the step and seat, first within their match (they need no verdict: nothing of a dealer is in them).
  // Of two films of the same edge the one listed later comes first: a film made again is listed after the one it replaces.
  const listed = new Map((bank.rendered ?? []).map((r, i) => [r.id, i]));
  for (const r of bank.rendered ?? []) {
    const e = parseEdge(r.edge);
    if (!e) continue;
    const match = e.id === w.id ? 0 : e.base === w.base ? 1 : null;
    if (match === null) continue;
    out.push({ take: r.id, film: r.id, path: r.path, dealer: 'docka', edge: r.edge, goesTo: e.target, kind: 'RENDERED', fromDeal: r.fromDeal ?? null, match, verdict: 'EJ_DÖMD', approvedStraight: false, words: null,
      check: r.check ?? null, lays: r.lays ?? 'LH', seconds: r.seconds, frames: null, also: [], fits: !range || (r.seconds >= range[0] && r.seconds <= range[1]), sha256: r.sha256 });
  }
  const rank = (c: RefCandidate) => [c.match, c.kind === 'RENDERED' ? 0 : 1, ...key(c).slice(1)];
  out.sort((a, b) => { const ka = rank(a), kb = rank(b); for (let i = 0; i < ka.length; i++) if (ka[i] !== kb[i]) return ka[i] - kb[i]; if (a.kind === 'RENDERED' && b.kind === 'RENDERED') return (listed.get(b.take) ?? 0) - (listed.get(a.take) ?? 0); return a.take.localeCompare(b.take); });
  const films = new Set<string>();
  return out.filter((c) => (films.has(c.film) ? false : (films.add(c.film), true)));
}
/** "7,04 s", "4 s". */
export const secondsWords = (s: number | null | undefined) => (s === null || s === undefined ? 'okänd längd' : `${String(Math.round(s * 100) / 100).replace('.', ',')} s`);

// ── Policy and prices (data/order-policy.json) ──────────────────────────────
export type Price = { model: string; resolution?: string; imageSize?: string; perSecond?: number; perImage?: number; listedPerSecond?: number; source: string };
export type OrderMandate = {
  id: string;
  startsAt: string;
  endsAt: string;
  rollingHourCredits: number;
  totalCredits: number;
};
export type MandateBudget = {
  status: 'active' | 'before-start' | 'expired' | 'missing' | 'unreadable';
  mandate: OrderMandate | null;
  at: string;
  hourlyReserved: number;
  totalReserved: number;
  available: number;
};

export type Policy = {
  schemaVersion: 1;
  enabled: boolean;
  dailyCapCredits: number;
  maxPerOrder: number;
  minBalance: number;
  mandate?: OrderMandate;
  /** Live values from this checkout's own reservations. This is only set on the server's policy response. */
  mandateBudget?: MandateBudget;
  timeZone: string;
  balance: { credits: number; at: string; source: string };
  prices: Price[];
};

/** The price of one take, and the worst case (the tool's listed price where it is higher than the ledgers'). */
export function priceOf(generation: Pick<Generation, 'model' | 'params'>, prices: readonly Price[]): { perTake: number; worstPerTake: number; basis: string } | null {
  const { model, params } = generation;
  const p = prices.find((x) => x.model === model && (x.resolution === undefined || x.resolution === params.resolution) && (x.imageSize === undefined || x.imageSize === params.imageSize));
  if (!p) return null;
  if (p.perImage !== undefined) return { perTake: p.perImage, worstPerTake: p.perImage, basis: `${p.perImage} krediter per bild. ${p.source}` };
  const seconds = Number(params.duration);
  if (!p.perSecond || !(seconds > 0)) return null;
  const perTake = Math.ceil(seconds * p.perSecond - 1e-9);
  const worstPerTake = Math.ceil(seconds * Math.max(p.perSecond, p.listedPerSecond ?? 0) - 1e-9);
  return { perTake, worstPerTake, basis: `${String(p.perSecond).replace('.', ',')} krediter per s × ${seconds} s. ${p.source}` };
}

export function costOf(generation: Pick<Generation, 'model' | 'params'>, takes: number, prices: readonly Price[]): Order['cost'] | null {
  const price = priceOf(generation, prices);
  if (!price) return null;
  return { perTake: price.perTake, total: price.perTake * takes, worstPerTake: price.worstPerTake, worstTotal: price.worstPerTake * takes, basis: price.basis };
}

/** The calendar day of a moment in the policy's time zone: "2026-11-12". */
export function dayOf(iso: string, timeZone = 'Europe/Stockholm'): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat('sv-SE', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
}

/** Credits committed on a day: the worst-case total of every order approved that day. */
export function spentOn(orders: readonly Pick<Order, 'approval' | 'cost' | 'status'>[], day: string, timeZone = 'Europe/Stockholm'): number {
  return orders.filter((o) => o.approval && o.status !== 'AVBRUTEN' && dayOf(o.approval.at, timeZone) === day).reduce((sum, o) => sum + o.cost.worstTotal, 0);
}

export type PolicyCheck = { ok: boolean; refusals: string[]; spentToday: number; afterToday: number; balance: number; balanceAfter: number };
function mandateWords(budget: MandateBudget): string {
  if (budget.status === 'missing') return 'Inget giltigt beställningsmandat. Nya betalda anrop är spärrade.';
  if (budget.status === 'unreadable') return 'Mandatet eller dess orderkvitton kunde inte verifieras. Nya betalda anrop är spärrade.';
  const mandate = budget.mandate!;
  if (budget.status === 'before-start') return `Mandatet börjar ${mandate.startsAt}. Nya betalda anrop är spärrade fram till dess.`;
  if (budget.status === 'expired') return `Mandatet löpte ut ${mandate.endsAt}. Nya betalda anrop är spärrade.`;
  return `Mandat: ${credits(Math.max(0, mandate.rollingHourCredits - budget.hourlyReserved))} av ${credits(mandate.rollingHourCredits)} kvar denna rullande timme · ${credits(Math.max(0, mandate.totalCredits - budget.totalReserved))} av ${credits(mandate.totalCredits)} kvar totalt · till ${mandate.endsAt}.`;
}

export function mandateRefusal(budget: MandateBudget, cost: number): string | null {
  if (budget.status !== 'active') return mandateWords(budget);
  return Number.isFinite(cost) && cost > 0 && cost <= budget.available
    ? null
    : `Kostnaden ${credits(cost)} krediter ryms inte. ${mandateWords(budget)}`;
}

/** Whether the policy lets this order be approved now. The worst-case cost counts. */
export function checkPolicy(order: Pick<Order, 'cost'>, policy: Policy, spentToday: number, balance: number): PolicyCheck {
  const cost = order.cost.worstTotal, refusals: string[] = [];
  if (!policy.enabled) refusals.push('Beställningar är avstängda (enabled: false i data/order-policy.json).');
  if (cost > policy.maxPerOrder) refusals.push(`Beställningen kostar upp till ${cost} krediter; taket per beställning är ${policy.maxPerOrder}.`);
  if (spentToday + cost > policy.dailyCapCredits) refusals.push(`I dag är ${spentToday} av ${policy.dailyCapCredits} krediter intecknade; den här skulle ta det till ${spentToday + cost}.`);
  if (policy.mandateBudget) {
    const refusal = mandateRefusal(policy.mandateBudget, cost);
    if (refusal) refusals.push(refusal);
  }
  if (balance - cost < policy.minBalance) refusals.push(`Saldot ${balance} minus ${cost} går under golvet ${policy.minBalance}.`);
  return { ok: refusals.length === 0, refusals, spentToday, afterToday: spentToday + cost, balance, balanceAfter: balance - cost };
}

/**
 * A group of drafts (one per seat) against the policy: what all of them cost, and how many of them can be approved today
 * (each approval counts its worst case against the day's cap) and above the balance's floor. The limits are Jakob's
 * (data/order-policy.json); this only says where a group stands against them.
 */
export type GroupBudget = { count: number; total: number; worstTotal: number; overPerOrder: boolean; fitToday: number; fitBalance: number; words: string[] };
export function groupBudget(cost: Pick<Order['cost'], 'total' | 'worstTotal'>, count: number, policy: Pick<Policy, 'enabled' | 'dailyCapCredits' | 'maxPerOrder' | 'minBalance' | 'mandateBudget'>, spentToday: number, balance: number): GroupBudget {
  const worst = cost.worstTotal, overPerOrder = worst > policy.maxPerOrder;
  const fit = (room: number) => (worst > 0 ? Math.max(0, Math.min(count, Math.floor(room / worst))) : count);
  const dayFit = fit(policy.dailyCapCredits - spentToday);
  const mandate = policy.mandateBudget;
  const fitToday = !policy.enabled || overPerOrder ? 0 : mandate ? Math.min(dayFit, fit(mandate.available)) : dayFit;
  const fitBalance = fit(balance - policy.minBalance);
  const words: string[] = [];
  if (!policy.enabled) words.push('Beställningar är avstängda (enabled: false i data/order-policy.json): inget kan godkännas.');
  else if (overPerOrder) words.push(`Varje utkast kostar upp till ${credits(worst)} krediter; taket per beställning är ${credits(policy.maxPerOrder)}, så inget av dem kan godkännas.`);
  else if (mandate) {
    words.push(mandateWords(mandate));
    if (mandate.status === 'active' && fitToday < count) words.push(`Utrymmet räcker till ${fitToday} av ${count} utkast.`);
  }
  else if (fitToday < count) words.push(`Dagens tak är ${credits(policy.dailyCapCredits)} krediter (${credits(spentToday)} intecknade): räcker till ${fitToday} av ${count} i dag; resten kan godkännas en annan dag.`);
  else words.push(`Ryms i dagens tak: ${credits(spentToday + worst * count)} av ${credits(policy.dailyCapCredits)} krediter.`);
  if (policy.enabled && fitBalance < count) words.push(`Saldot ${credits(balance)} räcker till ${fitBalance} av ${count} över golvet ${credits(policy.minBalance)}.`);
  if (count > 1 && policy.enabled && !overPerOrder) words.push('Varje utkast godkänns för sig i Det här skickas.');
  return { count, total: cost.total * count, worstTotal: worst * count, overPerOrder, fitToday, fitBalance, words };
}

// ── What goes out ───────────────────────────────────────────────────────────
/** A local picture or film in the call: the ordering agent uploads the file and puts its hosted address here. */
export const fileRef = (name: string) => `$file:${name}`;
export type Request = { tool: Generation['tool']; args: Record<string, unknown> };

/**
 * The exact call for one take (1-based): the tool and its arguments, with $file:<name> where an uploaded address goes.
 * Take 2 and later carry confirmRepeat (otherwise the tool returns the earlier task for an identical request).
 */
export function requestOf(order: Pick<Order, 'generation' | 'pictures' | 'reference' | 'prompt'>, take: number): Request {
  const { tool, model, params } = order.generation;
  const args: Record<string, unknown> = { model, promptText: order.prompt.text, ...params };
  const start = order.pictures.find((p) => p.goesAs === 'startFrame');
  const end = order.pictures.find((p) => p.goesAs === 'endFrame');
  const refs = order.pictures.filter((p) => p.goesAs === 'referenceImage');
  if (start) args.startFrame = { url: fileRef(start.name) };
  if (end) args.endFrame = { url: fileRef(end.name) };
  if (refs.length) args.referenceImages = refs.map((p) => (p.tag ? { url: fileRef(p.name), tag: p.tag } : { url: fileRef(p.name) }));
  if (order.reference.status === 'FINNS') args.referenceVideos = [{ url: fileRef(order.reference.path.split('/').pop()!), durationSeconds: order.reference.seconds }];
  if (tool === 'generate_image') args.count = 1;
  if (take > 1) args.confirmRepeat = true;
  return { tool, args };
}

// ── The hash the approval freezes ───────────────────────────────────────────
/** Keys sorted at every level, so that the same content always gives the same text. */
export function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') {
    const o = value as Record<string, unknown>;
    return `{${Object.keys(o).filter((k) => o[k] !== undefined).sort().map((k) => `${JSON.stringify(k)}:${canonical(o[k])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}
/** What the approval's orderSha256 is the hash of: everything in the order but approval and status. */
export function hashInput(order: Order): string {
  const { approval: _approval, status: _status, ...rest } = order;
  return canonical(rest);
}

// ── State ───────────────────────────────────────────────────────────────────
export const waitingOf = (order: Pick<Order, 'pictures'>): Waits[] => order.pictures.filter((p) => p.waits && !p.path).map((p) => p.waits!);
/** "ankare 2.1", "ankare 2.1 och mellanbilden". */
export function waitWords(waits: readonly Waits[]): string {
  const labels = [...new Set(waits.map((w) => w.label))];
  return labels.length <= 1 ? (labels[0] ?? '') : `${labels.slice(0, -1).join(', ')} och ${labels[labels.length - 1]}`;
}
export type {ReviewEvidence} from './review-evidence.ts';
export type Receipt = {
  schemaVersion: 1;
  order: string;
  orderSha256: string;
  /**
   * review: the independent reviewer's verdict recorded beside the take's state, at any state from HÄMTAD on, without
   * moving it (node tools/order-put.ts review); the protocol reads it as the reviewer's note when it is the newest.
   */
  takes: { take: number; status: TakeStatus; requestedAt: string | null; taskId: string | null; reservation?: { mandateId: string; credits: number }; creditsRemainingAfter?: number | null; error?: string | null; file?: string | null; sha256?: string | null; review?: { at: string; note: string; evidence?: ReviewEvidence } | null; history: { at: string; status: TakeStatus; note?: string }[] }[];
};
/** The takes of an approved order as they stand: a take the receipt does not name waits in the queue. */
export function takeStates(order: Pick<Order, 'takes'>, receipt: Receipt | null): TakeStatus[] {
  return Array.from({ length: order.takes }, (_, i) => receipt?.takes.find((t) => t.take === i + 1)?.status ?? 'GODKÄND');
}
/** The one status shown for an order: the least advanced of its takes once approved (a failure or doubt first). */
export function shownOf(order: Order, problems: readonly string[], receipt: Receipt | null): Shown {
  if (order.status === 'AVBRUTEN') return 'AVBRUTEN';
  if (!order.approval) return waitingOf(order).length ? 'VÄNTAR' : problems.length ? 'UTKAST' : 'KLAR_ATT_TRYCKA';
  const states = takeStates(order, receipt);
  for (const s of ['OSÄKER', 'MISSLYCKAD'] as const) if (states.includes(s)) return s;
  const live = states.filter((s) => s !== 'AVBRUTEN');
  if (!live.length) return 'AVBRUTEN';
  return live.reduce((a, b) => (TAKE_FLOW.indexOf(a as (typeof TAKE_FLOW)[number]) <= TAKE_FLOW.indexOf(b as (typeof TAKE_FLOW)[number]) ? a : b));
}

/** What keeps a draft from being approved, in words (pictures waiting, files missing, text missing). Pure part only. */
export const RETURN_23_BLOCK = 'Returprovet kan inte godkännas ännu: sista styrbilden är ankare 2.3 utan det utdelade kortet. Först måste det visas att kortet ligger kvar genom returen.';
export const SHORT_TWO_HAND_TURN_HELP = 'KORT för GIV-2.3 vänder över kortänden. Välj MINIMAL för att låta referensfilmen styra vändningen.';

export function shortTwoHandTurnProblem(step: StepKey, style: TextStyle | undefined, turn: boolean | undefined, axis: FlipAxis | null | undefined): string | null {
  if (step !== 'GIV-2.3' || style !== 'KORT' || !turn || !axis || axis === 'FREE') return null;
  return `Vald vändning är ${axis}. ${SHORT_TWO_HAND_TURN_HELP}`;
}

export function twoHandDealSideProblem({ step, motion }: Pick<Order, 'step' | 'motion'>): string | null {
  if (step.key !== 'GIV-2.3' || !motion || motion.turn === (motion.side === 'FRONT')) return null;
  return 'GIV-2.3 börjar med ett gult kort i skon. Vändningen stämmer inte med sidan i slutbilden. Gör ett nytt utkast.';
}

export function twoHandDraftProblem({ status, approval, step, motion }: Pick<Order, 'status' | 'approval' | 'step' | 'motion'>): string | null {
  if (status !== 'UTKAST' || approval || !motion) return null;
  const hands = twoHandMotion(step.key, motion.grip);
  if (!hands || (motion.hand === hands.hand && motion.pass === hands.pass)) return null;
  return 'GIV-2.3 har ett handbyte från vänster till höger. Uppdatera utkastet med Hämta bilderna före godkännande.';
}

export function draftProblems(order: Order): string[] {
  const out: string[] = [];
  if (order.step.key === 'RETUR-2.3') out.push(RETURN_23_BLOCK);
  if (order.status === 'UTKAST') {
    const problem = twoHandDealSideProblem(order) ?? shortTwoHandTurnProblem(order.step.key, order.prompt.style, order.motion?.turn, order.motion?.flipAxis);
    if (problem) out.push(problem);
  }
  const hands = twoHandDraftProblem(order);
  if (hands) out.push(hands);
  const waits = waitingOf(order);
  if (waits.length) out.push(`Väntar på ${waitWords(waits)}.`);
  for (const p of order.pictures) if (!p.waits && (!p.path || !p.sha256)) out.push(`${p.label} saknas.`);
  if (order.reference.status === 'SAKNAS') out.push('Referensfilmen saknas: välj en eller ingen.');
  if (!order.prompt.text.trim()) out.push('Texten saknas.');
  return out;
}

// ── Check of an order file ──────────────────────────────────────────────────
const isObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const SHA = /^[0-9a-f]{64}$/;
export function validateOrder(value: unknown): { order: Order | null; errors: string[] } {
  const errors: string[] = [];
  if (!isObject(value)) return { order: null, errors: ['Beställningen är inte ett objekt.'] };
  const o = value as Partial<Order>;
  if (o.schemaVersion !== 1) errors.push('schemaVersion ska vara 1.');
  if (typeof o.id !== 'string' || !ORDER_ID.test(o.id) || o.id.length > 80) errors.push('id ska vara a–z, 0–9 och bindestreck.');
  if (typeof o.title !== 'string' || !o.title.trim() || o.title.length > 120) errors.push('title saknas eller är för lång.');
  if (o.summary !== undefined && (typeof o.summary !== 'string' || o.summary.length > 320)) errors.push('summary ska vara en rad text.');
  if (o.motion != null) {
    const m = o.motion as Partial<Motion>;
    if (!isObject(m) || !['PINCH', 'DRAG', 'TWO_HANDS'].includes(String(m.grip)) || !['LH', 'RH'].includes(String(m.hand)) || !['FRONT', 'BACK'].includes(String(m.side)) || typeof m.turn !== 'boolean' || (m.flipAxis !== null && !FLIP_AXES.includes(m.flipAxis as FlipAxis))) errors.push('motion: hand (LH/RH), side (FRONT/BACK), turn, flipAxis och grip (PINCH/DRAG/TWO_HANDS) krävs.');
    else if (m.planned !== undefined && (!isObject(m.planned) || Object.keys(m.planned).sort().join() !== 'flipAxis,grip' || !['PINCH', 'DRAG'].includes(String(m.planned.grip)) || (m.planned.flipAxis !== null && !FLIP_AXES.includes(m.planned.flipAxis as FlipAxis)))) errors.push('motion.planned: grip (PINCH/DRAG) och flipAxis (en vändning eller null), det Placering sa för kortet.');
    // A choice that does not apply is not stored (2026-11-13): no turn for a card that is not turned, no card size but on a
    // round trip's drawn last picture. Approved orders made before keep what they were approved with.
    else if (o.status !== 'GODKÄND' && !m.turn && m.flipAxis !== null) errors.push('motion.flipAxis: kortet vänds inte, så ingen vändning lagras (null).');
    else if (o.status !== 'GODKÄND' && m.turn && !m.flipAxis) errors.push('motion.flipAxis saknas: kortet vänds.');
    else if (m.cardScale !== undefined && isObject(o.step) && o.step.shape !== 'ROUND_TRIP') errors.push('motion.cardScale gäller bara tur och retur, där sista bilden ritas.');
    else if (m.pass !== undefined && (typeof m.pass !== 'boolean' || (m.pass && m.hand !== 'LH'))) errors.push('motion.pass: handbyte går från vänster hand till höger.');
    else if (m.cardScale !== undefined && !(CARD_SCALES as readonly number[]).includes(m.cardScale)) errors.push(`motion.cardScale ska vara ${CARD_SCALES.join(', ')}.`);
  }
  if (typeof o.dealer !== 'string' || !/^[a-z0-9]+$/.test(o.dealer)) errors.push('dealer ska vara ett id.');
  if (o.kind !== 'STILL' && o.kind !== 'FILM') errors.push('kind ska vara STILL eller FILM.');
  if (!isObject(o.step) || !stepOf(String(o.step.key))) errors.push('step.key är okänd.');
  if (!Array.isArray(o.pictures) || !o.pictures.length) errors.push('pictures saknas.');
  else {
    const names = new Set<string>();
    o.pictures.forEach((p, i) => {
      const at = `pictures[${i}]`;
      if (!isObject(p) || typeof p.name !== 'string' || !FILE_NAME.test(p.name)) return void errors.push(`${at}: name ska vara ett filnamn (a–z, 0–9, -, .png/.jpg).`);
      if (names.has(p.name)) errors.push(`${at}: ${p.name} finns två gånger.`);
      names.add(p.name);
      if (!['startFrame', 'endFrame', 'referenceImage'].includes(String(p.goesAs))) errors.push(`${at}: goesAs är okänd.`);
      if (p.path !== null && (typeof p.path !== 'string' || p.path !== `assets/orders/${o.id}/${p.name}`)) errors.push(`${at}: path ska vara assets/orders/<id>/${p.name} eller null.`);
      if (p.sha256 !== null && (typeof p.sha256 !== 'string' || !SHA.test(p.sha256))) errors.push(`${at}: sha256 ska vara 64 hextecken eller null.`);
      if ((p.path === null) !== (p.sha256 === null)) errors.push(`${at}: path och sha256 hör ihop.`);
      if (p.path === null && !p.waits) errors.push(`${at}: en bild utan fil måste vänta på något (waits).`);
      if (p.cut != null && (!isObject(p.cut) || !Array.isArray(p.cut.keep) || p.cut.keep.length < 3 || !p.cut.keep.every((q) => Array.isArray(q) && q.length === 2 && q.every(Number.isFinite)) || !SHA.test(String(p.cut.source?.sha256)))) errors.push(`${at}: cut.keep ska vara minst tre punkter, och cut.source.sha256 källans hash.`);
    });
    if (o.pictures.filter((p) => p?.goesAs === 'startFrame').length > 1 || o.pictures.filter((p) => p?.goesAs === 'endFrame').length > 1) errors.push('Högst en första och en sista bild.');
  }
  if (!isObject(o.generation) || o.generation.provider !== 'runway-app' || !MODELS[String(o.generation.model)]) errors.push('generation: okänd modell eller leverantör.');
  else {
    const m = MODELS[o.generation.model];
    if (o.generation.tool !== m.tool) errors.push(`generation.tool ska vara ${m.tool} för ${m.label}.`);
    if (!isObject(o.generation.params)) errors.push('generation.params saknas.');
    else {
      for (const key of ['promptText', 'startFrame', 'endFrame', 'referenceImages', 'referenceVideos', 'confirmRepeat', 'count']) if (key in o.generation.params) errors.push(`generation.params får inte ha ${key}: den sätts ur bilderna och texten.`);
      const d = o.generation.params.duration;
      if (m.durations && (typeof d !== 'number' || d < m.durations[0] || d > m.durations[1])) errors.push(`Längden ska vara ${m.durations[0]}–${m.durations[1]} s för ${m.label}.`);
      if (m.audio === 'always' && 'generateAudio' in o.generation.params) errors.push(`${m.label} tar inte generateAudio (ljudet är alltid på).`);
      if (Array.isArray(o.pictures) && !m.middle && o.kind === 'FILM' && o.pictures.some((p) => p?.goesAs === 'referenceImage')) errors.push(`${m.label} tar ingen mellanbild här.`);
      if (Array.isArray(o.pictures) && !m.frames && o.kind === 'FILM' && o.pictures.some((p) => p?.goesAs === 'endFrame')) errors.push(`${m.label} tar ingen sista bild.`);
      if (isObject(o.reference) && o.reference.status === 'FINNS' && !m.videos) errors.push(`${m.label} tar ingen referensfilm här.`);
      if (isObject(o.reference) && o.reference.status === 'FINNS' && m.videos) {
        const r = o.reference as Extract<Reference, { status: 'FINNS' }>;
        if (typeof r.path !== 'string' || !new RegExp(`^assets/orders/${o.id}/[a-z0-9][a-z0-9-]*\\.mp4$`).test(r.path) || !SHA.test(String(r.sha256))) errors.push('reference: filmen ska ligga i assets/orders/<id>/ med sin sha256.');
        if (m.referenceSeconds && !(r.seconds >= m.referenceSeconds[0] && r.seconds <= m.referenceSeconds[1])) errors.push(`Referensfilmen ska vara ${m.referenceSeconds[0]}–${m.referenceSeconds[1]} s för ${m.label}.`);
      }
      if (m.resolutions && o.generation.params.resolution !== undefined && !m.resolutions.includes(String(o.generation.params.resolution))) errors.push(`Upplösningen ska vara ${m.resolutions.join(', ')} för ${m.label}.`);
    }
  }
  if (!isObject(o.prompt) || typeof o.prompt.text !== 'string' || o.prompt.text.length > TEXT_LIMIT || typeof o.prompt.sha256 !== 'string') errors.push('prompt: text och sha256 krävs.');
  else if (o.prompt.extra !== null && (typeof o.prompt.extra !== 'string' || o.prompt.extra.length > EXTRA_LIMIT)) errors.push(`prompt.extra får vara högst ${EXTRA_LIMIT} tecken.`);
  else if (o.prompt.style !== undefined && !TEXT_STYLES.includes(o.prompt.style)) errors.push('prompt.style ska vara KORT, MINIMAL eller UTFÖRLIG.');
  if (isObject(o.step) && o.step.shape !== undefined && o.step.shape !== null && o.step.shape !== 'ROUND_TRIP' && o.step.shape !== 'ONE_WAY') errors.push('step.shape ska vara ROUND_TRIP, ONE_WAY eller null.');
  if (!Number.isInteger(o.takes) || (o.takes as number) < 1 || (o.takes as number) > TAKES_MAX) errors.push(`takes ska vara 1–${TAKES_MAX}.`);
  if (!isObject(o.cost) || !(Number(o.cost.total) >= 0) || !(Number(o.cost.worstTotal) >= Number(o.cost.total))) errors.push('cost saknas.');
  if (!isObject(o.reference) || !['INGEN', 'SAKNAS', 'FINNS'].includes(String(o.reference.status))) errors.push('reference.status ska vara INGEN, SAKNAS eller FINNS.');
  if (!['UTKAST', 'GODKÄND', 'AVBRUTEN'].includes(String(o.status))) errors.push('status ska vara UTKAST, GODKÄND eller AVBRUTEN.');
  if (o.approval !== null && (!isObject(o.approval) || !APPROVERS.includes(o.approval.by) || typeof o.approval.at !== 'string' || !SHA.test(String(o.approval.orderSha256)))) errors.push('approval ska vara null eller {by: "jakob" eller "huvudagent", at, orderSha256}.');
  else if (o.approval && o.approval.by === 'huvudagent' && (typeof o.approval.mandate !== 'string' || !o.approval.mandate.trim() || o.approval.mandate.length > 300)) errors.push('approval: huvudagentens godkännande bär sitt uppdrag (mandate: vems ord och när).');
  if (o.setAside != null && (!isObject(o.setAside) || typeof o.setAside.why !== 'string' || !o.setAside.why.trim() || typeof o.setAside.at !== 'string' || o.status !== 'AVBRUTEN')) errors.push('setAside: en avbruten beställning säger när och varför (why).');
  if (o.status === 'GODKÄND' && !o.approval) errors.push('En godkänd beställning måste ha approval.');
  if (o.status === 'GODKÄND' && o.step?.key === 'RETUR-2.3') errors.push(RETURN_23_BLOCK);
  if (o.status === 'UTKAST' && o.approval) errors.push('Ett utkast har ingen approval.');
  if (!Array.isArray(o.notes)) errors.push('notes ska vara en lista.');
  return { order: errors.length ? null : (o as Order), errors };
}

// ── What GET /api/orders answers (tools/order-store.ts list) ────────────────
/** Each order as the view gets it: its revision (If-Match), hash, shown status, what keeps it, what it waits for. */
/** Whose a picture is: the dealer it shows, and whether all of her or only her arm at the shoe (a pose figure). */
export type Owner = { dealer: string; name: string; part: 'whole' | 'arm' };
export type OrderAnswer = {
  order: Order;
  revision: string;
  hash: string;
  shown: Shown;
  problems: string[];
  warnings: string[];
  waiting: (Waits & { ready: boolean })[];
  receipt: Receipt | null;
  check: PolicyCheck | null;
  /** Per picture name: whose it is (unknown when the picture says nothing about its source). */
  owners?: Record<string, Owner | null>;
  /** Why "Hämta bilderna" would change a draft now (a waited picture holds, a newer anchor holds, the plan changed), or null. */
  refresh?: string | null;
};
/** A dealer as the texts know her (data/dealers.json). */
export type DealerLook = { id: string; name: string; look: string; paused?: string | null };
/** The pose figure a still is made with: the other dealer's arm at the shoe, served at /api/orders/pose/<step>. */
export type PoseAnswer = { step: StepKey; label: string; owner: Owner; served: string };
export type OrdersAnswer = {
  schemaVersion: 1;
  orders: OrderAnswer[];
  policy: Policy | null;
  day: { date: string; spent: number; cap: number };
  balance: { credits: number; at: string; source: string } | null;
  problems: string[];
  /** For a new order: the dealers' looks, the plan's cards and the pose figures (older servers lack them). */
  dealers?: DealerLook[];
  plan?: PlanAnswer | null;
  poses?: PoseAnswer[];
  /** The dummy's rendered reference films (data/rendered-references.json), which the lab's clip bank does not list. */
  rendered?: RenderedReference[];
  methods?: import('./order-methods.ts').MethodRegister | null;
  cutChecks?: BankFacts['cutChecks'];
};

/** Words for a credit sum: "1 000". */
export const credits = (n: number) => Math.round(n).toLocaleString('sv-SE').replace(/ /g, ' ');
