# Filmmodellerna

Det projektet har lärt sig om filmmodellerna som har gjort filmer för Pamela och Paow: vad var och en kostar och används
till, hur dess filmer ser ut i banken, vad den gör med henne, ljuset och kortet, och vad Jakob och granskarna har sagt
om dem. Läs sidan innan du väljer en modell, beställer en film med en ny modell eller för in en ny modells filmer i
banken.

Sidan upprepar inte reglerna för en beställnings text och bilder, och inte vad varje omgång lärde: de står i handboken
[tools/film-prompting.md](../tools/film-prompting.md) (§1–4 reglerna, §5 metoderna och omgångarna). Hur en film granskas
står i [tools/film-review.md](../tools/film-review.md), vägen från bild till dealer i
[tools/dealer-line.md](../tools/dealer-line.md).

Skriven 2026-11-13. **Märkning:** (M) = mätt, eller läst i ett register, i kod eller i ett kvitto. (Ö) = bedömt med
ögat: Jakobs dom eller en granskares. (S) = skattat, en slutsats som inte är prövad. Jakobs domar hålls isär från
granskarnas och från de preliminära (`review.provisional`). Där ett tal kommer från ett skript utanför repot står
skriptet; de som skrevs för den här sidan ligger i `D:/dealer-scratch/tmp/huvudagent11/modeller/` (se "Källor och
skript").

## Det viktigaste

1. **Två modeller gör nästan allt.** WAN 3 har gjort nästan hela Pamelas bank och Paows ingång, vilor, utgång och tidiga
   givar; Kling 4 gör Paows givar sedan 2026-11-13 och helfigursfilmerna (M, `data/order-methods.json`, filerna i
   `assets/motions/`).
2. **De lagrar färgerna olika.** Kling 4 skriver färgerna för BT.709 och märker filen så. WAN 3 skriver färger som
   ligger närmast första bilden när de läses som BT.601, och märker inget. Efterarbetet tar bort märkningen och behåller
   värdena, så banken har två familjer av filmer i omärkta filer (M).
3. **Det syns vid en skarv.** Vid första rutan är hon i Kling 4 cirka 4 nivåer mörkare i rött och grönt och 2 blåare än
   i WAN 3. WAN 3 blir dessutom cirka 2 nivåer ljusare under en film. Där en WAN 3-film slutar och en Kling 4-film
   börjar hoppar hon därför cirka 6 nivåer, mellan två WAN 3-filmer cirka 2, mellan två Kling 4-filmer inget (M).
   Hoppets storlek beror inte på hur webbläsaren läser filmerna; vilken familj som ser ut som ankaret gör det. Chrome
   läser dem som BT.709, och då är det Kling 4 som ser ut som ankaret (M, scenbanan 2026-11-13).
4. **Takten skiljer.** WAN 3 ger 30 bilder i sekunden, alla Kling-modeller 24. Talfilmerna är 24 i sekunden men gjorda
   av en WAN 3-vila på 30, så hon andas i 0,8 gånger farten där (M).
5. **I Jakobs domar skiljer sig modellerna mindre än hos granskaren.** Paows öppna givar (till spelarna och dealerns
   första kort): Kling 4 9 av 16, WAN 3 4 av 7. Granskarens medel för given: Kling 4 2,0/5, WAN 3 1,2/5. Helfigur: Kling
   4 håller, WAN 3 föll alla fyra gånger (M, Ö).
6. **Modellerna gör olika med henne.** Kling 4: mjukare ansikte, fylligare och rosare läppar, blåsvart kavaj. WAN 3:
   munnen öppen i vilor, koksgrå kavaj, och utan referensfilm ofta ett tryckt spelkort i stället för det enfärgade (Ö).
7. **Postens modell måste stämma.** Spelet skickar `source.model` med varje film till 3D-scenen, och utjämningen mellan
   familjerna (`filmEven`) väljer efter den. Två av Pamelas helfigursfilmer stod som `wan3` fast de är gjorda med
   Kling 4; posterna rättades 2026-11-13 (M; se "Var modellen står").

## Modellerna som har gjort filmer

Filmer i banken = filer `assets/motions/<klipp>/source.mp4` som en post eller ett utsnitt namnger, räknade 2026-11-13
med `count-films.mjs` (M). Pris ur `data/order-policy.json` om inget annat sägs (M). Tid = från LAGD till KLAR i
kvittonas historia (`assets/orders/*/receipt.json`), en övre gräns eftersom beställningsagenten frågar med mellanrum (M,
`orders.mjs`).

| Modell (id) | Används i dag till | Pris | Tid, median (spann, antal) | Filmer i banken |
|---|---|---|---|---|
| WAN 3 (`wan3`) | Ingång 1 → 2.1 (`gäller`); vila, utgång och hålkortets vändning (`prov`) | 20 per s i 1080p, 5 i 480p | 3,9 min (2,1–11,9; 43) via Beställ; 2,6 min (1,4–8,8; 78) via API | Pamela 111, Paow 22 |
| Kling 4 (`kling-4`) | Varje giv från ankare 2.1 (`prov`, mitten, ytter, dealern); helfigur | 21,3 per s i 1080p (listpris 23,5); 15,7 i 720p; ordern räknar 150 för 7 s, med referensfilm 149–189 (dealer-line) | 5,9 min (4,0–13,9; 41) | Paow 26, Pamela 2 |
| Kling 3.0 4K (`kling-3-4k`) | Beställs inte längre (`MODELS['kling-3-4k'].off`) | 43 per s (listpris); 4 s = 172 | 4,1 min (1) | Paow 1, och dess baklänges kopia |
| Kling 3.0 Pro (`kling3.0_pro`) | Kontrollprovet 2026-11-10, underkänt för vändningen | 48 för 4 s (API, `generation.json`) | 3,1 min (1) | Pamela 1 (arkivet) |
| Kling 3.0 Motion Control | Inget; prov b1a 2026-11-11 föll | – | – | 0 |
| Aleph 2 (`aleph2`) | Inget; rättad kopia av en film, underkänd | 112 (API) | 1,6 min (1) | Pamela 1 |
| Seedance 2.5 | Inget; bara en förhandsfil via MCP | 68 per s plus 34 per s referensfilm (handboken §2) | – | 0 |
| MuseTalk på en WAN 3-vila | Talfilmerna: munnen ritas lokalt, rösten från ElevenLabs | ElevenLabs per tecken; renderingen lokal | – | Paow 50 |
| Nano Banana Pro | Stillbilder, inte film: keystone, ankare 1 och 2.1 | 40 per 4K-bild, 20 per 2K | 1,8 min (0,8–3,7; 8) | – |

- Pamela har dessutom fem sammansatta filmer (de äldre sekvenserna och materialfilmerna i arkivet) utan en enskild
  modell.
- Övervägda men aldrig beställda: `wan3_prime` och `seedance2` (`evidence/runway-production-contract.json`) (M).
- API-vägen drar developer-projektets krediter, Beställ (Runways MCP-server) appkontots (DRIFT, "Runway") (M).
- Utan post i banken ligger dessutom tre WAN 3-filmer och en Kling 4-film för Pamela från omgång 15 (2026-11-11):
  `pamela-p2-c1-plan-deal-02`, `pamela-p3-c1-plan-deal-04`, `pamela-p6-c1-plan-deal-02`, `pamela-p6-c1-plan-deal-03`.
  Ingen lista nämner dem, så ingen vy visar dem (M).

## Fingeravtryck: filmen som den kommer och som banken har den

Leveransen ur `fetched.json` (85 tagningar från Beställ), banken ur ffprobe på varje `source.mp4` (`integrity.mjs`),
efterarbetet ur `TREATMENTS` i `src/film-after.ts` (M). Ljuset över filmen är lagrat Y i en ruta över ansiktet (820,
110, 120 × 170), sista rutan minus första, i alla tagningar från Beställ som har en `after.mp4` (M, `ends.mjs`).

| | WAN 3 | Kling 4 | Kling 3.0 4K | Talfilm (MuseTalk) |
|---|---|---|---|---|
| Levererad storlek | 1764 × 1174 (`ratio: adaptive`) | 1764 × 1172; i 16:9 1920 × 1080 | 3528 × 2348 | – |
| I banken | 1764 × 1174 | 1764 × 1174 (två rader till); helfigur 2088 × 1174 | 1764 × 1174 | 1764 × 1174 |
| Bilder per sekund | 30 | 24 | 24 | 24, vilans 30-rutor numrerade om (`bridgeFilter` i `src/speech-plan.ts`) |
| Rutor | 30 per s: 4 s = 120, 7 s = 210; efterarbetet tar bort de två sista (208) | 24 per s plus en: 5 s = 121, 7 s = 169; alla kvar | 4 s = 97 | 34–107 |
| Färgmärkning i leveransen | ingen | BT.709, begränsat omfång | ingen | – |
| Färgmärkning i banken | ingen | ingen | ingen | ingen |
| Färgerna ligger närmast första bilden | läst som BT.601 | läst som BT.709 | läst som BT.601 (efter lyftet) | som vilan, alltså WAN 3 |
| Ljud i leveransen | nej | alltid | nej | ja, AAC |
| Efterarbetet | två sista rutorna bort, grönt till ankarets, henne lyft till första bilden | skalas, grönt till ankarets, inget lyft, ljudet bort | skalas, grönt, lyft | – |
| Ljuset sista minus första rutan | +1,7 (0,1 till 3,2; 41 tagningar) | +0,1 (−0,4 till 0,7; 41) | +3,0 (1) | inte mätt |
| Ansiktet (Ö) | munnen öppen eller tänder i 4 av 6 granskade vilor | mjukare, tatueringarna suddas; fylligare, rosare läppar | mjukare tatueringar, ingen skärpevinst | tunnare läppar, mjukare haka |
| Kavajen | koksgrå (Ö); mätt i första rutan cirka 3 nivåer ljusare än Kling 4 i rött och grönt, 1 i blått | blåsvart (Ö) | – | som vilan |
| Kortet (Ö) | utan referensfilm ofta tryckt spelkort; byter färg utan kantruta | följer referensfilmens väg och takt; byter färg halvvägs, kapas, mjukt i vändningen | – | – |
| Kortet landat, medel (M, MÄTT-noter) | 1,4 px från planen (10) | 0,6 px (14) | – | – |
| Granskarens medel för given (M) | 1,2/5 (19) | 2,0/5 (10) | ingången 3/5 (1) | 3/5 (HANDOFF) |

Övrigt per modell:

- **WAN 3** (M): de två sista rutorna mörknar i varje film. Utan efterarbete glider det gröna, cirka 11 nivåer på 6 s
  (handboken §4); i Pamelas filmer, som inte har efterarbetet, ligger grönt i sista rutan 10 nivåer under bilden filmen
  beställdes med, mot 0 i första rutan (`pamela-ends.mjs`, 66 filmer). Koden antar att en genererad film är ljusare i
  sina första rutor och hoppar i de två sista, och spelar därför vila, vändning och helfigur från ruta 3 till tre rutor
  före slutet (`IDLE_RULE` i `src/clip-graph.ts`). I Paows efterarbetade WAN 3-vilor är första rutan i stället den
  mörkaste (M, `ends.mjs`).
- **Kling 4** (M): den enda modellen i vårt verktyg som tar första och sista bild tillsammans med en referensfilm, och
  den kopierar referensens rörelse nästan bildpunkt för bildpunkt (handboken §1). En mellanbild läses som referensbild,
  inte som en ruta i tiden. I 30 s hoppar den mellan scener (b2: 16,3 och 20,2 s) och det gröna pulserar (G 206–234)
  (handboken §4).
- **Kling 3.0 4K** (M): inte skarpare än WAN 3 i bankens ruta, mjukare tatueringar, 172 krediter mot 80
  (`MODELS['kling-3-4k'].off` i `src/order-model.ts`). Jakob: "det är dumt att ta ett klipp i 4K om övriga klipp inte är
  i 4K".
- **Kling 3.0 Motion Control** (M, handboken §3.8): tar ingen sista bild; b1a gav 44/100, kortet genomskinligt grönt i
  ruta 30–84, skons fönster tomt från ruta 48, kortet 73 px fel, filmen 1760 × 1184.
- **Aleph 2 och andra video-till-video** (M, handboken §5): Pamelas ansikte kom tillbaka och skons fönster tömdes
  (`paow-samma-film`); Pamelas rättade kopia `pamela-p1-c1-plan-deal-03-edit-02` är underkänd.
- **MuseTalk** (M, [docs/TAL.md](TAL.md)): bara en låda på cirka 184 × 190 bildpunkter kring munnen byts; resten är
  vilans egna rutor och värden, så talfilmen hör till WAN 3-familjen. Ljudet börjar 0,22 s in.

## Ljuset vid en skarv

Jakob såg den 2026-11-13: vid 1.08 i en inspelad runda blir Paow tydligt mörkare. Där byter spelet från en WAN 3-film
till en Kling 4-film (huvudagentens mätning, `D:/dealer-scratch/tmp/huvudagent11/ljus/LASMIG.md`).

**Varför.** Ett videoformat lagrar ljus och färgskillnad (Y, U, V), och en spelare räknar om dem till rött, grönt och
blått med en av två formler, BT.601 eller BT.709. Kling 4 skriver sina filmer för BT.709 och säger det i filen. WAN 3
säger inget, och dess värden ligger närmast första bilden när de läses med BT.601 (cirka 3 nivåer under den); det gäller
också Pamelas filmer, som aldrig har lyfts i efterarbetet (M, `pamela-ends.mjs`: −2,8 −2,1 −2,8 i 66 filmer).
Efterarbetet (`tools/film-after.ts`) läser varje leverans som BT.601 och skriver tillbaka utan märkning, så värdena står
kvar som modellen skrev dem. Ingen av bankens 223 registrerade filmer har färgmärkning (M, `integrity.mjs`).

**Hur mycket.** Hennes ansikte i filmen minus samma ruta i bilden filmen beställdes med (`first.png` för första rutan,
`last.png` för sista), rött, grönt, blått i nivåer av 255, medel över 41 tagningar per modell (M, `ends.mjs`):

| | Läst som BT.601 | Läst som BT.709 |
|---|---|---|
| WAN 3, första rutan | −2,9 −2,1 −3,4 | +3,7 +4,0 −5,0 |
| WAN 3, sista rutan | −0,5 −0,4 −0,8 | +6,0 +5,8 −2,3 |
| Kling 4, första rutan | −6,5 −6,5 −1,3 | 0,0 +0,2 −2,6 |
| Kling 4, sista rutan | −6,5 −6,3 −1,3 | 0,0 +0,3 −2,6 |

Spridningen mellan tagningarna är 0,1–0,6 nivåer i första rutan och 0,7–1,5 i sista. Scenbanan mätte första rutan i alla
143 Paow-filmer mot ankaret och fick samma siffror (`D:/dealer-scratch/tmp/levande-objekt/ljus/familjer.mjs`): läst som
BT.709 stämmer Kling 4 (0, 0, −3) och de andra är varmare (+3, +4, −5); läst som BT.601 stämmer de andra (−3, −2, −3)
och Kling 4 är mörkare (−7, −6, −1) (M).

**Hoppet vid en skarv** vid ankare 2.1 (där en tur och retur slutar och nästa giv börjar) är nästa films första ruta
minus förra filmens sista, räknat ur tabellen (M, `steps.mjs`):

| Förra filmen → nästa | Läst som BT.601 | Läst som BT.709 |
|---|---|---|
| WAN 3 → Kling 4 | −6,1 −6,0 −0,5 | −6,2 −5,6 −0,2 |
| Kling 4 → WAN 3 | +3,7 +4,3 −2,1 | +3,8 +3,8 −2,4 |
| WAN 3 → WAN 3 | −2,3 −1,6 −2,6 | −2,4 −1,7 −2,6 |
| Kling 4 → Kling 4 | 0,0 −0,1 0,0 | −0,1 −0,1 0,0 |

Det betyder:

- Hoppet är lika stort hur webbläsaren än läser filmerna. Läsningen avgör bara vilken familj som ser ut som ankaret (M).
- Två saker läggs ihop: familjeskillnaden (cirka 4 nivåer i rött och grönt) och att WAN 3 ljusnar under filmen (cirka 2
  nivåer i rött och grönt och 2,5 i blått från första till sista rutan, men inte i Kling 4). En vila i WAN 3 slutar
  0,6–2,8 nivåer (Y) ljusare än den börjar, så varje byte från vila till vila går ned lika mycket (M). Att det är de tre
  ljusstegen mellan två WAN 3-klipp som granskaren såg i inspelningen 2026-11-13 är skattat (S; granskarens skript
  `D:/dealer-scratch/tmp/huvudagent11/chefsfilm/granskning-1/work/cutstep.py`).
- Det gröna säger inget om vilken läsning som är rätt: efterarbetet sätter varje rutas gröna på ankarets nivå läst som
  BT.601 (`levelFrame` i `src/film-after.ts`), så grönt stämmer med BT.601 i varje film oavsett modell (M).
- Också inom en modell skiljer tagningarna: kavajen är koksgrå i en och blåsvart i nästa, ansiktet två nivåer mörkare
  (Ö, scenbanan).

**Avgjort 2026-11-13 (M, scenbanan):** Chrome läser en omärkt film i bankens storlek som BT.709
(`VideoFrame.colorSpace` säger `bt709`; 2D-canvas och WebGL-textur ger samma tal). Då ser Kling 4 ut som ankaret
(ansiktet 223,6 / 149,6 / 130,6 mot ankarets 223,5 / 148,3 / 132,6) och WAN 3 är varmare (228,2 / 153,8 / 128,5).
Utjämningen görs i 3D-scenen som ett val, nyckeln `filmEven` (scenbanans arbete), i två delar. Filmer från WAN 3,
talfilmerna och Kling 3 läses om med BT.601, en 3 × 3-matris efter nyckeln mot det gröna, valt efter postens
`source.model`. Och en ny film börjar i den gamlas ton och går över till sin egen på tre sekunder, vilket tar stegen
mellan två filmer från samma modell. Mätt i fem skarvar blev steg på 4–7 nivåer på ansiktet 0–2. Bankens filer är
orörda.

**Inte avgjort:** om efterarbetet ska läsa Kling 4 med BT.709 för nya filmer, och om bankens filer ska märkas. Att
efterarbetet läser Kling 4 som BT.601 står också under "Kända brister" i HANDOFF.

## Vad som håller och vad som faller, per sorts film

Räknat ur `review` i `motions/` och kanterna i banken (`verdicts.mjs`; givar för Paow också med
`node tools/verdicts-per-method.ts paow`). Ja = Godkänd eller Primär, var = Variant, nej = Underkänd. "Utan ord" är
äldre domar utan Jakobs ord i posten. Granskarens poäng ur kvittonas GRANSKAD-noter (`notes.mjs`) och handboken (M;
domarna Ö).

| Sorts film | Pamela, Jakobs dom | Paow, Jakobs dom | Paow, preliminär | Granskaren | Anteckning |
|---|---|---|---|---|---|
| Ingång 1 → 2.1 | WAN 3: 1 ja | WAN 3: 1 var; Kling 3.0 4K: 1 ja | – | WAN 3 3,5/5, 4K 3/5 | WAN 3 gäller; blicken rör sig inte utan ord om den |
| Vila | WAN 3: 3 ja, 15 var, 1 nej (+1 nej utan ord) | WAN 3: 1 ja, 7 var | – | 1–3/5, mest för munnen | Håller för Jakob; munnen olöst |
| Öppen giv till mittplats (P3–P5) | WAN 3: 3 ja, 4 var, 2 nej (+3 nej utan ord) | Kling 4: 4 ja, 1 var, 2 nej; WAN 3: 1 ja, 1 var, 1 nej | – | Kling 4 2,0/5, WAN 3 1,2/5 (alla givar) | Kling 4 med referens till samma plats är det som har vänt kortet vid platsen |
| Öppen giv till ytterplats (P1, P2, P6, P7) | WAN 3: 2 ja, 3 var, 2 nej, 2 sekundära (+1 nej) | Kling 4: 4 ja, 5 nej; WAN 3: 1 ja, 2 nej | Kling 4: 1 ja (plats 7), 4 nej (plats 2 och 6) | som ovan | Plats 6 har fallit fjorton gånger med båda modellerna |
| Dealerns första kort | WAN 3: 1 var | WAN 3: 1 ja ("Den är mycket bra.") | – | 1/5 | |
| Stängt kort till en spelare | – | WAN 3: 4 nej; Kling 4: 1 nej | – | | Faller för Jakob oavsett modell: spelarnas kort ska landa öppna |
| Hålkortet, stängt | WAN 3: 1 nej | – | Kling 4: 1 ja | | |
| Hålkortets vändning | WAN 3: 4 ja | – | Kling 4: 1 ja; WAN 3: 1 var | | |
| Retur i samma film som given | WAN 3: 21 ja, 8 var, 3 nej (+2 nej) | Kling 4: 12 ja, 4 var, 1 nej; WAN 3: 5 ja, 1 var, 5 nej | Kling 4: 4 ja | 2,0/5 för båda | Fyra av WAN 3:s fem nej är returer efter en stängd giv |
| Utgång 2.1 → 1 | WAN 3: 1 nej | Kling 3.0 4K baklänges (nödlösning): 1 ja | WAN 3: 1 ja | | |
| Helfigur (kommer in, går) | Kling 4: 2 ja; WAN 3: 4 nej | – | Kling 4: 1 ja, 1 var | utgången 4/5 | Kling 4 i 16:9, två delar per film (handboken §3.9) |
| Talfilm | – | 50 ej dömda | – | 3/5 | Munnen är rendererns |

Läs tabellen med två förbehåll. En dom gäller en film, inte en modell: texten, referensfilmen och platsen skiljer också
(handboken §5 har domarna per metod). Och för öppna givar är Jakobs domar nästan lika för de två modellerna, 9 av 16 för
Kling 4 och 4 av 7 för WAN 3, medan granskaren ger Kling 4 nästan dubbelt så högt; metoden väljs efter hans domar (M).

## Kontrollen: avvikelser att se efter i en film från vilken modell som helst

Kör den på en ny modells första tagningar och på varje film som ska in i banken. Inget i repot vägrar efter de här
gränserna utom där det står; resten är granskningens och den här sidans.

| Kontroll | Hur den mäts i dag | Vad som har setts |
|---|---|---|
| Bilder per sekund | ffprobe; `film.fps` i `fetched.json`; `source.fps` i posten. Scenen spelar varje film i sin takt (`fpsOf` i `src/game-film.ts`) | WAN 3 30, Kling 24, talfilm 24. Granskaren såg takten byta vid skarvarna (Ö) |
| Storlek och form | `fetched.json`; `tools/film-after.ts` vägrar en annan form än första bildens; en order vägrar bilder i annan storlek (`readRgb`) | Kling 4 1764 × 1172, 4K 3528 × 2348, 16:9 1920 × 1080; skalas till bankens ruta |
| Rutornas antal och slutet | ffprobe, och rutorna i slutet | WAN 3 mörknar i de två sista rutorna; vilan är ljusare i de första |
| Färgmärkning och ljudspår | `film.colour` och `film.audio` i `fetched.json` | Kling 4 BT.709 och ljud; WAN 3 inget; efterarbetet stryker båda |
| Färgen mot ankaret, första och sista rutan, med båda formlerna | `ends.mjs`, `familjer.mjs`, `mot-ankare.mjs`, `skarv.mjs` (utanför repot, se Källor) | Tabellerna under "Ljuset vid en skarv". En skillnad på 4–6 nivåer mot grannfilmen såg Jakob |
| Drift i ljuset över filmen | `ends.mjs` (Y per ruta), `steg.mjs` på en inspelning; MÄTT-noten i kvittot ("Slutet 4,3 nivåer från last.png") | WAN 3 +1,7 (upp till 3,2); Kling 4 +0,1 |
| Grönt | Efterarbetet sätter det på ankarets nivå och skriver nivåerna i `after.json` | Utan efterarbetet: WAN 3 cirka 11 nivåer på 6 s, Kling 4 G 206–234 på 30 s |
| Ansikte och kropp mot ankaret | Granskaren i full upplösning (`tools/film-review.md`); händer och kropp per ruta `tools/python/filmmatt.py`; bordskanten rad 831,5 (`edgeCheck` i `src/film-after.ts`) | Kling 4 mjukare ansikte, fylligare läppar, blåsvart kavaj; WAN 3 öppen mun i vilor; båda stela (Ö) |
| Kortet | `tools/track-card.ts`, `tools/card-coverage.ts`, `tools/flip-axis.ts`; MÄTT-noten (storleken i luften ±10 %, var det landar); granskningens frågor | Tryckt spelkort (WAN 3 utan referens); färgbyte utan kantruta (båda); kortet växer 20–70 % när det lyfts (båda) |
| Loopens skarv (vila) | Första mot sista rutan | WAN 3-vilan slutar 0,6–2,8 nivåer ljusare än den börjar |
| Skarven mot grannfilmen | Sista rutan mot nästa films första, med båda formlerna (`steps.mjs`) | 6 nivåer WAN 3 → Kling 4, cirka 2 mellan två WAN 3, 0 mellan två Kling 4 |
| Hopp och scenbyte | Granskaren ruta för ruta | Kling 4 i 30 s hoppar mellan scener |
| Ljud | `film.audio`; efterarbetet tar bort ljudet; talfilmens ljud 0,22 s in (TAL) | Kling 4 har alltid ljud, som inte ska med |
| Posten mot filmen | `integrity.mjs`: byte, SHA-256, storlek, takt och rutor mot `source` i posten | Stämmer för alla 292 poster som namnger en film (fem äldre saknar `bytes`); `source.model` fel i två (nästa avsnitt) |

## Var modellen står, och felen där

| Ställe | Fält | Vem skriver | Vem läser |
|---|---|---|---|
| Ordern `data/orders/<id>.json` | `generation.model` | Beställ | `tools/film-after.ts` (väljer efterarbetet), `tools/register-order.ts`, Protokoll, `tools/verdicts-per-method.ts` |
| Posten `motions/<klipp>.json` | `source.model` | `tools/register-order.ts` ur ordern; äldre poster för hand eller av borttagna verktyg | Spelet: `filmModel` i `src/game-film.ts` skickar det med varje filmdel till 3D-scenen; en talfilm får sin vilas |
| Kvittot `assets/motions/<klipp>/generation.json` | `model`, `orderedAs` | `tools/register-order.ts`; äldre av gamla labbet | Labbservern läser läget, krediterna och filmens mått (`clipBank` i `tools/preview.ts`), inte modellen; läs `orderedAs` för Pamelas MCP-filmer |
| Jobbfilen `data/clip-jobs.json` | `model` på jobb och utsnitt | `tools/register-order.ts`, `tools/speech.ts` | `buildGraph` bär det i tagningens `job.model`; ett utsnitt utan modell heter `utsnitt` |

Kända fel (M): `pamela-table-arrive-wide-kling-01` och `pamela-table-leave-wide-kling-01` är Kling 4-filmer (24 rutor i
sekunden; `orderedAs: "kling-4, …"`), men både posten och kvittots `model` säger `wan3`. Samma sak i kvittot för den
oregistrerade `pamela-p6-c1-plan-deal-03`. De två helfigursfilmerna spelas när Pamela kommer in och går. En utjämning
som väljer efter `source.model` behandlade dem därför som WAN 3. Posternas `source.model` rättades till `kling-4`
2026-11-13; kvittona står kvar som de skrevs, och domarna i posterna är orörda.

## Före en ny modell

1. Lägg modellen i `MODELS` i `src/order-model.ts` och priset i `data/order-policy.json` (SYSTEM, "Vad labbet skickar").
2. Ge den ett efterarbete i `TREATMENTS` i `src/film-after.ts`; utan det vägrar `tools/film-after.ts`. Bestäm tre saker:
   tas sista rutorna bort, lyfts hon till första bilden, och med vilken formel är leveransen skriven (märkningen i
   `fetched.json`). I dag läses varje leverans som BT.601, oavsett märkning.
3. Beställ en tagning som metodprov enligt handboken, gärna i lägsta upplösning först (WAN 3 480p: 5 krediter per s).
4. Kör kontrollen ovan på tagningen, och mät skarven mot en film av den familj den ska stå bredvid i en runda, på samma
   ankare och med båda formlerna.
5. Se att `source.model` i posten blir modellens id exakt som i `MODELS`.

## Det som inte är känt eller avgjort

- Om efterarbetet ska läsa Kling 4 med BT.709 för nya filmer, och om bankens filer ska märkas (HANDOFF, "Kända
  brister"). Hur webbläsaren läser filmerna är avgjort, se "Ljuset vid en skarv".
- Varför WAN 3 ljusnar under en film. Efterarbetet lyfter henne bara efter första rutan.
- Hur bytet mellan 30 och 24 bilder i sekunden ser ut för ögat i en runda: sett av granskaren, inte mätt.
- Talfilmernas färg mot vilan: inte mätt här (scenbanan: som WAN 3). Pamelas skarvar: inte mätta (ändarna har olika
  pose).
- Kling 3.0 4K, Kling 3.0 Pro, Motion Control och Aleph 2 har en film var. Seedance 2.5 och Kling 4 i 720p är inte
  prövade i bankens format.
- Mina rutor ligger fast i bilden. I första och sista rutan sitter hon i ankarets pose, så de träffar samma kroppsdel;
  under filmen rör hon sig, så spannet i Y är inte bara ljus. Grönt läses 2,3 nivåer för lågt i grönt och blått i varje
  film med min metod, så en avvikelse på 2 nivåer mot bilden ligger inom metodens fel; skillnaden mellan familjerna gör
  det inte.
- Tiderna är övre gränser; kvittona för Pamelas MCP-filmer saknar tider.

## Källor och skript

- Register (M): `motions/`, `data/clip-jobs.json`, `data/orders/`, `data/order-methods.json`, `data/order-policy.json`,
  kvittona `assets/orders/*/receipt.json` och `fetched.json`, `assets/motions/*/generation.json`; koden
  `src/film-after.ts`, `tools/film-after.ts`, `src/order-model.ts`, `src/speech-plan.ts`, `src/clip-graph.ts`.
- Jakobs domar per metod: `node tools/verdicts-per-method.ts paow`; protokollet: `node tools/order-ledger.ts`.
- Handboken [tools/film-prompting.md](../tools/film-prompting.md) §1–5 och [docs/TAL.md](TAL.md).
- Mätta för den här sidan, i `D:/dealer-scratch/tmp/huvudagent11/modeller/` (bara läsning, högst fyra FFmpeg åt gången):
  `integrity.mjs` (varje film mot sin post), `models.mjs` och `count-films.mjs` (modell per film och register),
  `orders.mjs` (leverans, efterarbete, tid och pris per tagning), `ends.mjs` och `steps.mjs` (färgen vid första och
  sista rutan, driften och skarvarna), `pamela-ends.mjs` (samma för Pamelas filmer), `notes.mjs` (granskarens poäng och
  kortets mått ur kvittona), `verdicts.mjs` (domarna per modell och sorts film), `classify.ts` (vad varje post är).
- Andras skript utanför repot: huvudagentens `D:/dealer-scratch/tmp/huvudagent11/ljus/` (`LASMIG.md`, `taggar.mjs`,
  `skarv.mjs`, `steg.mjs`); scenbanans `D:/dealer-scratch/tmp/levande-objekt/ljus/` (`familjer.mjs`, `mot-ankare.mjs`);
  filmgranskarens `D:/dealer-scratch/tmp/huvudagent11/chefsfilm/granskning-1/` (bilderna och `work/cutstep.py`,
  `work/measure.py`).
