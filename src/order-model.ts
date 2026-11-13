// Orders for Runway, prepared in the studio's view Beställ and placed later by an ordering agent (tools/order-clerk.md).
// Pure: the order's shape and its check, the steps a dealer can be ordered for with their defaults, what goes out per take
// (requestOf), the cost from the price table in data/order-policy.json, the policy check (also for a group of drafts),
// the hash the approval freezes, and the status a person sees. The choices of a deal (hand, handbyte, how the card lands
// and turns, the text's style, tur och retur or bara dit) and the plan's cards as an order sees them, with the seats where
// the left hand would cross her body; the bank's takes a reference film can be chosen from (referenceCandidates). No fs,
// no network, no hashing (the caller hashes hashInput()); the studio builds it in.
// Tests: tools/order-model.test.ts.
import { dealersOf, parseEdge } from './clip-graph.ts';

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
 * free on the way (the hand turns it as a human hand can, no fixed edge; Jakob 2026-11-12); or rolled about the long side
 * on the way as the bank's films do. Folding it over the short edge was an idea Jakob has dropped.
 */
export type FlipAxis = 'AT_PLACE' | 'FREE' | 'LONG_EDGE';
export const FLIP_AXES: readonly FlipAxis[] = ['AT_PLACE', 'FREE', 'LONG_EDGE'];
export const FLIP_LABEL: Record<FlipAxis, string> = {
  AT_PLACE: 'Vänd vid platsen',
  FREE: 'Naturlig vändning på vägen',
  LONG_EDGE: 'Rullas kring långsidan på vägen',
};
export const FLIP_ABOUT: Record<FlipAxis, string> = {
  AT_PLACE: 'Nyp, dra, för fram, vrid, vänd upp, lägg: kortet förs fram med baksidan upp längs filten och vänds först vid platsen.',
  FREE: 'Ingen bestämd kant: handen vänder kortet i luften som en människa kan, och kortet behåller sin storlek.',
  LONG_EDGE: 'Som bankens filmer gör i dag.',
};
/**
 * The turn a new deal starts with: where the plan turns it (Placering, "Var kortet vänds": at the place, or in the air as a
 * hand can). Jakob 2026-11-13: the orders are driven from Placering, so the plan's word rules here too; his six steps (the
 * turn at the place) are chosen there per card, not written over the plan by the step.
 */
export const defaultFlip = (_step: string, turnAt?: 'AIR' | 'PLACE' | null): FlipAxis => (turnAt === 'PLACE' ? 'AT_PLACE' : 'FREE');

/**
 * Which hand deals. The shoe stands at the right of the picture, by her left hand; both anchors 2.1 and 2.2 show that hand
 * on the card. LH: the left hand takes the card and lays it. RH: the right hand reaches over to the shoe, takes it and lays
 * it. PASS (handbyte): the left hand takes it and gives it to the right hand low in front of her body; the right lays it.
 * Stored as the plan stores it (Intent.takeHand and Intent.pass): hand = the hand that takes the card, pass = it is handed over.
 */
export type HandChoice = 'LH' | 'RH' | 'PASS';
export const HAND_CHOICES: readonly HandChoice[] = ['LH', 'RH', 'PASS'];
export const HAND_LABEL: Record<HandChoice, string> = { LH: 'Vänster hela vägen', RH: 'Höger hela vägen', PASS: 'Handbyte' };
export const HAND_ABOUT: Record<HandChoice, string> = {
  LH: 'Vänster hand tar kortet ur skon och lägger det; höger vilar på bordet.',
  RH: 'Höger hand sträcker sig till skon, tar kortet och lägger det; vänster släpper kortet och väntar vid skon.',
  PASS: 'Vänster tar kortet ur skon och ger det till höger lågt framför kroppen; höger lägger det.',
};
export const handChoiceOf = (m: { hand: 'LH' | 'RH'; pass?: boolean }): HandChoice => (m.pass ? 'PASS' : m.hand);
export const handsOf = (choice: HandChoice): { hand: 'LH' | 'RH'; pass: boolean } => (choice === 'PASS' ? { hand: 'LH', pass: true } : { hand: choice, pass: false });

