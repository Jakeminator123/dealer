// Every key of the 3D scene's state (SceneState in src/scene3d-view.ts) as data: the group it is shown in, a short Swedish
// label, what kind of control it is (switch, slider with range, step and unit, choice with Swedish names, a set of marks,
// text), one line of help, and whom it is for (D: a look a demo player could get, as a choice or a fixed default of the
// game; U: the developer's calibration), as docs/SYSTEM.md "3D-scenen" marks them. Ranges and steps are the lab panel's
// own (src/scene3d-ui.ts). The Scen view draws its controls from this, the preset store (tools/scene-preset-store.ts)
// checks a preset against it, and the address of a look is read and written with it. Pure: no DOM, no network, no three;
// tests in studio/tests/scene-keys.test.ts, which also fail when the scene gets a key that has no control here.
import type { SceneState } from "../../src/scene3d-view.ts";

export type SceneKey = keyof SceneState;
export type GroupId = "miljo" | "rorelser" | "ljus" | "bord" | "kort" | "kamera" | "avancerat";
export type Who = "D" | "U";
export type Option = { value: string; label: string };

/** The groups in their order. Avancerat is the calibration and starts folded away. */
export const GROUPS: readonly { id: GroupId; label: string; folded: boolean }[] = [
  { id: "miljo", label: "Miljö", folded: false },
  { id: "rorelser", label: "Rörelser", folded: true },
  { id: "ljus", label: "Ljus", folded: true },
  { id: "bord", label: "Bord", folded: true },
  { id: "kort", label: "Kort och marker", folded: true },
  { id: "kamera", label: "Kamera", folded: true },
  { id: "avancerat", label: "Avancerat", folded: true },
];

export type Control =
  | { kind: "switch" }
  /** special: a value outside the range that still means something (scale 0 = the contract's own k). */
  | { kind: "slider"; min: number; max: number; step: number; unit: string; special?: { value: number; label: string } }
  /** open: values beyond the options are allowed (the rooms of the register, named at run time). */
  | { kind: "choice"; options: readonly Option[]; open?: boolean }
  /** Several of a list held in one word: "all", "none" or a comma list (the felt's marks). */
  | { kind: "set"; options: readonly Option[] }
  | { kind: "text"; maxLength: number };

/**
 * needs: the key only does something while another key holds one of these values (the flicker's timing while the light
 * flickers, the card's options while cards are drawn). The panel tucks it under that key and hides it while it does nothing.
 */
export type Needs = { key: SceneKey; is: readonly (string | boolean)[] };
export type KeySpec = { key: SceneKey; group: GroupId; label: string; help: string; who: Who; needs?: Needs } & Control;

const opts = (...pairs: [string, string][]): Option[] => pairs.map(([value, label]) => ({ value, label }));
const slider = (min: number, max: number, step: number, unit = ""): Control => ({ kind: "slider", min, max, step, unit });
const choice = (...pairs: [string, string][]): Control => ({ kind: "choice", options: opts(...pairs) });
const toggle: Control = { kind: "switch" };

/** The built rooms; the register's 360° rooms (data/scene-rooms.json) are added by the page at run time. */
export const BUILT_ROOMS: readonly Option[] = opts(["salong", "3D-salong"], ["hall", "Spelhall"], ["kuliss", "Kuliss"], ["plat", "V6-plåt"]);
/** The blur that suits a built room (src/scene3d-ui.ts blurOf); a 360° room's is in its register entry. */
export const BUILT_BLUR: Readonly<Record<string, number>> = { salong: 11, hall: 11, kuliss: 9, plat: 8 };
/** A room id as the register allows it (src/scene3d-room.ts readRegister). */
export const ROOM_ID = /^[a-z0-9-]{1,30}$/;

/** The felt's marks (FELT_MARKS in src/scene3d-table.ts, which brings three and so cannot be built in; the test compares). */
export const MARKS: readonly Option[] = opts(
  ["trim", "Dealerkantens list"],
  ["arc", "Bågen"],
  ["text", "BLACKJACK PAYS 3 TO 2"],
  ["logo", "Loggan"],
  ["boxes", "Kortrutor"],
  ["rings", "Insatsringar"],
  ["numbers", "Platsnummer"],
);

