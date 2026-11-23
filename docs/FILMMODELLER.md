# Filmmodellerna

Vad varje filmmodell används till och kostar, hur dess filmer ser ut i banken, vad som håller och faller, och kontrollen
för en film från en ny modell. Läs sidan före ett modellval, en beställning med en ny modell eller införandet av en ny
modells filmer. Reglerna för en beställnings text och bilder, och vad varje omgång lärde, står i handboken
[tools/film-prompting.md](../tools/film-prompting.md) (§1–4 reglerna, §5 metoderna och omgångarna); granskningen i
[tools/film-review.md](../tools/film-review.md), vägen från bild till dealer i [tools/dealer-line.md](../tools/dealer-line.md).

**Märkning:** (M) = mätt, eller läst i ett register, i kod eller i ett kvitto. (Ö) = bedömt med ögat: Jakobs dom eller
en granskares. (S) = skattat. Talen är från 2026-11-13 om inget annat sägs; skripten som mätte dem står i Källor och
skript.

## Det viktigaste

1. **Två modeller gör nästan allt.** WAN 3 har gjort nästan hela Pamelas bank och Paows ingång, vilor, utgång och tidiga
   givar; Kling 4 gör Paows givar och helfigursfilmerna (M, `data/order-methods.json`).
2. **De lagrar färgerna olika.** Kling 4 skriver för BT.709 och märker filen så; WAN 3 märker inget, och dess värden
   ligger närmast första bilden lästa som BT.601. Efterarbetet tar bort märkningen och behåller värdena, så banken har
   två familjer i omärkta filer (M). Skärmens gröna är lika i båda, eftersom efterarbetet sätter det på ankarets nivå
   ruta för ruta: skillnaden sitter på henne (M).
3. **Det syns vid en skarv.** Där en WAN 3-film slutar och en Kling 4-film börjar hoppar hon cirka 6 nivåer, mellan två
   WAN 3-filmer cirka 2, mellan två Kling 4-filmer inget (M). Med `filmEven` (förval) är tonen i skarven högst 2,2 nivåer
   fel och tonar ut över 3 s (M).
4. **Takten skiljer.** WAN 3 ger 30 bilder i sekunden, alla Kling-modeller 24. Talfilmerna är 24 men gjorda av en WAN
   3-vila på 30, så hon andas i 0,8 gånger farten där (M).
5. **I Jakobs domar skiljer sig modellerna mindre än hos granskaren.** Paows öppna givar: Kling 4 9 av 16, WAN 3 4 av 7;
   granskarens medel Kling 4 2,0/5, WAN 3 1,2/5. Metoden väljs efter hans domar (M, Ö).
6. **Modellerna gör olika med henne.** Kling 4: mjukare ansikte, fylligare och rosare läppar, blåsvart kavaj. WAN 3:
   munnen öppen i vilor, koksgrå kavaj, och utan referensfilm ofta ett tryckt spelkort i stället för det enfärgade (Ö).
7. **Postens modell måste stämma.** Spelet skickar `source.model` med varje film till 3D-scenen, och `filmEven` väljer
   efter den (Var modellen står).

## Modellerna som har gjort filmer

Pris ur `data/order-policy.json` om inget annat sägs. Tid = från LAGD till KLAR i kvittonas historia, en övre gräns (M).

| Modell (id) | Används i dag till | Pris | Tid, median (spann, antal) | Filmer i banken |
|---|---|---|---|---|
| WAN 3 (`wan3`) | Ingång 1 → 2.1 (`gäller`); vila, utgång och hålkortets vändning (`prov`) | 20 per s i 1080p, 5 i 480p | 3,9 min (2,1–11,9; 43) via Beställ; 2,6 min (1,4–8,8; 78) via API | Pamela 111, Paow 22 |
| Kling 4 (`kling-4`) | Varje giv från ankare 2.1 (`prov`); helfigur | 21,3 per s i 1080p; 15,7 i 720p; ordern räknar 150 för 7 s, med referensfilm 149–189 | 5,9 min (4,0–13,9; 41) | Paow 26, Pamela 2 |
| MuseTalk på en WAN 3-vila | Talfilmerna ([TAL](TAL.md)) | ElevenLabs per tecken; renderingen lokal | – | Paow 50 |
| Nano Banana Pro | Stillbilder: keystone, ankare 1 och 2.1 | 40 per 4K-bild, 20 per 2K | 1,8 min (0,8–3,7; 8) | – |

