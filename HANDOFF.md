# Dealer — överlämning

Uppdaterad 2026-11-12 kväll. Läs denna fil först, inte chatthistoriken. Här står bara det som gäller nu: målet, ankarmodellen, vem som äger vad, läget i banken, vad som väntar på Jakob och nästa steg.

Kontrakt står i [docs/SYSTEM.md](docs/SYSTEM.md), rutiner och filmbeställning i [docs/DRIFT.md](docs/DRIFT.md), beslut per tagning i `motions/<id>.json` och uppdraget i `data/clip-jobs.json`. Detaljer om enskilda beställningsomgångar står i `motions/`-posterna och i Git-historiken.

## Målet

Trovärdig utdelning: två kort till P1–P7, två eller tre till dealern, med separata returer från varje kort till redo och vila. Scoutgaming är slutmålet och äger regler, slump och kortvärden.

Gul = stängd baksida (BACK), blå = öppen framsida (FRONT). Samma anatomiska vänsterhand tar kortet, vänder det fysiskt och lägger det på planens plats; givvarianter där höger hand tar över är önskade (Nästa steg). Färgbyte ensamt bevisar inte vändning. Framsidan måste vara en ren, nyckelbar yta eftersom Scout bestämmer kortvärdet.

## Ankarmodellen (Jakobs ord 2026-11-12)

- **Ingångsbild:** det vi börjar från för en ny dealer; Jakob 2026-11-12: "vilken bild som helst". Av den görs två riktigt högupplösta keystone.
- **Keystone:** förlagan i hög upplösning av dealern i en pose: keystone 1 stående, och en likadan där hon sitter, i den skala som passar posen man börjar arbeta i. Den spelas aldrig upp. Ur keystone görs en video, och **ankaret tas ur videon**, "så att inte keystonebilder kommer in i videosekvenser" (Jakob 2026-11-12).
- **Ankare:** rutan i bankens format (1764×1174, grönt, bankens egen sko) som filmer börjar och slutar på. En film beställs från exakt den rutan. Jakob vill att de gröna bilderna heter ankare, inte keystone.
- **Ankare 1** = vila (`IDLE`). **Ankare 2.1** = nyp i skons fönster (`READY`, `grip: PINCH`). **Ankare 2.2** = handen över kortet i skons öppning, släp (`READY-B`, `grip: DRAG`). Varje dealer har två sätt att dela ut: från 2.1 och från 2.2. Äldre text, kod och id säger Keystone 1/2, variant A/B, VILA/REDO och REDO B om samma ankare; `DRAWN` (kortet utdraget plant framför skon) finns bara som experimentnod.
- Läge 2.2 har i banken en egen skobild (öppen mynning), så ankare 1 finns i två utföranden (fönstersko och öppen sko, `IDLE-B`) tills en sko gäller för båda. Alla ankare för en dealer ska ha samma sko per läge, samma gröna och samma ton innan en film beställs mellan dem.
- Ankare vid kortplatserna (3.1–3.7) behövs inte i receptet tur och retur från ankare 2; slutbilden per plats ritas ur kortplanen.
- Varje klipp är en handling mellan två ankare och skrivs `READY>P4.C1`, `P4.C1>IDLE`; en runda är en väg genom kanterna (SYSTEM, "Klippbank och nodnotation").
- Kortets tre mått: **riktning** (vart kortsidan pekar på bordet), **lutning** (hur mycket kortet reser sig från bordet, 0° = plant) och **perspektiv** (hur mycket smalare den bortre kanten är). Jakob bekräftade ordet perspektiv 2026-11-12 ("perspektiv är bättre"). Gamla labbets etiketter byts (patch från `dealer-82`); studion använder orden från början.

## Vem äger vad (2026-11-12 kväll)

