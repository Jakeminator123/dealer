# Tal: hur dealern får tal, och vart det är på väg

Skriven 2026-11-13 av banan Tal. Sidan säger vad som finns i dag, hur en replik och en ny dealer görs, vad provet med tal under en giv visar, och vad fritt tal ur en chatt skulle kräva. Det som är mätt står som mätt; det som är skattat står som skattat. Kontraktet för själva filmen står i koden (`src/speech-plan.ts`, `tools/speech.ts`), registret är `data/speech.json`.

## Vad som finns i dag

En **talfilm** är en vilotagning med ljudspår: bankens ruta (1764 × 1174 på grönt), 24 rutor per sekund, H.264 med AAC. Den spelar vilofilmens rutor från första spelade rutan (ruta 3) ut och samma väg tillbaka, så den börjar och slutar på samma ruta som varje vila, med stängd mun. Munnen är ritad efter ljudet av en läppsynkmodell (MuseTalk), och bara ett stycke kring munnen är utbytt: utanför en låda på cirka 184 × 190 bildpunkter (kvittots `laidBack.box`) är varje bildpunkt vilofilmens egen. Ljudet börjar 0,22 s in i filmen.

Munnen ritas av samma renderer som Scoutgamings dealers har (`services/moving-gpu-worker` i `Jakeminator123/scoutgaming`), hämtad som färdig image och körd i Docker i WSL på den här datorns grafikkort, utan nät. Rösten läses av ElevenLabs: Paow har samma röst som Scoutgamings egen Paow, en klon i Kevins ElevenLabs-konto (Jakob 2026-11-13). Inget i Scoutgamings produktion används eller ändras: inga av deras GPU-platser hos RunPod, ingen databas, inget lager.

- **Verktyget** `tools/speech.ts`: `check`, `bank`, `say`, `reel`, `over`, `warm`, `proof` (kommandona står överst i filen).
- **Registret** `data/speech.json`: rendererns image, rösterna (med modell och inställningar per språk, och namnet på den rad i `.env.local` som bär kontots nyckel), vilken vilofilm dealern talar över, och replikernas exakta text. `lines` är de tio en runda behöver (samma nycklar som `SpeakLine` i `game/presentation.ts`, Scoutgamings egna texter), `chat` är chattens femton fasta svar.
- **Filmerna** ligger i `assets/speech/<dealer>/<id>/` (utanför Git) med `source.mp4`, kvittot `receipt.json`, rendererns råa svar `worker.mp4`, rösten `tts.mp3` och granskarens dom `review.json`. De som är införda i banken ligger som tagningar av `IDLE>IDLE` med `motion.idle.onRequest: true` och repliken i postens `speech`.
- **Provet** `paow-tal` i studions Prov visar allt i dealerns egen röst, med ljud: demofilmen först, sedan tal under en giv, de tio replikerna och chattens svar. Filmer i en annan röst (ett tidigare val, ett prov) ligger kvar där de gjordes och visas inte. Provet `paow-rost` är röstjämförelsen från 13 november: samma replik på fyra sätt.

För Paow finns 2026-11-13: de tio replikerna och femton chattsvar i hennes egen röst, en demofilm på 34 s, och prov av tal lagt över en annan film än vilan. Nattens första omgång med rösten Jessica ligger kvar som egna mappar och tagningar, så att rösterna går att jämföra. Bankens id är `paow-v2`, eftersom Scoutgaming redan har en äldre dealer som heter PAOW.

## Hur spelet väljer en replik

`src/speech-lines.ts` är en ren modul: den får bankens vilotagningar och svarar vilken talfilm som hör till en repliknyckel (`spokenFilm(takes, 'paow', 'goodluck')`), till ett skede i rundan (`'BETTING'`, `'DEALING'`, `'INSURANCE'`, `'DEALER'`) eller till det spelaren skrev i chatten (`chatReply`). Svaret bär klippets id, texten som den faktiskt läses, och ljudets början och slut i sekunder; finns ingen film svarar den `null`, och spelet visar sin text som förut.

Spelet (kopplat av huvudagentens spelagent natten till 2026-11-13) säger "Lycka till" när given börjar, "Dealern spelar." före dealerns hand, utfallet när rundan är avgjord och "Lägg era insatser, tack." vid ny runda, och svarar i chatten med ett av de fasta svaren. Reglaget `tal` (`av` eller `repliker`) står bland scenens reglage. Replikerna spelas som vilofilmer, alltså mellan givarna och inte under dem.

