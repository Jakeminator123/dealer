# dealer3d: dealern som verklig geometri

3D-banans arbetsmapp (startad 2026-11-17 på Jakobs ord: en dealer i 3D, så att olika stolar ser samma giv från sin
egen vinkel, "avskilt i en egen undermapp" tills delarna är värda att lyfta in).

## Överlämning (läs det här först; resten av sidan är uppslagsverk)

Skriven 2026-11-18 och rättad per arbete sedan; resten står i commitmeddelandena och i varje filmmapps `KLAR-*.txt` på
slaskdisken.

**Läget.**
- Gällande docka för givarna från A2.3 är **svep24d** (`data/giv-fran-2-3-p<n>-grepp-svep-d.json` för P1–P5 och
  `-p4c2-`, id `docka-2-3-p<n>c1-svep24d` i `data/rendered-references.json`): pilot 02 till plats 4 med den har Jakobs
  ja (Beslut 2026-11-21). Läget för givarna står i [film](../docs/lage/film.md) (rättat 2026-11-21).
- Dockan delar med två händer från pose 2.3 (`src/two-hand.ts`, takten ur en riktig dealer i `src/real-deal.ts`). Den
  äldre versionen **-f** (Jakob 2026-11-18: vilken vändning som helst, bara den blir bra): vänster hand för kortet plant till
  höger hand och släpper; höger hand ensam RULLAR kortet ett halvt varv kring långsidan, så att bankens kamera aldrig ritar
  det större än liggande; given 2,2 s, stilla slut 0,7 s; slutbilden: höger fingertoppar på kortet, vänster hand på nästa
  kort i skons fönster, kroppen vriden mot platsen där det behövs.
- -f finns för alla åtta kort (P1–P7, D.C1) i `D:/dealer-scratch/tmp/dealer-3d/ut/giv-fran-2-3-<plats>/` med ark,
  närbild, slutruta och `KLAR-f.txt` (där står vad som håller och inte). Plats 1 ser inte ut som en människa som delar:
  armen ligger längs filten, för dockan sitter med axeln lågt över bordet.
- Äldre versioner -b till -e: i sina `KLAR-*.txt`. Den avlästa given (A2.1, `src/capture.ts`) är orörd; inget betalt lagt.
- **Dockorna** (se **Dockorna**): `src/doll.ts` har `standard` (som förut, låst) och `paow`, rättad 2026-11-23 efter
  hennes filmer (38 cm bakom bordskanten, egna armbågar och händer); `?docka=paow`, `shoot.ts --doll paow`. Jakob
  2026-11-23 om vändningen vid platsen: "Bättre, men inte än", vänsterarmen ser fel ut mot skon. Scenens sko är rättad
  efter filmens samma dag, och vänsterhandens fingrar böjer mot handflatan (**Vänsterarmen vid skon**). Docklabbet:
  Naturlig (Som förut kvar), giv från A2.1 eller A2.3, Giv och återgång, Landning (fem förval och egen, inte sedd av
  Jakob); **Naturlig ställning**, **Ingång och återgång**, **Landningen**.
- **Provet en giv, två stolar** (2026-11-20, Jakobs "Ja kör" i Beslut; prov `3d-prov-en-giv-tva-stolar-20261120`; hans
  "ja" på kortet samma dag, och 2026-11-21 "SAM-dockan ska in, men inte nu" i BESKED): given till plats 4 med ett 3D-kort från stol 4 och stol 1. SAM 3D Body över filmen
  `paow-giv-2-3-p4-h24-cykel-02-01` (varannan ruta) ser ut som en människa som ger från båda stolarna (underagentens
  betyg 4/5 och 3/5); det köpta klippet, som saknar kort, sko och licenstext, gör det inte (2/5 och 1/5).

**Jakobs dom på tagningarna gjorda på "-f" (2026-11-18).** "Hon flippar korten lixom utanpå fingrarna.. […] så måste
vit-figuren bli bättre med att sköta kordineringen med kort/fingrar". Först av allt: en version där tummen ligger på
kortets ena sida och fingrarna på den andra genom hela vändningen, och handleden och underarmen vrider kortet (handen
förblir vänd tills kortet ligger); ingen ring som kortet rullar i, och inga fingrar som byter sida om kanten.

**Nästa steg, i ordning.** Dockfilmerna `svep24d` till P1–P3 och P5 granskas oberoende ([film](../docs/lage/film.md)).
1. Plats 1 (och se plats 2): en kropp som kan resa sig och luta sig över bordet (en ny led i `src/body.ts`).
2. Höger hand under rullningen sluter sig till en ring om kortets kortsida (`gripBend` 0,6): prova ett plattare grepp.
3. Svepet (flera kort i en film) i -f: `tools/deal-film.ts --beats` tar i dag ETT kort.
4. Dockans filmer in i `data/rendered-references.json` gör huvudagenten; id som `docka-2-3-p4c1-f`, aldrig samma id två gånger.
5. SAM-dockan: Jakobs ja 2026-11-23 (BESKED); vad som finns och vad som saknas står sist i **Dockorna**.

**Väntar på Jakob.** Inget utanför Beslut.

**Var saker ligger.** Koden och renderkommandot finns i repots `dealer3d/`. En dockfilm görs i två steg från repot;
parametrarna för äldre filmer står i deras `KLAR-f.txt` på slaskdisken:
1. `node dealer3d/tools/deal-film.ts --to P4.C1 --seconds 3 --right-at 1180,887,83 --beats 4,15,20,36,22,45,58,66 --meet 1
   --single 1 --roll 1 --hand-over-yaw 180 --carry 0.045 --turned-at 0.01 --tuck 300 --push 0.004 --out dealer3d/data/<namn>.json`
   (`--beats`: rutor från 0 för ut, ute, höger tar, kant, vänster släpper, framsidan, i filten, ligger; plats 1–3 även
   `--real-take 1 --body <sida,vridning,framåt>`). Ruta för ruta: `node dealer3d/tools/deal-check.ts dealer3d/data/<namn>.json`.