/**
 * The text's style (template 4, 2026-11-13). KORT: only the movement in the order it happens, positive, nothing of her
 * look and no list of bans, the turn said once (the default for a film). MINIMAL: Jakob's trial: the card's colours and
 * that one card goes from the shoe to where the last picture shows it, nothing about how. UTFÖRLIG: the text of template 3
 * as it was, kept so that a comparison can be made again; every order made before template 4 is Utförlig. A still is
 * written Kort (what is there, said positively, no list of bans) or Utförlig; Minimal says nothing a still can use.
 */
export type TextStyle = 'KORT' | 'MINIMAL' | 'UTFÖRLIG';
export const TEXT_STYLES: readonly TextStyle[] = ['KORT', 'MINIMAL', 'UTFÖRLIG'];
export const STYLE_LABEL: Record<TextStyle, string> = { KORT: 'Kort', MINIMAL: 'Minimal', UTFÖRLIG: 'Utförlig' };
export const STYLE_ABOUT: Record<TextStyle, string> = {
  KORT: 'Bara rörelsen, i den ordning den sker. Inget om hennes utseende, inga förbud; vändningen i en mening.',
  MINIMAL: 'Jakobs prov: kortets färger och att ett kort går från skon dit sista bilden visar. Inget om hur. Inte för en bild.',
  UTFÖRLIG: 'Mall 3, som den var: hennes utseende, varje led och listan över det som inte får hända. För jämförelse.',
};
export const stylesFor = (kind: Kind, step?: { styles?: readonly TextStyle[] } | null): readonly TextStyle[] => step?.styles ?? (kind === 'STILL' ? ['KORT', 'UTFÖRLIG'] : TEXT_STYLES);
/** A new order is written Kort, a still too; only an order made before template 4 reads as Utförlig (styleOf). */
export const defaultStyle = (_kind?: Kind): TextStyle => 'KORT';
/** A stored order's style: its own, else Utförlig (every order before template 4 was written with the long text). */
export const styleOf = (prompt: { style?: TextStyle | null } | null | undefined): TextStyle => prompt?.style ?? 'UTFÖRLIG';

/** A deal goes to the place and back to the shoe in one film (tur och retur), or ends at the place on the landing picture (bara dit). */
export type Shape = 'ROUND_TRIP' | 'ONE_WAY';
export const SHAPE_LABEL: Record<Shape, string> = { ROUND_TRIP: 'Tur och retur', ONE_WAY: 'Bara dit' };
export const SHAPE_ABOUT: Record<Shape, string> = {
  ROUND_TRIP: 'Ett kort till platsen och handen tillbaka, i samma film; sista bilden är ankaret med kortet ritat.',
  ONE_WAY: 'En handling: filmen slutar på landningsbilden, handen vid kortet. Returen beställs som en egen film.',
};

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
export const LANDS_ABOUT: Record<'BACK' | 'FRONT', string> = {
  BACK: 'Gul baksida upp hela vägen; kortet vänds inte.',
  FRONT: 'Kortet vänds och landar med blå framsida upp.',
};

/** Stored on the order. A draft (UTKAST) can change; an approved order (GODKÄND) never does; AVBRUTEN is set aside. */
export type OrderStatus = 'UTKAST' | 'GODKÄND' | 'AVBRUTEN';
/** A take after approval, in the receipt (assets/orders/<id>/receipt.json, written only by tools/order-put.ts). */
export const TAKE_FLOW = ['GODKÄND', 'LAGD', 'KLAR', 'HÄMTAD', 'EFTERARBETAD', 'MÄTT', 'GRANSKAD', 'INFÖRD'] as const;
export type TakeStatus = (typeof TAKE_FLOW)[number] | 'OSÄKER' | 'MISSLYCKAD' | 'AVBRUTEN';
export const TAKE_STATUSES: readonly TakeStatus[] = [...TAKE_FLOW, 'OSÄKER', 'MISSLYCKAD', 'AVBRUTEN'];
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
/** The card drawn on a picture where the placement plan says (the plan's own drawing rule, flatQuad). */
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
  from: { entry?: string; path?: string; frame?: number; built?: string; note?: string } | null;
  waits?: Waits | null;
  drawn?: Drawn | null;
  /** Other cards of the plan drawn on the same picture (the hole card's turn: the dealer's first card, open). */
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
 * Orders made before 2026-11-13 lack pass (read as false). cardScale: the card's size on the last picture as a factor of the
 * plan's (CARD_SCALES), a trial; absent: the plan's size.
 */
