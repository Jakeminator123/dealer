# Kända brister

Varje känd brist en gång: vad som saknas och vad som stänger den. En rättad brist stryks; hur den rättades står i
commitmeddelandet. Läget per bana: [film](lage/film.md), [kort](lage/kort.md),
[labbet och studion](lage/labbet-och-studion.md), [spelet](lage/spelet.md); Jakobs besked: [BESKED](BESKED.md).

Innehåll: Kortet · Filmerna och banken · Läpparna och rösten · Spelet och scenen · Labbet och verktygen · Pamela

## Kortet

- **Märket på blå sidan hindrar inte fel i vändningen:** i tre vändfilmer utanför Beställ (Prov `paow-ankare-2-3-b`)
  bytte en färg utan kantläge och en visade vit sida i sex rutor, och krysset ritas 4–9 gånger för stort i handen.
  Kortspåret (`tools/track-card.ts`), spelets pålägg (`cardFace=paper`) och `tools/landing-make.ts` läser ännu bara gult
  och blått, och dockans kort (`dealer3d/src/stage.ts`) är slätt blått. Stänger: de fyra ställena följer märket.
- **Ritat kort fryser och hoppar i handen** (P7, ruta 73–76: en ruta återanvänds, mittpunkten hoppar 29 px mot spårets
  9). Filmkortet (Prov `paow-carry-jitter-20261118`) följer greppet bättre men har silvergrå yta och mjuk fingerkant.
  Stänger: ren färg, överlämningen, övriga egna mål och hålkortet granskade i rörelse.
- **Återbrukade andrakort och split kräver ritade kort:** 9 av 16 egna målfilmer finns
  (`paow-game-frame-20261118/coverage.json`), sju C2 behöver 39–51 px förskjutning, extra kort och split når cirka 100
  px, och D.C3 och senare saknar filmhand. Efter proven `paow-c2-*-20261118` står en blå kant vid fingret kvar, och
  violett nagellack går inte att skilja från kortets färger. Stänger: egna landningar eller verifierat återbruk,
  hålkortets vändning och en hel giv i båda renderlägena, sedda i rörelse.
- **Forkens hela giv** (Prov `paow-fork-round-review-20261118`) har annan kamera och startpose än Dealer 2.3, blank yta
  som byts abrupt mot tryckt kort, och dubbelkontur vid P2; den kan inte ersätta bankens klipp direkt.
- **Filmkortet utan giltigt kortspår** (2D-provet `cardMethod=film`) skyddas, men äldre färgmarkörer kan synas.
  Stänger: verifierade spår och synprov i båda renderlägena och i rörelse.
- **Det ritade kortet i spelet** (sett av Jakob 2026-11-13): spelet ritar kortet hela vägen med underlägget under
  (`UNDER` i `src/card-overlay.ts`), så hålkortet döljs under fingertopparna cirka 0,6 s, högra änden har en gulaktig
  kant, en linje syns när kortet står på kant och fingerkanten är taggig. Kortens fjärde steg (`33b164a`) fick 3,75/5
  blint, pålägget 3/5. Stänger: kortets efterarbete per film (BESKED, "Kortets efterarbete görs i förväg per film").
- **Kontraktets geometri står kvar bredvid linsens.** Förvalet är `lens` (`TABLE_GEOMETRY` i `src/card-plan.ts`), men
  `geometri=kontrakt` och dess grenar finns kvar för historiska jämförelser. Sett 2026-11-18 och inte omprövat: på
  telefon ringen (25 px), insatsbrickan över markerna och tom nedre tredjedel (`FRAMING`); kortsättet `film` står på
  kontraktets kort. Stänger: de sakerna, och borttagningen som SYSTEM räknar upp under "Ritade kort", om vägen tillbaka
  inte behövs. Med flit kvar på den gamla regeln: `tools/build-anchor.ts`, `tools/card-coverage.ts` och
  `tools/placement-backdrop.ts`.
- **Dealerns två kort överlappar i kortplanen** med 13 px (D.C1 och D.C2 ligger 62 px isär, ett kort är 75 px brett).
  Platserna är Jakobs. Stänger: hans val i Kortplan.
- **Kortet i nypet (ankare 2.1) är 8–13 % för långt;** i skons fönster stämmer det (0,94, 3D-banans mätning i
  `D:/dealer-scratch/tmp/dealer-3d/kalibrering.txt`). Stänger: nya ankare; inget ankare krymps för skons skull.