2. `node dealer3d/tools/render-reference.ts --motion dealer3d/data/<namn>.json --out D:/dealer-scratch/tmp/dealer-3d/ut/<ny-mapp>`.
   Kommandot tar det delade GPU-låset och spelar in 30 rutor/s i 1764 × 1174. Det ger MP4, ark, slutruta och ett
   kvitto med frysta indata, kodens SHA, kamera, verktygsversioner och uppmätt filmformat. Se **Köra** för närbild.

**Fällor.**
- Headless Chrome bara under låset, en körning i taget. Banan skriver bara i `dealer3d/` och på slaskdisken.
- Titta på arket och närbilden i full storlek innan ett tal skickas vidare: "inom gränserna" har inte räckt.
- Kling tar efter dockans fel: grepp, stopp, glidning och kortets storlek.
- Första bilden i en beställning är ankaret (A2.3, `assets/anchors/paow-ankare-2-3-d/anchor.png`), aldrig dockans ruta.
- Verktyget räknar rutor från 0, arken och filnamnen från 1. En levererad film görs inte om under samma namn.
- Datafilerna bär sina platser (`places`), så `tests/two-hand.test.ts` läser inte `placements/default.json`;
  `world.test.ts` och `deal-film.ts` gör det (en ny datafil tar alltså Jakobs sparade plan i det träd den läggs i).

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
| `src/real-deal.ts` | **En riktig dealers tvåhandsgiv som tal:** åtta kort (sju platser och hennes eget), för varje kort tio ögonblick i sekunder och de två punkter på filten där händerna byter, avlästa av sessionen MODEL ur en film av ett riktigt bord. Bara tal lämnar den filmen. |
| `src/two-hand.ts` | **Tvåhandsgiven från pose 2.3**, lagd för hand i den riktiga dealerns takt: kortet ut ur skon som en stege från en vägg, fört på filten till höger hand, rest på kortsidan av båda händerna, fällt framåt i luften (ände över ände), sänkt, skjutet de sista 4 cm; händerna omlott, huvudet följer platsen, kroppen lutar sig dit armen inte når. `startOnAnchor` lägger höger hand där en ankarbild har den. Huvudet på filen säger vad som är avläst och vad som är modell. Ren räkning. |
| `src/hand-pose.ts` | En hand som stel form i sina egna axlar, och hur en modellerad film rör den: ställd någonstans, vriden i en enda vridning, fingrarna böjda i sina egna leder (varje ben behåller sin längd), tummen förd mot en punkt, och `track` (ett värde genom givna nycklar utan översläng). Ren räkning. |
| `data/giv-fran-2-3-p5.json`, `-p5-langsam.json`, `-p4.json`, `-alla.json` | Tvåhandsgiven som tal sidan spelar: ett kort till plats 5 (i hennes takt, och långsamt med `pace`), ett till plats 4 (90 rutor, 3,0 s: given i hennes takt, sedan stilla) och svepet till plats 7–1 och dealerns kort (240 rutor, 8,0 s). `card.id` säger vilket kort som är i spel, `laid` vilka som ligger, `beats` varje korts ögonblick i rutor. Skrivna av `tools/deal-film.ts`. |
| `tools/deal-film.ts` | Lägger tvåhandsgiven (`--to P5.C1` eller `--to all`, `--seconds`, `--lead`, `--right-at` för ankarets högerhand, `--beats` för en film i egen, långsammare takt), skriver datafilen och skriver ut slagen, vad lederna får göra, om en hand går genom skon, och vad bankens kamera ser av kortet. |
| `data/giv-fran-2-3-<plats>-e.json`, `-f.json` | Version -e (plats 4 och 1) och -f (alla åtta kort): ett kort var, 90 rutor, 3,0 s; varje fil bär sina platser (`places`) och sitt `pace`. |
| `tools/deal-check.ts` | En lagd giv ruta för ruta: hur långt kortet flyttas och vrids, hur mycket av framsidan och hur stort bankens kamera ser det, vänster hand från kortet, höger armbåge under axeln och underarmen mot kamerans siktlinje. |
| `tools/pose-film.ts`, `data/till-ankare-2-3.json`, `-b.json` | Dockan från vila till pose 2.3 och stilla där, som tal sidan spelar (samma format som `giv-*.json`): förlagefilmen till ett ankare som ingen film visar än. Handens form och viloläge är avlästa ur `data/giv-pamela-p4.json`; vägen, lutningen, vridningen och blicken är modell. Version b på Jakobs ord 2026-11-18 (för långsam, ryckig, lutade för mycket): 3,0 s, rörelsen klar vid 1,6 s, mjukare start och slut (`--ease 5`), samma slutpose. Sista rutan i `till-ankare-2-3.json` är tvåhandsgivens start (`src/two-hand.ts`, `tests/two-hand.test.ts`). |
| `tests/two-hand.test.ts` | Tvåhandsgivens kontrakt: skarven mot posefilmen, kortet på sin plats, lederna inom gränserna och händernas mått. Testerna som bara jämförde lagrade filmer med dagens kod ströks 2026-11-23. |
| `src/deal.ts` | Den första given, ritad för hand, som tidslinje: kortets läge och vridning och handens grepp för varje tidpunkt, till vilken kortplats som helst. Bana och tempo ur Paows giv till plats 4. Jakob dömde ut handens rörelse (2026-11-17); den avlästa given ersätter den i proven, och den här står kvar för jämförelse och för platser som ingen film går till. Ren räkning. |
| `src/body.ts` | Den handritade givens skelett, löst ur var händerna ska vara: hon böjer sig från höften och vrider fram axeln så långt armen behöver. Tar en docka (`src/doll.ts`); utan en är det standarddockan. Ren räkning. |
| `src/doll.ts`, `tools/doll-pose.ts`, `tools/doll-still.ts`, `tools/docka-sam.py`, `tools/docka-mat.ts`, `tools/docka-jamfor.ts`, `tests/doll.test.ts` | Dockorna, deras mått och verktygen som gör dem: se **Dockorna**. |
| `src/stage.ts` | Ritningen i three.js: bord, sko, ett kort med två sidor och provdockan, sedda genom flera ögon samtidigt. Tre utseenden: `room` (filtbord), `plain` (vit docka på grått, för en förlagefilm) och `bare` (bara dockan på genomskinligt; bord, sko och kort skymmer utan att ritas). Två källor för rörelsen: en avläst giv (handen ritas av sina 21 punkter) eller den handritade. |
| `src/figure-model.ts` | En riggad modell (GLB med skelett, som Meshy riggar) på dockans plats, ställd ur samma leder; hämtas bara när sidan ber om den. Se "Kvar". |
| `page/` | Sidan. `?motion=giv-pamela-p4` väljer en avläst giv; `?model=1` sätter den riggade modellen (`/model.glb`, som inspelaren serverar med `--model`) på dockans plats; `?eyes=1,4` ögon (en stol 1–7, `film` för bankens kamera, eller `runt35` för bankens kamera buren 35° runt dealern åt hennes vänster, `runt-35` åt hennes höger), `?to=P4.C1` kortplatsen för den handritade given, `?look=plain` eller `bare`, `?tags=0`, `?t=1.9`, `?play=1`, `?docka=paow` dockan (annars den rörelsen bär, eller standard). |
| `tools/prov-sam.py`, `tools/prov-lay.ts`, `tools/prov-shoot.ts`, `src/prov-card.ts`, `page/prov.html`, `page/prov.ts` | **Provet en giv, två stolar** (2026-11-20). `prov-sam.py` läser en film med SAM 3D Body (en kroppsyta och 70 leder per ruta under bordets lins; Python eftersom SAM är det, körs i SAM-appens egen miljö och under GPU-låset). `prov-lay.ts` lägger en rörelsekälla i rummet (`--source sam` eller `pack`, det köpta klippet) och skriver `.runtime/3d-prov/scene/<källa>.json` med kortet per ruta och måtten. `prov-card.ts` ger kortet per ruta: ur filmens kortspår lagt där fingrarna är (läsningen är `capture.ts` egen, upprepad; går provet vidare ska den delade delen exporteras därifrån), eller hållet i en riggad hand. `page/prov.*` visar det, och `prov-shoot.ts` spelar in sidan huvudlöst under låset (Chrome-hanteringen är `shoot.ts` egen, upprepad). Paketets filer och SAM:s utdata ligger bara i `.runtime/3d-prov/`, utanför Git. |
| `../tools/python/landmarks.py` (repots Python-mapp) | Läser en film ruta för ruta med MediaPipe och skriver händernas och kroppens punkter som JSON. Resultatet är mellanlager utanför Git. |
| `tools/lift.ts` | Lägger en films punkter i rummet (`capture.ts`) med filmens kortspår, skriver `data/<namn>.json` och skriver ut vad som mättes: handens storlek, varje leds omfång, och hur kortet stämmer med filmens. |
| `tools/measure.ts` | Kalibreringen som tal: linsfamiljen, den valda linsen, ett verkligt kort på planens platser mot planens kontur, kortet i skon, stolarnas ögon. |
| `tools/camera-proof.ts` | Bilderna till provet `dealer-3d-kamera`: planens kort och verkliga kort på en filmruta, och skons kort förstorat. |
| `tools/shoot.ts` | Spelar in sidan utan labbserver: en egen filserver på 127.0.0.1 under körningen, headless Chrome med egen profil och port, en PNG per tidpunkt. `--doll paow` väljer dockan. Körs under det delade låset. |
| `tests/world.test.ts` | Elva tester av passningen, världen och den handritade given, utan media och utan webbläsare; läser bara `placements/default.json`. |
| `tests/capture.test.ts` | Ett test av `placeHand`: varje punkt tillbaka på sin bildpunkt, handleden på begärt djup. Testerna som läste de lagrade givarna ströks 2026-11-23. |

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

