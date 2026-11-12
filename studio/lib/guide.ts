// The studio in short, one text per view: what it shows and what one can do there. Data only (no imports, no DOM): the
// welcome dialog of the online copy reads it, and the bot's builder puts it in the bot's knowledge, so it is written for
// someone who is not a programmer and has not seen the studio. Swedish, short, Jakob's own words for anchors and verdicts.
// Keep machine paths and private names out: the copy's build scans every text it ships.

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
    vy: "spela",
    namn: "Spela",
    adress: "/studio/",
    kort: "Spela en runda",
    text:
      "Spelar en runda med dealern, i 3D-scenen eller som vanliga filmer (Inte 3D). Välj en färdig runda till höger, till exempel " +
      "Plats 4 eller Alla platser, eller skriv en egen som Jakob skriver den: ”A2.1 - P4C1 - A2.1”. Remsan under bilden visar varje " +
      "steg, vilken tagning som spelas och varför. Mellanslag spelar och pausar, pilarna stegar en bildruta.",
  },
  {
    vy: "karta",
    namn: "Karta",
    adress: "/studio/karta/",
    kort: "Se alla filmer på kartan",
    text:
      "Nodkartan över allt som är filmat, upplagd som bordet: ankarna vid skon (A1 vila, A2.1 nyp, A2.2 hand över), platserna P1 " +
      "till P7 i en båge och dealern överst. Varje linje är en film mellan två lägen och visar vad som spelas där. Klicka på en " +
      "linje för att se alla tagningar av den filmen, med Jakobs omdöme på varje.",
  },
  {
    vy: "primara",
    namn: "Primära",
    adress: "/studio/primara/",
    kort: "Vad som spelas nu",
    text:
      "För varje film i en hel runda: tagningen som spelas nu bredvid den bästa som Jakob har godkänt rakt av, och skarven mellan " +
      "giv och retur. En Primär är tagningen som alltid ska spelas på en film; den väljer bara Jakob.",
  },
  {
    vy: "granska",
    namn: "Granska",
    adress: "/studio/granska/",
    kort: "Tagningar som väntar",
    text:
      "Tagningarna som väntar på Jakobs beslut, en i taget och stort, med kön bredvid. ”Alla” listar varje tagning med filter. " +
      "I kopian på nätet går inget att ändra: man kan titta och jämföra, besluten är Jakobs.",
  },
  {
    vy: "prov",
    namn: "Prov",
    adress: "/studio/prov/",
    kort: "Se proven",
    text:
      "Provrummet: jämförelsefilmer och kontaktark från arbetet, nyast först. Öppna ett prov för att se dess filmer och bilder, " +
      "var och en med sitt omdöme (användbar, med anmärkningar, underkänd).",
  },
  {
    vy: "scen",
    namn: "Scen",
    adress: "/studio/scen/",
    kort: "Rum, ljus och bord",
    text: "3D-scenens inställningar: rum, rörelser, ljus, bord, kort och kamera, med en grundinställning att utgå från.",
  },
  {
    vy: "jamfor",
    namn: "Jämför",
    adress: "/studio/jamfor/",
    kort: "Två tagningar bredvid varandra",
    text:
      "Två tagningar av samma film sida vid sida från samma start, oftast en kandidat mot primären, med bildruta för bildruta " +
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

/** Jakob's words, for the bot's knowledge: what the studio's short names mean. */
export const WORDS: readonly { ord: string; betyder: string }[] = [
  { ord: "A1, ankare 1", betyder: "Vila: dealerns händer i viloläget." },
  { ord: "A2.1, ankare 2.1", betyder: "Nyp: handen nyper kortet i skons fönster, redo att dela ut." },
  { ord: "A2.2, ankare 2.2", betyder: "Hand över: handen lämnar kortet vid skons mun." },
  { ord: "P1C1 … P7C2", betyder: "Plats 1 till 7, kort 1 eller 2. DC1, DC2 är dealerns egna kort." },
  { ord: "A2.1 - P4C1 - A2.1", betyder: "En giv som Jakob skriver den: från nypet till plats 4:s första kort och tillbaka." },
  { ord: "Tagning", betyder: "En filmad version av en film. En film (en kant på kartan) kan ha många tagningar." },
  { ord: "Primär ★", betyder: "Tagningen som alltid ska spelas på en film. Bara Jakob väljer den." },
  { ord: "Godkänd ✓", betyder: "Jakob har godkänt tagningen rakt av." },
  { ord: "Variant ◆", betyder: "Godkänd som variant: får spelas, men är inte förstahandsvalet." },
  { ord: "Väntar ○", betyder: "Ingen har sagt något om tagningen ännu." },
  { ord: "Underkänd ✕", betyder: "Tagningen spelas inte." },
  { ord: "3D eller Inte 3D", betyder: "Filmen spelad i 3D-scenen vid ett bord, eller som den är, på sin gröna bakgrund." },
];

/** The guide text of one view, or null. */
export const guideOf = (vy: string): GuideView | null => (vy === FRAGA.vy ? FRAGA : (GUIDE.find((g) => g.vy === vy) ?? null));