Chattens svar är fasta: en hälsning, hennes namn, hur hon mår, reglerna, tack, lycka till, otur, vinst, hej då och "det kan jag inte svara på", plus attrappens fyra egna svar. Vilket svar som passar avgörs av ord i det spelaren skrev (`chatKey`). Hon svarar alltså direkt, men bara med det som redan är inspelat.

## Rösten

En röst hittas bara av det konto den ligger i. I registret namnger rösten därför den rad i `.env.local` som bär kontots nyckel (`key`, till exempel `ELEVENLABS_API_KEY_KEVIN`), aldrig nyckeln själv; en röst utan `key` läses med repots egen `ELEVENLABS_API_KEY`. Uppläsningen betalas per tecken av det konto rösten ligger i; avlyssningen går alltid på repots egen nyckel. `languages` ger modell och inställningar för ett annat språk än röstens eget.

Paows röst är ElevenLabs-rösten `WZVEBKUreb9jAKojf0QF` ("Paow", en direktklon i Kevins konto), samma som Scoutgamings katalog har som förval för henne. Svenska läses med `eleven_multilingual_v2` (stability 0,5, similarity 0,85, style 0, speaker boost): Jakob lyssnade på provet `paow-rost` 2026-11-13 och valde den framför `eleven_v3`, som Scoutgaming läser hennes svenska med ("2 paow äldre modell är bäst"). Engelska har Scoutgamings inställning (`eleven_multilingual_v2`, 0,38 / 0,8 / style 0,3); ingen engelsk replik är läst än. Jakob gav två id och ville ha det andra i första hand: `ZJEktbBRUOiQlTc5zJBT`, en professionell klon med samma namn i samma konto. Den går inte att läsa med: ElevenLabs svarar `voice_not_fine_tuned` på uppläsning med båda modellerna och på röstbyte (prövat samma dag), alltså är träningen inte klar, och det kan bara kontots ägare göra. När den är klar är bytet en rad i registret och alla repliker om.

Två vägar till ny röst prövades på en replik (provet `paow-rost`). **Ny läsning och ny mun** (vald, film 1 och 2 i provet): rösten läser texten själv, och munnen ritas efter just det ljudet. **Röstbyte på färdigt ljud** (film 3; ElevenLabs speech-to-speech): ljudet behåller sin längd och takt (2,79 s in, 2,79 s ut) och bilden behöver inte göras om, men tonfallet och takten är den gamla röstens; det blir en annan röst som låter som Paow. Skriptet för röstbytet ligger utanför repot (`D:/dealer-scratch/tmp/tal/skript/rostbyte.mjs`).

## Göra en replik, och en ny dealer

```
node tools/speech.ts check
node tools/speech.ts bank --dealer paow
node --env-file=.env.local tools/speech.ts say --dealer paow --line placebets
node --env-file=.env.local tools/speech.ts say --dealer paow --text "Välkommen till bordet." --as valkommen
node tools/speech.ts proof --dealer paow
```

En **ny replik** är en rad i `data/speech.json` (eller `--text` med `--as`) och ett `say`. Samma text i samma röst läses aldrig två gånger av misstag (`--again ja` ger en ny läsning). Varje ljud skickas tillbaka till ElevenLabs tal-till-text och jämförs med texten; en avvikelse skrivs ut och står i kvittot. Det fångade natten till 2026-11-13 "20" för "tjugoett" och en röst som läste "Lägger en satser".

En **ny dealer** behöver en godkänd vilofilm i bankens ruta, en rad under `dealers` i registret (bank-id, vilofilm, röst, språk), `bank` en gång och sedan `say` per replik. Röstbyte är en rad och alla repliker om (se Rösten); 13 november tog de 25 replikerna sju minuter med varm renderer.

Tider, mätta på den här datorn (RTX 3060): banken 80–150 s; en replik 63–110 s när datorn i övrigt vilar, upp till 245 s när andra arbeten går samtidigt. Det mesta av tiden är att renderern läser in sin modell för varje replik. ElevenLabs kostade under natten cirka 1 050 tecken för 29 läsningar på repots nyckel (skattat under 5 kr; kontots kvot går inte att läsa med den nyckeln). Röstbytet 13 november kostade 1 422 tecken uppläsning och 34 tecken röstbyte på Kevins konto: 1 116 tecken för de 25 replikerna med den valda modellen (tre omläsningar inräknade) och 306 för de sex läsningar med `eleven_v3` som hann göras före valet.

