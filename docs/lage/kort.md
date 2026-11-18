# Läget: kort

Huvudagentens bana: det ritade kortet, kortspåret, underlägget och pålägget, kortplanens regel och kortproven. Här står
bara det som gäller nu; kontraktet står i `docs/SYSTEM.md`, "Ritade kort".

**Läget.**
- Spelet ritar kortet hela vägen med underlägget under (`UNDER` i `src/card-overlay.ts`), som är förvalet sedan
  2026-11-14; kortens fjärde steg (`33b164a`) är blint granskat 3,75/5. Pålägget fick 3/5 och är inte i spelet.
- Kortplanen ritas i verkligt perspektiv (`918e7f4`): där planen säger Plant bord ritas varje kort som ett verkligt
  kort (63 × 88 mm, storlek 1,00) genom linsen som ger dealern människostorlek (`src/table-lens.ts`). `planCardQuad` i
  `src/card-plan.ts` är den enda regeln, och samma fyrhörningar används i Bordets Kortplan, kortbanans landning, Ny
  beställnings bild, "Det här skickas" och en ny beställnings sista bild.
- Perspektiv ändrar bara kortens form (`f8c637f`): reglaget smalnar av den bortre kanten kring kortets egen mittlinje,
  ett värde för alla kort, 80–96 %, med märken vid Din plan (87 %) och Verkligt (96 %). Utan sparat värde ritas 87 %.
- Kortplan har en vy: valet Dator | Mobil och adressordet `vy=mobil` är borta, eftersom inget som körs läste mobilvyn.
  Behövs en mobilvy härleds den ur samma kort och lins, aldrig som en andra inställning.
- Labbet visar släta gula och blå kort (`CARD_COLOUR` i `src/placement-model.ts`); det tryckta kortet med SG är ett val
  märkt som efterarbete.
- `data/media-fit.json` säger för varje bild, ankare, giv och referens om den stämmer med dagens kortplan, och Material
  visar det som en bricka ("äldre plan", "annan kamera", "avviker").

**Nästa steg.**
1. Spelets liggande kort ska följa `planCardQuad`: `src/game-table.ts` ritar med `flatQuad`, pålägget ligger i
   `card-overlay-view`, och 3D-scenen ställer korten med kontraktets kamera (k = 2), som är en annan kamera än linsen.
   Visa det för Jakob i labbet först.
2. Kortets baksida (kortet `kortets-baksida` i Beslut): gul rygg med SG och blå framsida, gjort i efterarbetet och
   lika i labbet och spelet; sedan tas kortet ur Beslut.
3. Skriv om `data/media-fit.json` med `node tools/media-audit.ts --fit --write` när planens regel, linsen eller ett
   ankare ändras, också när Jakob sparar ett nytt Perspektiv; det sker inte automatiskt.
4. Ta bort kravet på två vyer i planfilen (`validatePlan` kräver ännu båda), utan att planfilen skrivs av en agent.
5. Efter filmerna: kortets efterarbete per film, ruta för ruta (kortet i handen och det som är kvar av kortens fjärde
   steg; [BRISTER](../BRISTER.md)).

**Väntar på Jakob.** Kortet `kortets-baksida` i Beslut är besvarat ("ny") och inte utfört; inget annat väntar.

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
- När spelet börjar importera `src/card-plan.ts` gäller fällan om nya moduler i [spelet.md](spelet.md).
