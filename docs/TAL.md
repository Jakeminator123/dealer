# Tal: hur dealern får tal, och vart det är på väg

Läget nu och receptet som används. Målet är läpparna i realtid på hans RunPod; replikfilmerna kommer i andra hand
(BESKED, "Läpparna och talet"). Kontraktet för filmen står i koden (`src/speech-plan.ts`, `tools/speech.ts`), registret
är `data/speech.json`, och fakta om läppsynken per dealer står i `data/lipsync.json`, som studions vy Lipsync visar för
den valda dealern; ändras något här ändras det där också. Varje granskningsomgång med poäng och mått står i belägget
[tal-granskningar](../evidence/tal-granskningar.md).

## Vad som finns i dag

En **talfilm** är en vilotagning med ljudspår: bankens ruta (1764 × 1174 på grönt), 24 rutor per sekund, H.264 med AAC.
Den spelar vilofilmens rutor från ruta 3 ut och samma väg tillbaka, så den börjar och slutar på samma ruta som varje
vila, med stängd mun. Munnen ritas efter ljudet av en läppsynkmodell (MuseTalk), och bara en låda kring munnen, cirka
184 × 190 bildpunkter (kvittots `laidBack.box`), är utbytt; utanför är varje bildpunkt vilofilmens.

- **Grinden** (`speechGate` i `src/speech-plan.ts`): den ritade munnen läggs bara in medan hon hörs. Den börjar högst två
  rutor före det hörbara ljudet och slutar högst tre rutor efter; varje växling är en enda ruta med hälften av varje mun,
  lagd där de två är mest lika. En tyst paus på sex rutor eller mer växlar ut och in igen, och hennes egen mun får då
  minst fyra hela rutor; en kortare tystnad talas igenom. Vikten per ruta står i kvittot (`laidBack.weights`).
- **Munnen medan hon talar** läggs som dealern har den (`recipeOf` i `tools/speech.ts`): Paows är den neutrala,
  rendererns låda lagd in som den är (BESKED, "Den neutrala munnen är standard för alla Paows repliker"); andra dealrar
  får läppreceptet (Kvaliteten).
- Ljudet börjar 0,22 s in och har samma styrka i alla repliker (Rösten). En film byter aldrig innehåll under sitt id: en
  omläggning ger en ny tagning.

Munnen ritas av samma renderer som Scoutgamings dealers har (`services/moving-gpu-worker` i
`Jakeminator123/scoutgaming`), hämtad som färdig image och körd i Docker i WSL på den här datorns grafikkort, utan nät.
Rösten läses av ElevenLabs. Inget i Scoutgamings produktion används eller ändras: inga GPU-platser, ingen databas,
inget lager.

- **Verktyget** `tools/speech.ts`: `check`, `bank`, `say`, `reel`, `over`, `warm`, `proof` (kommandona står överst i
  filen).
- **Registret** `data/speech.json`: rendererns image, rösterna (modell och inställningar per språk, och namnet på raden
  i `.env.local` som bär kontots nyckel), vilofilmen dealern talar över, och replikernas text. `lines` är de tio en runda
  behöver (samma nycklar som `SpeakLine` i `game/presentation.ts`), `chat` chattens femton fasta svar.
- **Filmerna** ligger i `assets/speech/<dealer>/<id>/` (utanför Git) med `source.mp4`, kvittot `receipt.json`,
  rendererns råa svar `worker.mp4`, rösten `tts.mp3` och granskarens dom `review.json`. De införda är tagningar av
  `IDLE>IDLE` med `motion.idle.onRequest: true` och repliken i postens `speech`.
- **Provet** `paow-tal` i Prov visar allt i dealerns egen röst, med ljud; `paow-rost` är röstjämförelsen.

Paow har de tio replikerna och femton chattsvar i sin röst. Bankens id är `paow-v2`, eftersom Scoutgaming redan har en
äldre dealer som heter PAOW.

## Munnen: tre sätt, och vad som gäller per dealer

Samma uppgifter står i `data/lipsync.json` (`ways`, `dealers`, `whenNew`).

| Sätt | Var | Läge | Kostar |
| --- | --- | --- | --- |
| **Replikfilmerna** genom Scoutgamings renderer | hans dator: Scoutgamings image i Docker i WSL, RTX 3060, utan nät | fungerar; spelets talfilmer och munlappar är gjorda så | 0 kr för grafikkortet; rösten per tecken hos ElevenLabs |
| **Köraren** på hans dator | hans dator: egen image `dealer-korare:0.2` i Docker i WSL, RTX 3060 | fungerar som tjänst, prövad på vilan; inte i spelet | 0 kr |
| **Köraren** på hans RunPod | en 4090-podd på hans eget RunPod-konto | inte byggd, inte startad | 0,34–0,89 USD per timme; provkvällen högst 5 USD |

