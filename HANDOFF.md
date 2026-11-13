# Dealer — överlämning

Uppdaterad 2026-11-13 morgon. Läs denna fil först, inte chatthistoriken. Här står bara det som gäller nu: målet,
ankarmodellen, vem som äger vad, läget i banken, vad som väntar på Jakob och nästa steg.

Kontrakt står i [docs/SYSTEM.md](docs/SYSTEM.md), rutiner i [docs/DRIFT.md](docs/DRIFT.md), den enda vägen för en ny
dealer i [tools/dealer-line.md](tools/dealer-line.md), beslut per tagning i `motions/<id>.json`, metoden per steg i
`data/order-methods.json` och bankens tagningar i `data/clip-jobs.json`. Vad som hände i en enskild beställningsomgång
står i `motions/`-posterna, i kvittona och i Git-historiken.

## Målet

Trovärdig utdelning: två kort till P1–P7, två eller tre till dealern, med separata returer från varje kort till redo och
vila. Jakob 2026-11-13: "nu ska vi skapa en bättre version av blackjackspelet"; arbetet här gäller alltså spelet i
studion först. Scoutgaming är slutmålet på sikt och äger regler, slump och kortvärden.

Gul = stängd baksida (BACK), blå = öppen framsida (FRONT). Samma anatomiska vänsterhand tar kortet, vänder det fysiskt
och lägger det på planens plats; givvarianter där höger hand tar över är önskade (Nästa steg). Färgbyte ensamt bevisar
inte vändning. Framsidan måste vara en ren, nyckelbar yta eftersom Scout bestämmer kortvärdet.

## Ankarmodellen (Jakobs ord 2026-11-12)

- **Ingångsbild:** det vi börjar från för en ny dealer; Jakob 2026-11-12: "vilken bild som helst". Av den görs två
  riktigt högupplösta keystone.
- **Keystone:** förlagan i hög upplösning av dealern i en pose: keystone 1 stående, och en likadan där hon sitter, i den
  skala som passar posen man börjar arbeta i. Den spelas aldrig upp. Ur keystone görs en video, och **ankaret tas ur
  videon**, "så att inte keystonebilder kommer in i videosekvenser" (Jakob 2026-11-12). Öppet 2026-11-13: Paows ankare 1
  och 2.1 är stillbilder ur bildmodellen, inte rutor ur en video (videoprovet i `data/dealer-standard.json`,
  `videoLook`, talade emot), och ankare 2.2 prövas härnäst som ruta ur en film; Jakob har inte avgjort vilken väg som
  gäller.
- **Ankare:** rutan i bankens format (1764×1174, grönt, bankens egen sko) som filmer börjar och slutar på. En film
  beställs från exakt den rutan. Jakob vill att de gröna bilderna heter ankare, inte keystone.
- **Ankare 1** = vila (`IDLE`). **Ankare 2.1** = nyp i skons fönster (`READY`, `grip: PINCH`). **Ankare 2.2** = handen
  över kortet i skons öppning, släp (`READY-B`, `grip: DRAG`). Varje dealer har två sätt att dela ut: från 2.1 och från
  2.2. Äldre text, kod och id säger Keystone 1/2, variant A/B, VILA/REDO och REDO B om samma ankare; `DRAWN` (kortet
  utdraget plant framför skon) finns bara som experimentnod.
- Läge 2.2 har i banken en egen skobild (öppen mynning), så ankare 1 finns i två utföranden (fönstersko och öppen sko,
  `IDLE-B`) tills en sko gäller för båda. Alla ankare för en dealer ska ha samma sko per läge, samma gröna och samma ton
  innan en film beställs mellan dem.
- Ankare vid kortplatserna (3.1–3.7) behövs inte i receptet tur och retur från ankare 2; slutbilden per plats ritas ur
  kortplanen.
- Varje klipp är en handling mellan två ankare och skrivs `READY>P4.C1`, `P4.C1>IDLE`; en runda är en väg genom kanterna
  (SYSTEM, "Klippbank och nodnotation").
- Kortets tre mått: **riktning** (vart kortsidan pekar på bordet), **lutning** (hur mycket kortet reser sig från bordet,
  0° = plant) och **perspektiv** (hur mycket smalare den bortre kanten är). Jakob bekräftade ordet perspektiv 2026-11-12
  ("perspektiv är bättre"). Gamla labbets etiketter byts (patch från `dealer-82`); studion använder orden från början.
  Jakob vill kunna ställa in alla tre och ha ett normalläge ("men också ha en normal"); förslaget från `dealer-82` är
  riktning 0°, lutning 0°, perspektiv 87 %. Lutning finns ännu inte som reglage.

## Vem äger vad (2026-11-13)

- **Huvudagentens adress: `dealer-94`.** Adressen är det andra sessioner skriver till med SendMessage, och den står bara
  på den här raden; rubriken Jakob ser på chatten betyder inget. Byter rollen session, ändras den här raden och inget
  annat. Kontrollera med ListAgents före ett meddelande. Huvudagenten äger commits, taggar och push, studion,
  labbservern, spelet och 3D-scenens filmlager, `src/clip-graph.ts` och styrdokumenten.
- **Banor** (Jakob 2026-11-13: en typ av uppgift per session, synkade genom huvudagenten). Ingen bana skriver i en
  annans filer; allt in i repot går genom huvudagenten med en fillista. Betalda anrop utanför Beställ rapporteras till
  huvudagenten med belopp.
  - **Film (huvudagenten):** den enda vägen från bild till dealer (`tools/dealer-line.md`): Beställ och beställningarnas
    texter och bilder (`src/order-*.ts`, `tools/order-*.ts`), efterarbetet (`tools/film-after.ts`,
    `tools/still-after.ts`, `tools/python/`), banken (`tools/register-order.ts`, `motions/`), Protokoll, handboken och
    registren (`data/order-methods.json`, `data/media-roles.json`, `data/dealers.json`, `data/order-policy.json`).
    Underagenter lägger, hämtar och granskar.
  - **Kort (huvudagenten):** det ritade kortet på filmerna, kortspåret (`src/card-track.ts`, `tools/track-card.ts`) och
    kortproven. Kortmatten ur filmens eget kort väntar som patch
    (`D:/dealer-scratch/tmp/dealer-bf/klon-ut/kortmatt.patch`, läget i `D:/dealer-scratch/tmp/dealer-bf/LASMIG.md`).
  - **Scen (`dealer-f6`):** bordet, rummet och ljuset i 3D-scenen (`src/scene3d-table.ts`, `src/scene3d-room.ts`,
    `src/scene3d-ui.ts`, `src/scene3d-view.ts`, `data/scene-materials.json`, `data/scene-rooms.json`,
    `data/scene-presets/`), och sidovinkeln av Paow som egna Prov.
  - **Tal (`dealer-0b`):** talfilmer med röst och läppsynk (`tools/speech.ts`, `src/speech-plan.ts`,
    `src/speech-lines.ts`, `data/speech.json`), media under `assets/speech/paow/`, levererat som patch.