- **Kortbanan i Bordet** (BESKED, "Kortbanan följer filmerna"): den ritade handen pekar ut från kortets ände, kortet
  vänds något högre än i filmen, och vid platsen rullas kortet på filten medan Paows film från A2.2 vänder det i luften.
  Stänger: hans svar på hur vändningen vid platsen ska ritas, och en film med vändningen med handflatan uppåt (`FREE`)
  att rita efter; ingen sådan finns.
- **Det ritade kortet i handen** (`cardInHand=1`; mätt på 104 kortspår, Prov `kort-fram-bak-20261120` och
  `kortet-i-handen-orsaker-20261120`): i vändningen står kortet kvar brett och blir en linje (`settleRaws` i
  `src/card-track.ts` behåller ett skymt korts form), papperets ljus hoppar när `cardBase` i `src/scene3d-film.ts` tar
  reservfärgen, fyrhörningen är färgregelns kärna (under 0,8 av kortet), och kanten mot fingrarna. Labbprovet `kortprov`
  (bara i Scen, av som förval: `/scene3d.html?cards=1&cardInHand=1&kortprov=1`, delarna `spar`, `skarpa`, `ljus`, `mat`)
  sänker det största ljussteget från 36 till 13 av 255. Stänger: Jakobs ja på Beslut-kortet
  `kortet-i-handen-provet-i-spelet`, sedan skärpan mot handen och mätningen in i `tools/track-card.ts` (i dag ur
  etiketterna i `tools/python/kort-dataset/`).
- **Kortets sidor:** hans ord är rygg och framsida (BESKED, "Gul rygg, blå framsida"), men ordlistan och sidorna säger
  ännu baksida, och mallarna säger "back" och "face" (`PLAIN_CARD` i `src/order-prompts.ts`). Stänger: ordlistan och
  sidorna följer hans ord.
- **Paows givar är för små vid ytterplatserna:** 14 av 22 är 15–37 % för små mot dagens kortplan, alla på rätt plats
  (brickan "avviker" i Material, `data/media-fit.json`). Stänger: nya givar efter filmstandarden. Mätningen skriver inte
  om sig själv: kör `node tools/media-audit.ts --fit --write` när planens regel ändras.
- **Planfilen kräver en mobilvy som inget läser:** `validatePlan` (`src/placement-model.ts`) kräver `native` och
  `portrait`, fast spelet bara läser `geometry.native`. Stänger: formatet ändras i ett eget steg, på hans ord;
  `placements/default.json` är hans.
- **Kanten och spåret, att veta när överlägget görs om** (mätt 2026-11-23 på `paow-giv-2-3-p3-01`): spåraren följer
  kortets färg, så en film efterarbetad med `--rim card` ger 6227 px² i vila mot 4460 med vita kanten kvar och behöver
  ett eget spår. Det överlagda kortet i vila är kortplanens (5235 px² vid P3.C1) och följer inte filmens kort, som
  sticker ut 3–13 px. Stänger: överlägget görs om (BESKED, "Överlägget görs om senare").
- **Kvittots `planArea` är 19 % för stor:** `tools/python/filmmatt.py` räknar planens raka rektangel (6235 px²), inte
  det sidan ritar, så anmärkningen "lagt-storlek" jämför mot fel yta. Stänger: måttet räknas ur samma fyrhörning som sidan.

## Filmerna och banken

- **En giv utan sista bild kan lägga kortet fel:** `paow-giv-2-3-p5-02` landade 32 bildpunkter från P5C1, mot 1,5–13
  för de andra platserna (efterarbetets gräns är 15). Stänger: A3P5C1 som stillbild först, och given med den som sista bild.
- **Dockans vändning görs med fingrarna:** i dockfilmerna `svep24d` från A2.3 svänger kortet under stilla fingrar mitt
  i flykten, och filmmodellen kopierar det (kortet halvgenomskinligt i 4–6 rutor); hans regel är att handleden vänder
  kortet (BESKED, "Handleden vrider kortet"). Stänger: en omgjord dockfilm med vriden handled och vändningen nära
  platsen, prövad på en plats först.
