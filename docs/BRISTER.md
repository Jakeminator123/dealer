# Kända brister

Här står varje känd brist en gång: var den syns, vad som är prövat och vad som skulle stänga den. En brist som är
rättad stryks; hur den rättades står i commitmeddelandet. Läget per bana står i `docs/lage/`
([film](lage/film.md), [kort](lage/kort.md), [labbet och studion](lage/labbet-och-studion.md),
[spelet](lage/spelet.md)), och Jakobs egna ord om sakerna står i [BESKED.md](BESKED.md).

Innehåll: Kortet · Filmerna och banken · Läpparna och rösten · Spelet och scenen · Labbet och verktygen · Pamela

## Kortet

- **Det ritade kortet i spelet** (Jakob 2026-11-13: "Det lixom kletar fast sig på korten", "linjer flyger dit och dit").
  Syns: i spelet, som ritar kortet hela vägen med underlägget under (`UNDER` i `src/card-overlay.ts`): hålkortet är dolt
  under hennes fingertoppar cirka 0,6 s innan det glider på plats, kortets högra ände har en svag gulaktig kant, en tunn
  linje syns medan kortet står på kant, och fingerkanten är taggig. Prövat: kortens fjärde steg (`33b164a`: hålkortet
  följer filmens kort under handen, skons fönster står mörkt), blint granskat 3,75/5; pålägget fick 3/5 och är inte i
  spelet; `kort=liggande` finns kvar för hans öga, och `cardBack=film&cardFace=film` visar filmens färger. Stänger:
  kortets efterarbete per film. Stegen ligger i `D:/dealer-scratch/tmp/kortbyggare/`, utredningen i
  `D:/dealer-scratch/tmp/kortutredning/RAPPORT.md`.
- **Spelets liggande kort följer inte kortplanens regel.** Syns: i spelet och i 3D-scenen. Labbet ritar varje kort som
  ett verkligt kort genom linsen (`planCardQuad`, `src/card-plan.ts:65`, och `src/table-lens.ts`), men spelet ritar med
  `flatQuad` (`src/game-table.ts:59`), pålägget lägger kortet med `restingQuad` (`src/card-overlay.ts:124`: kontraktets
  kort gånger `cardScale`, planen ger bara platsen), och 3D-scenen ställer korten med kontraktets kamera
  (`cameraFromContract`, `src/scene3d-geometry.ts:23`), som är en annan kamera än linsen. En utomstående granskare mätte
  att planens 43, 87 och 130 bildpunkter blir 91, 90 och 90 i spelet; talen är inte kontrollerade här. Prövat: labbets
  alla ritningar följer regeln (`918e7f4`, `f8c637f`). Stänger: spelet och 3D-scenen läser samma regel, visat för Jakob i
  labbet först. Med flit kvar på den gamla regeln: `tools/build-anchor.ts` (frysta hashar), `tools/card-coverage.ts` och
  `tools/placement-backdrop.ts`.
- **Skons kort är dubbelt så långt i bild som dealerns kort i filmerna** (111 mot 55 bildpunkter), vilket Jakob tyckte
  såg konstigt ut. Syns: i bankens filmer och ankare. Prövat: 3D-banans mätning (`D:/dealer-scratch/tmp/dealer-3d/kalibrering.txt`)
  säger att kortet i skons fönster är i stort sett rätt (51 × 92 bildpunkter mot 49 × 98 för ett verkligt kort, 0,94)
  och att det bara i nypet (ankare 2.1) är 8–13 % för långt; axlar, pupiller och skons fot är lästa för ögat (±10
  bildpunkter). Labbets ritade skokort är rättat (`f469450`). Stänger: bara nya ankare; inget ankare krymps för skons
  skull.
- **Kortbanan i Bordet** (Jakob 2026-11-12: "utgångspunkten skulle vara att kortet låg på bredsida, vilket är fel").
  Syns: den ritade handen pekar ut från kortets ände och inte från hennes arm, kortet vänds något högre i bilden än i
  filmen, och vid platsen rullas kortet på filten som ordertexten säger, medan Paows film från ankare 2.2 lyfter och
  vänder det i luften. Prövat: banan är omgjord efter filmerna (`ccd9c52`, Prov `kortbanan-efter-filmerna`). Stänger:
  hans svar på hur vändningen vid platsen ska ritas, och en film som visar vändningen med handflatan uppåt (`FREE`) att
  rita efter; ingen sådan finns.
