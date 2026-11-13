# Tal: hur dealern får tal, och vart det är på väg

Skriven 2026-11-13 av banan Tal. Sidan säger vad som finns i dag, hur en replik och en ny dealer görs, vad provet med tal under en giv visar, och vad fritt tal ur en chatt skulle kräva. Det som är mätt står som mätt; det som är skattat står som skattat. Kontraktet för själva filmen står i koden (`src/speech-plan.ts`, `tools/speech.ts`), registret är `data/speech.json`.

## Vad som finns i dag

En **talfilm** är en vilotagning med ljudspår: bankens ruta (1764 × 1174 på grönt), 24 rutor per sekund, H.264 med AAC. Den spelar vilofilmens rutor från första spelade rutan (ruta 3) ut och samma väg tillbaka, så den börjar och slutar på samma ruta som varje vila, med stängd mun. Munnen är ritad efter ljudet av en läppsynkmodell (MuseTalk), och bara ett stycke kring munnen är utbytt: utanför en låda på cirka 184 × 190 bildpunkter (kvittots `laidBack.box`) är varje bildpunkt vilofilmens egen. Ljudet börjar 0,22 s in i filmen.

Munnen ritas av samma renderer som Scoutgamings dealers har (`services/moving-gpu-worker` i `Jakeminator123/scoutgaming`), hämtad som färdig image och körd i Docker i WSL på den här datorns grafikkort, utan nät. Rösten läses av ElevenLabs. Inget i Scoutgamings produktion används eller ändras: inga av deras GPU-platser hos RunPod, ingen databas, inget lager.

- **Verktyget** `tools/speech.ts`: `check`, `bank`, `say`, `reel`, `over`, `warm`, `proof` (kommandona står överst i filen).
- **Registret** `data/speech.json`: rendererns image, rösterna, vilken vilofilm dealern talar över, och replikernas exakta text. `lines` är de tio en runda behöver (samma nycklar som `SpeakLine` i `game/presentation.ts`, Scoutgamings egna texter), `chat` är chattens femton fasta svar.
- **Filmerna** ligger i `assets/speech/<dealer>/<id>/` (utanför Git) med `source.mp4`, kvittot `receipt.json`, rendererns råa svar `worker.mp4`, rösten `tts.mp3` och granskarens dom `review.json`. De som är införda i banken ligger som tagningar av `IDLE>IDLE` med `motion.idle.onRequest: true` och repliken i postens `speech`.
- **Provet** `paow-tal` i studions Prov visar allt, med ljud: demofilmen först, sedan tal under en giv, de tio replikerna och chattens svar.

För Paow finns 2026-11-13: de tio replikerna och femton chattsvar med rösten Jessica, en demofilm på 34 s, och prov av tal lagt över en annan film än vilan. Bankens id är `paow-v2`, eftersom Scoutgaming redan har en äldre dealer som heter PAOW.

## Hur spelet väljer en replik

`src/speech-lines.ts` är en ren modul: den får bankens vilotagningar och svarar vilken talfilm som hör till en repliknyckel (`spokenFilm(takes, 'paow', 'goodluck')`), till ett skede i rundan (`'BETTING'`, `'DEALING'`, `'INSURANCE'`, `'DEALER'`) eller till det spelaren skrev i chatten (`chatReply`). Svaret bär klippets id, texten som den faktiskt läses, och ljudets början och slut i sekunder; finns ingen film svarar den `null`, och spelet visar sin text som förut.

Spelet (kopplat av huvudagentens spelagent natten till 2026-11-13) säger "Lycka till" när given börjar, "Dealern spelar." före dealerns hand, utfallet när rundan är avgjord och "Lägg era insatser, tack." vid ny runda, och svarar i chatten med ett av de fasta svaren. Reglaget `tal` (`av` eller `repliker`) står bland scenens reglage. Replikerna spelas som vilofilmer, alltså mellan givarna och inte under dem.