**Den varma renderern** (`warm --dealer paow`) håller modellen och banken i minnet. Start 95–162 s (mätt tre gånger); därefter tog samma repliker 10–15 s i stället för en minut (mätt på tre repliker om 34, 58 och 77 rutor), och rutorna är desamma som kallt: ingen bildpunkt skiljer i någon ruta. Den tar nästan hela grafikkortets minne (11,8 av 12 GB mätt) medan den går, så den stänger sig själv efter fem minuter utan arbete och ska inte stå på medan 3D-scenen spelas in. När kortet delas med en webbläsare som visar spelet går allt långsammare: 13 november tog starten 181–213 s, en replik 11–21 s varmt och ett kallt bak 69–94 s (hela kommandot 72–247 s med läsning, väntan på kortet och inläggning). WSL stänger dessutom en distribution några sekunder efter dess sista kommando, och renderern med den (sett samma dag: borta 34 s efter en sats); `warm` håller därför ett tyst kommando öppet så länge renderern lever, och väntar ut starten i stället för att baka kallt bredvid. Den är Scoutgamings egna funktioner för bakning, körda i en process som får leva kvar; den rör ingenting hos dem.

## Tal medan hon ger ett kort

Jakob 2026-11-13: "jag vill att hon ska kunna tala när hon t.ex. ger ut kort." Provet `paow-tal-goodluck-over-giv-2-1-p4-04-01` visar att det går med dagens verktyg: repliken "Insatserna är stängda. Lycka till vid mitt bord!" är lagd över hans godkända giv till plats 4 (`over --film … --line goodluck --at 0.6`). Givfilmen får en egen bank, renderern ritar munnen över varje ruta i givens egen ordning, och ansiktet läggs tillbaka i givfilmens rutor.

Granskningen i full upplösning (3/5, användbar med anmärkningar) mätte: utanför lådan skiljer ingen bildpunkt mer än 24 nivåer i någon av 169 rutor, så handen, kortet, skon och det landade kortet är givfilmens egna; ingen kant syns när huvudet rör sig, och det ritade partiet glider inte mot ansiktet när hon sänker blicken (sett, inte mätt). Det som är fel är munnen i tiden: den öppnas 7 rutor före ljudet och stängs 7 rutor efter, och läpparna är tunnare och blekare än hennes egna medan hon talar.

För att det ska gå i spelet finns två vägar.

1. **En talfilm per film och replik.** Det är provets väg. Den som ska spelas oftast kommer först: "Lycka till" sägs när given börjar, och det första som då spelas är ingången från vila till skon, som är en och samma film vilken plats som än får första kortet. En talfilm över ingången räcker alltså för varje runda (provet `…-over-ingang-2-1-02-01`). "Du dubblar" hör till given av dubblingskortet och kräver en talfilm per plats (sju). Varje sådan film är en tagning som ska granskas, få kortspår och dömas, och verktyget tar i dag bara filmer i 24 rutor per sekund; de givar som går i 30 behöver att ljudet sträcks för renderern och läggs tillbaka i rätt takt, vilket inte är byggt. Kostnad per film: en bank (80–150 s) och en bakning (cirka en minut kallt), ingen ny uppläsning.
2. **En renderer som lägger munnen på den film som spelas.** Så gör Scoutgaming: deras talbank innehåller vilan, skoövergångarna och givklippen, och renderern strömmar en liten munruta per bildruta som spelaren lägger över klippet medan det spelas. Då behövs ingen talfilm per kombination, och vilken text som helst kan sägas över vilken film som helst. Här skulle det kräva en talbank av alla Paows godkända filmer, deras strömmande protokoll i labbservern och ett lager i scenen som ritar munrutan. Skattat flera dagars arbete; inget av det är påbörjat.

## Fritt tal ur en chatt

I Scoutgaming kommer texten från OpenClaw genom Director, rösten från ElevenLabs, och munnen strömmas från dealerns GPU-plats; deras egen siffra är 6–15 s till ljud med varm renderer. Här finns i dag de fasta svaren (direkt) och möjligheten att baka en ny text i förväg.

