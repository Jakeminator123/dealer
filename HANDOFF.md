# Dealer — överlämning

Uppdaterad natten mot 2026-11-14. Läs denna fil först, inte chatthistoriken. Här står bara det som gäller nu: målet,
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

## Vem äger vad (2026-11-17)

- **Huvudagentens adress: `dealer-b8`.** Adressen är det andra sessioner skriver till med SendMessage, och den står bara
  på den här raden; rubriken Jakob ser på chatten betyder inget. Byter rollen session, ändras den här raden och inget
  annat. Alla fyra sessionerna fick nya adresser när Jakob bytte konto 2026-11-17 (samma chattar, samma banor); i
  commitmeddelanden och äldre text heter de `dealer-94` (huvudagenten), `dealer-f6` (scen), `dealer-0b` (tal) och
  `dealer-1e` (trailer). Kontrollera med ListAgents före ett meddelande. Huvudagenten äger commits, taggar och push, studion,
  labbservern, spelet och 3D-scenens filmlager, `src/clip-graph.ts` och styrdokumenten.
- **Huvudagenten håller ihop sessionerna** (Jakob 2026-11-13 kl. 15.50, på väg ut: "Kör på och du delegerar och
  kanske nu tom ska komma vad de tre andra agenterna gör och se till att du har kontroll över vad alla gör"). Varje
  bana får sin kö av huvudagenten, säger till när ett steg är grönt med en fillista, och frågar huvudagenten när han
  är borta; det som bara han kan svara på samlas i "Öppet hos Jakob".
- **Banor** (Jakob 2026-11-13: en typ av uppgift per session, synkade genom huvudagenten). Ingen bana skriver i en
  annans filer; allt in i repot går genom huvudagenten med en fillista. Betalda anrop utanför Beställ rapporteras till
  huvudagenten med belopp.
  - **Film (huvudagenten):** den enda vägen från bild till dealer (`tools/dealer-line.md`): Beställ och beställningarnas
    texter och bilder (`src/order-*.ts`, `tools/order-*.ts`), efterarbetet (`tools/film-after.ts`,
    `tools/still-after.ts`, `tools/python/`), banken (`tools/register-order.ts`, `motions/`), Protokoll, handboken och
    registren (`data/order-methods.json`, `data/media-roles.json`, `data/dealers.json`, `data/order-policy.json`).
    Underagenter lägger, hämtar och granskar.
  - **Kort (huvudagenten):** det ritade kortet på filmerna, kortspåret (`src/card-track.ts`, `tools/track-card.ts`) och
    kortproven. En linje för korten gäller sedan 2026-11-13 (Jakobs besked; SYSTEM, "Ritade kort"). Kortmatten ur filmens eget
    kort (`cardMethod: 'matte'`, 96db96a; hans ord då: "ja som val i labbet, nej för spelet") används för plats 1 och
    2 och jämförs nu mot det ritade kortet som linje för alla platser (Prov `kort-en-linje`). Läget och det som är prövat: `D:/dealer-scratch/tmp/dealer-bf/LASMIG.md` (metoden och
    måtten per plats) och `D:/dealer-scratch/tmp/huvudagent11/kort/` (nattens spår, bilder och jämförelser). Omstarten
    (pålägget) byggs av en underagent, kortbyggaren, i `D:/dealer-scratch/tmp/kortbyggare/` och lämnas som mappar per
    steg (Kända brister, Korten).
  - **Scen (`dealer-dc`, förut `dealer-f6`):** bordet, rummet och ljuset i 3D-scenen (`src/scene3d-table.ts`, `src/scene3d-room.ts`,
    `src/scene3d-ui.ts`, `src/scene3d-view.ts`, `data/scene-materials.json`, `data/scene-rooms.json`,
    `data/scene-presets/`), och sidovinkeln av Paow som egna Prov.
  - **Tal (`dealer-cc`, förut `dealer-0b`, sidan [docs/TAL.md](docs/TAL.md)):** talfilmer med röst och läppsynk (`tools/speech.ts`, `src/speech-plan.ts`,
    `src/speech-lines.ts`, `data/speech.json`), munlagret och hennes röst genom sidans eget ljud (`src/scene3d-mouth.ts`,
    `src/page-audio.ts`, `src/scene3d-voice.ts`), media under `assets/speech/paow/`, levererat som patch.
- Utan bana: `dealer-e2` (förut `dealer-1e`; startad av Jakob 2026-11-13 för ett nytt slut på noir-trailer 3, bilder till ett rum i
  Monaco-stil och spelhålan, på hans ord champagnefilmen `paow-vila-17` med blixtens utseende, och filmen före spelet:
  modulen `src/game-intro.ts` och filmen i `assets/films/intro/noir-3/` är dess, lämnade som patch; arbetet i
  `D:/dealer-scratch/tmp/trailer-3b/` och `D:/dealer-scratch/tmp/dealer-1e/intro/`, beloppen rapporterade till
  huvudagenten).
- Avslutade sessioner: `dealer-bf` (kortet, sidokameran, Petra; 2026-11-13), `dealer-82` (Paow,
  `D:/dealer-scratch/tmp/paow/`), `dealer-db` (Pamela-filmen, `D:/dealer-scratch/tmp/reel/`), FILMAGENT, FILMAGENT-2,
  SPELAGENT och Bakgrund och bord.
- `tools/clip-job.ts`, `tools/clip-edit.ts` och engångsverktygen från 2026-11-10 är borttagna; `tools/build-anchor.ts`
  och `tools/card-coverage.ts` står kvar.
- Jakobs egna: planen `placements/default.json` (se Arbetsyta) och hans domar i `motions/` (`review`), som skrivs från
  studions Granska och aldrig skrivs över av ett verktyg; en dom som getts åt honom (`node tools/review-put.ts`) är aldrig hans,
  väntar inte i hans kö och ger vika för hans.
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

**Sedan 2026-11-17 kväll står det som väntar på hans svar i studions vy Beslut** (`/studio/beslut/`, registret
`data/decisions.json`; README): ett kort per fråga, med filmen eller bilden på kortet. Han svarar där eller i
huvudagentens chatt, och han talar bara med huvudagenten ("kan jag kanske tala med dig hela tiden så får du
delegera"). En agent lägger till ett kort när något väntar på honom och tar bort det när svaret är utfört; listan
nedan är bakgrunden och det som inte ryms på ett kort.

Skrivet 2026-11-17. Lördagen 2026-11-14 skrev han nio korta meddelanden från telefonen (ordagrant i "Jakobs besked som
gäller"); arbetet stannade samma dag kl. 17.15, när kontot tog slut, och togs upp igen 2026-11-17 kl. 16.35 på ett nytt
konto ("Varit borta ett par dagar och nu bytt konto"). Han läser inte långa svar, så svaren till honom är korta och
`KLAR.txt` skrivs på skrivbordet när allt har ett utfall. Det här är det som bara han kan göra eller säga.

1. **Det svarta spelet efter filmen: löst enligt honom** (Beslut 2026-11-17 kl. 18.43: "Fungerar"). Äldre text:
   **pröva igen, och skicka en skärmbild om det är svart.** Ingen av oss har en telefon, och i en headless Chrome är spelet inte svart. Det som i sidan kunde lämna
   bilden svart är ändrat och publicerat (Kända brister, "Spelet på hans telefon"). Blir det svart igen: öppna
   `dealer-lake.vercel.app/trailer?diagnos=1` och skicka en skärmbild; sidan skriver då på bilden vad hans webbläsare
   gör. Tre frågor som avgör läsningen: vilken telefon och webbläsare (skärmbilden kl. 15.21 visar en iPhone med Safari
   i strömsparläge); är hela bilden svart, eller syns bordet och knapparna och bara hon är borta; och fungerar spelet
   på samma telefon på `/casino`, utan filmen?
2. **Runway är inloggat och påfyllt** (saldot 10 052 krediter, läst 2026-11-17 kl. 17.45). En session vars koppling
   fortfarande är nere efter kontobytet behöver `/mcp`. Äldre text som följer: saldot gick inte att läsa 2026-11-17 och var cirka 52 krediter 2026-11-14 (516 kvällen före;
   dagens anrop: bild 20, trailerns prov 124, rummets slinga 320). Påfyllningen gör bara han (arbetsytan "Jakob", sidan
   för betalning hos Runway). Det som väntar på krediter, i den ordning hans egna ord pekar: tatueringarna på hennes
   rygg i trailerns början (nästa prov cirka 105; hela början 650–950, med marginal 1 150–1 200), tatuerade och mindre
   händer på dealern (nya ankare och alla hennes filmer om: skattat 7 000, huvudagentens skattning), ett varv till på
   Monacos bakgrund (150–200), nya returer till vila (de tre som finns slutar 2–3 bildpunkter från vilans bild, och
   nio saknas: skattat 1 800), nya försök på fingrarna och vinkningen, och en giv till plats 6 utan omvägen framför
   henne. Den andra läppsynkmodellen behövs inte längre för mungiporna (talbanan).
3. **GitHub: kontot är låst av en betalningsfråga.** Efter pushen 2026-11-17 kl. 16.48 startade GitHubs egen kontroll
   inte: "The job was not started because your account is locked due to a billing issue." Koden är pushad och samma
   kontroll går grön på datorn (hela testsviten och publiceringskontrollen i ett rent arbetsträd), så inget är
   stoppat, men GitHubs bock är röd tills han har rett ut betalningen under sitt GitHub-konto (Settings, Billing).
4. **Fotot får skickas till bildmodellen** (hans ja 2026-11-17: "ja, foton får skickas"): fotot av kvinnan med
   tatueringarna (`private/referenser/`) får användas som förlaga för tatueringarna hos bildmodellen. Det läggs
   aldrig i Git, i ett prov eller på sajten. Det andra provet på ryggtatueringarna i trailern är beställt av honom
   (cirka 105 krediter) och görs av trailersessionen; han får se det i Prov innan något byts.
5. **Mobilens nya konsol: titta på telefonen, stående och liggande** (publicerad 2026-11-17 kl. 16.40). Konsolen täcker
   inte längre bordet (SYSTEM, "Konsolen"). Det han bör säga något om: Miljö, Dealer och Musik ligger bakom en knapp
   (≡), stående visas plats 2–6 och hon är cirka en femtedel mindre än förut.
6. **Korten.** Underlägget är på från början sedan 2026-11-14 kl. 15.27 (hans ord kl. 15.14: "Ang spelkorten så ser de
   inte skitbra ut heller än så länge"), och kortbyggarens fjärde steg är publicerat samma dag kl. 17.11: hålkortet
   följer filmens kort under hennes hand och skons fönster står mörkt. En oberoende granskare såg två hela rundor utan
   att veta vilken som var vilken och valde rundan med steg 4 (hålkortet 3,5/5 mot 3/5, skons fönster 5/5 mot 3/5).
   Det som är kvar står i Kända brister, Korten. `kort=liggande` finns kvar för hans eget öga.
7. **Filmen till hans chef.** På skrivbordet ligger `paow-runda-6-till-chefen-spelet.mp4` (och `-scenen.mp4`), en hel
   runda i filmad fart, 124 s, blint granskad 3,75/5. Den är inspelad före lördagens ändringar (kortens fjärde steg,
   håret, rummets slinga) och före mungiporna; en ny tagning görs när talbanans läppar är inne (Nästa steg). Ingen
   granskare har hört ljudet: han bör lyssna innan han skickar. Äldre filmer på skrivbordet som inte ska skickas:
   `paow-runda-2-` till `paow-runda-5-`. Trailern ligger där som `noir-trailer-3-kort.mp4` och
   `noir-trailer-3-nytt-slut.mp4`, och förslaget med tatuerade händer som `paow-fler-tatueringar-forslag.jpg`.
8. **Läpparna: dagens omläggning är underkänd av honom och uttagen igen.** Hans ord 2026-11-14: "Hon får lixom lite som
   typ clown-mungipor." Talbanan lade om alla repliker med hennes egen underläpp och gipor som följer käken; elva
   oberoende granskare kallade de nya bättre i 30 av 30, och 25 talfilmer och tre munlappar gick in och ut på kopian
   2026-11-17 kl. 17.05–17.08 (STABILT 16 och 17). Kl. 17.15 såg han dem: "[proven paow-mun och paow-tal] är värre än
   förut. […] Detta ser på dessa videos sämre ut i alla fall som agt", och om trailern på kopian "så är lipsynk sämre".
   Samma kväll är de 25 underkända åt honom med hans ord som grund (inte som hans egen dom i Granska), de tre lapparna
   är de förra igen, och spelet säger de repliker det sade i lördags. **Vad granskningen missade:** granskarna såg
   stillbilder och förstoringar i filmens storlek; han ser rörelsen i spelets storlek. Före nästa byte av läppar:
   en jämförelse i spelets storlek och i rörelse, och hans eget ja. Hans egen idé (kl. 17.20, till talbanan) står som
   nästa steg, obyggd: leendefilmen `paow-vila-03-01` som underlag, så att munnen hämtas ur hennes egen film och
   modellen bara bestämmer när och hur mycket. Den andra läppsynkmodellen är det betalda alternativet. Hans egen
   godkända `paow-tal-blackjack-sv-04` är orörd.
9. **Det han bör se själv, allt i Prov** (studion på hans dator; kopian bär bara de sex prov han valde 2026-11-12):
   Monacos nya bakgrund (`monaco-liv-2`, 3,5/5: kyparens rundor upprepas och allt går lite raskt), håret utan grön
   kant (`har-utan-gront`), förslaget med tatuerade händer (`paow-fler-tatueringar`: sagt "Jättebra med händerna",
   helst mindre händer), underlägget (`underlagg`), liv i överkroppen (`liv-i-overkroppen`), blixten (`blixten`), de
   fyra nya rummen (`monaco-och-spelhalan`; ska något av dem in i spelets meny?), röken (`rok-over-bordet`, av),
   kopparna (`koppar-i-relingen`) och trailerns nya slut (`trailer-noir-3`). På en iPhone dessutom (Kända brister,
   "Hennes röst på en iPhone"): hörs hon när hon säger sin första replik och under en runda, med ringsignalen på och
   av? Kommer rösten in sent första gången en replik sägs? Hörs "Lycka till" över ingången?
10. **Farten.** Inget skyndas längre från början (hans ord 2026-11-13 kl. 19.13). Förslag som väntar på hans öga, från
   scenbanan: fart bara på givar och returer, och hellre 1,3–1,5 än 2. Reglaget Givarnas tempo finns kvar i Scen.
11. **Ett tredje och fjärde dealerkort** (hans ord 2026-11-13: "Skapa då ett tredje och fjärde till dealer"): planen
    har sexton platser, två per spelare och dealerns två (`TARGETS` i `src/placement-model.ts`), och ordermodellen tar
    bara de platserna, så en film dit går inte att beställa och korten läggs utan hand. Förslag, inte byggt: planen får
    `D.C3` och `D.C4` i rad efter `D.C2`; sedan flyttar han dem i Placering och filmerna beställs som hennes första
    kort. Vill han ha det så?
12. **Mindre saker som väntar på ett ord:**
    - Boten på kopian kräver fortfarande lösenordet (den kostar per fråga); resten av kopian är öppen sedan
      2026-11-14 kl. 15.27. Ska boten också vara öppen?
    - `placements/proposals/` (två förslag till plan från 2026-11-11 som bara gamla scensidan visar): tas bort?
    - De tre långa biblioteksfilerna under `materials/` (three.js och två färdigbyggda sidor): byggas ur vår egen
      källa när gamla publika sajten stängs?
    - Fyra av Pamelas filmer från 2026-11-11 ligger kvar på disk utan post; en tidigare agent tog dem ur banken.
    - En andra spelarfigur, "Astrid", som kommer in från sidan och satsar: inte påbörjad.
    - Ska bordets tryck följa bordets storlek (`tableSize`)? Scenbanans fråga.
    - Hans första röst-id är inte färdigtränat hos ElevenLabs (bara kontots ägare kan göra klart det). Paows talbank
      ligger kvar i hans privata Blob-lager `dealer-lab-tal` efter mätningen hos RunPod (0,05 USD): ska den bort?
    - Profilval 1 kapar toppen av hennes huvud i 93 % av rutorna: flytta kameran en aning, eller låta stå?
13. **Äldre frågor om Pamela** (pausad): primära på hennes kanter, hålkortets giv, skokortets lutning, ett kortformat på
    tvären, Meshy-bordet, obedömda prov och den publika sajten står kvar i Git-historiken för HANDOFF före 2026-11-13 och
    tas upp när pausen hävs.

## Nästa steg

**Läget 2026-11-17 och det som pågår.** Kopian publiceras ur `main` efter varje färdig del (senast 2026-11-17; `/meta.json` på kopian säger vilken
commit): öppen utan lösenord, underlägget och kortens fjärde steg, vilans nya regel, Monacos slinga, håret,
ändringarna för det svarta spelet, mobilens konsol, de nya läpparna. Av en repliks filmer bär kopian bara den spelet
säger (DRIFT, "Taket för Blob"). Det som följer är i gång eller står på tur; punkterna under är äldre och gäller där inget
här säger annat.
- **Trailersessionen** har spelat in slutet på filmen före spelet på nytt (Monacos nya slinga, hennes svaj av; inga
  krediter) och går mot avslut på Jakobs ord. Filmen ligger inne som `assets/films/intro/noir-3/film-2.mp4` (nytt
  namn, eftersom kopian svarar med ett dygns lagringstid och en telefon annars hade visat det gamla slutet; den förra
  ligger bredvid som `film-v4.mp4`). Mätt av huvudagenten i den riktiga sidan, på ansiktet i de rutor webbläsaren
  ritade: 0 bildpunkter mellan filmens sista ruta och spelet i 1920 × 1080 och 844 × 390, 1 i 390 × 844, och rummet
  bakom henne skiljer 0,7 nivåer av 255 (`D:/dealer-scratch/tmp/huvudagent11/look/skjut-intro-toning.mjs`,
  `hopp-i-rutor.mjs`). Kvar i dess bana: tatueringarna i trailerns början (provet 2/5; ett andra prov cirka 105
  krediter, hela början 620–940), och ingen har lyssnat på trailern.
- **Talbanan:** dagens läppar (STABILT 16 och 17) är uttagna ur spelet på Jakobs dom samma kväll (Öppet hos Jakob,
  "Läpparna"). Receptet i `src/speech-plan.ts` är åter lyftet med ritad underläpp; måtten för hennes egen underläpp
  och giporna (`sink`, `lens`, `corner`, `cornerMost`, `edge`) finns kvar som val med sina tester, oanvända. Vägen
  som gicks: `D:/dealer-scratch/tmp/tal/stabilt/tillbaka-17.json`; de underkända lapparna i
  `D:/dealer-scratch/tmp/huvudagent11/look/lappar-underkanda-1117/`. Talbanan skriver en överlämning av hela banan i
  `D:/dealer-scratch/tmp/tal/stabilt/LASMIG.md` (hans ord: "Lämna över så vi kanske kan avsluta eller att ni gör
  olika saker"); ingen annan session lägger läppar.
- **Scenbanan** mäter hoppen i webbläsaren (Kända brister, "Hopp mellan filmer"): sex korta körningar, tre i
  1920 × 1080 och tre i 390 × 844. Rummets film `monaco-liv-2.mp4` står kvar som den är: den har ett litet steg in i
  varje nyckelruta (var 8,3 s, 0,57 nivåer av 255 i en suddig bakgrund; 0,87 i slingans skarv), och ingen av 17
  prövade kodningar tar bort det utom en enda bildgrupp utan nyckelrutor, som en telefon som tappat sin avkodare
  skulle behöva avkoda från slingans början. Skattat, inte prövat med ögat: det syns inte. Syns en puls i rummet
  ligger den kodningen som ett kommando i `D:/dealer-scratch/tmp/levande-objekt/rumsliv/kod-prov-2.sh`.
- **Huvudagenten:** en ny runda till chefen när läpparna är inne (`alla.mjs`, ny tagning, blind granskning mot
  `chef-jakob-1-1x-v10`), kopian sedd som en ny besökare i telefonstorlek efter varje publicering, och `KLAR.txt`
  på skrivbordet när allt har ett utfall.
- **Väntar på Jakob** (korten i Beslut): det nya rollbladet för trailern (tatueringen från hans foto, större byst,
  smalare; ja ger en ny film av trappans tagning med dagens film som förlaga, 120–140 krediter per tagning, ram 400
  för provet); läpparna, provet `paow-baslinje` (munnen en fjärdedel bredare och ut till hennes gipor; i hans flik
  såg filmen utfrätt ut fast filen är riktig, så han har inte dömt den än: be honom se den i vanliga Chrome); om
  trailern syns på telefonen; Monacos bakgrund; repliker som munlappar; boten.
- **Nya händer på dealern** (hans ja i Beslut 2026-11-17, med anteckningen): de nuvarande filmerna ligger kvar, och
  en ny uppsättning byggs bredvid från ett ankare där hon har "aningen mindre händer och även tatueringarna", gärna
  med snabbare givar, och med beställningsvägen genomgången först ("hur vi faktiskt beställer av runway och om detta
  görs via Beställ eller om det är du som skickar"). Han vill gå igenom allt om givarna inför nya beställningar,
  kanske med en ny agent, och prövar själv Beställ. Händerna syns i varje film, så nya givar kan inte blandas med
  gamla vilor: det blir en hel uppsättning som tar över när den är komplett. Att måla tatueringar i färdiga filmer
  har fallit två gånger hos granskaren (2 av 5, ryggen i trailern). Första steget är en stillbild för hans ja.
- **Gjort samma kväll, utöver det ovan:** hoppen mellan vilofilmer (`845afa3`), trailern i mitten på en liggande
  telefon (`052ec81`), vyn Beslut (`aee87ca`). Talbanan har lämnat över och kan stängas; scenbanan likaså;
  trailersessionen arbetar med rollbladet och omtagningen.

0. **Paow, läget 2026-11-13 vid midnatt** (`node tools/produce.ts paow`: 24 av 33 steg klara, 20 av de 21 en runda
   kräver; det som saknas för en runda är hålkortets retur till vila, som inte har någon metod). En runda spelas i
   spelet med hennes filmer och hennes egen röst i en jämn styrka, i filmad fart (inget skyndas sedan kl. 19.13), i
   replikerna rör sig båda läpparna (STABILT 13; `node D:/dealer-scratch/tmp/huvudagent11/look/vad-hon-sager.mjs`
   listar vilken tagning spelet säger för varje replik), tre repliker sägs över filmerna medan hon arbetar
   (munlagret), ljuset är utjämnat mellan filmerna och hon har liv i överkroppen. Vilan växlar mellan arton filmer,
   gesterna 31 % av vikten, bland dem champagnefilmen och dess variant med blixt. Kön i Granska är tom: allt som kom
   in dömdes åt honom efter en oberoende granskning (`node D:/dealer-scratch/tmp/huvudagent11/look/ko-nu.mjs` räknar
   den; 102 dömda åt honom, 0 väntar).
   - **Plats 6** ges från ankare 2.2 (`SEAT_HUB`, SYSTEM): ingången `paow-ingang-2-2-01-02`, given
     `paow-giv-2-2-p6-02-01-deal`, dess retur och utgången `paow-utgang-2-2-01-01`, alla dömda åt honom. Givens
     kortspår är lagat i släpet. Ett kort dit tar cirka 14 s längre än ett utan hand (hälften i dubbel fart); ett byte
     direkt vid skon mellan 2.1 och 2.2 vore snabbare och är inte byggt (planen:
     `D:/dealer-scratch/tmp/huvudagent11/nya-filmer/plan-runda-via-2-2.md`).
   - **Filmen till chefen:** `paow-runda-6-till-chefen-spelet.mp4` på hans skrivbord (tagningen
     `chef-jakob-1-1x-v9-underlagg`, 124,4 s, inga sidfel, ingen ruta ur takt). En oberoende granskare såg den blint
     bredvid samma runda utan underlägg (`chef-jakob-1-1x-v8`): 3,75/5 mot 3,5/5, "jag skulle skicka A"; munnen,
     skarvarna och skons fönster är lika i båda (`D:/dealer-scratch/tmp/huvudagent11/chefsfilm/granskning-6/DOM.md`,
     bladen i `sheets/`). Granskarna om takten: inget läses som skyndat, cirka 7 s per kort, och väntan 104–113 s utan
     kort drar. Inspelaren: `D:/dealer-scratch/tmp/huvudagent11/chefsfilm/inspelare/` (`node alla.mjs <namn>`: en
     tagning är ett kommando, varje nyckel som kan ändras skrivs ut i adressen, vilofilmerna väljs av inspelaren, och
     mixen för varje replik till samma styrka; hela filmen hamnar på cirka −20 LUFS, och ingen har bestämt om den ska
     höjas). Ingen granskare har hört filmerna; Jakob bör lyssna.
   - **Korten:** spelet ritar kortet hela vägen (3,5/5 i filmad fart). Omstarten är byggd i tre steg av kortbyggaren
     och ligger i trädet, avstängd (`14e98fc`): pålägget (filmens eget kort omfärgat i hennes hand, 3/5) och
     underlägget (samma omfärgning under det ritade kortet, 3,75/5 blint i en hel runda). Det väntar på Jakobs ja
     ("Öppet hos Jakob", punkt 2). Kvar i båda rundorna, i granskarens ord: det ritade hålkortet är halvt genomskinligt
     vid 99,6–100,1 s, orange filmfärg vid fingrarna i tre korta ögonblick, kortet på kant syns som en genomskinlig
     stav och en taggig svart flisa vid 22,8 och 71,8 s, och det ritade kortet är svart utan tryck vid 43 och 92 s.
     Byggarens nästa steg, inte gjort: att det ritade hålkortet vilar medan filmens kort glider vidare under fingrarna
     (spårets fel), och smetan under tummen i vändningen. Proven: `underlagg`, `palagg-baksidan`,
     `korten-tre-satt`, och eftermiddagens ark `kort-en-linje`.
   - **Scenen** (`dealer-f6`): rättningen av delstarten är inne (`e4f3385`: en dels första ruta ritas innan dess film
     börjar gå; 0 av 35 sena starter i chefsfilmen mot 13 förut). Kvar hos huvudagenten, i `src/game-film.ts`: en film
     som inte är färdigläst när den tas in (vilan efter utgången, vila efter vila före insatserna, ingången efter
     hennes replik) ger ett litet ryck; scenbanans mått är `D:/dealer-scratch/tmp/levande-objekt/ljus/skarv-prov.mjs`
     med `skarv-ut/etapp-1.json` som läget före. Kvar hos scenbanan: vilan som växlar i Scen som i spelet, en riktig
     360°-bild till de fyra nya rummen (vridna 20° syns bildens speglade kant), och kant och kylare på hyllan om Jakob
     vill ha den.
   - **Talet** (`dealer-0b`): läpparna är omlagda tre gånger och införda (`019507f`, `9bb013f`, `9e6aa91`; Kända
     brister, Läpparna). Hennes röst på en telefon, genom sidans eget ljud när webbläsaren nekar filmen att höras, är
     byggd och införd (`3de51b5`; Kända brister, "Hennes röst på en iPhone") och väntar på Jakobs telefon; håller
     grunden gör talbanan en liten ljudfil bredvid varje talfilm, så att rösten är i takt redan första gången.
     Kvar utöver det: filmer i 30 rutor per sekund som inte kan bära tal (en till två timmar, inte beställt), "Du
     dubblar" över varje plats egen giv (inte beställt), och det betalda provet med en annan läppsynkmodell, som
     väntar på saldot ("Öppet hos Jakob", punkt 1).
   - **Trailern och filmen före spelet** (`dealer-1e`): slutet i spelets egen scen blev det han kallade "Svinbra",
     och den korta trailern (47 s) går nu före spelet på kopian bakom dörren `/trailer` (SYSTEM, "En film före
     spelet"; Arbetsyta). Övergången är granskad två gånger av oberoende granskare: den första versionen fick 3/5 på
     dator och 2,5/5 på stående telefon (huvudet hoppade 8 bildpunkter när repliken började, och på telefonen syntes
     hon dubbelt), den rättade 4/5 och 3,5/5, "kan visas som den är"
     (`D:/dealer-scratch/tmp/huvudagent11/intro-prov/granskning-2/DOM.md`). Det som är kvar står i Kända brister.
     Ingen granskare har hört filmen, och startbilden och Hoppa över är inte sedda igen efter rättningen (de är
     oförändrade). Verktygen som läser varje ruta webbläsaren ritar ligger i
     `D:/dealer-scratch/tmp/huvudagent11/look/` (`skjut-intro-toning.mjs`, `blad-ur-rutor.mjs`, `hopp-i-rutor.mjs`).
   Saldot hos Runway var 516 krediter kl. 21.03, och ingen session har rapporterat en betald beställning sedan dess
   (saldot är inte läst om); läs det före en beställning. Mall 8
   gäller, med meningen om enfärgat kort; omgång 12 till 15 står i handboken §5. Pamela är pausad (Jakob 2026-11-12:
   "Vi pausar Pamela när vi är klara. Sedan går vi vidare med Paow.").
1. **Studion** (`http://127.0.0.1:4319/studio/`) är skalet, med bland annat vyerna Scen, Karta, Primära, Jämför,
   Granska, Prov, Placering, Material, Beställ, Protokoll och Casino; gamla labbet nås med `lab.html?gamla=1` tills
   Modeller (`props.html`) och Ljud (`sound.html`) har flyttats. Den låsta kopian åt Jakobs chef ligger ute (Arbetsyta)
   och publiceras om med `node tools/publish-studio.ts --kor` efter varje push som ska synas.
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
- **Domar åt honom, och ingen kö** (2026-11-13). På natten: "jag måste sova och du får granska och godkänna alla klipp".
  Kl. 15.50, med en bild av kön i Granska (42 väntande) och på väg ut: "jag vill nu för jag ska iväg att du godkänner
  allt videomaterial som innehåller de där kriterierna så vi får en roligare grundloop i idle/ankjare 1" och "Med andra
  ord vill jag inte se en sån här lista när jag är tillbaka!". Huvudagenten och en oberoende granskare dömer alltså det
  som annars skulle vänta, med `node tools/review-put.ts`: domen är märkt som inte hans, väntar inte i hans kö (Granska
  visar den i Alla under Dömda åt dig) och ersätts av hans eget beslut. En tagning han själv har dömt rörs aldrig, och
  Primär sätter bara han. Regeln står i AGENTS.
- **En linje för korten** (2026-11-13 kl. 15.47): "Angående förvalda och icke-förvalda kort, är jag osäker på vad som
  ska gälla. Jag vill bara att det ska bli en linje och att allt ska anpassas till en standard som passar med det som
  för närvarande finns i systemet, om det ens behövs. Jag har svårt att förstå vad som gäller för korten." Och till en
  bild av kortet vid skon: ".. och korten vafan. De är ju itne bra". Huvudagenten bestämmer linjen åt honom och visar
  resultatet, inte valen: ritade kort på, en storlek (1,2), en brytare i spelet (SYSTEM).
- **Förvalen han sade ja till** (samma svar: "Jag håller med om allt annat du nämnde, så jag kan acceptera det rakt
  av"): ljuset utjämnat mellan filmer, liv i överkroppen och kopparna i relingen (de två sista först när de är sedda
  rena i bild); nästa försök för plats 6 från ankare 2.2, kandidaten för ankare 2.2 gäller, en runda ska kunna gå via
  2.2; projektet `dealer` som v0 skapade hos Vercel tas bort. Givarna i dubbel fart hörde dit, men det tog han
  tillbaka samma kväll (nästa punkt).
- **Farten** (kl. 19.13, efter att ha sett kopian): "Dessutom har jag tyvärr bett om att snabba upp vissa typer av
  rörelser, kanske till och med vissa `talk clips`, vilket har resulterat i att hon är jättesnabb i vissa lägen och
  ser konstig ut." Förvalet för `filmTempo` är 1 (som filmat) sedan dess, och reglaget Givarnas tempo står kvar. Med
  förvalet 2 gick också ingången, utgången, hålkortets vändning och gången vid dealerbyte i dubbel fart; talfilmer
  har aldrig gått fortare än filmat. Det andra som gick fortare än filmat var en vilogest som spelades klart i 1,5
  gånger farten när en giv väntade; den spelas nu klart som den är filmad (`IDLE_RULE.exitRate` 1), så inget i en
  runda skyndas längre från början. Förslag som väntar på hans öga (scenbanan): fart bara på givar och returer, och
  hellre 1,3–1,5 än 2.
- **Korten börjar om** (kl. 19.13): "På sajten har det nästan blivit värre, eftersom korten fortfarande renderas på
  [Vercels] URL. Du kanske kan skicka en underagent ... för att undersöka vad som orsakar detta. Den bör också gå
  igenom ignorerade sökvägar för att hitta orsaken till att vi inte kan behålla det blått och gult, så att vi kan
  börja om med att hantera överlägg, pålägg och underlägg med kort." Det som följde samma kväll: en oberoende utredning
  (`D:/dealer-scratch/tmp/kortutredning/RAPPORT.md`), en enda brytare för ritade kort, Paow som den dealer en ny
  besökare möter (kopian öppnade på den pausade Pamela), och omstarten som pålägg och underlägg, byggd i labbet
  (Kända brister, Korten). Hans ord prövades också
  som linje i spelet i en timme (filmens eget kort i handen); en oberoende granskare gav den 2,5/5 mot 3,5/5 för det
  ritade kortet, så spelet ritar kortet som förut tills han själv har sett båda. Huvudagentens läsning av hans ord,
  inte hans ord: han bad om orsaken och om en omstart, inte om att kopian skulle visa gula och blå kort under tiden.
  Hans tidigare ord om en linje (punkten ovan) gäller som form: en linje, inga val åt honom.
- **Läpparna** (kl. 20.10 till talbanan, om talfilmerna i spelet): "Denna lipsync är typ sämre, bara underläppen som
  pratar". Sedan dess lyfts hennes egen överläpp med munnens öppning (docs/TAL.md, "Lyftet"), i alla repliker och i
  munlapparna, omlagt tre gånger samma kväll och natt (`019507f`, `9bb013f`, `9e6aa91`) och varje gång sett av
  oberoende granskare i blinda par. Hans egen godkända `paow-tal-blackjack-sv-04` rörs inte och går före.
- **Filmen före spelet** (kl. 21.23 till trailersessionen, om trailerns slut i spelets egen scen): "Svinbra slut. Bind
  ihop en ny video till ca 45 sek. men sedan så att man övergår till henne i URL:en på vercel. kanske genom en ny
  knapp. måste dra, men skulle va coolt". Huvudagenten har läst orden i den sessionens egen logg. Det blev dörren
  `/trailer` på kopian (SYSTEM, "En film före spelet"). Hans beslut från 2026-11-12 att trailrar hålls utanför kopian
  gäller i övrigt: bara den här filmen går upp, som spelets egen film, och trailerproven i Prov är fortfarande
  spärrade (`data/studio-release.json`). Huvudagentens läsning, som han kan rätta.
- **Hans ord 2026-11-14 kl. 15.10–15.35**, från telefonen, sedan han sett kopian (alla till huvudagenten; han läser
  inte långa svar just nu och vill ha `KLAR.txt` när allt är gjort):
  - **Inget lösenord:** "Se till att den inte är lösenordsskyddad." och "sätt en agent som tar bort lösenordet "john"
    för sidan nu". Kopian är öppen sedan kl. 15.27 (`DEALER_OPPEN=allt`; DRIFT); boten kräver fortfarande lösenordet,
    eftersom den kostar per fråga (huvudagentens val, som han kan ändra).
  - **Läpparna:** "Säg till berörd agent att se till att lipsynken görs så det blir bättre. Hon får lixom lite som typ
    clown-mungipor. kanske är formatet av bilden större än det som används. kanmna komprimpera videos som används
    enbart för att skapa områden som kanske är mindre högupplösta då jag vet att detta är kanska krävande. […] Eller
    att området blir större där lipsynket är. Jag kan för lite för att ha en åsikt." Gick till talbanan samma minut.
  - **Fler tatueringar**, med ett foto: "Kvinnan på och i videon har också mer tatuelringar. kan man göra så det blir
    mer eller se som denna kvinna har på videon skulle det varar bättre." Fotot ligger i `private/referenser/` och är
    inte skickat någonstans; förslaget står i Prov `paow-fler-tatueringar`. Kl. 15.45, om förslaget: "Jättebra med
    händerna. kanske svårt, men hon har väl mindre händer? Aja, tänkte framförallt på videon i början när man ser
    hennes rygg". Alltså: ja till tatuerade händer (och helst mindre händer) när hennes ankare görs om, men först
    trailerns början, där hon syns bakifrån; den gick till trailersessionen samma minut.
  - **Korten:** "Ang spelkorten så ser de inte skitbra ut heller än så länge." Underlägget är därför på från början
    sedan samma timme (`662b271`), och en kortbyggare arbetar med felen som är kvar.
  - **Rummet bakom henne:** "Bakgrunden som vals och väljs i filmen skulle jag vilja få lite mer rörelse i elelr så.
    kanske att man se någon som reser sig från borden i bakgrunden och kommer tillbaka en minut sere. Det finns en
    man/kypare. han står helt stelt i bakgrunden hela tiden tex.. ja du fattar. Du har fria privilegier och kör på.
    men se till att dokumentera coh städa och så vidare." Gick till scenbanan.
  - **Spelets knappar på telefon:** "markeröverlägget på mobil coh framförallt på lite skärm och det måste göras
    smartare och mindre så det inte täckeer bla vart marker ska in osv", "..men liggande också ser jag." Hans
    skärmbild: en sida på cirka 370 × 660 bildpunkter där inte en enda insatsring syns; de ligger under knapparna.
  - **Vilans slinga:** "Flera animationer kommer sedan inte in automatiskt i "grundloopen" idle eller vad vi nu kallar
    det." och "Den där hon dricker från undersidan av bortet är bra, och säkert andrasakeer som ska in i
    grundloopen". Regeln är ändrad (`d4137cb`; SYSTEM, Vilan). Champagnefilmen är alltså bra som den är; frågan om
    hylla eller ny tagning är struken.
  - **Smått:** "Ser lite grönhet i hennes hår i blackjagcken efter också.. marginellt, men lite och att vissa olika
    hopp görs. inte farlgigt, men lite." Och om natten: "I övrigt är jobbet bra gjort!"
  - **Svart efter filmen** (kl. 16.24, genom en session som hans bot startade medan han satt vid telefonen): "Den nya
    videon som overgar till spelet blir bara svart nar man ar inne i spelet." Kända brister, "Spelet på hans telefon".
- **2026-11-17 cirka kl. 18.20–18.50, till huvudagenten, om läpparna och beställningar:**
  - **Huvudmålet för läpparna:** "Jag vill ju kunna använda mig av min runpod framgent för att skapa realtidslipsynk.
    Det är det som är huvudmålet. hennes talade replikklipp är av mindre relevans, även fast dessa också ska sitta
    såklart." Läget när han sade det: modellen som går i realtid (MuseTalk, Scouts renderare) är den vars mun han inte
    tycker om; provet med en annan modell hos Runway (Seedance, Prov `paow-annan-modell`, 180 krediter) kallade han
    "skitbra", men den går inte i realtid och inte på RunPod. Talbanan skriver en plan för realtid
    (`D:/dealer-scratch/tmp/tal/realtid/PLAN.md`), med en uppslagen lista över modeller som går i realtid på egen GPU.
  - Om provet med bredare mun: "Nej. Hennes mungipor är helt stela vid sidan" (i Beslut) och "för hennes mungipor
    hänger inte med. Det måste vara runpod-lipsynk-ytan som är fel?" Mätt av talbanan: ytan räcker; det är vår
    inläggning som väljer bort modellens gipor sedan 2026-11-13, eftersom modellens mun är mindre än hennes.
  - **Hans egen beställning i Beställ** kl. 18.14: `paow-giv-2-2-p4-02` (släp från ankare 2.2 till plats 4 och
    tillbaka, WAN 3, två tagningar, 240 krediter). Han frågade varför den kostar 240, om texten är bra och hur lång
    tid given tar, och tänkte högt: beställa rörelsen långsamt och spela den snabbare i spelet, och granska i halv
    fart ("detta är bara vad jag tänker"). Protokollet säger att släp från 2.2 med WAN 3 har fallit till plats 4
    (0 av 2) och hållit till plats 1; en ordinarie beställningsagent lägger hans order.
  - **En yta för allt:** "Vart är min 'labb'-yta där jag kan se en typ avatar/siluett och sedan kort och bord, jag
    kan ställa in allt som jag vill, sedan ska jag kunna lägga en beställning för en film. Tex 'A2.2 till P3C2 och
    tillbaka till A2.2'?" En underagent bygger om Ny beställning med bilden först (inte en ny sida).
  - Trailerns nya rollblad: "är mellersta bilden fel i och med att huvud/framsida kropp är helt fel som sagt. Hon ser
    inte riktgit ut som hennes keystonebild heller"; görs om med keystonen som förlaga.
  - **Filmer i Prov visas utfrätta i hans flik** (vitt ansikte) medan stillbilder och spelet ser rätt ut: hans skärm
    eller webbläsare (troligen HDR), inte filerna. Lägg alltid en stillbild bredvid en film han ska döma.
- **2026-11-17 cirka kl. 17.30–17.45, till huvudagenten** ("kan jag kanske tala med dig hela tiden så får du delegera"):
  han talar med huvudagenten och huvudagenten delegerar. Om läpparna, med två utsnitt av hennes mun: "Dock är antingen
  hennes läppar för stora i grunden eller så är läpparna för små när hon väl talar. Kanske är det så lätt? […] de
  kanske utgår från en annorluda baseline av hennes mun"; provet på det ligger i Prov `paow-baslinje` och väntar på
  hans ja eller nej. Svar på frågorna: "Punkt tre, ja, foton får skickas." (hans foto av den tatuerade kvinnan får
  skickas till bildmodellen som förlaga); "Punkt fem, ja, du får göra det för 105 krediter." (andra provet på
  ryggtatueringarna i trailern; gått till trailersessionen); om Pamelas filmer på sajten: "Jag vill ha kvar dem.";
  om tatuerade händer för skattade 7 000 krediter: "jag förstår inte varför. Förklara." (inget ja än); "vi är
  inloggade på `runway`" (saldot läst kl. 17.45: 10 052 krediter). Han bad också om en bättre yta för prov och
  granskning, "så att jag kan enklare typ veta vad jag ska ta ställning till": sidan Beslut i studion byggs.
- **2026-11-17 cirka kl. 17.15, till scenbanan, sedan han tittat på datorn** (Chrome på Windows; hans skärmbild av
  `/trailer?diagnos=1` visar "kö: går · sträng nej · nekade 0" och hel bildyta): "I trailern:
  'https://dealer-lake.vercel.app/trailer' så är lipsynk sämre. 'http://127.0.0.1:4319/studio/prov/?prov=monaco-liv-2'
  tror jag dock har bättre lipsynk och bakgrunden är bättre! 'ttp://127.0.0.1:4319/studio/prov/?prov=har-utan-gront' -
  ja det gröna är borta. Ang tatueringarna så är det bättre! "underlagg"- kan inte klicka på ngn länk, 'Paows mun när
  hon talar' hennes mungipor måste som sagt med. Ang vad som blir svart elelr inte ser jag ingen skymt av, mne då
  testar jag på datorn". Alltså: Monacos bakgrund och håret är bra; **mungiporna är inte lösta i hans ögon** ("måste
  som sagt med"); läppsynken på kopian kallar han sämre än i provfilmen (kopian hade fått de nya läpparna kl. 17.05
  och 17.08, strax innan han tittade; till talbanan samma minut kallade han dem "värre än förut", och de togs ur
  spelet igen); det svarta spelet syns
  inte på datorn och är inte prövat på telefonen. Till trailersessionen samma stund: han har fyllt på Runway.
- **2026-11-17 kl. 16.35:** "Vad är sttus? Varit borta ett par dagar och nu bytt konto". Arbetet hade stått sedan
  2026-11-14 kl. 17.15; sessionerna fick nya adresser (Vem äger vad), och Runways koppling kräver ny inloggning.
- **Kopian till chefen** (kl. 15.38 till talbanan): "när jag vill kunna komma till en supenekle mockupsida med
  lösenordet "john". Sedan valet att spela i casinot eller komma till studio/labbet … Eller bara samma radda av
  alternativ som finns på vänsterspalten". Och kl. 16.30 till scenbanan: "Se nu till att inga luckor i nodträdet
  finns, har du pushat så ma nkan spela till vercel? Min chef behöver se ngt". Kopian är uppe (Arbetsyta); luckorna
  står i "Öppet hos Jakob", punkt 1.
- **Hon ska röra sig mer när hon delar ut** (2026-11-13): "jag vill i allmänhet att paow rör sin kropp och huvud och SIN
  högerarm aningen mer när HENNES vänsterarm dealar." Mall 7 (`SAY.moveOwn`, `SAY.moveBoth`).
- **Returen efter en tvåhandsgiv** (samma ord): "OM hon har någon deal där hon använder sin vänster och högerarm så
  måste retreat/tillbakagången vara annorlunda då den andra armen är den som är utsträckt." Mall 7 (`SAY.backPass`) och,
  i rundan, en retur som kommer tillbaka med den hand som är ute (`motion.releaseHand`).
- **Budgeten** (2026-11-13 cirka 07:25): "jag ger 6000 mer i budget eller till krediterna tar slut för runway". Samma
  dag cirka 13:30, för nya vilor, kaffet, vinkningen, fingrarna och givar från ankare 2.2: "Du får 5k i budget och
  godkänner själv efter granskning". Och cirka 15:13, när huvudagenten sade att saldot kunde hamna runt 2 300: "Nej du
  får obegränsat i budget!" Dagstaket och golvet är därför borttagna i praktiken (`data/order-policy.json`: taket en
  miljon, golvet 0); 400 per beställning står som skydd mot ett misstag. Kl. 16.37: "inga tak idag". Saldot sätter gränsen tills han
  fyller på.
  "Godkänner själv" gäller de filmerna: beställningarna godkänns på hans uppdrag, och domarna blir preliminära tills
  han har sett. Betalda anrop utanför Beställ rapporteras fortfarande med belopp.
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
  står som `"jakob"`), inom gränserna i `data/order-policy.json` (sedan 2026-11-13 kl. 15:13 utan dagstak och golv, se nedan;
  högst 400 per beställning). Ramen, som huvudagenten har satt och han kan ändra: allt beställs genom
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

- **Korten** (Jakob 2026-11-13: "Det lixom kletar fast sig på korten", "linjer flyger dit och dit", ".. och korten
  vafan. De är ju itne bra", och kl. 19.13 "nästan blivit värre ... behålla det blått och gult ... börja om"). Spelet
  ritar kortet hela vägen, också i hennes hand (SYSTEM, "Ritade kort"). Samma kväll prövades hans ord som linje i en
  timme (filmens eget kort i handen och i skon, ritat när det ligger; finns kvar som adressordet `kort=liggande`), och
  en oberoende granskare såg båda i hela rundor i filmad fart: ritat i handen 3,5/5, "kan skickas som den är", och
  filmens eget 2,5/5 (`D:/dealer-scratch/tmp/huvudagent11/chefsfilm/granskning-4/DOM.md`, bladen bredvid). Utredningen
  bakom (`D:/dealer-scratch/tmp/kortutredning/RAPPORT.md`; bladet åt Jakob är Prov `korten-tre-satt`) säger varför
  ingen av dem blir bra som den är: det ritade kortet i handen följer ett färgspår som blir en kil under fingrarna och
  kräver exakt takt, och filmens eget kort har ingen valör och är borta i nästa film. Omstarten är pålägget: filmens
  eget kort färgas om i filmens egna bildpunkter (baksidan gul till mörk, sedan framsidan blå till papper, sist
  valören på liggande kort; skattat 2,5–3 dagar med granskning). Kortbyggaren (underagent till huvudagenten) arbetar i
  arbetskopior i `D:/dealer-scratch/tmp/kortbyggare/` och lämnar varje steg som en mapp med LASMIG; pålägget går in i
  spelet först när Jakob har sett det i Prov. Steg 1 (baksidan mörk) och steg 2 (framsidan papper) är byggda: mapparna
  `steg-1/` och `steg-2/` (steg 2 innehåller steg 1; filerna passar trädet, som inte har rört dem sedan `e4f3385`) och
  Prov `palagg-baksidan`. En oberoende granskare gav pålägget 3/5 (baksidan 3,5, framsidan 3), mellan filmens eget
  kort (2,5) och det ritade (3,5): "kan läggas fram som ett valbart prov, inte redo att ersätta det ritade kortet".
  Felen sitter i vändningens rutor (trappiga, tvåfärgade och halvgenomskinliga kanter), i en svart kant runt
  fingrarna på papperet och i gula hörn där zonen missar hålkortet (`granskning-palagg/DOM.md`).
  **Underlägget** (steg 3, natten mot 2026-11-14) använder samma omfärgning under det ritade kortet i stället för
  i dess ställe: det ritade kortet ligger kvar överst som i dag, och bara det som sticker ut av filmens kort bredvid
  blir mörkt eller papper. Det byggdes avstängt, bakom adressorden `cardBack=dark&cardFace=paper` på spelsidan
  (`cardWords` i `src/game-film.ts`; `back` och `face` per del i scenen), och är förvalet under det ritade kortet
  sedan 2026-11-14 (`662b271`, `UNDER` i `src/card-overlay.ts`; `cardBack=film&cardFace=film` visar filmens
  färger igen). Mätt av
  byggaren på varje ruta i tagningarna, i dag mot underlägg: dealerns gula spets 5 rutor → 0, den gula blixten vid
  plats 1 2 → 0, den blå kanten när hålkortet vänds 1 → 0, hålkortets gula remsa 14 → 3 (kvar som en mörk skugga
  under fingrarna). Oförändrat: den tunna linjen på kant och den taggiga vita fingerkanten, som hör till det ritade
  kortet och nyckeln. Inte mätt: vad shadern kostar i det levande spelet (sexton fler texturläsningar per bildpunkt
  nära hud). Bladen och filmen: `D:/dealer-scratch/tmp/kortbyggare/steg-3/` (`blad/`, `film/underlagg-givar.mp4`,
  `LASMIG.md`). Reglage i Scen (`cardBack`, `cardFace`) finns inte än.
  En oberoende granskare såg sedan två hela rundor ur spelet utan att veta vilken som var vilken (tagningarna
  `chef-jakob-1-1x-v9-underlagg` och `-v8`): 3,75/5 med underlägget mot 3,5/5 som i dag, lika bra eller bättre vid
  alla 14 kort. Den gula remsan vid hålkortet går från 17 rutor till en liten fläck i 4; dealerns gula spets, den
  gula blixten vid plats 1 och fläckarna vid 29 och 78 s är borta; och ljusa kanter längs kortet på fem ställen som
  ingen hade listat försvinner också (`D:/dealer-scratch/tmp/huvudagent11/chefsfilm/granskning-6/DOM.md`). Prov
  `underlagg` visar det för Jakob.
  **Steg 4** (`33b164a`, publicerat 2026-11-14 kl. 17.11): hålkortets ritade kort följer filmens kort under hennes
  hand (spåret för `paow-giv-2-1-d-c2-03-01` är lagat och vilar från ruta 80 i stället för 57; det gamla ligger i
  `D:/dealer-scratch/tmp/huvudagent11/kort-forval/spar-fore-steg-4/`), och skons fönster står mörkt. En oberoende
  granskare såg två hela rundor ruta mot ruta utan att veta vilken som var vilken (`chef-jakob-1-1x-v10` mot
  `-v9-underlagg`; bladen i `D:/dealer-scratch/tmp/huvudagent11/chefsfilm/blind-steg4/granskning/`) och valde
  rundan med steg 4, 75 % säker: hålkortet 3,5/5 mot 3/5 (den gula fläcken under ring- och lillfingret och den vid
  pekfingret är borta) och skons fönster 5/5 mot 3/5 (utan steg 4 slog fönstret om till grått och tillbaka i en enda
  ruta vid fyra givar). Kvar med steg 4: hålkortet ligger dolt under hennes fingertoppar i cirka 0,6 s innan det
  glider på plats, och en svag gulaktig kant i kortets högra ände i fem rutor. Spelarnas kort och vändningen är lika
  i båda rundorna.
  - Syns i dag med ritat kort i handen (granskarens tider i `chef-jakob-1-1x-v6`): vid hålkortets giv (99,2–99,7 s)
    täcker det ritade kortets baksida bara en del av filmens gula kort, så en gul remsa syns under fingrarna; filmens
    färg sticker fram bredvid det ritade i sex ögonblick (en gul spets på dealerns kort vid 50,0 s, en brun och blå kant
    när hålkortet vänds vid 115,3–115,5 s); en tunn mörk linje medan kortet står på kant, minst fyra gånger; en hackig
    fingerkant över kortet vid 72,5 s; skons fönster går från svart till mörkbrunt vid fyra klipp. Kortagentens
    oskrivna steg för vändningen ligger i `D:/dealer-scratch/tmp/kortagent3/stage3/`.
  - Syns med `kort=liggande`: gula och blå rektanglar i handen i varje giv; orange och bruna stråk när filmens kort
    vänds (12 givar, längst 114,4–115,2 s: filmens nyckel tar kortets färg nära skärmens gröna); det andra kortet till
    en plats läggs av filmen ovanpå det första och hoppar sedan ett steg åt sidan; hålkortet är mörkt på bordet och
    gult när vändfilmen börjar. Bytet när kortet lägger sig är en toning sedan samma kväll (kortbyggarens steg 0,
    granskat: bättre i fem tagningar av sex, och hålkortets giv behåller bytet på en ruta).
  - Dealerns första kort ligger i filmen med baksidan upp 1,7 gånger för stort innan det vänds (filmens eget fel i
    den tagningen). Pamelas filmer lägger kortet i 0,89 av planens storlek; hon är pausad.
- **Produktionslistan och fallna tagningar:** raden för plats 6 står som "levererad, efterarbetas och granskas"
  fast alla fjorton tagningarna är bedömda och fallna. En tagning som beställaren själv mätte bort ligger kvar på
  MÄTT med domen i kvittots `review` (GRANSKAD är den oberoende granskarens), och listan räknar en order som på
  väg tills varje tagning är GRANSKAD eller INFÖRD (`IN_FLIGHT` i `tools/produce.ts`). Rättningen: en tagning med
  dom i kvittot räknas som avslutad, så att raden åter visar vad som kan beställas.
- **Det bandet inte kan än** står samlat i `tools/dealer-line.md` ("Vad bandet inte kan än"): ett tredje eller fjärde
  kort, helfiguren, ankare 2.2, landningsbild, keystone och ankare 1 som steg i Beställ, och retur till vila från en
  plats.
- **Orden för kortets sidor** är en öppen fråga. Jakob 2026-11-13: "Baksida kan betyda olika saker, som baksidan på ett
  kort, men det kan också referera till undersidan." Mall 6 sade sidorna efter färg och föll i båda paren i omgång 6;
  mall 7 säger åter "its back is yellow and its face is blue" (`72e4f08`).
- **Kling 4:s färger** läses som Python läste dem: en BT.709-märkt film som BT.601, så att efterarbetet ger samma bild
  som de godkända tagningarna; en korrekt avkodning skulle flytta färgerna något, och det är inte avgjort
  (`tools/film-after.ts`).
- **Paow ser lite smal ut:** bildmodellen gav henne Pamelas kroppsbredd under ett huvud som är 8,7 % högre (mätt
  2026-11-13, `D:/dealer-scratch/tmp/huvudagent11/proportioner/`); bilden är inte hoptryckt i pixlarna.
- **Rösten:** spelet väljer talfilmerna med rösten Paow (`src/game-page.ts`, `data/speech.json`); nattens 25 med rösten
  Jessica ligger kvar i banken och spelas inte. Rösten ligger i Kevins ElevenLabs-konto, och nyckelradens namn står i
  registret, aldrig nyckeln (docs/TAL.md, "Rösten").
- **Läpparna** är omlagda tre gånger efter hans ord om överläppen (STABILT 12, 13 och 14; docs/TAL.md, "Kvaliteten");
  en fjärde omläggning om mungiporna (STABILT 16 och 17, 2026-11-17) underkände han samma dag och den är uttagen
  (Öppet hos Jakob, "Läpparna"). Mungiporna är alltså som han såg dem 2026-11-14. Granskarna
  gav den andra omläggningen 4/5 i 29 filmer av 30; den tredje bytte bara de elva repliker där en granskare kallade
  den nya bättre (en sluten mun är sluten: läppen vilar i tysta rutor), och arton står kvar. Banken har alltså
  repliker lagda med två recept, och en ny tagning av en replik som inte byttes går in först efter granskning. Kvar i
  granskarnas ord: vid stora öppningar står överläppen i sitt högsta läge nio till tolv rutor medan käken rör sig,
  och tysta pauser talas igenom med öppen mun. Munnen är fortfarande rendererns: matt, mjukare underläpp, strimmiga
  tänder. Talbanan gör inga fler prov på läggningen utan Jakobs ord. Ingen granskare kan höra; läppsynken mot rösten
  har bara Jakob bedömt. `namn` hörs som "Pau".
- **Hennes röst på en iPhone är byggd men inte prövad på en telefon.** En talfilm är en film med eget ljud som
  filmkön startar från en timer. Safari på telefon låter en film höras bara när den startas inne i en beröring (före
  iOS 17 per element; från 17 räcker en beröring för de element som fanns då), så starten nekas. Två ändringar natten
  mot 2026-11-14: en nekad talfilm spelas ljudlöst i stället för att stå kvar på sin första ruta, så rundan går
  vidare (`5ee46d2`; före det hade en replik kunnat stoppa rundan där), och rösten sägs då av sidans eget ljud, satt
  mot filmens egna rutor (`3de51b5`, talbanan: `src/page-audio.ts`, `src/scene3d-voice.ts`; docs/TAL.md, "Rösten på
  en telefon"). Munlagret tar samma ljud, väckt inne i beröringen; förut gjorde det sitt eget mitt i en ritad ruta,
  så replikerna över film har troligen också varit tysta på en telefon. Där filmen själv hörs (dator) körs inget
  nytt. Mätt i headless Chrome med en sida som nekar starter: rösten börjar 0,18–0,27 s efter nekandet, före
  replikens ljud, och ligger inom 9 ms från bilden; prövat av huvudagenten i själva spelet på båda sätten
  (`D:/dealer-scratch/tmp/huvudagent11/look/rost-reserv-koll.mjs vanlig|nekad`). Antaget, inte prövat: att Safari
  nekar med just det felet, att den avkodar ljudspåret ur filmen, och att sidans ljud väcks av beröringen. Val som
  Jakob kan ändra: hon hörs också med telefonens ringsignal avstängd, som en films eget ljud (`playback` i
  `src/scene3d-view.ts`). Känt: första gången en replik sägs på en sådan telefon hämtas filmen en gång till för
  ljudets skull, så rösten kommer in en bit in i repliken; en liten ljudfil bredvid varje talfilm tar bort det och
  görs när en telefon har visat att grunden håller. Frågorna till Jakob står i "Öppet hos Jakob". Filmen före spelet
  startas i själva trycket på Spela och berörs inte.
- **Spelet på hans telefon blev svart efter filmen före spelet** (hans ord 2026-11-14 kl. 16.24). **Hans svar i Beslut
  2026-11-17 kl. 18.43 på "Prova trailern på telefonen. Syns filmen?": "Fungerar".** Felet är alltså borta på hans
  telefon med koden från `b8f6565` och framåt; vilken av ändringarna nedan som tog det vet vi inte, och det återskapades
  aldrig hos oss. Det som följer står kvar som bakgrund om det kommer tillbaka.
  - Känt om telefonen: skärmbilden kl. 15.21 visar en iPhone med Safari i strömsparläge på `dealer-lake.vercel.app`,
    och där syns spelet som det ska. Kl. 15.29 skrev han om håret "i blackjacken efter", så vägen genom filmen
    fungerade då, och inget publicerades mellan 15.32 och hans ord 16.24. Telefonens eget läge kan alltså spela in.
  - I en headless Chrome (390 × 844 och 1920 × 1080, riktigt tryck) är spelet efter filmen inte svart, varken med
    den kod han såg eller med dagens.
  - Ändrat och publicerat (`b8f6565`, `2d66606`, `736bae1`; SYSTEM, "Filmkön" och "En film före spelet"): en
    filmstart som webbläsaren nekar görs om i besökarens nästa tryck (förut tappades den); filmlagren ritas inte förrän
    en film har gett sin första bild (förut ritades båda svarta över rum och bord); under filmen före spelet står
    hennes vila hållen och rummets film är av, så en film avkodas i stället för tre; potten håller fem filmelement på
    en pekskärm i stället för åtta; rummets film begär sin start en gång i stället för sextio gånger i sekunden.
  - Mätt i en attrapp (en webbläsare som nekar varje filmstart utanför ett tryck;
    `D:/dealer-scratch/tmp/huvudagent11/look/strikt-koll.mjs`): den kod han såg stod för gott på talfilmens första
    ruta efter filmen, och ett tryck hjälpte inte; dagens går vidare en film per tryck. Bilden var aldrig svart i
    attrappen, i någon av dem. Är hans telefon så sträng hackar spelet alltså fortfarande: varje film som görs efter
    ett tryck väntar på nästa tryck.
  - Skärmbilden av `/trailer?diagnos=1` skiljer tre läsningar. "sträng JA" och rader med "nekad": webbläsaren nekar
    starter, och nästa steg är en fast uppsättning filmelement som öppnas i ett tryck och återanvänds för nya filmer
    (inte byggt). "bildyta: FÖRLORAD": telefonen tog bildytan (minne), och nästa steg är mindre filmer för telefon
    (vilofilmerna är 1764 × 1174 i 21 Mbit/s; scenbanan skattar att en halverad kopia skär nedladdningen med fyra
    femtedelar). "på skärmen: … står 0.00" med "hållen vila ja" och svart där hon ska vara: en film som aldrig har
    spelat ger ingen bild på telefonen, och nästa steg är att den hållna vilan spelar till sin första visade ruta,
    stannar och spolas tillbaka (prövat utan tillbakaspolning och struket: filmen hann till ruta 21 medan sidan
    startade).
- **Hopp mellan filmer** (hans ord 2026-11-14: "och att vissa olika hopp görs. inte farlgigt, men lite"). Scenbanans
  mätning i filerna 2026-11-17: av 3 474 möjliga byten flyttar sig ansikte och händer 0 bildpunkter i 98 %. Hoppen
  sitter i returen efter en runda: de tre returerna slutar 2–3 bildpunkter från vilans första ruta och 4–9 nivåer
  ljusare. Champagnefilmen (`paow-vila-17-02`) är cirka 5 nivåer mörkare i ansiktet än de andra vilorna och ingången
  `2-1-02-01` cirka 5 ljusare; det är vad Jämna filmernas färg är till för, och hur mycket som blir kvar i spelet
  är inte mätt. Det filerna inte förklarar bör sitta i bytet självt: en film som inte står färdig när den tas in och
  tappar sina första rutor (6 av 16 starter 2026-11-13). Mätt i webbläsaren av scenbanan 2026-11-17 (tolv körningar):
  nästa vila beställdes först när filmen före var slut, stod nästan aldrig färdig, och bilden stod på den förra
  filmens sista ruta 0,05 s mellan två vilor och 0,08–0,18 s efter en replik eller en retur; en första ruta tappades
  i 19 % av starterna. **Rättat samma kväll för vila efter vila och vila efter replik:** nästa vila beställs medan
  filmen före ännu spelar (`restFilm` i `src/game-film.ts`, en kvarts sekund in), så att kön har den väntande på sin
  första ruta. Mätt efter (fyra körningar, dator och telefonstorlek): vila efter vila står färdig i 12 av 12 starter,
  bilden står 33 ms (en ruta) och ingen ruta tappas; vila efter replik 50–83 ms (förut 84–133). **Kvar:** vila efter
  en retur (83 ms, inte färdig, en tappad ruta i en av fyra): rundans kedja väntar på sitt eget slut, så vilan kan
  inte köas bakom den på samma sätt. Mäts om med `skarv-prov.mjs` och `skarv-vila.mjs` bredvid de andra verktygen
  (`D:/dealer-scratch/tmp/huvudagent11/hopp-efter/`). Förslag, inte infört: låta en retur spela till sin sista ruta (i dag tappas tre i var ände, `IDLE_RULE` och `resolveRound` i
  `src/clip-graph.ts`, med skälet att en genererad film hoppar i sina två sista rutor). Mätt på Paows fyra returer:
  de tre sista rutorna är inte mjukare än de före (88–105 % av filmens egen skärpa), `utgang-baklanges-01` landar då
  på ankaret (ljussteget 5,6 → 0,6 nivåer), de två `utgang-2-2` tappar sina 2–3 bildpunkter, och `utgang-01-01` vinner
  inget; ljussteget i de tre WAN-returerna (4 och 8 nivåer) är tagningens egen nivå och ändras inte av slutrutan
  (`retur-slut.mjs` bredvid de andra verktygen). Alla byten
  ligger i `D:/dealer-scratch/tmp/levande-objekt/ljus/hopp/skarvar.json`; verktygen bredvid (`hopp-lista.mjs`,
  `hopp-matt.mjs`, `hopp-topp.mjs`).
- **Filmen före spelet** (`/trailer`): när trycket på Spela kommer står startbilden still medan filmen hämtas och
  tonar upp under den (median 0,72 s på dator, 0,83 s på telefon i labbet; längre på ett långsamt nät) och ger sedan
  vika på filmens ruta 12–14, ett steg på cirka 1 bildpunkt. Strax efter trycket slutar sidan dock rita i 0,35–0,57
  s i de flesta mätningar (trailersessionen, 2026-11-14; orsaken är inte funnen, och tre sessioner delade grafikkortet
  då). Stoppet faller för det mesta inne i upptoningen och syns inte; en gång av åtta kom bytet fyra rutor sent, och
  det är granskarens hopp på 4–5 bildpunkter. Två ändringar av bytet prövades och ströks, båda sämre
  (`D:/dealer-scratch/tmp/dealer-1e/intro/patches/`, `LASMIG-4.md`). Det som är värt att leta efter är vad spelsidan
  kör vid första trycket. På en stående telefon ligger filmens övre kant som en svag linje över hennes hjässa och filmens duk skymtar
  genom spelets knapprad i cirka 0,2 s medan den tonar ut. Hon sitter stilla cirka 1,25 s på dator och 2 s på telefon
  från filmens slut tills hon talar; granskaren kallar det en naturlig paus men gränsen (`INTRO_BEAT_MS` och
  `INTRO_DEFAULTS.fade` är måtten). Filmen är inspelad ur spelets egen vilobild och måste spelas in på nytt när den
  bilden ändras (SYSTEM, "En film före spelet"); det görs 2026-11-17 (Nästa steg). Med filmen som ligger ute skiljer
  hennes ansikte högst 1 bildpunkt mellan filmens sista ruta och spelet i 1920 × 1080, 390 × 844 och 844 × 390, sedan
  hennes svaj hålls på noll under filmen (`736bae1`); rummet bakom henne är däremot den gamla korta slingans.
- **Testerna utan FFmpeg:** elva tester hoppas över där FFmpeg saknas (`tools/film-after.test.ts`,
  `tools/film-fix.test.ts`, `tools/order-bring.test.ts`, `tools/register-order.test.ts`, `tools/speech-plan.test.ts`),
  tre i `tools/order-images.test.ts` kräver bankens filmer och ett i `tools/card-overlay.test.ts` kortspåren; GitHubs
  kontroll kör därför inte dem, den här datorn gör det.
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
- **Den låsta kopian** (åt Jakobs chef): `https://dealer-lake.vercel.app` (adressen han kände till) och
  `https://dealer-studio-one.vercel.app`, lösenord `john` eller `jon`. Projekt `dealer-studio` och Blob-lagret
  `dealer-studio-media` i teamet jakeminator; senast publicerad 2026-11-14 kl. 01.36 från `4ecd58f` (fyra gånger den
  natten). Ny publicering: `DEALER_LOSEN_PROV=john DEALER_LOSEN_SPEL_PROV=<spelets ord> node tools/publish-studio.ts
  --kor` (DRIFT, "Den låsta kopian på nätet"). Det tomma projektet `dealer` som v0 skapade togs bort 2026-11-13 på
  hans ja.
  - **Bara spelet** (Jakob kl. 20.45: en länk "för någon som bara vill spela", med ett eget lösenord "för bara
    casinot"): adressen `/casino` på båda adresserna leder till spelsidan ensam med hans utseende, bord och Paow, och
    ett eget lösenord (miljövariabeln `DEALER_LOSEN_SPEL` i projektet; ordet står inte i repot) öppnar spelet men inte
    studion (DRIFT). Prövat utifrån mot kopian och i en headless webbläsare i dator- och telefonstorlek.
  - **Trailern före spelet** (Jakob kl. 21.23: "så att man övergår till henne i URL:en på vercel"): adressen
    `/trailer` på båda adresserna leder till spelet med den korta noir-trailern före (`TRAILER_HOME` i
    `cloud/studio/gate.ts`: rummet Monaco med rörelse, bordet och Paow), bakom samma lås och med båda sorters
    lösenord. Prövat på kopian som besökare med spelets lösenord, i dator- och telefonstorlek, med ett riktigt
    musklick: filmen går med ljud, spelet står i filmens sista bild (0–2 bildpunkter), och hennes replik börjar 0,5
    s efter att filmen är borta (`D:/dealer-scratch/tmp/huvudagent11/look/kopian-trailer-koll.sh <spelets ord>` gör
    om kontrollen; rutorna från den sista publiceringen ligger i
    `D:/dealer-scratch/tmp/huvudagent11/intro-prov/kopian-0101/`). Inte prövat: ljudet (ingen agent hör) och en riktig
    telefon.
  - **En ny besökare möter Paow** (`FIRST_DEALER`); fram till kl. 20.01 öppnade kopian på den pausade Pamela för alla
    som inte hade valt, och det syntes aldrig i Jakobs egen webbläsare. Efter en publicering frågas kopian som en ny
    besökare: `D:/dealer-scratch/tmp/huvudagent11/look/kopian-forval.mjs`, `kopian-forsta-dealer.mjs`,
    `kopian-casino.mjs <spelets ord>` och `spar-pa-kopian.mjs` (spår och bank mot den här datorn).
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

Node 24.21.0. `npm test` är måttet och körs före varje push; antalet tester står i körningens utskrift (952 natten
mot 2026-11-14, studions medräknade; i ett rent arbetsträd utan media hoppas fyra över).
Film granskas ruta för ruta av en oberoende granskare innan Jakob dömer (`tools/film-review.md`). Spelet och 3D-scenen
prövas i headless Chrome mot 4319 med verktygen i DRIFT, en körning i taget; den som startar fönstret stänger det.