Chattens svar är fasta: en hälsning, hennes namn, hur hon mår, reglerna, tack, lycka till, otur, vinst, hej då och "det kan jag inte svara på", plus attrappens fyra egna svar. Vilket svar som passar avgörs av ord i det spelaren skrev (`chatKey`). Hon svarar alltså direkt, men bara med det som redan är inspelat.

## Göra en replik, och en ny dealer

```
node tools/speech.ts check
node tools/speech.ts bank --dealer paow
node --env-file=.env.local tools/speech.ts say --dealer paow --line placebets
node --env-file=.env.local tools/speech.ts say --dealer paow --text "Välkommen till bordet." --as valkommen
node tools/speech.ts proof --dealer paow
```

En **ny replik** är en rad i `data/speech.json` (eller `--text` med `--as`) och ett `say`. Samma text i samma röst läses aldrig två gånger av misstag (`--again ja` ger en ny läsning). Varje ljud skickas tillbaka till ElevenLabs tal-till-text och jämförs med texten; en avvikelse skrivs ut och står i kvittot. Det fångade natten till 2026-11-13 "20" för "tjugoett" och en röst som läste "Lägger en satser".

En **ny dealer** behöver en godkänd vilofilm i bankens ruta, en rad under `dealers` i registret (bank-id, vilofilm, röst, språk), `bank` en gång och sedan `say` per replik. Röstbyte är en rad och alla repliker om.

Tider, mätta på den här datorn (RTX 3060): banken 80–150 s; en replik 63–110 s när datorn i övrigt vilar, upp till 245 s när andra arbeten går samtidigt. Det mesta av tiden är att renderern läser in sin modell för varje replik. ElevenLabs kostade under natten cirka 1 050 tecken för 29 läsningar (skattat under 5 kr; kontots kvot går inte att läsa med nyckeln).

**Den varma renderern** (`warm --dealer paow`) håller modellen och banken i minnet. Start 95–162 s (mätt tre gånger); därefter tog samma repliker 10–15 s i stället för en minut (mätt på tre repliker om 34, 58 och 77 rutor), och rutorna är desamma som kallt: ingen bildpunkt skiljer i någon ruta. Den tar nästan hela grafikkortets minne (11,8 av 12 GB mätt) medan den går, så den stänger sig själv efter fem minuter utan arbete och ska inte stå på medan 3D-scenen spelas in. Den är Scoutgamings egna funktioner för bakning, körda i en process som får leva kvar; den rör ingenting hos dem.

## Tal medan hon ger ett kort

Jakob 2026-11-13: "jag vill att hon ska kunna tala när hon t.ex. ger ut kort." Provet `paow-tal-goodluck-over-giv-2-1-p4-04-01` visar att det går med dagens verktyg: repliken "Insatserna är stängda. Lycka till vid mitt bord!" är lagd över hans godkända giv till plats 4 (`over --film … --line goodluck --at 0.6`). Givfilmen får en egen bank, renderern ritar munnen över varje ruta i givens egen ordning, och ansiktet läggs tillbaka i givfilmens rutor.

Granskningen i full upplösning (3/5, användbar med anmärkningar) mätte: utanför lådan skiljer ingen bildpunkt mer än 24 nivåer i någon av 169 rutor, så handen, kortet, skon och det landade kortet är givfilmens egna; ingen kant syns när huvudet rör sig, och det ritade partiet glider inte mot ansiktet när hon sänker blicken (sett, inte mätt). Det som är fel är munnen i tiden: den öppnas 7 rutor före ljudet och stängs 7 rutor efter, och läpparna är tunnare och blekare än hennes egna medan hon talar.

För att det ska gå i spelet finns två vägar.