- **Kortet i handen** (Prov `kort-bojning-glans`). Syns: med baksidan mot kameran sitter det ritade kortet större och
  längre upp till höger än filmens gula kort, och kanten mot hennes ärm är ojämn med ljusa prickar. Prövat: böjning och
  glans är inte felet (kanten flyttar sig inte en bildpunkt med böjningen; glansen syns bara på den mörka baksidan).
  Stänger: efterarbetet, efter filmerna.
- **Orden för kortets sidor är öppna.** Jakob 2026-11-13: "Baksida kan betyda olika saker, som baksidan på ett kort, men
  det kan också referera till undersidan." Syns: i beställningstexter och på sidorna; mallarna säger slätt kort med
  "back" och "face" (`PLAIN_CARD` i `src/order-prompts.ts`). Prövat: inget. Stänger: ett ord per sida i ordlistan
  (`docs/SYSTEM.md`), valt med honom.
- **Paows givar är för små vid ytterplatserna.** Syns: i Material, som brickan "avviker" (`data/media-fit.json`): 8 av
  hennes givar stämmer med dagens kortplan i storlek och 14 är 15–37 % för små; korten ligger alla på rätt plats
  (0,2–1,4 bildpunkter). Prövat: mätningen (`node tools/media-audit.ts --fit --write`). Stänger: nya givar efter
  filmstandarden. Filen skrivs inte om av sig själv när planens regel ändras (hans sparade Perspektiv): kör mätningen om
  efter en sådan ändring.
- **Planfilen kräver en mobilvy som inget läser.** Syns: `validatePlan` kräver både `native` och `portrait`
  (`src/placement-model.ts:268–269`), fast valet Dator | Mobil är borta ur Bordet och spelet bara läser
  `geometry.native`. Prövat: inget; `placements/default.json` är Jakobs och är orörd. Stänger: planens format ändras i
  ett eget steg, på hans ord.

## Filmerna och banken

- **Det bandet inte kan än** ([tools/dealer-line.md](../tools/dealer-line.md)). Syns: i Beställ. Ankare 2.1 och 2.2 är
  steg (`STEPS` i `src/order-model.ts`), men landningsbild, keystone och ankare 1 är det inte, och ett tredje eller
  fjärde dealerkort går inte att beställa, eftersom planen har sexton platser (`TARGETS` i `src/placement-model.ts`).
  Prövat: förslaget `D.C3` och `D.C4` efter `D.C2`, inte byggt. Stänger: stegen läggs i ordermodellen; metoden per steg
  står i `data/order-methods.json`.
- **Produktionslistan räknar en bortmätt tagning som på väg.** Syns: `node tools/produce.ts paow`: en tagning som
  beställaren mätte bort ligger kvar på MÄTT med domen i kvittots `review`, och ordern räknas som på väg tills varje
  tagning är GRANSKAD eller INFÖRD (`IN_FLIGHT`, `tools/produce.ts:55`). Prövat: inget. Stänger: en tagning med dom i
  kvittot räknas som avslutad.
- **Kön läggs bara när en huvudagentchatt är öppen.** Syns: en beställning Jakob godkänner med ett klick ligger olagd om
  ingen vakt går. Prövat: vakten `D:/dealer-scratch/tmp/huvudagent11/look/vakta-kon.mjs`, som går i huvudagentens chatt
  i halvtimmar och måste startas av varje ny huvudagent. Stänger: en vakt som inte behöver en öppen chatt; ingen väg vald.
- **Paow har ingen användbar landningsbild.** Syns: `paow-landning-p4-giv-t2` står som `gäller` i
  `data/media-roles.json` men visar handryggen och duger inte för en vändning, och alla hennes returer är andra halvan
  av en tur-och-retur-film. Prövat: sista bilden i en giv bara dit tas i stället ur bankens film där den godkända
  returen börjar (`cutFrameOf`, `src/cut-frame.ts`). Stänger: landningsbilder med tatuerade händer för plats 3–5.
- **Händerna byter mellan gamla och nya filmer.** Syns: varje film i banken har otatuerade, större händer, medan
  keystonebilderna och ankare 1 som gäller har tatuerade; en skarv mellan gammalt och nytt visar bytet. Prövat: att måla
  tatueringar i färdiga filmer har fallit två gånger (2 av 5). Stänger: en hel uppsättning ur de tatuerade bilderna;
  ankare 2.1 med de händerna finns inte än.
