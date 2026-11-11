# System och koordinater

Beslut 2026-11-10, samordnat med TILLBAKA-2: behåll V6:s bildrutetidslinje som enda uppspelningsgrund. Engelska systemord, svensk förklaring. Sekvenssträngar och nodvy är presentation av samma metadata, aldrig en andra motor. Nodvyn visar planerad avsikt; den fastställer inte en källfilms händelser. Nedanstående koordinat- och metadatakontrakt är dokumenterat men ännu inte implementerat för hela bordets utdelning.

## Tre ytor, två format

| Yta | Ansvar | Befintlig källa |
| --- | --- | --- |
| Bakgrund | Rummet bakom scenen | `assets/scene/room.png` |
| Bord | Matta, bordskant och mottagaryta | `assets/scene/table.png` |
| Dealer | Frilagd person och rörelse | `assets/frames/` och `assets/tracking/` |

Kort, marker, masker och kontaktskuggor komponerar dessa tre ytor; de är inga ytterligare valbara scenytor. Hand-/kortocklusion måste bevaras. V6 ger slutkomponerade bildrutor, inte tre fristående videolager.

| Format | Storlek | Regel |
| --- | --- | --- |
| Native / desktop | 1762×1174, exakt 881:587 | Bevara godkänd vinkel och yta. Ingen automatisk omformning till 16:9 eller exakt 3:2. |
| Porträtt / mobil | 1080×1920, 9:16 | Egen bord-/bakgrundskomposition och dealertransform. |

Verifierad kod i `src/pamela-card-contact-v6.ts`: native dealerkomposition skalas till 1586×1057, beskärs vid `(left=250,top=0,width=1080,height=1057)` och placeras på porträttytan vid `(0,80)`. Mattans native-utsnitt `(278,838,1200,336)` blir 1080×1086 vid `(0,834)`; kanten `(278,817,1200,21)` blir 1080×19 vid `(0,815)`. En global bildtransform kan därför inte beskriva alla tre ytorna. Återinför inte äldre bordskanter/magklippning utan separat granskning.

### 3D-scenen (`scene3d.html`)

Pamelas film visas i ett tredimensionellt rum med ett tredimensionellt bord. Sidan är fristående TypeScript-moduler som webbläsaren läser direkt, typavskalade av `tools/preview.ts`, med three.js 0.180.0 via importmappen i `scene3d.html`. Ingen React, ingen React Three Fiber, ingen bundler och inget byggsteg. Node används bara av labbservern, testerna och provinspelningen. Bakgrundsagenten äger dessa filer.

Lager, bakifrån och fram:

| Lager | Vad | Fil |
| --- | --- | --- |
| Rum | Byggd salong, 360°-panorama, V6-plåten som kuliss eller V6-plåten fast i rutan. Ritas i halv upplösning och görs oskarpt efter avstånd. | `src/scene3d-room.ts` |
| Bord | Filten är en platt bild sedd uppifrån (linjer, kortrutor ur placeringsplanen, logga), plus reling och sarg som geometri. Byte av logga eller filtfärg är ett bildbyte. | `src/scene3d-table.ts` |
| Rekvisita under filmen | Sådant händerna vilar på eller passerar över. Först ut: dealerns markerbräde, försänkt i ett urtag i filten vid hennes kant så att kant och marker ligger i filtens nivå och filmens händer vilar på dem. Ritas före filmen, så händerna hamnar alltid överst. | `src/scene3d-props.ts` |
| Film | Nycklas i shadern mot rutans egen gröna nivå (skuggor blir svart med delalfa) och projiceras från filmkameran på två ytor: ett lodrätt plan på bordets bakkant och bordsskivan. | `src/scene3d-film.ts` |
| Renderade kort | Labbets kortritare (`src/card-overlay-view.ts`) ritar filmrutan med det renderade kortet på, handen kvar framför, och scenen använder den rutan som film. Kortet får därmed samma nyckel, skärpa, fläktskugga och parallax som filmen. Laddas först när reglaget slås på. Gränser: kortet ritas i filmens bildrum och klipps vid filmrutans kant, och rundor med flera kort (placed/shift ur `resolveRound`) är inte inkopplade. | `src/scene3d-cards.ts` |
| Ljus | Fläktskuggan: en multiplikation ovanpå film och bord; filmens eget ljus går inte att ändra. | `src/scene3d-light.ts` |
| Bild | Vykamera, oskärpa, fokus och slutkomposit. | `src/scene3d-view.ts` |