- Avslutade sessioner: `dealer-bf` (kortet, sidokameran, Petra; 2026-11-13), `dealer-82` (Paow,
  `D:/dealer-scratch/tmp/paow/`), `dealer-db` (Pamela-filmen, `D:/dealer-scratch/tmp/reel/`), FILMAGENT, FILMAGENT-2,
  SPELAGENT och Bakgrund och bord.
- `tools/clip-job.ts` och engångsverktygen från 2026-11-10 är borttagna; `tools/build-anchor.ts` och
  `tools/card-coverage.ts` står kvar, liksom den oanvända `tools/clip-edit.ts`.
- Jakobs egna: planen `placements/default.json` (se Arbetsyta) och hans domar i `motions/` (`review`), som skrivs från
  studions Granska och aldrig skrivs över av ett verktyg; en preliminär dom (`node tools/review-put.ts`) är aldrig hans
  och ger vika för hans.
- `CHECKLISTA.md` i repots rot (utanför Git) är Jakobs och huvudagentens gemensamma lista.

## Läget i banken (räknat 2026-11-12, domarna omräknade 2026-11-13)

Räknat med `buildGraph` ur `src/clip-graph.ts` på samma data som labbets `/api/clip-bank` (`data/clip-jobs.json`,
`motions/`, kvitton och filmer under `assets/motions/`), i läget en film per plats med stängt hålkort. Skriptet ligger i
`D:/dealer-scratch/tmp/huvudagent/dokument/rakna.ts`; räkna om med det i stället för att skriva in siffror för hand.

- **33 huvudfilmer.** Äldre text säger 30; vändningen av hålkortet (`IDLE>REVEAL(D.C2)`), ingången `AWAY>IDLE` och
  utgången `IDLE>AWAY` har tillkommit som kanter.
- **Huvudtagningen**, alltså det som spelas i en runda: **20 godkända av Jakob rakt av, 11 bara som variant, 0 väntar, 2
  saknas.**
- Räknat på bästa tagning per kant i stället: 23 har en rakt godkänd tagning, 8 bara variant, 2 saknas. Skillnaden är
  P5:s två returer och P6:s retur till redo: rakt godkända returer finns, men de passar inte arkivgiven som är
  huvudtagning, så en variant som skarvar mot given spelas (skarvregeln i SYSTEM).

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

- **Primär:** 0 tagningar har `review.acceptedAs: "MAIN"`. Sedan `5def891` spelas en Primär tagning alltid på sin kant
  (SYSTEM, granskningsbeslut), så Jakobs val av primära ändrar rundan direkt.
- **Väntar på Jakob:** inget. Kvällen 2026-11-12 dömde han vilofilmerna och experimenttagningarna kring ankare 2.2 i
  studions Granska (omräknat 2026-11-13).
- **Totalt** 109 tagningar (68 beställda jobb, 40 utsnitt, 1 rättad kopia): 39 godkända rakt av, 33 varianter, 34
  underkända, 3 sekundära och 0 väntande (omräknat 2026-11-13). 13 experimentkanter ligger utanför de 54 (variant B,
  handbyte, `DRAWN` med flera).
- **Krediter:** jobbfilens tak (`budget.maximumCredits` 5 162) är helt intecknat och gäller bara API-vägen. Film
  beställs genom Beställ på appkontot (`tools/dealer-line.md`); saldot efter senaste tagning står i dess kvitto
  (`creditsRemainingAfter`), och andra banors köp på samma konto rapporteras till huvudagenten med belopp.
- **Kortspår** finns för 86 klipp. Kända spårfel: P1 ruta 30–48, P7 `deal-01` ruta 18–54 och dealerns D.C1 ruta 102–126
  (SYSTEM, "Renderade kort").

## Andra dealern (Paow)

Arbetet (session `dealer-82`) ligger utanför Git i `D:/dealer-scratch/tmp/paow/`: arbetsgång och mått i `LASMIG.md`,
skript i `skript/`, liggare i `bestallningar-*.json`. Den sessionens filmer och bilder som bedömts användbara ligger i
`assets/` med roll i Material (importen 2026-11-12). Paows tagningar från Beställ ligger i bankens inkorg med
`dealer: "paow"` (`tools/register-order.ts`), och studion visar en dealer i taget. Metodfynden står i handboken
`tools/film-prompting.md` (§5: det som håller, det som föll).

- Jakob 2026-11-12: kavaj, aningen smalare, 3–5 år yngre och nättare; "jag vill ha de yngre och nättare bilderna", så
  ankarna i kavaj (gjorda före dem) görs om. "Kör på, men kontrollerat, med det som faktiskt fungerar", två tagningar
  per klipp.
- Ankare i kavaj (`assets/anchors/paow-vila-kavaj`, `paow-vila-kavaj-sko2`, `paow-nyp-kavaj`, `paow-slap-kavaj`) är
  gjorda ur linnebilderna med Nano Banana Pro och granskade fem gånger: användbara. Keystone i 4K på vitt (Prov
  `paow-kavaj`) gjordes efter ankarna, så ankarna har det tidigare utseendet tills Jakob har valt.