- **Huvudagent: sessionen `dealer-d2`** (Jakobs uppdrag 2026-11-12). Den äger commits, taggar och push, gamla labbet (`old-lab/`, `src/lab-ui.ts`, `src/preview-ui.ts`), `tools/preview.ts`, `tools/tab-registry.ts`, `tools/studio-files.ts`, `studio/`, `START/STOPP/STATUS.cmd`, 3D-scenens och spelets filer (`src/scene3d-*.ts`, `game/` med spelsidan i `game/page/`, `src/game*.ts`), `src/clip-graph.ts` och styrdokumenten.
- `dealer-82` (Paow; `D:/dealer-scratch/tmp/paow/`) och sessionen bakom Pamela-filmen (`dealer-db`; `D:/dealer-scratch/tmp/reel/`) har inget ocommittat i repot och skriver inte i huvudagentens filer. Ska något in säger de STABILT med en fillista.
- **VIDEOAGENT:** Jakob startar en ny filmagent. Huvudagenten stämmer av med den i korta meddelanden före ändringar som kan störa, särskilt i banken (`data/clip-jobs.json`, `motions/`, `assets/motions`, `assets/tracking`) och i `src/clip-graph.ts`.
- Bankens och kortspårets verktyg (`tools/clip-job.ts`, `tools/build-anchor.ts`, `tools/track-card.ts`, `src/card-track.ts`, `tools/card-coverage.ts`) ägdes 2026-11-11 av FILMAGENT och FILMAGENT-2, som båda är pausade; huvudagenten håller dem tills VIDEOAGENT är igång och de har kommit överens om gränsen.
- Underlag för en ny filmagent: `D:/dealer-scratch/review/filmagent-startprompt-2.md` och läget vid FILMAGENT-2:s paus, `D:/dealer-scratch/review/handoff-filmer-2026-11-11-paus.md`. Ägaruppgifterna där är ersatta av denna fil.
- Jakobs egna: utkastet `placements/default.json` (se Arbetsyta) och hans domar i `motions/` (`review`), som skrivs från labbets Granska och aldrig skrivs över av ett verktyg.
- `CHECKLISTA.md` i repots rot (utanför Git) är Jakobs och huvudagentens gemensamma lista; huvudagenten skriver om den efter varje steg.

## Läget i banken (räknat 2026-11-12)

Räknat med `buildGraph` ur `src/clip-graph.ts` på samma data som labbets `/api/clip-bank` (`data/clip-jobs.json`, `motions/`, kvitton och filmer under `assets/motions/`), i läget en film per plats med stängt hålkort. Skriptet ligger i `D:/dealer-scratch/tmp/huvudagent/dokument/rakna.ts`; räkna om med det i stället för att skriva in siffror för hand.

- **33 huvudfilmer.** Äldre text säger 30; vändningen av hålkortet (`IDLE>REVEAL(D.C2)`), ingången `AWAY>IDLE` och utgången `IDLE>AWAY` har tillkommit som kanter.
- **Huvudtagningen**, alltså det som spelas i en runda: **20 godkända av Jakob rakt av, 11 bara som variant, 0 väntar, 2 saknas.**
- Räknat på bästa tagning per kant i stället: 23 har en rakt godkänd tagning, 8 bara variant, 2 saknas. Skillnaden är P5:s två returer och P6:s retur till redo: rakt godkända returer finns, men de passar inte arkivgiven som är huvudtagning, så en variant som skarvar mot given spelas (skarvregeln i SYSTEM).

| Del | Huvudtagning 2026-11-12 |
| --- | --- |
| Ingång `IDLE>READY`, vila, vändningen av hålkortet, `AWAY>IDLE`, `IDLE>AWAY` | Godkända rakt av |
| `READY>IDLE` | Saknas. `pamela-ready-idle-exit-02` är underkänd, men Jakob kallade den möjlig variant spelad baklänges. Kanten behövs inte i en vanlig runda |
| P1, P4 | Hela kedjan godkänd rakt av |
| P2, P7 | Given variant, båda returerna godkända |
| P3 | Given variant (arkiv), båda returerna godkända |
| P5 | Given godkänd (arkiv), båda returerna variant |
| P6 | Alla tre variant |
| Dealern D.C1 | Alla tre variant (arkiv) |
| Dealern D.C2 | Given saknas: `pamela-d-c2-arkiv-deal-01` är underkänd ("jag vill verkligen att vi ska behålla den"), så spelet lägger hålkortet utan hand. Båda returerna godkända |

