// The text that goes to Runway with an order, per kind of step, in one of three styles (template 4, 2026-11-13):
//   KORT     only the movement, in the order it happens, in positive statements: nothing of her look (the first frame
//            shows her), no list of bans, one action, the turn said once (SAY.turnAtPlace). The default for a film.
//   MINIMAL  Jakob's trial: the card's colours and that one card goes from the shoe to where the last frame shows it.
//   UTFÖRLIG the text of template 3 exactly as it was (scene(dealer) + action(step, motion) + bans), so that an order
//            made before template 4 keeps reproducing its text. No new order is written with it (stylesFor in
//            src/order-model.ts): its words go against today's rules. A return never had a long text.
// Every sentence of the short and minimal texts lies in SAY, once, so that a wording can be changed in one edit (the
// rules are the handbook's, tools/film-prompting.md; this file holds the exact words). Pure; the dealer's look comes from
// data/dealers.json, the card's place from the plan (where the last picture draws the card). A text is built as parts,
// each marked with the choices it comes from (hand, how the card lands and turns, the place, the reference film, the free
// addition, the bans), so that the studio can show which words a choice made; the text is the parts joined, and the
// studio's sheet and the stored draft both get it from promptFor, so the preview cannot drift from what is sent.
//
// A return is a film of its own: from the seat's landing picture back to an anchor. A deal "bara dit" (oneWay) ends on the
// landing picture. A reference film adds one sentence (SAY.reference) in every style: it shows the movement only (template
// 14 says it as a rough guide, in the short text: SAY.v14.reference). The way out (UTGANG, READY>IDLE; UTGANG-2.2,
// READY-B>IDLE, from the drag; UTGANG-2.3, READY-C>IDLE, both hands) and the hole card's turn from rest (HALKORT,
// IDLE>REVEAL(D.C1)) came after template 3 and are written Kort or Minimal only.
//
// A deal follows the hand chosen: the left hand all the way, the right hand all the way, or handbyte (the left hand takes
// the card and gives it to the right hand low in front of her body; the right lays it). Every sentence that names a hand
// follows that choice, the bans too. The turn: at the place after the carry in Jakob's six steps of 2026-11-13 (nyp, dra,
// för fram, vrid, vänd upp, lägg; a closed card goes nyp, dra, för fram, lägg), on the way as a turn of the wrist that
// stays turned until the card lies (from template 9, Jakob 2026-11-17; before, any turn a human hand can make, with a card
// that keeps its size, Jakob 2026-11-12), or rolled about the long side on the way as the bank's films do, the hand still
// turned until the card lies too (from template 9). A drag stays a drag: from template 9 an open card from the drag goes
// along the felt under the fingertips and is taken between thumb and fingers on the way. A still is an edit of the
// dealer's own anchor and goes out with it alone (2026-11-23); the words about a pose picture (@pose), which the stills
// stored before were sent with, stay for those. Tests: tools/order-line.test.ts (every text the line allows) and tools/order-routes.test.ts.
import type { FlipAxis, Grip, StepKey, TextStyle } from './order-model.ts';

/**
 * The formula's version. 4: the short and minimal texts (Utförlig is always named @3, the long text's own version).
 * 5 (2026-11-13): the short deal says where the card's place is, after rounds 3 and 3b laid the card in front of her.
 * 6 (2026-11-13): the card's two sides said only by colour and by which one is up (SAY.v6), never back or face: Jakob
 * of a rejected take, "Baksida kan betyda olika saker, som baksidan på ett kort, men det kan också referera till undersidan".
 * 7 (2026-11-13): the short deal lets her move a little as she deals (SAY.moveOwn, SAY.moveBoth) instead of holding the
 * other hand still ("Hon är väldigt stel"), and after two hands the arm stretched out at the card is the one that comes
 * back while the hand at the shoe takes the next card or comes to rest (SAY.backPass, SAY.otherFromShoe): Jakob, "OM hon
 * har någon deal där hon använder sin vänster och högerarm så måste retreat/tillbakagången vara annorlunda". The card's
 * sides are said again in template 5's words (SAY.colours, SAY.oneCardMoves, "the blue face"): in round 6 both takes on
 * template 6 failed at the turn and both on template 5 turned the card, and "yellow side up …, blue side up …" says two
 * states by colour, which may invite a change of colour, where "its back is yellow and its face is blue" says one
 * two-sided object. Jakob's worry about "back" stays open. A closed deal from the pinch is laid on the felt in front of
 * the shoe and slid to its place (SAY.layAndSlide): round 6's closed takes were carried tilted and changed size.
 * 8 (2026-11-13): the movement sentences of 7 are taken out again, and a deal by the hand at the shoe ends on "The other
 * hand rests on the felt." as in 4 to 6: in eighteen takes on 7 she moved, but the card went wrong in fifteen, and in
 * three her other hand dealt the card ("her other hand shifts a little"); on the old sentence Jakob approved three of
 * five. Everything else of 7 stays.
 * 9 (2026-11-17): Jakob of his own order paow-giv-2-2-p4-02 (template 8), where the hand turned the card and turned back
 * before laying it, and lifted it out of the shoe: "Oavsett om hon nyper eller släpar ut kortet, alltså om hon kommer från
 * ankaret 2.1 eller 2.2, måste hon vrida över handleden", and "Varför släpar hon tex inte kortet som hon borde?". Three
 * changes. The turn on the way is a turn of the wrist in every open deal, from the pinch and from the drag: the card held
 * at its edge between thumb and fingers, the palm comes from down to up and the card comes over with the hand, and the
 * hand stays turned until the card lies and is let go (SAY.turnOnTheWay, SAY.rollOnTheWay, SAY.layTurned). An open card
 * from the drag is dragged along the felt and taken between thumb and fingers on the way, never lifted off the felt at the
 * shoe (SAY.dragTowards, SAY.takeOnTheWay, SAY.handoverDrag); a closed drag is as before. The card is said to be plain
 * on both sides, the next card in the window too, in the words of round 14's addition (SAY.colours, SAY.oneCardMoves).
 * The words of templates 4 to 8 that 9 replaced stay in SAY.v8.
 * 10 (2026-11-17): the deal of the reference-film trials (tools/film-prompting.md §5, "Giv bara dit"; Prov giv-experiment
 * and giv-forlagefilm-2): with an older dealer's approved deal to the same seat as reference film, Kling 4 turned the card through
 * its edge in 4 of 4 takes with text C of the first trial and laid it on the plan (the reviewer passed 3 of 4), and the
 * drag from anchor 2.2 to seat 4 held in 2 of 2 with the same words written for the drag. In an open deal of the short
 * text: the pinch holds the card by its short end with its broad yellow side to the camera (SAY.pinchHold); the drag keeps
 * its broad yellow side up along the felt (SAY.dragFlat); the turn is one roll of the wrist with hand and card turning
 * together about the card's long side, like a key, said as the camera sees it (SAY.keyOnTheWay, and SAY.keyAtPlace close
 * to the place) for both FREE and LONG_EDGE: Jakob's rule is that both turns are valid as long as the wrist turns and the
 * right side comes up yellow to blue, and template 9's palm-up words never held; a deal bara dit ends with the hand still
 * turned and its fingertips on the laid card (SAY.layOneWay); and the card is a small blank card that keeps the last
 * frame's size (SAY.oneCardMovesSized, without the size where the order draws the card at another scale), in Minimal
 * SAY.blankCard. The words "pale edge" and "edge to edge" are gone (a suspected light rim). A round trip keeps
 * template 9's lay and way back; closed deals, handbyte and the right hand keep template 9's words, untried with 10.
 * Template 9's words stay in SAY (still used by the other steps); fromTen chooses.
 * 11 (2026-11-18): no instruction twice (Jakob: "för många val som kan leda till överlappande instruktioner"). The words of
 * 10 for a deal by the hand at the shoe are unchanged, word for word (tools/order-line.test.ts holds it): that is the deal
 * the trials tried. What changes is the deals bara dit that 10 left on template 9's words, where the end was said twice or
 * against the last picture: an open deal by the other hand or with handbyte now turns with the key turn and ends on
 * SAY.layOneWay like every other (before: "lets go of it; only then does her empty hand turn palm down" and then "Her hand
 * ends at the card, as in the last frame"), and a closed deal ends in one sentence with the fingertips on the card
 * (SAY.layClosedOneWay, SAY.stopClosedOneWay, SAY.stopFlatOneWay; before: "lifts her fingertips off it" and then "Her
 * hand ends at the card"). New with 11: anchor 2.3 (both hands at the shoe; Jakob 2026-11-18), its entry from rest
 * (SAY.reach['2.3'], SAY.eyesStay) and the deal with two hands as the session MODEL measured it on a real dealer
 * (SAY.strokeOut, SAY.meetAt, SAY.raiseAndTurn, SAY.layPalmDown, SAY.shoeHandBack, SAY.headToPlace): the hand at the shoe
 * strokes the card out and brings it flat on the felt to the other hand, both hands tip it up onto a short end, the other
 * hand turns it over in the air and lays it palm down with its fingertips on it, and her head follows the place. Untried as a
 * text. And the short entry
 * no longer opens on "Both hands rest on the felt." (SAY.bothRest): the first frame shows it, and the resting hand is said
 * once, by "The other hand rests on the felt.".
 * 12 (2026-11-20): no thing twice in the clauses of a text either (Jakob: "så att det inte blir dubbla typer av meningar").
 * Template 11 counted sentences by topic; a search of every text the line can compose for word sequences that stand twice
 * found the same thing said again inside another sentence. Which side of the card is up now stands where the card is
 * carried or turned and has left the lay: a closed card's lay and stop no longer repeat "yellow side up" (SAY.layClosed,
 * SAY.layClosedOneWay; a closed drag stops on SAY.stopFlat and SAY.stopFlatOneWay, as the slid card always did), and the
 * deal with two hands says yellow side up, blue side up and palm down once each, in the turn or the carry (SAY.strokeOut,
 * SAY.layAtPlace, SAY.layAtPlaceOneWay). "As in the last frame" stands once in the entry to anchor 2.3 (SAY.eyesStay), a
 * still says once what is taken from @pose (SAY.stillChange leaves it to SAY.v11.stillPose; from 2026-11-23 a still of 12
 * or later has no pose picture and says nothing of one), and the return to anchor 2.3 names
 * the hand at the shoe once (SAY.glideBeside; its sentences were written outside SAY before). The open deal by the hand at
 * the shoe is unchanged, word for word, and so is every text not named here. The words of 11 stay in SAY.v11; fromTwelve
 * chooses. Untried as texts.
 */