- **Rosen på högra handryggen blir en mandala** i A3P4C1 och i given till A3P3C1 från ruta 46; en retur därifrån byter
  tillbaka (`paow-retur-2-3-p4-01`). Stänger: A3-bilden rättas mot handen i A2.3 innan fler returer beställs, och
  granskaren jämför handryggen i slutrutan med ankaret.
- **Landningsverktyget stoppar ytterplatserna:** i A3P1C1 och A3P2C1 täcker hon ankarets huvud och axlar till 58 och 69
  % (gränsen är 75 %), och konturen korsar skarven vid skon. Kontrollen är inte sänkt. Stänger: ett beslut om hur en
  lutning mot en ytterplats mäts, och en skarv som följer armen dit.
- **H24-P4 är en Variant, ingen färdig helkedja:** given fick 4/5, men en rosa fläck vid skon finns också i det frysta
  A3-slutankaret, och ingång, retur och nycklad spelbild är inte godkända som kedja
  (`assets/orders/paow-giv-2-3-p4-h24-03/take-1/review/review.md`).
- **READY-C-kedjan saknar full rörelsedom och naturlig utgång;** inpass och utpass är bara labbvarianter
  (`assets/proofs/paow-ready-c-chain-20261118/fixed-review.md`).
- **Fyra platser och dealerns kort saknar A3, och plats 1 är svag:** `GIV-2.3` går bara att beställa till plats 1, 4
  och 5, och i given till plats 1 far armen från mitten på en tredjedels sekund (dockan kan inte resa sig). Av tre
  bildmodeller lämnade bara ideogram-4.5-precise-edit allt utom armen orört (`tools/landing-make.ts`). En plats första
  tagning utan sista bild kräver en ny mall, och `film-fix` kortar ett stilla slut med högst tre rutor. Stänger: ett A3
  per plats (25 krediter var) och en docka som kan resa sig för plats 1 och 2; vänsterhandens text blir fel om bara ett
  A3 för höger hand gäller.
- **Det bandet inte kan än** ([löpande bandet](../tools/dealer-line.md)): landningsbild, keystone och ankare 1 är inga
  steg i Beställ (`STEPS` i `src/order-model.ts`), och D.C4 saknas som eget beställningsmål. Stänger: stegen läggs i
  ordermodellen; metoden per steg står i `data/order-methods.json`.
- **Produktionslistan räknar en bortmätt tagning som på väg:** `node tools/produce.ts paow` räknar en order som på väg
  tills varje tagning är GRANSKAD eller INFÖRD (`IN_FLIGHT`), också en tagning på MÄTT med dom i kvittots `review`.
  Stänger: en tagning med dom i kvittot räknas som avslutad.
- **Kön läggs bara när en huvudagentchatt är öppen:** vakten `node tools/order-watch.ts` lever med chatten som startade
  den, och varje ny huvudagent startar den. Stänger: en vakt som inte behöver en öppen chatt; ingen väg vald.
- **Paow har ingen användbar landningsbild:** `paow-landning-p4-giv-t2` (`gäller` i `data/media-roles.json`) visar
  handryggen och duger inte för en vändning; sista bilden i en giv tas i stället ur bankens film där returen börjar
  (`cutFrameOf`, `src/cut-frame.ts`). Stänger: landningsbilder med tatuerade händer för plats 3–5.
- **Händerna byter mellan gamla och nya filmer:** banken har otatuerade, större händer; keystone, ankare 1, A2.2
  (`paow-ankare-2-2-blick-a`) och A2.3 (`paow-ankare-2-3-d`) har tatuerade, och att måla tatueringar i färdiga filmer
  föll två gånger (2/5). Stänger: en hel uppsättning ur de tatuerade bilderna, med ett tatuerat A2.1.
- **Huvudet hoppar mellan den nya ingången och givarna från A2.3** (2026-11-23): givarna och returen är gjorda från
  `paow-ankare-2-3-c` (blicken åt sidan), men A2.3 är nu `paow-ankare-2-3-d` (blicken ned). Syns i labbet där Tatuerads
  steg spelas i följd; de äldre filmerna bär brickan "äldre A2.3", och spelet ger inte från A2.3. Stänger: givarna och
  returen görs om från den nya bilden.
- **Skuggan under armarna** sitter i grundbilden och syns i varje film av Paow; keystonebilderna med tatuerade händer
  saknar den. Stänger: nya ankare och filmer ur dem.