## Dockorna

Jakob 2026-11-21: dockan ska inte se onaturlig, "lite kuvad", ut; "Kanske kan man ta mått för respektive dealer?"; en
docka med Paows mått i stället för Siluetten i studion, där dockan ska gå att byta. 2026-11-23: axlar, armbågar och
fingrar ska sitta som hennes innan dockan används.

- **`src/doll.ts`**: en docka är ett namn och mått: armarnas längder, räckvidd, hur långt hon får böja och vrida sig,
  höften under filten, var lederna står i bankens bild och hur långt bakom bordskanten (`place`), åt vilket håll
  armbågarna hänger (`elbowPoles`, i vilan `elbowAtRest`; `elbowPolesAt` ger polerna för en ställning), en egen hand
  (`hand`: formen i ankaret, när hon bär ett kort och i vilan, och var den ligger) och formerna scenen ritar (`shape`:
  ok, armar, hals, huvud, bål som ägg eller svarvad profil). `about` säger om varje mått är mätt (och på vad) eller
  gissat. `src/body.ts` (`standing`, `solveBody`, `arm`) och `src/stage.ts` tar en docka; utan en är det `standard`.
- **`standard`**: dockan som alla givar och filmer gjordes med till 2026-11-21. `tests/doll.test.ts` låser den vid de tal
  den gamla `src/body.ts` gav (mått, ställning och böjning mot fyra handleder); den har inga egna poler och ingen egen
  hand, och står 0,18 m bakom bordskanten.