export const TEMPLATE_VERSION = 12;
/**
 * The templates a new order may be written with, chosen per order (NewOrder.template; absent: TEMPLATE_VERSION).
 * 13 (2026-11-21, the review of the method, .runtime/metod-granskning section 4): shorter texts that leave to the pictures
 * and the reference film what they already show, for four cases: the deal from 2.3 and the deal by the hand at the shoe
 * from 2.1 (open, bara dit, the marks in the last picture, the card at the plan's size), the return to 2.3 and the
 * return to rest after the right hand laid the card (open). Every other case, and a closed card or a missing mark, is
 * written as 12 writes it and named @13. Not the default: pilot 02's text (12) stays until a trial shows 13 is as good or
 * better. An order keeps its choice when its text is written again (orderPrompt).
 * 14 (2026-11-23): 12 word for word but for two sentences of the short text (SAY.v14; fourteen chooses); every other text
 * is 12's, named @14, and 13's shorter texts are not in it. One: the reference film is a rough guide and her natural
 * movement comes first (SAY.v14.reference). Jakob 2026-11-23 of the films from anchor 2.3, made with the doll's films as
 * video 1: "lite lite robotliknande och onaturliga", and "kanske man borde skicka med i instruktionerna med dessa videos
 * med docka typ att '..filmen ska få rörelserna av vår dealer att vara naturlig primärt, så var inte extremt nitsk med
 * dockans rörelse..'" (docs/BESKED.md). The sentence still says that video 1 shows only the movement: the doll is white and
 * has no face. Two: the entry to anchor 2.3 says where her other hand ends in the anchor now used as last picture
 * (paow-ankare-2-3-c), flat on the felt in front of her (SAY.v14.reach23); 12 says both hands go to the shoe and the other
 * one waits close beside it, against that picture. Not today's template (TEMPLATE_VERSION), but since 2026-11-23 the one
 * the recipes of the deal from 2.3 and the entry to it are written with (data/order-methods.json, whose evidence carries
 * Jakob's verdicts of that day on one deal and one entry written with it).
 * 15 (2026-11-23): 14 word for word but for the deal with two hands tur och retur (SAY.v15; fifteen chooses), after the
 * trial to seat 5 (paow-giv-2-3-p5-04) and Jakob's verdict on it, "hennes högerhand inte är så vriden vid nedsläpp": the hand
 * that lays the card is flat with a relaxed wrist, it goes back to where the first frame has it (the felt in front of her,
 * not the shoe, which 14 says against the picture), and a yellow card shows in the shoe's window all through (the window
 * stood empty for 42 frames). A choice per order (--mall 15) until a trial shows it holds; the recipe stays 14.
 * 16 (2026-11-24): 15 word for word but for the closed card with two hands from anchor 2.3 (SAY.v16; sixteen chooses),
 * after the first closed card ordered from 2.3 (paow-giv-2-3-d-02, template 15, the dealer's first card): the card came
 * over to its blue side where the hands met (frames 9 to 11), lay blue and jumped to yellow in one frame (44), though the
 * doll's film and the last picture show yellow all the way. The closed words until then (SAY.takeClosed, untried) had the
 * other hand take the card "by its short end" and "carry" it, the grip and the lift of the turn, where the doll's film
 * slides it flat under the fingertips; the card's look named a blue side that a closed card never shows; and the way back
 * went "to the shoe" against the first picture (15's way back was the open card's alone). 16 says what the film shows:
 * the other hand lays its fingertips on the card and slides it on flat along the felt, stops it and lifts off it, goes back
 * to rest in front of her, a yellow card shows in the window all through, and the card is blank yellow. A choice per order
 * (--mall 16); an open card is written as 15 writes it.
 */
export const TEMPLATE_CHOICES: readonly number[] = [TEMPLATE_VERSION, 13, 14, 15, 16];
/** The choices as the words of a Swedish message: "12, 13 eller 14". */
export const TEMPLATE_CHOICES_WORDS = new Intl.ListFormat('sv', { type: 'disjunction' }).format(TEMPLATE_CHOICES.map(String));
/** The version of the long text (template 3, 2026-11-13); Utförlig writes it unchanged. */
export const LONG_VERSION = 3;
export type Dealer = { name: string; look: string };
export type DealMotion = { grip: Grip; hand?: 'LH' | 'RH'; pass?: boolean; turn: boolean; flipAxis: FlipAxis | null; side: 'FRONT' | 'BACK' };
export type PromptInput = {
  /** The formula's version the text is written with (absent: today's). An order stored with an older one is reproduced with it. */
  version?: number;
  dealer: Dealer;
  step: StepKey;
  model: string;
  /** For a deal: the grip, the hand that takes the card and whether it is handed over, the turn, and the side it lands with. */
  motion?: DealMotion | null;
  /** Where the card lands in the picture (bank pixels, 1764 × 1174). */
  place?: { x: number; y: number } | null;
  /** Jakob's own addition, put before the bans. */
  extra?: string | null;
  /** The text's style; absent: Kort (a new order). Utförlig is the text of template 3, which only a stored order has. */
  style?: TextStyle;
  /** A deal that ends on the landing picture (bara dit) instead of going back to the shoe. */
  oneWay?: boolean;
  /** A reference film goes with the order. */
  reference?: boolean;
  /** The card drawn at this factor of the plan's size (a trial): no sentence may then say it keeps the size it has in the shoe. */
  cardScale?: number;
  /** The last picture shows the blue side's marks, the pink cross and the red circle (tools/order-images.ts markSeen): an open deal's text then says them instead of a blank blue side. */
  faceMark?: boolean;
  /** The first picture shows a mark on the yellow back in the shoe's window (a trial, Jakob 2026-11-23: a filled red circle in the middle and a pink cross near the card's end): the text then says it instead of a blank yellow back. Set per order, never read from the picture. */
  backMark?: boolean;
};
/** What a part of the text comes from: a choice in the sheet, Jakob's addition, the reference film, or the bans. */
export type Choice = 'hand' | 'side' | 'turn' | 'place' | 'shape' | 'reference' | 'extra' | 'bans';
export type Part = { text: string; from: Choice[] };
export type Prompt = { template: string; style: TextStyle; text: string; parts: Part[] };

/**
 * The card, plain on both sides (from template 9): the sentence of round 14's addition, after which WAN 3 kept the card
 * and the shoe's card plain the whole film (paow-giv-2-2-p6-02); takes without it showed a printed playing card (Jakob: "ett
 * blått spelkort"), the card in the shoe's gold-framed window too. Said once in a text: alone in Minimal, after "Only one
 * card moves." in Kort.
 */
const PLAIN_CARD = 'The card is plain, one flat solid yellow from edge to edge on its back and one flat solid blue from edge to edge on its face, and the next card in the window is the same plain solid yellow.';

/**
 * Every sentence of the short (Kort) and minimal texts, each once, in the order of the handbook's skeleton
 * (tools/film-prompting.md §2: camera, reference, the action with the hand named by where it is, the turn, the way back,
 * the other hand, the card, Jakob's addition). The turn (turnAtPlace, the handbook's turn A) is one a left hand can make
 * from a card that has come back up under its fingertips: palm down, the thumb lies at the card's inner long edge, slides
 * under it and lifts it; the forearm turns thumb side up (outward); the opposite long edge stays on the felt as a hinge, so
 * the card never flies and keeps its size; the thumb comes over onto the blue face. Said by the hand's own parts, it holds
 * for the right hand too, mirrored. Template 6 alone said the card's two sides by colour and by which one is up; its
 * words stay in `v6` so that an order stored with it reproduces its text. Template 9 replaced the turn on the way, the open
 * card from the drag and the card's colours; the words of templates 4 to 8 stay in `v8` for the same reason.
 */
