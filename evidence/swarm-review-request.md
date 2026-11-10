# Granskningsuppdrag: hitta verkliga fel i Dealer Studios produktionskedja

Du är oberoende huvudgranskare av `Jakeminator123/dealer`. Arbeta faktabaserat och använd högst tre avgränsade underagenter samtidigt. Ge varje underagent endast dess uppdrag, relevanta filer och mål — inte hela chatthistoriken. Sammanför och avdubbla resultaten själv.

## Vad vi bygger

Dealer Studio ska producera sammanhängande utdelningar med Pamela: två kort till vardera P1–P7 och två eller tre till dealern, sammanbundna med IDLE/SHOE_READY och bibehållet bordstillstånd. Scoutgaming äger spelregler, slump, kortvärden och reveal-beslut. Dealer är ännu en fristående produktionsarbetsyta.

Användaren vill ställa in placering, storlek, perspektiv, hand, start-/slutsida och material i labbet. Dessa data ska samlas i ett versionerat JSON-uppdrag och sammanställas till faktisk Runway-prompt, bildankare och API-parametrar. Detta generella beställningsflöde är **inte färdigt**. Nuvarande nodanimation skickas inte automatiskt till Runway. Enskilda lokala verktyg beställer och registrerar specifika prov.

Det konkreta rörelsekravet är: samma anatomiska vänsterhand tar ett stängt kort vid skon, nyper/lyfter och tippar det, vrider kortet genom verklig kantpassage, lägger motsidan uppåt på vald plats och släpper. Senaste varianten kräver handflatan uppåt med fingrar som dras ut under kortet. En tom hand som öppnas först efter släpp uppfyller inte det senare kravet. Ergonomiskt olika lösningar är tillåtna; ingen handöverföring eller målad färgväxling får felaktigt kallas kortvändning.

Grön bakgrund och gul BACK/blå FRONT är arbetsmaterial. Rosa är separat maskhjälp. Slutligt rum, bord och valbara kortmaterial tillkommer efter rörelsegranskning. Färger identifierar ytor; de orsakar eller bevisar inte en fysisk vändning. Kortstorlek måste bedömas mot hand, kortets plana perspektiv och skon, inte enbart mot färgytans omslutande rektangel.

## Läs först, därefter bara relevanta spår

- `README.md`, `HANDOFF.md`, relevanta delar av `docs/SYSTEM.md` och `docs/DRIFT.md`.
- `data/p4-generation-review.json` och `generation.html`: faktiskt skickade bilder, promptar, modeller, task-ID:n och hashvärden. Förväxla inte interna planfält med parametrar som skickats till Runway.
- `evidence/wan-motion-constraints.json`, `evidence/runway-production-contract.json`.
- `evidence/p4-palm-production.json`, `evidence/p4-palm-visual-review.json`, `evidence/p4-placement-production.json`, `evidence/p4-placement-review.json`.

Lokal checkout: `C:/Users/jakem/dev/super-feature-sg/dealer`. Lokal preview: `http://127.0.0.1:4319/lab.html`. Publik granskning: <https://dealer-delta-eosin.vercel.app/> och <https://dealer-delta-eosin.vercel.app/generation.html>. Kontrollera `evidence/public-release.json` för faktisk publicerad revision. GitHub saknar mediefiler och hemligheter med avsikt; använd publicerade filmer eller de lokala tillgångarna. Blanda inte lokal sparad plan, osparat webbläsarutkast och publik startplan.

## Viktiga produktioner som inte får blandas ihop

1. **V6**, cirka31s, 1762×1174: valt visuellt mål med material, skuggor och fingermasker. Innehåller handbyte. Inte en verifierad mall för samma-LH-rörelse över hela bordet.
2. **Äldre3:02,87-bank**, 5486rutor: montage av14 individuella12s-rörelser plus vila/bryggor. 14 spelarkort, inga dealerkort. Sammanhängande montage bevisar inte att varje kort vänds. Vita källor med sidmetadata UNKNOWN får samtidigt inte förklaras felaktiga enbart för att dokumentationen saknas. Arkivet är `D:/dealer-archive/snyggare-dealer`, endast läsbar referens; registrera riktade arkivläsningar.
3. **Separata nyare P4-original**: `pamela-p4-c1-source-turn` (SHA4153a547…) och `pamela-p4-c2-source-turn`. Det förstnämnda visar en användbar kantpassage och samma LH. Det är inte V6 eller den äldre vita C1-källan.
4. **WAN3/Kling-kontroller**: samma historiska två PNG och samma text,4s. Båda missade verifierad kantpassage i de nya resultaten. Det pekar mot gemensamma indata men bevisar inte att prompten ensam är grundorsaken. En tidigare tagning med samma bilder/text gav annan rörelse.
5. **Lokalt P4-placeringsprov02**: ingen ny AI-generering. Gemensam2D-förflyttning av hand/kort efter bevarad vändningsfas, fryst plan406acb69…. Centrumfel0,624px i mätt slutruta är inte anatomisk eller full konturacceptans. Tidigare beskärningskvitto1/1 var fel: faktisk yuv420p-beskärning0/2 är rättad i evidensen; originalkvitto/MP4 bevarade.
6. **Senaste nya WAN3-jobbet** `pamela-p4-c1-palm-up-01`, task `ee8c4cbb-bf95-4f2e-8b1d-d928550e7dcd`,6s/180rutor. Korrigerad handflata i slutbild och mål från fryst plan; inga video-/mellanreferenser skickades. Smal kantf94–112 och blå yta113–116. Samma LH men kontakt ovanifrån132–155, fri156, öppen handflata omkring166. Bevarat som SECONDARY; beställd underhandsnedläggning inte uppfylld. Slutcentrum1,248px från skickat ankare; sidbyte/grepp och landning är separata bedömningar.