### Replikfilmerna genom Scoutgamings renderer

`tools/speech.ts` bygger en bank per film (`bank`, eller `over` som gör sin egen), läser repliken hos ElevenLabs och
låter renderern rita munnen i förväg; munnen läggs tillbaka i filmens egna rutor. Renderern är förseglad: den
kontrollerar sina filer inför varje jobb och ritar inte om en är ändrad, så dess inställningar (`bbox_shift`,
utjämningen) går inte att ändra här, och vi går inte förbi det (BESKED, "Egen körare"). Den gör cirka 10 rutor per
sekund här, för långsamt för realtid, och används för det som görs i förväg.

### Köraren på hans dator

**Vad det är.** MuseTalk 1.5 ur dess öppna källkod (MIT, samma commit som Scoutgamings renderer) plus egen kod, i en
egen image; ingenting ur Scoutgamings renderer. Masken för munnens område ritas ur MediaPipes landmärken i stället för
med BiSeNet (Licenserna). Källpaketet är [`tools/python/mouth-runner`](../tools/python/mouth-runner/README.md), med
originalhashar, upstream-licens och en versionerad profil: `kod/korare.py` förbereder och ritar, `kod/tjanst.py`
serverar, `kod/inlaggning.py` lägger in munnen och `kod/ansikte.py` gör masken. Vikterna hämtas enligt
`kod/vikter.json`; den lokala kopian ligger i `D:/dealer-scratch/tmp/tal/korare/modeller/`.

**Så skickas ett jobb.** Bygg- och monteringskommandon står i källpaketets README. Samordna GPU:n med headless-proven
genom `D:/dealer-scratch/tmp/gpu-och-headless.lock`: skapa låset exklusivt, identifiera ägaren och ta bara bort ditt
eget lås efter avslutat jobb. De gamla slaskskripten är ingen ingång; de kan stoppa en container med ett gemensamt namn.
Använd ett eget containernamn, skrivskyddade modeller och indata, och bara loopback eller inget nät.

Tjänsten svarar på `GET /halsa`, `POST /forbered`, `POST /rita` och `POST /stang`. Kontrollera profil-id och recepthash
före rendering. En fråga utan `recept` använder hela den versionerade profilen:

```
{"klipp":"/in/bank/sources/sources/<klippets id>.mp4","ljud":"/in/paow-tal-placebets-sv-13/tts.mp3","plan":"0..23,23..0","ljud_start":5280,"ut":"/arbete/ut/tjanst/<namn>/film.mp4"}
```

Svaret är en JSON-rad per händelse och sist en sammanfattning; med `ut` skrivs en film i klippets storlek med ljud och
kvitto. Övriga fält står överst i `kod/tjanst.py`. Monteringen av `/in` väljer dealerns indata (Paows är
`assets/speech/paow`). Tjänsten ritar 24 rutor per filmsekund. För prov med en äldre image kan paketets `kod/` monteras
skrivskyddat på `/opt/korare`; bygg en ny image innan den används som fristående leverans.

**Receptet med hans ja** (BESKED, "Munnen"): `paow-realtid-mun-6@1`, storlek F plus `opening`, `reach` och `lipsOnly`,
definierat en gång i `kod/profiler/paow-realtid-mun-6@1.json`: vanlig öppning dämpas, den största finns kvar som tak och
hakan följer mjukt. Hälsokontroll och filmkvitto visar profil-id, effektivt recept, SHA-256 och om något överstyrts.
Den gamla imagen får förvalet bara när den nya koden monteras in; ett nytt imagebygge är oprövat.

**Den neutrala munnen och formatet.** Den neutrala munnen ändrar bara hur rendererns svar läggs in i filmens rutor.
Renderern får samma klipp och samma ljud som förut (1080 × 1920, 24 rutor/s, PCM 24 kHz med 5 280 samplingar före), och
svaret är byteidentiskt med det förra. Talfilmerna är 1764 × 1174, 24 rutor/s, H.264 (CRF 12, yuv420p) med AAC 128
kbit/s på −16 LUFS, och lapparna `mouth.webp` (en förlustfri remsa av lådan) med `line.wav` (16 bitar, 24 kHz, mono).
Mot Scoutgaming skiljer bara förpackningen: deras munlager tar rutor om 256 × 512 i bitar om 12 och sparar utropen i
sitt `lapp-lager`; våra lappar är en remsa per replik och film. Körarens förberedda klipp gäller också, eftersom dess
nyckel är klippet och maskens inställningar, inte receptet (`prep_key` i `kod/korare.py`). Innan realtidsvägen kan ha
den neutrala munnen: köraren kan bara lägga in F (`kod/inlaggning.py` nekar andra mått), så den behöver en neutral
profil med eget versionsnummer (modellens låda som den är, med grinden och kanten, som `layBack` med `lips: null`) och
ett prov bredvid talfilmerna, eftersom körarens mask kommer ur MediaPipe och rendererns ur BiSeNet.