// What each key needs to do anything, read off the scene (src/scene3d-view.ts, scene3d-room.ts, scene3d-table.ts): the
// shimmer's length only with the shimmer, the depth ramp only with depth blur, the room's light on the table only on the
// photo surface, the felt colour not under V6's cloth, the card options only with drawn cards, the focus distance only
// with the own focus and the depth of field only with a focus at all.
const NEEDS: Partial<Record<SceneKey, Needs>> = {
  roomShiftSeconds: { key: "roomShift", is: ["shimmer"] },
  dofRange: { key: "depthBlur", is: [true] },
  flickerEvery: { key: "flicker", is: [true] },
  flickerStrength: { key: "flicker", is: [true] },
  fanStrength: { key: "fan", is: [true] },
  fanPeriod: { key: "fan", is: [true] },
  roomLight: { key: "surface", is: ["photo", "natur", "natur-2", "natur-3", "natur-duk"] },
  felt: { key: "cloth", is: ["print"] },
  cardMethod: { key: "cards", is: [true] },
  cardHand: { key: "cards", is: [true] },
  cardScale: { key: "cards", is: [true] },
  cardRank: { key: "cards", is: [true] },
  cardSuit: { key: "cards", is: [true] },
  focusDistance: { key: "focus", is: ["manual"] },
  tolerance: { key: "focus", is: ["dealer", "follow", "card", "manual"] },
};

const spec = (key: SceneKey, group: GroupId, who: Who, label: string, control: Control, help: string): KeySpec => ({ key, group, who, label, help, ...(NEEDS[key] ? { needs: NEEDS[key] } : {}), ...control });