Det som skulle behövas för fritt tal här: en källa till texten (en bot med dealerns persona; chatten i spelet är en attrapp), en väg i labbservern som tar texten och svarar med filmen, och en renderer som är varm. Mätt 2026-11-13 med den varma renderern: en ny text på 36 tecken blev färdig film på 41 s, hela vägen (läsning, avlyssning, rendering, inläggning), medan andra arbeten gick på datorn; rendersteget ensamt tog 10–15 s i de tre mätningarna före. Skattat går hela vägen att få till 15–25 s på en dator som i övrigt vilar, om avlyssningen hoppas över och filmen kodas snabbare. Kallt är det 65–110 s. Det är för långsamt för ett samtal men räcker för att hon ska säga något nytt en stund efter att det skrevs. Vägen till sekunder är väg 2 ovan.

## Tal i rörligt spel: går det?

Jakob 2026-11-13: "Kolla annars kevin/kevin-staging hur Emil gjort med lipsynk. Tror de buffrar och köar filmer på ett smart sätt. Samma sak ska vi kanske göra", och högst 30 USD "för att kunna bevisa om det är rimligt att via serverless runpod … få talsynken att funka med lipsynken i rörligt spel".

**Svaret är ja: det går, och det görs redan.** Scoutgamings dealers talar under given med samma renderer på serverless hos RunPod. Det som avgör om det känns levande är om renderern är varm och hur munnen läggs på filmen, inte om det är serverless.

### Så gör Emil och Kevin (läst, inte kört)

Läst 2026-11-13 i Scoutgamings repo med `git show`, utan att hämta eller ändra något: `origin/kevin` (`d96c6eb0e`, 2026-10-29), `origin/kevin-staging` (`50acf984f`, 2026-11-12; fjärren står längre fram på `f5b72f4e4`, som inte är läst) och `main` (`90d6697c4`). Koden ligger i `kevin/croupier-scoutgg/` på Kevins grenar. Hela genomgången: `D:/dealer-scratch/tmp/tal/scout-lasning/RAPPORT.md`.

- **Munnen är ett lager över klippet som ändå spelas** (`server/rorlig-lipsync.mjs`, `900a5ec9c`; `public/lip-layer.js`, `472cdb47b`). Renderern skickar en liten munruta per bildruta, märkt med vilken tagning och ruta den hör till, i bitar om 12 rutor (0,5 s). Sidan ritar munrutan bara när just den tagningen och rutan visas; saknas den syns dealerns egen mun. Given väntar aldrig på talet.
- **Kön** (`#pump` i samma fil): tidigaste behov först, en replik i taget per renderer, och en replik görs tidigast 3 s innan den behövs, eftersom varje ny plan annars gjorde om den.
- **När hon talar under given** (`scheduleTalks`): före första kortet börjar rösten 600 ms in i greppet mot skon, efter ett kort när det har landat (62 % in i kortets film), kartan 220 ms före rösten, och repliker överlappar aldrig. Ett chattsvar börjar 1,6 s efter att det är klart, också mitt i given; ändras given under tiden görs munnen om från den nya rutan.
- **Förrenderade utrop** (`server/lapp-lager.mjs`, `b5ef79d16`, och `server/lapp-forvarm.mjs`, `279030e80`, på kevin-staging): samma utrop över samma film i samma tempo ger alltid samma munrutor, så de görs i förväg för varje plats, språk och tempo och sparas; "no worker, no queue". Emil skriver cirka 1 USD GPU för alla.
- **Aldrig röst utan mun** (kevin-staging, `public/shared-table.js`): ett svar spelas bara om 0,5 s mun redan är framme och bitarna kommer fortare än de spelas; annars visas bara texten.
- **Varmt** (kevin-staging, `public/gpu-grind.js`, `e380817b3`): spelet öppnar inte förrän en varm renderer som gör minst 30 rutor per sekund är uppkopplad; den hålls så länge bordet används.
- **`main`** har Emils renderer och tider men en annan ordning: ett bokfört jobb per uttalande, en sekund mun buffrad före ljudet (`packages/presentation/runtime/moving-speech-player.mjs`), svar över vilan när ingen giv spelas (högst 30 s väntan, annars text), och bara öppningsrepliken över given (`services/game/speech/moving/moving-speech-deal-plan.mjs`).

