# Läget: karta

Kartabanans egen session (Jakob 2026-11-23): vyn Karta, dealerns träd och hur de hänger ihop med Material, Scen &
bord, Granska och spelet. Huvudagenten (adressen står i HANDOFF, "Vem äger vad") committar och bygger studion; lämna
en fillista.

**Läget.**
- Ett träd är en uppsättning ankare ur Material (`data/dealer-trees.json`). Filmerna står inte där:
  `tools/dealer-tree.ts` hittar varje film vars första och sista bild är trädets ankare och svarar Karta genom
  `GET /api/trees`. Måttet är 36 steg, en giv per kort (`src/dealer-trees.ts`).
- Paow har tre träd i Karta: Casino 22/36 (det spelet spelar, händer utan tatueringar), Ingången 22/36 och Tatuerad
  20/36 (byggs, från A2.3). Ingången ÄR Casino: den har bara A1, `shares: casino` och filmen före spelet som väg in,
  men visas som ett eget träd. Utan `?trad=` spelar spelet bara träd med läget `spelas` (nu Casino), ett enda som `?trad=`. Tatuerad blir spelet med
  `casino` och `ingangen` på `vilar`, `tatuerad` på `spelas` (hans ord).
- En komposition lägger ihop träd (`data/dealer-compositions.json`, `src/composition.ts`, `tools/dealer-composition.ts`
  bakom `/api/compositions`): andel per träd och per film på ett steg, lån av steg ett träd saknar, returen hem till sitt
  eget ankare och kort 2 på kort 1:s film. Den står som chips efter träden i Karta, och labbets spel spelar den med
  `?komposition=<id>` (`?trad=` går före).
- Träd med olika A1 (olika händer) sätts inte samman (Jakob 2026-11-23): spara vägras och spelet spelar inte en sådan.
  Paows tre sparade ligger kvar och visas "spelas inte: olika händer". Bryggan (0,2 s i vilan) finns kvar i koden.
- Fart: en komposition bär `tempo` (1–2, också per träd) och ett klipp sin egen (`playbackSpeed` i
  `data/clip-jobs.json`, `tools/clip-speed.ts`). Spelet gångrar dem, högst 2×; vila och tal går som filmat.
- A1 finns i två bilder: `paow-vila-ung-2` (Casino) och `paow-vila-tatuerad` (Tatuerad; gäller i Material).
- Jakob arkiverade 2026-11-23 Casinots A1 och A2.2 och den tatuerade A2.2 i Material. Casino behåller sina bilder:
  dess giv till plats 6 (hans Primär) börjar på A2.2, och givarna dit från A2.1 är underkända. Tatuerad har ingen A2.2.
- Tal räknas för sig: på A1 en bricka (25/25, röd vid 0) och panelen Tal (`studio/lib/tree-talk.ts`); Tatuerad 24/25.
- Ett steg visar filmen spelet spelar där; returen fortsätter given. "Gör primär" är hans klick. Klipp arkiveras och tas tillbaka i Karta.
- Ett ankare kan bära `seat` 1–7; ingen vy visar det. Receptet för en annan stol: [FILMMODELLER](../FILMMODELLER.md), "Vinklar, 3D och Runways lista".

**Nästa steg.**
1. Vyerna hänger ihop. Gå igenom var Karta, Material, Scen & bord (Kortplan, Kön), Granska och spelet säger olika om
   samma träd, ankare eller film, och rätta orsaken. Kända fall: ett arkiverat ankare som ett träd spelar, plats 6
   via A2.2, och `SEAT_HUB` i `src/game-director.ts`.
2. Kartas rad med träd och kompositioner görs om (hans ord 2026-11-23: "denna fula meny"), träden som nivåer man
   rullar mellan i den sammanlagda vyn, och bryggorna går att klicka fram. Sedan Ingången som väg in i Casino.
3. Varianter: en variant är en sekundär film på sitt steg och får sin andel i kompositionen; ett eget träd bara när
   bilderna är andra. De fria givarna (Prov `fria-givar-20261123`) förs in av filmbanan och ska synas så.
4. Kameran som dimension. Karta öppnar på plats 4:s kamera; ett reglage, och musens hjul, byter till kamera 1–7 och
   visar samma träd med de ankare och filmer som finns från den stolen. Tomt där inget är gjort.
5. Kort 3–7: spelet återbrukar bara kort 2. Förslaget är en givfilm till per plats, vid kort 5, och en egen film för
   dealerns kort 3; avstånden står i kompositionens vy.

**Väntar på Jakob.** Hans ja, i Karta, på hur sammanlagda träd, varianter och kameror visas. I chatten: givfilmen vid
kort 5, och om kompositionens tempo ska gälla alla handfilmer i rundan (som nu) eller bara given.

**Var saker ligger.** Kartabanans filer: `studio/app/karta/`, `studio/components/map/`, i `studio/lib/` filerna
`map-layout.ts`, `tree-path.ts`, `primaries.ts` och `edge-stats.ts`, `src/dealer-trees.ts`, `tools/dealer-tree.ts`,
`data/dealer-trees.json` och testerna `studio/tests/dealer-trees.test.ts` och `tree-path.test.ts`. Huvudagentens,
läs men ändra inte: `src/clip-graph.ts`, `src/game-director.ts`, `tools/preview.ts`, `data/media-roles.json`,
filmregistret (`data/motions.jsonl`) och `tools/chain-consistency.test.ts`; behövs en ändring där, skriv vad och varför till huvudagenten.
`node tools/dealer-tree.ts` skriver sin rapport i `.runtime/dealer-trad/`. Hans ord står i
[BESKED](../BESKED.md): sök på "Träd läggs ihop", "Karta får kameran", "Karta med Primära" och "Flera namngivna träd".

**Fällor.**
- Studion han ser byggs ur en commit av huvudagenten ([DRIFT](../DRIFT.md), "Labbservern och fliken"): en ändring
  syns i hans flik först efter fillista, commit och bygge.
- Primär, domar och arkivering är hans klick: inget verktyg sätter dem, och en dom åt honom ser aldrig ut som hans.
- Ett test som läser registren som de står (`tools/chain-consistency.test.ts`) blir rött av ett träd som inte
  stämmer med spelet: läs felet som ett fynd, inte som ett hinder.
- Text räcker inte för honom: visa i Karta, i spelets storlek där en film ingår (skillen `visa-for-jakob`).
