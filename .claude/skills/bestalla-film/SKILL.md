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

1. **Betalt bara inom `data/order-policy.json`,** godkänt av Jakob eller av huvudagenten på hans uppdrag
   (`tools/order-approve.ts`). Ramen och hans gällande ord: `docs/BESKED.md`, "Domar, beställningar och pengar"; läs
   saldot före en omgång. Betalt utanför Beställ rapporteras med belopp (AGENTS, "Det som skyddar Jakob").
2. **Det som skickas är det som godkändes:** ordern är fryst och prövas med hash; en ändrad parameter är en ny order
   (`order-clerk.md` §1 och §3).
3. **Ett osäkert anrop läggs aldrig om** (`order-clerk.md` §3).
4. **Ramens tagningar och omgångar:** en per prov, två där metoden gäller, varje omgång oberoende granskad innan nästa
   bygger på den, kostnaden berättad efteråt (BESKED, "Två tagningar per klipp"; bandet, "Regler som kostar pengar när de
   bryts").
5. **Bara sätt som håller, och en pilot först** (Jakob 2026-11-24): `node tools/verdicts-per-method.ts` listar sätten
   ur hans egna domar, inte granskarens poäng. Godkännandet släpper en pilot av ett oprövat sätt och inget som föll.
6. **Händerna och vändningen följer receptet och hans ord** (från A2.3 två händer, Jakob 2026-11-21 och 2026-11-23);
   ett avsteg står i utkastets anteckningar (handboken §2).
7. **Signerade adresser i skriptfiler, aldrig `node -e`, och ingen värdadress i `data/` eller `assets/`**: repot är
   publikt (`order-clerk.md`, Tools och §2).
8. **Råd:** texten kommer ur mallen (`promptFor` i `src/order-prompts.ts`; handboken §2), och en fallen tagning
   förklaras ur det som faktiskt skickades, orderns `prompt.text`, bilderna och kvittot (handboken §4–§5).

## När det är klart

Tagningen granskas (skill `granska-film`) och förs in med `node tools/order-bring.ts`; raden i handbokens tabeller
(§5) och metoden i `data/order-methods.json` uppdateras av den som provade (bandet, station 15).