Filmkameran läses ur `data/scene-contract.json` (planens kamera) i `src/scene3d-geometry.ts`, som återanvänder pinhålet i `src/scene-geometry.ts`. Tre lägen ska hållas isär: från filmkamerans plats är bilden filmen pixel för pixel; vridning och zoom från samma plats är geometriskt exakt; förflyttning är ett närmevärde som bryter vid ungefär en stols avstånd. Rundor spelas med klippbankens egna klippunkter (`resolveRound`), aldrig hela klipp efter varandra.

Allt som tillkommit efter kontrollpunkt v1 (fokus, fläktskugga, rekvisita) är avstängt från start, så sidan öppnar som v1. Ny bild jämförs mot föregående etapp innan den kallas oförändrad. Jämförelsen ska tåla webbläsarens egen variation: filtens tryckta guldlinjer kantutjämnas på två sätt mellan körningar, vilket ger medel 0,02 och högst cirka 30 av 255 längs linjerna även med oförändrad kod; allt utöver det, eller skillnad någon annanstans i bilden, är en verklig ändring. Etapper heter `jakob-N` (se DRIFT).

Kända gränser: planens kamera passar kortrutorna men dealern är inte ritad med den linsen; skalan k är skattad (1,8–2,5); skon är film och kan varken läggas bakom något eller bytas ut utan en egen matt; salongen, bordets mått och tryckets layout är platshållare. Test: `tools/scene3d-geometry.test.ts` (ren geometri, utan media).

## Bottom-up och koordinatreferenser

Bottom-up betyder att höjd ökar uppåt. V6 mäter idag bildpixlar från övre vänstra hörnet med y nedåt. Originalmätningar och referenshashar bevaras; en adapter ska konvertera vid en uttrycklig systemgräns.

Dokumenterat förslag för normaliserad **bildrymd**: `u` ökar åt höger, `v` uppåt, båda i `[0,1]`. `(0,0)` är nedersta vänstra pixelcentrum och `(1,1)` översta högra pixelcentrum. För `W×H`:

```text
x_px = u × (W − 1)        u = x_px / (W − 1)
y_px = (1 − v) × (H − 1)  v = 1 − y_px / (H − 1)
```

Native centrum `(0.5,0.5)` ger `(880.5,586.5)` före rasteravrundning. Native-punkten `(820,1026)` blir `(820/1761,147/1173)`. Utsnitt med `left/top/width/height` beskriver pixelkanter, inte denna pixelcentrumkonvention. Bordets fysiska plan och 3D-kameran kräver egna kalibreringar; normaliserad bildrymd är inte ett perspektivmått.

Placeringseditorns utkast finns i `placements/default.json`; vyprofiler och pixelkonvertering finns i `src/placement-model.ts`. Geometri lagras separat per `native`/`portrait`; hand-/sidavsikt och materialval hålls skilda från geometrin. Alla standardplatser börjar ogranskade (`reviewed=false`), inte uppmätta. `angle` är grader medurs i bildens y-ned-rymd; `width`/`height` är andelar av respektive vys pixelcentrumspann. `taper` formar konturen och bevisar inte en kalibrerad 3D-projektion.

`tableProjection` sparar editorns gemensamma visningsval: `mode: flat | individual` och `heading` i grader (`-90,-45,-15,0,15,45,90`). Plant bord med 0° är standard. Äldre schema-v1-filer utan fältet accepteras; editorn erbjuder att spara standardinställningen utan att flytta koordinater. Planändringen går att ångra. Läget/riktningen följer med i export/import och publicerade webbläsarutkast. Plant bord beräknas från P4.C1 och är fortfarande inte en uppmätt fysisk kamera. Riktning i bordplanet är skild från kamerans lutning och kortets böjning.