export const SCENE_KEYS: readonly KeySpec[] = [
  // ── Miljö ──
  spec("room", "miljo", "D", "Rum", { kind: "choice", options: BUILT_ROOMS, open: true }, "Rummet bakom dealern: byggt, 360°-bild eller V6-plåten. Oskärpan följer med rummet."),
  spec("roomShift", "miljo", "D", "Byte av rum", choice(["cut", "Klipp"], ["shimmer", "Skimmer"]), "Ett klipp, eller ett skimmer av guldpaljetter som rummet byts under (spelets sätt)."),
  spec("roomShiftSeconds", "miljo", "D", "Skimrets längd", slider(1, 5, 0.1, " s"), "Hur länge skimret varar; gäller nästa byte."),
  spec("blur", "miljo", "U", "Oskärpa bakom", slider(0, 30, 0.5, " px"), "Hur oskarpt rummet är längst bort; med skärpa på styrkan för all oskärpa."),
  spec("depthBlur", "miljo", "U", "Djuposkärpa", toggle, "Oskärpan växer med avståndet bakom dealern (rum med djup, som 3D-salongen)."),
  spec("dofRange", "miljo", "U", "Full oskärpa efter", slider(0.5, 12, 0.1, " m"), "Hur långt bakom bordskanten rummet blir som oskarpast."),
  // ── Rörelser ──
  spec("clock", "rorelser", "D", "Klocka", toggle, "En stående klocka i rummet som visar rätt tid."),
  spec("dust", "rorelser", "D", "Damm i luften", slider(0, 1, 0.01), "Damm, i skogen pollen och löv, bakom och framför dealern. 0 är av."),
  spec("flicker", "rorelser", "D", "Ljusskifte", toggle, "Ljuset skiftar till ibland: ett neonrör som flimrar, eller ett moln för solen."),
  spec("flickerEvery", "rorelser", "U", "Ungefär var", slider(4, 90, 1, " s"), "Hur ofta ljuset skiftar."),
  spec("flickerStrength", "rorelser", "U", "Skiftets djup", slider(0, 1, 0.01), "Hur mycket ljuset dämpas när det skiftar."),
  spec("fan", "rorelser", "D", "Fläktskugga", toggle, "En långsam takfläkt under en lampa kastar svag skugga över dealer och bord."),
  spec("fanStrength", "rorelser", "U", "Fläktens styrka", slider(0, 0.4, 0.01), "Hur mörk fläktens skugga är; håll den svag."),
  spec("fanPeriod", "rorelser", "U", "Sekunder per blad", slider(2, 12, 0.5, " s"), "Fläktens fart: sekunder mellan två blad."),
  spec("roomLife", "rorelser", "U", "Rörelse i rummet", toggle, "Folk som står stilla i ett 360°-rum rör sig: en film över dem i bilden (prov; finns i Venedig)."),
  spec("tal", "rorelser", "U", "Dealerns repliker", choice(["repliker", "Med munnen"], ["av", "Bara text"]), "I spelet säger dealern sina fasta repliker med talfilm och ljud; Bara text visar dem i chatten."),
  // ── Ljus ──
  spec("exposure", "ljus", "U", "Ljus i rummet", slider(0.3, 2, 0.05), "Rummets ljusstyrka bakom dealern; 1 är som förut."),
  spec("roomLight", "ljus", "U", "Rumsljus på bordet", slider(0, 2.5, 0.05), "Hur starkt rummet lyser upp och speglas i bordet (gäller ytan Fotomaterial)."),
  spec("lamp", "ljus", "U", "Lampa över dealern", slider(0, 1, 0.05), "Del av bordets ljus från en lampa ovanför henne; faller av mot spelarna. 0 är av."),
  spec("wrap", "ljus", "U", "Ljus runt dealern", slider(0, 1.5, 0.05), "Rummet bakom henne som ett svagt ljus längs konturen, så att hon står i rummet. 0 är av."),
  spec("dealerRoom", "ljus", "U", "Rumsljus på dealern", slider(0, 1, 0.05), "Dealern tar 360°-rummets färg och nivå, ljusare mot dess ljusa sida (prov). 0 är av; byggda rum ändrar inget."),
  spec("filmBright", "ljus", "U", "Dealerns ljusstyrka", slider(0.6, 1.4, 0.01), "Filmens nivå; 1 är filmen som den är."),
  spec("filmWarm", "ljus", "U", "Dealerns värme", slider(-0.2, 0.2, 0.005), "Filmens färgton, kallare eller varmare; 0 är filmen som den är."),
  spec("shadowAbove", "ljus", "U", "Skugga ovanför kanten", slider(0, 1, 0.05), "Filmens skugga ovanför bordskanten, där armbågarnas skugga annars hänger i luften. 0 tar bort den."),
  // ── Bord ──
  spec("cloth", "bord", "U", "Duk", choice(["print", "Kodens filt"], ["v6", "V6-duken"], ["runway", "Runway-filten"], ["runway-2", "Runway-filten 2: tät duk"], ["runway-3", "Runway-filten 3: borstad boj"]), "V6-duken tar filtens färg och korn ur V6:s bord; Runway-filtarna ur var sin Runway-bild av hemvyn (prov)."),
  spec("felt", "bord", "U", "Filtens färg", choice(["green", "Grön"], ["blue", "Blå"], ["vin", "Vinröd"], ["svart", "Svart"]), "Filtens färg; gäller inte V6-duken."),
  spec("marks", "bord", "U", "Markeringar", { kind: "set", options: MARKS }, "Vad filten bär för tryck, varje slag för sig."),
  spec("logo", "bord", "U", "Logotext", { kind: "text", maxLength: 28 }, "Texten på filten."),
  spec("surface", "bord", "U", "Yta", choice(["painted", "Målad"], ["photo", "Fotomaterial"], ["natur", "Naturmaterial"], ["natur-2", "Naturmaterial 2: blankt läder"], ["natur-3", "Naturmaterial 3: slätt läder"], ["natur-duk", "Duken på naturbordet"]), "Fotomaterial tar rummets ljus; Naturmaterial ger Runway-läder; Duken: filten i eget ljus, reling och metall i rummets."),
  spec("base", "bord", "U", "Underrede", choice(["column", "Pelare"], ["legs", "Två ben"]), "Bordets fot; syns när kameran backar."),
  spec("tableSize", "bord", "U", "Bordets storlek", slider(0.9, 1.4, 0.05, " ×"), "Filt, reling och fot växer åt sidorna och mot spelarna; dealerns kant och trycket står kvar. 1 är som förut (prov)."),
  spec("tray", "bord", "U", "Markerbräde", toggle, "Det byggda markerbrädet, försänkt vid dealern."),
  spec("cups", "bord", "U", "Mugghållare", toggle, "Mässingsringar i relingen mellan platserna."),
  // ── Kort och marker ──
  spec("cards", "kort", "D", "Renderade kort", toggle, "Ritade kort i stället för filmens färgyta; spelet har dem på."),
  spec("cardMethod", "kort", "U", "Ritsätt", choice(["scene", "I scenen"], ["film", "I filmrutan"], ["matte", "Filmens matt"]), "I scenen: ett föremål under filmen. I filmrutan: det äldre sättet. Filmens matt (prov): filmens eget kort färgas om."),
  spec("cardHand", "kort", "U", "Kortet i handen", choice(["film", "Filmens storlek"], ["standard", "Standard"]), "Standard: kortet har vilans storlek hela vägen."),
  spec("cardScale", "kort", "U", "Kortens storlek", slider(0.8, 2, 0.05, "×"), "Alla ritade kort: 1 är kontraktets kort (63 × 88 mm på bordet), förval 1,2. Planens kort är i dag 1,10–1,16 av det."),
  spec("cardRank", "kort", "U", "Valör", choice(...["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"].map((r): [string, string] => [r, r])), "Bara för provet: i spelet bestämmer Scout."),
  spec("cardSuit", "kort", "U", "Kortets färg", choice(["spades", "Spader"], ["hearts", "Hjärter"], ["diamonds", "Ruter"], ["clubs", "Klöver"]), "Bara för provet: i spelet bestämmer Scout."),
  spec("chipGloss", "kort", "U", "Markernas glans", slider(0, 1, 0.01), "Markernas glans; 0,50 är deras utseende förut. Syns när insatser ligger."),
  // ── Kamera ──
  spec("mode", "kamera", "U", "Kameraläge", choice(["look", "Titta runt"], ["lean", "Luta, flytta"]), "Titta runt vrider på stället, exakt för filmen. Luta flyttar kameran: rum och bord i 3D."),
  spec("sway", "kamera", "U", "Gunga kameran", toggle, "Kameran gungar långsamt av sig själv."),
  spec("focus", "kamera", "U", "Skärpa", choice(["off", "Av"], ["dealer", "Dealern"], ["follow", "Följ given"], ["card", "Kortet"], ["manual", "Eget"]), "Följ given: skärpan följer kortet från skon tills det ligger, sedan dealern."),
  spec("focusDistance", "kamera", "U", "Eget avstånd", slider(0.3, 12, 0.01, " m"), "Skärpeplanets avstånd när skärpan är Eget."),
  spec("tolerance", "kamera", "U", "Skärpedjup", slider(0, 0.8, 0.01), "Hur mycket runt skärpeplanet som är skarpt."),
  spec("yaw", "kamera", "U", "Vrid sidled", slider(-60, 60, 0.5, "°"), "Kameran vriden åt sidan. Dra i bilden gör detsamma."),
  spec("pitch", "kamera", "D", "Vrid höjdled", slider(-35, 25, 0.5, "°"), "Kameran vriden upp eller ned; spelet ser bordet från −8°."),
  spec("zoom", "kamera", "D", "Zoom", slider(0.45, 2.5, 0.01, "×"), "Bildvinkeln; spelet visar hela bordet med 0,84."),
  spec("dx", "kamera", "U", "Flytta sidled", slider(-0.9, 0.9, 0.005, " m"), "Kameran flyttad åt sidan; filmen börjar ljuga ju längre."),
  spec("dy", "kamera", "U", "Flytta höjd", slider(-0.3, 0.5, 0.005, " m"), "Kameran flyttad upp eller ned."),
  spec("dz", "kamera", "U", "Flytta djup", slider(-0.5, 1.6, 0.005, " m"), "Kameran flyttad bakåt eller framåt."),
  spec("aim", "kamera", "U", "Sikta på dealern", toggle, "Kameran håller blicken på dealern när den flyttas."),
  spec("format", "kamera", "D", "Format", choice(["desk", "Dator"], ["mob", "Mobil"], ["fill", "Fyll"]), "Bildens form: filmens 1764 × 1174, mobil 9:16, eller hela ytan som spelet."),
  // ── Avancerat: kalibrering ──
  spec("panoramaTurn", "avancerat", "U", "Panoramats vridning", slider(0, 360, 1, "°"), "Hur 360°-bilden är vriden; 90 lägger bildens mitt bakom dealern."),
  spec("lens", "avancerat", "U", "Filmkamera", choice(["plan", "Planens"], ["estimate", "Dealerns lins"]), "Planens kamera passar kortrutorna; dealerns lins är en skattning."),
  spec("scale", "avancerat", "U", "Skala k", { kind: "slider", min: 1, max: 2.6, step: 0.05, unit: "×", special: { value: 0, label: "kontraktets" } }, "Hur mycket större dealerns värld är än planens kort; 0 är kontraktets egen."),
  spec("keyLo", "avancerat", "U", "Nyckel låg", slider(0, 0.5, 0.01), "Nyckelns nedre gräns mot filmens gröna."),
  spec("keyHi", "avancerat", "U", "Nyckel hög", slider(0.5, 1.2, 0.01), "Nyckelns övre gräns mot filmens gröna."),
  spec("shadow", "avancerat", "U", "Skuggor på filten", slider(0, 1.6, 0.05), "Skuggan av händer, kort och sko på filten; 1 är som förut."),
  spec("fold", "avancerat", "U", "Vik filmen", toggle, "Filmen viks mot bordet, så att händer och kort följer filten."),
  spec("guides", "avancerat", "U", "Hjälplinjer", toggle, "Filmrutan, vikningen och filmens bordsyta som linjer."),
];