Prövade och inte att göra om:

- **Kling 3.0 4K** (`kling-3-4k`): inte skarpare än WAN 3 i bankens ruta, mjukare tatueringar, 172 krediter mot 80;
  beställs inte (`MODELS['kling-3-4k'].off` i `src/order-model.ts` har skälet). En film i banken, en ingång, vars
  baklänges kopia är Paows nödlösning för utgången.
- **Kling 3.0 Pro**: kontrollprovet 2026-11-10, underkänt för vändningen.
- **Kling 3.0 Motion Control** (handboken §3.8): tar ingen sista bild; kortet genomskinligt grönt, skons fönster tomt.
- **Aleph 2 och andra video-till-video** (handboken §5): Pamelas ansikte kom tillbaka och skons fönster tömdes; den
  rättade kopian är underkänd.
- **Seedance 2.5**: inget i banken; uppgiftens svar ger en förhandsfil, den fulla filen kommer ur listan över senaste
  genereringar (handboken §4). `wan3_prime` och `seedance2` är övervägda men aldrig beställda.

API-vägen drar developer-projektets krediter, Beställ (Runways MCP-server) appkontots (DRIFT, "Anslutningar och miljö").
Utan post i banken ligger tre WAN 3-filmer och en Kling 4-film för Pamela från omgång 15 (`pamela-p2-c1-plan-deal-02`,
`pamela-p3-c1-plan-deal-04`, `pamela-p6-c1-plan-deal-02`, `pamela-p6-c1-plan-deal-03`); ingen vy visar dem (M).

## Fingeravtryck: filmen som den kommer och som banken har den

Leveransen ur `fetched.json`, banken ur ffprobe på varje `source.mp4`, efterarbetet ur `TREATMENTS` i `src/film-after.ts`
(M). Ljuset över filmen är lagrat Y i en ruta över ansiktet (820, 110, 120 × 170), sista rutan minus första.

| | WAN 3 | Kling 4 | Talfilm (MuseTalk) |
|---|---|---|---|
| Levererad storlek | 1764 × 1174 (`ratio: adaptive`) | 1764 × 1172; i 16:9 1920 × 1080 | – |
| I banken | 1764 × 1174 | 1764 × 1174; helfigur 2088 × 1174 | 1764 × 1174 |
| Bilder per sekund | 30 | 24 | 24, vilans 30-rutor numrerade om (`bridgeFilter` i `src/speech-plan.ts`) |
| Rutor | 4 s = 120, 7 s = 210; efterarbetet tar bort de två sista | 24 per s plus en: 5 s = 121, 7 s = 169 | 34–107 |
| Färgmärkning, leverans / bank | ingen / ingen | BT.709, begränsat omfång / ingen | – / ingen |
| Färgerna närmast första bilden | läst som BT.601 | läst som BT.709 | som vilan, alltså WAN 3 |
| Ljud i leveransen | nej | alltid (tas bort) | ja, AAC |
| Efterarbetet | två sista rutorna bort, grönt till ankarets, henne lyft till första bilden | skalas, grönt till ankarets, inget lyft, ljudet bort | – |
| Ljuset sista minus första rutan | +1,7 (0,1 till 3,2; 41 tagningar) | +0,1 (−0,4 till 0,7; 41) | inte mätt |
| Kortet (Ö) | utan referensfilm ofta tryckt spelkort; byter färg utan kantruta | följer referensfilmens väg och takt; byter färg halvvägs, kapas, mjukt i vändningen | – |
| Kortet landat, medel (M) | 1,4 px från planen (10) | 0,6 px (14) | – |

- **WAN 3** (M): de två sista rutorna mörknar i varje film, och utan efterarbete glider det gröna (cirka 11 nivåer på
  6 s; i Pamelas filmer, som inte har efterarbetet, 10 nivåer under bilden i sista rutan). Koden spelar därför vila,
  vändning och helfigur från ruta 3 till tre rutor före slutet (`IDLE_RULE` i `src/clip-graph.ts`).