- **Paow ser lite smal ut** (Pamelas kroppsbredd under ett 8,7 % högre huvud). Stänger: ingen väg vald.
- **Banken räcker inte till en hel runda med egna filmer:** spelet använder nödlösningar (ersättare, utgången baklänges;
  `src/game-director.ts`), och nio returer från en plats till vila saknas (`node tools/produce.ts paow`). Stänger:
  filmerna beställs.
- **Paows Primär för P1C1 → A2.1 spelas aldrig** (fel hand mot given; syns i Karta). Stänger: Jakob byter Primär.
- **23 talfilmers `motions/` pekar på kvitton som är flyttade** till `D:/dealer-scratch/tmp/tal/overtaliga/` (i
  registren, inte i spelet). Stänger: posterna pekas om eller tas ut.
- **Flera av Paows källor i `data/media-roles.json` ligger på D:** och försvinner om slaskdisken städas. Stänger:
  filerna flyttas till `assets/` och posterna pekas om.
- **Kling 4:s färger** läses som BT.601 fast filmen är BT.709-märkt; det syns inte så länge efterarbetet
  (`tools/film-after.ts`) ger samma bild som de godkända tagningarna. Stänger: en mätning mot en känd färg.
- **Trailern har ingen som lyssnat på den,** och tre nya tagningar av trappan föll (2–2,5/5, Prov `trailer-noir-3`).
  Arbetet är pausat (BESKED, "Trailern är pausad"); fortsätter det görs också gränd-glimten och de tre scenerna efter
  trappan om.
- **Ingen vy säger vilken plan en bankfilm beställdes mot;** ordern bär det (`pictures[].drawn.plan`, `drawn.as`).
  Stänger: en rad i Karta eller Granska.

## Läpparna och rösten

- **Talverktyget tar inte det delade låset:** `tools/speech.ts` renderar på grafikkortet utan låset som headless Chrome
  och andra renderingar delar (skillen `bredvid-andra-sessioner`). Stänger: verktyget tar låset; till dess tas det för
  hand runt körningen.
- **Läpparna i bankens repliker** ([TAL](TAL.md), "Kvaliteten"): överläppen står still 9–12 rutor vid stora öppningar,
  tysta pauser talas med öppen mun, munnen är rendererns, och `namn` hörs som "Pau". Stänger: munnen i realtid, som är
  huvudmålet.
- **Ingen granskare kan höra:** varje dom över en talfilm eller trailern gäller bara bilden. Stänger: Jakob lyssnar
  själv innan något med ljud skickas vidare.
- **Munnen i realtid når inte realtid på hans dator:** 12–13 rutor/s på hans RTX 3060 mot 24, och de första rutorna
  efter 1,3–2,5 s; `bbox_shift` ger inte större läppar. Stänger: provkvällen på hans pod; en pod kan inte bygga en
  image, så Dockerfilens steg måste köras där som ett skript, som inte är skrivet.
- **Körarens nya Dockerbygge är inte prövat** (`tools/python/mouth-runner`; GPU-proven har koden monterad över en
  befintlig image). Stänger: bygg från den pinnade Dockerfilen och jämför samma prov.
- **Rösten:** 25 talfilmer med rösten Jessica spelas inte (spelet väljer rösten Paow, `data/speech.json`); rösten ligger
  i Kevins ElevenLabs-konto, registret namnger nyckelraden och aldrig nyckeln, och Jakobs första röst-id är inte
  färdigtränat ([TAL](TAL.md), "Rösten"). Stänger: bara kontots ägare kan göra träningen klar.