export type Motion = { grip: 'PINCH' | 'DRAG'; hand: 'LH' | 'RH'; pass: boolean; turn: boolean; flipAxis: FlipAxis | null; target: string | null; side: 'FRONT' | 'BACK'; fromPlan: boolean; cardScale?: number };
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
  prompt: { template: string; style?: TextStyle; text: string; sha256: string; extra: string | null; middle: boolean };
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
export type StepKey = 'INGANG-2.1' | 'INGANG-2.2' | 'GIV-2.1' | 'GIV-2.2' | 'RETUR-2.1' | 'RETUR-2.2' | 'RETUR-1' | 'UTGANG' | 'HALKORT' | 'VILA' | 'ANKARE-2.1' | 'ANKARE-2.2';
export type StepDef = {
  key: StepKey;
  group: string;
  label: string;
  kind: Kind;
  /**
   * The anchor the film starts on and the one it ends on ("1", "2.1", "2.2"), or the still's base picture. A return
   * (start LAND) starts on the seat's landing picture instead and ends on `to`; its `from` is the same anchor.
   */
  from: '1' | '2.1' | '2.2';
  to: '1' | '2.1' | '2.2' | null;
  start?: 'LAND';
  card: boolean;
  grip?: 'PINCH' | 'DRAG';
  /** The model it is made with unless another is chosen (förval); modelsFor gives every model that can make it. */
  model: string;
  /** The resolution a film asks for when its model takes it (paramsOf); a still's ratio. A film's ratio is its model's. */
  resolution?: string;
  ratio?: string;
  imageSize?: string;
  duration?: number;
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
  { key: 'INGANG-2.1', group: 'Ingång', label: 'Ankare 1 → 2.1', kind: 'FILM', from: '1', to: '2.1', card: false, model: 'wan3', resolution: '1080p', duration: 4 },
  { key: 'INGANG-2.2', group: 'Ingång', label: 'Ankare 1 → 2.2', kind: 'FILM', from: '1', to: '2.2', card: false, model: 'wan3', resolution: '1080p', duration: 4 },
  { key: 'GIV-2.1', group: 'Giv från ankare 2.1', label: 'Nyp, ett kort till platsen och tillbaka', kind: 'FILM', from: '2.1', to: '2.1', card: true, grip: 'PINCH', model: 'kling-4', resolution: '1080p', duration: 7 },
  { key: 'GIV-2.2', group: 'Giv från ankare 2.2', label: 'Släp, ett kort till platsen och tillbaka', kind: 'FILM', from: '2.2', to: '2.2', card: true, grip: 'DRAG', model: 'wan3', resolution: '1080p', duration: 6 },
  // A return is a film of its own (one action per film, 2026-11-13): from the seat's landing picture back to an anchor.
  // It can be ordered where a landing picture holds for the seat (landingMissing says what is lacking otherwise).
  { key: 'RETUR-2.1', group: 'Retur från landningen', label: 'Tillbaka till nypet (2.1)', kind: 'FILM', from: '2.1', to: '2.1', start: 'LAND', card: true, grip: 'PINCH', model: 'wan3', resolution: '1080p', duration: 3 },
  { key: 'RETUR-2.2', group: 'Retur från landningen', label: 'Tillbaka över skon (2.2)', kind: 'FILM', from: '2.2', to: '2.2', start: 'LAND', card: true, grip: 'DRAG', model: 'wan3', resolution: '1080p', duration: 3 },
  { key: 'RETUR-1', group: 'Retur från landningen', label: 'Tillbaka till vila (1)', kind: 'FILM', from: '1', to: '1', start: 'LAND', card: true, grip: 'PINCH', model: 'wan3', resolution: '1080p', duration: 3 },
  // The steps a round needs that Beställ could not order before 2026-11-13 (the dealer's second card is GIV-2.1 to D.C2):
  // the hand leaving the shoe for rest (READY>IDLE), and the hole card turned open from rest and the hand back to rest
  // (IDLE>REVEAL(D.C2)), whose pictures are anchor 1 with the dealer's two cards drawn where the plan says.
  { key: 'UTGANG', group: 'Utgång', label: 'Ankare 2.1 → 1: handen lämnar skon och vilar', kind: 'FILM', from: '2.1', to: '1', card: false, model: 'wan3', resolution: '1080p', duration: 4, styles: ['KORT', 'MINIMAL'] },
  {
    key: 'HALKORT', group: 'Hålkortet', label: 'Hålkortet vänds upp från vila, handen tillbaka', kind: 'FILM', from: '1', to: '1', card: false, target: 'D.C2', edge: 'IDLE>REVEAL(D.C2)',
    cards: [{ target: 'D.C1', before: 'FRONT', after: 'FRONT' }, { target: 'D.C2', before: 'BACK', after: 'FRONT' }], model: 'wan3', resolution: '1080p', duration: 5, styles: ['KORT', 'MINIMAL'],
  },
  { key: 'VILA', group: 'Vila', label: 'Vila, samma bild först och sist', kind: 'FILM', from: '1', to: '1', card: false, model: 'wan3', resolution: '1080p', duration: 4 },
  { key: 'ANKARE-2.1', group: 'Bild', label: 'Ankare 2.1 (nyp)', kind: 'STILL', from: '1', to: null, card: false, model: 'nano-banana-pro', ratio: '4:3', imageSize: '4K', makes: { role: 'ankare-2.1', node: 'READY', label: 'ankare 2.1' } },
  { key: 'ANKARE-2.2', group: 'Bild', label: 'Ankare 2.2 (släp)', kind: 'STILL', from: '1', to: null, card: false, model: 'nano-banana-pro', ratio: '4:3', imageSize: '4K', makes: { role: 'ankare-2.2', node: 'READY-B', label: 'ankare 2.2' } },
];
export const stepOf = (key: string): StepDef | null => STEPS.find((s) => s.key === key) ?? null;
/** The anchors in Jakob's words: "ankare 2.1 (nyp): tummen och pekfingret på kortet i skons fönster". */
export const ANCHOR_WORDS: Record<'1' | '2.1' | '2.2', string> = {
  '1': 'ankare 1 (vila): båda händerna på bordet',
  '2.1': 'ankare 2.1 (nyp): tummen och pekfingret på kortet i skons fönster',
  '2.2': 'ankare 2.2 (släp): handen över kortet i skons öppning',
};
/** Where a step starts and ends, in one line: "Börjar och slutar på ankare 2.2 (släp): …". */
export function startWords(step: Pick<StepDef, 'kind' | 'from' | 'to' | 'start' | 'card' | 'cards'>, shape: Shape | null = null): string {
  if (step.kind === 'STILL') return `Görs ur ${ANCHOR_WORDS[step.from]}.`;
  if (step.cards?.length) return `Börjar och slutar på ${ANCHOR_WORDS[step.from]}, med dealerns två kort ritade där planen säger: det första öppet, hålkortet stängt i första bilden och öppet i sista.`;
  if (step.start === 'LAND') return `Börjar på platsens landningsbild (handen vid kortet) och slutar på ${ANCHOR_WORDS[step.to ?? step.from]}.`;
  if (step.card && shape === 'ONE_WAY') return `Börjar på ${ANCHOR_WORDS[step.from]}, och slutar på platsens landningsbild.`;
  if (!step.to || step.to === step.from) return `Börjar och slutar på ${ANCHOR_WORDS[step.from]}.`;
  return `Börjar på ankare ${step.from} och slutar på ${ANCHOR_WORDS[step.to]}.`;
}