- **`paow`** (rättad 2026-11-23 mot ankare 2.3, vilan, den godkända given till plats 4 och given till plats 1, lästa
  med SAM 3D Body). Grundfelet var var hon sitter: hennes händer mot filten och kortet i skon säger 0,38 m bakom
  bordskanten, inte 0,18, och då är hon en tiondel större än dockan var (axellederna 366 mm isär, armarna 0,293 och
  0,275 m). Med dockan för nära och för liten nådde händerna sina platser med armbågarna där hennes aldrig är. Armbågarna hänger
  nedåt och en aning utåt i givarna (femton bilder), utåt och fram i vilan (tre bilder). Handen är hennes egen: formen i
  ankare 2.3, när hon bär kortet och i vilan, och var den ligger i ankaret och i vilan. Sluttande axlar, hals, huvud
  till hakan och svarvad bål som förut; midjan, höfterna och hållningen är gissade. **Inte dömd av Jakob**; provet
  `assets/proofs/docka-paow-ratt-20261123/` visar före och efter mot henne.
- **Hur nära hon sitter** (dockan mot henne i bankens bild, 1764 bred, medel per led i bildpunkter, före → efter;
  `tools/docka-jamfor.ts`): ankare 2.3 och given till plats 4 34 → 20 (vänster armbåge 110 → 14, vänster handled
  24 → 8), given till plats 1 31 → 25, vilan 24 → 5. Kvar: huvudet följer inte hennes (upp till 39 i landningen);
  höger armbåge i given till plats 1 ligger 68–79 fel mitt i svepet, sämre än före (medel 27 → 48; hennes armbåge
  släpar, så var den är följer inte av handens plats ensam); axelns ytterhörn står 1,4 cm över kavajens; i ankare
  2.3 är hon redan vriden 13° och lutad 4° medan rörelsen börjar rak; givarna är standarddockans, där fingrarna
  vänder kortet.
- **Välja docka**: sidan `?docka=paow`, inspelaren `tools/shoot.ts --doll paow`. En rörelse som bär `doll` (från
  `doll-pose.ts`) ritas med den dockan utan val, också av `tools/render-reference.ts`.
- **Verktygen**: `tools/docka-sam.py` läser stillbilder med SAM 3D Body (i SAM-checkoutens egen Python, lokalt grafikkort,
  under låset) och skriver alla 127 leder med namn och föräldrar, 70 punkter och ytan; `tools/docka-mat.ts --sam <mapp>
  [--behind-edge <m>]` lägger läsningen i scenens meter och skriver ut måtten bredvid dockans, och i `handsOnFelt` hur
  långt bakom kanten händerna säger att hon sitter; `tools/docka-jamfor.ts --sam <mapp> --motion <rörelse.json>` ställer
  dockan bredvid henne led för led vid samma ögonblick (bildpunkter och cm, fingrarnas böjning). `tools/doll-pose.ts
  --motion <giv.json> --doll paow --out <fil.json>` ställer en rörelse på en annan docka: kortet står kvar, bålen vrids
  kring hennes höft som den gamla dockans, hon vrider och lutar sig (högst `--most-lean`, 9°) där en handled är utom
  räckhåll, armbågarna löses mot dockans poler och händerna blir hennes. I ankaret och i vilan ligger de som hennes,
  och det bleknar över de första fem centimetrarna handen rör sig; i en giv (en rörelse med `beats`) har handen sedan
  hennes bärande form och håller det rörelsens hand håller, och ingen del går under filten. En docka utan egna poler
  eller egen hand ställs som förut (`--elbow forearm`, `--hands motion`). Kvittot bredvid utfilen ger lutning,
  handledens flytt och handens lägsta punkt per ruta.
- **SAM-läsningarna av Paow** ligger kvar på slaskdisken, `D:/dealer-scratch/tmp/dealer-3d/ut/docka-ratt-sam-p4`
  (ankare 2.3 och sju rutor ur given till plats 4), `-p1` (sju rutor ur given till plats 1), `-a1` (vilan) och
  `-ingang` (sex rutor ur ingångsfilmen): `sam.json` och en `.npz` per bild med allt modellen gav. Läs dem inte igen.
- **Gjort med dockan som den var före 2026-11-23:** första paow-filmen `docka-paow-2-3-p4c2-svep24d` (rörelsen
  `data/giv-fran-2-3-p4c2-grepp-svep-d-paow.json`; kvittot i filmens mapp under `assets/references/docka/`) och studions
  bild `docka-paow`. De visar den gamla dockan tills de görs om (`doll-pose.ts` på givens rörelse och en ny film
  med nytt namn; `node tools/placement-backdrop.ts` för bilden).
- **Vändningen vid platsen** (prov 2026-11-23, `assets/proofs/docka-paow-vandning-20261123/`; inte dömt av Jakob).
  Hans ord om den rättade dockan: armen måste "vridas väldigt ihoptryckt" och "skulle se naturligare om hon sträkte ut
  armen mer". Mätt med SAM över hennes godkända givar till plats 3 (`paow-giv-2-3-p3-02-01`, `-03-01`): när hon vänder
  kortet har hon armbågen i 107–126° (rak arm 180°) och handen 81–89 % av armens längd från axeln; dockfilmen hon följde
  (standard, 18 cm bakom kanten) har 99–113° och 76–84 %. Djupet är inte orsaken: axlarna står 38 ± 4 cm bakom kanten
  också mitt i vändningen. Orsaken är var vändningen ligger och hur handen sitter på kortet: kortet vänds hela vägen
  från handbytet och står på kant halvvägs, 8 cm framför bordskanten, framför magen, och greppet lägger handen 40° snett
  mot underarmen (handleden böjd upp till 62°).
  Ny giv för paow: `deal-film.ts` med svep24d:s val (står i datafilens `pace`) och tre till: `--turn-near 0.7` (kortet
  förs plant 70 % av vägen innan det vänds), `wait=14` i `--shared` (vändningen börjar 14 rutor efter att vänster hand
  släppt) och `--grip-yaw -20` (handen i underarmens förlängning, så att handleden vrider kortet som en nyckel); sedan
  `doll-pose.ts --doll paow`. Till plats 3 under vändningen: armbågen 142–153° (förut 126–153), handen 94–97 % av armens
  längd från axeln, handleden böjd högst 17° (förut 62), kortet på kant 15 cm framför kanten. Till plats 4: armen rak
  (153°) hela vändningen, handleden högst 25° (förut 66). Rörelserna: `data/giv-fran-2-3-p3-vid-plats.json` och `-p4-`
  (lagda på standarddockan, bara underlag för `doll-pose.ts`) och `…-vid-plats-paow.json` (det som filmas); filmerna
  ligger i `D:/dealer-scratch/tmp/dealer-3d/ut/docka-vandning-ny-p3` och `-p4`. Standarddockans givar är oförändrade:
  utan de nya valen lägger koden samma rörelse byte för byte. Inte gjort: plats 1, 2, 5 och P4.C2 med den nya
  vändningen, och en kropp som lutar sig mot säte 6 och 7. Vändningen går fortare (13° per ruta som mest, förut 11) och
  kortet förs fortare fram (24 mm per ruta som mest till plats 3).