## Fördela granskningen

**Agent A — faktisk Runway-request och promptkonflikter.** Följ vägen från vald plan till slutlig HTTP-body i `tools/generate-p4-control.ts`, `generate-p4-palm.ts`, `prepare-p4-palm-anchor.ts`, `generate-p7-direct.ts`, `collect-pilot.ts`. Kontrollera rätt bildbytes, ordning, modell, duration, ratio, dimensioner, kontoidenditet, status, requestlås och ingen dubbelbeställning. Leta efter konflikt mellan grepp, önskad rotation och slutbildens handställning. Undersök aktuell dokumentation; gissa inte mellanankare eller seed-stöd.

**Agent B — fysisk rörelse och bildbevis.** Granska oförändrade råfilmer först. Identifiera faktiska TAKE/TURN/LAND/RELEASE-rutor, fingertoppskontakt, stel kortkontur, handbyte och handflata kontra handrygg. Se om en bild redan tvingar en olämplig slutpose. Skilj fysisk kantpassage från färgmorph, sudd, maskbortfall och uppspelning som hoppar mellan rutor. Kontrollera också identitets-/kameradrift från AI-redigerade ankare. Ingen acceptans utifrån enbart slutbild eller färg.

**Agent C — koordinater, mask/material och sekvenskoppling.** Granska `src/placement-model.ts`, `src/lab-ui.ts`, `src/p4-placement-retarget.ts`, V6-renderaren och metadata. Kontrollera bottom-up, W−1/H−1,1762/1764/1172, bildutsnitt, bildfrekvens och källrutor. Kontrollera faktiskt kort-/handläge, inte bara overlay. Det är redan bevisat att ett gammalt C2-överlägg målade blå motsida gul och att generisk keying dolde en grönreflekterad tunn kant; hitta följdfel utan att återrapportera detta som ny upptäckt. Granska IDLE/READY med kvarliggande kort, landning som händelse och korrekt forward-retur; inget loopklipp från fullt till tomt bord.

Huvudgranskaren sammanför resultaten och bedömer vilken minsta ändring som bäst testar en orsak. Undersök även om krav eller arbetsmetod är felvalda; utgå inte från att allt kan lösas med mer text eller en dyrare modell.

## Officiella källor och evidensgräns

- API: <https://docs.dev.runwayml.com/api/>
- Maskinläsbart kontrakt: <https://docs.dev.runwayml.com/openapi.json>
- Indata, dimensioner och beskärning: <https://docs.dev.runwayml.com/assets/inputs/>
- Priser: <https://docs.dev.runwayml.com/guides/pricing/>

Kontrollera schema och dokumenterad innebörd tillsammans. Ett löst JSON-schema såsom items:{} bevisar inte stöd för godtycklig mittposition. Den hittills kontrollerade WAN3-dokumentationen stödjer first/last, men inte tidsatt mellanbild ihop med dessa; referensläget är separat. Ett internt JSON med rörelsefaser är ingen garanterad fysisk styrsignal hos Runway. Faktureringssidan i användarens konto är inte API-dokumentationen. Läs eller återge inga nycklar.

## Leverans och arbetsgräns

Read-only granskning först: inga betalda jobb, bildändringar, deploys, databasändringar, raderingar eller ändringar i användarens `placements/default.json`. Bevara alla original och referenshashar. Kör inga gamla arkivskript eller node_modules. Ingen ny databas eller nytt sparsystem i denna granskning.

Rapportera högst10 prioriterade fynd med: **kategori** (bekräftat kodfel / indata- eller promptkonflikt / hypotes / dokumentationslucka / modellbegränsning), **exakt bevis** (fil:rad, SHA/task-ID eller källbildruta), **konsekvens**, **minsta rättning**, **hur den verifieras**. Ange vad som faktiskt observerats och vad som inte kan avgöras. Inga påhittade sannolikhetstal eller generella best-practice-listor. Avsluta med en avdubblerad topp3 och ett enda föreslaget nästa experiment med dess oförändrade variabler, kostnad och acceptanskrav. Om inga blockerande kodfel hittas, säg det uttryckligen; det är inte samma sak som godkänd film.