/** Whether a key does anything in this state (its needs are met). */
export const inUse = (s: KeySpec, state: Record<string, unknown>) => !s.needs || s.needs.is.includes(state[s.needs.key] as string | boolean);

const BY_KEY = new Map<string, KeySpec>(SCENE_KEYS.map((s) => [s.key, s]));
/** The control of a key, or null for a word that is not a key of the scene. */
export const keySpec = (key: string): KeySpec | null => BY_KEY.get(key) ?? null;
export const isSceneKey = (key: string): key is SceneKey => BY_KEY.has(key);
export const keysOf = (group: GroupId): KeySpec[] => SCENE_KEYS.filter((s) => s.group === group);

/** Keys whose change builds the table again (src/scene3d-view.ts set: relens); a slider among them is debounced. */
export const REBUILDS: ReadonlySet<SceneKey> = new Set<SceneKey>(["lens", "scale", "tray", "base", "surface", "tableSize"]);
/** Keys whose change paints the felt again; text among them is debounced. */
export const REPRINTS: ReadonlySet<SceneKey> = new Set<SceneKey>(["logo", "felt", "marks", "cloth"]);

// ── The felt's marks in one word (feltMarks / marksText of src/scene3d-table.ts, same rules) ──
export function marksOf(text: string | null | undefined): Set<string> {
  const word = (text ?? "all").trim().toLowerCase();
  if (word === "all") return new Set(MARKS.map((m) => m.value));
  return new Set(word.split(/[\s,+]+/).filter((w) => MARKS.some((m) => m.value === w)));
}
export function marksText(marks: Iterable<string>): string {
  const on = new Set(marks);
  if (MARKS.every((m) => on.has(m.value))) return "all";
  return MARKS.filter((m) => on.has(m.value)).map((m) => m.value).join(",") || "none";
}