- **Skuggan under armarna** sitter i grundbilden (armbågarna på ett bord bakom kanten, 40–44 bildpunkter ovanför rad
  831,5). Syns: i varje film av Paow. Prövat: keystonebilderna med tatuerade händer är gjorda utan skuggan. Stänger: nya
  ankare och filmer ur dem.
- **Paow ser lite smal ut:** Pamelas kroppsbredd under ett huvud som är 8,7 % högre. Syns: i alla hennes bilder.
  Prövat: inget. Stänger: ingen väg vald.
- **Banken räcker inte till en hel runda med egna filmer.** Syns: spelet använder nödlösningar (ersättare där en film
  saknas, utgången baklänges; `src/game-director.ts`), och nio returer från en plats till vila saknas. Prövat: se vad
  som saknas med `node tools/produce.ts paow`. Stänger: filmerna beställs; nödlösningarna ger vika när banken har dem.
- **Paows Primär för P1C1 → A2.1 spelas aldrig** (fel hand mot given). Syns: i Karta. Prövat: inget; Primär väljer bara
  Jakob. Stänger: han byter Primär.
- **23 talfilmers `motions/` pekar på kvitton som är flyttade** till `D:/dealer-scratch/tmp/tal/overtaliga/`. Syns: i
  registren, inte i spelet. Prövat: inget. Stänger: posterna pekas om eller tas ut.
- **Flera av Paows källor i `data/media-roles.json` ligger på D:** i stället för i `assets/`. Syns: en källa försvinner
  om slaskdisken städas. Prövat: inget. Stänger: filerna flyttas till `assets/` och posterna pekas om.
- **Kling 4:s färger** läses som BT.601 fast filmen är BT.709-märkt. Syns: inte, så länge efterarbetet
  (`tools/film-after.ts`) ger samma bild som de godkända tagningarna. Prövat: inget mer. Stänger: frågan avgörs med en
  mätning mot en känd färg.
- **Trailern har ingen som lyssnat på den**, och tre nya tagningar av trappan föll (2/5, 2,5/5, 2/5: händerna håller
  bara den första sekunden och ryggen är platt). Syns: Prov `trailer-noir-3`. Prövat: rollblad 4 med tatuerade händer
  och dagens film som förlaga. Stänger: arbetet är pausat på hans ord; fortsätter det måste också gränd-glimten och de
  tre scenerna efter trappan göras om.

## Läpparna och rösten

- **Läpparna i bankens repliker.** Syns: banken har repliker lagda med två recept ([TAL.md](TAL.md), "Kvaliteten"); vid
  stora öppningar står överläppen högst nio till tolv rutor medan käken rör sig, tysta pauser talas med öppen mun, och
  munnen är rendererns (matt, mjukare underläpp, strimmiga tänder); `namn` hörs som "Pau". Prövat: omläggningen med
  hennes egen underläpp och gipor, som är uttagen på hans dom; måtten finns kvar som oanvända val i
  `src/speech-plan.ts`. Stänger: munnen i realtid, som är huvudmålet.
- **Ingen granskare kan höra.** Syns: varje dom över en talfilm, trailern och filmen till hans chef gäller bara bilden.
  Prövat: inget. Stänger: Jakob lyssnar själv innan något med ljud skickas vidare.
- **Munnen i realtid når inte realtid på hans dator.** Syns: den egna köraren ger 12–13 rutor per sekund i hela kedjan
  på hans RTX 3060 mot 24 för realtid, och de första rutorna av en replik kommer efter 1,3–2,5 s. Prövat: `bbox_shift`
  ger inte större läppar (storleken kommer ur inläggningen). Stänger: provkvällen på hans pod; en podd kan inte bygga en
  image, så Dockerfilens steg måste köras där som ett skript, som inte är skrivet.
- **Körarens kod för munnen ligger bara på D:** (`D:/dealer-scratch/tmp/tal/korare/`). Syns: en städning av
  slaskdisken tar den. Prövat: inget. Stänger: koden in i repot efter städning av två skript.
- **Rösten.** Syns: spelet väljer talfilmerna med rösten Paow (`data/speech.json`), och 25 med rösten Jessica spelas
  inte; rösten ligger i Kevins ElevenLabs-konto, och registret namnger nyckelraden, aldrig nyckeln
  ([TAL.md](TAL.md), "Rösten"). Jakobs första röst-id är inte färdigtränat hos ElevenLabs. Prövat: inget. Stänger: bara
  kontots ägare kan göra träningen klar.