- Filmer, rutgranskade (Prov `paow-kavaj-filmer`): ankare 1 till 2.1 och 2.2 med WAN 3 ger en användbar tagning av två,
  men slutar cirka 10 nivåer ljusare i hår och ansikte än slutbilden. Släp från 2.2 med WAN 3 håller till spelare 1, är
  osäkert till 4 och faller till 7. Nyp från 2.1 med Kling 4 går rätt när referensfilmen går till samma plats som
  kortet.
- Mätt mot händernas knogbredd var planens kort 0,79 av ett riktigt kort före förstoringen ×1,20 och är 0,94 efter. De
  två skobildernas kort stämmer inte med varandra (Prov `grundstandard-utkast`).
- **Parkerat 2026-11-12 kväll** (sessionen `dealer-82` avslutad på Jakobs begäran): läget, recepten och nästa steg står
  överst i `D:/dealer-scratch/tmp/paow/LASMIG.md` ("Läget vid parkering"). Två kandidater till nytt ankare 1 för det
  yngre utseendet, gjorda efter grundstandarden, ligger i Prov `paow-ankare-ung` (mätta av den som gjorde dem, inte
  oberoende granskade); inga filmer är beställda från dem. Nya skript: `skript/kantkoll.py` (mäter regeln ovanför rad
  831,5) och `skript/ta-bort-skugga.py`. Videoprovet: en film som startar på en annan films ruta skiftar cirka 5 nivåer
  per länk, så ankare bör vara fasta bilder (dess slutsats; säger emot Jakobs tanke om ankare ur video, inte avgjort med
  honom). Saldo vid parkeringen: 17 884 krediter.
- Äldre prov: `paow-grundbild`, `paow-samma-film`, `hel-runda-i-en-tagning`, `paow-nyckelrutor-och-prov`,
  `paow-plats-4-som-mall`, `paow-profilbild-och-keystone`, `paow-linne-forsta-filmer`, `paow-linne-omgang-2`,
  `plan-till-film-p3c2`.

## Referenser: V6, plats 4 och Pamela-filmen

- **V6** (mätt 2026-11-12, Prov `v6-referens`): Jakob kallar den fortfarande den bästa filmen av en hel giv, "A2.1 -
  P4C1 - A2.1 - P4C2 - A2.1". Felen är att handen inte vänds vid vändningen (vändningen är ett pålagt bildbyte på en
  ruta) och att kortet byter hand (vänster tar, båda håller vid bröstet, höger lägger).
- V6:s kortstorlek som spelaren ser den kallar Jakob "väldigt bra". Mätt: V6:s kort ligger på tvären, 161 px brett mot
  planens 87 px, och har 1,6 gånger planens yta. Kort 2 är samma film flyttad 46 px, och ingen av V6:s fyra källfilmer
  finns i banken.
- **Plats 4 i 3D-scenen** (`pamela-idle-ready-entry-01`, `pamela-p4-c1-plan-deal-02`,
  `pamela-p4-c1-plan-return-idle-01`): Jakob 2026-11-12, "väldigt bra".
- **Pamela-filmen** (session `dealer-db`, Prov `pamela-film`, version 2, 90 s med ljud): regisserad i 3D-scenen med bara
  rakt godkända tagningar, utan renderade kort, inte oberoende rutgranskad. Verktyget ligger i
  `D:/dealer-scratch/tmp/reel/` (`LASMIG.md`; egen sida på 4320 som hämtar labbets moduler ur serverns rot, så
  `page/reel.js` måste följa med om de flyttas); dess två nya filmer (repliken och Paows entré) ligger i `assets/films/`
  med roll, inte i banken. Öppet: uttalet av repliken är inte avlyssnat, knäppet ser ut som ett lyft pekfinger och en
  snärt, och plats 3, 6, 7 och dealern saknas eftersom de bara har varianter. Om överlägget i version 1 sade Jakob: "ska
  nog bort".
- Jakobs betyg på äldre material: P4.C1 rått original 4,5/5, V6 4/5 (byter hand), vita banken 3/5, gul/blå sekvens
  2,5/5, READY2-proven "konstiga".

## Öppet hos Jakob

1. Primära: han väljer en primär tagning per steg (0 av 33 satta) i studions vy Primära; underlaget finns i Granska och
   i Prov `pamela-film`.
2. (Avgjort 2026-11-12: Jakob dömde vilofilmerna i studions Granska; inget väntar där.)
3. Hålkortets giv: variant av den underkända `pamela-d-c2-arkiv-deal-01` eller en ny, rakare tagning (Granska).
4. `READY>IDLE`: om den underkända `pamela-ready-idle-exit-02` ska prövas baklänges som variant (Granska).
5. Kortet: ska planens kort ligga på tvären och ha V6:s yta (1,6 gånger, k ≈ 1,67, samma klass som förslaget K = 1,65),
   Prov `v6-referens` och `kortplan-forslag`; säger han ja kan godkända givar behöva göras om (FILMAGENT-2:s bedömning
   2026-11-11).
6. Skokortet: ska kortet i skon luta några grader mer mot dealern, vilket kräver en ny skobild och inte en
   labbinställning (ingen Prov-mapp).
7. Paow: grundstandarden står i `data/dealer-standard.json` (införd 2026-11-12 ur det huvudagenten och `dealer-82` var
   eniga om). Jakob har inte sett den som bild; den prövas i de första beställningarna.
8. Paow: utseendet är avgjort (2026-11-12: "jag vill ha de yngre och nättare bilderna", svart kavaj). **Ankare 1 är
   valt: `paow-vila-ung-2` gäller (Jakob godkände i Material 2026-11-13, "svinbra").** Parkerad tanke samma natt:
   måttbilden i Prov `grundstandard-utkast` med dealern borttagen som generisk mall för nya dealers, "bara om eller när
   vi vet hur allt funkar"; som kedja: profilbild först, sedan klipper en bildmodell in personen i just den yta
   Placerings neutrala figur visar (rätt person på rätt yta), och en stående helkroppsbild för in- och utgång, där
   måtten kan skilja lite från sittande. **Ankare 2.1:** två tagningar ligger som kandidater i Material
   (`paow-nyp-ung-1`, `-2`); Jakob om tagning 1: "ser jättebra ut", blicken kunde ligga på kortet ("men är lugnt"). Han
   vill pröva två ingångsfilmer ankare 1 → 2.1: en med WAN 3 (utkast `paow-ingang-2-1-01`, en tagning) och en i 4K
   (modellen inte vald; Beställ har ännu ingen 4K-modell). Kvar: de tre utkasten i Beställ (ankare 2.1, ankare 2.2 och
   första filmen, ett kort till plats 4 och tillbaka på 7 s; tillsammans högst 490 krediter) utgår från kandidat 2 och
   väntar på hans Godkänn. Inget är skickat.
