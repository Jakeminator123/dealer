---
name: granska-film
description: Använd när en levererad film eller stillbild från Runway ska granskas i dealer-repot innan Jakob dömer den, när en dom ska föras in (tools/order-put.ts review, tools/review-put.ts), när en film ska lagas med tools/film-fix.ts, eller när något ska läggas fram för Jakobs dom i Granska. Gäller också den som startar en oberoende granskare åt en annan agent.
---

# Granska en levererad film

Proceduren, rapportens punkter och fellistan står i [`tools/film-review.md`](../../../tools/film-review.md); vem som
beslutar i [`tools/dealer-line.md`](../../../tools/dealer-line.md), "Vem beslutar" och station 12–14. Läs
granskningsinstruktionen hel innan första rutan läggs ut.

## Reglerna som oftast bryts

1. **Granskaren har inte beställt filmen.** En beställningsagent granskar aldrig sina egna tagningar som sista ord
   (`order-clerk.md` §8; bandet, "Vem beslutar").
2. **Full upplösning, inte kontaktark,** för varje påstående om kortet, fingrarna, vändningen och de första och sista 15
   rutorna; mätt märks [M], sett [S] (`film-review.md`, Metod och Rapport).
3. **Jakobs domar är hans.** Granskaren föreslår Godkänn, Variant eller Underkänn; Primär väljer bara han, och ingen
   agent skriver hans dom i `motions/` (AGENTS, "Det som skyddar Jakob"; `film-review.md` punkt 0).
4. **En preliminär dom bara där han uttryckligen har lämnat över domen,** med `node tools/review-put.ts`: den ser aldrig
   ut som hans, väntar inte i hans kö och ersätts av hans beslut; en tagning han själv har dömt rörs aldrig (AGENTS;
   `docs/BESKED.md`, "Domar, beställningar och pengar").
5. **En naturlig avvikelse är en möjlig variant,** inte ett fel: säg som vad (`film-review.md` punkt 0). Mjuka aldrig
   upp domen för att ett fel är lagbart (`film-review.md`, "Mjuka aldrig upp domen").
6. **Originalet ändras aldrig.** En lagning är `node tools/film-fix.ts <film> <fixes.json>` bredvid originalet, och den
   rättade kopian granskas på nytt som en egen film (`film-review.md`, Fellistan; `order-clerk.md` §6).
7. **Domen in i kvittot** med poängen skriven "given 3/5, returen 1/5": `node tools/order-put.ts review <id> <n> --note
   "…"` (bandet, station 12; `film-review.md`, Sist).
8. **Granskarna är inte hans öga.** Det han ska döma läggs fram med en stillbild bredvid filmen, och ett nytt utseende
   som ska gälla överallt visas i spelets storlek och i rörelse och kräver hans ja (`docs/BESKED.md`, "Arbetet och dokumenten"
   och "Läpparna och talet").
9. **Högst två ffmpeg-processer åt gången;** skript i filer i dumpmappen, aldrig `node -e`; utlagda rutor raderas efteråt
   (`film-review.md`, Metod).

## Lägga fram för Jakob

Det han ska se läggs som en provmapp i `assets/proofs/<namn>/` (Granska, Prov) och, när det väntar på hans svar, som ett
kort i Beslut; hur det visas: skill `visa-for-jakob`.
