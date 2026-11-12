// The studio's words, gathered in one table (Jakob 2026-11-12: "gather all the systems' words and different names into one
// common one"): each with the one Swedish word a person sees, one line of what it means, and the other names the same thing
// has in code, files and documents. What is settled comes from docs/SYSTEM.md "Ordlista och gräns mot Scout" and HANDOFF.md
// "Ankarmodellen"; lib/names.ts takes the anchors' codes and names from here, so the two never disagree. The rail's
// "Ordlista" shows it (components/shell/Glossary.tsx) and the bot reads it through lib/guide.ts. Data and one search, no DOM.
// Plain words for people: a step ("steg") is one move between two anchors, a film or a take ("tagning") is what plays there.

export type WordGroup = "Ankare och platser" | "Steg och filmer" | "Omdömen" | "Bilder och mått" | "Spela och scen";
export const WORD_GROUPS: readonly WordGroup[] = ["Ankare och platser", "Steg och filmer", "Omdömen", "Bilder och mått", "Spela och scen"];

export type Word = {
  /** The one word a person sees in the studio. */
  ord: string;
  /** What it means, in one line. */
  betyder: string;
  /** Other names for the same thing in code, files, documents and earlier talk. */
  aven: readonly string[];
  grupp: WordGroup;
};

/** The anchors as the studio writes them: the code inside a step ("A2.1 → P4C1") and the name on its own. */
export const ANCHOR_WORDS = {
  IDLE: { code: "A1", name: "A1 vila" },
  READY: { code: "A2.1", name: "A2.1 nyp" },
  "READY-B": { code: "A2.2", name: "A2.2 hand över" },
  AWAY: { code: "Borta", name: "Borta" },
  "REVEAL(D.C2)": { code: "DC2 upp", name: "DC2 upp" },
} as const;