- **Primär:** 0 tagningar har `review.acceptedAs: "MAIN"`. Sedan `5def891` spelas en Primär tagning alltid på sin kant (SYSTEM, granskningsbeslut), så Jakobs val av primära ändrar rundan direkt.
- **Väntar på Jakob:** 14 vilotagningar på `IDLE>IDLE` (lookup, wink, stern-02, scratch-01 och -02, smile-01 och -02, cough-01 och -02, disappointed, nod, shrug, headdown, stretch) och 4 experimenttagningar kring ankare 2.2 (`pamela-ready-b-shoe-plate-01`, `pamela-readyb-draw-from-trial-01`, `pamela-idleb-readyb-entry-01`, `pamela-readyb-idleb-exit-01`).
- **Totalt** 109 tagningar (68 beställda jobb, 40 utsnitt, 1 rättad kopia): 39 godkända rakt av, 20 varianter, 29 underkända, 3 sekundära och 18 väntande. 13 experimentkanter ligger utanför de 54 (variant B, handbyte, `DRAWN` med flera).
- **Krediter:** jobbfilens tak (`budget.maximumCredits` 5 162) är helt intecknat och gäller bara API-vägen. Sedan 2026-11-11 beställs film via Runways MCP-server på appkontot (DRIFT, "Filmbeställning"); senast rapporterade saldo där är 18 173 (`dealer-82`, 2026-11-12; inte kontrollerat sedan dess, MCP-verktyget ger inget tal för kontot, saldot syns i Runways app).
- **Kortspår** finns för 86 klipp. Kända spårfel: P1 ruta 30–48, P7 `deal-01` ruta 18–54 och dealerns D.C1 ruta 102–126 (SYSTEM, "Renderade kort").

## Andra dealern (Paow)

Arbetet (session `dealer-82`) ligger utanför Git i `D:/dealer-scratch/tmp/paow/`: arbetsgång och mått i `LASMIG.md`, skript i `skript/`, liggare i `bestallningar-*.json`. Inget är infört i banken, och banken skiljer ännu inte dealer per namn i jobben (förslag: id-prefix och fältet `dealer` i jobben; alla poster i `motions/` har redan `dealer`). Metodfynden står i DRIFT, "Filmbeställning".

- Jakob 2026-11-12: kavaj, aningen smalare, 3–5 år yngre och nättare; "jag vill ha de yngre och nättare bilderna", så ankarna i kavaj (gjorda före dem) görs om. "Kör på, men kontrollerat, med det som faktiskt fungerar", två tagningar per klipp.
- Ankare i kavaj (`ankare/paow-vila-kavaj.png`, `-sko2`, `paow-redo-a-kavaj.png`, `paow-redo-b-kavaj.png`) är gjorda ur linnebilderna med Nano Banana Pro och granskade fem gånger: användbara. Ingångsbilderna i 4K på vitt (Prov `paow-kavaj`) gjordes efter ankarna, så ankarna har det tidigare utseendet tills Jakob har valt.
- Filmer, rutgranskade (Prov `paow-kavaj-filmer`): ankare 1 till 2.1 och 2.2 med WAN 3 ger en användbar tagning av två, men slutar cirka 10 nivåer ljusare i hår och ansikte än slutbilden. Släp från 2.2 med WAN 3 håller till spelare 1, är osäkert till 4 och faller till 7. Nyp från 2.1 med Kling 4 går rätt när referensfilmen går till samma plats som kortet.
- Mätt mot händernas knogbredd var planens kort 0,79 av ett riktigt kort före förstoringen ×1,20 och är 0,94 efter. De två skobildernas kort stämmer inte med varandra (Prov `grundstandard-utkast`).
- **Parkerat 2026-11-12 kväll** (sessionen `dealer-82` avslutad på Jakobs begäran): läget, recepten och nästa steg står överst i `D:/dealer-scratch/tmp/paow/LASMIG.md` ("Läget vid parkering"). Två kandidater till nytt ankare 1 för det yngre utseendet, gjorda efter grundstandarden, ligger i Prov `paow-ankare-ung` (mätta av den som gjorde dem, inte oberoende granskade); inga filmer är beställda från dem. Nya skript: `skript/kantkoll.py` (mäter regeln ovanför rad 831,5) och `skript/ta-bort-skugga.py`. Videoprovet: en film som startar på en annan films ruta skiftar cirka 5 nivåer per länk, så ankare bör vara fasta bilder (dess slutsats; säger emot Jakobs tanke om ankare ur video, inte avgjort med honom). Saldo vid parkeringen: 17 884 krediter.
- Äldre prov: `paow-grundbild`, `paow-samma-film`, `hel-runda-i-en-tagning`, `paow-nyckelrutor-och-prov`, `paow-plats-4-som-mall`, `paow-profilbild-och-keystone`, `paow-linne-forsta-filmer`, `paow-linne-omgang-2`, `plan-till-film-p3c2`.