- **Kling 4** (M): den enda modellen i vårt verktyg som tar första och sista bild tillsammans med en referensfilm, och
  den kopierar referensens rörelse nästan bildpunkt för bildpunkt (handboken §1). En mellanbild läses som referensbild,
  inte som en ruta i tiden. I 30 s hoppar den mellan scener och det gröna pulserar (handboken §4).
- **MuseTalk** (M): bara en låda kring munnen byts; resten är vilans egna rutor och värden, så talfilmen hör till WAN
  3-familjen.

## Ljuset vid en skarv

Jakob såg det 2026-11-13: vid 1.08 i en inspelad runda blir Paow tydligt mörkare, där spelet byter från en WAN 3-film
till en Kling 4-film. En spelare räknar om filmens Y, U och V till rött, grönt och blått med BT.601 eller BT.709.
Efterarbetet (`tools/film-after.ts`) läser varje leverans som BT.601 och skriver tillbaka utan märkning, så värdena står
kvar som modellen skrev dem; ingen av bankens filmer har färgmärkning (M).

**Första rutan mot ankaret**, alla Paows filmer som börjar på en ankarbild, hennes ansikte i rött, grönt och blått, nivåer
av 255 (M): läst som BT.709 stämmer Kling 4 (0, 0, −3) och de andra (WAN 3, talfilmerna, Kling 3) är varmare (+3, +4,
−5); läst som BT.601 stämmer de andra (−3, −2, −3) och Kling 4 är mörkare (−7, −6, −1). Mot bilden filmen beställdes
med, medel över 41 tagningar per modell:

| | Läst som BT.601 | Läst som BT.709 |
|---|---|---|
| WAN 3, första rutan | −2,9 −2,1 −3,4 | +3,7 +4,0 −5,0 |
| WAN 3, sista rutan | −0,5 −0,4 −0,8 | +6,0 +5,8 −2,3 |
| Kling 4, första rutan | −6,5 −6,5 −1,3 | 0,0 +0,2 −2,6 |
| Kling 4, sista rutan | −6,5 −6,3 −1,3 | 0,0 +0,3 −2,6 |

**Hoppet vid en skarv** vid ankare 2.1, nästa films första ruta minus förra filmens sista (M):

| Förra filmen → nästa | Läst som BT.601 | Läst som BT.709 |
|---|---|---|
| WAN 3 → Kling 4 | −6,1 −6,0 −0,5 | −6,2 −5,6 −0,2 |
| Kling 4 → WAN 3 | +3,7 +4,3 −2,1 | +3,8 +3,8 −2,4 |
| WAN 3 → WAN 3 | −2,3 −1,6 −2,6 | −2,4 −1,7 −2,6 |
| Kling 4 → Kling 4 | 0,0 −0,1 0,0 | −0,1 −0,1 0,0 |

Hoppet är lika stort hur webbläsaren än läser filmerna; läsningen avgör bara vilken familj som ser ut som ankaret. Två
saker läggs ihop: familjeskillnaden (cirka 4 nivåer i rött och grönt) och att WAN 3 ljusnar under filmen (en vila slutar
0,6–2,8 nivåer ljusare än den börjar). Det gröna säger inget om vilken läsning som är rätt, eftersom efterarbetet sätter
det på ankarets nivå läst som BT.601 (`levelFrame` i `src/film-after.ts`). Också inom en modell skiljer tagningarna
(kavajen koksgrå i en, blåsvart i nästa) (Ö).

**Det som gäller.** Chrome läser en omärkt film i bankens storlek som BT.709 (`VideoFrame.colorSpace`), så en Kling
4-film visar henne som ankaret (M). Utjämningen görs i 3D-scenen, nyckeln `filmEven`, i två delar: filmer från WAN 3,
talfilmerna och Kling 3 läses om med BT.601, en 3 × 3-matris efter nyckeln mot det gröna, valt efter postens
`source.model`; och en ny film börjar i den gamlas ton och går över till sin egen på tre sekunder, vilket tar stegen
mellan två filmer från samma modell. Mätt i fem skarvar blev steg på 4–7 nivåer på ansiktet 0–2. Bankens filer är
orörda. Inte avgjort: om efterarbetet ska läsa Kling 4 med BT.709 för nya filmer, och om bankens filer ska märkas
([BRISTER](BRISTER.md), "Kling 4:s färger").