export const SAY = {
  camera: 'Locked camera, one continuous shot.',
  cameraMinimal: 'Locked camera.',
  // Kling 4 ignores tags and reads the reference films in order: the texts that held called it "video 1".
  reference: 'Video 1 shows only the movement: she moves like the dealer in video 1, with the same timing.',
  // The card: one two-sided object (templates 4, 5 and from 7), plain on both sides from template 9 (PLAIN_CARD).
  colours: PLAIN_CARD,
  oneCardMoves: `Only one card moves. ${PLAIN_CARD}`,
  // Template 6 only, kept word for word: the two sides by colour and by which one is up, after "Only one card moves. It
  // is" (Kort) or "The card is" (Minimal).
  v6: {
    sides: {
      open: 'yellow on one side and blue on the other: yellow side up when it leaves the shoe, blue side up when it lies at its place.',
      closed: 'yellow on one side and blue on the other, and it stays yellow side up the whole way.',
      turned: 'yellow on one side and blue on the other: it lies yellow side up, and after the turn it lies blue side up.',
      // A return starts with the card lying at its place.
      liesOpen: 'yellow on one side and blue on the other: it lies blue side up.',
      liesClosed: 'yellow on one side and blue on the other: it lies yellow side up.',
    },
    oneCardIs: (sides: string) => `Only one card moves. It is ${sides}`,
    cardIs: (sides: string) => `The card is ${sides}`,
    turnAtPlace: 'There her thumb slides under the long edge nearest it and lifts it as her wrist turns thumb side up; the card rolls over on its opposite long edge, which stays on the felt, and her thumb comes over onto the blue side.',
  },
  // Templates 4 to 8, kept word for word (the card's sides of template 6 excepted): the turn on the way said without the
  // wrist and without the hand staying turned (in Jakob's order paow-giv-2-2-p4-02 it turned back before the card lay), the
  // open card from the drag lifted off the felt at the shoe, and the card's colours without that it is plain.
  v8: {
    colours: "The card's back is yellow and its face is blue.",
    oneCardMoves: 'Only one card moves; its back is yellow and its face is blue.',
    liftTowards: 'lifts it off the felt and carries it low over the felt towards its place',
    turnOnTheWay: 'On the way her hand turns the card over once, holding it the whole time, and lays it flat at its place, blue side up.',
    rollOnTheWay: 'On the way her wrist turns thumb side up and the card, held between thumb and fingers, rolls over once about its long side; she lays it flat at its place, blue side up.',
  },
  // Templates up to 11, kept word for word for their stored orders: the sentences that said a thing a second time, which
  // template 12 says once (TEMPLATE_VERSION's note). A closed card's lay repeated the side its carry had said; the deal
  // with two hands said yellow side up, blue side up and palm down twice each; the entry to anchor 2.3 said "as in the
  // last frame" twice; a still said twice what is taken from @pose; the return to anchor 2.3 said the hand at the shoe twice.
  v11: {
    layClosed: 'She lays it flat there, yellow side up.',
    layClosedOneWay: 'She lays it flat there, yellow side up, and her fingertips come to rest on it, as in the last frame.',
    stopClosed: 'She stops it there, yellow side up, and lifts her fingertips off it.',
    stopClosedOneWay: 'She stops it there, yellow side up, and her fingertips stay on it, as in the last frame.',
    strokeOut: 'strokes the yellow card out of the window and slides it flat on the felt, its broad yellow side up,',
    layPalmDown: 'She lays the card flat at its place, blue side up, with her palm down, and her fingertips come to rest on it, as in the last frame.',
    layPalmDownRound: 'She lays the card flat at its place, blue side up, with her palm down.',
    eyesStay: 'Her eyes go down to her hand at the card and stay there, as in the last frame.',
    glideBeside: 'Her open right hand glides back low over the felt, palm down, and settles beside her left hand at the shoe as in the last frame. Her left hand stays at the shoe.',
    stillChange: {
      'ANKARE-2.1': "Change only her hand nearest the shoe: it holds the yellow card between thumb and forefinger, the fingertips resting on the card's own upper edge, and has drawn the card a little way up out of the window, placed and shaped as the hand in @pose.",
      'ANKARE-2.2': 'Change only her hand nearest the shoe: it lies over the yellow card in the window, the tips of her index, middle and ring fingers resting flat on the card itself and her little finger on the shoe beside the window, ready to slide the card out along the felt, placed and shaped as the hand in @pose.',
    },
    // The pose picture's sentence, which every still had until a still went out with its anchor alone (2026-11-23); the
    // stills stored with it are all of template 11 or older.
    stillPose: '@pose is a cut-out on plain green that shows only a forearm and hand at the same window shoe; take from it only where the hand is and how the wrist and fingers hold the card. Her own sleeve, skin and hand stay as in @anchor, and her forearm continues up to her own elbow and shoulder.',
  },
  // A deal: take and carry.
  pinchOut: 'draws the yellow card out of the window',
  slideOut: 'slides the yellow card out of the window',
  carryBack: 'carries it low over the felt, yellow side up, to its place',
  dragBack: 'drags it flat along the felt under its fingertips, yellow side up, to its place',
  carryTowards: 'carries it low over the felt towards its place',
  // An open card from the drag (from template 9): along the felt under the fingertips, taken up only on the way (Jakob
  // 2026-11-17: "Varför släpar hon tex inte kortet som hon borde?").
  dragTowards: 'drags it flat along the felt under its fingertips towards its place',
  handAtShoe: 'Her hand at the shoe',
  otherReaches: 'Her hand at the shoe lets go of the card and waits beside the shoe, and her other hand reaches across to the shoe,',
  handover: 'brings it low over the felt to the middle in front of her, where her other hand takes it by its edges and',
  // Handbyte with an open card from the drag (from template 9): dragged to the middle, where the other hand takes it.
  handoverDrag: 'drags it flat along the felt under its fingertips to the middle in front of her, where her other hand takes it by its edges and',
  // A deal: the turn, said once, or no turn. On the way (from template 9) the wrist turns over with the card and stays
  // turned until the card lies (Jakob 2026-11-17: "måste hon vrida över handleden"); the hand that dragged the card takes
  // it between thumb and fingers first. The same words hold for the right hand, mirrored.
  turnAtPlace: 'There her thumb slides under the long edge nearest it and lifts it as her wrist turns thumb side up; the card rolls over on its opposite long edge, which stays on the felt, and her thumb comes over onto the blue face.',
  takeOnTheWay: 'her thumb and fingers take the card at its edge',
  turnOnTheWay: (drag: boolean): string =>
    `On the way${drag ? ` ${SAY.takeOnTheWay}, and her wrist` : ', with the card held at its edge between thumb and fingers, her wrist'} turns over once: her palm comes from facing down to facing up, and the card comes over with her hand, blue side up. ${SAY.layTurned}`,
  rollOnTheWay: (drag: boolean): string =>
    `On the way ${drag ? `${SAY.takeOnTheWay}, her wrist turns thumb side up and the card rolls` : 'her wrist turns thumb side up and the card, held between thumb and fingers, rolls'} over once about its long side, blue side up. ${SAY.layTurned}`,
  layTurned: 'With her hand still turned, she lays the card flat at its place and lets go of it; only then does her empty hand turn palm down.',
  // Template 10 (the reference-film trials, 2026-11-17): an open deal's words, as text C of the first trial sent them.
  pinchHold: 'draws the yellow card up out of the window, holding it by its short end between thumb and fingers, its broad yellow side towards the camera,',
  dragFlat: 'drags it flat along the felt under her fingertips, its broad yellow side up, towards its place',
  keyOnTheWay: (drag: boolean): string =>
    `On the way ${drag ? 'her thumb and fingers take the card at its edge, her wrist rolls once and' : 'her wrist rolls once and'} her hand and the card turn over together about the card's long side, like turning a key: the broad yellow side narrows to a thin edge, then the broad blue side opens towards the camera.`,
  keyAtPlace: (drag: boolean): string =>
    `Close to its place ${drag ? 'her thumb and fingers take the card at its edge, her wrist rolls once and' : 'her wrist rolls once and'} her hand and the card turn over together about the card's long side, like turning a key: the broad yellow side narrows to a thin edge, then the broad blue side opens towards the camera.`,
  layOneWay: 'With her hand still turned and the same hold, she lays the card flat at its place, blue side up, and her fingertips come to rest on it, as in the last frame.',
  oneCardMovesSized: 'Only one card moves: a small card, about half as long as her hand, which keeps the size it has in the last frame all the way from the shoe to its place. It is blank, solid yellow on one side and solid blue on the other, each colour reaching right out to its corners, and the next card in the window is the same blank yellow.',
  oneCardMovesFree: 'Only one card moves: a small card, about half as long as her hand. It is blank, solid yellow on one side and solid blue on the other, each colour reaching right out to its corners, and the next card in the window is the same blank yellow.',
  blankCard: 'The card is blank, solid yellow on one side and solid blue on the other, each colour reaching right out to its corners, and the next card in the window is the same blank yellow.',
  // A closed card's lay (from template 12 without its side, which the carry before it has said: SAY.carryBack, SAY.takeClosed).
  layClosed: 'She lays it flat there.',
  // A closed deal bara dit (from template 11): the end said once, with the fingertips where the last frame shows them. A
  // card that came along the felt under the fingertips, slid or dragged, stops there (from template 12 the drag too).
  layClosedOneWay: 'She lays it flat there, and her fingertips come to rest on it, as in the last frame.',
  stopFlatOneWay: 'She stops it there, and her fingertips stay on it, as in the last frame.',
  // The deal with two hands from anchor 2.3 (from template 11), as the session MODEL read it frame by frame off a real dealer
  // (D:/dealer-scratch/tmp/yt-referens/ut/giv-fran-2-3.md; untried as a text): the hand at the shoe strokes the card out and
  // brings it flat on the felt to her other hand, which meets it 7 to 31 cm from the shoe's mouth, further out the further
  // the seat lies (meetAt); both hands tip it up onto a short end; the other hand lets it go on over that end in the air
  // and lays it with its palm down, fingertips on the card; the hand from the shoe goes back to the shoe; her head
  // follows the place, not the shoe. From template 12 the side that is up and the palm are said once, by the turn
  // (raiseAndTurn) or the closed carry (takeClosed), and no longer by the stroke and the lay as well.
  strokeOut: 'strokes the yellow card out of the window and slides it flat on the felt',
  meetAt: { near: 'just in front of the shoe, where her other hand meets it', mid: 'a short way out from the shoe, where her other hand meets it', far: 'to the middle in front of her, where her other hand meets it' },
  // The turn of the real dealer, read in close-up (yt-referens/ut/vandning-narbild.md): end over end about the short end the
  // card stands on, a quarter up by both hands and a quarter on and down by the other hand, towards the player. One whole
  // turn, said as one: it begins yellow side up and ends blue side up, never begun and broken off (Jakob 2026-11-18).
  raiseAndTurn: (carry: string): string =>
    `There both hands tip the card up onto its short end, and her other hand, palm down, carries it on ${carry}; on that way the card goes on over the same short end, end over end, in one unbroken turn that begins with the yellow side up and ends with the blue side up.`,
  takeClosed: (carry: string): string => `There her other hand takes it by its short end, palm down, and carries it on low over the felt, yellow side up, ${carry}.`,
  layAtPlaceOneWay: 'She lays the card flat at its place, and her fingertips come to rest on it, as in the last frame.',
  layAtPlace: 'She lays the card flat at its place.',
  shoeHandBack: 'The hand from the shoe lets go once the card stands on its end and settles back at the shoe.',
  shoeHandBackClosed: 'The hand from the shoe lets go once her other hand holds the card and settles back at the shoe.',
  headToPlace: 'Her head stays bowed and turns towards the place where the card will lie.',
  backTwoHands: 'Then the hand that laid it glides back low over the felt, palm down, to the shoe, as in the first frame.',
  // A closed card from the pinch (from template 7): laid flat in front of the shoe and slid, never carried tilted.
  layAndSlide: 'lays it flat on the felt in front of the shoe and slides it under her fingertips, flat and yellow side up, to its place',
  stopFlat: 'She stops it there and lifts her fingertips off it.',
  // A deal: back to the shoe, or the end on the landing picture.
  backPinch: 'Then her open hand glides back low over the felt, palm down, to the shoe and takes the next card.',
  backDrag: 'Then her open hand glides back low over the felt, palm down, to the shoe and rests over the next card in the window.',
  backOther: (drag: boolean) => `Then the hand that laid it glides back low over the felt, palm down, to where it lay in the first frame, and her hand at the shoe ${drag ? 'rests over the next card in the window' : 'takes the next card'}.`,
  // After a handover the hand that gave the card is in the middle, not at the shoe (from template 7): it goes back there.
  backPass: (drag: boolean) => `Then the hand that laid it glides back low over the felt, palm down, to where it lay in the first frame, and the hand that gave it goes back to the shoe and ${drag ? 'rests over the next card in the window' : 'takes the next card'}.`,
  endAtCard: 'Her hand ends at the card, as in the last frame.',
  otherRests: 'The other hand rests on the felt.',
  // A deal moved her a little in template 7 alone (Jakob: "Hon är väldigt stel", "rör sin kropp och huvud och SIN högerarm
  // aningen mer"): kept word for word for its stored orders; the card went wrong in 15 of 18 takes.
  moveOwn: 'As she deals, her head and eyes follow the card, her shoulders turn a little with the reach, and her other hand shifts a little where it lies on the felt.',
  moveBoth: 'As she deals, her head and eyes follow the card and her shoulders turn a little with the reach.',
  // Minimal.
  oneCard: 'One card goes from the shoe to where the last frame shows it.',
  oneCardBack: 'One card goes from the shoe to where the last frame shows it, and the hand comes back to its pose in the first frame.',
  // A return, from the landing picture.
  liftOff: (colour: string) => `Her fingertips lift off the ${colour} card, which stays where it lies.`,
  glideTo: {
    '2.1': 'Her open hand glides back low over the felt, palm down, to the shoe, where her thumb and forefinger take the top edge of the next yellow card.',
    '2.2': 'Her open hand glides back low over the felt, palm down, to the shoe and comes to rest over the next yellow card, fingertips flat on it.',
    '1': 'Her open hand glides back low over the felt, palm down, and comes to rest flat on the felt.',
  },
  glideOther: (to: '2.1' | '2.2') => `Her open hand glides back low over the felt, palm down, to where it rests in the last frame, and her other hand, at the shoe, ${to === '2.1' ? 'takes the top edge of the next yellow card' : 'comes to rest over the next yellow card'}.`,
  // To rest after her other hand laid the card: the hand that waited at the shoe comes to rest too (from template 7).
  otherFromShoe: 'Her other hand comes away from the shoe and rests flat on the felt too.',
  leaveCard: 'The hand leaves the card where it lies and goes back to its pose in the last frame.',
  // The return to anchor 2.3 (from template 11) names her hands by side: the hand that laid the card comes back beside
  // the hand that stayed at the shoe, said once (from template 12; SAY.v11.glideBeside before).
  liftOffRight: (colour: string) => `Her right fingertips lift off the ${colour} card. The card stays where it lies.`,
  glideBeside: 'Her open right hand glides back low over the felt, palm down, and settles beside her left hand, which stays at the shoe, as in the last frame.',
  // An entry, from rest.
  bothRest: 'Both hands rest on the felt.',
  reach: {
    '2.1': "Her hand nearest the shoe rises calmly and reaches straight to the yellow card in the window; her thumb and forefinger close on the card's upper edge, the forefinger touching only that edge, and draw the card a little way up out of the window, as in the last frame.",
    '2.2': 'Her hand nearest the shoe rises calmly and reaches straight to the yellow card in the window and lays its fingertips flat on the card, as in the last frame.',
    // Anchor 2.3 (from template 11): both hands at the shoe just before the deal.
    '2.3': 'Both her hands rise calmly and go to the shoe: her hand nearest the shoe lays its fingertips on the yellow card in the window, ready to stroke it out, and her other hand comes to wait close beside the shoe, as in the last frame.',
  },
  // Jakob of the entry film: "hon rör inte blicken, vilket är tråkigt".
  eyes: 'Her eyes follow her hand down to the shoe and come back up.',
  // To anchor 2.3 she looks down at the hand that strokes the card out, and keeps looking there (Jakob 2026-11-18). The
  // reach before it ends on the last frame; from template 12 this sentence does not say the last frame again.
  eyesStay: 'Her eyes go down to her hand at the card and stay there.',
  reachMinimal: 'Her hand goes from the table to the yellow card in the shoe, as in the last frame.',
  reachBothMinimal: 'Both her hands go from the table to the shoe, as in the last frame.',
  // The way out, from the pinch at the shoe to rest (READY>IDLE, anchor 2.1 to anchor 1): one action.
  leaveShoe: "Her thumb and forefinger let the yellow card settle back into the shoe's window, and her hand comes back low over the felt, palm down, and rests flat on the felt, as in the last frame.",
  // The way out from the drag (READY-B>IDLE, anchor 2.2 to anchor 1): the hand lies flat over the card in the window.
  leaveDrag: "Her fingertips lift off the yellow card in the shoe's window, which stays where it lies, and her hand comes back low over the felt, palm down, and rests flat on the felt, as in the last frame.",
  // The way out from both hands at the shoe (READY-C>IDLE, anchor 2.3 to anchor 1): both hands come to rest.
  leaveBoth: "Her fingertips lift off the yellow card in the shoe's window, which stays where it lies, and both her hands come back low over the felt, palms down, and rest flat on the felt, as in the last frame.",
  leaveBothMinimal: 'Both her hands go from the shoe back to the table, as in the last frame.',
  eyesUp: 'Her eyes come up from the shoe towards the players.',
  leaveMinimal: 'Her hand goes from the yellow card in the shoe back to the table, as in the last frame.',
  // The hole card turned open from rest (IDLE>REVEAL(D.C1)): the reach, the turn at the place (turnAtPlace), the way back.
  revealReach: (where: string | null) => `Her hand nearest the shoe goes low over the felt to the yellow card lying ${where ?? 'in front of her'}.`,
  revealMinimal: 'One card in front of her turns from yellow to blue, as in the last frame, and her hand goes back to rest.',
  // A rest: the fixed part; Jakob's addition says what happens.
  rest: 'She starts and ends exactly as in the first frame, and holds still for the last half second.',
  restMinimal: 'She starts and ends as in the first frame.',
  // A still (an edit of @anchor), said positively: what is there, no list of bans.
  stillEdit: 'This is an edit of the picture @anchor.',
  stillKeep: "Keep everything in @anchor exactly as it is: the framing and camera, the flat chroma-green background and table, the black card shoe at the right with the yellow card in its window, and the woman's face, hair, clothes, build and her hand at the left of the picture, lying flat on the felt.",
  // What the hand does (from template 12; SAY.v11.stillChange also said what was taken from @pose).
  stillChange: {
    'ANKARE-2.1': "Change only her hand nearest the shoe: it holds the yellow card between thumb and forefinger, the fingertips resting on the card's own upper edge, and has drawn the card a little way up out of the window.",
    'ANKARE-2.2': 'Change only her hand nearest the shoe: it lies over the yellow card in the window, the tips of her index, middle and ring fingers resting flat on the card itself and her little finger on the shoe beside the window, ready to slide the card out along the felt.',
  },
  stillStandard: 'Her elbows hang free at her sides and her forearms come down to the felt. Her jacket continues down to the straight horizontal line where her body is cut off in @anchor. The green is one even colour right up to her outline, her hands, the card and the shoe. Soft, even frontal studio light; natural skin with fine texture, sharp eyes, matte black cloth with soft folds.',
  stillCard: 'There is one card, the one in the window, with the size and shape it has in @anchor.',
  // Template 13 (TEMPLATE_CHOICES), word for word as the review of the method wrote it (2026-11-21, its section 4).
  v13: {
    strokeTurnLay: 'Her hand at the shoe strokes the yellow card out, and her other hand turns it over in one unbroken turn and lays it flat, blue side up, where the last frame shows it, with her fingertips resting on it.',
    pinchTurnLay: 'Her hand at the shoe takes the yellow card between thumb and fingers and carries it low over the felt; on the way her wrist turns over once and the card turns with it in one unbroken turn, and she lays it flat, blue side up, where the last frame shows it, with her fingertips resting on it.',
    card: 'Only one card moves, and it keeps the size it has in the last frame. Its back is blank solid yellow, right out to its corners, and its face is solid blue with a small pink cross in the middle and a small red dot in one corner, as the last frame shows it; the next card in the window is the same blank yellow.',
    liftOff: 'Her hand on the blue card lifts off it, and the card stays where it lies.',
    // The return to 2.3 ends on anchor 2.3, both hands at the shoe (Jakob 2026-11-18): the review's "rests flat in front of
    // her" said the opposite of its last frame, so its end says where the hand comes to rest (round two, 2026-11-21).
    back: {
      '2.3': 'That hand glides back low over the felt, palm down, and settles at the shoe beside her other hand, as in the last frame.',
      '1': 'Both her hands come back low over the felt, palm down, and rest flat in front of her, as in the last frame.',
    },
  },
  // Template 14 (TEMPLATE_CHOICES; since 2026-11-23 the recipes' template for the deal from 2.3 and the entry to it,
  // data/order-methods.json): 12 but for these two sentences of the short text.
  v14: {
    // The reference film as a rough guide, her natural movement first (Jakob 2026-11-23: "naturlig primärt, så var inte
    // extremt nitsk med dockans rörelse"). It still shows only the movement: the doll in video 1 is white and has no face.
    reference: 'Video 1 shows only the movement, as a rough guide: her hands go the way the hands go in video 1, at about the same moments. Above all she moves naturally, like a practised dealer, with soft, relaxed arms and hands.',
    // The entry to anchor 2.3 as its last picture shows it (paow-ankare-2-3-c): only her hand nearest the shoe goes to the
    // shoe; her other hand lies flat on the felt in front of her, where the deal brings the card to it (SAY.meetAt).
    reach23: 'Both her hands rise calmly: her hand nearest the shoe goes to the shoe and lays its fingertips on the yellow card in the window, ready to stroke it out, and her other hand comes to rest flat on the felt in front of her, as in the last frame.',
  },
  // Template 15, the deal with two hands tur och retur (TEMPLATE_CHOICES' note).
  v15: {
    flatHand: 'As the card comes down her hand lies flat above it, with a straight, relaxed wrist.',
    back: 'Then the hand that laid it glides back low over the felt, palm down, and comes to rest flat on the felt in front of her, as in the first frame.',
    window: 'A yellow card shows in the window of the shoe all the time: as she strokes one out, the next one is already there.',
  },
  // Template 16, the closed card with two hands from anchor 2.3 (TEMPLATE_CHOICES' note): slid flat under the fingertips
  // as the doll's film shows it, never taken by an end or lifted; stopped with SAY.stopFlat or SAY.stopFlatOneWay, the
  // words of a slid card; and a card whose look names its yellow alone.
  v16: {
    slideClosed: (carry: string): string => `There her other hand lays its fingertips flat on the card and slides it on along the felt, yellow side up, ${carry}.`,
    back: 'Then that hand glides back low over the felt, palm down, and comes to rest flat on the felt in front of her, as in the first frame.',
    shoeHandBack: 'The hand from the shoe lets go as her other hand takes over and settles back at the shoe.',
    cardSized: 'Only one card moves: a small card, about half as long as her hand, which keeps the size it has in the last frame all the way from the shoe to its place. It is blank, solid yellow right out to its corners, and the next card in the window is the same blank yellow.',
    cardFree: 'Only one card moves: a small card, about half as long as her hand. It is blank, solid yellow right out to its corners, and the next card in the window is the same blank yellow.',
  },
} as const;

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const LEFT = 'her left hand, at the right of the picture';
const RIGHT = 'her right hand, at the left of the picture';
const joined = (parts: Part[]) => parts.filter((p) => p.text).map((p) => p.text).join(' ');