**Mätt** (RTX 3060, varm tjänst, 2026-11-17 och 2026-11-18): start 37 s för modellerna och 29 s uppvärmning;
förberedelsen av ett klipp 13–19 s för 112 rutor, cirka 4,5 MB på disken per klipp och inställning (`korare/prep/`);
per replik de första 12 rutorna efter 1,5–2,5 s, 12–13 rutor per sekund i hela kedjan, med CPU-tak fyra 5,6–6,7.
Realtid kräver 24, så **realtid går inte på den här datorn**. `bbox_shift` ger inte hennes egna läppar; storleken kommer
ur inläggningen. Bara vilofilmens klipp är prövat. Profilens fyra regressioner går utan GPU och ingår i kontrollen när
Python 3 finns; provkvitton i `assets/proofs/paow-approved-f-game-20261118`. Kvar: streaming till spelet, PCM in i
stället för ljudfil och ett nytt Dockerbygge.

### Köraren på hans RunPod

Inte startad, och inget är förberett hos RunPod. Tänkt så (läst i RunPods dokumentation 2026-11-17, inte prövat): en
podd kan inte köra `docker build`, så podden startas ur `runpod/pytorch:1.0.2-cu1281-torch280-ubuntu2404` (samma torch
och Ubuntu som körarens Dockerfile) och Dockerfilens steg körs där som ett skript, som inte är skrivet; vikterna hämtas
enligt `kod/vikter.json`. Vilofilmens klipp (24 MB) och replikernas ljud förs till podden; det är media som lämnar
datorn, och det sägs till huvudagenten före. Sedan skickas samma frågor som på datorn. Villkoren för första
provkvällen: högst 5 USD, besked samma dag före start (belopp och hur länge), podden stängs samma kväll och kostnaden
rapporteras; inget konto för ett register och inget publikt. Den mäter rutor per sekund på en 4090, tiden till de
första rutorna och förberedelsen per film.

### Vad som gäller per dealer

**Paow.** Bank `paow-v2` av vilofilmen `paow-vila-01-01`, och egna banker för munlapparna över ingången, given till
plats 4 och hålkortet. Rösten Paow (`eleven_multilingual_v2`), svenska. Replikfilmerna och munlapparna har den neutrala
munnen, utom blackjack: spelet säger `paow-tal-blackjack-sv-04`, som har hans egen dom, tills han dömer den neutrala
`…-blackjack-sv-14`. Munnen i realtid har hans ja (F), men köraren kan ännu inte lägga in den neutrala. Köraren har
förberett vilans klipp (fyra inställningar av `bbox_shift`; tjänsten använder 0). Kvar: streaming, podden och tal över
filmer i 30 rutor/s.

### Vid en ny film eller en ny dealer

En **ny film** som hon ska tala över:

1. Den ska gå i 24 rutor per sekund; en film i 30 (WAN 3) kan inte bära tal än (Gränser, i Munlagret).
2. Replikfilmer och munlappar: en bank per film (`bank` eller `over`; 80–150 s på grafikkortet), sedan en lapp per
   replik och film; huvudagenten för in lapparna i spelets register (`node tools/speech-patch.ts register`).
3. Köraren: filmens klipp förbereds en gång (`POST /forbered`), sedan ritas varje replik över det. Prövat är bara
   bankens klipp (`assets/speech/<dealer>/bank/sources/sources/<id>.mp4`, som `bank` skriver).
4. En ny film med tal granskas som en tagning, och hans ja behövs innan något byts i spelet.

En **ny dealer**: en godkänd vilofilm i bankens ruta; en rad under `dealers` i `data/speech.json` (bank-id, vilofilm,
röst, språk); en röst i ett ElevenLabs-konto (registret namnger raden med kontots nyckel, aldrig nyckeln); `bank` en
gång och sedan `say` per replik. För munnen i realtid: hennes recept prövat och godkänt av Jakob (Paows är inte prövat
på någon annan), och mappen för `/in` satt till hennes. Sist en post under `dealers` i `data/lipsync.json`.

### Licenserna

Uppslagna 2026-11-17 (`tools/python/mouth-runner/LICENSER.md`; `licences` i `data/lipsync.json`): MuseTalks kod och
1.5-vikter MIT, kommersiellt bruk uttryckligen tillåtet; sd-vae-ft-mse MIT; whisper-tiny Apache-2.0; MediaPipe
Apache-2.0; ffmpeg i imagen GPL, vilket bara spelar roll om imagen sprids. BiSeNet (`79999_iter.pth`) används inte: den
är enligt uppslagningen tränad på CelebAMask-HQ, som bara får användas för icke-kommersiell forskning (datasetets egen
licenstext är inte läst). Scoutgamings renderer listar samma vikt; det är en fråga för Jakob och rendererns ägare.