En analys av de nuvarande separata native-/mobilprojektionerna finns i [table-projection-review](../evidence/table-projection-review.md). Den flyttar inga sparade punkter och ändrar inte V6. Villkorliga målskillnader i analysen är inte uppmätt handkontakt i en framtida film.

Rörelsernas framtida bindning använder `placementRef`, `sceneProfileId`, `viewProfileId`; inga x/y-tal i sekvenssträngen. Film och framtida React/Next-overlay ska använda samma uppslag och samma resize/crop/letterbox-offset. Editorns placeringsfil är ännu inte kopplad till V6-renderern eller Scout. DRAFT-ordningen i en planerad sekvens är inte uppmätta filmannoteringar; noder eller dokument får inte hitta på saknade mätningar.

## Ordlista och gräns mot Scout

| Ord | Betydelse |
| --- | --- |
| `IDLE`, `READY` | Vila respektive redo. Äldre VILA/REDO är alias, inte nya tillstånd. |
| `LH`, `RH` | Dealerns anatomiska vänster/höger, oberoende av bildspegling. |
| `BACK`, `EDGE`, `FRONT` | Observerad fysisk kortsida mot kameran. |
| `CLOSED`, `OPEN` | Visuell statusetikett: baksida respektive framsida; får inte ersätta bevis på fysisk sida. |
| `HIDDEN`, `REVEALED` | Vad Scoutmotorn tillåter spelaren att se. En filmvändning ändrar inte detta. |
| `TAKE`, `PASS`, `TURN` | Ta kortet, överlämna samma kort mellan händer, respektive vända kortet. PASS är inte TURN. |
| `LAND`, `RELEASE`, `RETURN(IDLE)` | Bordkontakt, släpp och återgång; kan ha olika bildrutor. |
| `P4.C2`, `D.C2`, `VAR03` | Placeringsnycklar och rörelsevariant. V6 är historisk renderingsversion. |

Målet är P1–P7 och D, två kortplatser vardera: 14 spelarkort plus två dealerkort. Fysisk platsnumrering, utdelningsordning och koordinater ska fastställas innan implementation. Historisk P4=`deal.player.centre/box3` är proveniens, inte en verifierad åttaplatskarta. DL1/v2 är inte importerat.

Scoutgaming äger regler, slump, kortvärden och händelser. `P4.C2` är inte kortets runtime-ID; vid split krävs även hand-ID, medan Scout behåller kortinstansens ID. Ingen ny spelmotor i dealer.

Exempel, **inte klassning av en befintlig film**:

```text
P4.C2@VAR03 | TAKE(LH,BACK) > LAND(BACK) > RELEASE(LH) > RETURN(IDLE)
```

Överlappande PASS/TURN beskrivs med faktiska intervall, inte påhittad ordning. Färgbyte eller passage genom kantläge bevisar ensam ingen vändning. En tidigare rapporterad CLOSED→CLOSED-etikett får inte överordnas sammanhängande källbevis: den nyare P4.C2-källan stöder BACK→EDGE→FRONT, medan dess lokala `review-v04` färgar blå motsida gul. [p4Followup](../evidence/anchor-color-audit.json) skiljer fysisk observation från författad etikett och diagnostiskt överlägg. Detta ändrar inte P7-direktprovets separata klassning.

## Ett rörelseregister och tydliga bevis

