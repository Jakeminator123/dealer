# System och koordinater

Kontrakt: koordinater, register, scen, spel och klippbank. Engelska systemord, svensk förklaring. Klippbankens rundor
(`resolveRound` i `src/clip-graph.ts`) spelas i studion, i 3D-scenen och i spelet. Sekvenssträngar och nodvy är
presentation av samma metadata, aldrig en andra motor; nodvyn visar planerad avsikt och fastställer inte en källfilms
händelser. V6 (tre ytor: rum, bord och dealer; native 1762 × 1174 och porträtt 1080 × 1920) och renderaren som
återskapade den är arkiverade sedan 2026-11-23 (README, "Verifierad bas och gräns"; DRIFT, "D: och städning").

## 3D-scenen (`scene3d.html`)

Filmen visas i ett tredimensionellt rum med ett tredimensionellt bord: fristående TypeScript-moduler som webbläsaren
läser direkt, typavskalade av `tools/preview.ts`, med three.js 0.180.0 via importmappen; ingen React, ingen bundler,
inget byggsteg. `scene3d.html` är utvecklarens sida med alla reglage; `game.html` bygger samma scen utan panel.

| Lager, bakifrån | Vad | Fil |
| --- | --- | --- |
| Rum | Byggd salong, 360°-panoraman ur rumsregistret, V6-plåten som kuliss, och spelhallen (`BuiltRoom`, hämtas första gången den visas). Halv upplösning, oskarpt efter avstånd. | `src/scene3d-room.ts`, `src/scene3d-hall.ts` |
| Bord och rekvisita | Filten är en platt bild sedd uppifrån (linjer, kortrutor och insatsringar ur placeringsplanen, logga); reling och sarg är geometri. Rekvisita ritas före filmen, så att händerna hamnar överst: markerbrädet försänkt i filten (`TRAY`, `table.build(edgeZ, scale, notch)`), spelets föremål med `scene.addProp`, skon som föremål (`?sko=3d`, `loadShoe` i `src/game3d-props.ts`; `scene.hideFilm` lämnar filmens sko oritad, och en hand som sträcks in i rutan klipps med). Ljus på bordet kommer ur rummet. | `src/scene3d-table.ts`, `src/scene3d-props.ts`, `src/scene3d-rail.ts` |
| Film | Nycklas mot rutans egen gröna nivå (övre och nedre vänstra hörnet; skuggor blir svart med delalfa) och projiceras från filmkameran på ett lodrätt plan vid bordets bakkant och på bordsskivan. En film med egen ruta (`motion.frame = {scale, anchor, layer, shadow}`, `Part.frame`) visar dealern i annan skala: punkten (881,5; 831,5) i standardrutan, dealerkantens mitt, ligger på `anchor`, och `layer: "BEHIND_TABLE"` ritar rutan bakom bordskanten, så att bordet skymmer henne; med `behindFrom` (rutnummer) först från den rutan (`frameAt`). Filmen där hon går: kameran backar längs sin siktlinje (`exitView`). Ett andra kortspår (`card-track-grip.json`, samma format, med `film` och `held` per ruta) spelas när panelen Kort eller `?spar=grepp` säger så. En del med munlapp (`Part.mouth`) spelas i takt 1 ([TAL](TAL.md)). | `src/scene3d-film.ts`, `src/scene3d-mouth.ts`, `src/scene3d-exit.ts` |
| Renderade kort | "Ritade kort" under Spelet. | `src/scene3d-deal.ts`, `src/card-overlay.ts`, `src/scene3d-matte.ts` |
| Ljus och bild | Fläktskuggan ovanpå film, bord och rekvisita (`lit`); rummet kan ligga som ett svagt ljus längs hennes kontur (`wrap`); vykamera, oskärpa, fokus och slutkomposit. | `src/scene3d-light.ts`, `src/scene3d-view.ts` |

**Nycklarna.** Scenens läge är `SceneState` (`scene.set({...})`, och samma ord i adressen på `scene3d.html`, till
exempel `?room=skog&dust=0.7&ui=0`); förvalen står i `DEFAULTS` i `src/scene3d-view.ts`, och allt utöver kontrollpunkt
v1 är av från start. Varje nyckel står som data i `studio/lib/scene-keys.ts` (grupp, svensk etikett, reglage,
hjälprad), märkt D (bör nå demospelaren som val eller fast förval i spelet) eller U (utvecklarens kalibrering). Det som
inte står där:

- Rummen är `data/scene-rooms.json` (`readRegister`: bild med hash och källa, oskärpa, ljus, vridning, spegling, luft,
  rumsljud, `game`). Labbet visar alla, spelets meny bara de med `game: true`, och ett nytt rum prövas i labbet först.
  Sfären visar bilden spegelvänd om rummet inte säger annat (`mirror`), och bordets fotoyta speglar rummet med samma
  vridning (`ROOM_TURN` 0).
- `tableModel: bord-02` är bordet BORD-02 ur Ultimate Reality (`src/scene3d-bord02.ts`, hämtas när valet görs);
  `cloth`, `felt`, `base`, `cups` och hyllan gäller bara standardbordet. Materialens kartor är lokal media
  (`data/scene-materials.json`).
- `roomLife` lägger filmer med folk i rörelse på rummets sfär (`ROOM_LIFE` i `src/scene3d-room.ts`). En film som görs
  om får ett nytt namn (`-2`), eftersom kopian låter webbläsaren behålla en film i ett dygn.
- `tal` (`repliker` eller `av`) avgör om spelets dealer säger sina repliker med talfilm och ljud eller bara som text i
  chatten. Spelet sätter inramningen per skärm (`format: fill`, `FRAMING` i `src/game-page.ts`).

**Gränssnittet för spelsidan** (`createScene(canvas, host, data)` i `src/scene3d-view.ts`; mått i dealermeter: x tvärs
bordet, s från dealerkanten mot spelarna, y upp från filten): `scene.spots()` ger kortplatser och insatsringar som
filmkameran lägger dem (läs dem i rekvisitans `build`; de flyttar sig med lins och skala), `project(x, s, y)` ger
skärmpunkt och punkter per meter, `pick(clientX, clientY)` punkten på filten, `onFrame(fn)` ett anrop per ritad ruta,
och `addProp({group, build(edgeZ, scale)})` och `lit(material)` gäller rekvisita.

**Filmkön.** `players.play(delar, {loop, cut, onPart, onEnd, onError})`, `hurry(fart)` och `preload(sökvägar)`; en del
är `{path, start, end, rate, track, cards, frame, fps, sound, model, rest, mouth, effect}` (`effect`: en vilofilms
begäran om en effekt i scenen, `FilmEffect` i `src/clip-graph.ts`), och `scene.mouth` läser lappar i förväg, säger om en
är inläst och för logg över varje replik. En ny kedja börjar när delen på skärmen är klar (klipp passar bara ihop i
ändarna), `cut` byter direkt, och den gamla rutan ligger kvar tills den nya finns. Varje del börjar med en riktig
sökning till sin första ruta, och en film som väntar på sin första ruta startas först när den rutan är ritad
(reservtimer 50 ms), så att ingen av delens första rutor tappas; priset är ungefär en ruta per del.

- **En start som webbläsaren nekar** (`NotAllowedError`) tappas inte: en film som skulle höras startas tyst (sidan
  säger då repliken med sitt eget ljud, [TAL](TAL.md)); nekas den tyst också står bilden kvar och filmen startas i
  besökarens nästa tryck (`touched`), som också öppnar varje väntande element. `wake()` startar det som står när sidan
  kommer tillbaka på skärmen. Potten håller 8 element, 5 på pekskärm, och filmlagren ritas först när en film har gett
  sin första bild.
- **`diagnos=1`** (`src/game-diagnosis.ts`, `players.diagnosis()`; kopians dörrar bär ordet vidare) skriver på bilden
  webbläsaren, om bildytan har förlorats, sidans senaste fel och vad kön håller och senast gjorde.

**Casino** (`/studio/game/`) bär spelets uttryckliga adressval vidare till spelet i ramen, genom förvalsbyte och nytt
bord: `diagnos=0|1`, `kort=hand|liggande|matt`, `cardBack=film|dark`, `cardFace=film|paper`, `dealTempo=1…1.15` och
`geometri`. Ogiltiga värden lämnas utanför och redovisas som okända (`studio/lib/casino.ts`).