## Hur spelet väljer en replik

`src/speech-lines.ts` är en ren modul: ur bankens vilotagningar svarar den vilken talfilm som hör till en repliknyckel
(`spokenFilm(takes, 'paow', 'goodluck')`), till ett skede i rundan (`'BETTING'`, `'DEALING'`, `'INSURANCE'`,
`'DEALER'`) eller till det spelaren skrev i chatten (`chatReply`, efter ord i texten: `chatKey`). Svaret bär klippets
id, texten som den läses, och ljudets början och slut i sekunder; finns ingen film svarar den `null`, och spelet visar
texten. Bland lika dömda tagningar tas den med högst nummer. Spelet säger "Lycka till" när given börjar, "Dealern
spelar." före dealerns hand, utfallet när rundan är avgjord och "Lägg era insatser, tack." vid ny runda (SYSTEM,
"Spelet"); reglaget `tal` (`av` eller `repliker`) står bland scenens reglage. Chattens svar är fasta (en hälsning,
hennes namn, hur hon mår, reglerna, tack, lycka till, otur, vinst, hej då, "det kan jag inte svara på", och attrappens
fyra egna): hon svarar direkt, men bara med det som redan är inspelat.

## Rösten

En röst hittas bara av det konto den ligger i. Registret namnger därför den rad i `.env.local` som bär kontots nyckel
(`key`), aldrig nyckeln; en röst utan `key` läses med repots egen nyckel. Uppläsningen betalas per tecken av det konto
rösten ligger i; avlyssningen går alltid på repots nyckel. `languages` ger modell och inställningar för ett annat språk.

Paows röst är en direktklon i Kevins ElevenLabs-konto, samma som Scoutgamings katalog har som förval för henne (id och
inställningar i `data/speech.json`). Svenska läses med `eleven_multilingual_v2`: Jakob valde den 2026-11-13 efter provet
`paow-rost`, framför `eleven_v3`, som Scoutgaming läser hennes svenska med. Ingen engelsk replik är läst. Han ville ha
den professionella klonen med samma namn i samma konto i första hand, men ElevenLabs svarar `voice_not_fine_tuned`:
träningen är inte klar, och det kan bara kontots ägare göra. När den är klar är bytet en rad i registret och alla
repliker om. Röstbyte på färdigt ljud (speech-to-speech, film 3 i `paow-rost`) prövades och valdes inte: takten och
tonfallet blir den gamla röstens.

**Samma styrka i alla repliker.** ElevenLabs ger varje läsning sin egen styrka (Paows låg mellan −10,9 och −20,7 LUFS),
så där replikens ljud skrivs (en talfilm, tal över en film, en munlapp) sätts det till −16 LUFS, med en begränsare som
håller topparna under −1 dBFS (`levelled` och `LOUDNESS` i `tools/speech.ts`); ljudet är lika långt och ligger på samma
plats i tiden. Mätt efteråt: −16,8 till −16,0 LUFS, och inget klipper efter AAC. Kvittot säger vad som lästes och vad
det blev (`sound.level`; i en lapps post `made.renderer.level`). Munnen ritas efter läsningen som den lästes, och inget
ritas om för detta.

## Göra en replik, och en ny dealer

```
node tools/speech.ts check
node tools/speech.ts bank --dealer paow
node --env-file=.env.local tools/speech.ts say --dealer paow --line placebets
node --env-file=.env.local tools/speech.ts say --dealer paow --text "Välkommen till bordet." --as valkommen
node tools/speech.ts say --dealer paow --from paow-tal-lose-sv-09
node tools/speech.ts proof --dealer paow
```

En **ny replik** är en rad i `data/speech.json` (eller `--text` med `--as`) och ett `say`. Samma text i samma röst läses
aldrig två gånger av misstag (`--again ja` ger en ny läsning). `say --from <tagning>` lägger om en tagning ur rendererns
sparade svar, som en ny tagning: ingen ny läsning, inget grafikkort, cirka tio sekunder; repliken, texten, rösten och
ljudet tas från den, och numret blir det första efter alla tagningar av repliken. Munnen läggs som dealern har den
(`recipeOf`), utan att någon anger det. Varje ljud skickas tillbaka till ElevenLabs tal-till-text och jämförs med
texten; en avvikelse skrivs ut och står i kvittot. En ny dealer: Vid en ny film eller en ny dealer, ovan.
`say --from <tagning> --rest <vila>` lägger samma svar på ett annat träds vila som är bankens film med andra händer (Tatuerads `paow-vila-tat-01-01`): lådan mäts mot bankens film, och tagningen får ett eget id (`…-tat-sv-01`), utan anrop och grafikkort.

Tider på RTX 3060: banken 80–150 s; en replik 63–110 s kallt när datorn vilar, upp till 245 s när andra arbeten går.
Det mesta är att renderern läser in sin modell för varje replik.