// ── Values ──
type Value = SceneState[SceneKey];
/** Whether text holds a control character (a line break, a bell): never in a label or on the felt. */
export const hasControl = (text: string) => [...text].some((c) => c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127);

/** Whether a value fits its key; a Swedish reason when it does not. rooms: the register's rooms, when known. */
export function checkValue(s: KeySpec, value: unknown, rooms?: readonly string[]): string | null {
  switch (s.kind) {
    case "switch":
      return typeof value === "boolean" ? null : "ska vara sant eller falskt";
    case "slider":
      if (typeof value !== "number" || !Number.isFinite(value)) return "ska vara ett tal";
      if (s.special && value === s.special.value) return null;
      return value >= s.min - 1e-9 && value <= s.max + 1e-9 ? null : `ska ligga mellan ${decimal(s.min)} och ${decimal(s.max)}`;
    case "choice":
      if (typeof value !== "string") return "ska vara ett av valen";
      if (s.options.some((o) => o.value === value)) return null;
      if (s.open && ROOM_ID.test(value) && (!rooms || rooms.includes(value))) return null;
      return `känner inte till "${value.slice(0, 40)}"`;
    case "set": {
      if (typeof value !== "string") return "ska vara all, none eller en lista";
      const words = value.trim().toLowerCase();
      if (words === "all" || words === "none") return null;
      const list = words.split(/[\s,+]+/).filter(Boolean);
      const unknown = list.filter((w) => !s.options.some((o) => o.value === w));
      return list.length && !unknown.length ? null : `känner inte till ${unknown.join(", ") || "en tom lista"}`;
    }
    case "text":
      if (typeof value !== "string") return "ska vara text";
      if (value.length > s.maxLength) return `får vara högst ${s.maxLength} tecken`;
      return hasControl(value) ? "får inte ha styrtecken" : null;
  }
}