- `motions/<clip-id>.json` är ensam källa för rörelsens klassning/beslut. Hand, pose, fysisk sida, spelstatus, mål och variant hålls separata.
- `data/library.json` är visningskatalogen utan mediekopior. Original, historiska sekvenser och diagnostiska överlägg hålls isär; beslut hämtas från `motionRef`. P4-gulprovet och de återställda native-sekvenserna är 1764×1174 i källrymd, inte V6:s native-vy 1762×1174.
- `data/public-media.json` binder publicerade katalogfilmer till Blob-URL:er med samma SHA-256. Nya lokala poster kan invänta publicering. `publicReview` anger exakt publicerad granskningsfil; publicering innebär inte godkänd rörelse eller Scoutintegration.
- Nya original placeras i `assets/motions/<clip-id>/source.mp4`. Korrigerad visningsversion har egen hash/relation till original. Befintliga registrerade original får refereras där de ligger; inga kopior per godkännandestatus.
- `KEYFRAME` är en källruta. `ANCHOR` är en utpekad källruta för exempelvis grepp, kantläge, kontakt, släpp eller vila: källhash + rutnummer. Saknad kunskap är `null`/`UNKNOWN`, inte uppskattade tider.
- Bevisgrund `MEASURED/OBSERVED/REPORTED/HYPOTHESIS/UNKNOWN` skiljs från beslut `PENDING/ACCEPTED/REJECTED`. Rörelse, mask/geometri, scen och Scoutanslutning bedöms separat.
- Maskkontrakt enligt TILLBAKA-2:s senaste användarkorrigering: CLOSED RGB `[255,255,0]`, OPEN `[0,0,255]`, bakgrund `[0,0,0]`, förlustfri mask; kontur separat. MP4 är visningsmaterial, inte exakt färgmask. Författad maskfärg bevisar inte originalets kortsida.

Genererad gul/blå färg kan också vara fel trots en fysisk vändning. Bedöm först rörelsen och märk BACK/EDGE/FRONT från sammanhängande källrutor; lägg därefter lokalt kortutseende. P4.C2-originalet bedöms separat från det sekundära gula överlägget: i källan smalnar gult vid f57–60, kantläge följer f61–62 och blå motsida öppnas från f63. Det bevisar inte färdig mask-, kontakt- eller produktionsacceptans. Editorns gul=BACK och blå=FRONT gäller fortsatt; rosa är en separat maskhjälpsyta. Filmklassning och beslut finns endast i motions-registret.

Filmgranskningen använder klippets fps för steg ±1 bildruta och källbundna kapitel. Hastigheterna 0,25×/0,5×/1× ändrar bara visningen. `clip` och `frame` i URL:en anger granskningsläge, inte nya filmannoteringar. En sekvensruta måste mappas via sin frysta tidslinje innan den anges som en ingående råfilms källruta.

Behåll JSON/manifest som dagens lagring: rörelseregistret äger besluten, katalogerna refererar till dem och lokal preview har en sparväg per placeringsfil. Publika webbläsarutkast är separata och flyttas med export/import. Ingen tillfällig SQLite- eller ny produktdatabas införs nu; skäl och begränsningar finns i [lagringsbedömningen](../evidence/storage-choice-review.json). Media förblir separata filer/Blob-objekt med hashreferenser. En framtida beställd Scout-import får ett uttryckligt kontrakt utan dubbla produktstatusägare.

## Vad labbet skickar till genereringen

Placeringsvyn visar målgeometri och avsikt. Blå/gul i editorn hjälper granskaren att skilja avsedd fram-/baksida; rosa behövs inte där. Rosa i en källfilm är en hjälp för att senare hitta och ersätta kortytan. Det avgör inte vilken fysisk sida som syns. Three.js-materialet är fortfarande ett separat prov, inte ett automatiskt filmlager.

De två senaste P7-jobben använder `tools/generate-p7-direct.ts`: en fryst placeringsplan ger målkortets hörn i slutbilden. API-anropet innehåller exakt textprompt, modell/längd/format och två PNG-bilder (första/sista). Varken hela labbskärmbilden, placerings-JSON, nodkartan eller 3D-materialet skickas till Runway. Ändringar i editorn beställer inga filmer. Jobbens fulla prompt och bildhashar finns i respektive `motions`-post; själva bilderna och API-kvittot ligger i `assets/motions/<clip-id>/`.

