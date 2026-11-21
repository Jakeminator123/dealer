// The studio in short, one text per view: what it shows and what one can do there. Data only (no DOM; its one import is the
// table of words): the
// welcome dialog of the online copy reads it, and the bot's builder puts it in the bot's knowledge, so it is written for
// someone who is not a programmer and has not seen the studio. Swedish, short, Jakob's own words for anchors and verdicts.
// Keep machine paths and private names out: the copy's build scans every text it ships. The words come from lib/words.ts.
import { WORDS as STUDIO_WORDS } from "./words.ts";

export type GuideView = {
  /** The key the view gives to useViewContext (lib/context.ts). */
  vy: string;
  /** The name in the menu. */
  namn: string;
  /** The address inside the studio. */
  adress: string;
  /** What one does there, in four words or so: the welcome's card. */
  kort: string;
  /** What it shows and what one can do there. */
  text: string;
};

export const GUIDE: readonly GuideView[] = [
  {
    // Bordet since 2026-11-17: the one view of the table, holding what Placering and Scen were (and, in the lab, Beställ).
    vy: "bordet",
    namn: "Bordet",
    adress: "/studio/bordet/",
    kort: "Bordet och scenen",
    text:
      "Bordet: en vy med delarna Kortplan, Scen, Råfilm och Efterarbete (i Jakobs labb också Beställ). Kortplan visar var korten " +
      "ligger och hur kortet kommer dit, med kortbanan som en skiss. Scen spelar en runda i 3D-scenen, Råfilm som filmerna är " +
      "på sin gröna bakgrund, och Efterarbete visar det som läggs över filmen, som korten och markerna. Rundan skrivs som Jakob " +
      "skriver den: ”A2.1 - P4C1 - A2.1”. Remsan under bilden visar varje steg; mellanslag spelar och pausar.",
  },
  {
    vy: "karta",
    namn: "Karta",
    adress: "/studio/karta/",
    kort: "Se dealerns nodträd",
    text:
      "Dealerns nodträd, ett i taget (till exempel Casino 22/36 och Tatuerad 0/36): bilderna för A1, trädets ankare vid skon " +
      "och varje kort, och de 36 stegen i Jakobs mått som linjer. Heldragen linje: steget har film; streckad: ett prov väntar " +
      "på dom; röd: steget saknas. Ett steg med film visar sin Primär och de andra tagningarna; ett saknat steg visar vad en " +
      "beställning har och saknar, priset och kommandot som gör ett utkast.",
  },
  {
    vy: "granska",
    namn: "Granska",
    adress: "/studio/granska/",
    kort: "Tagningar som väntar",
    text:
      "Tagningarna som väntar på Jakobs beslut, en i taget och stort, med kön bredvid. ”Alla” listar varje tagning med filter. " +
      "Delen Prov har proven. I kopian på nätet går inget att ändra: man kan titta och jämföra, besluten är Jakobs.",
  },
  {
    // Granska's part Prov (/granska/?vy=prov); /prov/ leads there.
    vy: "prov",
    namn: "Prov",
    adress: "/studio/granska/?vy=prov",
    kort: "Se proven",
    text:
      "Granskas del Prov: jämförelsefilmer och kontaktark från arbetet, nyast först. Öppna ett prov för att se dess filmer och " +
      "bilder, var och en med sitt omdöme (användbar, med anmärkningar, underkänd).",
  },
  {
    vy: "jamfor",
    namn: "Jämför",
    adress: "/studio/jamfor/",
    kort: "Två tagningar bredvid varandra",
    text:
      "Två tagningar av samma steg sida vid sida från samma start, oftast en kandidat mot primären, med bildruta för bildruta " +
      "och båda i samma bild (tangenten X). Öppnas från en tagning, inte från menyn.",
  },
  {
    vy: "onskemal",
    namn: "Önskemål",
    adress: "/studio/onskemal/",
    kort: "Önskemål till Jakob",
    text:
      "Alla önskemål, frågor och felrapporter som skickats till Jakob, nyast först, med status och hans svar. Ett nytt skrivs med " +
      "”Tyck till” i Fråga, eller med ”Gör till önskemål” under ett svar; inget skickas förrän man trycker Skicka till Jakob.",
  },
];

/** The panel itself, for the bot's knowledge and the welcome's fourth card. */
export const FRAGA: GuideView = {
  vy: "fraga",
  namn: "Fråga",
  adress: "",
  kort: "Fråga eller tyck till",
  text:
    "Boten svarar på frågor om dealerprojektet ur ett förberett underlag, med källa på varje påstående. Snabb svarar på några " +
    "sekunder, Grundlig tänker längre. Den ser vilken vy man tittar på och vad som är valt där, och man kan skicka med en bild " +
    "och rita i den med pennan. Ett svar kan göras om till ett önskemål till Jakob. Boten kan ha fel; Jakob avgör.",
};

/** The welcome of the online copy: a heading and three lines. */
export const WELCOME = {
  rubrik: "Välkommen till dealerstudion",
  rader: [
    "Här byggs dealern: filmerna där hon delar ut kort, och hur de sätts ihop till en hel runda.",
    "Det du ser är en kopia. Inget här går att ändra, så titta, spela och jämför fritt.",
    "Undrar du något, eller vill du be Jakob om något? Tryck på Fråga.",
  ],
} as const;

/**
 * Jakob's words, for the bot's knowledge: the studio's one table (lib/words.ts), each word with what it means and the
 * other names it has in code and documents, so that the bot answers in the same words as the views and the Ordlista.
 */
export const WORDS: readonly { ord: string; betyder: string }[] = [
  { ord: "A2.1 - P4C1 - A2.1", betyder: "En giv som Jakob skriver den: från nypet till plats 4:s första kort och tillbaka." },
  ...STUDIO_WORDS.map((w) => { const also = [...w.sager, ...w.aven]; return { ord: w.ord, betyder: also.length ? `${w.betyder} Kallas också: ${also.join(", ")}.` : w.betyder }; }),
];

/** The guide text of one view, or null. */
export const guideOf = (vy: string): GuideView | null => (vy === FRAGA.vy ? FRAGA : (GUIDE.find((g) => g.vy === vy) ?? null));