### Mätt

Ur Scoutgamings egen drift (deras logg och bokföring lästa 2026-11-13 med deras läsande verktyg `tal-logg` och `tal-budget`; samma renderer, serverless hos RunPod):

| | Mätt |
|---|---|
| Tal med varm renderer (Maud, 11 november, text redan färdig) | 1,0–1,3 s väntan, tre gånger (en avbröts) |
| Öppningsreplik sagd under given | två gånger; fem gånger hann den inte (de rader jag läste, morgonen 11 november) |
| Svar med kall renderer | 34 s och 43 s |
| Inläsning av modellen | 61, 72 och 77 s; en gång 339 s |
| Kostnad | Maud 100 försök 8,78 USD, Vera 30 försök 3,45 USD, Blankurius 7 försök 0,46 USD: 0,07–0,12 USD per försök med varmhållningen inräknad |

Här, på datorns RTX 3060: den varma renderern gör cirka 10 rutor per sekund (dess egen mätning vid start: 10,3; en replik på 58 rutor tog 10 s, en på 77 tog 15 s). Det är under de 24 som filmen spelas i och de 30 Emil kräver, så **strömmande tal i takt går inte på den här datorn**; det går däremot att rendera i förväg, och en replik är klar på 10–15 s. Tal över en giv och över ingången är gjort och granskat (3/5), se ovan.

Uppgivet av dem, inte mätt av mig: en 4090 gör 55–63 rutor per sekund och första munbiten kommer efter 0,4–1,3 s; en varm renderer kostar 0,74–1,10 USD i timmen; kallt tar containern 30–55 s och modellen 31–52 s.

**Egen mätning hos RunPod, 13 november.** Jakob: "varför vi inte bara kan ladda upp allt till vercel på en egen blob … och kör min pod med lipsynk mot henne"; han lade lagrets nyckel i `.env.local` (`BLOB_READ_WRITE_TOKEN`). Det går, och så här:

- Paows talbank (arkivet 30,2 MB och kvittot 1 kB) lades i labbets eget privata Blob-lager `dealer-lab-tal` (Jakobs eget Vercel-team), under `croupier/media/dealers/paow-v2/runtime/moving-bank/<uuid>/`: den mappen kräver renderern.
- En egen serverless-endpoint, `dealer-lab-tal-paow`, skapades på Jakobs RunPod-konto med samma image som Scoutgamings, utan deras miljövariabler, 0 workers i vila och högst 1. Scoutgamings endpoints rördes inte.
- Jobbet är det lokala bakjobbet oförändrat plus fältet `bankDownload`: två signerade läsadresser till bankens filer, giltiga en stund. Renderern får aldrig lagrets nyckel.
- Tre repliker som redan fanns lokalt bakades där.

| | Mätt hos RunPod |
|---|---|
| Första jobbet, ingen worker uppe | 264 s väntan medan en worker startade, sedan 36 s körning |
| Följande två, workern kvar | 22 s och 24 s från skickat till svar (48 och 88 rutor) |
| Själva ritandet | 32–33 rutor per sekund (83 rutor på 2,6 s); resten av körtiden är att modellen läses in för varje bakjobb |
| Banken ur lagret | 1,8 s första gången, sedan kvar hos workern |
| Samma film som här | intyg och mått stämde i alla tre; bild för bild 51–53 dB (PSNR) mot samma replik bakad lokalt, alltså bara avrundning |
| Kostnad | 0,05 USD för allt (saldot 55,17 före, 55,12 efter) |

Endpointen är raderad efter mätningen; banken ligger kvar i lagret (privat, gratis i den storleken). Skripten ligger utanför repot: `D:/dealer-scratch/tmp/tal/runpod/runpod.mjs` (endpointen) och `mat.ts` (banken, jobbet, kontrollen).

Vad det säger: ett bakjobb hos RunPod (22–24 s) är inte snabbare än den varma renderern här (10–15 s med ledigt kort), eftersom ett bakjobb läser in modellen varje gång, och den första repliken efter en paus kostar fyra–fem minuters väntan. Vinsten med RunPod ligger i den strömmande vägen, där modellen ligger kvar och kortet ritar fortare än filmen spelas (33 rutor per sekund mätt, mot 24 i filmen och 10 här). För förinspelade repliker räcker den här datorn; RunPod behövs när hon ska tala fritt under spel, eller när repliker ska göras medan datorns grafikkort är upptaget.