**Den varma renderern** (`warm --dealer paow`) håller modellen och banken i minnet: start 95–162 s, sedan 10–15 s per
replik, med samma rutor som kallt. Den tar nästan hela grafikkortets minne (11,8 av 12 GB), så den stänger sig själv
efter fem minuter utan arbete och ska inte stå på medan 3D-scenen spelas in; delas kortet med en webbläsare som visar
spelet går allt långsammare. WSL stänger en distribution några sekunder efter dess sista kommando, och renderern med
den; `warm` håller därför ett tyst kommando öppet så länge renderern lever, och väntar ut starten i stället för att baka
kallt bredvid. Den är Scoutgamings egna funktioner för bakning, körda i en process som får leva kvar.

## Tal medan hon ger ett kort

Hon talar medan en film spelas genom munlagret (nästa avsnitt): munnen för en fast replik görs i förväg över precis den
film den sägs i och läggs på filmen medan den spelas, så filmen, dess kortspår och Jakobs dom är orörda. Det är
Scoutgamings förrenderade utrop, inte deras strömmande väg. En talfilm per film och replik var den andra vägen och
byggs inte: `over` gör sådana filmer som underlag till lappen och prov att titta på.

## Munlagret: repliken på filmen som spelas

Spelet lägger repliken på filmen utan grafikkort och utan nya filmer att döma; samma giv spelas med eller utan tal.
Lagret i scenen och spelets regel är byggda av huvudagenten; lapparna görs av talverktyget.

**Lappen.** En munlapp är en film och en replik i ett språk och en röst, i `assets/speech/<dealer>/patches/<id>/`
(utanför Git): `mouth.webp`, ett rutnät av munnens låda (cirka 184 × 176 bildpunkter) för varje ruta där munnen är
ritad; `line.wav`, repliken lika lång som renderern hörde den och i alla replikers styrka (16 bitar, 24 kHz, mono, ingen
kodarfördröjning); och posten `patch.json`: filmfilen med sha256, rutorna, lådan, kanten, grindens vikt per ruta, var
ljudet börjar i filmens tid och alla hashar. Kontraktet är `MouthPatch` i `src/speech-patch.ts`; spelet hittar lapparna
i `data/speech-patches.json`, som bara `node tools/speech-patch.ts register` skriver, och använder en lapp bara när
postens, rutnätets och ljudets hashar stämmer och filmfilen är bankens.

**Färgen.** Bankens filmer är omärkta, och Chrome visar dem med BT.709 och begränsat omfång; rutorna räknas om på samma
sätt (`cellRgb`, som grafikkortet läser dem), aldrig med FFmpeg:s förval BT.601. Kravet är under 0,5 nivåer i medel och
ingen bildpunkt över 4; en lapp av ingången själv, lagd på filmen i Chrome, gav 0,01–0,02 i medel.

**Lagret i scenen** (`src/scene3d-mouth.ts`). En del i filmkön kan bära en lapp (`Part.mouth`). Medan delen visas tar
lagret den ruta filmkön säger visas (ur `requestVideoFrameCallback`) och blandar lappens ruta i filmens färg i
filmshadern, före grönnyckeln, med talverktygets kant (`featherMask`) gånger rutans vikt; allt som sedan görs med filmen
görs med munnen på samma sätt. Ljudet spelas med Web Audio så att dess första sampling hörs när filmens tid
`startsAtSeconds` visas. En del med lapp spelas i takt 1, också när tysta filmer går fortare (`filmTempo`); en lapp för
dubbel fart är inte byggd. Ljudet hörs först när sidan har rörts, genom sidans enda ljudkontext (Rösten på en telefon).
Är lappen inte inläst när delen börjar spelas delen som förut och repliken står som text; glider filmen mer än 80 ms
från ljudet avbryts repliken. En film som står still (Scen stegar ruta för ruta) visar varje rutas mun utan ljud.
Mätt i Chrome: lagret lade rätt ruta i 716 av 718 ritade bilder, utanför lådan är bilden filmens egen, och ljudet
sattes inom 9 ms (Chromes egna tal, inte mikrofon).

**Spelets regel** (`placeLines` i `src/speech-patch.ts`, `src/game-film.ts`, `present` i `src/game-page.ts`). En replik
som hör till ett stegs början (`goodluck`, och `double`) läggs över den första filmen i kedjan som har en lapp för den,
om lappens rutor ryms i delens utsnitt och ljudet börjar högst 8 s in i kedjan. "Dealern spelar." läggs över hålkortets
vändning, med sina 8 s räknade därifrån, sist bland stegets repliker. En del bär högst en replik, och en senare replik
läggs aldrig på en tidigare del. Talfilmen i vila spelas då inte. Var ljudet börjar står i lappens post: Scoutgamings
tider (600 ms in i ingången, 62 % in i ett korts film) är en regel för den som gör lappen, och en hel replik ryms bara
från 0,6 s in i en giv på 7 s. Varje stegs kedja börjar med ingången, också dubblingens, och dealerns med hålkortets
vändning.