// ── The landing picture (a return starts on it, a deal "bara dit" ends on it) ──
/** The register's node and role of a seat's landing picture: LAND(P4.C1), role landning, with the card on the table. */
export const landingNode = (target: string) => `LAND(${target})`;
export const LANDING_ROLE = 'landning';
/** The landing picture of a seat that holds: role landning, node LAND(<seat>), state gäller, the card on that seat. */
export function landingOf<E extends { role: string; node?: string; state?: string; card?: string }>(entries: readonly E[], target: string | null | undefined): E | null {
  return target ? (entries.find((e) => e.role === LANDING_ROLE && e.node === landingNode(target) && e.state === 'gäller' && e.card === target) ?? null) : null;
}
/** What is missing where no landing picture holds, and how to get one, in Jakob's words. */
export const landingMissing = (dealerName: string, target: string | null | undefined) =>
  `Ingen landningsbild gäller för ${genitive(dealerName)} ${seatWords(target)}. Godkänn en i Material (roll landning, ${landingNode(target ?? 'P4.C1')}): en stillbild eller en ruta ur en giv där handen just har lagt kortet. Då kan returen och Bara dit beställas.`;

/** "Paows", "Agnes". */
export const genitive = (name: string) => (/[sxz]$/i.test(name) ? name : `${name}s`);
/** "plats 4", "plats 4, andra kortet", "dealerns plats". */
export function seatWords(target: string | null | undefined): string {
  const m = /^P(\d)\.C(\d)$/.exec(target ?? '');
  if (m) return `plats ${m[1]}${m[2] === '1' ? '' : ', kort ' + m[2]}`;
  // The dealer's second card is the hole card (it lands closed); her first keeps the words it was ordered with.
  if (target === 'D.C2') return 'dealerns hålkort';
  return /^D\./.test(target ?? '') ? 'dealerns plats' : 'platsen';
}
/**
 * What an order makes, in one line in Jakob's words: "Gör Paows ankare 2.1: hennes ankare 1 där bara vänsterarmen flyttas
 * till nypet vid skon." Shown on the order's card and at the top of "Det här skickas".
 */
