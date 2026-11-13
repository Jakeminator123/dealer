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
    kortproven. Kortmatten ur filmens eget kort är inlagd som ett avslaget val (`cardMethod: 'matte'`, 96db96a; "ja som
    val i labbet, nej för spelet"). Läget och det som är prövat: `D:/dealer-scratch/tmp/dealer-bf/LASMIG.md` (metoden och
    måtten per plats) och `D:/dealer-scratch/tmp/huvudagent11/kort/` (nattens spår, bilder och jämförelser).
  - **Scen (`dealer-f6`):** bordet, rummet och ljuset i 3D-scenen (`src/scene3d-table.ts`, `src/scene3d-room.ts`,
    `src/scene3d-ui.ts`, `src/scene3d-view.ts`, `data/scene-materials.json`, `data/scene-rooms.json`,
    `data/scene-presets/`), och sidovinkeln av Paow som egna Prov.
  - **Tal (`dealer-0b`, sidan [docs/TAL.md](docs/TAL.md)):** talfilmer med röst och läppsynk (`tools/speech.ts`, `src/speech-plan.ts`,
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

## Läget i banken (Pamelas, räknat 2026-11-12; inte omräknat)

Paows läge räknas med `node tools/produce.ts paow` (Nästa steg, punkt 0), Pamelas med `node tools/produce.ts pamela`;
siffrorna nedan är från 2026-11-12 och gäller Pamela.

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

Det som hindrar en runda först. Han kan svara rad för rad.

1. **Plats 6:** fjorton tagningar har fallit (kort väg, kortet vänds i ett sudd eller byter sida utan kantruta), så
   kortet läggs utan hand i spelet. Sist prövades vändning vid platsen (omgång 11, Kling 4 två tagningar och WAN 3 en):
   kortet blev mjukt eller suddigt i vändningen, eller blått i luften utan vändning. Får Pamelas giv till plats 6, som
   bara är godkänd som variant, vara referensfilm? Annars återstår handbyte, eller att flytta platsen en bit från skon i
   hans plan.
2. **De nio preliminära domarna** från natten ("jag måste sova och du får granska och godkänna alla klipp"), först i hans
   kö i Granska; hans eget beslut ersätter var och en:
   - `paow-giv-2-1-d-c2-03-01` (hålkortet stängt): godkänd; se att kortet är 119 px på filten och 59 px när handen släpper,
     bytet dolt under handflatan.
   - `paow-halkort-04-02` (hålkortets vändning, Kling 4): godkänd; granskaren föreslog variant, eftersom hon ser in i
     kameran och knappt rör huvudet.
   - `paow-halkort-02-01` (hålkortets vändning, WAN 3): variant; ingen ren kantruta, en mörk suddig rand i tre rutor.
   - `paow-giv-2-1-p7-06-01` (plats 7): godkänd; en verklig vändning, men hon är stel (huvudet 30 px).
   - `paow-utgang-01-01` (utgången): godkänd; ersätter nödlösningen med ingången baklänges.
   - `paow-table-arrive-wide-01` (hon kommer in och sätter sig): variant; hon står helt stilla i drygt 20 rutor innan hon
     sätter sig, och bär pumps där keystonen har platta skor.
   - `paow-table-leave-wide-01` (hon reser sig och går): godkänd; uppresningen går cirka 20 px för högt och sjunker tillbaka.
   - `paow-giv-2-1-p6-05-01` och `paow-giv-2-1-p6-07-01`, `-02` (plats 6): underkända; vändningen är ett sudd utan
     kantruta.
   - `paow-giv-2-1-p2-04-02` (plats 2): underkänd; kortet byter färg utan kantruta cirka 80 px före platsen.
   - Returerna i samma filmer (`d-c2-03`, `p2-04`, `p6-05`, `p7-06`) är preliminärt godkända.
3. **Ett tredje och fjärde dealerkort** (hans ord 2026-11-13: "Skapa då ett tredje och fjärde till dealer"): planen har
   sexton platser, två per spelare och dealerns två (`TARGETS` i `src/placement-model.ts`), och ordermodellen tar bara
   de platserna (`SEAT_TARGETS` i `src/order-model.ts`), så en film dit går inte att beställa i dag och korten läggs
   utan hand i spelet. Förslag, inte byggt: planen får `D.C3` och `D.C4` i rad efter `D.C2` med samma avstånd som mellan
   hennes två första (Placering, studions kortlager, beställningarnas sista bild och testerna som räknar sexton följer
   med); sedan flyttar han dem i Placering och filmerna beställs som hennes första kort (WAN 3, vändning vid platsen:
   "Den är mycket bra."). Vill han ha det så?
4. **Orden för kortets sidor:** hans ord om "baksida" (det kan läsas som undersidan); orden efter färg i mall 6 förlorade
   två par; ett neutralt tredje sätt är oprövat. Vill han att det provas?
5. **Hur hon ska röra sig:** rörelsemeningen i mall 7 rörde henne men förstörde kortet i 15 av 18 tagningar; blicken ensam
   hjälpte inte kortet. Vilken rörelse är viktigast: huvud, blick eller högerarm?
6. **Ingångsfilmen** (`paow-table-arrive-wide-01`): hon står stilla i ungefär två sekunder innan hon sätter sig. Duger det,
   eller ska den göras om?
7. **De ritade korten:** två av de tre felen i hans skärmbilder är borta för de tagningar som spelas; dubbelkortet vid
   3D-skon är kvar (se "Kända brister"). Vill han ha korten större som förval? Det stora kortet han minns på plats 4 var
   skalan 1,65–2 den 11 november; förvalet är 1,2, och reglaget heter nu Kortens storlek (0,8–2) i Scen. Brytaren Ritade
   kort tar i dag bort alla ritade kort, även de liggande, så bordet visar bara filmens eget kort för den giv som pågår
   (sett i scenbanans inspelning med `cards=0`). Förslag, inte byggt: ett tredje läge, Bara liggande (`cards=liggande`), där kortet ritas först när det
   ligger och inget ritas över kortet i hennes hand, vilket är det han beskrev ("kletar fast sig på korten"). Spelagentens
   plan: spelsidan och Casino hanterar läget själva, utanför utseendenyckeln `cards` som förblir på eller av (scenen
   läser varje ord som på); en giv spelas då utan kortspår och utan eget kort, och kortet ritas från returen
   (`src/game-film.ts`); brytaren i panelen Miljö och i Casino blir ett val i tre steg. Före bygget kontrolleras, ruta
   för ruta på en giv till plats 4 och en vändning, att kortet kommer fram när handen släpper och inte över fingrarna.
   Hennes röst i spelet hörs efter ett klick på själva bordet (talfilmerna var tysta i spelets kö till f63e0ec).
8. **En andra spelarfigur, "Astrid",** som kommer in från sidan och satsar: hans önskemål, inte påbörjat.
9. **Bordets tryck:** ska trycket följa bordets storlek (`tableSize`)? Scenbanans fråga.
10. **Talet:** två röst-id han gav finns inte i något konto eller delat bibliotek som nyckeln ser (Jessica står); ett tomt
    Blob-lager `dealer-lab-tal` skapades i hans eget Vercel-team för en RunPod-mätning som inte kördes: ta bort det, eller
    ge dess nyckel som `DEALER_SPEECH_BLOB_TOKEN`; den andra produktens gren `kevin-staging` ligger före den commit som
    lästes (docs/TAL.md).
11. **Äldre frågor om Pamela** (pausad): primära på hennes kanter, hålkortets giv, skokortets lutning, ett kortformat på
    tvären, Meshy-bordet, obedömda prov och den publika sajten står kvar i Git-historiken för HANDOFF före 2026-11-13 och
    tas upp när pausen hävs.

## Nästa steg

0. **Paow, läget 2026-11-13 klockan 08:36** (`node tools/produce.ts paow`): 23 av 33 filmer klara, varav 9 preliminärt
   dömda, och 19 av de 21 som en runda kräver. Kvar för en runda: given till plats 6 (Öppet hos Jakob, punkt 1) och
   hålkortets retur till vila (ingen metod). Omgång 7–10 (31 tagningar) och vad de lärde står i handboken §5; mall 8
   gäller. I spelet spelas rundan med hennes filmer; nödlösningar finns för plats 6 och dealerns tredje och fjärde kort
   (lagda utan hand). Saldo efter sista tagningen: 5 192 krediter (kvittot för `paow-giv-2-1-p6-09`, omgång 11). Pamela är pausad
   (Jakob 2026-11-12: "Vi pausar Pamela när vi är klara. Sedan går vi vidare med Paow.").
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
  i rundan, en retur som kommer tillbaka med den hand som är ute (`motion.releaseHand`).
- **Budgeten** (2026-11-13 cirka 07:25): "jag ger 6000 mer i budget eller till krediterna tar slut för runway".
  Dagstaket är 14 000 för 2026-11-13 (`data/order-policy.json`); golvet 2 000 och 400 per beställning står.
- **Önskemål samma natt, inte byggda:** att kunna slå av de ritade korten; ett tredje och fjärde dealerkort (platsen
  lägger han i Placering när ordermodellen har den); en film där hon kommer in och en där hon går ("en där hon reser sig och går ut och en när hon kommer in och sätter sig"; gjorda i natt utanför Beställ, handboken 3.9, preliminärt dömda); senare en andra spelarfigur, "Astrid", som kommer in från sidan och satsar.
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

- **De ritade korten** (Jakob 2026-11-13: "Det lixom kletar fast sig på korten"; brytaren Ritade kort slår av dem).
  Kortagentens fynd samma morgon, ur hans två skärmbilder:
  - Dubbelt kort vid skon, som ett klistermärke: 3D-skon döljer filmens sko, och det dragna kortet klipps inte av skons
    öppning. Kvar på alla platser. Ligger i `src/game3d-props.ts` och skoprovet i `src/scene3d-ui.ts`.
  - Filmens gula eller blå yta lyser igenom: direkt efter vändningen är filmens framsida mörkt turkos, och spåret följde
    då bara ett hörn (den lilla vita kortbiten i hans andra bild; borta). Kvar: det turkosa kortet syns i cirka fyra
    rutor, vilket kräver en bredare regel för blått i spåraren, prövad mot grönskärmen. Där kortet är dolt i hennes
    hand (plats 1 och 2) visas nu filmens eget kort, och det ritade kommer när kortet ligger.
  - Kort som inte följer handen, och blixten över hela bilden: fyrhörningar med korsade hörn i spåret. Spåraren skriver
    inga sådana längre, och ritningen (`poseAt` i `src/card-overlay.ts`, `lay` i `src/scene3d-deal.ts`) ritar inget
    kort på en sådan ruta.
  - Kvar i övrigt: spåren på plats 3 och 7, dealerns kort och hålkortet är delvis fel (kortet syns som filmens i 5–14
    rutor); Pamelas spår är inte omgjorda med de nya reglerna. Tabellen per tagning och bilderna:
    `D:/dealer-scratch/tmp/huvudagent11/kort/`.
  - Kortens storlek bestäms av `cardScale` gånger kontraktets kort (63 × 88 mm); planen ger bara plats och riktning.
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
  (`src/game-page.ts`).
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