**Vad som finns** (2026-11-21): fyra lappar, alla med den neutrala munnen, skrivna i samma steg som repliken lades över
filmen (proven `paow-munbyte-neutral-20261121` och `paow-munbyte-neutral-alla-20261121`). Varje lapp har samma ljud,
rutor, grind och låda som den den ersatte; de ersatta ligger i `assets/speech/paow/patches-ersatta/`. En runda med tal i
filmerna behöver de tre första: lyckoönskningen och dubblingen över ingången, och "Dealern spelar." över
`paow-halkort-04-02` (utsnitt ruta 3–117).

| Lapp | Film | Rutor med mun | Ljudet | Storlek |
| --- | --- | --- | --- | --- |
| `paow-mun-goodluck-sv-ingang-2-1-02-01-neutral` | ingången | 60 (ruta 13–72) | från 0,4 s, 2,71 s | 1,90 MB |
| `paow-mun-double-sv-ingang-2-1-02-01-02` | ingången | 53 (16–68) | från 0,6 s, 2,34 s | 1,68 MB |
| `paow-mun-dealerplays-sv-halkort-04-02-02` | hålkortets vändning | 25 (13–37) | från 0,6 s, 0,96 s | 0,72 MB |
| `paow-mun-goodluck-sv-giv-2-1-p4-04-01-neutral` | given till plats 4 | 62 (16–77) | från 0,6 s, 2,71 s | 1,91 MB |

`node tools/speech-patch.ts check <mapp> --film ja` mäter en lapp: i ringen mellan det renderern ändrade och lappens
låda skiljer de neutrala 0,8–1,1 nivåer i medel och högst 16–24, eftersom lådan är rendererns omkodade, och kontrollen
godkänner dem. Första och sista rutan i varje lapp har vikt 0,5.

**Göra en lapp.** Talverktyget skriver lappen i samma steg som det lägger tillbaka munnen (`over`, med `writePatch` ur
`tools/speech-patch.ts`), i bankens `patches/` eller med `--patches <mapp>` i en överlämnings mapp, med dealerns mun
(`recipeOf`). Egna mått för läpparna ges med `--lips '<json>'` (det som ska skilja från `LIPS`; för Paow ger det
läppreceptet med de måtten); de står i filmens kvitto (`laidBack.recipe`) och i lappens post (`made.renderer.lips`) och
måste ges varje gång repliken läggs om. `over` skriver aldrig över en lapp, eftersom en färdig mediafil aldrig skrivs om
(`tools/local-work.md`): finns id:t (`<dealer>-mun-<replik>-<språk>-<film>`) får den nya nästa lediga (`…-02`), och en
tidigare lapp av samma replik över samma film, i samma språk och röst, flyttas från `patches/` till `patches-ersatta/`,
eftersom `register` tar varje mapp under `patches/` och spelet lägger den första lappen i registret. Registret skrivs
sedan om (`node tools/speech-patch.ts register`, huvudagentens). Kostnad per film och replik: en bank (80–150 s, en gång
per film) och en bakning (70–95 s kallt, upp till 431 s när kortet delas), inget hos ElevenLabs; en omläggning ur
rendererns sparade svar kostar varken grafikkort eller anrop, så länge `worker.mp4` finns kvar. Verktyget tar inte det
delade låset självt; den som renderar tar det (Så skickas ett jobb, ovan).

**Gränser.** Talverktyget tar bara filmer i 24 rutor per sekund (ingången, Kling-givarna och hålkortet `halkort-04-02`).
Filmer i 30 (WAN 3: plats 1 och 3, dealerns första kort, utgången, vilan) kräver att ljudet sträcks till fyra femtedels
fart för renderern, så att den ritar en mun per filmruta, och att filmens bank byggs av alla dess rutor; det är inte
byggt (skattat en till två timmar med prov på grafikkortet). En lapp är 0,7–1,9 MB förlustfritt. Färgen förutsätter att
webbläsaren läser bankens filmer som Chrome (BT.709); en annan webbläsare är inte provad. Repliker efter kedjan
(försäkringen, utfallet) sägs i vila.

## Rösten på en telefon

En talfilm bär sitt eget ljud, och filmkön startar den med ljudet på när sidan har rörts (`src/scene3d-film.ts`). Safari
på en iPhone låter en film höras bara när den startas inne i en beröring, och kön startar filmer från rutor och timrar.
Starten nekas då, kön spelar filmen ljudlöst så att rundan går vidare, och rösten går genom sidans eget ljud.

