---
name: bestalla-film
description: Använd när en film eller en stillbild ska beställas hos Runway i dealer-repot, från ett önskemål till en godkänd order som läggs och hämtas, eller när en beställning som föll ska förklaras. Gäller utkast i Bordet, Beställ (data/orders/), godkännande med tools/order-approve.ts, att lägga kön (tools/order-put.ts, order-collect.ts) och val av modell, mall, bilder och referensfilm. Inte för en hel ny dealer (se ny-dealer) eller för granskningen av det som kom (se granska-film).
---

# Beställa en film eller en stillbild

Proceduren står på ett ställe och skrivs inte om här: ingången och station 7–13 i
[`tools/dealer-line.md`](../../../tools/dealer-line.md), hur beställningen komponeras i
[`tools/film-prompting.md`](../../../tools/film-prompting.md) och hur den läggs, hämtas och efterarbetas i
[`tools/order-clerk.md`](../../../tools/order-clerk.md). Läs dem i den ordningen innan något beställs.

## Reglerna som oftast bryts

1. **Betalt bara inom `data/order-policy.json`,** godkänt med Jakobs klick eller av huvudagenten på hans uppdrag
   (`node tools/order-approve.ts <id> --mandate "…"`). Taket och hans gällande ord om budgeten: HANDOFF, "Jakobs besked
   som gäller", Budgeten; läs saldot innan en omgång. Ett betalt anrop utanför Beställ rapporteras till huvudagenten
   med belopp (AGENTS, "Det som skyddar Jakob").
2. **Texten skrivs aldrig för hand.** Den är `promptFor` i `src/order-prompts.ts` med dagens mall; ska orden ändras,
   ändras mallen och versionen räknas upp (handboken §2; bandet, station 8).
3. **Det som skickas är det som godkändes, inget annat:** modell, varje parameter, texten och bilderna är frysta i
   ordern och prövas med hash (`order-clerk.md` §1 och §3). En ändrad parameter är en ny order. I labbet beskriver
   bara det som verkligen går till Runway beställningen (HANDOFF, "Jakobs besked som gäller", Ett labb).
4. **Ett osäkert anrop läggs aldrig om.** En tagning med `requestedAt` och utan task-id är OSÄKER (`order-clerk.md` §3).
5. **Förklara en fallen tagning ur det som faktiskt skickades:** orderns `prompt.text`, bilderna och kvittot
   (`data/orders/<id>.json`, `assets/orders/<id>/receipt.json`), inte ur vad mallen brukar säga. Mall 9 kom till när
   Jakob pekade på "något konstigt i den prompt som skickas" (handboken §5, Mall 9; felen och ändringarna i §4).
6. **En plats, den svåraste, före alla; en ändring per omgång mot ett recept som har hållit; billigt först; det som
   föll beställs inte om** (bandet, "Regler som kostar pengar när de bryts"; handboken, "Det som föll").
7. **Metoden väljs efter Jakobs domar,** `node tools/verdicts-per-method.ts <dealer>`, inte efter granskarens poäng
   (bandet, station 7; handboken §5).
8. **Två tagningar per klipp,** en tredje bara om båda faller; varje omgång granskas oberoende innan nästa bygger på
   den, och kostnaden berättas efter omgången (HANDOFF, "Jakobs besked som gäller", Domar, beställningar och pengar).
9. **Signerade adresser i skriptfiler,** aldrig `node -e`, och en värdadress hamnar aldrig i `data/` eller `assets/`
   (`order-clerk.md`, Tools och §2).

## När det är klart

Tagningen granskas (skill `granska-film`) och förs in med `node tools/order-bring.ts`; raden i handbokens tabeller
(§5) och metoden i `data/order-methods.json` uppdateras av den som provade (bandet, station 15).