export const WORDS: readonly Word[] = [
  // ── Anchors and places ──
  { grupp: "Ankare och platser", ord: "A1 vila", betyder: "Ankare 1: dealerns händer i vila. Varje runda börjar och slutar här.", aven: ["IDLE", "VILA", "ankare 1", "Keystone 1", "grundloopen", "IDLE-B (vila med den öppna skon)"] },
  { grupp: "Ankare och platser", ord: "A2.1 nyp", betyder: "Ankare 2.1: handen nyper kortet i skons fönster, redo att dela ut.", aven: ["READY", "REDO", "ankare 2.1", "Keystone 2", "variant A", "PINCH"] },
  { grupp: "Ankare och platser", ord: "A2.2 hand över", betyder: "Ankare 2.2: handen ligger över kortet i skons öppning och drar ut det.", aven: ["READY-B", "REDO B", "ankare 2.2", "variant B", "släp", "DRAG"] },
  { grupp: "Ankare och platser", ord: "Borta", betyder: "Bordet utan dealern: hon har inte kommit, eller har gått.", aven: ["AWAY", "tomt bord"] },
  { grupp: "Ankare och platser", ord: "DC2 upp", betyder: "Dealerns andra kort, hålkortet, vänt med framsidan upp.", aven: ["REVEAL(D.C2)", "hålkortet vänt", "vändning"] },
  { grupp: "Ankare och platser", ord: "Plats och kort", betyder: "P1–P7 är spelarnas platser från kamerans vänster, C1 och C2 deras två kort: P4C1 är plats 4, första kortet.", aven: ["P4.C1", "box 3 i Scout (box = plats − 1)", "kortplats", "placeringsnyckel"] },
  { grupp: "Ankare och platser", ord: "Dealerns kort", betyder: "DC1, DC2 (hålkortet, med baksidan upp tills det vänds) och ibland DC3.", aven: ["D.C1", "D.C2", "D.C3", "hålkort"] },
  // ── Steps and films ──
  { grupp: "Steg och filmer", ord: "Steg", betyder: "En rörelse mellan två lägen, till exempel steget A2.1 → P4C1. En linje på kartan.", aven: ["kant", "edge", "klipp mellan två ankare", "READY>P4.C1"] },
  { grupp: "Steg och filmer", ord: "Tagning", betyder: "En filmad version av ett steg. Ett steg kan ha många tagningar; en av dem spelas.", aven: ["take", "klipp", "jobb", "job"] },
  { grupp: "Steg och filmer", ord: "Film", betyder: "Det som spelas: en tagnings video.", aven: ["video", "klipp", "source.mp4"] },
  { grupp: "Steg och filmer", ord: "Giv", betyder: "Steget från skon (A2.1 eller A2.2) till ett kort på bordet.", aven: ["deal", "DEAL", "utdelning"] },
  { grupp: "Steg och filmer", ord: "Retur", betyder: "Steget tillbaka från kortet till skon (A2.1) eller till vilan (A1).", aven: ["return", "RETURN"] },
  { grupp: "Steg och filmer", ord: "Ingång", betyder: "Steget från vilan till skon, A1 → A2.1.", aven: ["entry", "ENTRY"] },
  { grupp: "Steg och filmer", ord: "Utgång", betyder: "Steget från skon tillbaka till vilan utan kort, A2.1 → A1.", aven: ["exit", "RETURN till IDLE"] },
  { grupp: "Steg och filmer", ord: "Vilan", betyder: "Steget A1 → A1: den lugna loopen är grunden, och gesterna (hosta, sträcka på sig, le …) slumpas in mellan.", aven: ["IDLE>IDLE", "idle-loopen", "grundloopen", "gester"] },
  { grupp: "Steg och filmer", ord: "Runda", betyder: "En väg genom stegen, skriven som Jakob skriver den: A1 - A2.1 - P4C1 - A2.1 - A1.", aven: ["round", "sekvens", "kedja"] },
  { grupp: "Steg och filmer", ord: "Huvudtagning", betyder: "Den tagning som spelas i ett steg just nu: Primär om en finns, annars den bäst godkända.", aven: ["main", "edge.main", "spelas nu"] },
  { grupp: "Steg och filmer", ord: "Utsnitt", betyder: "En tagning som är rutor A–B ur en längre film, inte en egen beställning.", aven: ["derived", "segment", "härledd tagning"] },
  { grupp: "Steg och filmer", ord: "Rättad kopia", betyder: "En tagning som är en befintlig film rättad med en video-till-video-modell.", aven: ["edit", "editOf", "Aleph"] },
  { grupp: "Steg och filmer", ord: "Experiment", betyder: "Steg utanför modellens 54, till exempel via kortet utdraget plant (DRAWN). Ligger i kartans experimentlåda.", aven: ["experimentkant", "DRAWN", "IDLE-B", "utanför modellen"] },
  // ── Verdicts ──
  { grupp: "Omdömen", ord: "Primär ★", betyder: "Tagningen som spelas först i sitt steg. Bara Jakob väljer den.", aven: ["MAIN", "acceptedAs MAIN", "explicitMain"] },
  { grupp: "Omdömen", ord: "Godkänd ✓", betyder: "Godkänd rakt av: kan bli tagningen som spelas.", aven: ["ACCEPTED", "approved", "userAccepted"] },
  { grupp: "Omdömen", ord: "Variant ◆", betyder: "Godkänd som omväxling: spelas bara ibland eller när den väljs.", aven: ["VARIANT", "acceptedAs VARIANT"] },
  { grupp: "Omdömen", ord: "Väntar ○", betyder: "Ingen har sagt något om tagningen ännu.", aven: ["PENDING", "ogranskad"] },
  { grupp: "Omdömen", ord: "Underkänd ✕", betyder: "Tagningen spelas aldrig.", aven: ["REJECTED", "avvisad"] },
  { grupp: "Omdömen", ord: "Sekundär", betyder: "Ett alternativ som sparas men inte spelas.", aven: ["SECONDARY"] },
  { grupp: "Omdömen", ord: "Granskare", betyder: "Ett omdöme som en agent har satt, inte Jakob (streckad markering).", aven: ["review.decision utan userAccepted"] },
  // ── Pictures and measures ──
  { grupp: "Bilder och mått", ord: "Ingångsbild", betyder: "Bilden en ny dealer börjar från, vilken bild som helst.", aven: ["startbild", "referensbild"] },
  { grupp: "Bilder och mått", ord: "Keystone", betyder: "Förlagan i hög upplösning av en pose. Spelas aldrig; ankaret tas ur en video av den.", aven: ["keystone 1 (stående)", "keystone (sittande)"] },
  { grupp: "Bilder och mått", ord: "Ankare", betyder: "Rutan i bankens format (grönt, bankens sko) som filmer börjar och slutar på.", aven: ["anchor", "anchor.png", "ankarbild"] },
  { grupp: "Bilder och mått", ord: "Landning", betyder: "Rutan där kortet når bordet i en giv.", aven: ["LAND", "landingFrame"] },
  { grupp: "Bilder och mått", ord: "Släpp", betyder: "Rutan där fingrarna lämnar kortet; returen börjar där.", aven: ["RELEASE", "startsOn"] },
  { grupp: "Bilder och mått", ord: "Riktning, lutning, perspektiv", betyder: "Kortets tre mått: vart kortsidan pekar, hur mycket kortet reser sig från bordet, hur mycket smalare den bortre kanten är.", aven: ["vinkel"] },
  // ── Playing and the scene ──
  { grupp: "Spela och scen", ord: "3D", betyder: "Filmen spelad i 3D-scenen vid ett bord, med rum, ljus och kamera.", aven: ["scenen", "scene3d"] },
  { grupp: "Spela och scen", ord: "Inte 3D", betyder: "Filmen som den är, på sin gröna bakgrund.", aven: ["platt", "flat", "film"] },
  { grupp: "Spela och scen", ord: "Basgrund", betyder: "Scenens grundinställning, det tidigare agenter bedömt bäst, att utgå från.", aven: ["baseline", "grundinställning"] },
  { grupp: "Spela och scen", ord: "Prov", betyder: "En jämförelse från arbetet: filmer och bilder med ett omdöme per fil.", aven: ["proof", "kontaktark"] },
  { grupp: "Spela och scen", ord: "Kopian", betyder: "Den låsta studion på nätet: samma vyer, men inget går att ändra.", aven: ["snapshot", "den låsta kopian"] },
];

const fold = (text: string) => text.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();

/** The words a search finds (in the word, its meaning or another name), the word itself first; all for an empty search. */
export function findWords(query: string, words: readonly Word[] = WORDS): Word[] {
  const q = fold(query.trim());
  if (!q) return [...words];
  const score = (w: Word) => (fold(w.ord).includes(q) ? 0 : w.aven.some((a) => fold(a).includes(q)) ? 1 : fold(w.betyder).includes(q) ? 2 : 3);
  return words.filter((w) => score(w) < 3).sort((a, b) => score(a) - score(b));
}