- **Hennes röst på en iPhone är byggd men inte prövad på en telefon.** Syns: Safari låter en film höras bara när den
  startas i en beröring; en nekad talfilm spelas då ljudlöst och rösten sägs av sidans eget ljud, satt mot filmens rutor
  (`5ee46d2`, `3de51b5`; [TAL.md](TAL.md), "Rösten på en telefon"). Antaget, inte prövat: att Safari nekar med just det
  felet och avkodar ljudspåret. Hon hörs med ringsignalen av (`playback` i `src/scene3d-view.ts`). Första gången en
  replik sägs kommer rösten in sent. Stänger: Jakob prövar på sin telefon, och ett fel där läses med en skärmbild av
  `/trailer?diagnos=1` ([DRIFT.md](DRIFT.md), "Ett fel som bara syns på en telefon"); en liten ljudfil bredvid varje
  talfilm tar bort den sena rösten när grunden har hållit.

## Spelet och scenen

- **Hopp mellan filmer** (Jakob 2026-11-14: "och att vissa olika hopp görs. inte farlgigt, men lite"). Syns: i spelet,
  som bilden som står när nästa film inte är färdig; filmerna själva passar varandra (0 bildpunkter i 98 % av 3 474
  byten). Prövat: vila efter vila och efter replik är rättade (`restFilm` i `src/game-film.ts`). Kvar: vila efter en
  retur (83 ms), och returerna slutar 2–3 bildpunkter från vilan och 4–9 nivåer ljusare. Stänger, förslag som inte är
  infört: en retur spelar till sin sista ruta (`IDLE_RULE`, `resolveRound` i `src/clip-graph.ts`). Verktygen ligger i
  `D:/dealer-scratch/tmp/levande-objekt/ljus/` (`skarv-prov.mjs`, `skarv-vila.mjs`, `retur-slut.mjs`, `hopp/`),
  mätningarna efter rättningen i `D:/dealer-scratch/tmp/huvudagent11/hopp-efter/`.
- **Rummets film** `monaco-liv-2.mp4` har ett litet steg i varje nyckelruta (var 8,3 s, 0,57 nivåer av 255). Syns:
  skattat inte alls. Prövat: en kodning utan nyckelrutor (`D:/dealer-scratch/tmp/levande-objekt/rumsliv/kod-prov-2.sh`).
  Stänger: filmen kodas om, under ett nytt namn, om någon ser steget.
- **Filmen före spelet** (`/trailer`). Syns: efter trycket står startbilden still medan filmen hämtas (cirka 0,7–0,8 s),
  och sidan slutar rita i 0,35–0,57 s; på en stående telefon syns filmens övre kant som en svag linje över hennes hjässa.
  Prövat: orsaken till uppehållet är inte funnen. Stänger: ingen väg vald. Filmen spelas in på nytt när spelets vilobild
  ändras ([SYSTEM.md](SYSTEM.md), "En film före spelet").
- **Spelet.** Syns: 3D-skon klipper handen i givarna; helkroppsfilmerna har ingen sko; utfallsskyltarna ligger över
  insatsbrickorna när alla sju platser spelar; dubbling och försäkring är inte sedda ([SYSTEM.md](SYSTEM.md),
  "Spelet"). Prövat: inget. Stänger: var och en i ett eget steg i spelets bana.
- **3D-scenens hemvy** stämmer inte med `assets/proofs/bakgrund-3d-referens/` (medel 0,96, max 168), eftersom filtens
  tryck har flyttat med planen. Prövat: inget. Stänger: referensen tas om med Jakobs ögon; den ändras inte för att dölja
  avvikelsen.
- **Profilval 1 kapar toppen av hennes huvud** i 93 % av rutorna. Syns: i 3D-scenen med det profilvalet. Prövat: inget.
  Stänger: ingen väg vald.
- **Reglage för `cardBack` och `cardFace` finns inte i Bordets läge Scen.** Syns: filmens egna kortfärger kan bara väljas
  med adressens ord. Prövat: inget. Stänger: två reglage i Scen, när efterarbetet byggs.

## Labbet och verktygen