- **Vänsterarmen vid skon** (prov 2026-11-23, `assets/proofs/docka-paow-vansterarm-20261123/`; inte dömt av Jakob).
  Hans ord om vändningen vid platsen: "Bättre, men inte än"; vänsterarmen är "inte naturlig i förhållande till sko och
  kort(en)", "ngt fel i djupet och kanske i distansen till skon", "det syns på hennes handled och armboge".
  Armen låg rätt (handleden 0 px från hennes i ankare 2.3); orsaken var scenens sko. **Skon är rättad 2026-11-23**
  (`SHOE` i `src/table-lens.ts`, prov `assets/proofs/docka-sko-ratt-20261123/`): kortets hörn i fönstret 5/1/7/0 px
  från filmens (förut 22–33), främre foten 9, plattans överkant 6/5, bakkanten 3; bakre foten 38 och bortre bakhörnet
  29 står kvar (bildens sko är inte ritad med linsen). Spelet, Scen, kortplanen och filmerna påverkas inte. Lagrade
  rörelser i `data/` och `standard/` är lagda med den gamla skon (`SHOE_LAID_BEFORE_20261123`); testerna lägger dem
  igen med den (`Pace.shoe`, `layDeal({shoe})`, `deal-film.ts --shoe laid-before-20261123`), allt nytt läggs med `SHOE`.
  Labbet lägger alltid levande med `SHOE`; posefilmernas kort flyttas in i fönstret när de visas (`cardInFilmsShoe`).
  **Vänsterhandens fingrar** (`PAOW.hand.left`): de ritade topparna ligger 0,1 px från hennes (förut 8–15); pek-, lång-
  och ringfingret vilar på kortet. Jakob såg en klo: pek- och långfingret var böjda 21–36° bakåt i mellan- och
  ytterleden (passningen böjde kring de sista benens egen axel, och SAM läste dem 4–5° bakåt). Nu böjer de mot
  handflatan i alla leder (pek 45/30/20°, lång 16/36/24°). Mätt på båda händerna i A1, A2.1, A2.3 och givens första och
  sista ruta: handflatan pekar ned (y −0,86 till −0,97) och från kameran, ingen hand är vänd. Lillfingret lyfts bakåt
  vid knogen i båda händerna (hennes egen läsning) och lämnas.
  **Handbytet, ändrat för paow och bara i receptet**: vänsterhanden vreds 60° om lodlinjen medan underarmen ligger
  still (`TWO_HAND.shared.swing`), så handleden var böjd 43–57°, varav 38–42° i sidled (standarddockan 58–72°). Med
  `swing=40` i `--shared`: 28–34°, handleden fri från skons platta och högerhanden synlig (`swing=25` gav 11–24° men
  vänsterarmen skymde högerhanden). Rörelserna: `data/giv-fran-2-3-p3-vid-plats-b.json` (underlag) och
  `…-b-paow.json` (det som filmas; `deal-check.ts` håller); filmen i
  `D:/dealer-scratch/tmp/dealer-3d/ut/docka-vansterarm-ny-p3`. Det går ifrån hennes godkända filmer, som följde den
  gamla dockan och har samma vikta handled: dockans handled ligger nu 20–45 px längre in än hennes vid handbytet (förut
  0–11). SAM-läsningar av givens första sekund: `…/ut/docka-vansterarm-sam-p3`. SAM läser hennes vänsterhand fel i
  flera rutor (handflatan uppåt); att lita på är ankaret, p3-02 ruta 04–12 och p3-03 ruta 08. Inte gjort:
  övriga platser, och fingrarnas grepp i vändningen (mätt i rörelsen: bara
  pekfingertoppen ligger på kortet, tummens topp är 21–25 mm ifrån och fingrarna håller samma form hela vägen; hon
  nyper kortets hörn mellan tumme och pekfinger).
