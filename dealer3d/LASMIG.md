# dealer3d: dealern som verklig geometri

3D-banans arbetsmapp (startad 2026-11-17 på Jakobs ord: en dealer i 3D, så att olika stolar ser samma giv från sin
egen vinkel, "avskilt i en egen undermapp" tills delarna är värda att lyfta in).

## Överlämning (läs det här först; resten av sidan är uppslagsverk)

Skriven 2026-11-18 kl. 01.30 av sessionen som startade banan, som avslutar sitt pass. Högst en skärm: det som inte
ryms här står i avsnitten nedan, i commitmeddelandena eller i proven.

**Läget.**
- Vita dockan delar ut ett kort som en människa: händer och kropp avlästa ur Pamelas godkända giv till plats 4, alla
  leder inom vad en arm klarar (test), kortet ett verkligt kort. Den går att se från vilken stol som helst.
- Som förlaga åt Kling 4 (dockans film + första och sista bild) håller den på plats 4: 4/5 två gånger. Plats 5 är
  oavgjord (3/5), plats 3 föll (1/5, en tagning). Kling tar handens och kortets rörelse ur dockan, och den vilande
  handens liv, men inte huvudet: blicken måste stå i bilderna.
- Jakob 2026-11-18: ja till blicken och den friare högerhanden; NEJ till att bygga vidare på Meshy-modellen ("vita
  dockan räcker"; koden ligger kvar, lägg inget arbete där); ja till ett betalt prov från stol 1.
- Kortets vändning är sedan kl. 01.10 EN vridning kring en axel (Jakob såg en "konstig halvrotation" i de äldre
  filmerna). Förlagorna "-2" och "-3" har den äldre vändningen; "-4" är den som gäller från nu. Två betalda prov på
  den beställdes kl. 01.30 av huvudagenten: C5 (plats 4, bankens kamera; Prov `giv-forlagefilm-2`, c5-*) och stol 1
  (Prov `dealer-fran-stol-1`). Utfallet var inte läst när det här skrevs.

**Nästa steg, i ordning.**
1. Läs utfallet av stol 1 (`D:/dealer-scratch/tmp/stol-1/RAPPORT.md`) mot dockans film innan något mer görs för andra
   stolar: höll hennes utseende från sidan, och följde filmen dockans rörelse?
2. Läs C5 (`D:/dealer-scratch/tmp/giv-experiment-2/c5/RAPPORT.md`): blev vändningen renare med "-4", och bärs det gula
   kortet fortfarande längre än dockans (C3 16 %, C4 22 %)? Om "-4" är sämre än "-2": de äldre givarna finns i
   commit cb403bc.
3. Ankare 2.3 (Jakobs beställning hos MODEL, som är stängd): dockfilmen finns (`tools/pose-film.ts --pose 2.3`,
   `data/till-ankare-2-3.json`, prov `dealer-3d-till-ankare-2-3`; filen och en LASMIG.txt med alla tal i
   `D:/dealer-scratch/tmp/dealer-3d/ut/ankare-2-3/`). Vad som görs med den står i
   `D:/dealer-scratch/tmp/yt-referens/LASMIG-OVERLAMNING-2026-11-18.md`, avsnitt 2. Öppet: tummen pekar ned mot filten,
   inte upp (min läsning av närbilden), och filmen har inget test än.
4. Släpet (ankare 2.2) ur `pamela-p4-c1-drawn-deal-01`: påbörjat, se "Släpet" under Kvar.

**Väntar på Jakob.** Inget utanför Beslut.

**Var saker ligger.** Koden här; grenen `dealer-3d` i arbetsträdet `D:/dealer-scratch/tmp/dealer-3d/trad` (huvudagenten
slår ihop den i `main`); inspelningsskript, förlagor och mellanlager i `D:/dealer-scratch/tmp/dealer-3d/` (`ut/forlagor-4/`,
`ut/vinkel-stol-1-b/`, `rorelse/`); proven i `assets/proofs/dealer-3d-*`.

**Fällor.**
- Headless Chrome bara under låset: `bash D:/dealer-scratch/tmp/dealer-3d/under-las.sh <minuter> "<vad>" <kommando>`.
- Banan skriver bara i `dealer3d/` och i sina provmappar; betalt beställer huvudagenten.
- Titta på bilden innan ett tal skickas vidare: spårets fyrhörn är brus när kortet är en strimma, och en hel arm kan
  vara "inom gränserna" och ändå se ur led ut om överarmens rullning är fel.

Mappen rör inget annat i repot. Den läser `placements/default.json` (aldrig skriver) och `src/placement-model.ts`, och
använder repots låsta `three` och `sharp`.

## Vad som finns

| Fil | Vad |
| --- | --- |
| `../src/table-lens.ts` (repots `src/`) | **Bordets lins**, skriven här och lyft till `src/` 2026-11-17: en fysisk kamera för bankens bild (1764 × 1174) i verkliga meter, linsen som tal (`TABLE_LENS`), `realCardQuad` (plats i bankens bildpunkter och riktning in, ett verkligt korts fyra hörn ut) och `shoeCardQuad` (kortet som står i skons fönster). Kortplanen ritas med den (`src/card-plan.ts`); testet är `tools/table-lens.test.ts`. |
| `src/camera.ts` | Passningen: linsfamiljen `lensForFocal` (alla linser som ger kortet vid plats 4 dess storlek och form i filmen) och vad en lins gör av en sträcka i bilden. Lämnar vidare allt ur `src/table-lens.ts`. Ren räkning. |
| `src/world.ts` | Det filmen visar (`MEASURED`) och det som antas (`ASSUMED`); `filmLens()`, passningen som väljer den lins som ritar dealerns kropp i verklig storlek (ett test håller den lika med `TABLE_LENS`); planens kortplatser på filten; stolarnas ögon (`seatEye`: varje stols öga står till stolens eget första kort som bankens kamera står till plats 4:s, lika högt, lika brant och lika långt bakom, så det egna kortet landar på samma bildpunkt från varje stol; buret runt dealerkantens mitt, som först, hamnade plats 1:s kort under bildkanten). Ren räkning. |
| `src/capture.ts` | **En verklig giv lagd i rummet:** händernas 21 punkter och kroppens leder, avlästa ur en film, sätts under linsen punkt för punkt (varje punkt på siktlinjen genom sin egen bildpunkt), kortet följer filmens eget kortspår med sin hållna ände vid fingrarna, och `joints` och `LIMITS` säger vad en arm och en hand kan göra. Ren räkning. |
| `data/giv-pamela-p4.json`, `-p1`, `-p3`, `-p5` | Given lagd i rummet som tal: `pamela-p4-c1-plan-deal-02`, 120 rutor, per ruta kortet, båda armarna och händernas punkter i meter; och samma giv flyttad till plats 1, 3 och 5 (`--to P3.C1`). Skrivna av `tools/lift.ts`; sidan och testerna läser dem. Plats 6 och 7 finns inte: där går handen genom skon. `giv-pamela-p4-los.json` och `-p1-los.json` är samma två med högerhanden släppt fri (`--loose 1`, en modell). |
| `src/deal.ts` | Den första given, ritad för hand, som tidslinje: kortets läge och vridning och handens grepp för varje tidpunkt, till vilken kortplats som helst. Bana och tempo ur Paows giv till plats 4. Jakob dömde ut handens rörelse (2026-11-17); den avlästa given ersätter den i proven, och den här står kvar för jämförelse och för platser som ingen film går till. Ren räkning. |
| `src/body.ts` | Den handritade givens skelett, löst ur var händerna ska vara: hon böjer sig från höften och vrider fram axeln så långt armen behöver. Ren räkning. |
| `src/stage.ts` | Ritningen i three.js: bord, sko, ett kort med två sidor och provdockan, sedda genom flera ögon samtidigt. Två utseenden: `room` (filtbord) och `plain` (vit docka på grått, för en förlagefilm). Två källor för rörelsen: en avläst giv (handen ritas av sina 21 punkter) eller den handritade. |
| `src/figure-model.ts` | En riggad modell (GLB med skelett, som Meshy riggar) på dockans plats, ställd ur samma leder; hämtas bara när sidan ber om den. Se "Kvar". |
| `page/` | Sidan. `?motion=giv-pamela-p4` väljer en avläst giv; `?model=1` sätter den riggade modellen (`/model.glb`, som inspelaren serverar med `--model`) på dockans plats; `?eyes=1,4` ögon (en stol 1–7 eller `film` för bankens kamera), `?to=P4.C1` kortplatsen för den handritade given, `?look=plain`, `?tags=0`, `?t=1.9`, `?play=1`. |
| `../tools/python/landmarks.py` (repots Python-mapp) | Läser en film ruta för ruta med MediaPipe och skriver händernas och kroppens punkter som JSON. Resultatet är mellanlager utanför Git. |
| `tools/lift.ts` | Lägger en films punkter i rummet (`capture.ts`) med filmens kortspår, skriver `data/<namn>.json` och skriver ut vad som mättes: handens storlek, varje leds omfång, och hur kortet stämmer med filmens. |
| `tools/measure.ts` | Kalibreringen som tal: linsfamiljen, den valda linsen, ett verkligt kort på planens platser mot planens kontur, kortet i skon, stolarnas ögon. |
| `tools/camera-proof.ts` | Bilderna till provet `dealer-3d-kamera`: planens kort och verkliga kort på en filmruta, och skons kort förstorat. |
| `tools/shoot.ts` | Spelar in sidan utan labbserver: en egen filserver på 127.0.0.1 under körningen, headless Chrome med egen profil och port, en PNG per tidpunkt. Körs under det delade låset. |
| `tests/world.test.ts` | Elva tester av passningen, världen och den handritade given, utan media och utan webbläsare; läser bara `placements/default.json`. |
| `tests/capture.test.ts` | Fjorton tester av den avlästa given och av den flyttade: varje led inom mänskliga gränser i varje ruta, kortet i fingrarna tills det ligger, på kant en gång och inte vid skon, kortet på sin plats. Läser de två datafilerna. |

## Den avlästa given: mätt och modell

- **Mätt ur filmen, i 120 av 120 rutor:** var vänsterhandens och högerhandens 21 punkter ligger i bilden (dockans hand
  ligger därför på filmens hand sedd från bankens kamera), hur handen är vriden och fingrarna böjda (MediaPipes hand i
  meter ger varje punkts djup mot handleden), var axlar, armbågar och öron ligger i bilden, och kortets fyra hörn
  (kortspåret) med vilken sida kameran ser.
- **Modell:** hur långt bort den delande handleden är. Den är fäst i båda ändar av det handen rör vid (kortet i skon
  i början, filten under fingertopparna när kortet läggs) och bärs jämnt däremellan. Handens storlek kommer ur
  högerhanden, som ligger platt på filten i full syn (1,37 gånger MediaPipes hand). Axlarna går på ett klot kring
  höften, armens två ben har fasta längder, och armbågen söks under axeln och inte närmare kameran än handleden.
  Kortets lutning i djup följer av hur mycket kortare en sida ritas än den är, med regeln att det som ligger högre i
  bilden är längre bort; genom rutorna där kortet är ett streck rullas det vidare kring sin långsida.
- **Utfall** (`tools/lift.ts`): armbåge 76–129°, handled 22–49°, underarmens vridning 82° genom given, fingerleder
  −31 till 90°, armen aldrig sträckt; kortets mitt 0,9 bildpunkter från filmens kort (i mitten; högst 44 där kortet
  lämnar skon), samma sida mot kameran som spåret i 120 av 120 rutor, kortets hållna ände 29 mm från tumme och
  pekfinger (högst 38).
- **Flyttad till en annan plats** (`moved` i `capture.ts`, `lift.ts --to P1.C1`): handen och kortet är de avlästa,
  burna i sidled (inget vid skon, hela vägen när kortet är över sin plats). Fingrarnas böjning och kortets vändning
  är som de lästes, så kameran ser baksida, kant och framsida i samma rutor och kortet ligger rakt på planens plats.
  Handen svängs dessutom kring en lodlinje genom sitt grepp, med den vinkel som kräver minst av handled och underarm
  (−90° till plats 1; buren rakt över blev handleden 105° och underarmens vridning 222°, vilket testet fäller). Arm
  och kropp är där en modell: hon böjer sig från höften och vrider fram axeln (`solveBody`), armbågen hänger åt sin
  sida. Utfall för plats 1: armbåge 27–131°, handled 24–59°, underarmens vridning 68°, armen aldrig sträckt, kortet
  på planens P1.C1 inom 0,1 bildpunkt. Hennes vänsterarm går då över den vilande högerhanden.
- **Högerhanden släppt fri** (`loosened` i `capture.ts`, `lift.ts --loose 1`; filerna `-los`): i filmen ligger
  högerhanden still hela given (handleden går 7 mm), och bankens ordertexter slutar "The other hand rests on the felt."
  Jakob vill att hon rör höger arm mer när vänster delar (2026-11-13 och 2026-11-18). Det här är en modell, inte en
  avläsning: medan kortet är på väg dras handen 40 mm mot hennes axel och handloven lyfts 26 mm kring fingertopparnas
  linje, mest när kortet står på kant, och handen ligger som i filmen igen fyra rutor efter att kortet ligger (så en
  film slutar fortfarande på ankarets vilande hand). Lederna håller: handled 6–21°, armbåge 108–121°. Förlagefilmerna
  "-2" är gjorda UTAN detta; en förlaga med fri hand görs först när Jakob har sett den.
- **Blicken** (`stage.ts`): huvudet ser på kortet från skon, genom vändningen och tills det ligger, och lyfts sedan
  under 0,65 s. Också en modell: huvudets plats är avläst (det går 24 mm i filmen), vart det ser är det inte.
- **Givens slag från ankare 2.1 (nyp), i den avlästa givens rutor** (30 per sekund, 120 rutor; mätt i
  `data/giv-pamela-p4.json`, kortets mitt i bankens bildpunkter). Regeln som huvudagenten skrev till Jakob 2026-11-18
  är samma slag: nyp, bär i luften, nyckelvridning på vägen, lägg, skjut sista biten, vila.
  1. *Nyp*, ruta 0–23: tumme och pekfinger om kortet som står i skon, handflatan nedåt, handleden 126–149 mm över
     filten. Kortet lämnar skon ruta 23.
  2. *Bär i luften*, ruta 23–50: baksidan mot kameran, handleden högst 157 mm (ruta 30), kortet från (1273, 790) till
     (917, 841).
  3. *Nyckelvridning*, ruta 50–56: handen vrids från handflatan nedåt till handflatan åt sidan (tummen upp); kortet
     står på kant mot kameran ruta 53–55, lågt: handleden 60–69 mm och lägsta fingertopp 20 mm över filten, 215
     bildpunkter före sin plats. Kortet lyfts aldrig igen efter vridningen.
  4. *Lägg*, ruta 60–80: framsidan uppåt från ruta 60, fingertopparna vid filten (7–8 mm), kortet bärs och glider lågt
     från y 961 till y 1081 medan handflatan vrids tillbaka nedåt.
  5. *Skjut sista biten*, ruta 80–95: fingertopparna skjuter kortet de sista 20 bildpunkterna (y 1081 till 1101); kortet
     ligger plant och still från ruta 96.
  6. *Vila*, ruta 96–119: handen ligger kvar på kortet som i ruta 96 (förlagorna "-2" och "-3"); det är sista bilden.
  I de avlästa talen ser handflatan aldrig uppåt: den går från nedåt (−0,88) till åt sidan (−0,05, ruta 51) och tillbaka
  till nedåt (−0,84). Det stämmer med huvudagentens läsning av filmen ruta för ruta: handen vänds en gång, i luften, och
  aldrig i slutet; efter vridningen hålls kortet uppifrån i sin bortre kant med handryggen uppåt. Handflatans håll kommer
  ur tre av MediaPipes punkter och är osäkert när handen ses från kanten, så filmens egna rutor avgör om ord och tal
  skulle skilja sig. Den första, handritade given (`deal.ts`) slutade med handflatan
  uppåt och handen borta från kortet och är pensionerad som förlaga.
- **Vändningen är en vridning** (`turnBetween` i `capture.ts`, 2026-11-18). Nära rutorna där kortet är en linje är
  spårets fyrhörn en strimma, och åt vilket håll en sida på några bildpunkter pekar är brus. Läst ruta för ruta rullade
  kortet över sin långsida och snurrade sedan 53° i sitt eget plan på EN ruta (ruta 57) och 16° på nästa: det Jakob såg
  som "en konstig halvrotation" runt ruta 55–59. Nu vrids kortet kring en enda axel i jämn takt från sista rutan där
  baksidan syns väl (51) till första där framsidan gör det (59): 18° per ruta kring långsidan och 14° kring kortsidan,
  0° i sitt plan, den hållna änden kvar vid fingrarna. Filmens kort byter också riktning i vändningen (långsidan längs
  bildens linje före, 105 bildpunkter, och kortsidan efter, 82), så riktningsbytet är Pamelas; ryckigheten var dockans.
  Det som INTE stämmer med filmen: dockans kort står på kant mot kameran ruta 52–53 (filmen 53–55) och visar sedan
  framsidan brett ruta 54–58, där filmens kort är en smal strimma. En stel kropp kan inte göra båda; filmens kort är
  inte stelt där. Hur Kling tar den nya vändningen är oprövat (förlagan "-4").
- **Inte gjort:** Paows egen giv (`paow-giv-2-1-p4-11-01`, 169 rutor med återgång till skon) är avläst men inte lagd i
  rummet: handens djup på vägen tillbaka har ingen fästpunkt än.

## Det som är mätt och det som är antaget

- **Mätt på filmen** (paow-giv-2-1-p4-11-01): kortet som ligger vid plats 4 (nära kant 84,5, bortre 77,5, djup 72
  bildpunkter, läst på fyra gångers förstoring); kortets mitt i sju rutor (kortspåret); kortet i skons fönster
  (51,0 × 92,2, gula bildpunkter i ruta 120); dealerkantens rad 831,5 (kontraktet).
- **Läst för ögat, ±10 bildpunkter:** axlar, pupiller, hjässa och haka på ankaret `paow-nyp-ung-1`; skons fot.
- **Antaget:** verkliga mått (knogar 76 mm, kavajens axlar 400 mm, pupiller 62 mm), att hon sitter 0,18 m bakom
  kanten, skons form (frontplattan lutad 58°), kortets höjd över filten under given, och hur handen släpper kortet.

## Fynd (2026-11-17)

- **Planens kort och dealerns kropp hör till två linser.** Planens avsmalning 0,87 hör till brännvidd cirka 800
  bildpunkter, och under den vore hon dubbelt så stor som en människa (kontraktets k = 2 säger samma sak). Linsen som
  ritar henne i verklig storlek har brännvidd 2334 bildpunkter (bildvinkel 28,2°, lutning 25,1°, 1,110 m över filten,
  1,844 m från dealerkanten). Skons fot blir då 0,451 m och kortet i skons fönster 0,94 av ett verkligt kort på
  längden (0,95 där skomodellen själv ställer kortet), två saker som inte ingick i passningen.
- **Under kroppens lins** är planens kort rätt vid plats 4 (0,97) och för små närmare dealern: plats 3 och 5 × 1,04,
  plats 2 och 6 × 1,11, plats 1 och 7 × 1,19, dealerns kort × 1,34. Kortet i nypet (ankare 2.1) är 8–13 % för långt
  (spårets kontur 1,13; det synliga kortet läst för ögat cirka 1,08).
- **Jakob sade ja 2026-11-17 kl. 23.02** till att kortplanen ritas med verkligt perspektiv (Beslut,
  `kortplanen-verkligt-perspektiv`). Kortplanen ritas sedan samma kväll med `realCardQuad` (`planCardQuad` i
  `src/card-plan.ts`), `grow` 1,00 på hans ord, alltså kortet i verklig storlek: 84,5 bildpunkter i nära kant vid plats 4.
- **Från bankens kamera ligger 3D-kortet där filmens kort ligger** i de nycklade rutorna, och kameran ser baksidan
  till ruta 44, kanten kring ruta 45 och framsidan från ruta 48, som spåret säger (test).
- Vägarna till en verklig 3D-dealer och deras licenser: forskningsrapporten ligger på slaskdisken,
  `D:/dealer-scratch/tmp/dealer-3d/forskning-3d-avatarer-2026-11-17.md`.

## Köra

```
node --test dealer3d/tests/capture.test.ts dealer3d/tests/world.test.ts tools/table-lens.test.ts
tools/python/.venv/Scripts/python.exe -I tools/python/landmarks.py <film.mp4> <punkter.json>
node dealer3d/tools/lift.ts --marks <punkter.json> --track assets/tracking/<klipp>/card-track.json --out dealer3d/data/<namn>.json
node dealer3d/tools/shoot.ts --out <mapp> --motion giv-pamela-p4 --eyes 1,4 --film 30 0 3.9667 --size 1920x640
node dealer3d/tools/measure.ts
node dealer3d/tools/camera-proof.ts --frame <ruta 120, png> --pinch <ruta 0, png> --out <mapp>
node dealer3d/tools/shoot.ts --out <mapp> --eyes 1,4 --times 1.25,1.9,3.5 --size 1920x640
node dealer3d/tools/shoot.ts --out <mapp> --eyes film --look plain --tags 0 --film 24 0 4 --size 1764x1174
```

Inspelningen körs under det delade låset för grafikkortet och headless Chrome (DRIFT), en körning i taget; skriptet
stänger sin Chrome och sin filserver själv. En hel omgång (stillbilder, två filmer) tar cirka en minut på Jakobs dator.

## Kvar

- Dockan är en provdocka av klot och rör. Den vita dockan står kvar som egen väg för förlagefilmer (en modell som
  liknar Paow kan läcka sitt utseende in i filmen).
- **Jakobs Meshy-modell vid bordet** (2026-11-18, `src/figure-model.ts`, sidan `?model=1`, `shoot.ts --model <fil.glb>`;
  prov `dealer-3d-paow-modell-vid-bordet`). Hans riggade modell (154 148 trianglar, 24 ben, inga fingerben, ligger
  utanför repot) sitter på dockans plats och ställs ur samma leder: bålen som en bit från höft till axlar, armarna med
  modellens egna benlängder mot dockans handleder, huvudet två tredjedelar av vägen dit dockan ser (högst 40°, annars
  döljer håret ansiktet). Hon är förstorad till 1,10 för att armen ska vara lika lång som den avlästa (0,55 m). Laddar
  på 0,5–0,7 s, första bilden efter 1,5–1,9 s. Jakob såg armen "ur led" i bilden där kortet läggs: överarmen var
  siktad kortaste vägen och blev rullad 33–48° fel kring sin egen längd, så underarmen böjde sig snett ut ur armbågen,
  och armbågens sida togs från hennes egen (bredare) axel i stället för dockans. Nu rullas överarmen tills det gångjärn
  hon modellerades med står vinkelrätt mot böjens plan, armbågens sida är dockans, och handen hålls högst 50° från
  underarmens linje; `shoot.ts --model` skriver armarnas leder per bild (`ruta.json`, `figure`): armbåge 76–132°,
  handled 13–33° genom given. Det som inte håller: händerna är stela, så kortet svävar bredvid en
  platt hand; benen under bordet är inte sedda från någon vy; hon ser ut som en spelfigur. Händerna behöver fingerben
  (Meshys rigg ger inga; en egen rigg eller en modell med fingrar) innan hon kan hålla ett kort. Ett utseendeprov,
  ingen förlaga.
- Kling 4 genom Runway tar dockans film som referensfilm tillsammans med första och sista bild, och inget av dockans
  utseende följer med (filmbanans prov 2026-11-17, `assets/proofs/giv-forlagefilm-2/`). Den kopierar dockans fel lika
  troget, så en förlagefilm måste hålla kortet i handen tills det ligger, ha ett verkligt korts storlek i varje ruta
  och stå på kant en gång, mitt på vägen.
- Bara given till plats 4 finns avläst; plats 1, 3 och 5 är den givens hand och kort flyttade, med arm och kropp som
  modell. Plats 3 och 5 håller på lederna och går fria från skon. Plats 1 håller på lederna, men vänsterarmen korsar
  kroppen över den vilande handen; huvudagenten beställer ingen film på den, och plats 1 och 2 hör enligt planen till
  ett handbyte (vänster tar, höger lägger), som inte är byggt. **Plats 6 och 7 faller:** flyttad dit går handen genom
  skon (plats 7 i 25 rutor, plats 6 i en), eftersom skon står mellan henne och de platserna och den avlästa handen går
  lågt över filten. `lift.ts` säger det (`throughShoe` i `capture.ts`), och testet kräver att en sparad giv går fri.
  De platserna behöver en egen avläst film (en giv som går över eller framför skon).
- **Släpet** (ankare 2.2: platt hand på kortet vid skons mynning, kortet dras på filten, lyfts och vänds, läggs).
  Påbörjat 2026-11-18, inget incheckat. Filmen `pamela-p4-c1-drawn-deal-01` är avläst (punkterna i
  `D:/dealer-scratch/tmp/dealer-3d/rorelse/`, 120 av 120 rutor), och `lift.ts` som den är ger händer och leder inom
  gränserna (armbåge 79–117°, handled 4–37°). Kortet håller inte: under draget (ruta 0 till cirka 34) täcker handen
  kortets bortre del, så spårets fyrhörn är bara den synliga biten (56 × 55 mm lagd på filten) och läses som ett lutat
  kort; och kortet börjar som "stående i skon", vilket det inte gör i ett släp. Det som behövs: ett eget läge i
  `perform` där kortet ligger plant på filten med verklig storlek, lagt efter sin bara närkant, tills det lyfts (cirka
  ruta 36–55), och sedan spåras som i en buren giv. Mått och ark: `slap-matt.ts` och `rorelse/slap-ark.png` på slasket.
- **En annan vinkel** (2026-11-18, prov `dealer-3d-vinkel-stol-1`, inget betalt). Paows registrerade keystonebilder
  och ankare är alla tagna framifrån (bankens kamera). Ett prov från sidan finns sedan 2026-11-13
  (`assets/proofs/paow-fran-sidan/`, ett öga 40° åt vänster): nyckelbilden gjordes ur frontankaret, omprojicerat med
  djup och återställt av en bildmodell, och filmen med Runways kameraflytt; receptet och vad som föll står i den banans
  mapp på slaskdisken (`levande-objekt/kamera2-paow/`). Det provet är före de tatuerade händerna och har ingen dom av
  Jakob. 3D-banan ger samma recept en renare råbild: figuren, bordet och kortet ritade från exakt stolens öga i stället
  för omprojicerade. Vägen till en film från en annan stol:
  dockans giv filmad från stolens öga (`shoot.ts --eyes 1 --look plain`) styr rörelsen, och Meshy-modellen från samma öga
  i första och sista rutan (`--model`, `--times 0,3.9667`) är underlag åt en bildmodell som gör de två riktiga bilderna
  filmen börjar och slutar på. Oprövat: om bildmodellen håller hennes utseende från sidan, och om rummet bakom henne
  ska komma ur 3D-scenen. Tre ögon (vänster, mitten, höger) räcker troligen för sju stolar; sju egna banker gör det
  inte rimligt.
- Två datorer som delar en giv (händelse, kortplats, `DEAL_VERSION`, starttid) är inte byggt.
