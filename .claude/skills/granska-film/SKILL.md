---
name: granska-film
description: Använd när en levererad film eller stillbild från Runway ska granskas i dealer-repot innan Jakob dömer den, när en dom ska föras in (tools/order-put.ts review, tools/review-put.ts), när en film ska lagas med tools/film-fix.ts, eller när något ska läggas fram för Jakobs dom i Granska. Gäller också den som startar en oberoende granskare åt en annan agent.
---

# Granska en levererad film

Proceduren, rapportens punkter och fellistan står i [`tools/film-review.md`](../../../tools/film-review.md); vem som
beslutar i [`tools/dealer-line.md`](../../../tools/dealer-line.md), "Vem beslutar" och station 12–14. Läs
granskningsinstruktionen innan första rutan läggs ut. Här står bara var det står.

## Reglerna som oftast bryts

1. **Granskaren har inte beställt filmen** (BESKED, "Domar åt honom, och ingen kö"; bandet, "Vem beslutar").
2. **Full upplösning, inte kontaktark,** för varje påstående om kortet och händerna (BESKED, "Två tagningar per
   klipp"; `film-review.md`, Metod).
3. **Jakobs domar är hans.** Granskaren föreslår; Primär väljer bara han (AGENTS, "Det som skyddar Jakob").
4. **En dom åt honom bara där han uttryckligen har lämnat över den,** med `node tools/review-put.ts`; den ser aldrig ut
   som hans och ersätts av hans beslut (AGENTS; BESKED, "Domar åt honom, och ingen kö").
5. **Originalet ändras aldrig.** En lagning med `tools/film-fix.ts` ligger bredvid och granskas som en egen film
   (AGENTS, "Det som skyddar Jakob"; `film-review.md`, Fellistan).
6. **Råd: en naturlig avvikelse är en möjlig variant,** inte ett fel; han avgör (`film-review.md` punkt 0).
7. **Råd: domen förs in i kvittot** med `node tools/order-put.ts review` (bandet, station 12), och rutor, ffmpeg och
   städningen efteråt följer `film-review.md`, Metod.

## Lägga fram för Jakob

Det han ska se läggs som en provmapp i `assets/proofs/<namn>/` (Granska, Prov) och, när det väntar på hans svar, som ett
kort i Beslut; hur det visas, och att granskarna inte är hans öga: skill `visa-for-jakob`.