- **Naturlig ställning (inkopplad i docklabbet 2026-11-23; sedd i headless, inte av Jakob).** Hans ord samma dag:
  "vissa aningen konstiga ställningar görs lite naturligare som standard", fingrarna ska visa hur de påverkar kortet,
  händerna är "ihoptrasslade" vid handbytet; för Paow. **I labbet**: valet Rörelse, **Naturlig** (förval för Paow) och
  **Som förut** (kvar tills han säger ja; Standarddockan har bara den). Allt läggs levande med filmens sko: Som förut
  är den gamla takten lagd, aldrig en lagrad fil (den började 3 cm från skons kort); hans sparade standard läggs ur
  sitt `lab.recipe` och `lab.steer` i det val han sparade den i (filen orörd, hans värden gäller); sparad i Naturlig
  får den fältet `lab.naturlig` {knobs, bodyShare}. Under Kroppen, bara
  i Naturlig: Höger/Vänster axel upp och fram (cm), Höger/Vänster armbåge ut (°); kroppens reglage går där aldrig till
  "Går inte", texten säger i stället "kroppen tar X % av styrningen". Med Leder på eller i Nära kortet: en ring på
  kortet där varje fingertopp rör det (varm höger, kall vänster) och en rad i bilden om vilka fingrar och var (i hörnet,
  vid kanten, mitt på). **Koden**: `page/docka.ts` och `docka.html`; `page/natural-lab.ts` (`layNatural`,
  `moveNatural`); `page/lay.ts` `natural: true` kör `naturalPace`; `page/lab-stage.ts` `setGrips`,
  `touching`; `src/natural.ts` (handbytet i `NATURAL.change`, greppet, kroppen, armbågen; kvitto per ruta; av som
  förval: `flatHand`, högerhanden vriden på kortet tills handleden är rakast, och `steerOut`, det styrda ut igen).
  **Mätt på paow** (före → efter): händernas minsta avstånd −16 till 2 mm → 11–14 mm (rull 24–42); tummen mot kortet
  medan pekfingret ligger på, svep P1–P4 39–40 → 2,7–3,4 mm (över 3 mm på 0–1 av 47 rutor, förut 40–41), P5.C1, P5.C2,
  P6.C2 37 → 8 mm (taket är händernas 12 mm); ben genom kortet 13–19 → 12; handleden P1–P3 64–67° → 44–48°, P5 78 →
  75°. Första och sista rutan och kortets plats lika på alla 15; alla 15 går orörda och med reglagen i ändlägena.
  Kroppens reglage verkar åt samma håll och i samma takt som förut (in från beat b till g).
  **Mätt om med rätt sko och fingrar** (2026-11-23; `NATURAL.change` håller och är oförändrad): händerna svep 10–15
  mm, rull 20–28; tummen P2–P4 2,7 mm, P1 5,1–5,4, P5.C1, P5.C2, P6.C2 7,7, rull 19–24 (orättat); ben genom kortet
  svep 5, rull 4–6 (vänsterfingrarna på kortet medan det dras ut, rutorna 6–13); handleden oförändrad. Kortet i första
  rutan 0,0 mm från skons kort på alla 15.
  **Hans P5.C1** (`standard/paow-p5c1.json`, Som förut, greppets vinkel −30°, kroppen [4,6, 4,5, 5,5]), lagd igen med
  rätt sko: händerna −16 mm (i varandra), tummen 45 mm, ben genom kortet 16 (filen 26), handleden 57°, höger handled
  inom 1 mm från filen. Naturlig orörd: 10 mm, 7,7 mm, 5, 75°. Hans standard vinner där den finns.
  **Dockfilmer för beställning** (2026-11-23; registrerade som `docka-paow-2-3-p5c1-naturlig-a` och `-cykel-a`,
  kopierade in för hand: det ska gå direkt från Docka till Bordets beställning), Naturlig till P5.C1 orörd: given
  `data/giv-fran-2-3-p5c1-naturlig-paow.json` (3,0 s, 30/s; `ut/docka-naturlig-p5c1-a`) och given med retur i samma
  film `…-naturlig-cykel-paow.json` (4 s, 24/s; `ut/docka-naturlig-p5c1-cykel-a`); kortet ligger från ruta 70, handen
  lyfter från 77, sista rutan = första. `tools/docka-cykel.ts --to P5.C1 --no-standard --sam-hand --recipe-grip-yaw`
  ger samma rutor (**Köra**).
  Jakobs dom på filmen av -a: "Rätt", men högerhanden för vriden vid nedsläppet (handleden 68° i sidled). **-b**
  (`…-naturlig-cykel-b-paow.json`, `ut/docka-naturlig-p5c1-cykel-b`) är -a med `--flat-hand`: handleden vid
  nedsläppet −68° → −4° i sidled och 35° → 7° upp/ned, handflatan som förut ~18° från rakt ned; ej sedd av Jakob.
  **Mätskripten** i `.runtime/docka-naturlig/` (`lib.ts`, `nat.ts`, `grip.ts` m.fl.) och `v2/`: `tumme.ts` (tummen
  per plats), `sidan.ts` (sidans väg och hans P5.C1), `titt.ts` (headless-titten under låset, egen port 4393).
  **Gör inte om**: tummen under kortet mitt emot pekfingret; tummen runt kanten (`chainTo` böjer bara i tummens plan);
  djupare grepp utan lyft (pekfingret genom kortet); armbågen med tak 1,2 rad.
  **Kvar, i ordning**: (1) Jakob 2026-11-23: "Kan du sätta 2 sekunder som standard kanske för att spela upp en giv til
  len spelare i stället för 3 sekunder som standard? men aknske så man kan göra detta valbart också i "Docka"." Ett val
  2 s/3 s, 2 s förval; sparade standarder som sparade. Tempo går i dag högst till 100 % för svepen, så 2 s (150 %)
  prövas först; filmmodellens kortaste film är 3 s, så vad en 2 s referensfilm gör med en beställning prövas innan en
  sådan görs. (2) Ramen i studion: sidan efter ramens storlek, duken i filmens format (inte påbörjad). (3) Tummen i
  rullgivarna (D.C1, D.C3, P6.C1, P7.C1: ringgrepp, pekfingret rör kortet av och på). (4) Vändningen: om plats 7, kort
  1 vid 0,96 s "kortet vänds ju itne på ett naturligt sätt" (lugnt nu: mall 14 säger att dockan är en grund för
  rörelsen, inte för kortets vändning). (5) Inbäddat läge, kontraktstester, prov i `assets/proofs/`. Labbets kamera är 1764 × 1174
  (FILM), kortplanen och dockans stillbild 1762 × 1174. För framtiden: A2.2, "kan man inte typ för just "A2.2" skapa
  dockans possition utifrån fotot/ankaret 2.2). Sedan utifrån denna så kanske man själv kan sttälla in röreslsen geom
  olika val."; och dockan tar över Siluetten i Scen & Bord: "där fins ju alla val typ ändå för handvrisningar och så
  vidare, men bara att dessa måste sättas samman med dockan på ett bra sätt." **Ramen**: ankarna och slutbilden som i
  dag, lagrade rörelser och `dealer3d/standard/` orörda, inga filmer ändras.