- **Hennes röst på en iPhone är byggd men inte prövad på en telefon:** Safari låter en film höras bara när den startas i
  en beröring, så en nekad talfilm spelas ljudlöst och rösten sägs av sidans eget ljud ([TAL](TAL.md), "Rösten på en
  telefon"); att Safari nekar just så är antaget, och första repliken kommer in sent. Stänger: Jakob prövar på sin
  telefon, och ett fel där läses med `/trailer?diagnos=1` ([DRIFT](DRIFT.md), "Ett fel som bara syns på en telefon");
  en liten ljudfil bredvid varje talfilm tar bort den sena rösten.

## Spelet och scenen

- **Hopp mellan filmer** (sett av Jakob 2026-11-14): bilden står när nästa film inte är färdig; filmerna passar
  varandra (0 bildpunkter i 98 % av 3 474 byten). Kvar: vila efter en retur (83 ms), och returerna slutar 2–3
  bildpunkter från vilan och 4–9 nivåer ljusare. Förslag, inte infört: en retur spelar till sin sista ruta (`IDLE_RULE`,
  `resolveRound` i `src/clip-graph.ts`); verktygen i `D:/dealer-scratch/tmp/levande-objekt/ljus/`.
- **Rummets film** `monaco-liv-2.mp4` har ett litet steg var 8,3 s (0,57 nivåer av 255), skattat osynligt. Stänger:
  filmen kodas om utan nyckelrutor, under ett nytt namn, om någon ser steget.
- **Filmen före spelet** (`/trailer`): startbilden står still cirka 0,7–0,8 s medan filmen hämtas, sidan slutar rita i
  0,35–0,57 s, och på en stående telefon syns filmens övre kant som en linje över hjässan. Orsaken är inte funnen.
  Filmen spelas in på nytt när spelets vilobild ändras ([SYSTEM](SYSTEM.md), "En film före spelet").
- **Spelet säger inte när material saknas eller byts:** kort utan hand, ersättningsfilm, skarv, fel hand och återgången
  via skon står bara i `window.game.gaps` och `?diagnos=1` (räknade i `src/game-film.ts`): varje sista kort går via
  skon, dealerns tredje och fjärde kort läggs utan hand, och plats 4:s andra kort spelar första kortets film. Material
  blandar två par händer. Stänger: filmerna beställs; att visa luckorna på sidan är Jakobs val (fynden:
  `D:/dealer-scratch/tmp/raddning-kedja/FYND.md`).
- **Ett svar som går förlorat låser spelet:** sidan visar motorns engelska "The session is at version N; reload and
  resend" och nekar varje tryck tills den laddas om; inget dras två gånger. Motorn svarar en omsändning med samma
  `requestId`, men sidan gör ett nytt per tryck (`src/game-page.ts`). Stänger: sidan sänder om med samma `requestId`,
  och felet får svensk text.
- **En omladdning i kopian är ett nytt bord** (saldo 1000), och labbserverns bord lever bara så länge servern går;
  avsiktligt, en spelare i minnet. Stänger: spelet sparar bordet utanför minnet.
- **Spelet:** 3D-skon klipper handen i givarna, helkroppsfilmerna har ingen sko, utfallsskyltarna ligger över
  insatsbrickorna när alla sju platser spelar, och dubbling och försäkring är inte sedda ([SYSTEM](SYSTEM.md), "Spelet").
  Stänger: var och en i ett eget steg.
- **3D-scenens hemvy** stämmer inte med `assets/proofs/bakgrund-3d-referens/` (medel 0,96, max 168), eftersom filtens
  tryck har flyttat med planen. Stänger: referensen tas om med Jakobs ögon; den ändras inte för att dölja avvikelsen.
- **Profilval 1 kapar toppen av hennes huvud** i 93 % av rutorna. Stänger: ingen väg vald.
- **Reglage för `cardBack` och `cardFace` saknas i Bordets läge Scen;** filmens kortfärger väljs bara med adressens
  ord. Stänger: två reglage i Scen, när efterarbetet byggs.

## Labbet och verktygen

- **Materials anteckningar har kvar id:n:** omkring 180 av Paows 233 har ett id och 135 nämner ElevenLabs.
  `tools/order-bring.ts` skriver nya rader utan id; talfilmernas registrering (`tools/speech.ts`) och de gamla
  anteckningarna är inte omskrivna. Stänger: de skrivs om.
- **Ett nytt orderutkast skriver texten innan bilderna ligger på disk:** med en A3 som sista bild säger texten då att
  blå sidan är omärkt. `refresh` på utkastet rättar texten; gör det före ett godkännande. Stänger: verktyget rättas.
- **Klings mellanbilder** finns i Runways API men inte i Codex-MCP-schemat, så en kontaktbild mellan start och slut
  kräver en anslutning som exponerar fältet. H24-02:s äldre reservation ligger kvar; ingen automatisk omtagning följer.
- **Startflaggan mäter genomsnittlig bildändring, inte stillastående hand** (D.C3-proven: 125, 25 och 168 flaggade
  startrutor trots handrörelse); använd rutgranskning för tempo. Efterarbetets äldre planmått läser rå planfil, så D.C3
  kan saknas där tills kortet sparats i labbet.
- **En ordergrupp är inte en filsystemtransaktion:** ett avbrott mitt i gruppen kan lämna några utkast på disk, och
  skribenter utanför labbets kö omfattas inte. Stänger: en återhämtningsbar gruppjournal, om det ska stödjas.
- **Kreditspärren bevakar bara Dealers beställningsliggare:** `begin` reserverar före anropet, en annan klon har en
  annan liggare, och verkställaren skickar exakt en gång före `validUntil`. Direkta MCP-anrop utanför linjen omfattas
  inte av kodspärren; de ska bokföras och får aldrig användas för att kringgå mandatet.
- **Äldre slaskinventering behöver omprövas:** listan i `D:/dealer-scratch/tmp/stad-1118/` föregår spärren med exakt
  sökväg och verifierad ägare. Inga gamla förslag verkställs automatiskt; välj och verifiera ett eget avslutat arbete i
  taget.
- **Borta ur labbet tills det nya har dem:** "Rå | renderad" på en tagning och panelen Vila. Stänger: de byggs i Bordets
  läge Efterarbete.
- **Sidornas ord:** 72 ställen säger annat än ordlistan (`D:/dealer-scratch/tmp/stadning/ord/ORD.md`, del c; radnumren
  har ändrats sedan). Stänger: ställena rättas efter ordlistan.
- **Inte prövat av en hand:** i Bordet Godkänn i Beställ, reglaget Perspektiv med Spara, vybyte med osparade ändringar
  och knappen för att läsa in en fil; i Granska Arkivera och Ta tillbaka. Sidorna är sedda i headless Chrome. Stänger:
  var och en prövas i en webbläsare.
- **Filmer kan se utfrätta ut i Jakobs flik,** troligen hans skärm och inte filerna. Lägg alltid en stillbild bredvid en
  film han ska döma.
- **Testerna täcker inte filmerna** (BESKED, "Tester: en kärna"): testerna för kortspår, scenens utseende och bankens
  filmer är borttagna. Stänger: visuell verifiering på den verkliga banken, i labbet och med hans öga.
- **Jakobs GitHub-konto var låst av en betalningsfråga** (från 2026-11-14, ännu 2026-11-18); det som kostar är ett annat
  repos automatiska kontroller (`D:/dealer-scratch/tmp/github-kostnad/siffror.txt`), och det här repot kör inget hos
  GitHub. Stänger: bara han, under Settings, Billing and licensing.
- **Mobilkopians telefonprov återstår:** nätkopian är prövad utan telefon (19/19 nätkontroller,
  `assets/proofs/paow-mobile-studio-20261118`), men inte på en fysisk telefon eller med ljud; stående spel beskär
  ytterplatserna, och Material kallar ankare som inte publiceras för saknade. Äldre kontrollskript i
  `huvudagent11/look/` använder ett ersatt lösenord och ska inte köras. Stänger: telefonprov, och en tydlig skillnad
  mellan opublicerat och saknat material.
- **Paows ankare 1 visas som "avviker" i Material:** `paow-vila-tatuerad` mäts mot Pamelas händer i
  `data/dealer-standard.json`. Stänger: ett mått per dealer.

## Pamela

Pamela är pausad (BESKED, "Paow är dealern, Pamela är pausad"); det här tas upp när pausen hävs.

- **Pamela och 2D:** det platta överlägget läcker cirka 30 bildpunkter i fyra rutor i två givar (`node
  tools/card-coverage.ts --all`), och hennes första dealerkort är 1,76 gånger för stort.
- **Pamelas material stämmer inte med dagens kortplan:** 14 av 66 bilder med kort stämmer, och ingen av hennes mätbara
  givar (`data/media-fit.json`).
- **Pamelas giv till plats 1 duger inte som referensfilm** (kortet på kant när det svänger ur fönstret; Kling lade
  vändningen där, 1/5 två gånger); plats 4 är ren. Stänger: en egen rörelse för plats 1.
- **Fyra av Pamelas filmer** från 2026-11-11 ligger på disk utan post. Stänger: de registreras eller arkiveras, på hans
  ord.