/** Who does what in a deal: the hand that takes the card, the one that turns and lays it, and whether it is handed over. */
export function handsIn(m: Pick<DealMotion, 'hand' | 'pass'> | null | undefined): { takes: 'LH' | 'RH'; lays: 'LH' | 'RH'; pass: boolean } {
  const pass = !!m?.pass, takes = pass ? 'LH' : (m?.hand ?? 'LH');
  return { takes, lays: pass ? 'RH' : takes, pass };
}
const handWord = (h: 'LH' | 'RH') => (h === 'LH' ? 'left' : 'right');

/**
 * The turn of the long text, one sentence per choice and per grip; the hand that holds the card while it turns follows the
 * hand chosen. keepsSize false (a card drawn larger than the plan's): the words that it keeps its size are left out.
 */
export function turnSentence(axis: FlipAxis, grip: Grip = 'PINCH', hands: Pick<DealMotion, 'hand' | 'pass'> | null = null, keepsSize = true): string {
  const { lays, pass } = handsIn(hands);
  if (axis === 'AT_PLACE') {
    const start = grip === 'DRAG' && !pass ? 'At the place her fingertips tip the card up onto its long edge and her thumb and fingers take hold of it; her wrist rolls it on' : `At the place the wrist of her ${handWord(lays)} hand rolls: the card tilts up onto its long edge, held between thumb and fingers, and the roll goes on`;
    return `${start} until its blue face is up, one edge staying near the felt; it is one card turned over once${keepsSize ? ', keeping its size' : ''}.`;
  }
  if (axis === 'LONG_EDGE') {
    const lift = grip === 'DRAG' && !pass ? 'On the way she lifts the card from the felt and rolls it' : 'On the way she rolls the card';
    return `${lift} over about its long side: she turns her wrist once, the yellow back narrows to a thin pale edge along the card's long side, then the blue face comes up; ${pass ? 'her right hand' : 'the same hand'} holds the card the whole time.`;
  }
  const from = pass ? 'from its grip on the card' : grip === 'DRAG' ? 'once she has lifted it from the felt with her fingertips' : 'from this pinch';
  return `On the way ${pass ? 'her right hand turns' : 'she turns'} the card over once, the way a real hand can ${from}: one natural movement of fingers and wrist that a human hand can actually make, the card held firmly the whole time${keepsSize ? ' and keeping its size' : ''}, until its blue face is up.`;
}

/** What must not happen in a film that deals no card (an entrance, a rest). */
export const BANS_FILM =
  'Nothing of this happens: a second card appears, a finger passes through the card, the card grows or shrinks on its way, a hand hovers in the air without holding or laying anything, the shoe changes, the picture cuts or the camera moves.';
/** What must not happen in a deal: the film bans, with what the chosen hand and side must not do. */
export function bansFor(m: Pick<DealMotion, 'hand' | 'pass' | 'side' | 'flipAxis' | 'turn'> | null | undefined, keepsSize = true): string {
  const { takes, pass } = handsIn(m);
  const own: string[] = [];
  if (m) {
    if (pass) own.push('the card is handed over high in front of her chest', 'the card is tossed or dropped between the hands', 'each hand holds a card of its own', 'the left hand lays the card on the table');
    else if (takes === 'LH') own.push('her right hand lifts from the table or touches the card');
    else own.push('her left hand carries the card');
    if (m.side === 'BACK') own.push('the card shows its blue face');
    else if (m.flipAxis === 'AT_PLACE') own.push('the card is turned in the air on the way');
  }
  return `Nothing of this happens: ${['a second card appears', ...own, 'a finger passes through the card', ...(keepsSize ? ['the card grows or shrinks on its way'] : []), 'a hand hovers in the air without holding or laying anything', 'the shoe changes', 'the picture cuts or the camera moves'].join(', ')}.`;
}
export const BANS_STILL =
  "Nothing of this happens: the fingers rest on the shoe instead of on the card, a second card appears, a finger passes through the card, the card has another size or shape than the card in the shoe's window, a hand floats in the air without holding anything, a second shoe appears, the framing changes.";

/** Where the card lies in the picture, in words a model can find (bank pixels, 1764 × 1174). */
export function placeWords(place: { x: number; y: number }): string {
  const near = place.y < 960 ? 'close to her body, ' : '';
  const x = place.x;
  const across = x < 450 ? 'far to the left of the picture' : x < 800 ? 'to the left of the middle of the picture' : x > 1310 ? 'far to the right of the picture' : x > 960 ? 'to the right of the middle of the picture' : 'in the middle of the picture';
  return near + across;
}

/**
 * Where a card's place is, for the short text: one phrase per seat of the plan, so that the hand goes there. Without it
 * ("to its place" alone, template 4) WAN 3 laid the card in front of her at five of six other seats than the middle ones
 * and let the last frame's card appear by itself (rounds 3 and 3b, 2026-11-13).
 */
export function whereShort(place: { x: number; y: number }): string {
  const x = place.x;
  const across =
    x < 340 ? 'at the far left of the picture'
    : x < 540 ? 'well to the left of the middle of the picture'
    : x < 760 ? 'a little to the left of the middle of the picture'
    : x <= 960 ? 'in the middle of the picture'
    : x <= 1180 ? 'a little to the right of the middle of the picture'
    : x <= 1390 ? 'well to the right of the middle of the picture, in front of the shoe'
    : 'at the far right of the picture, in front of the shoe';
  return (place.y < 960 ? 'close in front of her, ' : '') + across + ', where the last frame shows it';
}