## Referenser: V6, plats 4 och Pamela-filmen

- **V6** (mätt 2026-11-12, Prov `v6-referens`): Jakob kallar den fortfarande den bästa filmen av en hel giv, "A2.1 - P4C1 - A2.1 - P4C2 - A2.1". Felen är att handen inte vänds vid vändningen (vändningen är ett pålagt bildbyte på en ruta) och att kortet byter hand (vänster tar, båda håller vid bröstet, höger lägger).
- V6:s kortstorlek som spelaren ser den kallar Jakob "väldigt bra". Mätt: V6:s kort ligger på tvären, 161 px brett mot planens 87 px, och har 1,6 gånger planens yta. Kort 2 är samma film flyttad 46 px, och ingen av V6:s fyra källfilmer finns i banken.
- **Plats 4 i 3D-scenen** (`pamela-idle-ready-entry-01`, `pamela-p4-c1-plan-deal-02`, `pamela-p4-c1-plan-return-idle-01`): Jakob 2026-11-12, "väldigt bra".
- **Pamela-filmen** (session `dealer-db`, Prov `pamela-film`, 120 s med ljud): regisserad i 3D-scenen med bara rakt godkända tagningar och utan renderade kort, inte oberoende rutgranskad. Verktyget ligger i `D:/dealer-scratch/tmp/reel/` (egen sida på 4320 som lånar labbserverns moduler). Om det renderade överlägget i första versionen sade Jakob: "ska nog bort".
- Jakobs betyg på äldre material: P4.C1 rått original 4,5/5, V6 4/5 (byter hand), vita banken 3/5, gul/blå sekvens 2,5/5, READY2-proven "konstiga".

## Öppet hos Jakob

