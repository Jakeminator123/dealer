# Läget: karta

Kartabanans egen session (Jakob 2026-11-23): vyn Karta, dealerns träd och hur de hänger ihop med Material, Scen &
bord, Granska och spelet. Huvudagenten (adressen står i HANDOFF, "Vem äger vad") committar och bygger studion; lämna
en fillista.

**Läget.**
- Ett träd är en uppsättning ankare ur Material (`data/dealer-trees.json`). Filmerna står inte där:
  `tools/dealer-tree.ts` hittar varje film vars första och sista bild är trädets ankare och svarar Karta genom
  `GET /api/trees`. Måttet är 36 steg, en giv per kort (`src/dealer-trees.ts`).
- Paow har tre träd i Karta: Casino 22/36 (det spelet spelar, händer utan tatueringar), Ingången 22/36 och Tatuerad
  14/36 (byggs, från A2.3). Ingången ÄR Casino: den har bara A1, `shares: casino` och filmen före spelet som väg in,
  men visas som ett eget träd.
- A1 finns i två bilder med samma bildpunkter utanför händerna: `paow-vila-ung-2` (Casino) och `paow-vila-tatuerad`
  (Tatuerad; gäller i Material). Där kan träden bindas.
- Jakob arkiverade 2026-11-23 Casinots A1 och A2.2 och den tatuerade A2.2 i Material. Casino behåller sina bilder:
  dess giv till plats 6 (hans Primär) börjar på A2.2, och givarna dit från A2.1 är underkända. Tatuerad har ingen A2.2.
- Ett steg har en Primär och sekundära filmer (EdgeSheet; "Gör primär" är hans klick). Ett klipp arkiveras och tas
  tillbaka i Karta.
- Formatet har redan sätet: ett ankare kan bära `seat` 1–7 och skrivs då S2-A2.2. Ingen vy visar det.
- Provet `fran-stol-1-20261123` är första filmen från en annan stol (given till plats 4 sedd från stol 1); receptet
  står i [FILMMODELLER](../FILMMODELLER.md), "Vinklar, 3D och Runways lista". Den har ingen plats i Karta.

**Nästa steg.**
1. Vyerna hänger ihop. Gå igenom var Karta, Material, Scen & bord (Kortplan, Kön), Granska och spelet säger olika om
   samma träd, ankare eller film, och rätta orsaken. Kända fall: ett arkiverat ankare som ett träd spelar, plats 6
   via A2.2, och `SEAT_HUB` i `src/game-director.ts`.
2. Träd som läggs ihop. Ingången blir en väg in i Casino, inte ett eget träd. Ett träd kan bygga på ett annat
   (Tatuerad på Casino i A1) och låna steg det saknar; Karta visar vad som är eget och vad som är lånat. Skarven
   mellan tatuerade och otatuerade händer avgör han med ögat.
3. Varianter (huvudagentens förslag, hans ja väntar): en variant är en sekundär film på sitt steg, med samma första
   och sista bild som stegets Primär, och han slår på och av den där. Ett eget träd bara när bilderna är andra. De
   fria givarna (Prov `fria-givar-20261123`) förs in av filmbanan och ska synas så.
4. Kameran som dimension. Karta öppnar på plats 4:s kamera; ett reglage, och musens hjul, byter till kamera 1–7 och
   visar samma träd med de ankare och filmer som finns från den stolen. Tomt där inget är gjort.
5. Spelet väljer inte träd än (`buildGraph` blandar alla filmer). Föreslå hur ett valt träd med påslagna varianter
   blir det spelet spelar; ändringen i spelet gör huvudagenten.

**Väntar på Jakob.** Hans ja, i Karta, på hur sammanlagda träd, varianter och kameror visas, innan någon annan vy
eller spelet läser ett nytt format.

**Var saker ligger.** Kartabanans filer: `studio/app/karta/`, `studio/components/map/`, i `studio/lib/` filerna
`map-layout.ts`, `tree-path.ts`, `primaries.ts` och `edge-stats.ts`, `src/dealer-trees.ts`, `tools/dealer-tree.ts`,
`data/dealer-trees.json` och testerna `studio/tests/dealer-trees.test.ts` och `tree-path.test.ts`. Huvudagentens,
läs men ändra inte: `src/clip-graph.ts`, `src/game-director.ts`, `tools/preview.ts`, `data/media-roles.json`,
`motions/` och `tools/chain-consistency.test.ts`; behövs en ändring där, skriv vad och varför till huvudagenten.
`node tools/dealer-tree.ts` skriver sin rapport i `.runtime/dealer-trad/`. Hans ord står i
[BESKED](../BESKED.md): sök på "Träd läggs ihop", "Karta får kameran", "Karta med Primära" och "Flera namngivna träd".

**Fällor.**
- Studion han ser byggs ur en commit av huvudagenten ([DRIFT](../DRIFT.md), "Labbservern och fliken"): en ändring
  syns i hans flik först efter fillista, commit och bygge.
- Primär, domar och arkivering är hans klick: inget verktyg sätter dem, och en dom åt honom ser aldrig ut som hans.
- Ett träds ankare får vara arkiverat i Material: trädet behåller bilden så länge dess filmer spelas.
- Ett test som läser registren som de står (`tools/chain-consistency.test.ts`) blir rött av ett träd som inte
  stämmer med spelet: läs felet som ett fynd, inte som ett hinder.
- Text räcker inte för honom: visa i Karta, i spelets storlek där en film ingår (skillen `visa-for-jakob`).