/** What the dealer's standard says about the body, for a still made as an edit of @anchor. */
export const STANDARD_STILL =
  "She sits on a chair that is not in the picture: her elbows hang free at her sides and her forearms come down to the felt; nothing supports her elbows or forearms. Her jacket continues down to the same straight horizontal line where her body is cut off in @anchor, with no green between the jacket and that line. The green is one even colour everywhere, right up to her outline: no shadows under or beside her arms, her hands, the card or the shoe. Soft, even frontal studio light; natural skin with fine texture, sharp eyes, matte black cloth with soft folds.";

/**
 * What @pose is, said before it is used: a forearm and hand at the dealer's own window shoe, nothing else of a person. For
 * 2.2 the shoe and card are the dealer's own from @anchor; for 2.1 the bank's frame of the same window shoe, within 2 px.
 */
export const POSE_IS =
  '@pose is a cut-out on plain green: it shows only a left forearm in a black sleeve, cut off at the elbow, and its hand at the yellow card of the black card shoe, the same window shoe that stands at the right in @anchor; nothing else of that person is in it.';

function stillText(input: PromptInput): Prompt {
  if ((input.style ?? 'KORT') !== 'UTFÖRLIG') {
    // The short still: what is there, positively; nothing of her look (@anchor shows her) and no list of bans.
    const parts: Part[] = [
      { text: SAY.stillEdit, from: [] },
      { text: SAY.stillKeep, from: [] },
      { text: (fromTwelve(input) ? SAY.stillChange : SAY.v11.stillChange)[input.step === 'ANKARE-2.2' ? 'ANKARE-2.2' : 'ANKARE-2.1'], from: [] },
      // No pose picture goes out (2026-11-23); a still stored before said what to take from it.
      ...(fromTwelve(input) ? [] : [{ text: SAY.v11.stillPose, from: [] }]),
      { text: SAY.stillStandard, from: [] },
      { text: SAY.stillCard, from: [] },
      extraPart(input),
    ];
    return { template: templateOf('bild-ankare', 'KORT'), style: 'KORT', text: joined(parts), parts };
  }
  // The long still: only the stills stored with it (a new still is KORT), word for word, with the pose picture they were sent with.
  const look = input.dealer.look;
  // 2.2: the pose's hand is wider than the window card, so its little finger rests on the shoe beside the window, as it
  // rested beside the card in the bank's older 2.2 that those stills were sent with as their pose.
  const pose =
    input.step === 'ANKARE-2.1'
      ? "she reaches to the shoe and holds the yellow card itself between thumb and forefinger at its upper edge: the fingertips are on the card, not on the shoe's rim, and she has drawn the card a little out of the window so that her grip on it is plain to see; the card may bend slightly in the pinch. Her hand is placed and shaped as the hand in @pose."
      : "her hand lies over the yellow card in the shoe's window, the tips of her index, middle and ring fingers resting flat on the card itself, not on the gold frame of the window, and her little finger on the shoe beside the window, ready to slide the card out along the felt; her hand is placed and shaped as the hand in @pose.";
  const parts: Part[] = [
    { text: 'This is an edit of the picture @anchor.', from: [] },
    { text: `Keep everything in @anchor exactly as it is: the framing and camera, the flat pure chroma-green background and green table surface with no visible edge, the black card shoe at the right with the yellow card in its window, and the woman herself, ${look}: her face, hair, clothes and build, the place and size of her head and body, and her right hand, at the left of the picture, lying flat on the felt.`, from: [] },
    { text: `Change only her left arm and hand, at the right of the picture: ${pose}`, from: [] },
    { text: `${POSE_IS} Take from @pose only where the hand is and how the wrist and fingers hold the card. Her own sleeve, skin and hand stay as they are in @anchor, and her forearm goes up to her own elbow and shoulder as her body in @anchor allows; the shoe and the yellow card in its window keep exactly the look, size and shape they have in @anchor.`, from: [] },
    { text: STANDARD_STILL, from: [] },
    { text: input.extra?.trim() || '', from: ['extra'] },
    { text: BANS_STILL, from: ['bans'] },
  ];
  return { template: templateOf('bild-ankare', 'UTFÖRLIG'), style: 'UTFÖRLIG', text: joined(parts), parts };
}

/**
 * The template a text is written with: "film-giv-kort@9"; Utförlig always "film-giv@3", the long text of template 3, as
 * every order stored with it is named (before, Utförlig with a reference film, bara dit or another card size was named
 * after today's template, though its words were template 3's).
 */
const templateOf = (kind: string, style: TextStyle) => (style === 'UTFÖRLIG' ? `${kind}@${LONG_VERSION}` : `${kind}-${style === 'KORT' ? 'kort' : 'minimal'}@${TEMPLATE_VERSION}`);
/** Template 14 (TEMPLATE_CHOICES) is 12 but for two sentences of the short text (SAY.v14): the reference film's, and the reach of the entry to anchor 2.3. 15 keeps them. */
const fourteen = (input: PromptInput) => (input.version === 14 || input.version === 15 || input.version === 16) && (input.style ?? 'KORT') === 'KORT';
/** Template 15 is 14 but for the open deal with two hands tur och retur (SAY.v15). 16 keeps it. */
const fifteen = (input: PromptInput) => (input.version === 15 || input.version === 16) && (input.style ?? 'KORT') === 'KORT';
/** Template 16 is 15 but for the closed card with two hands from anchor 2.3 (SAY.v16). */
const sixteen = (input: PromptInput) => input.version === 16 && (input.style ?? 'KORT') === 'KORT';
const referencePart = (input: PromptInput): Part => ({ text: input.reference ? (fourteen(input) ? SAY.v14.reference : SAY.reference) : '', from: ['reference'] });
const extraPart = (input: PromptInput): Part => ({ text: input.extra?.trim() || '', from: ['extra'] });
const DEFAULT_MOTION: DealMotion = { grip: 'PINCH', hand: 'LH', pass: false, turn: true, flipAxis: 'FREE', side: 'FRONT' };
/** Template 6 alone said the card's sides by colour and by which one is up (SAY.v6); before and after, back and face. */
const byColour = (input: PromptInput) => (input.version ?? TEMPLATE_VERSION) === 6;
const turnAtPlace = (input: PromptInput) => (byColour(input) ? SAY.v6.turnAtPlace : SAY.turnAtPlace);
/** From template 7 the way back after two hands follows the arm that is out (and a closed card from the pinch is slid). */
const twoHands = (input: PromptInput) => (input.version ?? TEMPLATE_VERSION) >= 7;
/** Template 7 alone moved her as she deals (SAY.moveOwn, SAY.moveBoth): in 15 of 18 takes the card went wrong. */
const moves = (input: PromptInput) => (input.version ?? TEMPLATE_VERSION) === 7;
/** From template 9 the wrist turns the card on the way and stays turned until it lies, an open drag stays on the felt, and the card is plain. */
const fromNine = (input: PromptInput) => (input.version ?? TEMPLATE_VERSION) >= 9;
/** From template 10 an open deal of the short text is the reference-film trials' text (TEMPLATE_VERSION's note): the hold, the flat drag, the key turn, the one-way lay, the card. */
const fromTen = (input: PromptInput) => (input.version ?? TEMPLATE_VERSION) >= 10;
/** From template 11 every deal bara dit says its end once (TEMPLATE_VERSION's note), and anchor 2.3 has its words. */
const fromEleven = (input: PromptInput) => (input.version ?? TEMPLATE_VERSION) >= 11;
/** From template 12 no clause says again what another has said (TEMPLATE_VERSION's note); the words before it are SAY.v11. */
const fromTwelve = (input: PromptInput) => (input.version ?? TEMPLATE_VERSION) >= 12;
/** The card's colours in Minimal, and "Only one card moves" with them in Kort: plain from template 9, before as templates 4 to 8 said them. */
/**
 * The card's look where a picture carries the blue side's marks (Jakob 2026-11-20: a small pink cross and a small red
 * circle on the blue side, "på så sätt kommer videon ha svårare att fuska med vilken sida av kortet som syns"): the card's
 * sentence with the face said as the picture shows it, so that text and picture agree. A deal's last picture shows it (the
 * blank-card sentence of template 10, and from 2026-11-21 the plain card of a handbyte, of the other hand and of a turn at
 * the place), a return's first picture (Bordet's review 2026-11-21: every text whose picture shows the open card with its
 * marks says them). Only an open card, and only where the picture has the marks; every other text is word for word what it
 * was, the deal with two hands from 2.3 too (its pilots were sent with these words). Untried as a text but for 2.3.
 */
const BLANK_SIDES = 'blank, solid yellow on one side and solid blue on the other, each colour reaching right out to its corners, and the next card in the window is the same blank yellow.';
const MARKED_SIDES = 'back is blank solid yellow, right out to its corners, and its face is solid blue with a small pink cross in the middle and a small red dot in one corner, as the last frame shows it; the next card in the window is the same blank yellow.';
const FACE_MARKS = 'a small pink cross in the middle and a small red dot in one corner';
const plainMarked = (frame: 'first' | 'last') =>
  `The card's back is plain, one flat solid yellow from edge to edge, and its face is one flat solid blue from edge to edge with ${FACE_MARKS}, as the ${frame} frame shows it; the next card in the window is the same plain solid yellow.`;
const marked = (input: PromptInput) => !!input.faceMark && (input.motion ?? DEFAULT_MOTION).side === 'FRONT';
const cardLook = (input: PromptInput, text: string, frame: 'first' | 'last' = 'last') =>
  marked(input) ? text.replace(`It is ${BLANK_SIDES}`, `Its ${MARKED_SIDES}`).replace(`The card is ${BLANK_SIDES}`, `The card's ${MARKED_SIDES}`).replace(PLAIN_CARD, plainMarked(frame)) : text;
/** A return's short text has no sentence of the card's look: where its first picture has the marks, one says them. */
const returnMarks = (input: PromptInput) => (marked(input) ? `The card's blue face has ${FACE_MARKS}, as the first frame shows it.` : '');
const cardColours = (input: PromptInput) => (fromNine(input) ? SAY.colours : SAY.v8.colours);
const cardMoves = (input: PromptInput) => (fromNine(input) ? SAY.oneCardMoves : SAY.v8.oneCardMoves);

/**
 * A deal, sentence by sentence in the order the hand works: the scene; the take (nyp, dra); the carry (för fram), with
 * the handover when the card changes hands; the turn (vrid, vänd upp) or that it is not turned; the lay (lägg); the way
 * back; what the other hand does; the end; Jakob's addition; the bans.
 */