export type SummaryMotion = Pick<Motion, 'turn' | 'target'> & Partial<Pick<Motion, 'hand' | 'pass' | 'side' | 'flipAxis'>>;
/** A deal in one line: which hand, how it turns, how it lands, where; the same words for every deal step. */
function dealWords(from: '2.1' | '2.2', dealerName: string, motion: SummaryMotion | null, oneWay = false): string {
  const seat = seatWords(motion?.target), hand = motion?.hand ?? 'LH', pass = !!motion?.pass, open = motion ? (motion.side ?? (motion.turn ? 'FRONT' : 'BACK')) === 'FRONT' : true;
  const take = from === '2.1' ? 'från ankare 2.1 (nyp) tar hon ett kort ur skon' : 'från ankare 2.2 (släp) släpar hon ett kort ur skon';
  const by = pass ? ' med vänster hand och ger det till höger lågt framför kroppen' : hand === 'RH' ? ' med höger hand' : ' med vänster hand';
  const who = pass ? 'höger' : 'hon';
  const flip = motion?.flipAxis ?? 'FREE';
  const lay = !open
    ? `${who} lägger det stängt, baksidan upp, på ${seat}`
    : flip === 'AT_PLACE'
      ? `${who} för fram det med baksidan upp, vänder upp det vid ${seat} och lägger det öppet`
      : `${who} ${flip === 'LONG_EDGE' ? 'rullar det kring långsidan' : 'vänder det som en hand kan'} på vägen och lägger det öppet på ${seat}`;
  const back = oneWay ? 'filmen slutar med handen vid kortet (bara dit)' : pass || hand === 'RH' ? 'händerna går tillbaka till ankaret' : `handen går tillbaka ${from === '2.1' ? 'till nypet' : 'över skon'}`;
  return `Gör en film av ${dealerName}: ${take}${by}; ${lay}; ${back}.`;
}
export function summaryOf(step: Pick<StepDef, 'key'>, dealerName: string, motion: SummaryMotion | null, shape: Shape | null = null): string {
  const of = genitive(dealerName), seat = seatWords(motion?.target), oneWay = shape === 'ONE_WAY';
  switch (step.key) {
    case 'ANKARE-2.1': return `Gör ${of} ankare 2.1: hennes ankare 1 där bara vänsterarmen flyttas till nypet vid skon.`;
    case 'ANKARE-2.2': return `Gör ${of} ankare 2.2: hennes ankare 1 där bara vänsterarmen flyttas, så att handen ligger över kortet vid skons öppning.`;
    case 'GIV-2.1': return dealWords('2.1', dealerName, motion, oneWay);
    case 'GIV-2.2': return dealWords('2.2', dealerName, motion, oneWay);
    case 'RETUR-2.1': return `Gör en film av ${dealerName}: handen går från kortet på ${seat} tillbaka till nypet vid skon.`;
    case 'RETUR-2.2': return `Gör en film av ${dealerName}: handen går från kortet på ${seat} tillbaka och lägger sig över kortet vid skons öppning.`;
    case 'RETUR-1': return `Gör en film av ${dealerName}: handen går från kortet på ${seat} tillbaka till vila.`;
    case 'INGANG-2.1': return `Gör en film av ${dealerName}: från vila (ankare 1) flyttar hon vänsterhanden till nypet vid skon (ankare 2.1).`;
    case 'INGANG-2.2': return `Gör en film av ${dealerName}: från vila (ankare 1) lägger hon vänsterhanden över kortet vid skons öppning (ankare 2.2).`;
    case 'UTGANG': return `Gör en film av ${dealerName}: från nypet vid skon (ankare 2.1) släpper hon kortet, och handen går tillbaka till vila (ankare 1).`;
    case 'HALKORT': return `Gör en film av ${dealerName}: från vila vänder hon upp hålkortet, dealerns andra kort, med handen närmast skon, och handen går tillbaka till vila.`;
    case 'VILA': return `Gör en vilofilm av ${dealerName}: hon sitter still, och filmen börjar och slutar på ankare 1.`;
  }
}
/** The graph's node of an anchor ("2.1" → READY). */
export const ANCHOR_NODE: Record<'1' | '2.1' | '2.2', string> = { '1': 'IDLE', '2.1': 'READY', '2.2': 'READY-B' };
/** The register's role of an anchor. */
export const ANCHOR_ROLE: Record<'1' | '2.1' | '2.2', string> = { '1': 'ankare-1', '2.1': 'ankare-2.1', '2.2': 'ankare-2.2' };
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
export const SEAT_TARGETS = ['P1.C1', 'P2.C1', 'P3.C1', 'P4.C1', 'P5.C1', 'P6.C1', 'P7.C1', 'D.C1', 'D.C2'];
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
 * Placering says about it (how it lands, which hand, handbyte, grip, where it turns), and whether the left hand from the
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
 * card makes it reach across her body (P1–P3 in the plan of 2026-11-11; P4 lies in front of her); there the sheet
 * suggests handbyte. A suggestion only: nothing is set by it.
 */