### Vad som skulle byggas här

1. **Ett munlager i scenen** i stället för en hel talfilm per giv: munrutan (lådan ur `over`, cirka 200 × 170 bildpunkter per bildruta, med ljudet) ritas över den film som spelas, när just den filmen och rutan visas. Då är givfilmen, dess kortspår och Jakobs dom orörda, och samma giv kan spelas med eller utan tal. Munrutorna görs i förväg på den här datorn, en gång per film och replik: cirka 2–4 minuter styck i dag (en bank per film, 80–150 s, och en bakning), utan ny uppläsning.
2. **Emils tider som regel i spelet:** 600 ms in i ingången, 62 % in i ett korts film, aldrig två repliker samtidigt, och ett utrop som blivit för sent sägs inte.
3. **Chattens väg:** fasta svar direkt (finns); en ny text renderas varmt och sägs vid nästa vila, med `main`:s regel (ingen giv spelas, annars bara text efter 30 s).
4. **För fritt tal i takt:** en renderer som strömmar, alltså en 4090 hos RunPod med Emils protokoll, hållen varm medan bordet används. Det är den delen som kostar pengar (cirka 1 USD per timme och bord) och flera dagars bygge, och den finns redan i Scoutgaming.

### Rekommendation

1. Bygg munlagret och förrendera de fasta replikerna över ingången och givarna (väg 1 och 2): det ger tal under given utan GPU i spelet och utan nya filmer att döma.
2. Låt chatten svara med de fasta svaren, och med en nyrenderad text vid nästa vila när den varma renderern går (15–40 s).
3. Bygg inte strömmande tal här. När Paow ska tala fritt under spel är det Scoutgamings väg som gäller, och där är den byggd: det är ett skäl att flytta henne dit, inte att bygga den en gång till.

## Kvaliteten

Fyra oberoende granskningar i full upplösning natten till 2026-11-13 (30 filmer med rösten Jessica): ingen talfilm duger som huvudtagning; de flesta får 3/5, några 2/5, en fälldes för fel ord i ljudet. Rent i mätningarna: skarvarna mot vilan, lådans kant, tatueringen på halsen, allt utanför lådan, det gröna. Felen sitter i munnen och är gemensamma för alla filmer, alltså rendererns: läpparna blir tunnare och matta, nedre ansiktet mjukare medan hon talar, munnen stänger 5–7 rutor efter ljudet och står halvöppen i pauser, tänderna är ett jämnt vitt band, och ruta 16 hoppar till i varje film (orsaken inte belagd). Blick och blinkningar är vilans och följer inte talet. Jakob dömer filmerna i Granska.

De 28 filmerna med Paows egen röst granskades samma dag av tre nya granskare, var för sig: alla är användbara med anmärkningar, ingen som huvudtagning. Talet över given fick 4/5 och över ingången 3/5 (given och ingången orörda utanför lådan), rundans tio repliker 3/5 utom förlusten 2/5 (munnen står öppen och stilla i en paus på sju rutor), demofilmen 3/5, och chattens femton svar 2/5 av en granskare som dömde samma fel hårdare. Felen är de som står ovan, och två saker till som hör till ljudet: rösten har 0,1–0,2 s nästan tyst ljud före och efter orden, och munnen följer hela ljudfilen, så den öppnar 2–6 rutor före det hörbara och stänger 5–8 efter; och i en tyst paus kortare än fyra rutor stänger munnen inte. Rent även här: skarvarna, lådans kant, tatueringen, allt utanför lådan. Domen står vid varje film i provet `paow-tal`.

## Det som medvetet inte är gjort

- Ingen koppling till Scoutgamings tjänster: inga jobb på deras GPU-platser, inget i deras databas eller lager, ingen OpenClaw. Allt körs på den här datorn.
- Ingen strömmande läppsynk; varje replik är en färdig film.
- Inga talfilmer över givar i banken: provet är ett prov tills det har kortspår och dom.
- Ingen talfilm med den professionella klonen av Paows röst: den är inte färdigtränad (se Rösten).