function dealText(input: PromptInput): Prompt {
  const m: DealMotion = input.motion ?? DEFAULT_MOTION;
  const { takes, lays, pass } = handsIn(m);
  const kling = input.model === 'kling-4';
  const oneWay = !!input.oneWay;
  // A card drawn at another size than the plan's (a trial): nothing says it keeps the size it has in the shoe.
  const sized = !!input.cardScale && input.cardScale !== 1;
  const look = input.dealer.look;
  const drag = m.grip === 'DRAG';
  const open = m.side === 'FRONT';
  // Jakob's steps keep the card back up and low along the felt until the place: a closed card, or one turned at the place.
  const alongFelt = !open || m.flipAxis === 'AT_PLACE';
  const colour = open ? 'blue' : 'yellow';
  const sideWords = open ? 'blue face' : 'yellow back';
  const where = input.place ? `${placeWords(input.place)}, ` : '';
  const scene = kling
    ? `One continuous take with a locked-off camera and no cuts. The woman in the first frame is ${look}; she sits at a green table, seen from the front, with the black card shoe fixed at the right of the picture and a yellow card in its window. ${oneWay ? 'She deals one card to its place.' : 'She deals one card and comes back to the pose she started in.'}`
    : `Locked camera. ${cap(look)} sits at a green table with a black card shoe fixed at the right of the picture. One continuous, calm and natural movement from the exact first pose.`;

  // Nyp and dra: the first frame always shows the left hand on the card (anchor 2.1 or 2.2).
  const out = alongFelt ? ' down onto the felt, its yellow back up' : '';
  const pinch = "pinches the yellow card in the shoe's window between thumb and forefinger, the fingertips on the card's own upper edge and not on the shoe's rim";
  const pinched = sized ? `and draws it out of the shoe${out}: one plain rigid card, which lands at the size shown in the last frame.` : `and draws it out of the shoe${out}: the card looks as it does in the shoe, the same size and shape, one plain rigid card.`;
  const slid = sized ? 'slides that one card straight out of the shoe, and it lies flat on the felt, yellow back up; it lands at the size shown in the last frame.' : 'slides that one card straight out of the shoe, and it lies flat on the felt, yellow back up, the same size and shape as it was in the shoe.';
  const take =
    takes === 'LH'
      ? drag
        ? `${cap(LEFT)}, lies over the yellow card in the shoe's window, fingertips on the card. With the fingertips she ${slid}`
        : `${cap(LEFT)}, ${pinch}, as in the first frame, ${pinched}`
      : `${cap(LEFT)}, lets go of the yellow card and rests on the felt beside the shoe. ${cap(RIGHT)}, reaches over to the shoe and ${drag ? `lays its fingertips on the same yellow card and ${slid}` : `${pinch.replace('the yellow card', 'the same yellow card')}, ${pinched}`}`;

  // För fram, with the handover when the card changes hands.
  const toPlace = alongFelt ? `, still yellow back up, to the place where it will lie${open ? '; it is not turned in the air on the way' : ''}.` : ' towards the place where it will lie.';
  const carry = pass
    ? `The left hand ${drag ? 'slides it along the felt' : 'brings it low over the felt'} to the middle of the table in front of her body. There, low over the felt, ${RIGHT}, comes to meet it and takes the same card by its edges between thumb and fingers; the left hand lets go, and there is still only one card. The left hand goes back to the shoe, and the right hand brings the card on low over the felt${toPlace}`
    : drag
      ? `She slides it along the felt in one smooth movement${alongFelt ? `, the fingertips on top of it${toPlace}` : ` towards the place where it will lie, the fingertips on top of it.`}`
      : alongFelt
        ? `The same hand brings it forward low along the felt${toPlace}`
        : 'The same hand carries it low over the table towards the place where it will lie.';

  // Vrid and vänd upp, or not turned.
  const turn = m.turn && open ? turnSentence(m.flipAxis ?? 'FREE', m.grip, m, !sized) : 'She keeps its yellow back up all the way; the card is not turned.';

  // Lägg: a closed card slid along the felt is let go where it stops; any other card is laid flat.
  const by = ` with her ${handWord(lays)} hand`;
  const land =
    drag && !open && !pass
      ? `She stops it${by}, yellow back up, exactly where the yellow card lies in the last frame, ${where}at the same size and angle, lifts her fingertips off it, and the card stays there.`
      : `She lays it flat${by}, ${sideWords} up, exactly where the ${colour} card lies in the last frame, ${where}at the same size and angle, lets go of it, and the card stays there.`;

  const next = drag ? "comes to rest over the next yellow card in the shoe's window" : 'pinches the next yellow card';
  const back =
    takes === 'LH' && !pass
      ? drag
        ? "Then her left hand goes back the same way and comes to rest over the next yellow card in the shoe's window, exactly as in the first frame."
        : 'Then her left hand returns to the shoe and pinches the next yellow card, exactly as in the first frame.'
      : `Then her right hand goes back to rest on the table where it lay in the first frame, and her left hand, ${pass ? 'already back at the shoe' : 'at the shoe'}, ${next}, exactly as in the first frame.`;
  const other =
    pass
      ? 'Her right hand, at the left of the picture, rests on the table until it comes to take the card; the card passes from one hand to the other once, low in front of her.'
      : takes === 'LH'
        ? 'Her right hand, at the left of the picture, rests on the table the whole time.'
        : 'Her left hand waits by the shoe and holds no card while her right hand deals.';
  const card = open ? 'Only one card moves; it is solid yellow on its back and solid blue on its face.' : 'Only one card moves; its back is solid yellow, and its face never shows.';
  const end = kling ? 'She ends exactly as in the last frame.' : oneWay ? 'The clip ends in exactly the pose of the last image, her hand at the card lying on the table.' : 'The clip ends in exactly the pose of the last image, which is the first pose again with the card lying on the table.';

  const parts: Part[] = [
    { text: scene, from: oneWay ? ['shape'] : [] },
    referencePart(input),
    { text: take, from: ['hand'] },
    { text: carry, from: [...(pass ? (['hand'] as Choice[]) : []), ...(alongFelt ? ([open ? 'turn' : 'side'] as Choice[]) : [])] },
    { text: turn, from: open ? ['turn'] : ['side'] },
    { text: land, from: ['side', 'place', 'hand'] },
    { text: oneWay ? '' : back, from: ['hand'] },
    { text: other, from: ['hand'] },
    { text: card, from: ['side'] },
    { text: end, from: oneWay ? ['shape'] : [] },
    extraPart(input),
    { text: bansFor(m, !sized), from: ['bans'] },
  ];
  return { template: templateOf('film-giv', 'UTFÖRLIG'), style: 'UTFÖRLIG', text: joined(parts), parts };
}

/**
 * A deal in the short text: only the movement, in the order it happens, the hand named by what it does (the hand at the
 * shoe, her other hand), the turn said once (or none for a closed card), the way back or the end on the landing picture.
 */
function shortDeal(input: PromptInput): Prompt {
  const m: DealMotion = input.motion ?? DEFAULT_MOTION;
  if (m.grip === 'TWO_HANDS') return twoHandDeal(input, m);
  const { takes, pass } = handsIn(m);
  const drag = m.grip === 'DRAG', open = m.side === 'FRONT';
  // Back up along the felt to the place: a closed card, or one turned at the place; else turned on the way.
  const alongFelt = !open || m.flipAxis === 'AT_PLACE';
  // From template 10 an open deal by the hand at the shoe is written as the reference-film trials sent it (fromTen).
  const ten = fromTen(input) && open && takes === 'LH' && !pass;
  // From template 11 every deal bara dit ends in one sentence, on the last frame: the other hand's and a handbyte's too, and a closed one.
  const once = fromEleven(input) && !!input.oneWay && !ten;
  const out = drag ? SAY.slideOut : ten ? SAY.pinchHold : SAY.pinchOut, seven = twoHands(input), nine = fromNine(input);
  // A closed card from the pinch, by the hand that lays it (from template 7): laid flat in front of the shoe and slid,
  // as the model does well; carried, it tilted and showed its blue face, and changed size when the hand left it.
  const slid = seven && !open && !drag && !pass;
  // An open card from the drag (from template 9) is dragged along the felt, to its place or to the middle where the other
  // hand takes it; before, the hand that took it lifted it off the felt at the shoe, and a handover brought it in the air.
  const dragged = nine && drag && open;
  // The hand that dragged the card itself takes it between thumb and fingers on the way, before its wrist turns.
  const takesOnTheWay = drag && !pass;
  // The place in words (from template 5): the last frame shows it, and the text says which way the hand goes.
  const carryTo = ten ? (drag ? SAY.dragFlat : SAY.carryTowards) : slid ? SAY.layAndSlide : alongFelt ? (drag && !pass ? SAY.dragBack : SAY.carryBack) : drag && !pass ? (nine ? SAY.dragTowards : SAY.v8.liftTowards) : SAY.carryTowards;
  const placed = !!input.place && (input.version ?? TEMPLATE_VERSION) >= 5;
  const carry = placed ? carryTo.replace('its place', 'its place ' + whereShort(input.place!)) : carryTo;
  const and = slid ? ',' : ' and';
  const take =
    pass ? `${SAY.handAtShoe} ${out} and ${dragged ? SAY.handoverDrag : SAY.handover} ${carry.replace('carries it', 'carries it on')}.`
    : takes === 'RH' ? `${SAY.otherReaches} ${out}${and} ${carry}.`
    : `${SAY.handAtShoe} ${out}${and} ${carry}.`;
  // On the way: from template 9 a turn of the wrist that stays turned until the card lies (rolled about the long side, or free).
  const onTheWay = m.flipAxis === 'LONG_EDGE' ? (nine ? SAY.rollOnTheWay(takesOnTheWay) : SAY.v8.rollOnTheWay) : nine ? SAY.turnOnTheWay(takesOnTheWay) : SAY.v8.turnOnTheWay;
  // Template 10: the key turn on the way (FREE and LONG_EDGE) or close to the place (AT_PLACE); a round trip then lays it as 9 did.
  const key = m.flipAxis === 'AT_PLACE' ? SAY.keyAtPlace(takesOnTheWay) : SAY.keyOnTheWay(takesOnTheWay);
  // A closed card's end: laid, or stopped where it came along the felt. From template 12 without "yellow side up", which
  // its way there has said (carryBack, dragBack, layAndSlide); until 11 the lay and the dragged card's stop said it again.
  const closedEnd = fromTwelve(input)
    ? { lay: SAY.layClosed, layOneWay: SAY.layClosedOneWay, stop: SAY.stopFlat, stopOneWay: SAY.stopFlatOneWay }
    : { lay: SAY.v11.layClosed, layOneWay: SAY.v11.layClosedOneWay, stop: SAY.v11.stopClosed, stopOneWay: SAY.v11.stopClosedOneWay };
  const turn = ten ? (input.oneWay ? key : `${key} ${SAY.layTurned}`) : once ? (open ? key : slid ? SAY.stopFlatOneWay : drag && !pass ? closedEnd.stopOneWay : closedEnd.layOneWay) : slid ? SAY.stopFlat : !open ? (drag && !pass ? closedEnd.stop : closedEnd.lay) : m.flipAxis === 'AT_PLACE' ? turnAtPlace(input) : onTheWay;
  const own = takes === 'LH' && !pass;
  // The arm out at the card comes back: the hand at the shoe itself, or the hand that laid it (after a handover the
  // hand that gave it goes back to the shoe, from template 7).
  const back = input.oneWay ? (ten || (once && open) ? SAY.layOneWay : once ? '' : SAY.endAtCard) : own ? (drag ? SAY.backDrag : SAY.backPinch) : pass && seven ? SAY.backPass(drag) : SAY.backOther(drag);
  // Her body as she deals: in template 7 alone she moves a little; before and after, the other hand rests (own hand alone).
  const body = moves(input) ? (own ? SAY.moveOwn : SAY.moveBoth) : own ? SAY.otherRests : '';
  // The card: one two-sided object; in template 6 alone, which colour is up at the end, following the side it lands with.
  const colours = byColour(input);
  const sized = !!input.cardScale && input.cardScale !== 1;
  const card = colours ? SAY.v6.oneCardIs(open ? SAY.v6.sides.open : SAY.v6.sides.closed) : ten ? (sized ? SAY.oneCardMovesFree : SAY.oneCardMovesSized) : cardMoves(input);
  const parts: Part[] = [
    { text: SAY.camera, from: [] },
    referencePart(input),
    { text: take, from: ['hand', ...(placed ? (['place'] as Choice[]) : []), ...(alongFelt ? ([open ? 'turn' : 'side'] as Choice[]) : []), ...(dragged && pass ? (['side'] as Choice[]) : [])] },
    { text: turn, from: open ? ['turn', ...(nine && drag && !alongFelt ? (['hand'] as Choice[]) : [])] : ['side'] },
    { text: back, from: input.oneWay ? ['shape'] : ['hand'] },
    { text: body, from: ['hand'] },
    { text: cardLook(input, card), from: colours ? ['side'] : [] },
    extraPart(input),
  ];
  return { template: templateOf('film-giv', 'KORT'), style: 'KORT', text: joined(parts), parts };
}

/**
 * The deal with two hands from anchor 2.3 (from template 11), in the order the session MODEL measured it: the hand at the
 * shoe strokes the card out and slides it flat on the felt to her other hand (where they meet follows the seat, meetAt);
 * both hands tip it up onto a short end and the other hand turns it over the rest of the way in the air on its way to the
 * place (a closed card is taken and carried yellow side up); it is laid palm down with the fingertips on it; the hand from
 * the shoe goes back to the shoe; her head turns towards the place. Each thing once. The turn is the step's own: the order's
 * flipAxis changes no word here. Bara dit ends on the last frame; tur och retur brings the laying hand back to the shoe.
 */