- **Rösten** (`src/scene3d-voice.ts`): kön säger till där starten nekades (`hooks.refused` i `createPlayers`). Lagret
  läser filmens ljudspår en gång (`decodeAudioData` på filmen) och spelar det med Web Audio satt mot filmens egna rutor,
  först när filmen har visat tre olika rutor. Rösten tystnar (tonad över 30 ms) när elementet stannar; visas en ruta mer
  än 80 ms från ljudet sätts ljudet om, högst tre gånger per replik. Där webbläsaren låter filmen höras körs inget av
  detta och inget hämtas.
- **Sidans ljud väcks i beröringen** (`src/page-audio.ts`): en kontext för hennes röst, delad av munlagret och röstens
  reserv, väcks vid varje beröring tills den går (en släppt finger eller pekare, ett klick, en tangent). Med `playback`
  ber sidan om att höras med ringsignalen avstängd (`navigator.audioSession`, Safari från iOS 17).
- Mätt i headless Chrome på en sida som nekar som en telefon (2026-11-14): rösten startade i tre av tre repliker före
  replikens första hörbara sampel, ljud mot bild som mest 8,6 ms isär.

**Antaget, inte prövat** (Jakob prövar på sin telefon): att Safari nekar med just `NotAllowedError`; att Safari avkodar
ljudspåret ur en MP4 med bildspår; att kontexten väcks av `touchend` och `click`; att `audioSession` gör det den ska.
Utan `requestVideoFrameCallback` (Safari före 15.4) sätts ljudet mot elementets klocka, vilket inte är mätt. Känd gräns:
första gången en replik sägs på en telefon hämtas filmen en gång till för ljudets skull (6–8 MB), så rösten kommer in en
bit in i repliken. En liten ljudfil bredvid varje talfilm, som lapparnas `line.wav`, tar bort väntan (läsaren är
inställningen `read` i lagret); den kräver att banken, labbservern och kopian bär filen, och görs först när en telefon
har visat att grunden håller.

## Fritt tal ur en chatt

Här finns de fasta svaren (direkt) och möjligheten att baka en ny text i förväg. Fritt tal skulle kräva en källa till
texten (en bot med dealerns persona; chatten i spelet är en attrapp), en väg i labbservern som tar texten och svarar med
filmen, och en varm renderer. Mätt 2026-11-13: en ny text på 36 tecken blev färdig film på 41 s med varm renderer (kallt
65–110 s); för långsamt för ett samtal. Vägen till sekunder är en renderer som strömmar munnen medan filmen spelas.

## Tal i rörligt spel: går det?

Ja: Scoutgamings dealers talar under given med samma renderer på serverless hos RunPod. Det som avgör är om renderern
är varm och hur munnen läggs på filmen. Hur Emil och Kevin gör, läst i Scoutgamings repo 2026-11-13 (inte kört; hela
genomgången i `D:/dealer-scratch/tmp/tal/scout-lasning/RAPPORT.md`):

- Munnen är ett lager över klippet som ändå spelas: renderern skickar en munruta per bildruta, märkt med tagning och
  ruta, i bitar om 12; sidan ritar den bara när just den rutan visas, och given väntar aldrig på talet.
- Före första kortet börjar rösten 600 ms in i greppet mot skon, efter ett kort 62 % in i kortets film; repliker
  överlappar aldrig, och en replik görs tidigast 3 s innan den behövs.
- Utropen förrenderas per plats, språk och tempo och sparas; ett tal börjar bara när både mun och ljud finns (ljudet som
  egen fil, högst 0,4 s väntan, annars bara text); spelet öppnar först när en varm renderer gör minst 30 rutor per
  sekund.
- På `main` görs öppningsrepliken medan spelarna satsar, mot den giv bordet väntas göra; blir given en annan spelas den
  inspelade.

Det som tagits efter här är munlagret med fasta repliker gjorda i förväg och Scoutgamings tider som regel för lappen.

**Mätt.** Den varma renderern här gör cirka 10 rutor per sekund, under filmens 24 och Emils 30: strömmande tal i takt
går inte på den här datorn, men en replik i förväg är klar på 10–15 s. Ett prov på hans RunPod 13 november (en egen
serverless-endpoint med Scoutgamings image, raderad efteråt; 0,05 USD) ritade 32–33 rutor per sekund, men varje bakjobb
läser in modellen (22–24 s per replik, och 264 s för den första efter en paus) och var inte snabbare än den varma
renderern här. Vinsten med RunPod ligger i den strömmande vägen, där modellen ligger kvar; därför är köraren på hans
RunPod målet (Munnen: tre sätt). Skripten ligger utanför repot, i `D:/dealer-scratch/tmp/tal/runpod/`.

## Kvaliteten