- **Beskrivningar som inte skickas till Runway står kvar i Beställ**, mot Jakobs anmärkning (BESKED, "Labbet och
  studion"). Syns: `FLIP_ABOUT`, `HAND_ABOUT`, `SHAPE_ABOUT`, `LANDS_ABOUT`, `startWords` och sammanfattningsraden
  `dealWords` i `src/order-model.ts`, visade i `Choices.tsx`, `NewOrder.tsx`, `SendScreen.tsx`, `OrderList.tsx` och
  `Stage.tsx`. Prövat: inget. Stänger: texterna tas bort, så att sidan bara visar det som går till Runway.
- **Ny beställning ritar ännu sin egen bild** (`studio/components/order/Stage.tsx`) i stället för Bordets. Syns: två
  ritningar av samma bord. Prövat: inget. Stänger: Ny beställning använder Bordets bild.
- **Borta ur labbet tills det nya har dem:** "Rå | renderad" på en tagning (hör till Efterarbete) och panelen Vila.
  Syns: det gamla labbet hade dem. Prövat: inget. Stänger: de byggs i Bordets läge Efterarbete.
- **Sidornas ord:** 72 ställen säger annat än ordlistan. Syns: på studions sidor. Prövat: listan med fil, rad och
  förslag (`D:/dealer-scratch/tmp/stadning/ord/ORD.md`, del c); radnumren måste kontrolleras, filerna har ändrats sedan
  dess. Stänger: ställena rättas efter ordlistan.
- **Inte prövat av en hand i Bordet:** Godkänn i läget Beställ, att dra reglaget Perspektiv och trycka Spara, byte av vy
  med osparade ändringar och knappen för att läsa in en fil. Syns: ingenstans än. Prövat: sidorna är sedda i headless
  Chrome, och "Skapa utkast" är tryckt en gång. Stänger: var och en prövas i en webbläsare.
- **Filmer kan se utfrätta ut i Jakobs flik.** Syns: hos honom, troligen på hans skärm och inte i filerna. Prövat:
  inget. Stänger: lägg alltid en stillbild bredvid en film han ska döma.
- **Testerna utan FFmpeg:** elva hoppas över där FFmpeg saknas, tre i `tools/order-images.test.ts` kräver bankens filmer
  och ett i `tools/card-overlay.test.ts` kortspåren. Syns: GitHubs kontroll kör dem inte; den här datorn gör det.
  Prövat: inget. Stänger: ingen väg vald.
- **GitHubs kontroll går inte** sedan 2026-11-17 kl. 16.48 ("The job was not started because your account is locked due
  to a billing issue"). Syns: GitHubs bock är röd på varje push; kontrollen går grön på datorn, så inget är stoppat.
  Prövat: inget, det kan bara han. Stänger: han reder ut betalningen (Settings, Billing).
- **Kopians lösenord har stått i det publika repot** (utskrivet i dokument till och med `dfe29c4`). Syns: i Gits
  historik; ordet är borta ur dokumenten (`c82bda4`) och ur testernas exempel (`aa5f7e7`). Prövat: inget mer. Stänger:
  ett nytt ord och en ny publicering, som kräver hans ord; boten och önskemålslådan är det ordet skyddar, och boten
  kostar per fråga.
- **Kopian på nätet är inte sedd med den nya menyn.** Syns: kopian står på `aee87ca` och visar Scen och Placering;
  Bordet för kopian är bara byggt, inte sett i en webbläsare. Prövat: inget. Stänger: en publicering på hans ord, och
  sedan frågas kopian som en ny besökare i telefonstorlek.

## Pamela

- **Pamela och 2D:** det platta överlägget läcker cirka 30 bildpunkter i fyra rutor i två av hennes givar
  (`node tools/card-coverage.ts --all`), och hennes första dealerkort är 1,76 gånger för stort. Prövat: inget sedan hon
  pausades. Stänger: tas upp när pausen hävs.
- **Pamelas material stämmer inte med dagens kortplan.** Syns: i Material, som brickan "äldre plan": 14 av hennes 66
  bilder med kort stämmer (8 vid första mätningen och sex till, alla på plats 4, efter formregeln i `2a56f08`) och ingen
  av hennes mätbara givar. Prövat: mätningen i `data/media-fit.json`. Stänger: inget görs medan hon är pausad.
- **Pamelas giv till plats 1 duger inte som referensfilm:** den visar kortet på kant när det svänger ur fönstret, och
  Kling lade vändningen där (1/5 två gånger). Hennes plats 4 är ren
  (`D:/dealer-scratch/tmp/film-standard/referenskontroll.tsv`). Stänger: en egen rörelse för plats 1.
- **Fyra av Pamelas filmer** från 2026-11-11 ligger på disk utan post. Prövat: inget. Stänger: de registreras eller
  arkiveras, på hans ord.