function twoHandDeal(input: PromptInput, m: DealMotion): Prompt {
  const open = m.side === 'FRONT', placed = !!input.place, sized = !!input.cardScale && input.cardScale !== 1;
  // The shoe stands at the right of the picture: a seat near it is met just in front of the shoe, a far one in front of her.
  const meet = !placed ? SAY.meetAt.mid : input.place!.x >= 1180 ? SAY.meetAt.near : input.place!.x >= 760 ? SAY.meetAt.mid : SAY.meetAt.far;
  const carry = placed ? `towards its place ${whereShort(input.place!)}` : 'towards its place';
  // From template 12 the stroke and the lay leave the side that is up and the palm to the turn or the closed carry (SAY.v11 before).
  const twelve = fromTwelve(input), one = !!input.oneWay, round15 = fifteen(input) && open && !one;
  const lay = twelve
    ? (open ? (one ? SAY.layAtPlaceOneWay : SAY.layAtPlace) : one ? SAY.layClosedOneWay : SAY.layClosed)
    : open ? (one ? SAY.v11.layPalmDown : SAY.v11.layPalmDownRound) : one ? SAY.v11.layClosedOneWay : SAY.v11.layClosed;
  // Template 16: the closed card is slid flat under the fingertips and its look names its yellow alone (SAY.v16).
  const closed16 = sixteen(input) && !open;
  const parts: Part[] = [
    { text: SAY.camera, from: [] },
    referencePart(input),
    { text: `${SAY.handAtShoe} ${twelve ? SAY.strokeOut : SAY.v11.strokeOut} ${meet}.`, from: ['hand', ...(placed ? (['place'] as Choice[]) : [])] },
    { text: open ? SAY.raiseAndTurn(carry) : closed16 ? SAY.v16.slideClosed(carry) : SAY.takeClosed(carry), from: [open ? 'turn' : 'side', ...(placed ? (['place'] as Choice[]) : [])] },
    { text: closed16 ? (one ? SAY.stopFlatOneWay : SAY.stopFlat) : lay, from: input.oneWay ? ['shape'] : ['side'] },
    { text: round15 ? SAY.v15.flatHand : '', from: ['hand'] },
    { text: input.oneWay ? '' : round15 ? SAY.v15.back : closed16 ? SAY.v16.back : SAY.backTwoHands, from: ['hand'] },
    { text: open ? SAY.shoeHandBack : closed16 ? SAY.v16.shoeHandBack : SAY.shoeHandBackClosed, from: ['hand'] },
    { text: round15 || (closed16 && !one) ? SAY.v15.window : '', from: [] },
    { text: SAY.headToPlace, from: [] },
    { text: closed16 ? (sized ? SAY.v16.cardFree : SAY.v16.cardSized) : cardLook(input, sized ? SAY.oneCardMovesFree : SAY.oneCardMovesSized), from: [] },
    extraPart(input),
  ];
  return { template: templateOf('film-giv', 'KORT'), style: 'KORT', text: joined(parts), parts };
}

/**
 * Jakob's minimal deal: the card's colours (in template 6 alone with the one up at the end, which follows the side it
 * lands with) and that one card goes to where the last frame shows it (and the hand comes back).
 */
function minimalDeal(input: PromptInput): Prompt {
  const open = (input.motion ?? DEFAULT_MOTION).side === 'FRONT', colours = byColour(input);
  const parts: Part[] = [
    { text: SAY.cameraMinimal, from: [] },
    referencePart(input),
    { text: colours ? SAY.v6.cardIs(open ? SAY.v6.sides.open : SAY.v6.sides.closed) : fromTen(input) ? cardLook(input, SAY.blankCard) : cardColours(input), from: colours ? ['side'] : [] },
    { text: input.oneWay ? SAY.oneCard : SAY.oneCardBack, from: ['shape'] },
    extraPart(input),
  ];
  return { template: templateOf('film-giv', 'MINIMAL'), style: 'MINIMAL', text: joined(parts), parts };
}

/**
 * A return, from the seat's landing picture back to an anchor (2.1 the pinch, 2.2 the hand over the shoe, 1 rest): the
 * hand at the card lifts off it and glides back low and open. The hand that laid the card is the one that returns.
 * Written Kort or Minimal only: there was no return in template 3, and asked for the long text it is written Kort.
 */
function returnText(input: PromptInput, to: '1' | '2.1' | '2.2' | '2.3', style: TextStyle): Prompt {
  const m: DealMotion = input.motion ?? DEFAULT_MOTION;
  const { lays } = handsIn(m);
  const colour = m.side === 'BACK' ? 'yellow' : 'blue';
  if (to === '2.3') {
    const parts: Part[] = [
      { text: SAY.camera, from: [] },
      { text: SAY.liftOffRight(colour), from: ['side'] },
      { text: returnMarks(input), from: ['side'] },
      { text: fromTwelve(input) ? SAY.glideBeside : SAY.v11.glideBeside, from: [] },
      extraPart(input),
    ];
    return { template: templateOf('film-retur', 'KORT'), style: 'KORT', text: joined(parts), parts };
  }
  if (style === 'MINIMAL') {
    const colours = byColour(input);
    const card = colours ? SAY.v6.cardIs(m.side === 'BACK' ? SAY.v6.sides.liesClosed : SAY.v6.sides.liesOpen) : cardLook(input, cardColours(input), 'first');
    const parts: Part[] = [{ text: SAY.cameraMinimal, from: [] }, referencePart(input), { text: card, from: colours || marked(input) ? ['side'] : [] }, { text: SAY.leaveCard, from: [] }, extraPart(input)];
    return { template: templateOf('film-retur', 'MINIMAL'), style, text: joined(parts), parts };
  }
  const glide = lays === 'LH' || to === '1' ? SAY.glideTo[to] : SAY.glideOther(to);
  // The other hand: resting when the left laid the card; to rest after the right laid it, it comes from the shoe (from
  // template 7; before, it was said to rest already).
  const other = lays === 'LH' ? SAY.otherRests : to !== '1' ? '' : twoHands(input) ? SAY.otherFromShoe : SAY.otherRests;
  const parts: Part[] = [
    { text: SAY.camera, from: [] },
    referencePart(input),
    { text: SAY.liftOff(colour), from: ['side'] },
    { text: returnMarks(input), from: ['side'] },
    { text: glide, from: ['hand'] },
    { text: other, from: ['hand'] },
    extraPart(input),
  ];
  return { template: templateOf('film-retur', 'KORT'), style: 'KORT', text: joined(parts), parts };
}

function entryText(input: PromptInput, to: '2.1' | '2.2' | '2.3', style: TextStyle = 'UTFÖRLIG'): Prompt {
  // Anchor 2.3 came with template 11 and has no long text: both hands go to the shoe, and her eyes stay on the hand at the card.
  if (to === '2.3') {
    const parts: Part[] = style === 'MINIMAL'
      ? [{ text: SAY.cameraMinimal, from: [] }, referencePart(input), { text: SAY.reachBothMinimal, from: [] }, extraPart(input)]
      : [{ text: SAY.camera, from: [] }, referencePart(input), { text: fourteen(input) ? SAY.v14.reach23 : SAY.reach['2.3'], from: [] }, { text: fromTwelve(input) ? SAY.eyesStay : SAY.v11.eyesStay, from: [] }, extraPart(input)];
    const written: TextStyle = style === 'MINIMAL' ? 'MINIMAL' : 'KORT';
    return { template: templateOf('film-ingang', written), style: written, text: joined(parts), parts };
  }
  if (style !== 'UTFÖRLIG') {
    const short = style === 'KORT';
    const parts: Part[] = short
      // Until template 10 the entry also said that both hands rest on the felt before one of them moves: the first frame shows
      // it, and with "The other hand rests on the felt." the resting hand was said twice (from template 11 once).
      ? [{ text: SAY.camera, from: [] }, referencePart(input), { text: fromEleven(input) ? '' : SAY.bothRest, from: [] }, { text: SAY.reach[to], from: [] }, { text: SAY.eyes, from: [] }, { text: SAY.otherRests, from: [] }, extraPart(input)]
      : [{ text: SAY.cameraMinimal, from: [] }, referencePart(input), { text: SAY.reachMinimal, from: [] }, extraPart(input)];
    return { template: templateOf('film-ingang', style), style, text: joined(parts), parts };
  }
  const reach =
    to === '2.1'
      ? "She calmly lifts her left hand, at the right of the picture, reaches to the shoe and pinches the top of the yellow card in the shoe's window between thumb and forefinger, her fingertips on the card itself and not on the shoe's rim, and draws it a little way out of the window, settling exactly into the pose of the last image."
      : "She calmly lifts her left hand, at the right of the picture, reaches to the shoe and lays it over the yellow card in the shoe's window, fingertips resting flat on the card, settling exactly into the pose of the last image.";
  const parts: Part[] = [
    { text: `Locked camera. ${cap(input.dealer.look)} sits at a green table with a black card shoe fixed at the right of the picture, a yellow card in its window. One continuous, calm and natural movement from the exact first pose, both hands resting on the felt.`, from: [] },
    referencePart(input),
    { text: reach, from: [] },
    // Anchor 2.1 holds the card a little out of the window (Jakob 2026-11-13: the pinch is on the card), so it is not "seated" there.
    { text: `${to === '2.1' ? 'The card stays in her pinch at the shoe, as in the last image' : 'The yellow card stays seated in the shoe'}; nothing is dealt. Her right hand, at the left of the picture, rests on the table the whole time.`, from: [] },
    extraPart(input),
    { text: BANS_FILM, from: ['bans'] },
  ];
  return { template: templateOf('film-ingang', 'UTFÖRLIG'), style: 'UTFÖRLIG', text: joined(parts), parts };
}

/**
 * The way out to rest (anchor 1): from anchor 2.1 (READY>IDLE) the pinch lets the card settle back into the window, from
 * anchor 2.2 (READY-B>IDLE) the fingertips lift off the card the hand lies over; then the hand comes back low to rest on
 * the felt. Written Kort or Minimal only: the steps came after template 3. Minimal says the same for both.
 */
function exitText(input: PromptInput, style: TextStyle, from: '2.1' | '2.2' | '2.3' = '2.1'): Prompt {
  // From anchor 2.3 both hands are at the shoe and both come to rest: no hand rests the whole time.
  const both = from === '2.3';
  const parts: Part[] = style === 'MINIMAL'
    ? [{ text: SAY.cameraMinimal, from: [] }, referencePart(input), { text: both ? SAY.leaveBothMinimal : SAY.leaveMinimal, from: [] }, extraPart(input)]
    : [{ text: SAY.camera, from: [] }, referencePart(input), { text: both ? SAY.leaveBoth : from === '2.2' ? SAY.leaveDrag : SAY.leaveShoe, from: [] }, { text: SAY.eyesUp, from: [] }, { text: both ? '' : SAY.otherRests, from: [] }, extraPart(input)];
  return { template: templateOf('film-utgang', style === 'MINIMAL' ? 'MINIMAL' : 'KORT'), style: style === 'MINIMAL' ? 'MINIMAL' : 'KORT', text: joined(parts), parts };
}

/**
 * The hole card turned open from rest (IDLE>REVEAL(D.C1)): the hand nearest the shoe goes low to the closed card where the
 * plan lays it (said in words, as a deal says its place), turns it at the place as the handbook's turn A (SAY.turnAtPlace),
 * and glides back to rest. One card moves. Written Kort or Minimal only.
 */