1. Primära: han väljer en primär tagning per kant (0 satta) i studions vy Primära när den är klar; underlaget finns i labbets Granska och i Prov `pamela-film`.
2. Vilan: 14 vilotagningar väntar på hans dom i labbets Granska (`lab.html?tab=granska`).
3. Hålkortets giv: variant av den underkända `pamela-d-c2-arkiv-deal-01` eller en ny, rakare tagning (Granska).
4. `READY>IDLE`: om den underkända `pamela-ready-idle-exit-02` ska prövas baklänges som variant (Granska).
5. Kortet: ska planens kort ligga på tvären och ha V6:s yta (1,6 gånger, k ≈ 1,67, samma klass som förslaget K = 1,65), Prov `v6-referens` och `kortplan-forslag`; säger han ja kan godkända givar behöva göras om (FILMAGENT-2:s bedömning 2026-11-11).
6. Skokortet: ska kortet i skon luta några grader mer mot dealern, vilket kräver en ny skobild och inte en labbinställning (ingen Prov-mapp).
7. Paow: en grundstandard för scenen (bordskantens höjd, en enda sko) innan en hel uppsättning görs (Prov `grundstandard-utkast`).
8. Paow: vilket utseende och vilken sittande keystone (A eller B; de yngre ingångsbilderna eller ankarnas tidigare utseende), Prov `paow-kavaj`.
9. Paow: om bankens variantgodkända giv till plats 7 får vara referensfilm (Prov `paow-kavaj-filmer`).
10. Om lagningsfunktionen (`paow/skript/lagafilm.py`, måla över fel i film; håller för stilla ytor) ska byggas in i studion (Prov `paow-kavaj-filmer`).
11. Tre konkurrerande vägar, där huvudagenten kommer med förslag: filmbeställning (MCP-vägen eller `tools/clip-job.ts`), renderat kort (platt överlägg eller 3D-kort) och uppspelning (V6:s tidslinje eller klippbankens rundor); underlag i `CHECKLISTA.md`.
12. Meshy-bordet `table-plain` och vad hans större bordsmodell (`assets/props/source/table-meshy.glb`) är till för (Prov `meshy-bord-slatt` och `meshy-bord-naturligt`).
13. Obedömda prov: spelets konsol (`spel-konsol`), sex nya rum (`fler-rum`; ett rum når spelet först med `"game": true`), skimret vid miljöbyte (`skimmer-vid-miljobyte`), 3D-skon (`sko-i-3d`), bordets yta och underrede (`bordets-yta-och-ljus`, `bordets-underrede`), ljud och musik som ingen har lyssnat på (`ljud-labb`), helkroppsfilmen i scenen (`helkropp-i-scenen`) och reklamfilmen (`trailer-noir-3`).
14. (Avgjort 2026-11-12: `placements/default.json` är incheckad på hans ja.)
15. Flikregeln: om han ser mer än en labbflik i sin Chrome; det som inte är sett där är att en äldre flik stänger sig och vad som händer med flikar som Chrome återställer efter en omstart.
16. Publika sajten visar 22 filmer från `b65fd9b`; att föra dit dagens läge kräver hans uppdrag (mediauppladdning och ombyggnad).
17. Skuggan under armarna: den snabba rättningen i 3D-scenen nu, och om grunden (ankare 1, 2.1, 2.2) ska göras om (Prov `original-ankare-keystone`, bild 8).
18. Primär på plats 5 och 6 (ur regelns prov 2026-11-12): på plats 5 drar en primär retur in variantgiven som den fortsätter, framför den rakt godkända arkivgiven; på plats 6 ger en primär retur en synlig skarv tills en giv finns som slutar på returens ankare.
19. Skon: en enda sko för läge 2.1 och 2.2, vilken av de två, och om dess kort ska göras i rätt storlek (mätt mot knogbredden är kortet i fönsterskon 0,9 × 1,29 av ett riktigt kort och i läge 2-skon 1,04 × 1,13; Prov `grundstandard-utkast`).
20. Reklamfilmen version 3 (Prov `trailer-noir-3`): med eller utan barnet i spelhallen.

## Nästa steg