## Vad som håller och vad som faller, per sorts film

Domarna per metod räknas av `node tools/verdicts-per-method.ts paow`; handboken §5 har dem per metod. En dom gäller en
film, inte en modell: texten, referensfilmen och platsen skiljer också. Det som har hållit sig (Ö, räknat 2026-11-13):

- **Ingång 1 → 2.1:** WAN 3 gäller.
- **Vila:** WAN 3 håller för Jakob; munnen är olöst.
- **Öppen giv:** Kling 4 med referensfilm till samma plats är det som har vänt kortet vid platsen. Plats 6 hade fallit
  fjorton gånger med båda modellerna.
- **Stängt kort till en spelare** faller för Jakob oavsett modell: spelarnas kort ska landa öppna.
- **Retur i samma film som given:** båda modellerna håller; de flesta av WAN 3:s nej är returer efter en stängd giv.
- **Helfigur** (hon kommer in, hon går): Kling 4 i 16:9, två delar per film (handboken §3.9); WAN 3 föll alla fyra
  gånger.
- **Talfilm:** munnen är rendererns ([TAL](TAL.md), "Kvaliteten").

## Kontrollen: avvikelser att se efter i en film från vilken modell som helst

Kör den på en ny modells första tagningar och på varje film som ska in i banken. Inget i repot vägrar efter de här
gränserna utom där det står.

| Kontroll | Hur den mäts | Vad som har setts |
|---|---|---|
| Bilder per sekund | ffprobe; `film.fps` i `fetched.json`; `source.fps` i posten. Scenen spelar varje film i sin takt (`fpsOf` i `src/game-film.ts`) | WAN 3 30, Kling 24; takten byter vid skarvarna (Ö) |
| Storlek och form | `fetched.json`; `tools/film-after.ts` vägrar en annan form än första bildens; en order vägrar bilder i annan storlek (`readRgb`) | skalas till bankens ruta |
| Rutornas antal och slutet | ffprobe, och rutorna i slutet | WAN 3 mörknar i de två sista |
| Färgmärkning och ljudspår | `film.colour` och `film.audio` i `fetched.json` | efterarbetet stryker båda |
| Färgen mot ankaret, första och sista rutan, med båda formlerna | skripten under Källor | en skillnad på 4–6 nivåer mot grannfilmen såg Jakob |
| Drift i ljuset över filmen | Y per ruta; MÄTT-noten i kvittot ("Slutet 4,3 nivåer från last.png") | WAN 3 +1,7 (upp till 3,2); Kling 4 +0,1 |
| Grönt | efterarbetet sätter det på ankarets nivå och skriver nivåerna i `after.json` | – |
| Ansikte och kropp mot ankaret | granskaren i full upplösning (`tools/film-review.md`); händer och kropp per ruta `tools/python/filmmatt.py`; bordskanten rad 831,5 (`edgeCheck` i `src/film-after.ts`) | se Det viktigaste, punkt 6 |
| Kortet | `tools/track-card.ts`, `tools/card-coverage.ts`, `tools/flip-axis.ts`; MÄTT-noten (storleken i luften ±10 %, var det landar) | färgbyte utan kantruta; kortet växer 20–70 % när det lyfts (båda) |
| Loopens skarv (vila) och skarven mot grannfilmen | första mot sista rutan; sista mot nästa films första, med båda formlerna | Ljuset vid en skarv |
| Hopp och scenbyte | granskaren ruta för ruta | Kling 4 i 30 s hoppar mellan scener |
| Posten mot filmen | byte, SHA-256, storlek, takt och rutor mot `source` i posten | `source.model` kan vara fel (nästa avsnitt) |

## Var modellen står, och felen där

| Ställe | Fält | Vem skriver | Vem läser |
|---|---|---|---|
| Ordern `data/orders/<id>.json` | `generation.model` | Beställ | `tools/film-after.ts` (väljer efterarbetet), `tools/register-order.ts`, Protokoll, `tools/verdicts-per-method.ts` |
| Posten `motions/<klipp>.json` | `source.model` | `tools/register-order.ts` ur ordern; äldre poster för hand | Spelet: `filmModel` i `src/game-film.ts` skickar det med varje filmdel till 3D-scenen; en talfilm får sin vilas |
| Kvittot `assets/motions/<klipp>/generation.json` | `model`, `orderedAs` | `tools/register-order.ts`; äldre av arkivet | labbservern läser läget, krediterna och filmens mått (`clipBank` i `tools/preview.ts`), inte modellen; läs `orderedAs` för Pamelas MCP-filmer |
| Jobbfilen `data/clip-jobs.json` | `model` på jobb och utsnitt | `tools/register-order.ts`, `tools/speech.ts` | `buildGraph` bär det i tagningens `job.model`; ett utsnitt utan modell heter `utsnitt` |

