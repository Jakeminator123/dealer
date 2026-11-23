# Läget: kort

Huvudagentens bana: det ritade kortet, kortspåret, underlägget och pålägget, kortplanens regel och kortproven. Här står
bara det som gäller nu; kontraktet står i `docs/SYSTEM.md`, "Ritade kort".

**Läget.**
- Spelets underlägg (`UNDER` i `src/card-overlay.ts`) är förval sedan 2026-11-14. Kortens fjärde steg (`33b164a`) fick 3,75/5 blint.
- Provet `kort=liggande&cardMethod=film` behåller filmkortet i 2D; `scene` färgar med `cardBack=dark&cardFace=paper`, även i Bordets giv–retur-par.
- Vid uppmätt vila består kortet och senaste belagda sida även utan markör; masken kräver aktuell ruta. Toning börjar bara på FRONT.
- Filmkortsprovet ritar återbrukade C2/split till spelplatsen genom returen. Native splitrunda klar; C2-kant högst 1 px vid två gränser (`paow-game-carry-20261118`). Full rörelsedom återstår.
- P4.C2 har egna filmer/spår: vila55, släpp64 i Cykel01/65 i Cykel02. Det svagare omtaget är arkiverat med bevis kvar.
- Kortplanen ritas i verkligt perspektiv (`918e7f4`): där planen säger Plant bord ritas varje kort som ett verkligt
  kort (63 × 88 mm, storlek 1,00) genom linsen som ger dealern människostorlek (`src/table-lens.ts`). `planCardQuad` i
  `src/card-plan.ts` är den enda regeln, och samma fyrhörningar används i Bordets Kortplan, kortbanans landning, Ny
  beställnings bild, "Det här skickas" och en ny beställnings sista bild.
- Perspektiv smalnar den bortre kanten kring kortets mitt: 80–96 % för alla kort, med Din plan (87 %, även förval) och Verkligt (96 %).
- Spelet och scenen följer nu B-linsen (`TABLE_GEOMETRY = lens`): kort, extra kort, split och filmkamera. Insatsringarna
  är cirklar på samma bord, projicerade till ovaler. Kortplan = spel = scen inom 0,01 px; filmhändernas rörelse återstår.
- **Använd i Casino** sparar Scen-vyn i `data/scene-presets/casino.json`, även Bred lins (`geometri: "kontrakt"`);
  Casino-länken och `/casino` läser den. Kortplan och order står på B.
- Kortplan har en vy; Dator | Mobil och `vy=mobil` är borta. En framtida mobilvy härleds ur samma kort och lins.
- D.C3 är redigerbart i Kortplan och Beställ; äldre planer bevarar de 16 korten och får dess tidigare spelposition. Sparad D.C3 styr senare dealer-kort. Tre lokala geometrier jämförs i Prov `paow-dc3-tre-geometrier-20261119` (372 krediter); inget Primär-byte.
- Filmkortet är gult och blått, och den blå sidan bär ett rosa kryss och en röd cirkel (`CARD_RGB`, `cardMark` i
  `src/placement-model.ts`; [BESKED](../BESKED.md), "Märket på blå sidan"; prövat i tre filmer utanför Beställ, se BRISTER). Spelets rygg med SG står kvar.
- Jakobs senast sparade plan (Bordet, 2026-11-21 kl. 19.16) är incheckad i `f020312`: P4.C2 har handbyte och vänds
  vid läggningen, och D.C3 finns. Avsmalningen är 0,87 (0,90 står i den stående vyns fält). Hans plan och domar tas
  med vid avslut på hans uttryckliga begäran 2026-11-19.
- `data/media-fit.json` säger för varje bild, ankare, giv och referens om den stämmer med dagens kortplan, och Material
  visar det som en bricka ("äldre plan", "annan kamera", "avviker").
- Labbprovet `kortprov` (Scen, av som förval) lagar det ritade kortet i handen: vändningen ur mätningen, papperets ljus med minne. Prov `kort-fram-bak-20261120`; hur i [BRISTER](../BRISTER.md), "Kortet".

**Nästa steg.**
1. C1 ligger kvar genom P4.C2. `paow-c2-paper-rim-20261118` och `paow-c2-contact-20261118` visar mindre blåspill
   med P1/P7 intakta. Rundans behov täcks 22/22; 9 egna givar och 14 återbruk ger 23/24 kortlägen. DC3 är nästa steg.
2. `data/media-fit.json` är ommätt. Kör `node tools/media-audit.ts --fit --write` igen när plan, lins eller ankare ändras.
3. Grafiken på kortet ([BESKED](../BESKED.md), "Grafiken på kortet"): gul rygg (SG får stå kvar) och blå framsida, lika i labbet och spelet, på kortmodellens spår. Styvt kort (22/23 A2.3-givar, `styvt_kort.ts`) ses på
   `/kortlandning.html` (dealer-e7); `kortprov` står avstängt. Provfilmen `paow-giv-2-3-p4-03` (märke på gula sidan) är i banken som variant: det vita är borta ur skon, men krysset blir en röd hörnprick.
4. Ta bort kravet på två vyer i planfilen (`validatePlan` kräver ännu båda), utan att planfilen skrivs av en agent.

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
- Två verktyg står kvar på den gamla regeln med flit: `tools/card-coverage.ts` och `tools/placement-backdrop.ts`.
- Kortvärdet äger Scoutgaming: framsidan ska vara en ren yta, och valören ritas när rundan spelas.
- Jakob vill inte välja bland kortvarianter: huvudagenten bestämmer linjen och visar resultatet i labbet först
  ([BESKED](../BESKED.md), "Kortet").
- För nya moduler i spelet gäller fällan om labbserverns lista i [spelet.md](spelet.md).