1. **Studion** (`http://127.0.0.1:4319/studio/`): vyerna Karta, Primära, Jämför, Granska, Prov och Material är byggda. Jakob 2026-11-12: startsidan och Scen ska vara **en** vy, scenen där man spelar en runda och ändrar allt (`/studio/` och `/studio/scen/` samma sak), och **Casino** en andra vy med spelmotorn och reglagen för marker (byggs). Gamla labbet ligger i `old-lab/` tills studion har ersatt det.
0. **Pamela är pausad (Jakob 2026-11-12 kväll): "Vi pausar Pamela när vi är klara. Sedan går vi vidare med Paow."** Det som är öppet om Pamela står kvar här och i `motions/`; inget nytt beställs för henne. Nästa: Paows ankare 1 (välj en av kandidaterna i Material), 2.1 och 2.2 som stillbilder ur ankare 1 efter grundstandarden, sedan filmer, beställda från studions vy Beställ (byggs; plan: `D:/dealer-scratch/tmp/huvudagent/bestall-plan.md`). Jakob vill granska exakt vad som skickas (bilder, text, modell, referens, kostnad) före varje beställning.
2. **Primära:** regeln är byggd (`5def891`); vyn Primära i studion, där Jakob godkänner ett förslag per plats med ett klick, återstår.
3. **En väg per konkurrerande par** (punkt 11 ovan): förslag till Jakob, och därefter städning av den väg som faller, i text och verktyg.
4. **Grunden för film** (utrett 2026-11-12, Prov `original-ankare-keystone`, rapport `D:/dealer-scratch/tmp/huvudagent/original/RAPPORT.md`): `assets/originals` har fyra filmer och inga ankare, och inget jobb har använt dem; ankarna ligger i `assets/anchors` (52 bilder: 13 ankare 1, 10 ankare 2.1, 1 ankare 2.2, 22 landningar), och Pamela har ingen keystone i hög upplösning. Räknat i 101 kvitton och 44 MCP-ordrar används 51 av 52 ankare, och referensfilm bara i 14 av 69 MCP-filmer.
   - Skuggan under armarna sitter i grundbilden: armbågarna vilar på ett bord som fortsätter bakom kanten, och skuggan når 40–44 px ovanför rad 831,5, där 3D-scenen ritar den på det lodräta planet. Snabb rättning: ingen skugga ovanför bordskanten i `src/scene3d-film.ts`, som ett val i labbet. Riktig rättning: nya ankare 1, 2.1 och 2.2 och nya filmer.
   - **Grundstandard som huvudagenten och `dealer-82` är eniga om (2026-11-12, inte införd):** hon sitter på en osynlig stol bakom bordet, underarmarna fria i luften fram till händerna, händerna på bordet framför kanten, inget bord bakom kanten; bordskantens rad 831,5 och händernas platser behålls. Jakob: "kanske är gammalt material fel som ingångsvärde … en liten skavank just vid maghöjden". Standarden ska stå i `data/dealer-standard.json` med ett stycke i SYSTEM när mätningen i Prov `grundbild-och-bord` och Jakobs svar om skon finns. Inga nya ankare före det.
   - Duken Jakob vill ha som bordets yta är `assets/scene/table.png` (filmens perspektiv, relingen inbakad, inget tryck); 3D-filten ritar allt tryck med kod, så markeringarna kan bli valbara lager över dukens väv.
   - Mappen med 3D-utkast och en egen "pamela" är troligast gamla labbet, flyttat till `D:/dealer-archive/snyggare-dealer` (skattat att det är den Jakob menar); sju `pamela-*.ts` finns på båda ställena och två skiljer sig.
5. **Filmer när Jakob vill** (VIDEOAGENT), i fallande nytta: hålkortets giv `READY>D.C2`; rakt godkända ersättare där huvudtagningen är variant (givarna P2, P3, P6, P7, returerna P5 och P6, dealerns D.C1); omtagning av överlämningen med båda händerna (Jakob vill att höger arm används mer); kaffe med en mugg som finns i bilden från början (gärna med Scout Gaming-loggan, påläggs efteråt); `READY>IDLE`; variant B för P3, P6 och P7.
6. Fler kort än två på en plats, split och dealerns fjärde kort har varken film eller plats i planen. Förslaget är flyttade renderade kort på platsens film, oprövat i rörelse.
7. Kvar ur Jakobs lista för labbet (2026-11-11): en animation på bordet (ljuslinjen i relingen föll), marker som dealern tar och betalar (kräver film med en marker i handen) och film för insamling av korten.

## Jakobs besked som gäller