function revealText(input: PromptInput, style: TextStyle): Prompt {
  const colours = byColour(input);
  if (style === 'MINIMAL') {
    const parts: Part[] = [{ text: SAY.cameraMinimal, from: [] }, referencePart(input), { text: colours ? SAY.v6.cardIs(SAY.v6.sides.turned) : cardColours(input), from: [] }, { text: SAY.revealMinimal, from: [] }, extraPart(input)];
    return { template: templateOf('film-halkort', 'MINIMAL'), style: 'MINIMAL', text: joined(parts), parts };
  }
  const parts: Part[] = [
    { text: SAY.camera, from: [] },
    referencePart(input),
    { text: SAY.revealReach(input.place ? whereShort(input.place) : null), from: input.place ? ['place'] : [] },
    { text: turnAtPlace(input), from: ['turn'] },
    { text: SAY.glideTo['1'], from: [] },
    { text: SAY.otherRests, from: [] },
    // The hole card always lies closed and is turned open: no choice decides its sides.
    { text: colours ? SAY.v6.oneCardIs(SAY.v6.sides.turned) : cardMoves(input), from: [] },
    extraPart(input),
  ];
  return { template: templateOf('film-halkort', 'KORT'), style: 'KORT', text: joined(parts), parts };
}

/**
 * A rest. Utförlig: the long text, which says what she does (looks gently around, her hands stay). Kort and Minimal: the
 * fixed part says only that she starts and ends in the first picture (and holds still for the last half second); Jakob's
 * addition says what happens, a nod or tapping fingers, without a fixed sentence against it.
 */
function restText(input: PromptInput, style: TextStyle = 'UTFÖRLIG'): Prompt {
  if (style !== 'UTFÖRLIG') {
    const parts: Part[] = [{ text: style === 'KORT' ? SAY.camera : SAY.cameraMinimal, from: [] }, referencePart(input), { text: style === 'KORT' ? SAY.rest : SAY.restMinimal, from: [] }, extraPart(input)];
    return { template: templateOf('film-vila', style), style, text: joined(parts), parts };
  }
  const parts: Part[] = [
    { text: `Locked camera. ${cap(input.dealer.look)} sits at a green table with a black card shoe fixed at the right of the picture, both hands resting on the felt.`, from: [] },
    referencePart(input),
    { text: 'She waits calmly at her table: she breathes, blinks and looks gently around, and ends exactly in the pose she started in, as in the last image. Her hands stay where they are; nothing is dealt and the yellow card stays seated in the shoe.', from: [] },
    extraPart(input),
    { text: BANS_FILM, from: ['bans'] },
  ];
  return { template: templateOf('film-vila', 'UTFÖRLIG'), style: 'UTFÖRLIG', text: joined(parts), parts };
}

/**
 * The text for an order in its style (absent: Kort, as for every new order; a stored order says its own, orderPrompt),
 * the template it came from ("film-giv-kort@4", "film-giv@3") and its parts with the choices they come from.
 */
/** The yellow back said with its mark where the order's first picture carries it (PromptInput.backMark): the two places a text says the back is blank, in the text and in its parts alike. */
const BACK_WORDS: [string, string][] = [
  ['back is blank solid yellow, right out to its corners,', "back is solid yellow, right out to its corners, with a filled red circle in the middle and a small pink cross near one end, as the first frame shows it in the shoe's window,"],
  ['the next card in the window is the same blank yellow.', 'the next card in the window has the same yellow back with the same two marks.'],
];
const backSaid = (text: string) => BACK_WORDS.reduce((t, [blank, marked]) => t.replace(blank, marked), text);
const backLook = (input: PromptInput, p: Prompt): Prompt => (input.backMark ? { ...p, text: backSaid(p.text), parts: p.parts.map((part) => ({ ...part, text: backSaid(part.text) })) } : p);

export function promptFor(input: PromptInput): Prompt {
  const p = backLook(input, written(input));
  // An older version's text is today's but for what the version changed (the place words of 5, the card's sides by colour
  // of 6, the way back after two hands of 7, her body in 7 alone, the wrist, the drag and the plain card of 9); its name
  // keeps its number.
  const today = '@' + TEMPLATE_VERSION;
  return input.version && input.version !== TEMPLATE_VERSION && p.template.endsWith(today) ? { ...p, template: p.template.slice(0, -today.length) + '@' + input.version } : p;
}

/**
 * Template 13's own text (TEMPLATE_CHOICES), or null where 13 has none and the text is 12's: the deal from 2.3 and the
 * deal by the hand at the shoe from 2.1 when the card lands open, bara dit, at the plan's size with the marks in the last
 * picture; the return to 2.3; the return to rest after the right hand laid the card. Each open card only.
 */
function thirteen(input: PromptInput): Prompt | null {
  if ((input.style ?? 'KORT') !== 'KORT') return null;
  const m = input.motion ?? DEFAULT_MOTION;
  if (m.side !== 'FRONT') return null;
  if (input.step === 'GIV-2.3' || input.step === 'GIV-2.1') {
    if (!input.oneWay || !input.faceMark || (input.cardScale !== undefined && input.cardScale !== 1)) return null;
    const own = handsIn(m).takes === 'LH' && !m.pass && m.grip === 'PINCH' && m.flipAxis !== 'AT_PLACE';
    if (input.step === 'GIV-2.1' && !own) return null;
    const parts: Part[] = [
      { text: SAY.camera, from: [] },
      referencePart(input),
      { text: input.step === 'GIV-2.3' ? SAY.v13.strokeTurnLay : SAY.v13.pinchTurnLay, from: ['hand', 'turn', 'shape'] },
      { text: SAY.v13.card, from: ['side'] },
      extraPart(input),
    ];
    return { template: templateOf('film-giv', 'KORT'), style: 'KORT', text: joined(parts), parts };
  }
  if (input.step === 'RETUR-2.3' || (input.step === 'RETUR-1' && handsIn(m).lays === 'RH')) {
    const parts: Part[] = [
      { text: SAY.camera, from: [] },
      referencePart(input),
      { text: SAY.v13.liftOff, from: ['side'] },
      { text: SAY.v13.back[input.step === 'RETUR-2.3' ? '2.3' : '1'], from: ['hand'] },
      extraPart(input),
    ];
    return { template: templateOf('film-retur', 'KORT'), style: 'KORT', text: joined(parts), parts };
  }
  return null;
}

function written(input: PromptInput): Prompt {
  const style = input.style ?? 'KORT';
  const own13 = input.version === 13 ? thirteen(input) : null;
  if (own13) return own13;
  switch (input.step) {
    case 'ANKARE-2.1':
    case 'ANKARE-2.2':
      return stillText(input);
    case 'GIV-2.1':
    case 'GIV-2.2':
      return style === 'KORT' ? shortDeal(input) : style === 'MINIMAL' ? minimalDeal(input) : dealText(input);
    case 'GIV-2.3':
      return style === 'MINIMAL' ? minimalDeal(input) : shortDeal({ ...input, motion: { ...(input.motion ?? DEFAULT_MOTION), grip: 'TWO_HANDS' } });
    case 'RETUR-2.1':
      return returnText(input, '2.1', style);
    case 'RETUR-2.2':
      return returnText(input, '2.2', style);
    case 'RETUR-2.3':
      return returnText(input, '2.3', style);
    case 'RETUR-1':
      return returnText(input, '1', style);
    case 'INGANG-2.1':
      return entryText(input, '2.1', style);
    case 'INGANG-2.2':
      return entryText(input, '2.2', style);
    case 'INGANG-2.3':
      return entryText(input, '2.3', style);
    case 'UTGANG':
      return exitText(input, style);
    case 'UTGANG-2.2':
      return exitText(input, style, '2.2');
    case 'UTGANG-2.3':
      return exitText(input, style, '2.3');
    case 'HALKORT':
      return revealText(input, style);
    case 'VILA':
      return restText(input, style);
  }
}

/** Words in a text, as the sheet counts them ("414 ord"). */
export const wordCount = (text: string) => text.trim().split(/\s+/).filter(Boolean).length;

/**
 * The text of a stored order from its own choices: its style (absent: Utförlig), the place where its last picture drew
 * the card, else the plan's point for the card (`planPlace`), a deal bara dit, a reference film. The store writes it with
 * this; "Det här skickas" marks its parts with it.
 */
export function orderPrompt(
  order: {
    step: { key: StepKey; shape?: 'ROUND_TRIP' | 'ONE_WAY' | null };
    motion: (DealMotion & { target?: string | null; cardScale?: number }) | null;
    generation: { model: string };
    pictures: readonly { goesAs: string; drawn?: { centre: [number, number] } | null }[];
    prompt: { extra: string | null; style?: TextStyle | null; template?: string; place?: readonly [number, number] | null; faceMark?: boolean; backMark?: boolean };
    reference?: { status: string } | null;
  },
  dealer: Dealer,
  planPlace: { x: number; y: number } | null,
  /**
   * asStored: with the version in the order's own template name and the plan's point the order stored (prompt.place)
   * before the plan of now (an approved order is reproduced, not rewritten).
   */
  options: { asStored?: boolean } = {},
): Prompt {
  const at = (order.prompt.template ?? '').lastIndexOf('@');
  const named = at >= 0 ? Number(order.prompt.template!.slice(at + 1)) || undefined : undefined;
  // A template chosen for the order (TEMPLATE_CHOICES: 13 or 14 beside today's 12) is kept when its text is written again; an
  // older one is not, and a draft written with it is written with today's.
  const chosen = named !== undefined && named !== TEMPLATE_VERSION && TEMPLATE_CHOICES.includes(named) ? named : undefined;
  const stored = options.asStored ? named : chosen;
  const drawn = order.pictures.find((p) => p.goesAs === 'endFrame')?.drawn ?? null;
  const kept = options.asStored ? order.prompt.place ?? null : null;
  const place = drawn ? { x: drawn.centre[0], y: drawn.centre[1] } : kept ? { x: kept[0], y: kept[1] } : planPlace;
  const m = order.motion;
  const deal = order.step.key === 'GIV-2.1' || order.step.key === 'GIV-2.2' || order.step.key === 'GIV-2.3';
  // A deal with a first picture and no last one (tools/order-store.ts, end: null); a line that lists no pictures yet (Bordet's
  // row) is not one.
  const open = deal && order.step.shape === 'ONE_WAY' && order.pictures.some((p) => p.goesAs === 'startFrame') && !order.pictures.some((p) => p.goesAs === 'endFrame');
  const p = promptFor({
    dealer, step: order.step.key, model: order.generation.model,
    motion: m ? { grip: m.grip, hand: m.hand, pass: !!m.pass, turn: m.turn, flipAxis: m.flipAxis, side: m.side } : null,
    place, extra: order.prompt.extra,
    style: order.prompt.style ?? 'UTFÖRLIG',
    oneWay: deal && order.step.shape === 'ONE_WAY',
    reference: order.reference?.status === 'FINNS',
    cardScale: m?.cardScale ?? 1,
    faceMark: !!order.prompt.faceMark,
    backMark: !!order.prompt.backMark,
    version: stored,
  });
  return open ? withoutLastFrame(p) : p;
}

/**
 * A deal bara dit with no last picture (tools/order-store.ts, end: null; the seat's A3 is made afterwards from the film's
 * last frame): the recipe's text with what it says of the last frame taken out. The reference film, made to the seat, shows
 * where the card goes (naming it once more makes the text say it twice; without one too the draft is made, and its notes
 * say that only the first picture and the text tell where the card goes), template 12 says the place in words, and the
 * card keeps its size. A case these words do not cover still names the last frame, and the
 * store refuses it rather than send a text that points at a picture that is not there.
 */
const NO_LAST_FRAME: readonly [RegExp, string][] = [
  [/, where the last frame shows it(?=[,;.])/g, ''],
  [/ the size it has in the last frame/g, ' the same size'],
  [/, as (?:in the last frame|the last frame shows it)(?=[,;.])/g, ''],
];
export function withoutLastFrame(prompt: Prompt): Prompt {
  const strip = (text: string) => NO_LAST_FRAME.reduce((t, [re, to]) => t.replace(re, to), text);
  const parts = prompt.parts.map((p) => ({ ...p, text: strip(p.text) }));
  return { ...prompt, parts, text: joined(parts) };
}
