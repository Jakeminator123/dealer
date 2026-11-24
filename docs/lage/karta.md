# Läget: karta

Vyn Karta, dealerns träd och hur de hänger ihop med Material, Scen & bord, Granska och spelet. Banan är huvudagentens
(HANDOFF, "Vem äger vad"), som committar och bygger studion; en underagent lämnar en fillista.

**Läget.**
- Ett träd är en uppsättning ankare ur Material (`data/dealer-trees.json`). Filmerna står inte där:
  `tools/dealer-tree.ts` lägger varje film i trädet vars ankare är dess första och sista bild och svarar Karta genom
  `GET /api/trees`. Måttet är 36 steg, en giv per kort (`src/dealer-trees.ts`).
- Paow har fyra träd: Tatuerad 22/36 (det spelet spelar sedan 2026-11-24; hon skjuter kortet från A2.3), Tatuerad nyp
  1/36 (byggs; hon nyper från A2.1 `paow-nyp-tatuerad`), Casino (vilar; händer utan tatueringar) och Ingången (vilar; ÄR
  Casino: `shares: casino`, filmen före spelet som väg in). Ett utdelningssätt är ett träd.
- De två tatuerade träden vilar på samma A1. En film som bara står på den bilden (vila, tal, hålkort) är Tatuerads, det
  första i registret; nypet lånar den i en komposition. En film från `paow-nyp-tatuerad` hamnar i Tatuerad nyp av sin
  första bild, vad ordern än hette; `node tools/order-new.ts … --trad tatuerad-nyp` vägrar ett annat träds ankare.
- Utan `?trad=` spelar spelet bara träd med läget `spelas` (nu Tatuerad), ett enda som `?trad=`. Casino och Ingången
  vilar och spelas med `?trad=casino` (hans ord 2026-11-24).
- En komposition lägger ihop träd (`data/dealer-compositions.json`, `src/composition.ts`, `tools/dealer-composition.ts`
  bakom `/api/compositions`): andel per träd och per film på ett steg, lån av steg ett träd saknar, returen hem till sitt
  eget ankare och kort 2 på kort 1:s film. Chips efter träden i Karta; labbets spel spelar den med `?komposition=<id>`
  (`?trad=` går före). Den bär också `tempo` (1–2, per träd); ett klipp sin egen fart (`tools/clip-speed.ts`), högst 2×.
- `tatuerad-skjut-nyp` är skjutet och nypet i en runda (50/50; andelen sätts i Karta). Där nypet saknar film spelar
  skjutet. Träden möts i vilan: utan brygga vid skon byter handen sätt bara när ett steg börjar eller filmen saknas, med
  brygga (film eller klipp, väljs i Karta) kort för kort.
- Träd med olika A1 (olika händer) går att sätta samman igen (Jakob 2026-11-24): Karta säger "olika händer" som
  upplysning, och en sådan spelas bara när han väljer den med `?komposition=`; utan ordet bara träd med läget `spelas`.
- Tal räknas för sig, på A1 och i panelen Tal (`studio/lib/tree-talk.ts`); Tatuerad 24/25.
- Ett steg visar spelets förstaval; utan Primär (hans klick, låser steget) spelar spelet stegets godkända filmer i tur,
  returen efter sin giv (BESKED). Klipp arkiveras och tas tillbaka i Karta.
- Ankare med `seat` 1–7 är trädet från den stolens kamera, aldrig spelat rakt; Tatuerad har A2.3 från sex stolar.

**Nästa steg.**
1. Nypet: givarna från `paow-nyp-tatuerad` (plats 4, sedan 1, 2, 3, 5, 7) fyller trädet när de är godkända. Saknas med
   tatuerade händer: utgången A2.1 → A1 (ingången baklänges, som för A2.3) och bryggorna vid skon, A2.1 → A2.3 och
   A2.3 → A2.1. Provet `brygga-mellan-trad-20261123` går från Casinots otatuerade A2.1.
2. Vyerna hänger ihop: rätta orsaken där Karta, Material, Scen & bord, Granska och spelet säger olika om samma träd
   eller film. Kända fall: ett arkiverat ankare som ett träd spelar, plats 6 via A2.2, `SEAT_HUB` (`src/game-director.ts`).
3. Kartas rad med träd och kompositioner görs om (hans ord 2026-11-23: "denna fula meny"), träden som nivåer man
   rullar mellan, och bryggorna går att klicka fram. Sedan Ingången som väg in i Casino.
4. Varianter spelas i tur med stegets andra godkända filmer; de fria givarna (Prov `fria-givar-20261123`) ska synas så.
5. Kort 3–7: spelet återbrukar bara kort 2. Förslag: en givfilm till per plats vid kort 5, en egen för dealerns kort 3.

**Väntar på Jakob.** Hans ja, i Karta, på hur sammanlagda träd, varianter och kameror visas, och hans andelar för skjut
och nyp. I chatten: givfilmen vid kort 5, och om kompositionens tempo ska gälla alla handfilmer i rundan eller bara given.

**Var saker ligger.** Kartabanans filer: `studio/app/karta/`, `studio/components/map/`, i `studio/lib/` filerna
`map-layout.ts`, `tree-path.ts`, `primaries.ts` och `edge-stats.ts`, `src/dealer-trees.ts`, `src/composition.ts`,
`tools/dealer-tree.ts`, `tools/dealer-composition.ts`, de två registren och testerna `studio/tests/dealer-trees.test.ts`,
`tree-path.test.ts` och `tools/composition.test.ts`. Huvudagentens, läs men ändra inte: `src/clip-graph.ts`,
`src/game-director.ts`, `tools/preview.ts`, `data/media-roles.json`, `data/motions.jsonl` och
`tools/chain-consistency.test.ts`. `node tools/dealer-tree.ts` skriver sin rapport i `.runtime/dealer-trad/`. Hans ord:
[BESKED](../BESKED.md), sök på "Två träd, bundna i Karta", "Träd läggs ihop", "Karta får kameran", "Karta med Primära".

**Fällor.**
- Studion han ser byggs ur en commit av huvudagenten ([DRIFT](../DRIFT.md), "Labbservern och fliken").
- Servern läser `tools/` en gång: en ändrad trädregel gäller efter `node tools/preview.ts --restart`. Ett register som
  den inlästa koden vägrar ger 500, och spelet spelar då alla filmer.
- Primär, domar och arkivering är hans klick: inget verktyg sätter dem.
- `tools/chain-consistency.test.ts` läser registren som de står: rött där är ett fynd, inte ett hinder.
- Text räcker inte för honom: visa i Karta, i spelets storlek (skillen `visa-for-jakob`).