- **Ingång och återgång i docklabbet** (2026-11-23; sedd i headless, inte av Jakob). **Giv från** A2.3 (förval, som
  förut) eller A2.1; A2.2 är avstängd (bara ankarbilden finns, ingen ställning är läst ur den). Från A2.1 finns bara
  Pamelas avlästa enhandsgivar (`giv-pamela-p1/p3/p4/p5`, plats 1, 3, 4 och 5, kort 1), lagda med filmens sko
  (`lay.ts readDeal`: kortet och vänsterhanden flyttas stelt till skon medan kortet är där, armbågen löses om); inga
  reglage, ett sätt. **Giv / Giv och återgång** (förval Giv): återgången är `natural-lab.ts withReturn`, samma som
  `tools/docka-cykel.ts` (`src/return-cycle.ts`; från A2.1 lyfts vänsterhanden). **Standardernas namn**:
  `standard/<docka>-<plats>.json` är A2.3 (alla äldre filer, lästa som de är), `<docka>-a2-1-<plats>.json` är A2.1
  (`a2-2` hålls för A2.2); filen bär `lab.from`, och med återgången `lab.back` (cykelns uppgifter). **Vänsterhanden
  vid skon i Naturlig** (bara paow; `doll.ts hand.natural`, `naturalDoll`): grundfelet var att SAM:s hand låg 25 mm
  för långt ut och 26° fel vriden, med handryggen 53° fel mot kameran; passad mot MediaPipe på ankare 2.3 (3,3 px
  medel mot 12,5): raka fingrar, lillfingret lyft som hennes, handleden böjd 42°. **Handens vinkel på kortet** i Naturlig: −30°
  som förval (`NATURAL_GRIP_YAW`, Jakob samma dag), också för hans sparade standarder där värdet är tomt (`null`).
  Som förut och standarddockan ger samma rutor som före (avtryck på 34 lägen); Naturlig som förut fås med
  `docka-cykel.ts --sam-hand --recipe-grip-yaw`. Passningen: `tools/docka-hand.ts`.
- **Landningen** (2026-11-23, Jakob: "det är alltid hennes mellanfinger som pekar ned kortet"; sedd i headless, inte
  av honom). Valet Landning i docklabbet, bara i Naturlig: högerhandens slutpose vid det lagda kortet. Förvalen i
  `src/landing.ts` (`LANDINGS`: id, svensk etikett och en engelsk mening för beställningen): `lang` (förval, handen
  som förut), `pek`, `pek-lang`, `toppar` (topparna mot kortets mitt, så långt armen når), `platt`. Egen: fem reglage ovanpå ett förval
  (hur långt in, rullad, handleden, spretar, fria fingrar böjda). Sparas som `lab.landing` {id och det han ändrat};
  utan fältet är det `lang`, och `lang` utan reglage ändrar ingen siffra (`tests/landing.test.ts`; P3.C1, P6.C1 och
  P5.C1 gav samma rutor före och efter). Handen kommer in från två rutor före beat g till rutan kortet ligger, står
  still (också när kroppen rör sig vidare i en giv utan återgång) och går ut under lyftet; armbågen löses om med hennes ben, och en led som skulle gå ned i kortet lyfts
  (kvittot `liftedMm`, labbet varnar). Struket: tummen och pekfingret som släpper vid kanten (i filmens storlek som
  `pek`, tummen skymd). `platt` på P3 och P6: pekfingrets topp ligger strax utanför kortets sida. Mätskript och bilder:
  `.runtime/docka-landning/`.
- **Kedja paow-filmer**: ingångsfilmen till A2.3 (`data/till-ankare-2-3-c.json`) är standarddockans. `doll-pose.ts`
  på den börjar i hennes vila och slutar där paow-givarna börjar (armbågar och handleder 0,0 mm isär, prövat
  2026-11-23), men ingen film är gjord av den.
- **Dockan i studion** (2026-11-23): under korten i Bordets Kortplan ligger den valda dealerns docka ("Docka: Paow"
  för Paow; en dealer utan egen docka får "Docka: Standard"); Siluett finns inte kvar. Listan har hennes docka först,
  sedan de andra och sedan hennes filmer; ett annat val står i adressen (`?bakgrund=docka-standard`), och en äldre länk
  med `bakgrund=neutral` visar dealerns docka. `node tools/placement-backdrop.ts` bygger en bild per docka
  (`docka-<docka>.jpg`): bordet och skon, dockan över, skon överst. Dockan kommer ur `doll-still.ts` (vila: första rutan i `till-ankare-2-3-c.json` ställd på dockan, genomskinlig, 1762 × 1174), som
  verktyget kör först, under låset. Paows händer ligger där som i hennes vilobild (`paow-vila-tatuerad`).
- **Känd avvikelse:** standarddockans vila har händerna som rörelsen har dem: höger inom 3 px från vilobilden i
  `data/dealer-standard.json`, vänster (till höger i bilden) 15 px längre in (marginalen där är 8 px). Den får stå tills vidare.
- **Räckvidd** (`tests/doll.test.ts`): med handen närmast platsen når paow alla 17 platser i Jakobs plan inom 9°; med
  höger hand, som lägger alla sitsfilmer hittills, säte 1–5 och dealerns platser. Säte 6 kräver med höger hand
  10,7–11,4° för henne (standarddockan 8,7–10,2°) och säte 7 når hon inte med den (standarddockan 17,9–19,9°).