**Det som gäller.** Paows repliker har den neutrala munnen: rendererns låda lagd in som den är, med grinden men utan
läpparna och lyftet (`layBack` med `lips: null`; i kvittot är `laidBack.recipe.lips` `null`). Jakob valde den efter
jämförelsen i spelets storlek (`assets/proofs/paow-mouth-neutral-trio-20261118`) och gjorde den 2026-11-21 till
standard för alla hennes repliker (BESKED, "Den neutrala munnen är standard för alla Paows repliker"). Alla 25 repliker
och alla fyra lappar är neutrala, omlagda ur rendererns svar med samma ljud; de nya tagningarna är godkända i hans
ställe, de ersatta ligger kvar i banken, och blackjack är undantaget (Vad som gäller per dealer). Verktyget lägger
Paows nästa replik neutral av sig självt (`NEUTRAL_MOUTH` och `recipeOf` i `tools/speech.ts`).

Andra dealrar får **läppreceptet** (`RECIPE` i `tools/speech.ts`, måtten i `LIPS`, `layMouth` och `mouthMoves` i
`src/speech-plan.ts`), lagt ovanpå renderingen eftersom rendererns mun var tunnare och matt, stängde sent och visade
tänderna som ett vitt band:

- **Läpparna:** munnen förstorad 25 % på höjden, läpparnas färg flyttad till hennes, lätt skärpt, och bara det som ligger
  under hennes överläpp och mellan hennes gipor är ritat.
- **Lyftet:** i varje ruta där den ritade munnen ligger hel och är öppen lyfts hennes egen överläpp, hel, med öppningen,
  mest mitt på munnen och ingenting vid giporna; huden mot näsan dras ihop lika mycket, och den ritade öppningen börjar
  vid den lyfta läppens kant. En rundad mun räknas som öppen när käken har sjunkit (`LIPS.round`, `jaw`), en sluten mun
  är sluten (`LIPS.quiet`, `sunk`), och växlingsrutan lyfts inte. Lyftet per ruta står i kvittot (`laidBack.lifts`).
- Lapparnas mått `taper`, `ease`, `heard` och `arc` kom ur blinda jämförelser (omgång 11–14 i belägget); flytten nedåt
  (`drop`, `closed`) står på noll.

Vilket recept en tagning har står i dess kvitto (`laidBack.recipe.lips`).

**Prövat och inte att göra om:**

- Det ritade flyttat nedåt utan förstoring: lägre poäng.
- Hennes egen underläpp (2026-11-14 till 17): Jakob dömde det sämre än förut och det togs ur spelet, fast elva
  granskare hade föredragit det i 30 av 30 par (BESKED, "Hans ja före ett byte av läppar"). Lärdom: öppningen blev
  smalare och visade färre tänder, och gipornas rörelse på två till tre bildpunkter ser ingen. En jämförelse görs därför
  i spelets storlek och i rörelse innan något byts, och hans ja finns före ett byte av alla repliker. Måtten står kvar i
  koden som val och används inte.
- En annan läppsynkmodell (betald) behövdes inte för mungiporna och är inte gjord.

**Kvar** med den neutrala munnen (talbanans blick 2026-11-21, skattat, inte hans öga): munnen är 3–8 % mjukare än med
receptet och underläppen blekare i några repliker; svagast är dubblingen över ingången, "Detsamma" och "Dealern har
blackjack". Med receptet, i granskarnas ord: underläppen är mattare, suddigare och tjockare än hennes och sjunker medan
hakan står stilla, tänderna är strimmiga i de största öppningarna, läppen står i sitt högsta läge flera rutor i följd
och faller på en ruta när repliken slutar. Inte löst i hans ögon: mungiporna och överläppen (BESKED, "Inte löst i hans
ögon").

**Nästa steg** är hans idé: munnen ur hennes egen film (BESKED, "Munnen ur hennes egen film"). I `paow-vila-03-01`
öppnar hon munnen på riktigt innan hon ler (ruta 16–48; leendet 48–96), med egna tänder och gipor som rör sig. Modellen
skulle bara bestämma när och hur mycket munnen är öppen, och läppar, tänder och gipor hämtas ur hennes film för varje
ruta, inpassade mot näsan och lagda genom en mjuk ellips. Inte byggt.

Mätt men inte gjort: rösten har cirka 150 ms nästan tyst ljud före orden (−60 till −50 dB) och 110–190 ms efter.
Klipps ljudet tätare och renderas om blir repliken 0,3 s kortare och munnen öppnar en ruta före ljudet i stället för
två; det kräver en ny rendering per replik.

## Det som medvetet inte är gjort

- Ingen koppling till Scoutgamings tjänster: inga jobb på deras GPU-platser, inget i deras databas eller lager, ingen
  OpenClaw.
- Ingen strömmande läppsynk; varje replik är förrenderad, som hel talfilm i vila eller som munlapp över en film.
- Inga talfilmer över givar i banken: tal över en film går i spelet som munlapp.
- Inget tal över filmer i 30 bildrutor per sekund (Gränser, i Munlagret).
- Ingen talfilm med den professionella klonen av Paows röst (Rösten).
