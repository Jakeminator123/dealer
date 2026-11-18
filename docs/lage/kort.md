# Läget: kort

Huvudagentens bana: det ritade kortet, kortspåret, underlägget och pålägget, kortplanens regel och kortproven. Här står
bara det som gäller nu; kontraktet står i `docs/SYSTEM.md`, "Ritade kort".

**Läget.**
- Spelets underlägg (`UNDER` i `src/card-overlay.ts`) är förval sedan 2026-11-14. Kortens fjärde steg (`33b164a`) fick 3,75/5 blint.
- Provet `kort=liggande&cardMethod=film` behåller filmkortet i 2D; `scene` färgar med `cardBack=dark&cardFace=paper`, även i Bordets giv–retur-par.
- Vid uppmätt vila består kortet och senaste belagda sida även utan markör; masken kräver aktuell ruta. Toning börjar bara på FRONT.
- Filmkortsprovet ritar återbrukade C2/split till deras spelplats och fortsätter genom tidig retur fram till vila. Verklig bank är kontrollerad; native splitprov återstår.
- P4.C2 har egna filmer/spår: vila55, släpp64 i Cykel01/65 i Cykel02. Det svagare omtaget är arkiverat med bevis kvar.
- Kortplanen ritas i verkligt perspektiv (`918e7f4`): där planen säger Plant bord ritas varje kort som ett verkligt
  kort (63 × 88 mm, storlek 1,00) genom linsen som ger dealern människostorlek (`src/table-lens.ts`). `planCardQuad` i
  `src/card-plan.ts` är den enda regeln, och samma fyrhörningar används i Bordets Kortplan, kortbanans landning, Ny
  beställnings bild, "Det här skickas" och en ny beställnings sista bild.
- Perspektiv smalnar den bortre kanten kring kortets mitt: 80–96 % för alla kort, med Din plan (87 %, även förval) och Verkligt (96 %).
- Spelet och scenen kan följa samma regel och lins bakom ett val (`geometri=lins`; `TABLE_GEOMETRY` i
  `src/card-plan.ts`, förval `contract` = dagens bild): liggande kort, extra kort, split, det ritade kortets vila och
  scenens filmkamera. Testerna håller kortplan = spel = scen inom 0,01 px; i en webbläsare stämmer nu också stillbilden; rörelsen återstår ([BRISTER](../BRISTER.md)).
- Kortplan har en vy: valet Dator | Mobil och adressordet `vy=mobil` är borta, eftersom inget som körs läste mobilvyn.
  Behövs en mobilvy härleds den ur samma kort och lins, aldrig som en andra inställning.
- Labbet visar släta gula och blå kort (`CARD_COLOUR` i `src/placement-model.ts`), och spelets rygg med SG står kvar:
  inget trycks på korten före efterarbetet ([BESKED](../BESKED.md), "Kortets sidor"; kortet i Beslut är uttaget).
- Jakob sparade planen från Bordet 2026-11-18 kl. 01.30. Den skiljer sig från den incheckade i handbytet på ett kort
  och i P6.C1 (3 px); avsmalningen är 0,87 som förut (0,90 står bara som P6.C1:s eget fält, som regeln inte läser).
  Filen ligger oincheckad i huvudträdet och checkas in på hans ord.
- `data/media-fit.json` säger för varje bild, ankare, giv och referens om den stämmer med dagens kortplan, och Material
  visar det som en bricka ("äldre plan", "annan kamera", "avviker").

**Nästa steg.**
1. C1 ligger kvar genom P4.C2. `paow-c2-paper-rim-20261118` och `paow-c2-contact-20261118` visar mindre blåspill
   med P1/P7 intakta. Helgiven har 9/16 egna målfilmer; blå restkant, egna andrakort/split, hålkortets mask och linsval återstår.
2. När hans sparade plan checkas in, skriv om `data/media-fit.json` med `node tools/media-audit.ts --fit --write`.
   Gör samma mätning när planens regel, linsen eller ett ankare ändras.
3. Kortets sidor i efterarbetet, efter filmerna: gul rygg (SG får stå kvar) och blå framsida, lika i labbet och spelet.
4. Ta bort kravet på två vyer i planfilen (`validatePlan` kräver ännu båda), utan att planfilen skrivs av en agent.
5. Efter filmerna: kortets efterarbete per film, ruta för ruta (kortet i handen och det som är kvar av kortens fjärde
   steg; [BRISTER](../BRISTER.md)).

**Väntar på Jakob.** Inget utanför Beslut.

**Var saker ligger.** Koden i `src/card-plan.ts`, `src/table-lens.ts`, `src/card-overlay.ts` och `src/card-track.ts`
med `tools/track-card.ts`; mätningen mot planen i `tools/media-audit.ts` (rutinen i `docs/DRIFT.md`, "D: och
städning"). Kortbyggarens steg ligger som mappar i `D:/dealer-scratch/tmp/kortbyggare/`, utredningen i
`D:/dealer-scratch/tmp/kortutredning/RAPPORT.md` och 3D-banans mätning av linsen i
`D:/dealer-scratch/tmp/dealer-3d/kalibrering.txt`. Proven: `kortplanen-verkligt-perspektiv` (före och efter; bild 6–9
visar Perspektiv), `kortbanan-efter-filmerna`, `kort-bojning-glans`, `kortets-baksida` och `underlagg`.

**Fällor.**
- Storleken ändras aldrig i Kortplan, bara i Efterarbete (de ritade kortens "Kortens storlek"). V6:s kort mäter cirka
  1,38 av ett verkligt kort (skattat), och det är inget fel i planen.
- Inget ankare krymps för skons skull: kortet i skons fönster är i stort sett rätt, och det Jakob såg som ett dubbelt
  så stort kort kom ur den äldre planens krympning nära dealern.
- Sparade beställningar behåller sitt ritade kort, och planfilen `placements/default.json` skrivs bara från Bordet.
- Tre verktyg står kvar på den gamla regeln med flit: `tools/build-anchor.ts` (frysta hashar),
  `tools/card-coverage.ts` och `tools/placement-backdrop.ts`.
- Kortvärdet äger Scoutgaming: framsidan ska vara en ren yta, och valören ritas när rundan spelas.
- Jakob vill inte välja bland kortvarianter: huvudagenten bestämmer linjen och visar resultatet i labbet först
  ([BESKED](../BESKED.md), "Kortet").
- För nya moduler i spelet gäller fällan om labbserverns lista i [spelet.md](spelet.md).