- **Labbet först** (2026-11-11, två gånger): prov och effekter hör hemma i labbets sidor. Spelet (`game.html`) är ett mellansteg mot Scout och får bara det han har godkänt i labbet.
- **Naturligt utseende:** ljus ska komma ur rummet (rumsstudiens teknik: panoramat som ljuskälla, skuggor i världens koordinater), inte målade sken. Relingens ljuslinje är därför borttagen.
- **Kortet ur skon (2026-11-12):** "Ett kort ska tas som det ser ut i skon (inte den konstiga bild som har ett kort som är kort och tjockt). Sedan ska handen vrida kortet." Läst av huvudagenten: förlagan är fönsterskons kort i ankarna, inte skoplåtsfilmens (`pamela-ready-b-shoe-plate-01`, underkänd), och vilken kant kortet vänds kring ska bedömas utifrån hur kortet sitter i skon och i handen, inte i bilden.
- **Kortets vändning (2026-11-12):** ingen bestämd kant. "Jag vill ha variation, för man kan ju vända kortet annorlunda, men bara det följer naturlagar och anatomi från en mänsklig hand." Granskningens fråga är alltså om handen vänder kortet som en människa kan, inte kring vilken kant. Mätt samma dag (Prov `kortvandning-i-dag`, `tools/flip-axis.ts`): alla tio givar som spelas nyper kortet i skons övre kortsida och rullar det kring långsidan; ingen viker det över kortsidan.
- **Ordet sko:** den svarta behållaren för korten. Banken har två bilder av samma sko: en där kortet syns i en öppning snett framtill (ankare 2.1, nypet) och en med öppen front där kortet ser kort och tjockt ut (gjord för ankare 2.2, släpet), som Jakob kallar konstig. För Paow används den första i alla lägen om han inte säger annat.
- **Ett kortformat:** kortet på plats 4 är standard och allt annat anpassar sig ("Storleken är inte problemet, utan att det finns olika format"). Kontraktet står i SYSTEM.
- **En film per plats** (2026-11-11): platsens andra kort spelar första kortets filmer med det renderade kortet flyttat. En film lägger ett kort.
- **Underlag till nya filmer:** bara tagningar han har godkänt rakt av, inte varianter. Allt görs i bankens format; Astrids och Kevins stående material används inte som referens.
- **Två tagningar per klipp**, en tredje bara om båda faller. Oberoende rutgranskning i full upplösning före hans dom.
- **Betald generering:** "fria händer" (2026-11-11) och "kör på, men kontrollerat, med det som faktiskt fungerar" (2026-11-12): en sak i taget, mätt och rutgranskad före nästa, kostnaden berättad efteråt. Det gäller filmagenten; huvudagenten beställer inga filmer själv.
- **Vercel:** den låsta kopian och botens anrop via AI Gateway ligger i teamet **jakeminator**, där krediterna finns (Jakob 2026-11-12). Inget publiceras utan hans "kör".
- **Primär tagning** väljer han själv; agenter sätter inga åt honom.
- **Görans material** (blackjack-studion) används inte; Pamela är dealern (SYSTEM, "Återbruk och införande").
- **3D-labbet:** "fantastiskt" (oskärpan har djup, vyn lutar lite åt sidan, bordet har markeringar). Bordsbenen får vara så länge de inte kostar minne; markerbrädet finns kvar som reserv, avstängt från start. Bordet sett från backad kamera kallade han "fruktansvärt fult" (därför underredet Två ben, obedömt).
- **Svar** till honom: korta, punktform, procent och poäng (AGENTS).

## Kända brister

- Det platta överlägget (2D) läcker cirka 30 bildpunkter i fyra rutor i `pamela-p4-c1-plan-deal-01` och `pamela-p1-c1-plan-deal-03`. Täckningen är inte mätt för klipp som kommit efter 2026-11-11 (`node tools/card-coverage.ts --all`).
- Dealerns första kort är 1,76 gånger för stort i filmen. Labbvalet "Standard hela vägen" lämnar där en blek rest i luften (Prov `kort-en-storlek`), så klippet behöver en ny film eller en ifyllnad som inte är byggd.
- Spelet: 3D-skon klipper handen i givarna; helkroppsfilmerna har ingen sko, så filmens sko försvinner vid utgången; utfallsskyltarna ligger över insatsbrickorna när alla sju platser spelar; en rosa fläck syns i kortlagrets fyllning under fingrarna på arkivfilmerna. Övriga gränser står i SYSTEM, "Spelet".
- Spelet är prövat i headless Chrome och stillbilder (en hel runda på alla sju platser med split, utan fel); rörelsen är inte bedömd för ögat, och dubbling och försäkring är inte sedda.
- Panelen Vila är inte långkörd, och beställning från labbet är inte byggd.