export const crossesBody = (x: number, line: { midline: number; halfCard: number }) => x < line.midline - line.halfCard;
export const CROSSING_WHY = 'kortet landar till vänster om hennes mitt, så vänsterhanden från skon måste korsa kroppen';

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
/** The models that can make a step, its own first (förval): a film needs one that takes a first and a last picture. */
export function modelsFor(step: Pick<StepDef, 'kind' | 'model'>): ModelDef[] {
  const own = MODELS[step.model];
  return [own, ...Object.values(MODELS).filter((m) => m !== own && m.tool === own.tool && (step.kind === 'STILL' || !!m.frames))];
}
/** The model a step is made with: the step's own when none is asked for, the one asked for when it can make the step, else null. */
export function modelFor(step: Pick<StepDef, 'kind' | 'model'>, id?: string | null): ModelDef | null {
  if (id === undefined || id === null) return MODELS[step.model];
  return modelsFor(step).find((m) => m.id === id) ?? null;
}
/**
 * The generation parameters by name, as the tool takes them, for a step made with a model: a still's ratio and size; a
 * film's resolution (the one asked for, else the step's when the model takes it, else the model's last and highest), its
 * length, and what the model always gets (WAN 3: ratio adaptive; a model whose sound can be switched off: no sound).
 */
export function paramsOf(step: StepDef, model: ModelDef, choice: { duration?: number; resolution?: string } = {}): Record<string, string | number | boolean> {
  if (step.kind === 'STILL') return { ratio: step.ratio!, imageSize: step.imageSize! };
  const wanted = step.resolution ?? '1080p';
  const resolution = choice.resolution ?? (!model.resolutions || model.resolutions.includes(wanted) ? wanted : model.resolutions[model.resolutions.length - 1]);
  return { resolution, duration: choice.duration ?? step.duration!, ...(model.ratio ? { ratio: model.ratio } : {}), ...(model.audio === 'off' ? { generateAudio: false } : {}) };
}
/** A length the model takes: the one asked for, brought within the model's range. */
export const lengthFor = (model: Pick<ModelDef, 'durations'>, seconds: number) => (model.durations ? Math.min(model.durations[1], Math.max(model.durations[0], seconds)) : seconds);

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
  derived?: { id: string; from: string; to: string; clip: string; frames: [number, number]; dealer?: string; editOf?: string }[];
  edits?: { id: string; source?: { clip?: string }; dealer?: string }[];
  motions?: Record<string, { source?: { sha256?: string; fps?: number; frames?: number }; review?: { decision?: string; acceptedAs?: string; userAccepted?: boolean; userReview?: string } } | null | undefined>;
  media?: Record<string, { video?: string | null } | null | undefined>;
};
/**
 * A take of the bank that can go as a reference film: the take, the film it lies in (assets/motions/<film>/source.mp4;
 * a take cut from a longer film sends the whole film, and `frames` says which part is the take, `also` the other takes
 * cut from it), whose it is, Jakob's verdict and his words, the film's length and whether the model takes that length.
 */