Känt fel (M): kvittona för `pamela-table-arrive-wide-kling-01`, `pamela-table-leave-wide-kling-01` och den oregistrerade
`pamela-p6-c1-plan-deal-03` säger `wan3`, fast filmerna är Kling 4 (24 rutor i sekunden, `orderedAs: "kling-4, …"`).
Posternas `source.model` är rättade till `kling-4` (2026-11-13); kvittona står kvar som de skrevs.

## Före en ny modell

1. Lägg modellen i `MODELS` i `src/order-model.ts` och priset i `data/order-policy.json` (SYSTEM, "Vad labbet skickar
   till genereringen").
2. Ge den ett efterarbete i `TREATMENTS` i `src/film-after.ts`; utan det vägrar `tools/film-after.ts`. Bestäm tre saker:
   tas sista rutorna bort, lyfts hon till första bilden, och med vilken formel är leveransen skriven (märkningen i
   `fetched.json`). I dag läses varje leverans som BT.601, oavsett märkning.
3. Beställ en tagning som metodprov enligt handboken, gärna i lägsta upplösning först (WAN 3 480p: 5 krediter per s).
4. Kör kontrollen ovan på tagningen, och mät skarven mot en film av den familj den ska stå bredvid i en runda, på samma
   ankare och med båda formlerna.
5. Se att `source.model` i posten blir modellens id exakt som i `MODELS`.

## Det som inte är känt eller avgjort

- Om efterarbetet ska läsa Kling 4 med BT.709 för nya filmer, och om bankens filer ska märkas (Ljuset vid en skarv).
- Varför WAN 3 ljusnar under en film. Efterarbetet lyfter henne bara efter första rutan.
- Hur bytet mellan 30 och 24 bilder i sekunden ser ut för ögat i en runda: sett av granskaren, inte mätt.
- Talfilmernas färg mot vilan: inte mätt (scenbanan: som WAN 3). Pamelas skarvar: inte mätta (ändarna har olika pose).
- Seedance 2.5 och Kling 4 i 720p är inte prövade i bankens format.
- Mätrutorna ligger fast i bilden; under filmen rör hon sig, så spannet i Y är inte bara ljus. Metodens fel är cirka 2
  nivåer; skillnaden mellan familjerna är större. Tiderna är övre gränser; kvittona för Pamelas MCP-filmer saknar tider.

## Källor och skript

- Register (M): `motions/`, `data/clip-jobs.json`, `data/orders/`, `data/order-methods.json`, `data/order-policy.json`,
  kvittona `assets/orders/*/receipt.json` och `fetched.json`, `assets/motions/*/generation.json`; koden
  `src/film-after.ts`, `tools/film-after.ts`, `src/order-model.ts`, `src/speech-plan.ts`, `src/clip-graph.ts`.
- Jakobs domar per metod: `node tools/verdicts-per-method.ts paow`; protokollet: `node tools/order-ledger.ts`.
- Skripten som mätte talen ligger utanför repot (bara läsning, högst fyra FFmpeg åt gången):
  `D:/dealer-scratch/tmp/huvudagent11/modeller/` (`integrity.mjs`, `count-films.mjs`, `orders.mjs`, `ends.mjs`,
  `steps.mjs`, `pamela-ends.mjs`, `notes.mjs`, `verdicts.mjs`), huvudagentens `D:/dealer-scratch/tmp/huvudagent11/ljus/`
  (`LASMIG.md`, `skarv.mjs`, `steg.mjs`), scenbanans `D:/dealer-scratch/tmp/levande-objekt/ljus/` (`familjer.mjs`,
  `mot-ankare.mjs`) och filmgranskarens `D:/dealer-scratch/tmp/huvudagent11/chefsfilm/granskning-1/`.