## Arbetsyta

- Branch `claude/deal-clips`. `jakob/test` på GitHub står kvar på `a5821f1`. Etapper `jakob-3` till `jakob-7` och hur de sätts: DRIFT, "Git och kontroller".
- Labbet: `http://127.0.0.1:4319/lab.html` med flikarna Placering, Klippbank, Granska och Prov, och länkarna 3D-scen, Spel, Modeller och Ljud. En labbflik: visa en sida med `node tools/preview.ts --open "<sida>"` (DRIFT, "Labbservern och fliken"). Lösa granskningssidor under `D:/dealer-scratch` används inte mot Jakob.
- `placements/default.json` är Jakobs plan. Den checkades in på hans ja 2026-11-12 (`7a158d6`); labbets Spara placeringar skriver den, och en agent ändrar den aldrig på eget bevåg och checkar in den bara på hans ord. 2026-11-11 kväll lade `dealer-82` om det på hans ord genom labbets eget lager: alla kort ×1,20 (P4 86,6×71,8 px), perspektiv 87 %, vridning 0°, platserna speglade kring bildens mitt, P3.C2 tillbaka i sin rad, dealerns två kort centrerade, böjning 0,14 och glans 0,35, `grip`/`turnAt` med standardvärden.
- Skriptet bakom det är `D:/dealer-scratch/tmp/paow/labb/lagg-symmetriskt.ts`; kopior från före ändringarna: `D:/dealer-scratch/tmp/paow/placements-default-fore-labbandring.json` och `…-fore-symmetri.json`. `data/clip-jobs.json` pekar kvar på den äldre planen `406acb69…`.
- Publika sajten visar 22 filmer från `b65fd9b` (`evidence/public-release.json`).
- Scoutgamings huvudagent har fått besked: inget härifrån är infört där, och insatsrutor bör vara data per bord och filmbank.

## Före avslut av en session

1. Vänta in eller stoppa egna underagenter. Inget ocommittat får ligga kvar utom `placements/default.json`.
2. `npm test`, uttrycklig staging av egna filer, commit, `npm run check`, push, och läs GitHub-kontrollens resultat.
3. Sätt etapptagg `jakob-N` om Jakob har sett läget, och pusha taggen (DRIFT).
4. Uppdatera denna fil på plats: räkna om banken med skriptet ovan, och för in vad som är beställt och ogranskat och vad som väntar på Jakob. Skriv ingen dagbok; ersatt läge stryks.
5. Städa `D:/dealer-scratch` med `npm run stada`: läs rapporten och kör `npm run stada -- --kor`. Kontaktark flyttas med `-- --kor --regel kontaktark` först när de inte stöder ett öppet beslut; allt som Jakob inte har dömt ligger kvar (DRIFT, "D: och städning").
6. Labbservern får stå kvar. Stoppa den bara med `STOPP.cmd` eller `node tools/preview.ts --stop`; den står kvar tills den stoppas, så att länkar till labbet alltid svarar (ändrat 2026-11-12: förut slutade den en minut efter sista fliken, och då ledde varje länk till "anslutningen nekades").

## Verifiering

Node 24.21.0. `npm test` gick igenom 2026-11-12 kväll på `da805da`: 343 tester i 32 testfiler, 0 fel. GitHub-kontrollen är grön på de senaste pusharna, senast `da805da` (`gh run list` 2026-11-12). Film granskas ruta för ruta av en oberoende granskare innan Jakob dömer (mallar i DRIFT). Spelet och 3D-scenen prövas i headless Chrome mot 4319 med verktygen i DRIFT, en körning i taget; den som startar fönstret stänger det.