export type RefCandidate = {
  take: string; film: string; path: string; dealer: string; edge: string; goesTo: string | null;
  match: 0 | 1 | 2; verdict: RefVerdict; approvedStraight: boolean; words: string | null;
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
 * dealer's own before another dealer's, then by his verdict. One per film (the best placed take names it).
 */
export function referenceCandidates(bank: BankFacts, want: { dealer: string; step: StepDef; target: string | null; model?: Pick<ModelDef, 'referenceSeconds'> | null }): RefCandidate[] {
  const w = parseEdge(wantedEdge(want.step, want.target) ?? '');
  if (!w) return [];
  const owners = dealersOf(bank as never);
  const jobs = bank.jobs ?? [], derived = bank.derived ?? [], edits = bank.edits ?? [];
  const byId = new Map(jobs.map((j) => [j.id, j]));
  const takes = [
    ...jobs.map((j) => ({ id: j.id, from: j.from, to: j.to, film: j.id, frames: null as [number, number] | null })),
    ...edits.flatMap((x) => { const src = byId.get(x.source?.clip ?? ''); return src ? [{ id: x.id, from: src.from, to: src.to, film: x.id, frames: null }] : []; }),
    ...derived.map((d) => ({ id: d.id, from: d.from, to: d.to, film: d.clip, frames: d.frames })),
  ];
  const range = want.model?.referenceSeconds ?? null;
  const out: RefCandidate[] = [];
  for (const t of takes) {
    const e = parseEdge(`${t.from}>${t.to}`);
    if (!e || typeof t.film !== 'string') continue;
    const sameHub = w.kind === 'RETURN' ? e.to === w.to : e.from === w.from;
    const match = e.id === w.id ? 0 : e.base === w.base ? 1 : e.kind === w.kind && sameHub && w.target && e.target && e.target !== w.target ? 2 : null;
    if (match === null) continue;
    if (bank.media && t.id in bank.media && !bank.media[t.id]?.video) continue;
    const record = bank.motions?.[t.id], source = record?.source ?? bank.motions?.[t.film]?.source;
    const seconds = source?.frames && source.fps ? Math.round((source.frames / source.fps) * 1000) / 1000 : (byId.get(t.film)?.duration ?? null);
    const whole = !t.frames || !source?.frames || (t.frames[0] <= 0 && t.frames[1] >= source.frames - 1);
    const { verdict, straight, words } = verdictOf(record?.review);
    out.push({
      take: t.id, film: t.film, path: `assets/motions/${t.film}/source.mp4`, dealer: owners[t.id] ?? 'pamela', edge: `${t.from}>${t.to}`, goesTo: e.target,
      match, verdict, approvedStraight: straight, words, seconds, frames: whole ? null : t.frames, also: derived.filter((d) => d.clip === t.film && d.id !== t.id).map((d) => d.id),
      fits: !range || (seconds !== null && seconds >= range[0] && seconds <= range[1]), sha256: source?.sha256 ?? null,
    });
  }
  const key = (c: RefCandidate) => [c.match, c.verdict === 'UNDERKÄND' ? 1 : 0, c.dealer === want.dealer ? 0 : 1, VERDICT_RANK[c.verdict]];
  out.sort((a, b) => { const ka = key(a), kb = key(b); for (let i = 0; i < ka.length; i++) if (ka[i] !== kb[i]) return ka[i] - kb[i]; return a.take.localeCompare(b.take); });
  const films = new Set<string>();
  return out.filter((c) => (films.has(c.film) ? false : (films.add(c.film), true)));
}
/** "7,04 s", "4 s". */
export const secondsWords = (s: number | null | undefined) => (s === null || s === undefined ? 'okänd längd' : `${String(Math.round(s * 100) / 100).replace('.', ',')} s`);

// ── Policy and prices (data/order-policy.json) ──────────────────────────────
export type Price = { model: string; resolution?: string; imageSize?: string; perSecond?: number; perImage?: number; listedPerSecond?: number; source: string };
export type Policy = {
  schemaVersion: 1;
  enabled: boolean;
  dailyCapCredits: number;
  maxPerOrder: number;
  minBalance: number;
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
/** Whether the policy lets this order be approved now. The worst-case cost counts. */
export function checkPolicy(order: Pick<Order, 'cost'>, policy: Policy, spentToday: number, balance: number): PolicyCheck {
  const cost = order.cost.worstTotal, refusals: string[] = [];
  if (!policy.enabled) refusals.push('Beställningar är avstängda (enabled: false i data/order-policy.json).');
  if (cost > policy.maxPerOrder) refusals.push(`Beställningen kostar upp till ${cost} krediter; taket per beställning är ${policy.maxPerOrder}.`);
  if (spentToday + cost > policy.dailyCapCredits) refusals.push(`I dag är ${spentToday} av ${policy.dailyCapCredits} krediter intecknade; den här skulle ta det till ${spentToday + cost}.`);
  if (balance - cost < policy.minBalance) refusals.push(`Saldot ${balance} minus ${cost} går under golvet ${policy.minBalance}.`);
  return { ok: refusals.length === 0, refusals, spentToday, afterToday: spentToday + cost, balance, balanceAfter: balance - cost };
}

/**
 * A group of drafts (one per seat) against the policy: what all of them cost, and how many of them can be approved today
 * (each approval counts its worst case against the day's cap) and above the balance's floor. The limits are Jakob's
 * (data/order-policy.json); this only says where a group stands against them.
 */
export type GroupBudget = { count: number; total: number; worstTotal: number; overPerOrder: boolean; fitToday: number; fitBalance: number; words: string[] };
export function groupBudget(cost: Pick<Order['cost'], 'total' | 'worstTotal'>, count: number, policy: Pick<Policy, 'enabled' | 'dailyCapCredits' | 'maxPerOrder' | 'minBalance'>, spentToday: number, balance: number): GroupBudget {
  const worst = cost.worstTotal, overPerOrder = worst > policy.maxPerOrder;
  const fit = (room: number) => (worst > 0 ? Math.max(0, Math.min(count, Math.floor(room / worst))) : count);
  const fitToday = !policy.enabled || overPerOrder ? 0 : fit(policy.dailyCapCredits - spentToday);
  const fitBalance = fit(balance - policy.minBalance);
  const words: string[] = [];
  if (!policy.enabled) words.push('Beställningar är avstängda (enabled: false i data/order-policy.json): inget kan godkännas.');
  else if (overPerOrder) words.push(`Varje utkast kostar upp till ${credits(worst)} krediter; taket per beställning är ${credits(policy.maxPerOrder)}, så inget av dem kan godkännas.`);
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
export type Receipt = {
  schemaVersion: 1;
  order: string;
  orderSha256: string;
  /**
   * review: the independent reviewer's verdict recorded beside the take's state, at any state from HÄMTAD on, without
   * moving it (node tools/order-put.ts review); the protocol reads it as the reviewer's note when it is the newest.
   */
  takes: { take: number; status: TakeStatus; requestedAt: string | null; taskId: string | null; creditsRemainingAfter?: number | null; error?: string | null; file?: string | null; sha256?: string | null; review?: { at: string; note: string } | null; history: { at: string; status: TakeStatus; note?: string }[] }[];
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
export function draftProblems(order: Order): string[] {
  const out: string[] = [];
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
    if (!isObject(m) || !['LH', 'RH'].includes(String(m.hand)) || !['FRONT', 'BACK'].includes(String(m.side)) || typeof m.turn !== 'boolean' || (m.flipAxis !== null && !FLIP_AXES.includes(m.flipAxis as FlipAxis))) errors.push('motion: hand (LH/RH), side (FRONT/BACK), turn och flipAxis krävs.');
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
};

/** Words for a credit sum: "1 000". */
export const credits = (n: number) => Math.round(n).toLocaleString('sv-SE').replace(/ /g, ' ');