**Filmkameran** läses ur `data/scene-contract.json` i `src/scene3d-geometry.ts`; med geometrin `lens` är den bordets
lins (`lensCamera`, "Ritade kort"). Kontraktet skrivs av `node tools/scene-measure.ts`, som mäter bordets plan, ljuset
och porträttramen ur verkliga rutor i Pamelas film (`src/scene-geometry.ts`; varje tal bär sin grund i `basisLegend`).
Från filmkamerans plats är bilden filmen pixel för pixel; vridning och zoom är geometriskt exakta; förflyttning är ett
närmevärde som bryter vid ungefär en stols avstånd. Verifiering: med allt avslaget är hemvyn (klipp 1 vid 2,9 s,
1764 × 1174) identisk med en referensbild i `assets/proofs/bakgrund-3d-referens/`, utom filtens guldlinjer (medel 0,02,
högst cirka 30 av 255). Kända gränser: planens kamera tänjer dealern vid bildkanten när vyn vrids; skalan k är skattad
(1,8–2,5); filmens sko kan inte läggas bakom något utan egen matt; dealern är ett platt utklipp; sko och lyft arm
korsar bordskantsraden 831,5, så skon står helt på filten och oförändrad mellan klipp.

**Studion** (`studio/`, `http://127.0.0.1:4319/studio/`) är labbet: en Next.js-app (App Router, React, Tailwind) med
eget `package.json`, byggd till statiska filer (`npm --prefix studio run build` ger `studio/out/`) som labbservern
lämnar ut under `/studio/` (`tools/studio-files.ts`). De rena modulerna (`clip-graph`, `placement-model`,
`card-overlay`, `card-track`) byggs in; 3D-scenen läses i körtid från servern (`labModule` i `studio/lib/lab.ts`) med
samma importkarta som `scene3d.html`, så att sidan har en enda three.js och visar spelets scen. `npm --prefix studio run
types` kontrollerar studions filer. Next 16 skiljer sig från äldre versioner: läs `studio/node_modules/next/dist/docs/`
före ändringar (`studio/AGENTS.md`). Bredvid studion står `pages/`: 3D-sidan (`scene3d.html`), Ljud (`sound.html`) och
Modeller (`props.html`).

**En dealer i taget:** växeln överst (namn och paus ur `data/dealers.json`) väljer vems tagningar varje vy läser
(`buildGraph(bank, {dealer})` i `studio/lib/bank.ts`). Valet står i adressen som `?dealer=` och minns i webbläsaren
(nyckeln `studio.dealer.2`, bara ett eget val); adressen går först, sedan en tagning som adressen nämner, sedan
minnet. Utan val gäller `FIRST_DEALER` i `src/clip-graph.ts` (Paow). Scen spelar det en annan dealer har och visar
resten som luckor; Casino och spelsidan spelar aldrig en annan dealers film.

## Spelet (`game/` och `/api/game`)

`game/` är Scouts blackjackkärna, förd hit oförändrad i sak (regler, sko med bränt kort och skärkort, slump med journal,
signaler); `game/provenance.json` anger Scout-fil, commit, blob och avvikelse per fil. Ren TypeScript utan DOM som
aldrig importerar från `src/`. Scouts boxar 0–6 finns bara i kärnan: `game/seats.ts` är den enda översättningen, och
allt utanför räknar platser 1–7 (plats 1 kamerans vänster). `game/session.ts` är en lokal enspelarsession i minnet:
saldo, `requestId` (samma svar vid omsändning), `expectedVersion`, och svar med signaler och vy. Skon är `secure` som
förval; `seeded` och `stacked` (förutbestämda kort, bara labb) syns som `view.shoe.source`.

Labbservern håller en session per bordsnamn (`?table=<namn>`, `main` utan): `GET /api/game`, `POST /api/game/command`
(`start`, `act`, `insurance`, `collect`) och `POST /api/game/new` (nytt saldo och sko), med samma skydd som
granskningsvägen; i kopian kör spelsidan motorn själv (`cloud/studio/game-local.ts`). Hålkortets valör lämnar aldrig
servern före vändningen. Signalerna är Scouts: `speak`, `deal`, `reveal`, `turn`, `settle`, `idle`; `deal` och
`reveal` bär `shoeDraw`, handens summa (`total`, `soft`) och `natural`/`blackjack`, så att sidan aldrig räknar
kortvärden. Vinsten når saldot vid `collect`. Känd egenhet i Scouts kärna: `outcome` i `settle` räknar in
försäkringens utbetalning.

**Gränsen mellan kärnan och presentationen.** Kärnan och sessionen äger regler, sko, slump, kortvärden, hålkortet och
pengar: saldot ändras bara i `session.command`, ur kärnans effekter, och en runda avräknas en gång (en andra `collect`
nekas). Presentationen (sidan, `src/game-view.ts`, overlayen, regissören, filmen och scenen) visar svaret och får inget
annat: den räknar inga kortvärden, väljer inget utfall och ändrar inget saldo, och varje kort den ritar är motorns kort
på sin `shoeDraw` (labbets `cardRank`/`cardSuit` används aldrig för ett kort i spelet). En summa visas först när dess
kort har landat och följer sin hand genom en split (`shownFor`). Sidans kontroller frågar `mayAsk` och gör bara det
overlayen erbjuder i fasen (också `window.game.controls`, som inspelaren trycker); rundans `collect` skickas en gång
(`collector`); en omladdad sida tar fasen ur motorns läge (`stageOf`). Sessionen är en spelare: flera platser är inte
flera spelare. Hållet av `tools/game-session.test.ts` och `tools/game-view.test.ts`.

**Spelets bank:**

- Spelet spelar bara tagningar med dom, Jakobs eller en preliminär (`judgedBank` i `src/game-director.ts`). Undantaget
  är en talfilm, en vilotagning på begäran (`motion.idle.onRequest`), som slumpen aldrig väljer. En nödlösning
  (`motion.stopgap`) spelas bara där samma dealer saknar annan dömd tagning på kanten. Ett labbprov med
  `review.labOnly: true` går att spela i labbet men ingår aldrig i spelets bank; Jakobs eget godkännande, Variant eller
  Primär häver gränsen, en preliminär dom gör det inte.
- En retur till vila som saknar film spelas som returen till skon och utgången (`READY>IDLE`). Ett kort vars giv saknar
  film ges med filmen i `STAND_IN_FILM` (per dealer; hålkortet med första kortets film, ritat med ryggen upp), och
  ersättaren viker när kortets egen film finns. Dealerns tredje och fjärde kort läggs utan hand. Det ett steg inte kan
  spela som banken har det, och det klippbanken säger om en film det spelar (skarv, retur med den andra handen, fel
  kortsida), står i stegets `gaps` (`play()` i `src/game-film.ts`, `window.game.gaps`). Dealerbytet (`swap()`) spelar
  bara bankens dömda filmer.
- **Giv från ankare 2.2 (släp).** `SEAT_HUB` i `src/game-director.ts` är en karta per dealer över platser som ges från
  ankare 2.2 (`READY-B`) i stället för 2.1 (`READY`); i dag Paows plats 6. Kartan är källan för vilket ankare spelet ger
  ett kort från (`dealPose`; `dealAnchor` i `studio/lib/orders.ts`). Den gäller bara när banken har fyra dömda filmer:
  `IDLE>READY-B`, `READY-B>P6.C1`, `P6.C1>READY-B` och `READY-B>IDLE`; annars ges platsen som förut. Kedjan går via vila,
  eftersom det inte finns någon kant mellan READY och READY-B, och platsens första kort står för hela platsen. Labbets
  rundbyggare gör likadant med `roundSequence({..., hubs})`, och produktionslistan och Kartan räknar platsen som klar
  bara när spelet själv skulle ge den så (`hubDeals`). Steget för utgången i Beställ heter `UTGANG-2.2`. I Bordet väljer
  kortets handbyte ankaret för dess filmer (`wishAnchor` i `studio/lib/bordet.ts`): med handbyte går given och de två
  returerna från A2.3, utan handbyte från kartans ankare; Bordets förvalda runda (`roundFor`) stannar på spelets ankare
  tills banken har kortets filmer från A2.3 åt båda hållen (`hasRound`, `gameLine`).