1. **En talfilm per film och replik.** Det är provets väg. Den som ska spelas oftast kommer först: "Lycka till" sägs när given börjar, och det första som då spelas är ingången från vila till skon, som är en och samma film vilken plats som än får första kortet. En talfilm över ingången räcker alltså för varje runda (provet `…-over-ingang-2-1-02-01`). "Du dubblar" hör till given av dubblingskortet och kräver en talfilm per plats (sju). Varje sådan film är en tagning som ska granskas, få kortspår och dömas, och verktyget tar i dag bara filmer i 24 rutor per sekund; de givar som går i 30 behöver att ljudet sträcks för renderern och läggs tillbaka i rätt takt, vilket inte är byggt. Kostnad per film: en bank (80–150 s) och en bakning (cirka en minut kallt), ingen ny uppläsning.
2. **En renderer som lägger munnen på den film som spelas.** Så gör Scoutgaming: deras talbank innehåller vilan, skoövergångarna och givklippen, och renderern strömmar en liten munruta per bildruta som spelaren lägger över klippet medan det spelas. Då behövs ingen talfilm per kombination, och vilken text som helst kan sägas över vilken film som helst. Här skulle det kräva en talbank av alla Paows godkända filmer, deras strömmande protokoll i labbservern och ett lager i scenen som ritar munrutan. Skattat flera dagars arbete; inget av det är påbörjat.

## Fritt tal ur en chatt

I Scoutgaming kommer texten från OpenClaw genom Director, rösten från ElevenLabs, och munnen strömmas från dealerns GPU-plats; deras egen siffra är 6–15 s till ljud med varm renderer. Här finns i dag de fasta svaren (direkt) och möjligheten att baka en ny text i förväg.

Det som skulle behövas för fritt tal här: en källa till texten (en bot med dealerns persona; chatten i spelet är en attrapp), en väg i labbservern som tar texten och svarar med filmen, och en renderer som är varm. Mätt 2026-11-13 med den varma renderern: en ny text på 36 tecken blev färdig film på 41 s, hela vägen (läsning, avlyssning, rendering, inläggning), medan andra arbeten gick på datorn; rendersteget ensamt tog 10–15 s i de tre mätningarna före. Skattat går hela vägen att få till 15–25 s på en dator som i övrigt vilar, om avlyssningen hoppas över och filmen kodas snabbare. Kallt är det 65–110 s. Det är för långsamt för ett samtal men räcker för att hon ska säga något nytt en stund efter att det skrevs. Vägen till sekunder är väg 2 ovan.

## Kvaliteten

Tre oberoende granskningar i full upplösning natten till 2026-11-13 (30 filmer): ingen talfilm duger som huvudtagning; de flesta får 3/5, några 2/5, en fälldes för fel ord i ljudet. Rent i mätningarna: skarvarna mot vilan, lådans kant, tatueringen på halsen, allt utanför lådan, det gröna. Felen sitter i munnen och är gemensamma för alla filmer, alltså rendererns: läpparna blir tunnare och matta, nedre ansiktet mjukare medan hon talar, munnen stänger 5–7 rutor efter ljudet och står halvöppen i pauser, tänderna är ett jämnt vitt band, och ruta 16 hoppar till i varje film (orsaken inte belagd). Blick och blinkningar är vilans och följer inte talet. Jakob dömer filmerna i Granska.

## Det som medvetet inte är gjort

- Ingen koppling till Scoutgamings tjänster: inga jobb på deras GPU-platser, inget i deras databas eller lager, ingen OpenClaw. Allt körs på den här datorn.
- Ingen strömmande läppsynk; varje replik är en färdig film.
- Inga talfilmer över givar i banken: provet är ett prov tills det har kortspår och dom.
- Rösten: de två röst-id Jakob gav (`ZJEktbBRUOiQlTc5zJBT`, `WZVEBKUreb9jAKojf0QF`) finns varken i kontot bakom nyckeln eller bland ElevenLabs 22 097 delade röster (alla lästa 2026-11-13). Jessica står kvar tills rösten är tillagd i kontot.