Det beställda `pamela-p4-c1-color-control-01` är ett separat kontrollprov via `tools/generate-p4-control.ts`: exakt start-/slutbild och prompt från den nyare historiska P4.C1-tagningen, 4 s, `wan3`, ingen omfärgning. Den historiska planen är kontrollunderlag, inte aktuellt editorutkast. WAN3 och det efterföljande Kling 3.0 Pro-provet är SUCCEEDED men REJECTED för vändningskravet: båda byter färg på en bred yta utan verifierad kantpassage. Kling ger 1764×1172, 24 fps/97 rutor; ingen retiming eller formatkorrigering är gjord. Kvittot i `assets/motions/<clip-id>/generation.json` och HANDOFF anger aktuell status.

## Klippbank och nodnotation

Labbets flik **Klippbank** (`lab.html?tab=klippbank`) visar klippjobben som ett nodträd. Noderna är ankarposer: `IDLE`, `READY` och ett landningsankare per kort (`P4.C1`, `D.C2`). Varje klipp är en kant `A>B` med en enda handling; en runda är kanter i följd:

```text
IDLE>READY | READY>P1.C1 | P1.C1>READY | READY>D.C1 | D.C1>READY | READY>P1.C2 | P1.C2>READY | READY>D.C2 | D.C2>IDLE
```