- Efter en giv väljs en retur av samma hand som lade kortet (`motion.releaseHand`); finns ingen spelas den andra med en
  anteckning om felet.
- Dealern säger sina repliker med talfilm och ljud (`src/speech-lines.ts`, rösten i `data/speech.json`): `goodluck` före
  given, `dealerplays`, `insurance`, `double`, utfallet och `placebets`; en replik utan film står som text i chatten. En
  talfilm spelas hel, i vila. En replik som hör till stegets början sägs i stället över den första filmen i kedjan som
  har en munlapp för den, och "Dealern spelar." över hålkortets vändning, om lappen ryms i delens utsnitt och ljudet
  börjar högst 8 s in (`placeLines` i `src/speech-patch.ts`, registret `data/speech-patches.json`). En del med lapp eller
  eget ljud spelas alltid i takt 1, också när `filmTempo` står högre. Talet i sin helhet: [TAL](TAL.md).

**Ritade kort.** Filmens egna kort har ingen valör: gult är ryggen och blått framsidan (BESKED, "Gul rygg, blå
framsida"), och sedan 2026-11-20 bär den blå sidan ett litet rosa kryss i mitten och en liten röd cirkel i hörnet nere
till vänster, som kortet ligger i bilden (BESKED, "Märket på blå sidan"). Färgerna står på ett ställe i koden, `CARD_RGB`
i `src/placement-model.ts`, märkets mått i `CARD_MARK` (andelar av kortets bredd), och `cardMark` lägger märket genom
kortets perspektiv. Labbet ritar det på varje fyllt blått kort (`CardMark`), `layCard` i `tools/order-images.ts` på
beställningens bild och på en ny A3 (orderns `drawn.mark`), och texten säger märket bara när sista bilden visar det
(`markSeen`, `prompt.faceMark`). Kortspåret (`assets/tracking/<klipp>/card-track.json`) säger var kortet är i varje
ruta, och scenen ritar ett riktigt kort där (`cardMethod: 'scene'`, förval): ett föremål under filmen, där filmens eget
kort nycklas bort så att hennes fingrar ligger över det ritade.

| Del av filmkortet | RGB | Hex |
| --- | --- | --- |
| Gul rygg | 241, 216, 0 | `#f1d800` |
| Blå framsida | 0, 130, 218 | `#0082da` |
| Rosa kryss (X) | 255, 120, 200 | `#ff78c8` |
| Röd prick | 225, 30, 35 | `#e11e23` |

- Kortet ritas för den ruta som visas: filmkön håller reda på vilken ruta varje film senast visade
  (`requestVideoFrameCallback`), inte filmelementets klocka.
- Ett kort ritas bara när fyrhörningen är ett troligt kort (`plausible` i `src/card-overlay.ts`): hörnen går åt samma
  håll och korsar inte varandra, kortet är högst 180 bildpunkter (roten ur ytan), längsta sidan högst 3,6 gånger roten,
  och perspektivet högst 3. En ruta utan troligt kort behåller det senaste i högst tre rutor (`HOLD`).
- Kortet i handen böjs högst en tjugondel av vägen till ögat, mätt på den yta kortet ligger på (dealerns plan ovanför
  bordskanten, filten nedanför). Kontaktskuggan läggs bara när den ligger under bordskanten och långt från kortets
  försvinningslinje.
- Ett spår märkt `hand: false` håller inte kortet i handen: där färgas filmens eget kort om på plats medan hon bär det
  (matten, `src/scene3d-matte.ts`), och det ritade kortet tar över tolv rutor innan kortet ligger (`EASE`).
- Ett kort som ligger sedan en tidigare film ritas i samma storlek som det givna kortet vilade i. Ett kort som spelet
  inte har någon post för visar ryggen, aldrig labbets valda kort (`cardFace` i `src/card-overlay.ts`, `dealt`).
  Hålkortets valör och dealerns summa visas när kortets framsida syns i vändningsfilmen.
- **En geometri för bordet** (`TABLE_GEOMETRY` i `src/card-plan.ts`; adressordet `geometri=lins` eller
  `geometri=kontrakt` på `game.html` och varje sida som visar scenen; Casino bär ordet vidare). Förvalet är `lens`;
  `contract` (äldre `flatQuad` och kamera, 886 px, k = 2) behålls för historiska jämförelser, och gamla prov behöver
  den. Med `lens` följer alla tre kortplanens regel och lins:
  - `planCardAt` (`src/card-plan.ts`): ett verkligt kort, 63 × 88 mm, genom `TABLE_LENS` i planens form, för planens
    platser (`planCardQuad`) och för platserna spelet räknar fram (`src/game-table.ts`).
  - `planScene` (`src/card-overlay.ts`): det ritade kortets vila; `planCardFrom` läser var en kontur ligger på filten
    (`cardPlace`) och lägger regelns kort där. Kortens storlek är en andel av planens kort (`cardGrow`): 1,2 är ett
    verkligt kort.
  - `lensCamera` (`src/scene3d-geometry.ts`): linsen som scenens filmkamera, i verkliga meter, så att kortplatser,
    ringar, marker och bord delar kamera med korten; vyns inställningar räknas om under linsen (`viewUnder`).
  - Omvandlingen mellan bildpunkter och bordets meter står på ett ställe, `pixelToFelt` och `feltToPixel` i
    `src/table-lens.ts`. Linsen står i bankens bildpunkter (1764 × 1174); en annan bildstorlek nås med `inFrame`, planens
    vy (1762 bred) med `planToFilm`. `tools/card-plan.test.ts` håller plan, spel, vilande kort och scenens projektion
    till samma fyrhörning inom en hundradels bildpunkt.
  - Runt korten: rummet ritas genom kontraktets kamera också med `lens` (`roomSeen`); bordet är 1,15 m djupt, ett
    verkligt bords djup (`REAL_TABLE`, `tableUnder`); insatsringen ligger en korthalva, ringens radie och 12 mm framför
    kortets mitt (`BET.real`, `ringOffset`), med verkliga mått på ring och marker (54 och 39 mm); trycket läggs i
    ordningen dealerns kort, loggan, bågen, texten, platsernas kort (`REAL_PRINT`); vyn vrids kring filmkamerans egen
    lodlinje (`aimAt` i `src/game-page.ts`).
  - Scens val **Standard / Bred lins** visar B respektive äldre perspektiv; Bred lins kan provas i Casino men skriver
    inte dess sparade grund. Innan kontraktets väg kan tas bort ska följande ersättas: grenen `contract` i
    `createLayout` (`src/game-table.ts`, med `flatQuad` och `quad`); `cameraFromContract` och `DEALER_LENS_ESTIMATE` i
    scenens `filmCamera` (`src/scene3d-view.ts`; `cameraFromContract` själv står kvar för Modeller, `tools/scene-material.ts`
    och rummets kamera); `viewUnder`, när `FRAMING` och sparade vyer är skrivna för linsen; `cardGrow` och
    `PLAN_CARD_SIZE`, när Kortens storlek är skriven så att 1 är ett verkligt kort; kontraktets grenar i `ringOffset`
    (`BET.offset`), `tableUnder`, tryckets äldre ordning i `draw` (`src/scene3d-table.ts`), vridningen i `updateView`,
    och `TOTAL_LEFT` och den äldre vinkeln i `aimAt`; och adressordet. Med flit kvar på den äldre regeln:
    `restingQuad`s kontraktsgren med `sceneOf` (för `tools/card-coverage.ts` och kortsättet `film`,
    `src/scene3d-cards.ts`), `tools/build-anchor.ts` och `tools/placement-backdrop.ts`.
- **En linje för korten** (BESKED, "En linje för korten"): det ritade kortet hela vägen, också i hennes hand (`CARRY` i
  `src/card-overlay.ts`, bärsättet `object`, `kort=hand`), med filmens eget kort omfärgat under det ritade
  (`UNDER`, förval): det som nyckeln och matten lämnar av filmens kort bredvid det ritade färgas om, skons fönster
  lämnas åt matten och hud orörd. `cardBack=film` och `cardFace=film` visar filmens färger igen; `cardBack=dark` och
  `cardFace=paper` färgar om också där filmens kort är kortet i handen (`cardWords` i `src/game-film.ts`).
  `kort=liggande` lämnar filmens kort i handen och i skons fönster och tonar fram det ritade när kortet lägger sig
  (`restFade`, `restShare`); `kort=matt` visar filmens kort omfärgat i handen. Liggande kort ritas i båda bärsätten,
  eftersom nästa film inte visar dem. Storleken är en överallt (`cardScale` 1,2). Spelet har en brytare, Ritade kort i
  Miljö; av betyder att inget ritas. Vem som bestämmer (`cardsChoice` i `src/game-film.ts`): adressens ord (`cards=0|1`,
  `kort`) först, sedan spelarens val i menyn, annars på; ett förval i Bordets Scen har inget att säga till om. Scen och
  labbsidorna följer samma linje (`carryOf` i `src/scene3d-deal.ts`). Med skomodellen ritas det givna kortet först två
  rutor efter att det lämnat skon (`leavesShoe`). Sätten jämförda på samma rutor: Prov `kort-tre-satt`.

`src/game-director.ts` gör signalerna till slag, ett per kant i klippbanken (vila till sko en gång, retur mellan korten,
hålkortet vänds från vila), och `src/game-table.ts` ger varje kort en plats: planens två platser per plats, därefter en
solfjäder i steg om 24 px (plats 5: 16, plats 7: 12; `game.html?fan=<px>` prövar ett annat steg), splittade händer 66 px
mot dealern, och dealerns tredje kort där dess film lägger det (1069, 926 i filmpixlar). Med de täta stegen går
valörerna på de undre korten inte att läsa; det avgörs med kortstorleken.

**Spelsidan.** `game.html` (`src/game-page.ts`) bygger scenen med `createScene`, håller insatserna före given, skickar
kommandon och spelar svaret: `src/game-film.ts` löser stegets slag med `resolveRound`, lägger kedjan i filmkön med varje
dels kortspår och kortval och spelar vilan (`pickIdle`) däremellan. Liggande kort ritas på layoutens platser.
`src/game-view.ts` gör motorns läge till det som visas. Overlayen (`src/game-overlay.ts`, `game.css`) är HTML över
canvasen: ringarnas träffytor, markerstaplar, summor, utfall och en panel med markerrad och knappar; den visar vad den
får och rapporterar tryck, inget mer. Markerna i ringarna är föremål i scenen (`src/game3d-chips.ts`): husets marker ur
markerstudien (`materials/source/src/chip-material-study.ts`) i verklig storlek (39 mm), som släpps 6 cm ovanför sin
plats och studsar; kan modulen inte läsas ritar overlayen platta marker. Inramningen är liggande (lutad 8°, zoom 0,84)
eller stående (zoom 1,55, lutad 4,4°, plats 2–6 hela i bild, vriden mot platsen som har turen); ett sidledsdrag vrider
vyn. Konsolen är vanliga moduler utan React, som Scouts spelkonsol.

- **Konsolen** (`game.css`, `src/game-overlay.ts`) följer Scouts spelkonsol: en panel längs nederkanten, saldot i
  accentfärgen, markerna i en försänkt bricka och en fylld knapp längst ut (Dela ut, Ny runda); ett val som inte är
  tillåtet lämnar sin plats tom. **På en telefon täcker konsolen aldrig bordet** (BESKED, "Spelet på telefon"): bilden
  är rutan `#picture`, och `placeConsole` märker scenen `tall` (en remsa på 150 px under bilden) eller `side` (en spalt
  på 172 px till höger, när scenen är lägre än 540 px, `FRAMING.sideBelow`). Fem teman med Scouts namn
  (`game.html?tema=noir|scout|smaragd|bordeaux|midnatt`, noir om inget sägs).
- Panelerna (`src/game-panel.ts`): **Miljö** väljer rum (bilder i `assets/scene/thumbs/`, bytet med scenens skimmer,
  `roomShift`), **Dealer** byter dealer (`film.swap`: hon går, bordet står tomt, en dealer kommer in; kameran backar
  medan filmen är helkropp, `exitView`), **Musik** väljer spår ur ljudlabbet (`MUSIC`, `sound.music`). Allt ljud är
  tyst tills spelaren slår på det. **Chatten** (`src/game-chat.ts`; `game.html?chatt=0` tar bort den) är en attrapp:
  dealerns repliker följer rundan, två påhittade spelare säger något ibland, och inget skickas någonstans.

**Sko och markerbricka som GLB.** Jakobs modeller ur Meshy ligger som original under `assets/props/source/` och
namnges med SHA-256 i `data/props.json`. `node tools/prop-glb.ts <id>` gör dem scenfärdiga: nätet glesas genom att
kanter viks bort, den som ändrar ytan minst först (`simplifyTo`, npm-paketet `meshoptimizer`), så att inget hörn
flyttas; ytornas riktning räknas om med brytvinkel 40° (`creasedNormals`); texturerna krymps till 1024 px (bordet 2048);
storlek i meter och origo under föremålet bakas in. Resultatet är en vanlig GLB utan Draco, meshopt eller KTX2 i
`assets/props/<id>.glb`, med kvitto bredvid. Krav på en ny fil: Y upp, mynning eller långsida mot +Z, PBR-material,
inga inbakade skuggor. Servern lämnar ut modellen och three:s `GLTFLoader` (`/vendor/loaders/`), och
`src/game3d-props.ts` läser den, för materialen genom `scene.lit` och lägger den med `scene.addProp`. Brickan ligger
försänkt vid dealerns kant med sitt eget urtag (`scene.notch`), pressad till 0,105 m djup. Provet `game.html?bricka=hus`
(`src/game3d-tray.ts`) är i stället den byggda försänkningen med husets marker på högkant i tolv rader (`TRAY_ROWS`,
`rowFor`): en förlorad insats bärs marker för marker in i sin rad (`chips.send`) och en vinst ut till en stapel bredvid
insatsen (`chips.pay`), utan film.

**En film före spelet** (`src/game-intro.ts`; `game.html?intro=noir-3`, kopians dörr `/trailer`): en startruta med
Spela och Hoppa över läggs över scenen innan något annat läses; filmen hämtas vid trycket, spelas med ljud (trycket
låter henne höras) och tonar över i spelet (0,4 s liggande; stående visas den hel på svart, växer i 0,7 s till där
spelet har henne och tonar sedan i 0,5 s). Filmen ligger i spelets egen skala och mitt (`introLayout`, som på en telefon
får bildrutans mått). Filmens sista ruta är spelets bild i rummet Monaco med rörelse, så adressen ber också om
`room=monaco&roomLife=1` och inget annat utseende. Medan filmen går säger hon inget och chatten är stilla. Hennes vila
står hållen på sin första ruta från sidans start tills hon talar (`rest({hold})` i `src/game-film.ts`), eftersom varje
talfilm börjar i samma pose; rummets film är av till 0,4 s före slutet (`onLead`), då spelet också börjar ritas under
filmen; hennes svaj (`dealerLife`) är noll under filmen och tonas in under fyra sekunder efteråt. Öppningsrepliken sägs
0,4 s efter att spelet syns. Filmen (`film-2.mp4`; en omgjord film får nytt namn) och startrutan ligger i
`assets/films/intro/noir-3/` med kvitto, och filmen spelas in på nytt när spelets vilobild ändras.

**Ljud** (`pages/sound.html`, `src/sound.ts`): markernas klirr, kortens ljud, bakgrundsljud per miljö och musik (fyra
spår som skrivs medan de spelas: `MUSIC`, `music(track)`, `set({music})`; `LEVEL.musicDbA` −38), syntetiserade i
webbläsaren utan ljudfiler (`createSound()`); spelets meny Musik läser samma modul. **Modeller** (`pages/props.html`,
`src/props-lab.ts`) är ett sidospår som inte rör spelet: sko, bricka och bord i egna utseenden, och valet Scen "Med
dealer och rum" (`src/props-stage.ts`, för en modell vars post i `data/props.json` har `stage`) ställer spelets vilofilm
bakom bordsmodellen. Skon visas inte i spelet: filmens egen sko ligger kvar, och en 3D-sko kan ersätta den först när
filmens skopixlar maskas bort.

## Bottom-up och koordinatreferenser

Bottom-up betyder att höjd ökar uppåt. V6:s mätningar är bildpixlar från övre vänstra hörnet med y nedåt.
Originalmätningar och referenshashar bevaras; en adapter konverterar vid en uttrycklig systemgräns.

Normaliserad **bildrymd**: `u` ökar åt höger, `v` uppåt, båda i `[0,1]`. `(0,0)` är nedersta vänstra pixelcentrum och
`(1,1)` översta högra. För `W×H`:

```text
x_px = u × (W − 1)        u = x_px / (W − 1)
y_px = (1 − v) × (H − 1)  v = 1 − y_px / (H − 1)
```

Native centrum `(0.5,0.5)` ger `(880.5,586.5)` före rasteravrundning, och native-punkten `(820,1026)` blir
`(820/1761,147/1173)`. Utsnitt med `left/top/width/height` beskriver pixelkanter, inte denna konvention. Bordets fysiska
plan och 3D-kameran kräver egna kalibreringar; normaliserad bildrymd är inget perspektivmått.

**Kortplanen.** Jakobs kortplan, sparad från Bordets Kortplan, är `placements/default.json`; vyprofiler och
pixelkonvertering finns i `src/placement-model.ts`. Geometri lagras per `native`/`portrait`; hand- och sidavsikt och
materialval hålls skilda från geometrin. Alla standardplatser börjar ogranskade (`reviewed=false`). `angle` är grader
medurs i bildens y-ned-rymd; `width`/`height` är andelar av vyns pixelcentrumspann; `taper` formar konturen och bevisar
ingen kalibrerad projektion.

- `tableProjection`: `mode: flat | individual` och `heading` i grader (`-90,-45,-15,0,15,45,90`); plant bord med 0° är
  standard och beräknas från P4.C1. Äldre schema-v1-filer utan fältet godtas.
- `perspective` (0,80–0,96, valfritt) är reglaget Perspektiv och bara kortens form: varje kort har den verkliga kamerans
  storlek och plats (`TABLE_LENS`), och dess bortre kant ritas smalare kring kortets mittlinje, så att den vid plats 4 är
  den valda andelen av den närmre (0,956 är ett verkligt korts egen form). Utan fältet gäller plats 4:s sparade `taper`.
  Regeln är `planShape` och `keystone` i `src/card-plan.ts`; spelet läser den bara med geometrin `lens`. Riktning i
  bordplanet är skild från kamerans lutning och kortets böjning.
- `intent`: `grip` är `PINCH` (nyp i skons fönster, A2.1; standard) eller `DRAG` (fingertopparna på kortet, släp längs
  filten, A2.2); `turnAt` är `AIR` (standard) eller `PLACE` och gäller bara när `turn` är sant; vänds senare är
  `turn=false` och landning på startsidan. `validatePlan` fyller i standardvärdena för äldre filer. Sekvensen skriver
  `DRAG(LH,BACK)` och `TURN(LH,BACK>FRONT,PLACE)`.
- Kortplan i Bordet: Kortplatser väljer kortet, steg 2 har Grepp vid skon, Var kortet vänds och tre tekniker
  (`TECHNIQUES`), och steg 1 har Kortstorlek för alla kort (`scaleCards`, 0,50–2,50 kring varje korts mitt). Kortens
  böjning och glans ändras i Bordets Efterarbete (grundmaterialet böjning 0,14, glans 0,35). Allt går genom Ångra och
  når disken med Spara. Kortet i skons fönster målas gult på scenen (`SHOE_CARD`).
- **Kortplan: bakgrunden** (BESKED, "Dockan per dealer"): under korten ligger 3D-scenens bord i hemvyn med filmen dold,
  den valda dealerns vita docka i vila (`dealer3d/src/doll.ts`; standarddockan för en dealer utan egen) och bankens sko.
  Listan Under korten har hennes docka först, sedan de andra dockorna och hennes egna filmer; ett annat val står i
  adressen (`bakgrund=docka-standard` eller en films id). I hemvyn är filmrutan hela duken, så bilden ligger i
  filmpixlar. `node tools/placement-backdrop.ts` bygger en bild per docka,
  `assets/lab/placement-backdrop/docka-<docka>.jpg`, med `receipt.json`; bilderna byggs om när bordet, skon,
  grundstandarden eller en docka ändras. Kortplan har en vy, bankens bild; planens `portrait` ligger kvar i filen och
  godtas av `validatePlan`, men inget läser den.

Rörelsernas bindning till planen använder `placementRef`, `sceneProfileId` och `viewProfileId`, inga x/y-tal i
sekvenssträngen. Film och varje overlay använder samma uppslag och samma resize/crop/letterbox-offset. DRAFT-ordningen i
en planerad sekvens är inga uppmätta filmannoteringar; noder eller dokument får inte hitta på saknade mätningar.

## Ordlista och gräns mot Scout

Orden Jakob ser står i studions ordlista (`studio/lib/words.ts`, Ordlista i menyns fot), med de andra namnen samma sak
har i kod och dokument. Tabellen här har kontraktets koder och gränsen mot Scout; där båda har samma ord säger de samma
sak.

| Ord | Betydelse |
| --- | --- |
| Ingångsbild, keystone, ankare | Ingångsbild: vilken bild som helst av personen. Keystone: förlagor i hög upplösning på vitt, stående och sittande; en förlaga spelas aldrig. Hans ord är att ankaret tas ur en video av keystonen (så står det i studions ordlista); Paows ankare är redigerade stillbilder (löpande bandet, station 4–5b), och vilken väg som gäller har han inte avgjort. Ankare: rutan i bankens format (1764×1174, grönt, bankens sko) som filmer börjar och slutar på (BESKED, "Ingångsbild och keystone"). |
| Ankare 1, 2.1, 2.2, 2.3, A3PnCm | Vila (`IDLE`); nyp i skons fönster (`READY`, `grip: PINCH`); handen över kortet i skons öppning, släp (`READY-B`, `grip: DRAG`); båda händerna vid skon (`READY-C`); slutbilden vid plats n, kort m (A3P4C1). Skrivs A1, A2.1, A2.2, A2.3: alltid A och numret, aldrig en bokstav efter (BESKED, "Ett ankare heter alltid A och sitt nummer"); en vinkel från plats 2 skrivs S2-A2.2, men inget byggs för sätena än (BESKED, "S är sätet, kameravinkeln ett ankare ses ifrån"). Äldre namn på samma ankare: Keystone 1/2, variant A/B, VILA/REDO, REDO B. |
| Ingång, utgång, hon kommer, hon går | Ingång: filmen från ankare 1 till ankare 2.1 eller 2.2 (`IDLE>READY`, `IDLE>READY-B`). Utgång: filmen tillbaka till ankare 1 (`READY>IDLE`, `READY-B>IDLE`; stegen `UTGANG` och `UTGANG-2.2`). När hon reser sig och lämnar bordet går hon (`IDLE>AWAY`), och när hon kommer in och sätter sig kommer hon (`AWAY>IDLE`). |
| Riktning, lutning, perspektiv | Kortets tre mått: vart kortsidan pekar på bordet; hur mycket kortet reser sig från bordet (0° = plant); hur mycket smalare den bortre kanten är (BESKED, "Kortets tre mått"). Lutning saknar reglage. |
| `IDLE`, `READY` | Vila respektive redo. Äldre VILA/REDO är alias, inte nya tillstånd. |
| `LH`, `RH` | Dealerns anatomiska vänster/höger, oberoende av bildspegling. |
| `BACK`, `EDGE`, `FRONT` | Observerad fysisk kortsida mot kameran. |
| `CLOSED`, `OPEN` | Visuell statusetikett: rygg respektive framsida; får inte ersätta bevis på fysisk sida. |
| `HIDDEN`, `REVEALED` | Vad Scoutmotorn tillåter spelaren att se. En filmvändning ändrar inte detta. |
| `TAKE`, `PASS`, `TURN` | Ta kortet, överlämna samma kort mellan händer, respektive vända kortet. PASS är inte TURN. |
| `LAND`, `RELEASE`, `RETURN(IDLE)` | Landning (rutan där kortet når bordet i en giv), släpp (rutan där fingrarna lämnar kortet; returen börjar där) och återgång; de kan ha olika bildrutor. `LAND(<plats>)` är också noden för platsens landningsbild (roll `landning` i Material): stillbilden med handen vid kortet, som en giv bara dit slutar på och en retur som egen film börjar på (`landingOf` i `src/order-model.ts`). |
| `P4.C2`, `D.C2`, `VAR03` | Placeringsnycklar och rörelsevariant. V6 är historisk renderingsversion. |

Målet är P1–P7 och D, två kortplatser vardera: 14 spelarkort plus två dealerkort. Platsnumrering och utdelningsordning
följer Scout: plats 1 är kamerans vänster, plats = Scouts box + 1, given börjar på plats 7 och går mot plats 1, sedan
dealern, och det dolda kortet kommer sist. Koordinaterna är Jakobs placeringsplan.

Scoutgaming äger regler, slump, kortvärden och händelser; inget ändras i Scout härifrån, och ingen ny spelmotor skrivs
i dealer utom den avskilda i `game/` (AGENTS, "Det som skyddar Jakob"). `P4.C2` är inte kortets runtime-ID: vid split
krävs även hand-ID, medan Scout behåller kortinstansens ID (dragnumret i skon). Filmkoden importerar från `game/`, aldrig
tvärtom.

Exempel, **inte klassning av en befintlig film**:

```text
P4.C2@VAR03 | TAKE(LH,BACK) > LAND(BACK) > RELEASE(LH) > RETURN(IDLE)
```

Överlappande PASS/TURN beskrivs med faktiska intervall, inte påhittad ordning. Färgbyte eller passage genom kantläge
bevisar ensam ingen vändning; en författad etikett överordnas inte sammanhängande källbevis
([p4Followup](../evidence/anchor-color-audit.json)).

## Ett rörelseregister och tydliga bevis

- `motions/<clip-id>.json` är ensam källa för rörelsens klassning och beslut. Hand, pose, fysisk sida, spelstatus, mål
  och variant hålls separata.
- `data/library.json` är visningskatalogen utan mediekopior (Prov-mappen Filmbiblioteket, Referens i Bordets Scen och
  Råfilm); original, historiska sekvenser och diagnostiska överlägg hålls isär, och beslut hämtas från `motionRef`.
- `publicReview` i ett äldre register pekar på den gamla publika sidan, som är nedtagen
  ([DRIFT](DRIFT.md#den-låsta-kopian-på-nätet)); publiceringen där innebar aldrig godkänd rörelse.
- Nya original placeras i `assets/motions/<clip-id>/source.mp4`. En korrigerad visningsversion har egen hash och
  relation till originalet; inga kopior per godkännandestatus.
- `KEYFRAME` är en källruta. `ANCHOR` är en utpekad källruta för grepp, kantläge, kontakt, släpp eller vila: källhash
  och rutnummer. Saknad kunskap är `null`/`UNKNOWN`, inte uppskattade tider.
- Bevisgrund `MEASURED/OBSERVED/REPORTED/HYPOTHESIS/UNKNOWN` skiljs från beslut `PENDING/ACCEPTED/REJECTED`. Rörelse,
  mask och geometri, scen och Scoutanslutning bedöms separat.
- Maskkontrakt: CLOSED RGB `[255,255,0]`, OPEN `[0,0,255]`, bakgrund `[0,0,0]`, förlustfri mask, kontur separat. MP4 är
  visningsmaterial, inte exakt färgmask, och en författad maskfärg bevisar inte originalets kortsida.

Genererad gul eller blå färg kan vara fel trots en fysisk vändning: bedöm först rörelsen och märk BACK/EDGE/FRONT från
sammanhängande källrutor, och lägg därefter kortets utseende. Editorns gul = BACK och blå = FRONT gäller; rosa är en
separat maskhjälp.

Filmgranskningen använder klippets fps för steg ±1 bildruta; hastigheterna 0,25×/0,5×/1× ändrar bara visningen, och
`clip` och `frame` i adressen anger granskningsläge, inga nya annoteringar. En sekvensruta mappas via sin frysta
tidslinje innan den anges som en råfilms källruta.

Lagringen är JSON och manifest: rörelseregistret äger besluten, katalogerna refererar till dem, och media är separata
filer med hashreferenser ([lagringsbedömningen](../evidence/storage-choice-review.json)). En framtida Scout-import får
ett uttryckligt kontrakt utan dubbla ägare av status.

## Vad labbet skickar till genereringen

Kortplanen visar målgeometri och avsikt. Rosa i en källfilm är en hjälp för att senare hitta och ersätta kortytan, och
avgör inte vilken fysisk sida som syns. Kortmaterialet ritas ovanpå filmen i labbet och i scenen men bakas aldrig in i
en film. Varken labbskärmbilden, placerings-JSON, nodkartan eller 3D-materialet skickas till Runway, och ändringar i
editorn beställer inga filmer.

En beställning innehåller exakt textprompt, modell, längd och format samt bilder: första bild, oftast sista bild, och
ibland en referensfilm; planen ger målkortets hörn i sista bilden. Studions beställningar är `data/orders/<id>.json`
(formen i `src/order-model.ts`):

- En giv bär sina val i `motion`: `hand` (handen som tar kortet ur skon), `pass` (handbyte, bara vänster till höger),
  `side` (BACK stängt, FRONT öppet; `turn` följer av sidan) och `flipAxis`: `AT_PLACE` (vänd vid platsen; förval när
  planen säger `PLACE`, `defaultFlip`), `FREE` (handleden vrider över kortet på vägen och är kvar vriden tills kortet
  ligger) eller `LONG_EDGE` (kortet rullas kring långsidan); orden Beställ visar står i `FLIP_LABEL` och `FLIP_ABOUT`.
  Ett val som inte gäller lagras inte (`flipAxis` null för ett kort som inte vänds).
- Förvalen kommer ur stegets recept (`recipeFor`, `data/order-methods.json`): receptets hand hela vägen och receptets
  vändning, planen ger bara det receptet lämnar åt Kortplan, och ett handbyte är aldrig förval; `fromPlan` säger om
  valen är planens. `crossesBody` säger om kortet landar mer än ett halvt kort till vänster om hennes mitt (P1–P3); inget
  sätts av den. "Alla sju" gör ett utkast per plats med samma `group`.
- Texten skrivs av `promptFor` i `src/order-prompts.ts` (mallen i `TEMPLATE_VERSION`, beskriven i handbokens §2; en
  order återges med sin egen version; orden i `SAY`), samma funktion som visar texten före utkastet, i stilen
  `prompt.style`: Kort (förval), Minimal eller Utförlig (en order utan `style` är Utförlig).
- En retur är en egen film från platsens landningsbild (`LAND(<plats>)`) till ett ankare, och en giv kan beställas bara
  dit (`step.shape: ONE_WAY`). En Kling 4-order kan bära en referensfilm ur banken (`reference`, kopierad med hash; en
  annan dealers film är tillåten och namngiven), och kortets storlek kan provas per order (`motion.cardScale`, planen
  orörd).
- Ett filmsteg har receptets modell, längd och tagningar som förval men kan beställas med varje modell i `MODELS` som
  tar första och sista bild (`modelsFor`, `paramsOf`); en ny modell är en post i `MODELS` och ett pris i
  `data/order-policy.json`.
- Ett utkast följer det ankare som gäller i Material (`picture.replaced` säger vad bilden var), och posebildens gröna
  görs som ankarets (`cut.matched`); A2.2:s posebild är den andra dealerns underarm och hand lagda på dealerns egen sko
  och kort (`cut.laid`, `poseOnShoe` i `tools/order-images.ts`). En godkänd beställning ändras aldrig. En hel bild av en
  annan dealer i ett utkast stoppar godkännandet.
- Prompt och bildhashar står i jobbet i `data/clip-jobs.json` och i `motions`-posten; bilderna och kvittot i
  `assets/motions/<clip-id>/`. Protokollet räknas, aldrig för hand: `node tools/order-ledger.ts` och vyn Protokoll
  (`GET /api/orders/ledger`, `studio/lib/ledger.ts`) ger en rad per tagning ur beställningen, kvittot, bankens poster
  och Materials bilder. Granskarens dom förs in med `order-put.ts review`, och `tools/order-bring.ts` för en levererad
  tagning till bankens inkorg och Material.
- Metoden per steg och platsklass står i `data/order-methods.json` (`gäller`, `prov`, `saknas`; `src/order-methods.ts`).
  Produktionslistan (`node tools/produce.ts <dealer>`, Bordets Beställ, `GET /api/production`) säger för vart och ett av
  grafens steg vad som spelas, vad som är på väg, om en runda kräver det och dess metod, och gör utkast där metoden
  gäller (`--draft`; aldrig ett godkännande). Alla steg står i `STEPS` i `src/order-model.ts`, bland dem hålkortets giv
  (`GIV-2.1` till `D.C2`), dess vändning (`HALKORT`, `IDLE>REVEAL(D.C2)`, med bara hålkortet ritat på båda bilderna) och
  utgångarna (`UTGANG`, `UTGANG-2.2`). Hela vägen från bild till färdig dealer: [löpande bandet](../tools/dealer-line.md).

## Material: bilder, tillstånd och vad som bygger på vad

`data/media-roles.json` ger varje bild en roll (`studio/lib/media.ts`) och kan ge den ett tillstånd: `gäller`,
`kandidat`, `ersatt` eller `arkiverad`; utan tillstånd är den en kandidat. Jakob väljer för hand i Material, för den
valda dealern (reglerna i `studio/components/material/state.ts`, skrivna av `setState` i `tools/media-roles.ts` mot
registrets revision): vilken bild som helst kan göras till den som gäller, och de andra på samma plats (roll, nod och
kort; en keystone också samma hållning) blir ersatta; en arkiverad bild lämnar listorna men stannar i registret och
kommer tillbaka som kandidat. Varje ändring får en rad i `stateBy` med vem, när och var; ett verktyg eller en agent
anger `who` och `where`, så att inget ser ut som hans. Bilden väljs bara i Material, Primär bara i Karta.

Vad som bygger på vad (`studio/lib/lineage.ts`, `GET /api/media`, `lineage`): varje tagning spåras till de bilder dess
första och sista bild gjordes av (jobbfilens `first`/`last`, en beställnings `pictures[].from.entry`, eller samma
sha256). En tagning vars bild inte längre gäller märks som äldre i Karta och Material ("äldre ankare 2.2") och spelas
som förut tills Jakob väljer annat. Bara ett led: en bild med `builtOn` märks "från äldre keystone" när den bilden inte
längre gäller, men dess klipp märks inte för det.

## Klippbank och nodnotation

Studions vy **Karta** (`/studio/karta/`) visar nodträdet och för varje steg vad spelet spelar där, Primär och de
sekundära filmerna (godkända eller varianter, tre i taget). Varje film säger hur spelet använder den, läst ur spelets
egna regler (`usesOf` i `studio/lib/primaries.ts`). Utan Primär föreslås den bästa tagning Jakob godkänt, och Primär
sätts bara med hans klick (Gör primär). Underkända, ogranskade och ersatta tagningar finns i Granska; en arkiverad
tagning ligger hopfälld under Arkiverade. Noderna är ankarposer: `IDLE`, `READY` och ett landningsankare per kort
(`P4.C1`, `D.C2`). Varje klipp är en kant `A>B` med en enda handling; en runda är kanter i följd:

```text
IDLE>READY | READY>P1.C1 | P1.C1>READY | READY>D.C1 | D.C1>READY | READY>P1.C2 | P1.C2>READY | READY>D.C2 | D.C2>IDLE
```

- Banken är 54 kanter: 16 kort × giv, retur till READY och retur till IDLE, samt `IDLE>READY`, `READY>IDLE`,
  `IDLE>IDLE`, `AWAY>IDLE`, `IDLE>AWAY` och `IDLE>REVEAL(D.C2)`, vändningen av hålkortet. `AWAY` är bilden utan dealer;
  filmen där hon går beställs med enbart första bild, och dess sista rutor ger rutan som filmen där hon kommer börjar
  på. Hålkortets vändning går från vila till vila (`REVEAL(D.C2)` är vila med kortet uppvänt) och spelas från ruta 3
  till tre rutor före slutet. `D.C3` är tre valfria kanter utöver dem. `@<klipp-id>` efter en kant låser en tagning.
  Jobbfilens `LAND(P4.C1)`/`RELEASE(P4.C1)` och VILA/REDO läses som samma noder.
- READY kan ha namngivna varianter (`READY-B`): `READY-B>P4.C1` är en tagning av kanten `READY>P4.C1` med annan
  startpose, spelad bara när rundan skriver den så. Jobb med andra noder tappas aldrig: de bildar gruppen Experiment.
- Kartan är presentation, inget eget statusregister: `src/clip-graph.ts` räknar grafen ur `data/clip-jobs.json`,
  lokala kvitton och `motions/<id>.json` och läser om var fjärde sekund. Huvudtagning är godkänd före ogranskad och,
  bland lika, den senaste med en passande retur. Underkända tagningar väljs aldrig. `review.acceptedAs: "MAIN"` går
  före härledningen; `"VARIANT"` visas bredvid och väljs först när ingen annan spelbar tagning finns.
- **Ankarregeln och skarvregeln:** en retur vars första bild är en fil (landningsankaret) passar varje tagning av given,
  som spelas till sin sista ruta. En retur vars första bild är en ruta ur ett visst givklipp passar bara den tagningen,
  som klipps vid den rutan (`first.frame.index`; `motion.landingFrame` går före). Huvudtagningen för en retur är, efter
  en Primär, den som skarvar mot givens huvudtagning. `resolveRound` räknar ut intervallen och visar saknade kanter som
  luckor. Scout äger ordning, regler och kortvärden.
- **Bygg en runda** (`studio/components/round/RoundPicker.tsx`, i Scen, Råfilm och Efterarbete; BESKED, "Rundan byggs av
  noderna"): vägen som brickor i hans notation och i ett textfält, i takt åt båda hållen, och en knapp per nod som kan
  följa (`parseEdge`; om steget spelas avgör `resolveRound`, `nextSteps` i `studio/lib/rounds.ts`). Ett steg utan film
  läggs inte till; en skriven väg med ett sådant steg spelas med en lucka. Spelets nödlösningar har rundan inte.
- En härledd tagning är rutorna A–B ur ett befintligt klipp: `"derived": [{id, kind, from, to, clip, frames: [A, B]}]`
  i jobbfilen. En rättad kopia (`"edits": [{id, source: {clip}, model, promptText, purpose}]`) är ännu en tagning av
  källklippets kant. `playbackSpeed: 2` spelar tagningen i dubbel fart (rutnumren är filens), och `source-reversed.mp4`
  bredvid filmen ger "Spela baklänges".
- **En film per plats** är förvalt läge (Karta med `?filmer=kort` visar en film per kort): platsens andra kort spelar
  platsens filmer med det ritade kortet flyttat planens avstånd C1→C2 (varning över 50 px). Regeln är sidan
  (`filmCard`): kort 2 delar film bara när det slutar på samma sida som kort 1, så dealerns stängda `D.C2` har egna
  filmer, och banken behöver 33 filmer (6 utan kort, 7 platser × 3, `D.C1` × 3, `D.C2` × 3). `buildGraph(data, {mode})`
  sätter `edge.shares` och `summary.films`, och `resolveRound(…, {places})` ger steget `film` och `shift`. En egen film
  för kort 2 spelas bara när rundan namnger den.
- **Vilan** är korta klipp på `IDLE>IDLE` som alla börjar och slutar på samma bild (efter Kevins och Emils vila i
  Scout). `pickIdle` i `src/clip-graph.ts` väljer nästa med viktad slump: aldrig samma klipp två gånger i rad, två lugna
  och sedan en gest (`calmBetweenGestures`), aldrig underkända klipp eller klipp på begäran, och inte någon av de
  senaste gesterna (`gestureMemory` 7, räknat per film); godkända vilofilmer går in av sig själva (BESKED, "Vilans
  slinga"). Varje klipp spelas från ruta 3 till tre rutor före slutet, och nästa tar över med rakt klipp. "Dela ut nu"
  klipper ett lugnt klipp direkt till ingången och spelar klart en gest först, i filmad fart (`IDLE_RULE.exitRate` 1;
  BESKED, "Farten"); ett lugnt klipp med `cut: false` spelas också klart. Klippets del står i dess post:
  `motion.idle = {weight, calm, onRequest, label, cut}`; utan uppgift är bara `pamela-idle-loop-01` lugnt (vikt 20) och
  övriga gester (vikt 3). Rundans `IDLE>IDLE`-steg spelar det lugnaste klippet, om inte ett är märkt `MAIN`.
- En vilofilm kan be scenen om en effekt: `motion.effect = {kind: "room-flash", room, at, seconds, mono}` (en blixt,
  och under `seconds` från `at`, i filmens egen tid, är rummet `room` och bilden med `mono` svartvit; `effectOf`,
  `Part.effect`). En variant med effekt är en egen post som pekar på samma film.
- **Renderat kort** (kryssruta under filmen och rundans kedja) ritar kortet ovanpå filmen. Läge, vridning och sida kommer
  ur kortspåret `assets/tracking/<klipp>/card-track.json` (`node tools/track-card.ts <klipp>`); filmens kort är bara en
  markör. Storleken kommer ur `data/scene-contract.json` (Kortskala 1,0 är planens kort, förvalet 1,2). Filmkortets gula
  eller blå fläckar om minst 50 bildpunkter utanför skofönstret målas över med bakgrunden omkring; handen ligger kvar
  framför. Varje kort kan bära sitt eget värde: `{shoeDraw, target, r, s, faceDown}` (`cardRecord`/`cardFace` i
  `src/card-overlay.ts`), där `faceDown` visar ryggen vad filmen än visar.
  `assets/tracking/<klipp>/overrides.json` med `{"cardInFront": [{"from": 72, "to": 78, "note": "…"}]}` lägger kortet
  framför handen i de rutorna. Spåraren (`src/card-track.ts`) följer markörregeln: filmtypen ur jobbfilen avgör vad som
  kan synas (en giv vänder en gång, en retur visar en sida, ingång och vila har inget utdelat kort), och fynd som strider
  mot det stryks. `node tools/card-coverage.ts --all` mäter per film och ruta hur mycket av filmens eget kort som syns
  utanför skofönstret (`coverage.json` bredvid spåret).
- **Ett kortformat** (BESKED, "Ett kortformat"): kortet i `pamela-p4-c1-plan-deal-02` är standard och allt annat anpassar
  sig. Krav på en ny film: kortet har standardstorlek (`scaleNeeded` nära 1,2 i `coverage.json`). Planens kortrutor
  passar ett plan (1,1 px), medan händer, sko och modellens kort är cirka dubbelt så stora (k ≈ 2, skattat; mått per mål
  i `data/scene-contract.json`).
- **Domar** sätts i tagningen: Primär (`acceptedAs: "MAIN"`, spelas i första hand på sin kant, också en retur direkt
  efter en giv; två primära som inte passar ihop spelas båda med en skarvnotis, och bara en låst tagning `@id` och
  kravet på kortsida går före; varje steg bär skälet i `why`, orden i `WHY_LABEL`), Godkänn, Variant, Underkänn och en
  anteckning. `PUT /api/clip-bank/review/<id>` skriver bara `review` i `motions/<id>.json` (`decision`, `acceptedAs`,
  `userReview` med datum, `userAccepted`), med eget ursprung, `If-Match` mot postens revision och atomiskt namnbyte
  (`tools/review-store.ts`). Inget skrivs vid inläsning, och en tagning utan post kan inte beslutas.
- **En preliminär dom** (`node tools/review-put.ts`, `applyProvisional`) sätts bara när Jakob har lämnat över domen för
  vissa filmer (BESKED, "Domar åt honom, och ingen kö"): `decision` `ACCEPTED`, eventuellt `acceptedAs: "VARIANT"` men
  aldrig `MAIN`, eller `REJECTED`; `userAccepted: false`, ingen `userReview`, `inbox` borttagen och ett block
  `provisional {by, at, mandate, note}`. Tagningen spelas som beslutet säger, räknas aldrig som rakt godkänd och väntar
  inte i hans kö (`awaitingJakob` i `studio/lib/verdict.ts`); Granska visar den under Dömda åt dig, och chippet är
  streckat med "åt dig". Hans nästa beslut tar bort blocket, och en tagning som bär hans dom tar inte emot en preliminär.
- **Arkivera** (Kartans stegpanel; Ta tillbaka under Arkiverade): `PUT /api/clip-bank/archive/<id>` med
  `{archived: true|false}` sätter eller tar bort `review.archived {by, at, where}` med samma skydd som en dom
  (`saveArchive`); inget verktyg skriver fältet i hans namn, domen står kvar och ingen fil flyttas. En arkiverad tagning
  spelas aldrig och räknas inte (`playable`, `judgedBank`), dess film går inte upp till kopian, och en arkiverad Primär
  lämnar steget utan Primär tills han väljer en.
- En post kan bära `motion.takeHand` och `motion.releaseHand` (`LH`, `RH`): handen som tar kortet ur skon och handen
  som lägger det, eller på en retur handen som kommer tillbaka; en retur utan uppgift ärver givens (`releaseHand` i
  `src/clip-graph.ts`). `tools/register-order.ts` skriver dem ur beställningens `motion.hand` och `motion.pass`.
- En talfilm är en vilotagning på begäran (`motion.idle.onRequest`) med ett block `speech` (`line`, `language`, `text`,
  `voice`, `soundStartsAtSeconds`, `soundEndsAtSeconds`); `src/speech-lines.ts` väljer talfilmen för en replik eller
  ett chattsvar, och labbservern släpper igenom blocket.
- Labbservern lämnar därutöver bara ut läsvägarna `/api/clip-bank` och `/api/proofs`, `source.mp4`,
  `source-reversed.mp4`, `first.png` och `last.png` för klipp i jobbfilen, deras spårfiler under
  `assets/tracking/<klipp>/`, mp4, png och json under `assets/proofs/`, och för 3D-scenen three.js som
  `/vendor/three.module.js` och `/vendor/three.core.js`, inget annat ur `node_modules`.
- **Vyn Prov** (`/studio/prov/?prov=<mapp>`) är granskningsrummet för provmapparna. `proof.json` får bära `title`,
  `description`, `labels`, `chapters`, `verdicts` (per fil: `ok`, `remarks`, `failed` eller `unreviewed`) och `takes`:
  provets tagningar, de filer som är en gjord film eller bild; allt annat är underlag. Bara en tagning bär en
  omdömesbricka: granskarens (Användbar, Med anmärkningar, Underkänd), annars "Väntar på granskaragenten", streckad,
  aldrig Jakobs (`proofVerdict` i `studio/lib/verdict.ts`). Ett nytt prov skriver `takes` från början. En etikett är ett
  kort namn följt av allt annat (delat vid första parentes, punkt eller kolon), och saknas `verdicts` läses brickan ur
  etikettens ord. Under varje film och bild säger Jakob Bra eller Inte bra och kommenterar (`data/proof-notes.json`).

## Återbruk och införande

Pamelas två historiska banker hålls isär: den äldre vita banken (fjorton 12-sekunderstagningar, 182,867 s) och den nyare
r2-banken (`motions/pamela-sequence-{16,17}-{native,portrait}-r2.json`, 16 och 17 kort, 30 fps), som Jakob accepterar
som alternativ men med fel koordinater och format. Filmerna börjar och slutar i IDLE, men bordet går från tomt till 16
eller 17 kort, så de loopas inte till tom start. Underlaget: [historiska
promptar](../evidence/historical-p4-generation-inputs.json), [sequence-reuse-audit](../evidence/sequence-reuse-audit.json)
och [sequence-review-production](../evidence/sequence-review-production.json); besluten är PENDING.

Jakobs fristående blackjack-studio (`local-studio/blackjack-studio`, "Göran"): Görans grundbild är gjord ur ett uppladdat
foto utan noterat tillstånd, så hans projekt, klipp, kortlägen och ankare används inte, och inte heller
trä-casinobilden `c7ef9e9c` (BESKED, "Görans material"). Fritt att återbruka: `blackjack/` (regelmotor), `money/`,
`players/`, `scene/furniture.ts`, `panorama-room.ts`, `atmosphere.ts`, miljöerna Las Vegas och Los Angeles och Poly
Havens texturer (CC0, `material-sources.json`). Arkivets 3D-utkast med Pamela som platt stillbild visas i Prov
`pamela-3d-utkast`.

`materials/source/references/card-materials/new-front2/` är en läsbar syskonreferens, inget runtime-beroende. Namnen
Pamela och Göran i äldre material kopplas till verifierad filhash och proveniens innan identitet antas. Nya läsningar ur
arkivet registreras; inga gamla `node_modules` eller junctions importeras. Underlaget från 2026-11-10 (sekvensguiden och
studioskissen, källor och hashar i `.runtime/documentation-sources.json`) är referensförslag, ingen behörighet att
ändra runtime.