/** Swedish decimals: 0.25 → "0,25", −8 → "−8". */
export function decimal(value: number, digits?: number): string {
  const text = digits === undefined ? String(Math.round(value * 1000) / 1000) : value.toFixed(digits);
  return text.replace(".", ",").replace(/^-/, "−");
}
const digitsOf = (step: number) => (step >= 1 ? 0 : step >= 0.1 ? 1 : step >= 0.01 ? 2 : 3);

/** The value as the panel writes it: "0,60", "11 px", "Grön", "På", "alla". */
export function formatValue(s: KeySpec, value: unknown, roomName?: (id: string) => string | undefined): string {
  switch (s.kind) {
    case "switch":
      return value ? "På" : "Av";
    case "slider": {
      const v = Number(value);
      if (s.special && v === s.special.value) return s.special.label;
      return `${decimal(v, digitsOf(s.step))}${s.unit}`;
    }
    case "choice": {
      const text = String(value);
      return s.options.find((o) => o.value === text)?.label ?? roomName?.(text) ?? text;
    }
    case "set": {
      const on = marksOf(String(value));
      return on.size === s.options.length ? "alla" : on.size === 0 ? "inga" : `${on.size} av ${s.options.length}`;
    }
    case "text":
      return String(value);
  }
}

/** Two values of a key the same? Numbers within a millionth (a slider and the scene's own arithmetic). */
export function sameValue(a: unknown, b: unknown): boolean {
  if (typeof a === "number" && typeof b === "number") return Math.abs(a - b) <= 1e-6;
  return a === b;
}

/** A value for an address: numbers to at most four decimals, switches 1/0 (as scene3d.html reads them), the rest as is. */
export function encodeValue(s: KeySpec, value: unknown): string {
  if (s.kind === "switch") return value ? "1" : "0";
  if (s.kind === "slider") return String(Math.round(Number(value) * 10000) / 10000);
  return String(value);
}
/** A value from an address, or null when it does not fit the key. */
export function decodeValue(s: KeySpec, text: string, rooms?: readonly string[]): Value | null {
  let value: unknown = text;
  if (s.kind === "switch") value = text === "1" || text === "true" ? true : text === "0" || text === "false" ? false : null;
  else if (s.kind === "slider") value = text.trim() === "" ? NaN : Number(text);
  return value !== null && checkValue(s, value, rooms) === null ? (value as Value) : null;
}

/** The controls whose label, help or group name holds every word of the query (case and accents aside). */
export function searchKeys(query: string, list: readonly KeySpec[] = SCENE_KEYS): KeySpec[] {
  const fold = (t: string) => t.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  const words = fold(query).split(/\s+/).filter(Boolean);
  if (!words.length) return [...list];
  return list.filter((s) => {
    const group = GROUPS.find((g) => g.id === s.group)?.label ?? "";
    const options = s.kind === "choice" || s.kind === "set" ? s.options.map((o) => o.label).join(" ") : "";
    const hay = fold(`${s.label} ${s.help} ${group} ${s.key} ${options}`);
    return words.every((w) => hay.includes(w));
  });
}