- **SAM-dockan med alla leder** (Jakobs ja 2026-11-23; inte byggd). Det som finns: modellfilen i SAM-checkouten
  (`checkpoints/sam-3d-body-dinov3/assets/mhr_model.pt`) är en riggad modell, inte bara en yta per bild: 127 leder
  med föräldrar och viloläge, en yta med 18 439 hörn och hudvikter (1–4 leder per hörn), 45 formtal. Körd på
  processorn med en läsnings sparade tal (`shape`, `mhr_model_params`) ger den läsningens yta och leder tillbaka på
  0,000 mm, så varje sparad läsning ger ledernas vridningar utan att SAM körs igen. `Doll.skeleton` är typat men
  tomt. Det som saknas: (1) ytan och vikterna ut ur modellen till något scenen ritar (three.js `SkinnedMesh` eller en
  GLB som `src/figure-model.ts` ställer); otestat om ytan ser bra ut utan modellens egna rättningar per ställning;
  (2) hennes storlek och plats: SAM gissar henne 8 % för liten, och olika per bild, så hon ställs efter händernas
  beröring som `paow` (0,38 m bakom kanten); (3) en omställning från rörelsens få leder (axlar, armbågar, handleder,
  21 handpunkter, huvud, höft) till hela skelettet, eller vridningarna direkt ur läsningar av hennes godkända filmer;
  (4) fingrarna: SAM läser höger hand inom 3 px men lägger vänsterhandens fingertoppar 13–16 px för långt ut vid
  skon; (5) att den förblir vit (Jakob: "Nej, vita dockan räcker").

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

Filma en vit docka från bankens kamera i en ny utdatamapp med installerade Chrome, FFmpeg och ffprobe:

```powershell
node dealer3d/tools/render-reference.ts --motion dealer3d/data/giv-fran-2-3-p4-f.json --out .runtime/p4-referens-ny --closeup 17,20,22,24 --crop 560:440:760:560
```

Inspelningen tar och släpper det delade låset för grafikkortet och headless Chrome. Den äger sin Chrome-profil och filserver.
`--eye 1` väljer stol 1, `--seconds` ersätter rörelsens längd och `--sheet` väljer arkets rutnummer från 1.
För att upprepa en körning, använd `rorelse.json` med `--motion`, `kortplan.json` med `--plan` och inställningarna
i `renderkvitto.json` med samma kod och verktyg. Kvittot anger de färdiga filernas SHA-256. `ofullstandig.txt` markerar
en avbruten eller misslyckad körning. En vidare körning behöver en ny mapp. Lås först vid direkt användning av `shoot.ts`.
Mellanrutorna rensas när filmkontroll, kontaktark och slutruta är klara. `--keep-frames` behåller dem för felsökning;
misslyckade körningar behåller dem också. Kör `npm run media:status` efter städning och registrering av valt resultat.

### En giv och retur i samma cykel

P4.C2-provet använder H:s takt men C2:s egen plats. `--contact-grip landing` håller pekfingret vid kortet till
landning. C2 väljer 180° handbyte, 2° framåtlutning och lösta armbågar; annan handbytesvinkel avvisas. Kvittot
redovisar både planens avsikt och provets verkliga handbyte. C1:s befintliga H-data ska vara byteidentiska.

```powershell
node dealer3d/tools/deal-film.ts --to P4.C2 --seconds 4 --beats 4,15,20,36,22,45,58,70 --right-at 1180,887,83 --meet 1 --push 0.004 --single 1 --carry 0.045 --turned-at 0.01 --roll 1 --tuck 300 --contact-grip landing --out <ny-giv.json>
node dealer3d/tools/return-cycle.ts <ny-giv.json> <ny-cykel.json> --hold 76 --ready 116 --duration 4 --lift 0.022
node dealer3d/tools/render-reference.ts --motion <ny-cykel.json> --out <ny-mapp> --seconds 4 --fps 24
```

En dockfilm med giv och återgång till valfri plats, lagd som Docklabbet lägger den med Giv och återgång (Naturlig,
eller Jakobs sparade standard för docka, ingång och plats där en finns, i det val han sparade den i), görs i ett steg.
Det skriver en ny datafil och renderkommandot; `--from` är ingången (A2.3 om den utelämnas, A2.1 för Pamelas avlästa
givar), `--no-standard` lägger platsen som om ingen standard fanns, `--flat-hand` lägger högerhanden plan vid
nedsläppet (bara Naturlig), `--sam-hand --recipe-grip-yaw` lägger Naturlig som före 2026-11-23, och cykelns flaggor är
`return-cycle.ts`:s. Det styrda i en Naturlig standard går ut under återgången, så att sista rutan är den första.
Landningen är standardens `lab.landing` (utan den `lang`); `--landning <id>` tar ett förval i stället (bara Naturlig).
Verktyget skriver raden `landning <id>` (`ingen` utanför Naturlig, ` (egen: …)` med hans reglage), och kvittot i
`made.landed`.

```powershell
node dealer3d/tools/docka-cykel.ts --to P5.C1 --out dealer3d/data/<ny>.json [--from A2.1] [--doll paow] [--no-standard] [--flat-hand] [--landning pek]
```

Cykelverktyget bevarar given till och med ruta 76, lyfter handen 22 mm och återgår till exakt startruta från 116.
Kortet ligger kvar. Källans SHA-256 följer med; utfilen måste vara ny. För kort retur, kort som inte ligger plant
och stilla samt armpositioner som inte kan nås avvisas. Punktförflyttningen begränsas till 2 m/s. Detta är en ny,
reproducerbar returbana, inte en återställning av den äldre H24-svansen. Granska filmen före betald generering.

## Kvar

- **Standarddockans startställning**: posefilmen `data/till-ankare-2-3-c.json` håller den gamla skons kort (29,7 mm från
  det nya); labbet flyttar kortet när den visas, filen är orörd. En ny posefilm med rätt sko görs under nytt namn.
- **"Ihoptryckt"** (skoagentens fynd, skattat, inte rättat): linsen passades med henne 0,18 m bakom bordskanten, dockan
  står 0,38 m bakom; från andra kameror än filmens sitter hon därför cirka 8 cm för lågt.
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