9. Paow: om bankens variantgodkända giv till plats 7 får vara referensfilm (Prov `paow-kavaj-filmer`).
10. (Avgjort 2026-11-12: lagning, "med ett api som är inbyggt i studion". Den målar bara den ruta och de bildrutor
    granskaren pekar ut, skriver en ny fil bredvid originalet, går på ny granskning och visas före och efter innan Jakob
    godkänner. Håller för stilla ytor, inte där en hand rör sig; förlaga `paow/skript/lagafilm.py`, byggs som
    `tools/film-fix.ts`.)
11. Två konkurrerande vägar, där huvudagenten kommer med förslag: renderat kort (platt överlägg eller 3D-kort) och
    uppspelning (V6:s tidslinje eller klippbankens rundor); filmbeställning är avgjord: Beställ
    (`tools/dealer-line.md`); underlag i `CHECKLISTA.md`. Om det renderade kortet lade sessionen `dealer-bf` ett förslag
    2026-11-13 (läsande utredning, inte beslutat av Jakob; rapport `D:/dealer-scratch/tmp/dealer-bf/kort/RAPPORT.md`;
    öppen fråga till honom: får baksidan vara utan tryck i handen): kortet skakar för att `src/card-track.ts` passar
    varje ruta för sig och tonar bort utjämningen i snabba rutor. Ordning: (1) klistra mindre: med Jakobs sex steg är
    baksidan upp till platsen, så filmens eget kort kan färgas om till enfärgad baksida och det renderade kortet behövs
    bara i de sista rutorna och på filten; (2) byt mätningen för de rutorna (stelt kort med fast mått, löst för hela
    klippet på en gång); (3) reserv: helt 3D-kort på skriven bana som handen mimar; (4) inte en videomodell som skriver
    valören. Återbruk: kortgeometri och 52 framsidor som vektorer i
    `D:/dealer-archive/snyggare-dealer/references/card-materials/new-front2/`. En 3D-modell av dealern som delar ut i
    webbläsaren bedömde den som inte görlig i dag (dess skattning, inte visad). Samma session gjorde Prov `plats-3-prov`
    (given till plats 3 med scenens ritade kort, sedd framifrån och från plats 3:s öga, cirka 8°; samma platta film i
    båda, inte oberoende granskat). Räknat ur planen ligger platsernas ögon på −29, −18, −8, 0, +8, +18 och +29 grader
    (skalan skattad; `D:/dealer-scratch/tmp/dealer-bf/demo/numbers.mjs`), så kameror på plats 2, 4 och 6 ger varje plats
    högst 11° till närmaste kamera; Jakob lutar åt plats 2 och 6 som extra kameror, inget beslutat. En andra kamera
    prövad av `dealer-bf` 2026-11-13 (Prov `kamera-2-plats-2`, 512 krediter i ett avskilt spår, sett i stillbilder, inte
    oberoende granskat): Pamelas godkända giv `pamela-p4-c1-plan-deal-02` sedd från plats 2:s öga (17,7°). Det som höll:
    filmens eget djup ger en råfilm från den nya vinkeln lokalt och gratis (kameran står exakt i modellen, men kroppens
    djup och dealerns lins är skattade; Jakobs externa granskare rättade orden "geometriskt riktig")
    (`D:/dealer-scratch/tmp/dealer-bf/kamera2/relief/`), en bildmodell lagar en nyckelruta, och `edit_video` (Aleph, 28
    krediter per s) lagar hela filmen efter den; att be bildmodellen flytta kameran själv föll fyra gånger. Fel i
    tagningen: det stängda kortet blir grått i ruta 0–50, och filmen kommer i 1920 × 1080 med bilden i mitten. Inte
    prövad i 3D-scenen (kräver en andra filmkamera där). Samma granskare: 20°-gränsen är mätt på stillbilder och håller
    inte som löfte för en giv, och tre kameror löser inte en glidning mellan platserna. Kortet med filmens eget kort som
    matt (Prov kort-matt-ur-filmen, dealer-bf): varje gul eller blå bildpunkt byts mot kortets yta, så kanten är filmens
    och fingrarna ligger framför utan handmask; P4 brus 0,72 px mot dagens spår 3,35, P1 inte bättre (7,41 mot 6,47);
    skriptet D:/dealer-scratch/tmp/dealer-bf/kort/kortprov.py utanför repot, inte prövat i scenen. Samma spår gjorde
    keystone för en avskild dealer med arbetsnamn Petra (Prov `petra-keystone`); på Jakobs ord ("en egen dealer av Petra
    eller något", så att hon inte står som material hos Pamela eller Paow) är hon en egen dealer i
    `data/media-roles.json` med spårets tre prov, men inte i `data/dealers.json`: inget beställs för henne. Jakobs
    externa granskare läste grenen `jakob/test` (a5821f1 från 2026-11-10, långt efter `claude/deal-clips`) och fann där
    kortvinklar som inte gäller längre; i dagens plan är `geometry.native` 0° och perspektiv 0,87 på alla platser, men
    `geometry.portrait` har kvar 21/14/7° och 0,9 (mätt av `dealer-bf`). Om `jakob/test` ska flyttas fram är Jakobs
    beslut. Gamla 3D-sidans `?clip=` vill ha bankens tagningsnamn, inte filmmappens; ett fel namn faller tyst tillbaka
    på plats 4-rundan.
12. Meshy-bordet `table-plain` och vad hans större bordsmodell (`assets/props/source/table-meshy.glb`) är till för (Prov
    `meshy-bord-slatt` och `meshy-bord-naturligt`).
13. Obedömda prov: spelets konsol (`spel-konsol`), sex nya rum (`fler-rum`; ett rum når spelet först med
    `"game": true`), skimret vid miljöbyte (`skimmer-vid-miljobyte`), 3D-skon (`sko-i-3d`), bordets yta och underrede
    (`bordets-yta-och-ljus`, `bordets-underrede`), ljud och musik som ingen har lyssnat på (`ljud-labb`),
    helkroppsfilmen i scenen (`helkropp-i-scenen`) och reklamfilmen (`trailer-noir-3`).
14. (Avgjort 2026-11-12: `placements/default.json` är incheckad på hans ja.)
15. Flikregeln: om han ser mer än en labbflik i sin Chrome; det som inte är sett där är att en äldre flik stänger sig
    och vad som händer med flikar som Chrome återställer efter en omstart.
16. Publika sajten visar 22 filmer från `b65fd9b`; att föra dit dagens läge kräver hans uppdrag (mediauppladdning och
    ombyggnad).
17. Skuggan under armarna: den snabba rättningen i 3D-scenen nu, och om grunden (ankare 1, 2.1, 2.2) ska göras om (Prov
    `original-ankare-keystone`, bild 8).
18. Primär på plats 5 och 6 (ur regelns prov 2026-11-12): på plats 5 drar en primär retur in variantgiven som den
    fortsätter, framför den rakt godkända arkivgiven; på plats 6 ger en primär retur en synlig skarv tills en giv finns
    som slutar på returens ankare.
19. Skon: en enda sko för läge 2.1 och 2.2, vilken av de två, och om dess kort ska göras i rätt storlek (mätt mot
    knogbredden är kortet i fönsterskon 0,9 × 1,29 av ett riktigt kort och i läge 2-skon 1,04 × 1,13; Prov
    `grundstandard-utkast`).
20. Reklamfilmen version 3 (Prov `trailer-noir-3`): med eller utan barnet i spelhallen.
21. Fyra kandidatgivar till plats 2, 3 och 6 (Prov `givar-omgang-15`, mappar i `assets/motions/`, inte i banken): in i
    banken som väntande i inkorgen (huvudagentens förslag) eller till arkivet.
22. Placering i studion: ska korten öppnas som "Kort" (som de spelas) eller "Färg" (gult och blått), och ska varje plats
    visa ett eget kort i stället för A♠.
23. Underkända och ersatta filmer (32 bankklipp, 567 MB; Paows 8 ersatta bilder) ligger kvar i `assets/`, eftersom
    banken visar dem och en underkänd ibland blir variant; förslaget är att vyerna visar dem för sig. Inventeringen:
    `D:/dealer-scratch/tmp/huvudagent/assets-inventering/RAPPORT.md`.
24. Duken: Jakob vill ha V6-bordets lurvigare gröna filt (den han ser i Placering) i stället för filten på 3D-bordet.
    Den finns som valet Duk → V6-duken i vyn Scen (`/studio/?forval=levande&cloth=v6`); han har inte sagt om den ska in
    i förvalen. Han saknar också rummen (panorama, 3D) som bakgrund i Placering; planen ligger i filmrutans mått och är
    densamma i alla rum, så förslaget är en knapp "Visa i scenen".
25. Prov mot Granska: i Prov går det inte att döma (märkena där är granskarens), och han väntade sig det. Paows 18
    filmer i `paow-kavaj-filmer` är första omgången, från utseendet före de yngre bilderna; nya filmer kommer genom
    Beställ till bankens inkorg och döms i Granska.

## Nästa steg

0. **Paow, läget 2026-11-13 klockan 07:50** (`node tools/produce.ts paow`): 18 av 33 filmer klara, 17 av de 21 som en
   runda kräver. Ankare 1 och 2.1 gäller; ankare 2.2 behövs inte för första uppsättningen. Klara för rundan: ingång,
   vila, given och returen till redo på plats 1–5 och 7, dealerns första kort och utgången (en nödlösning, ingången
   spelad baklänges). Kvar för en runda: given till plats 6 (`paow-giv-2-1-p6-05`, `-p6-06` levererade), hålkortet
   stängt (`paow-giv-2-1-d-c2-03`), hålkortets retur till vila (ingen metod) och hålkortets vändning (`paow-halkort-02`,
   `-03`). Omgång 7 och 8, mall 7:s första (`-p3-03`, `-p4-15`, `-p5-05`, `-p1-09`, `-p2-04`, `-p6-05`, `-p6-06`,
   `-p7-06`), är lagda; utfallet och granskningen pågår. Pamela är pausad (Jakob 2026-11-12: "Vi pausar Pamela när vi är
   klara. Sedan går vi vidare med Paow.").
1. **Studion** (`http://127.0.0.1:4319/studio/`) är skalet, med bland annat vyerna Scen, Karta, Primära, Jämför,
   Granska, Prov, Placering, Material, Beställ, Protokoll och Casino; gamla labbet nås med `lab.html?gamla=1` tills
   Modeller (`props.html`) och Ljud (`sound.html`) har flyttats. Den låsta kopian åt Jakobs chef publiceras först på
   hans "kör" och måste byggas om innan dess.
2. **Primära:** regeln (`5def891`) och vyn är byggda. Jakob har valt Primär på Paows givar till plats 1 och 4
   (`paow-giv-2-1-p1-06`, `paow-giv-2-1-p4-04`) och på två returer; Pamelas Primära står öppna.
3. **En väg per konkurrerande par** (punkt 11 ovan): förslag till Jakob, och därefter städning av den väg som faller, i
   text och verktyg.
4. **Grunden för film** (utrett 2026-11-12, Prov `original-ankare-keystone`, rapport
   `D:/dealer-scratch/tmp/huvudagent/original/RAPPORT.md`): `assets/originals` har fyra filmer och inga ankare, och
   inget jobb har använt dem; ankarna ligger i `assets/anchors` (52 bilder: 13 ankare 1, 10 ankare 2.1, 1 ankare 2.2, 22
   landningar), och Pamela har ingen keystone i hög upplösning. Räknat i 101 kvitton och 44 MCP-ordrar används 51 av 52
   ankare, och referensfilm bara i 14 av 69 MCP-filmer.
   - Skuggan under armarna sitter i grundbilden: armbågarna vilar på ett bord som fortsätter bakom kanten, och skuggan
     når 40–44 px ovanför rad 831,5, där 3D-scenen ritar den på det lodräta planet. Snabb rättning: ingen skugga ovanför
     bordskanten i `src/scene3d-film.ts`, som ett val i labbet. Riktig rättning: nya ankare 1, 2.1 och 2.2 och nya
     filmer.
   - **Grundstandarden** står i `data/dealer-standard.json` (2026-11-12): hon sitter på en osynlig stol bakom bordet,
     underarmarna fria fram till händerna, händerna på bordet framför kanten, inget bord bakom kanten; bordskantens
     rad 831,5 och händernas platser behålls. Paows ankare följer den.
   - Duken Jakob vill ha som bordets yta är `assets/scene/table.png` (filmens perspektiv, relingen inbakad, inget
     tryck); 3D-filten ritar allt tryck med kod, så markeringarna kan bli valbara lager över dukens väv.
   - Mappen med 3D-utkast och en egen "pamela" är troligast gamla labbet, flyttat till
     `D:/dealer-archive/snyggare-dealer` (skattat att det är den Jakob menar); sju `pamela-*.ts` finns på båda ställena
     och två skiljer sig.
5. **Filmer när Jakob vill** (FILMAGENT 3; för Pamela först när pausen hävs), i fallande nytta: hålkortets giv
   `READY>D.C2`; rakt godkända ersättare där huvudtagningen är variant (givarna P2, P3, P6, P7, returerna P5 och P6,
   dealerns D.C1); omtagning av överlämningen med båda händerna (Jakob vill att höger arm används mer); kaffe med en
   mugg som finns i bilden från början (gärna med Scout Gaming-loggan, påläggs efteråt); `READY>IDLE`; variant B för P3,
   P6 och P7.
6. Fler kort än två på en plats, split och dealerns fjärde kort har varken film eller plats i planen. Förslaget är
   flyttade renderade kort på platsens film, oprövat i rörelse.
7. Kvar ur Jakobs lista för labbet (2026-11-11): en animation på bordet (ljuslinjen i relingen föll), marker som dealern
   tar och betalar (kräver film med en marker i handen) och film för insamling av korten.

## Jakobs besked som gäller

- **Den enda vägen** (2026-11-13, 07:45, innan han somnade): "Se till att verkligen ha denna 'enda bästa väg' när jag
  vaknar imorgon". Den står i `tools/dealer-line.md`. Tidigare samma natt: "Jag vill systematisera skapandet av dealer
  och kortflöden."
- **Normala regler och mer dokumentation** (2026-11-13): "Gör bara det här så normalt som möjligt i repot, utan
  specialregler. Ha kontinuerlig städning och dokumentera gärna mer, det har varit ett misstag från min sida att inte
  dokumentera tillräckligt." Radgränserna för dokumenten är borttagna, och AGENTS säger var kunskap står.
- **Visningen:** Paow ska kunna spela en hel runda i spelet; de nödlösningar spelet har för det (ersättare där en film
  saknas, utgången baklänges) är huvudagentens och ger vika när banken har egna filmer (`src/game-director.ts`,
  `motions/paow-utgang-baklanges-01.json`). Hans egna ord om visningen står inte i repot.
- **Preliminär dom i natt** (2026-11-13): "Tillsammans med videogranskaren, som är duktig, bedöm de sista filmerna, för
  jag måste sova." och "jag måste sova och du får granska och godkänna alla klipp". Huvudagenten och en oberoende
  granskare dömer nattens filmer preliminärt med `node tools/review-put.ts`; domen är aldrig hans, ligger först i hans
  kö i Granska och ersätts av hans eget beslut.
- **Hon ska röra sig mer när hon delar ut** (2026-11-13): "jag vill i allmänhet att paow rör sin kropp och huvud och SIN
  högerarm aningen mer när HENNES vänsterarm dealar." Mall 7 (`SAY.moveOwn`, `SAY.moveBoth`).
- **Returen efter en tvåhandsgiv** (samma ord): "OM hon har någon deal där hon använder sin vänster och högerarm så
  måste retreat/tillbakagången vara annorlunda då den andra armen är den som är utsträckt." Mall 7 (`SAY.backPass`) och,
  i rundan, en retur som kommer tillbaka med den hand som är ute (skrivs 2026-11-13: `motion.releaseHand`).
- **Budgeten** (2026-11-13 cirka 07:25): "jag ger 6000 mer i budget eller till krediterna tar slut för runway".
  Dagstaket är 14 000 för 2026-11-13 (`data/order-policy.json`); golvet 2 000 och 400 per beställning står.
- **Önskemål samma natt, inte byggda:** att kunna slå av de ritade korten; ett tredje och fjärde dealerkort (platsen
  lägger han i Placering när ordermodellen har den); en film där hon kommer in och en där hon går (görs i natt utanför
  Beställ); senare en andra spelarfigur, "Astrid", som kommer in från sidan och satsar.
- **Labbet först** (2026-11-11, två gånger): prov och effekter hör hemma i labbets sidor. Spelet (`game.html`) är ett
  mellansteg mot Scout och får bara det han har godkänt i labbet.
- **Naturligt utseende:** ljus ska komma ur rummet (rumsstudiens teknik: panoramat som ljuskälla, skuggor i världens
  koordinater), inte målade sken. Relingens ljuslinje är därför borttagen.
- **Kortet ur skon (2026-11-12):** "Ett kort ska tas som det ser ut i skon (inte den konstiga bild som har ett kort som
  är kort och tjockt). Sedan ska handen vrida kortet." Läst av huvudagenten: förlagan är fönsterskons kort i ankarna,
  inte skoplåtsfilmens (`pamela-ready-b-shoe-plate-01`, underkänd), och vilken kant kortet vänds kring ska bedömas
  utifrån hur kortet sitter i skon och i handen, inte i bilden.
- **Kortets vändning (2026-11-12):** ingen bestämd kant. "Jag vill ha variation, för man kan ju vända kortet annorlunda,
  men bara det följer naturlagar och anatomi från en mänsklig hand." Granskningens fråga är alltså om handen vänder
  kortet som en människa kan, inte kring vilken kant. Mätt samma dag (Prov `kortvandning-i-dag`, `tools/flip-axis.ts`):
  alla tio givar som spelas nyper kortet i skons övre kortsida och rullar det kring långsidan; ingen viker det över
  kortsidan.
- **Givens sex steg från ankare 2.1 (2026-11-13, Jakobs skiss; skissen förklarar och är inte underlag i repot):** Nyp
  (tumme och pekfinger på kortets övre kant i skon), Dra (kortet dras ur skon ned på filten, baksidan upp), För fram
  (lågt längs filten till platsen, inte vänt i luften), Vrid (handleden rullar, kortet reser sig på långsidan), Vänd upp
  (tills framsidan är upp), Lägg. Vändningen sker alltså vid platsen, efter förflyttningen. Samma hand hela vägen i
  skissen. Variation är fortfarande tillåten (punkten Kortets vändning); detta är förvalet.
- **Nypet (2026-11-13):** i ankare 2.1 ska tumme och pekfinger hålla i själva det gula kortet, inte i skons kant ("hon
  nyper tag i skons kant mer", om Paows första filmer i Prov `paow-kavaj-filmer`); kortet får gärna vikas lite av nypet.
  Det ska stå i beställningens text, synas i posebilden och vara en punkt i granskningen.
- **Ordet sko:** den svarta behållaren för korten. Banken har två bilder av samma sko: en där kortet syns i en öppning
  snett framtill (ankare 2.1, nypet) och en med öppen front där kortet ser kort och tjockt ut (gjord för ankare 2.2,
  släpet), som Jakob kallar konstig. För Paow används den första i alla lägen om han inte säger annat.
- **Ett kortformat:** kortet på plats 4 är standard och allt annat anpassar sig ("Storleken är inte problemet, utan att
  det finns olika format"). Kontraktet står i SYSTEM.
- **En film per plats** (2026-11-11): platsens andra kort spelar första kortets filmer med det renderade kortet flyttat.
  En film lägger ett kort.
- **Underlag till nya filmer:** bara tagningar han har godkänt rakt av, inte varianter. Allt görs i bankens format;
  Astrids och Kevins stående material används inte som referens.
- **Två tagningar per klipp**, en tredje bara om båda faller. Oberoende rutgranskning i full upplösning före hans dom.
- **Klicket är kön (2026-11-13):** "jag vill ju kunna klicka bara i stället för att säga lägg kön, så görs det per
  automatik." Hans "Godkänn och lägg i kön" i Beställ räcker alltså; huvudagenten startar beställningsagenten
  (`tools/order-clerk.md`) så snart en godkänd order har en tagning som inte är lagd. Gränserna i
  `data/order-policy.json` prövas vid godkännandet som förut. Vakten är ett skript i huvudagentens session
  (`D:/dealer-scratch/tmp/huvudagent11/look/vakta-kon.mjs`, bara läsning); utan en öppen huvudagentchatt läggs inget,
  och det är en känd brist tills kön har en egen väg.
- **Betald generering (2026-11-13, ersätter de äldre beskeden):** "Kan vi nu göra så att du beställer lämpliga filmer
  automatiskt utan mitt godkännande, för det är bara jobbigt för mig att göra allt detta med att godkänna!" Huvudagenten
  godkänner alltså beställningar på hans uppdrag (`approval.by: "huvudagent"` med uppdraget citerat; hans eget klick
  står som `"jakob"`), inom gränserna i `data/order-policy.json` (dagstaket 14 000 den 2026-11-13, se nedan; högst 400
  per beställning, golvet 2 000 på saldot). Ramen, som huvudagenten har satt och han kan ändra: allt beställs genom
  Beställ och handboken `tools/film-prompting.md`, så att det går att göra om; en ändring per metodprov och en tagning
  per prov, två tagningar per klipp när metoden är vald; varje omgång oberoende granskad innan nästa bygger på den;
  kostnaden berättas efter varje omgång. Det som fortfarande är hans: domarna i Granska och Material (vilket ankare som
  gäller, Primär, Godkänd, Variant, Underkänd) och allt utanför filmbeställning (publicering, Scout).
- **Vercel:** den låsta kopian och botens anrop via AI Gateway ligger i teamet **jakeminator**, där krediterna finns
  (Jakob 2026-11-12). Inget publiceras utan hans "kör".
- **Primär tagning** väljer han själv; agenter sätter inga åt honom.
- **Görans material** (blackjack-studion) används inte; Pamela är dealern (SYSTEM, "Återbruk och införande").
- **3D-labbet:** "fantastiskt" (oskärpan har djup, vyn lutar lite åt sidan, bordet har markeringar). Bordsbenen får vara
  så länge de inte kostar minne; markerbrädet finns kvar som reserv, avstängt från start. Bordet sett från backad kamera
  kallade han "fruktansvärt fult" (därför underredet Två ben, obedömt).
- **Svar** till honom: korta, punktform, procent och poäng (AGENTS).

## Kända brister

- **Det bandet inte kan än** står samlat i `tools/dealer-line.md` ("Vad bandet inte kan än"): ett tredje eller fjärde
  kort, helfiguren, ankare 2.2, landningsbild, keystone och ankare 1 som steg i Beställ, och retur till vila från en
  plats.
- **Orden för kortets sidor** är en öppen fråga. Jakob 2026-11-13: "Baksida kan betyda olika saker, som baksidan på ett
  kort, men det kan också referera till undersidan." Mall 6 sade sidorna efter färg och föll i båda paren i omgång 6;
  mall 7 säger åter "its back is yellow and its face is blue" (`72e4f08`).
- **Kling 4:s färger** läses som Python läste dem: en BT.709-märkt film som BT.601, så att efterarbetet ger samma bild
  som de godkända tagningarna; en korrekt avkodning skulle flytta färgerna något, och det är inte avgjort
  (`tools/film-after.ts`).
- **`tools/clip-edit.ts`** kan fortfarande skicka ett betalt jobb till Runways utvecklar-API och används inte; den tas
  bort eller spärras när städningen har visat att inget läser den.
- **Paow ser lite smal ut:** bildmodellen gav henne Pamelas kroppsbredd under ett huvud som är 8,7 % högre (mätt
  2026-11-13, `D:/dealer-scratch/tmp/huvudagent11/proportioner/`); bilden är inte hoptryckt i pixlarna.
- **Två röst-id** för ElevenLabs som Jakob gav finns inte i kontot; spelet använder rösten Jessica tills han har lyssnat
  (`src/game-page.ts`, skrivs 2026-11-13).
- **Testerna utan FFmpeg:** elva tester hoppas över där FFmpeg saknas (`tools/film-after.test.ts`,
  `tools/film-fix.test.ts`, `tools/order-bring.test.ts`, `tools/register-order.test.ts`, `tools/speech-plan.test.ts`),
  och tre i `tools/order-images.test.ts` kräver bankens filmer; GitHubs kontroll kör därför inte dem, den här datorn gör
  det.
- **Kön** läggs bara när en huvudagentchatt är öppen (vakten `D:/dealer-scratch/tmp/huvudagent11/look/vakta-kon.mjs`,
  bara läsning).
- **Paows landningsbild** `paow-landning-p4-giv-t2` står som `gäller` men visar handryggen och duger inte för en
  vändning; tur och retur behöver den inte.
- **Det platta överlägget** (2D) läcker cirka 30 bildpunkter i fyra rutor i `pamela-p4-c1-plan-deal-01` och
  `pamela-p1-c1-plan-deal-03`; täckningen är inte mätt för klipp efter 2026-11-11 (`node tools/card-coverage.ts --all`).
- **Dealerns första kort i Pamelas film** är 1,76 gånger för stort; labbvalet "Standard hela vägen" lämnar en blek rest
  i luften (Prov `kort-en-storlek`).
- **Spelet:** 3D-skon klipper handen i givarna; helkroppsfilmerna har ingen sko; utfallsskyltarna ligger över
  insatsbrickorna när alla sju platser spelar. Spelet är prövat i headless Chrome och stillbilder; rörelsen är inte
  bedömd för ögat, och dubbling och försäkring är inte sedda. Övriga gränser: SYSTEM, "Spelet".
- **3D-scenens hemvy** stämmer inte längre med referensen i `assets/proofs/bakgrund-3d-referens/` (medel 0,96, max 168):
  filtens tryck har flyttat med planen sedan referensen togs. Referensen tas om med Jakobs ögon, eller mäts med den plan
  den togs med; den ändras inte för att dölja avvikelsen.
- **Kortbanan** för det renderade kortet utgår från ett liggande kort; Jakob 2026-11-12: "utgångspunkten skulle vara att
  kortet låg på bredsida, vilket är fel". Banan ska börja i det stående kortet i skon.
- **Placering i studion:** på V6-bilden och på filmer utan grön filt ritas de renderade korten hela. Inte prövat: byte
  av vy med osparade ändringar och knappen för att läsa in en fil.

## Arbetsyta

- **`main` är den enda grenen** (GitHubs förvalda gren sedan 2026-11-13). De två gamla grenarna, `jakob/test` och
  `claude/deal-clips`, är borttagna från GitHub (`345e247`); hela historiken finns i `main`. Etapper `jakob-3` till
  `jakob-7` och hur de sätts: DRIFT, "Git och kontroller".
- **Studion:** `http://127.0.0.1:4319/studio/` (`/` och `lab.html` leder dit). En labbflik: visa en sida med
  `node tools/preview.ts --open "<sida>"` (DRIFT, "Labbservern och fliken"). Lösa granskningssidor under
  `D:/dealer-scratch` används inte mot Jakob.
- **`placements/default.json` är Jakobs plan,** incheckad på hans ja 2026-11-12 (`7a158d6`). Studions Placering skriver
  den; en agent ändrar den aldrig på eget bevåg. 2026-11-11 kväll lades den om på hans ord: alla kort ×1,20 (P4 86,6 ×
  71,8 px), perspektiv 87 %, vridning 0°, platserna speglade kring bildens mitt, dealerns två kort centrerade. Skriptet
  och kopiorna från före ändringen: `D:/dealer-scratch/tmp/paow/labb/`.
- **Publika sajten** visar 22 filmer från `b65fd9b` (`evidence/public-release.json`).
- **Media:** bilder och filmer som används eller kan användas ligger i `assets/` med `receipt.json` och roll i
  `data/media-roles.json`; på D: ligger slask, arkiv och säkerhetskopior (DRIFT).
- Scoutgamings huvudagent har fått besked: inget härifrån är infört där, och insatsrutor bör vara data per bord och
  filmbank.

## Före avslut av en session

1. Vänta in eller stoppa egna underagenter. Inget ocommittat får ligga kvar utom `placements/default.json`.
2. `npm test`, uttrycklig staging av egna filer, commit, `npm run check`, push, och läs GitHub-kontrollens resultat.
3. Sätt etapptagg `jakob-N` om Jakob har sett läget, och pusha taggen (DRIFT).
4. Uppdatera denna fil på plats: räkna om banken med skriptet ovan, och för in vad som är beställt och ogranskat och vad
   som väntar på Jakob. Skriv ingen dagbok; ersatt läge stryks.
5. Städa `D:/dealer-scratch` med `npm run stada`: läs rapporten och kör `npm run stada -- --kor`. Kontaktark flyttas med
   `-- --kor --regel kontaktark` först när de inte stöder ett öppet beslut; allt som Jakob inte har dömt ligger kvar
   (DRIFT, "D: och städning").
6. Labbservern får stå kvar. Stoppa den bara med `STOPP.cmd` eller `node tools/preview.ts --stop`; den står kvar tills
   den stoppas, så att länkar till labbet alltid svarar (ändrat 2026-11-12: förut slutade den en minut efter sista
   fliken, och då ledde varje länk till "anslutningen nekades").

## Verifiering

Node 24.21.0. `npm test` gick igenom 2026-11-13 med 813 av 813 tester, studions tester medräknade (enligt `3d60839`).
Film granskas ruta för ruta av en oberoende granskare innan Jakob dömer (`tools/film-review.md`). Spelet och 3D-scenen
prövas i headless Chrome mot 4319 med verktygen i DRIFT, en körning i taget; den som startar fönstret stänger det.