- Banken är 51 kanter: 16 kort × giv, retur till READY och retur till IDLE, samt `IDLE>READY`, `READY>IDLE` och `IDLE>IDLE`. `D.C3` är tre valfria kanter utöver dem. `@<klipp-id>` efter en kant låser en viss tagning, till exempel en variant. Jobbfilens `LAND(P4.C1)`/`RELEASE(P4.C1)` och VILA/REDO läses som samma noder.
- READY kan ha namngivna varianter (`READY-B`): `READY-B>P4.C1` är en tagning av kanten `READY>P4.C1` med annan startpose, visad som variant-start och spelad bara när rundan skriver den så. Jobb med andra noder (`READY-B>DRAWN`, `DRAWN>P4.C1`) tappas aldrig: de bildar gruppen Experiment utanför de 51, med samma detaljvy och som egna kedjor att jämföra med modellens väg.
- Fliken är presentation, inget eget statusregister. `src/clip-graph.ts` räknar grafen ur `data/clip-jobs.json`, lokala kvitton (förberedd/renderas/klar) och `motions/<id>.json` (beslut), och läser om var fjärde sekund. Huvudtagning är godkänd före ogranskad och, bland lika, den senaste som har en passande retur. Underkända tagningar väljs aldrig; de och ersatta tagningar ligger hopfällda per kant och i den skrivskyddade städlistan. `review.acceptedAs: "MAIN"` går före härledningen och `"VARIANT"` visas bredvid.
- Ankarregeln för klipp: en retur vars första bild är en fil (landningsankaret) passar varje tagning av given, som spelas till sin sista ruta. En retur vars första bild är en ruta ur ett visst givklipp passar bara den tagningen, som klipps vid den rutan (`first.frame.index`; `motion.landingFrame` går före om det anges). Rundbyggaren spelar kedjan, stegar ruta för ruta över klippen och visar saknade kanter som luckor. Scout äger fortsatt ordning, regler och kortvärden.
- En härledd tagning är inget nytt klipp utan rutorna A–B ur ett befintligt: `"derived": [{id, kind, from, to, clip, frames: [A, B]}]` i jobbfilen.
- **En film per plats** är förvalt läge (Jakobs beslut 2026-11-11; `lab.html?…&filmer=kort` ger en film per kort). Platsens andra kort har då ingen egen film: `READY>P4.C2` spelar platsens giv `READY>P4.C1` och `P4.C2>READY`/`P4.C2>IDLE` platsens returer, med det renderade kortet flyttat planens avstånd C1→C2 (visas per plats, varning över 50 px). Regeln är sidan, inte namnet (`filmCard`): kort 2 delar bara film när det slutar på samma sida som kort 1, så dealerns stängda `D.C2` har egna filmer och banken behöver 30 filmer (3 nav + 7 platser × 3 + `D.C1` × 3 + `D.C2` × 3). Huvudet visar hur många som finns, delat i kandidater (huvudtagning ogranskad eller godkänd), kända brister (huvudtagning sekundär) och saknade. Notationen är fortsatt kort för kort; `buildGraph(data, {mode})` sätter `edge.shares` och `summary.films`, `resolveRound(…, {places})` ger steget `film` och `shift`. En egen film för kort 2 ligger kvar som "egen film för kort 2" och spelas bara när rundan namnger den. I rundan ligger tidigare utdelade kort kvar renderade där deras senaste film lämnade dem.
- En rättad kopia (`"edits": [{id, source: {clip}, model, promptText, purpose}]`) är ännu en tagning av källklippets kant och visas bland de aktuella tills den granskats. `playbackSpeed: 2` på ett jobb spelar tagningen i dubbel fart; rutnumren är filens. Ligger `source-reversed.mp4` bredvid filmen erbjuds "Spela baklänges" i tagningen.
- **Renderat kort** (kryssruta under filmen och under rundans kedja) ritar Materialpanelens eget kort ovanpå filmen. Läge, vridning och sida kommer ur kortspåret `assets/tracking/<klipp>/card-track.json` (`node tools/track-card.ts <klipp>`); filmens kort är bara en markör. Storleken kommer ur `data/scene-contract.json` och är densamma på varje plats: Kortskala 1,0 är planens kort och förvalet 1,2 en femtedel större, så filmens kort täcks utan att korten tar över bordet; det som sticker ut av ett större filmkort tar bakgrundsfyllningen. Varje sammanhängande fläck av filmkortets gula eller blå om minst 50 bildpunkter utanför skofönstret målas över med bakgrunden omkring, var den än ligger (kort som legat sedan en tidigare giv, eller filmens kort där spåret tappat det); handen ligger kvar framför. I handen ritas filmens fyrhörning 20 % större. I vila ligger kortet på planens plats och i planens riktning i bordets perspektiv, inte där filmens sista ruta råkade lägga det; flytten dit växer från noll vid skon. Pappret exponeras så att det läses som vitt bredvid filmens vita. Filmens eget kort som sticker ut målas med bakgrunden runt om, hand och ärm ligger framför (matt ur aktuell filmruta). `assets/tracking/<klipp>/overrides.json` med `{"cardInFront": [{"from": 72, "to": 78, "note": "…"}]}` lägger kortet framför handen i de rutorna. Modell och matt: `src/card-overlay.ts`; ritning: `src/card-overlay-view.ts`. Saknas spår visas filmen som den är och fliken säger det i klartext. Spåraren (`src/card-track.ts`) följer markörregeln: filmtypen ur jobbfilen avgör vad som kan synas (en giv vänder en gång, en retur visar en sida, ingång och vila har inget utdelat kort), fynd som strider mot det är ett annat föremål och stryks, kort som legat på bordet sedan före given tas ur bilden, det sittande kortet i skon lämnas så fort ett fritt kort syns, och korta hål överbryggas ur rutorna omkring. `node tools/card-coverage.ts --all` mäter per film och ruta hur mycket av filmens eget kort som ändå syns utanför skofönstret (`coverage.json` och `receipt.json` bredvid spåret); tagningen och granskningslistan visar "täcker allt" eller "läcker ruta 61–63".
- Granskningsbeslut sätts i tagningen: Godkänn, Variant, Underkänn och en anteckning. `PUT /api/clip-bank/review/<id>` skriver bara `review` i `motions/<id>.json` (`decision`, `acceptedAs`, `userReview` med datum, `userAccepted`) med samma skydd som placeringarna: eget ursprung, `If-Match` mot postens revision och atomiskt namnbyte (`tools/review-store.ts`). Inget skrivs vid inläsning; en tagning utan post i `motions/` kan inte beslutas.
- Jobbutkast för saknade kanter kopieras ur fliken, som aldrig skriver i jobbfilen eller beställer något. Preview-servern lämnar utöver det bara ut läsvägarna `/api/clip-bank` och `/api/proofs`, `source.mp4`, `source-reversed.mp4`, `first.png` och `last.png` för klipp i jobbfilen, deras spårfiler under `assets/tracking/<klipp>/` samt mp4, png och json under `assets/proofs/`. För 3D-scenen (`scene3d.html`, länk i labbet när sidan finns) lämnas three.js ut som `/vendor/three.module.js` och `/vendor/three.core.js` ur det låsta beroendet `three`, inget annat ur `node_modules`. Fliken Prov (`?tab=prov&proof=<mapp>`) spelar provmapparnas filmer; `proof.json` får bära `title`, `description`, `labels` och `chapters`. Publika sidan saknar underlaget och visar "finns bara lokalt".

## Återbruk och införande

Två historiska banker måste hållas isär. Den **äldre vita banken** på 182,867 s byggdes av fjorton separata 12-sekunderstagningar plus vila/bryggor. Kortversionen 146,8 s trimmade hela bildrutor utan retime/blend. P4.C1/C2-promptarna begärde vita kort och komplett dragning–placering–släpp–tom retur, ingen uttrycklig sidvändning. Dess senare materialvisning tilldelade kortsidor; råfilmens semantiska sida var UNKNOWN. Dessa vita original är inte källan till den nyare gula/blå P4.C2 och dess felaktigt helgula `review-v04`. Exakta äldre instruktioner, trimintervall och hashkontroller: [historiskt underlag](../evidence/historical-p4-generation-inputs.json).

Den **nyare r2-banken** är återställd som fyra hela historiska alternativ i native/porträtt: `motions/pamela-sequence-{16,17}-{native,portrait}-r2.json`. Sekvensen med 16 kort är 3296 rutor/109,867 s; den med 17 kort är 3598 rutor/119,933 s, båda 30 fps. Jakob accepterar dem som alternativ men anger fel koordinater/format; de är inte identifieringen av den efterfrågade äldre sekvensen. Den äldre bankens kandidater på 182,867/146,8 s måste matchas separat mot hans önskade prov. P1–P7 får två kort i r2, D.C1 visas öppet och D.C2 slutar dolt i 16-kortsfilmen. 17-kortsfilmen fortsätter med separat reveal av D.C2 och dragning av D.C3. Scout äger även fortsättningsvis när reveal och dragning tillåts.

Filmerna börjar och slutar i IDLE men bordstillståndet ändras från tomt till 16/17 kort; de får inte loopas direkt till tom start. Gemensam READY/IDLE-pose betyder inte identiskt bord eller fria skarvar mellan godtyckliga klipp. Historisk tidslinje, placeringsplan, inbakade kort och kvalificerade skarvar följer med som beroenden. Den nuvarande editorns mål har inte applicerats på filmerna. Återbrukets hash-/bildruteverifiering finns i [sequence-reuse-audit](../evidence/sequence-reuse-audit.json) och [sequence-review-production](../evidence/sequence-review-production.json); besluten är PENDING, inte produktionsacceptans.

`materials/source/references/card-materials/new-front2/` innehåller medföljande 3D-materialreferenser; `new-front2` är en läsbar syskonreferens, inte ett runtime-beroende. Namnen Pamela/Göran i äldre material måste kopplas till verifierad filhash/proveniens innan identitet antas. Nya läsningar från gamla labbet registreras; inga gamla node_modules eller junctions importeras.

Underlag: `Dealer_sekvensguide_2026-11-10.md` och `Dealer_studio_skiss_2026-11-10.html` i Jakobs Downloads samt bifogad diskussion `2363882c-7e08-4c16-98fc-37620eb14bf9/Inklistrad text.txt`. De är referensförslag. Guidens semantik har sammanvägts här; HTML-skissen är inte installerad och texten är inte behörighet att ändra runtime. Källsökvägar/hashar finns i `.runtime/documentation-sources.json`.

Nästa steg: identifiera den efterfrågade äldre sekvensen och granska P4.C2-originalet och kontrollprovet; r2-filmerna förblir alternativa underlag. Bind därefter en accepterad rörelse till vald placeringsrevision. Full acceptans kräver obruten tvåkortsutdelning till alla åtta platser i båda format, verifierad kontakt/mask och bevarad V6-referens. V6-reproduktionskvitton och återställda sekvensfiler bevisar olika saker; inget av dem ersätter aktuell visuell acceptans eller Scoutintegration.
