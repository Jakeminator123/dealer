# Dealer — överlämning

Uppdaterad 2026-11-18. Läs denna fil först, inte chatthistoriken. Här står bara det som gäller nu; det som har hänt står
i Git, och en rad som inte längre gäller stryks. Kontrakt står i [docs/SYSTEM.md](docs/SYSTEM.md), rutiner i
[docs/DRIFT.md](docs/DRIFT.md), den enda vägen för en ny dealer i [tools/dealer-line.md](tools/dealer-line.md), beslut
per tagning i `motions/<id>.json`, metoden per steg i `data/order-methods.json`, bankens tagningar i
`data/clip-jobs.json` och det som väntar på Jakobs svar i `data/decisions.json`.

## Målet

Trovärdig utdelning: två kort till P1–P7, två eller tre till dealern, med separata returer från varje kort till redo och
vila. Jakob 2026-11-13: "nu ska vi skapa en bättre version av blackjackspelet"; arbetet gäller alltså spelet i studion
först. Scoutgaming är slutmålet på sikt och äger regler, slump och kortvärden. Paow är dealern; Pamela är pausad.

Gul = stängd baksida (BACK), blå = öppen framsida (FRONT). Handen vänder kortet fysiskt och lägger det på planens plats;
färgbyte ensamt bevisar inte vändning. Framsidan måste vara en ren, nyckelbar yta eftersom Scout bestämmer kortvärdet.
Vilken hand som delar väljs per order: vänster, höger eller handbyte (`HAND_CHOICES` i `src/order-model.ts`).

**Ankarmodellen** (Jakobs ord 2026-11-12; orden står också i studions Ordlista och i SYSTEM):

- **Ingångsbild:** det vi börjar från för en ny dealer, "vilken bild som helst". Av den görs keystone: förlagan i hög
  upplösning i en pose, som aldrig spelas upp. Jakobs tanke är att ankaret tas ur en video av keystone, "så att inte
  keystonebilder kommer in i videosekvenser"; Paows ankare är redigerade stillbilder, och han har inte avgjort vägen.
- **Ankare:** rutan i bankens format (1764×1174, grönt, bankens egen sko) som filmer börjar och slutar på; Jakob vill att
  de gröna bilderna heter ankare, inte keystone. **Ankare 1** = vila (`IDLE`), **2.1** = nyp i skons fönster (`READY`),
  **2.2** = handen över kortet i skons öppning, släp (`READY-B`). Äldre text kan säga Keystone 1/2, variant A/B,
  VILA/REDO eller REDO B. Alla ankare för en dealer har samma sko, gröna och ton (`data/dealer-standard.json`).
- **Landningsbild:** platsens ruta med handen vid kortet. En giv Bara dit slutar på den och en retur börjar på den
  (`ONE_WAY`, `start: 'LAND'` i `src/order-model.ts`); tur och retur behöver den inte.
- Ett klipp är en handling mellan två ankare (`READY>P4.C1`, `P4.C1>IDLE`); en runda är en väg genom kanterna (SYSTEM,
  "Klippbank och nodnotation").
- **Kortets tre mått:** riktning, lutning (0° = plant) och perspektiv (hur mycket smalare den bortre kanten är). Jakob:
  "perspektiv är bättre", och han vill kunna ställa in alla tre "men också ha en normal" (förslaget: 0°, 0°, 87 %).
  Bordets Kortplan visar lutningen som "plant" och har inget reglage för den.

## Vem äger vad (2026-11-17)

- **Huvudagentens adress: `dealer-32`.** Adressen är det andra sessioner skriver till med SendMessage, och den står bara
  på den här raden; rubriken Jakob ser på chatten betyder inget. Byter rollen session, ändras den här raden och inget
  annat. Alla sessioner fick nya adresser när Jakob bytte konto 2026-11-17; äldre adresser i commitmeddelanden gäller
  inte. Kontrollera med ListAgents före ett meddelande. Huvudagenten äger commits, taggar och push, studion,
  labbservern, spelet och 3D-scenens filmlager, `src/clip-graph.ts` och styrdokumenten.
- **Jakob talar bara med huvudagenten** (2026-11-17: "kan jag kanske tala med dig hela tiden så får du delegera"), som
  håller ihop sessionerna (2026-11-13: "Kör på och du delegerar och kanske nu tom ska komma vad de tre andra agenterna
  gör och se till att du har kontroll över vad alla gör"). Varje bana får sin kö av huvudagenten och säger till när ett
  steg är grönt med en fillista; det som bara Jakob kan svara på blir ett kort i Beslut.
- **Banor** (Jakob 2026-11-13: en typ av uppgift per session). Ingen bana skriver i en annans filer; allt in i repot går
  genom huvudagenten med en fillista. Betalda anrop utanför Beställ rapporteras till huvudagenten med belopp.
  - **Film (huvudagenten):** den enda vägen från bild till dealer (`tools/dealer-line.md`): Beställ och dess texter och
    bilder (`src/order-*.ts`, `tools/order-*.ts`), efterarbetet (`tools/film-after.ts`, `tools/still-after.ts`,
    `tools/python/`), banken (`tools/register-order.ts`, `motions/`), Protokoll, handboken och registren
    (`data/order-methods.json`, `data/media-roles.json`, `data/dealers.json`, `data/order-policy.json`).
  - **Kort (huvudagenten):** det ritade kortet, kortspåret (`src/card-track.ts`, `tools/track-card.ts`), pålägget och
    underlägget (`src/card-overlay.ts`) och kortproven; kortbyggaren (underagent) lämnar varje steg som en mapp i
    `D:/dealer-scratch/tmp/kortbyggare/`.
  - **Scen (`dealer-dc`):** bordet, rummet och ljuset i 3D-scenen (`src/scene3d-table.ts`, `src/scene3d-room.ts`,
    `src/scene3d-ui.ts`, `src/scene3d-view.ts`, `data/scene-materials.json`, `data/scene-rooms.json`,
    `data/scene-presets/`) och sidovinkeln av Paow som egna Prov.
  - **Tal (`dealer-cc`, [docs/TAL.md](docs/TAL.md)):** talfilmer med röst och läppsynk (`tools/speech.ts`,
    `src/speech-plan.ts`, `src/speech-lines.ts`, `data/speech.json`), munlagret och rösten genom sidans eget ljud
    (`src/scene3d-mouth.ts`, `src/page-audio.ts`, `src/scene3d-voice.ts`), `assets/speech/paow/` och faktafilen
    `data/lipsync.json` (vyn Lipsync).
  - **Trailer (`dealer-e2`, utan egen bana):** noir-trailer 3 och filmen före spelet (`src/game-intro.ts`,
    `assets/films/intro/noir-3/`, lämnade som patch; arbetet i `D:/dealer-scratch/tmp/trailer-3b/` och
    `D:/dealer-scratch/tmp/dealer-1e/intro/`).
  - **Banornas sessioner är stängda** på Jakobs ord 2026-11-17 kväll ("resätts eller arkiveras så att vi kan börja om
    med nya agenter"); adresserna ovan (`dealer-dc`, `dealer-cc`, `dealer-e2`) gäller inte längre. Tal och trailer har
    skrivit var sin överlämning som en ny session börjar från: `D:/dealer-scratch/tmp/tal/LASMIG-OVERLAMNING-2026-11-17.md`
    och `D:/dealer-scratch/tmp/dealer-1e/LASMIG-OVERLAMNING-2026-11-17.md`. Också huvudagenten bytte chatt samma kväll;
    adressen på raden ovan är den nya chattens.
- **3D (`dealer-6e`, startad av Jakob 2026-11-17 kväll;** hans ord: "en till agent som arbetar parallellt med dig och
  som ska förbättra 3D-visualiseringen av det som idag är 2D"**):** utreder och prövar en dealer i riktig 3D (samma giv sedd från
  olika stolar, kortet ett verkligt 3D-kort), avskilt i mappen `dealer3d/` på grenen `dealer-3d` i arbetsträdet
  `D:/dealer-scratch/tmp/dealer-3d/trad`. Den skriver bara där, läser `src/scene3d-*.ts`, `src/placement-model.ts` och
  planen, lämnar det Jakob ska se som Prov (`assets/proofs/dealer-3d-<namn>/`) och grenen till huvudagenten. Betalt
  (Meshy, på Jakobs eget ja) rapporteras till huvudagenten med belopp. Medan labbet byggs om (Börja här) gäller för
  varje ny session: arbeta i ett eget arbetsträd på en kort
  gren (`git worktree add D:/dealer-scratch/tmp/<bana>/trad -b <gren> main`), skriv först till huvudagenten vilka filer
  du tar, rör inget under `studio/` utan besked (fem underagenter skriver där), starta ingen egen server och lämna
  grenen till huvudagenten, som slår ihop den.
- **Mått ur en riktig dealers film (`dealer-24`, startad av Jakob natten till 2026-11-18;** hans ord till den: se filmen,
  ta hennes handrörelser, bordets bilder, kortens storlek "och annat", bygg en modell, och "komplettera framförallt den
  som äger checkout med mått på saker samt vinklar"**):** mäter en YouTube-film av en riktig dealer och bygger en
  fristående 3D-modell. Skriver bara i `D:/dealer-scratch/tmp/yt-referens/`, inget i repot; filmen går aldrig in i
  Git, `assets/` eller ett Prov. Huvudagenten har svarat vilka mått som saknas mest (givens slag i tid, vändningen,
  slutet, kortet mot handen, blicken, skon, kameran); en sida med talen lämnas först i mappen.
- **Jakobs egna:** planen `placements/default.json` (Arbetsyta) och hans domar i `motions/` (`review`), som skrivs från
  Granska och aldrig skrivs över av ett verktyg. En dom som getts åt honom (`node tools/review-put.ts`) är aldrig hans,
  väntar inte i hans kö och ger vika för hans.

## Öppet hos Jakob

Det som väntar på hans svar står i studions vy **Beslut** (`/studio/beslut/`, registret `data/decisions.json`; README),
ett kort per fråga med filmen eller bilden på kortet. Han svarar där eller i huvudagentens chatt. En agent lägger till
ett kort när något väntar på honom och tar bort det när svaret är utfört. Han läser inte långa svar, och `KLAR.txt`
skrivs på skrivbordet när allt har ett utfall. Här står bara det som inte är ett kort:

1. **GitHub är låst av en betalningsfråga** sedan 2026-11-17 kl. 16.48 ("The job was not started because your account is
   locked due to a billing issue"). Kontrollen går grön på datorn, så inget är stoppat, men GitHubs bock är röd tills
   han har rett ut betalningen (Settings, Billing).
   **Kopians lösenord har stått i det publika repot** (utskrivet i HANDOFF och `docs/DRIFT.md` till och med
   `dfe29c4`; funnet av 3D-banans granskning 2026-11-18). Ordet är borta ur dokumenten men står kvar i historiken och i testernas exempel (`tools/studio-lock.test.ts`,
   `tools/knowledge.test.ts`, två kommentarer i `cloud/studio/`), så det
   bör bytas: nytt `DEALER_LOSEN` i Vercel-projektet och en ny publicering, vilket kräver hans ord. Boten och
   önskemålslådan är det som ordet skyddar; boten kostar per fråga.
2. **Filmen till hans chef:** `paow-runda-6-till-chefen-spelet.mp4` (och `-scenen.mp4`) på skrivbordet, 124 s, blint
   granskad 3,75/5, inspelad före kortens fjärde steg, håret, rummets slinga och mungiporna; en ny tagning görs när
   läpparna är inne. Ingen granskare har hört ljudet: han bör lyssna innan han skickar. `paow-runda-2-` till `-5-` ska
   inte skickas.
3. **Det han bör se i Granska, delen Prov:** underlägget (`underlagg`; han kunde inte klicka på länken), `liv-i-overkroppen`,
   `blixten`, de fyra nya rummen (`monaco-och-spelhalan`: ska något av dem in i spelets meny?), röken
   (`rok-over-bordet`, av), `koppar-i-relingen` och trailerns nya slut (`trailer-noir-3`). På en iPhone (Kända brister):
   hörs hon i första repliken och under en runda, med ringsignalen på och av, och kommer rösten in sent första gången?
4. **Farten:** scenbanans förslag väntar på hans öga: fart bara på givar och returer, hellre 1,3–1,5 än 2.
5. **Ett tredje och fjärde dealerkort** ("Skapa då ett tredje och fjärde till dealer", 2026-11-13): planen har sexton
   platser (`TARGETS` i `src/placement-model.ts`), så en film dit går inte att beställa och korten läggs utan hand.
   Förslag, inte byggt: `D.C3` och `D.C4` efter `D.C2`, han flyttar dem i Bordets Kortplan, filmerna beställs som hennes första
   kort. Vill han ha det så?
6. **Mindre saker:** keystone ur video eller redigerad stillbild (Målet); ska `placements/proposals/` (två planförslag
   från 2026-11-11) tas bort; ska gamla publika sajten stängas, och biblioteksfilerna under `materials/` byggas ur vår
   egen källa; fyra av Pamelas filmer från 2026-11-11 ligger på disk utan post; ska bordets tryck följa `tableSize`;
   hans första röst-id är inte färdigtränat hos ElevenLabs (bara kontots ägare kan göra klart det); ska Paows talbank i
   hans privata Blob-lager för talet tas bort; profilval 1 kapar toppen av hennes huvud i 93 % av rutorna.
7. **Pamela** (pausad): primära, hålkortets giv, skokortets lutning, kortformat på tvären, Meshy-bordet och obedömda
   prov står i HANDOFF före 2026-11-13 i Git och tas upp när pausen hävs.

## Nästa steg

**Nyast: huvudagenten lämnade över rollen natten till 2026-11-18.** Överlämningen ligger i
`D:/dealer-scratch/tmp/huvudagent11/OVERLAMNING-2026-11-18.md` och är nyare än avsnittet nedan för allt efter kl. 00.45
(det som står som "Pågår" nedan är till största delen inne). Sessionen 3D skriver om hela överlämningssystemet på grenen
`handoff-nytt` (Jakobs PRIO 1); den här filen ersätts när den grenen slås ihop.

**Börja här (läget 2026-11-18 kl. 00.47; huvudagenten bytte chatt kl. 21.45).** Labbet byggs om på Jakobs ord från
kl. 21.46 och 21.58 (Jakobs besked, "Ett labb"), av underagenter till huvudagenten:

- **Inne i `main` och sett i headless Chrome:** vyn **Bordet**, första versionen (`82258f3`: `/studio/bordet/` med
  lägena Kortplan, Beställ, Scen, Råfilm och Efterarbete, ny zoom, ett kortformat; "Skapa utkast" är inte tryckt, bara
  bevisad lika med produktionslistans utkast i ett test); **Granska med Prov** (`ab08b8f`); **Karta med Primära**
  (`fcfd2d9`: nodträdet, Primär och högst tre sekundära per steg med hur spelet använder var och en); **Lipsync per
  dealer** (`ff03b89`); **gamla labbet borta** (`3833575`); **rundan byggd av noderna** (`6f00d19`: "Bygg en runda" i
  panelen Runda, i Scen och i Bordets läge Scen); **menyn** (`3144e1d`, `fd7e5a7`): Bordet, Karta, Granska,
  Material, Lipsync, Beställ, Casino, och i foten Beslut, Ordlista, Ljud och Modeller. Scens och Placerings adresser
  fungerar i labbet; kopian på nätet behåller dem i sin meny.
- **Bordets andra steg är inne** (`803b68a`, sett i headless Chrome): varje rad i Beställ visar exakt vad som går till
  Runway (första och sista bilden, referensfilmen med vems film det är eller "Ingen referensfilm", texten ord för ord);
  läget Beställ har Filmer och Kön, där Kön är hela förra Beställ med godkännandet; en rad som beställts förut visar
  tagningarna som kom bredvid det som skickades (Granska filmen); kortens böjning och glans ändras bara i Efterarbete, alla 16 på en gång; `/bestall/` och `/placering/` leder till Bordet i labbet. Menyn i labbet: Bordet, Karta, Granska,
  Material, Lipsync, Casino. "Alla sju" skickar nu varje plats egen vändning. "Skapa utkast" i Bordet är tryckt en gång
  i headless Chrome kl. 22.53 och gav ett riktigt utkast (borttaget igen); Godkänn i Bordet är inte tryckt. Radens
  förval är ännu metodregistrets gamla recept för en giv (Kling 4, 7 s, tur och retur, ingen referensfilm): kvällens
  recept blir förvalet först med mall 10 (filmmetodens plan, nedan).
- **Bordets tredje steg är inne** (`c9a1873`): studion öppnar på Bordet; Scen, Placering och Beställ är delar av Bordet i
  labbet och i kopian (bara läsning där: inget Beställ, inget sparas), och `/`, `/scen/`, `/placering/` och `/bestall/`
  leder dit med adressens alla ord; skalen är borta (1 403 rader mindre); botens kunskap, README, SYSTEM, DRIFT och
  ordlistan beskriver den nya menyn; raderna i Beställ visar bevisat samma text som utkastet får. Inte sett: kopian i
  en webbläsare (bara byggd). Ny beställning ritar ännu sin egen bild (`order/Stage.tsx`).
- **Kortplanen i verkligt perspektiv är inne** (`918e7f4`; hans ja kl. 23.02 på kortet i Beslut, som är uttaget, och
  hans "kör vi 1.0" kl. 23.22): där planen säger Plant bord (hans plan gör det) ritas varje kort som ett verkligt kort
  (63 × 88 mm, storlek 1,00) genom linsen som ger dealern människostorlek (`src/table-lens.ts`, 3D-banans funktion
  ordagrant; `src/card-plan.ts` `planCardQuad` är den enda regeln). Samma fyrhörningar i Bordets Kortplan, kortbanans
  landning, Ny beställnings bild, "Det här skickas" och en ny beställnings sista bild; sparade beställningar behåller
  sitt ritade kort, och planfilen är inte skriven. Kortplan har inget storleksreglage: storleken justeras i Efterarbete
  (V6:s kort mäter cirka 1,38 av ett verkligt, skattat). Före och efter: Prov `kortplanen-verkligt-perspektiv`.
  **Kvar:** spelets liggande kort (`src/game-table.ts` ritar med `flatQuad`, pålägget i `card-overlay-view`, och
  3D-scenen ställer korten med kontraktets kamera, k = 2, som är en annan kamera än linsen): de ska följa samma regel,
  visat för honom i labbet först; labbservern startas om när spelet importerar `src/card-plan.ts`. Kvar på den gamla
  regeln med flit: `tools/build-anchor.ts` (frysta hashar), `tools/card-coverage.ts`, `tools/placement-backdrop.ts`.
  Bordets bild zoomar inte längre ut förbi hela bilden, och `preview.ts --open` klarar en adress med flera ord.
- **Skills och rutinverktyg är inne** (`c9a8509`): sju skills i `.claude/skills/` (AGENTS, "Läs först", punkt 4), och
  tre verktyg med tester: `node tools/push-clean.ts` (pushen från ett rent träd), `node tools/lab-look.ts` (skärmbilder av
  labbsidor under låset) och `node tools/studio-from-commit.ts` (studion byggd ur en commit i ett rent träd och inbytt
  i `studio/out`; i kväll med `--trad D:/dealer-scratch/tmp/granska-prov/trad`, senast ur `c9a8509`, så att en
  underagents halvfärdiga filer inte är det han ser).
- **Skons kort i labbet är rättat** (`f469450`): `WINDOW_CARD` var nypets uppdragna kort (111 × 57) och ritades utanför
  skons mynning; nu är det kortet som står i fönstret (92 × 45), mätt i bakgrundsbilden.
- **Filmmetodens tre följdprov är gjorda** (426 krediter, saldo 7 004 kl. 23.40; Prov `giv-forlagefilm-2`, handboken §5,
  `07c8ddc`; oberoende granskade, inget dömt av honom och inget infört i banken): **släpet från ankare 2.2 till plats 4
  håller** med Pamelas släp som referensfilm (2 av 2 användbara, 4/5 och 3/5: kortet släpas plant och vänds vid
  platsen); **nypet till plats 1 föll** med hennes giv dit (1/5 två gånger: hennes film visar kortet på kant när det
  svänger ur fönstret, och Kling lade vändningen där och kortet blev för stort); **en renderad vit docka kan styra
  rörelsen** (Kling tog 3D-banans film ihop med första och sista bild, inget av dockans utseende kom med, kortet följde
  dess bana och takt och vändningen var kvällens renaste), men tagningen kopierar också dockans fel (kortet glider utan
  finger; 2/5). Regeln, belagd i nio tagningar: bana, takt, kortets storlek i handen och ögonblicket på kant kommer ur
  referensfilmen; vem hon är, skon och var kortet ligger kommer ur bilderna. En referens väljs därför efter vad den
  visar, inte bara efter hans dom. **Hans eget öga på provet** (cirka kl. 23.47): "Alla A-filmer ser bra ut.. C nyp ser
  bra ut!", och om B: "hela B:serien som är fel.. Det kan finnas fel eftersom Pamelas grundfilm är otydlig; det är
  oklart om hon växlar över till rätt sida innan hon trycker ner kortet, som dessutom är för litet och har vitt runt det
  blåa […] färgerna växlar en gång för mycket […] Pau i båda tagningarna släpper ner fel sida". Han godtar alltså
  dockans tagning, som granskaren fällde för att kortet glider utan finger: i den automatiska kontrollen blir det en
  anmärkning och inget fall, och referensfilmer mäts själva innan de används.
- **Filmstandardens första del är inne** (`553d254`, det som går utan media): **mall 10** skriver en öppen giv med handen
  vid skon i de ord som höll i proven (nypet om kortets kortsida, släpet plant med gula sidan upp, vändningen som en
  rullning med handleden "like turning a key": på vägen från nypet, nära platsen från släpet; slutet med vänd hand,
  kortet lagt blått och fingertopparna till vila på det, som i sista bilden); ordrar med mall 9 behåller sina ord.
  **Den automatiska kontrollen** (`src/deal-check.ts`, skrivs som `dealCheck` i `after.json`) fäller det han
  underkänner på synen före en granskare (färgbyte utan kantläge, på kant en andra gång, lagt gult och vänt efteråt,
  fel sida upp, mer än 25 % över ett verkligt kort, mer än 15 bildpunkter från sista bildens kort) och ger en
  anmärkning för det granskare mäter men han inte stör sig på; på provens 16 tagningar fäller den B1, B2 och WAN A t3
  och inget han eller en granskare släppt igenom. **Sista bilden** i en giv bara dit är rutan i bankens egen film där
  den godkända returen börjar (`cutFrameOf`, `src/cut-frame.ts`). **En renderad referensfilm** (dockan) bärs av
  ordermodellen och bjuds först. Referenserna är mätta: Pamelas film till plats 1 faller (som han sa), hennes plats 4
  och dockans filmer till plats 3–5 är rena (`D:/dealer-scratch/tmp/film-standard/referenskontroll.tsv`). B-seriens
  kort var lika stort som ett verkligt kort (0,99 och 1,02 mätt på ytan); granskarens 15–35 % kom av långsidan, som
  rörelseoskärpan drar ut. **Kvar, steg två** (grenen `film-standard-register`, `d034595`, och listan i
  `D:/dealer-scratch/tmp/film-standard/`): metodregistrets nya poster (givarna blir bara dit) tillsammans med att
  `order-store` och Bordet tar klipprutan som sista bild; `after.json` för de 16 tagningarna; kontrollens tillägg ur
  bildpasset (blandade rutor, tryckt kort, handmask); registret över mätta referenser; dockans filmer in i
  `assets/references/docka/`; arket "det som skickades" ska visa referensfilmens sista ruta bredvid sista bilden.
- **Givens slut, så som det är mätt** (hans fråga natten till 2026-11-18 om arket för prov C, där dockans hand har
  handflatan uppåt i ruta 80 och sista bilden har handryggen uppåt: "Det måste finnas en logik i allt detta också. DOCK
  om det är så att det är tänkt att hon ska de sista ca 30 bildrutorna vända handen igen och skjuda in det så är det
  såkalrt bra. Men vi måste vet vd som sker!", och "När "2.1" används så ska ju rimligen "nyckelvridning" av kortet ske
  i allmänhet utan att hon ska "lyfta kortet efter det släpats" eller tryckts ut"). Sett ruta för ruta
  (`D:/dealer-scratch/tmp/huvudagent11/look/hand-slutet/ark-a.png`, `ark-b.png`): 3D-banans första film (prov C, en
  påhittad rörelse) vänder aldrig tillbaka handen och är pensionerad; filmerna lästa ur Pamelas hand ("avlast", prov
  C2, och "avlast-2", prov C3) gör som hon och som Paows egen p4-04: kortet bärs i luften, vänds där mitt på vägen (på kant vid ruta 53–56 av 120,
  1,8 s), hålls sedan uppifrån i sin bortre kant med handryggen uppåt, läggs vid ruta 80 (2,7 s), skjuts 18 bildpunkter
  till under fingertopparna (ruta 80–95) och ligger sedan still med fingertopparna kvar, vilket är sista bilden. Handen
  vänds alltså en gång, i luften, och aldrig i slutet (Prov `giv-forlagefilm-2`, de tre arken `z-givens-slut-*` sist i provet). Regeln
  för ankare 2.1: nyp, bär i luften, nyckelvridning mitt på vägen, lägg, skjut sista biten, vila. Från ankare 2.2 släpas kortet plant
  och tas i kanten och vänds först nära platsen. En referensfilm måste sluta som sista bilden, annars hittar Kling på
  slutet (prov C: kortet låg ensamt och handen kom efteråt).
- **Dockfilmerna** (prov C2 kl. 00.10: den rättade dockfilmen höll, 4/5, 85 krediter): metoden är fri från Pamelas
  filmer där en dockfilm finns, plats 3, 4 och 5 (plats 6 och 7 går genom skon och plats 1 korsar kroppen; de behöver
  egna rörelser). **Tre tagningar till** med filmerna "-2", där handen ligger kvar på kortet (255 krediter, saldo 6 664 enligt
  `D:/dealer-scratch/tmp/giv-experiment-2/ledger.json`; `c3-*`, `d-*` och `e-*` i Prov `giv-forlagefilm-2`,
  oberoende granskade, inget dömt av honom, handboken §5): **plats 4 håller** (C3, 4/5: en vändning, inget lyft av
  fingrarna i slutet, lagt 0–2 bildpunkter från sista bilden; det gula kortet bärs cirka 16 % för långt), **plats 5 är
  oavgjord** (E, 3/5: storlek och vändning rätt, men handen lyfts från kortet i 0,7 s och läggs om, troligen för att
  sista bildens platta, utspärrade hand inte är dockans slut) och **plats 3 föll** (D, 1/5: kortet bärs som en remsa
  och bleknar nästan till vitt). Nästa steg för plats 3 och 5: en sista bild vars hand slutar som dockans (görs ändå
  om med tatuerade händer), och en tagning till på plats 3 innan metoden döms där.
- **3D-banan** (`dealer3d/`, sammanslaget till och med `b61109f`): dockans hand är läst ur en verklig giv; varje stols
  öga står bakom stolens eget kort som bankens kamera bakom plats 4:s; huvudet följer kortet och den vilande handen är
  släppt lite fri (modell, inte avläst; Prov `dealer-3d-stolens-oga-och-blick`); hans riggade Meshy-modell av Paow
  sitter vid bordet som ett utseendeprov (Prov `dealer-3d-paow-modell-vid-bordet`; riggen saknar fingerben, 3D-banans
  egen skattning 2/5). Två kort i Beslut väntar på honom om dem. Banan gör nu förlagan "-3" (plats 4 från bankens
  kamera med blicken och den friare handen), som huvudagenten beställer en tagning av, och sedan en förlaga för släpet
  från ankare 2.2.
- **Disken: 80 GB borttaget kl. 23.13** enligt inventeringens kontrollerade listor
  (`D:/dealer-scratch/tmp/stadning/inventering-2026-11-17/`, loggen `borttaget-2026-11-17.txt`): webbläsarprofiler,
  `node_modules` och cachar i slaskmappar, 374 exakta kopior av filer som finns i `assets/` (stickprov 12 av 12 lika på
  SHA-256), råa bildrutor från inspelningar vars filmer finns kvar (65 mappar, film bredvid var och en) och djupdata för
  kamera 2 som ett skript gör om. Inga filmer, kvitton eller domar. Kvar orört: 12,5 GB avgjorda prov på slaskdisken
  (O3, ses per mapp), Docker-disken i WSL (86 GB på C:) och gamla projektets arkiv (163 GB på D:), som är hans. Funnet
  på vägen: `npm run stada` kan aldrig fälla en avslutad session, eftersom en jokerrad i `docs/DRIFT.md`
  (`*\OpenAI\Codex\bin\*\rg.exe`) läses som en sökväg till varje sessionsmapp; 23 talfilmers `motions/` pekar på
  kvitton som flyttats till `D:/dealer-scratch/tmp/tal/overtaliga/`; flera av Paows källor i `data/media-roles.json`
  ligger på D: i stället för i `assets/`.
- **Det oanvända i `assets/` är arkiverat** (`53dc116`, kl. 23.34): `node tools/media-audit.ts` säger för varje mapp i
  `assets/` och `output/` vad den är och vad som använder den (spelas, visas, referens, bara registrerad, okänd; ett
  exakt id i ett dokument, en instruktion eller Beslut räknas som visas). Efter dess lista flyttades 367 enheter (1 073
  filer, 3,96 GB) till `D:/dealer-archive/dealer-ej-anvant-2026-11-17/` med samma sökvägar, varje fil kontrollerad på
  SHA-256: 124 filmer utanför banken, 126 talmappar, 35 avgjorda prov, 73 betalda bankfilmer utan post, 9 ersatta ankare.
  Kvittona ligger kvar, 183 poster är uttagna ur Material, och inget han har dömt, inget banken spelar och ingen
  referens är flyttad. Planen, loggen och skriptet som tar tillbaka allt (`aterstall.mjs`) ligger i
  `D:/dealer-scratch/tmp/stadning/inventering-2026-11-17/`. `output/` är bara den återskapade V6 och ligger kvar. Om
  kopian på nätet: "Allt på nätet är sekundärt"; inget arbete läggs där, och `cloud/` står orörd tills han säger att
  den ska bort.
- **Material säger vad som stämmer med dagens kortplan** (`e635b6d`, sett i headless Chrome): `node tools/media-audit.ts
  --fit --write` mäter varje bild med ett kort på en plats, varje ankare, bankens givar och referenserna mot dagens
  regel (`planCardQuad`, dealerstandarden) och skriver `data/media-fit.json`, som Material visar som en bricka på rutan
  ("äldre plan", "annan kamera", "avviker"). Vid första mätningen stämde 8 av Pamelas 66 bilder med kort och ingen av hennes mätbara givar (mätt om kl. 00.30 efter formregeln, `2a56f08`: sex bilder till, alla på plats 4); Paows kort ligger alla på rätt plats (0,2–1,4 bildpunkter), 8 givar stämmer i storlek och 14 är 15–37 % för
  små vid ytterplatserna; V6 och dess råfilmer är en annan kamera. Filen ska skrivas om när planens regel ändras (hans
  sparade Perspektiv): inte automatiskt än. Material följer menyns dealerväxel (med Paow vald visade den Pamela), dess
  egen växel är borta, och avsnittet Prov är ute ur Material (proven är Granskas del Prov). Tre referensfilmer som
  inget använde är arkiverade.
- **Perspektiv ändrar bara kortens form** (`f8c637f`, sett i headless Chrome kl. 00.39; hans öga på den förra
  versionen: "Kortet i skon är större än korten som ligger närmare oss […] DC1 kanske 65% av storleken av kortet i skon
  […] Är det perspektivet som är fel"): varje kort har den verkliga kamerans storlek och plats (`src/table-lens.ts`),
  och reglaget smalnar bara av den bortre kanten kring kortets egen mittlinje, ett värde för alla kort, 80–96 %, med
  märken vid Din plan (87 %) och Verkligt (96 %). Utan sparat värde ritas hans plans 87 %. Dealerns kort mäter 75
  bildpunkter vid 96, 91 och 87 %. Bild 6–9 i Prov `kortplanen-verkligt-perspektiv`. Inte gjort av en hand i en
  webbläsare: att dra reglaget och trycka Spara.
- **Kortplan har en vy, och Pamela visas inte av sig själv** (`f8c637f`; hans ord cirka kl. 00.00: "Jag trodde att
  ingenting skulle göras dubbelt för mobilen. Generellt förstår jag inte varför vi automatiskt kan komma in till
  Pamela", och "V6-läget är jag skeptisk mot i sin helhet"): inget som körs läste planens mobilvy (spelet läser bara
  `geometry.native`, också på en telefon), så valet Dator | Mobil och adressordet `vy=mobil` är borta; behövs en
  mobilvy härleds den ur samma kort och lins, aldrig som en andra inställning. Under korten finns bara Siluett och den
  valda dealerns egna filmer; V6-bilden är ute ur listan; Paow står först i växeln; en pausad dealer som en adress
  nämner visas men blir inte ihågkommen (bara ett klick på växeln gör det). V6 står kvar som referens och kontrolleras
  varje push (AGENTS); om den ska arkiveras är hans ord, inte frågat än. `validatePlan` kräver ännu båda vyerna i
  planfilen, som är orörd.
- **Kortens storlek** (hans ord kl. 23.14: "`assets\reference\native-0694.png` har ju tex skitbra kortstorlekar […] är så
  osäker på allt. Men finns så många spår!"): bilden är ruta 694 av V6, där korten är ungefär en tredjedel större än ett
  verkligt kort mot hennes hand (skattat, mäts av Bordets underagent). Hans besked kl. 23.22: "Ang kort. Gör allt enkelt bara. kör vi 1.0 så
  kanske det är bra. men bara allt är logiskt. Min ide är ju att vi ska kunna efterarbeta fram en ovelay ändå där vi
  kanske ska kunna justera just som sånt här." Alltså: kortplanen ritar ett verkligt kort (1,00) med linsen, utan eget
  storleksreglage; storleken justeras bara i Efterarbete (de ritade kortens "Kortens storlek"), som är hans överlägg.
- **Den tatuerade uppsättningen är förstahandsvalet** (hans ord natten till 2026-11-18: "vi också sätter hennes
  tatuerade keystone/som förstahandsval"): båda keystonebilderna med tatuerade händer gäller (`f8e3f6c`) och ankare 1
  med samma händer (`b0a03f3`, efter hans Ja i Beslut 2026-11-17); de tidigare är ersatta och ligger kvar på disk.
  Registret skriver att det var hans besked i chatten, infört av huvudagenten (`setState` tar `where`). Regeln lät
  förut en bild gälla per roll, så att godkänna den sittande keystonebilden ställde undan de stående: en keystone ger
  nu bara vika för en i samma ställning (`replacedBy`, `isStanding`). Följden: nya ankare och filmer beställs ur de
  tatuerade bilderna; varje film i banken har otatuerade, större händer och spelas tills en ny finns, så skarvar mellan
  gammalt och nytt visar händerna byta. Ankare 2.1 med tatuerade händer finns inte än.
- **Pågår: nytt ankare 2.2 för Paow** (hans ord: "Ankare 2.2 för paow vill jag ska vara så att hon tittar mot
  kortet/skon/handen […] Just hennes ankare 2.2 är dåligt i alla fall på grund av att hon inte har en "styvare"
  handhållning för att "stryka/dra trycka ut kortet ur skon, och att hennes blick inte är just mot skon""). En
  underagent gör en eller två kandidater (blicken på kortet, platt och styv hand, tatuerade händer 10 % mindre, allt
  annat bankens bild) i `assets/anchors/paow-ankare-2-2-blick-*/`, oberoende granskade, som Prov
  `paow-ankare-2-2-blick`; högst 240 krediter, arbetet i `D:/dealer-scratch/tmp/ankare-2-2-blick/`. Han väljer;
  filmerna som börjar eller slutar på dagens 2.2 blir då äldre.
- **Pågår: val för hand** (hans ord: "Jag vill också kunna manuellt ändra typ ankare och klipp så jag får välja de som
  är primära eller radera eller arkivera och så vidare. Men samtidigt om jag väljer ett visst, kanske nytt ankare, så
  ska då såklart vissa andra klipp som bygger på det ankaret i så fall "gråas" eller mörkas för att de då inte kan
  härledas ur rätt ankare förslagsvis"). En underagent bygger på grenen `val-for-hand`
  (`D:/dealer-scratch/tmp/val-for-hand/trad`): vilken bild som helst i en roll kan göras gällande av honom, också en
  som ställts undan; arkivera och ta tillbaka bilder och klipp (aldrig radera betald media från en knapp); klipp
  byggda på en bild som inte längre gäller mörkas med en bricka, och bytet säger först hur många klipp det gäller.
- **Pågår: Prov utan "Inte granskad", och hans egen kommentar** (hans ord: "Står också "inte granskad" på massor av
  klipp. Varför granskas de inte? Är det jag som ska granska? Då måste jag ju få val att kommentera.."). Brickan kom på
  varje fil utan omdöme i `proof.json`, också på underlag som ingen ska döma. En underagent bygger på grenen
  `prov-egna-ord` (`D:/dealer-scratch/tmp/prov-egna-ord/trad`): underlag får ingen bricka, en tagning utan omdöme
  säger "Väntar på granskare", och han får två knappar och ett kommentarsfält på varje film och bild i Prov, sparat i
  ett register som huvudagenten läser med `node tools/proof-notes.ts` före ett svar till honom.
- **Beslut** har två kort som väntar (3D-banans, ovan) och två besvarade som inte är utförda (`kortets-baksida`: gul
  rygg med SG och blå framsida i efterarbetet; `repliker-som-munlappar`). Fem utförda togs ut kl. 00.38; hans ord
  ur dem står under Jakobs besked.
- **Vakten på hans kö** (`vakta-kon.mjs`) går i huvudagentens chatt i halvtimmar och måste startas om; godkänner han en
  beställning startar huvudagenten beställningsagenten (`tools/order-clerk.md`).
- **Att göra:** körarens kod för munnen ligger bara på D: (`D:/dealer-scratch/tmp/tal/korare/`) och bör in i repot
  efter städning av två skript; `data/lipsync.json` hålls av huvudagenten tills en ny talsession finns; granskarens
  andra fynd, som inte är kontrollerat här: spelets ritade kort följer inte planens kortstorlek (planen 43, 87 och 130
  bildpunkter ger enligt honom 91, 90 och 90 i spelet), vilket hör till Efterarbete. Kartan visade att Paows Primär
  för P1C1 → A2.1 aldrig spelas (fel hand mot given); det är hans val att byta.

Huvudagenten slår ihop grenarna i `main` en i taget (squash), bygger studion ur commiten (`node tools/studio-from-commit.ts`), ser på sidorna med `node tools/lab-look.ts` och tar bort träden och grenarna. Bryts chatten: `git worktree list`, `git log main..<gren>` och `git status` i huvudträdet säger vad som
finns; kör testerna och avgör vad som är helt. Kopian på nätet är kvar på `aee87ca` (inget publicerat i kväll: en publicering bär Bordet, bara läsning, i stället för Scen och Placering, och ordlistan och botens kunskap med den nya menyn; fråga
sedan kopian som en ny besökare). Saldot hos Runway var 6 664 efter nattens nio provanrop (ledgern i `D:/dealer-scratch/tmp/giv-experiment-2/`); taket per beställning är 2 000. `KLAR.txt` är
inte skriven. Filmerna (punkt 1) är huvudagentens eget nästa steg när labbets grenar är inne. I den här ordningen:

1. **Filmerna först** (hans ord). Metoden som håller står i handboken (`tools/film-prompting.md` §5, tabellen): giv bara
   dit på Kling 4 med första och sista bild och Pamelas giv till samma plats som referensfilm. Gör den till nästa mall
   och till förvalet för en giv i Beställ: texten är givprovets C (`D:/dealer-scratch/tmp/giv-experiment/texts.json`),
   och sista bilden bör vara landningsrutan ur bankens film till platsen, så att den befintliga returen fortsätter
   därifrån (Paow har ingen användbar landningsbild, och alla hennes returer är andra halvan av en tur-och-retur-film).
   Att rätta: handen släpper det lagda kortet och läggs platt igen i slutet, och en ljus kant på 1–1,5 bildpunkter på
   kortets tjocklek. Sedan de två prov han bad om i Beslut ("det behövs ju också för och från A2.2 till P4C1.. och
   kanske för alla andra spelare"): släp från ankare 2.2 med Pamelas släp som referensfilm, och en annan plats med
   Pamelas film dit. Kling 3.0 Motion Control är prövad samma kväll och faller (Prov `giv-motion-control`).
2. **Labbets grund** (hans ja med anmärkning, och hans ord kl. 21.46: Jakobs besked "Ett labb"). Första steget är gjort
   (`ccd9c52`: kortbanan efter filmerna, planens vändning som orderns förval, släta gula och blå kort; Prov
   `kortbanan-efter-filmerna`). Pågår (ovan): vyn Bordet med samma ram för kortplanen och den levande scenen, stegen
   Var kortet landar, Hur det kommer dit och Beställ som en lista av filmer, bättre zoom och ett kortformat; skons
   kort mäts mot planens perspektiv. Sedan: steget Granska filmen (byggordningen i
   `D:/dealer-scratch/tmp/labbgrund/grund/RAPPORT.md`), hans ja till Bordet innan Placering, Beställ och Scen leder dit,
   och på hans anmärkning bort med beskrivningarna av rörelsen som inte skickas till Runway (`FLIP_ABOUT`, `HAND_ABOUT`,
   `SHAPE_ABOUT`, `LANDS_ABOUT`, `startWords` och sammanfattningsraden `dealWords` i `src/order-model.ts`, visade i
   `Choices.tsx`, `NewOrder.tsx`, `SendScreen.tsx`, `OrderList.tsx` och `Stage.tsx`). Efterarbete (där Scen ligger;
   kortets förarbete per film, ruta för ruta) kommer efter filmerna. Gamla labbet är borttaget (`3833575`):
   3D-sidan, Ljud och Modeller är sidor i `pages/` (Ljud och Modeller längst ned i menyn, 3D-sidan bakom Scens knapp),
   Filmbiblioteket och Runway-underlaget är Prov-mapparna `filmbiblioteket` och `runway-underlaget-10-nov`, och
   `/lab.html` leder till studion. Borta med det tills nya labbet har dem: "Rå | renderad" på en tagning (hör till
   Efterarbete), rundbyggarens steglista (grenen `runda-noder`) och panelen Vila.
3. **Sidornas ord:** 72 ställen säger annat än ordlistan (`D:/dealer-scratch/tmp/stadning/ord/ORD.md`, del c, med fil,
   rad och förslag); kontrollera radnumren, filerna har ändrats sedan dess.
4. **Läpparna:** hans ja till provet `paow-realtid-mun-6` (kl. 21.38) gör sättet för munnen i realtid till: storlek F,
   bara läpparna, mindre öppning i vanligt tal med dagens som tak, hakan följer mjukt. En ny talsession börjar från
   överlämningen (ovan): munnen strömmad till spelet, och provkvällen på podden (högst 5 USD, besked till honom samma
   dag före start; en podd kan inte bygga en image, så Dockerfilens steg körs där som ett skript, som inte är skrivet).
   Vyn Lipsync visar inte körarens rad och licenserna än (`runs.ownRunner`, `licences` i `data/lipsync.json`).
5. **Nya händer:** hans svar om det nya ankare 1 (2026-11-17 kl. 21.38): "Ja. Mne vi kanske kan göra om en 'A1 till
   A2.2 och sedan framgent de filmer som görs, tillsi får till hur vi ska göra filmerna, faktist , så kan vi göra med
   tatueringar. men låt nuvarande vara kvar så kan vi fylla i dem när vi får till resten". Natten till 2026-11-18
   gjorde han den tatuerade uppsättningen till förstahandsvalet: keystonebilderna och ankare 1 gäller, ett nytt ankare
   2.2 görs (Börja här). Sedan: ankare 2.1 med samma händer, ingången A1 → A2.2, landningsbilder med tatuerade händer
   för plats 3–5 och givarna dit med dockans filmer; dagens filmer ligger kvar. Trailerns film är pausad på hans ord.
6. **Frågor till honom som inte är ställda på ett kort:** ska vändningen vid platsen ritas som filmen gör den (lyft och
   vänd i luften vid platsen) eller som ordertexten säger (rullad på filten); vill han ha en siluett i ankare 2.2:s
   pose; skons kort är i filmerna dubbelt så långt i bild som dealerns kort (111 mot 55 bildpunkter), vilket han tyckte
   såg konstigt ut, och det ändras bara med nya ankare; ska WSL-disken (85,9 GB på C:, där Docker ligger) flyttas till
   D:; och licensfrågan om ansiktsmaskens vikt i Scouts renderer (Läpparna i realtid, nedan).

**Läget 2026-11-17 och det som pågår.** Kopian publiceras ur `main` efter varje färdig del (senast 2026-11-17;
`/meta.json` på kopian säger vilken commit); av en repliks filmer bär den bara den spelet säger (DRIFT, "Taket för
Blob"). Runway är inloggat; saldot var 6 664 krediter natten till 2026-11-18: läs det före en beställning. Gamla beställningstexter, dokument och denna fil städades 2026-11-17 efter granskningen
`D:/dealer-scratch/tmp/stadning/FORSLAG.md`: en ny order kan inte längre skrivas med den långa texten (mall 3:s ord),
"Ny beställning som den här" skrivs med dagens mall, granskarens instruktion prövar det dagens text ber om, och den
gamla checklistan matar inte längre boten (verkar på kopian vid nästa publicering). Kvar ur granskningen: sidornas
ord med flera betydelser (område 2), som tas med ordlistan, och det som kräver hans ord (gamla publika sajten,
planförslagen, markering av avgjorda prov).

- **Labbets grund** (Jakobs besked, "Ett labb"). Två utredningar från 2026-11-17 ligger i
  `D:/dealer-scratch/tmp/labbgrund/`: `placering/RAPPORT.md` (varför han inte hittar rörelsen, siluetten vid ankare 2.2,
  kortets baksida, och att kortbanan inte stämmer med filmerna: den börjar med ett liggande kort, vänder kring fel
  axel, läser varken grepp eller var kortet vänds, och planens Rörelse och Beställs val är två skilda uppgifter) och
  `grund/RAPPORT.md` (vad gamla labbet har som det nya saknar, vad vyerna överlappar, förslaget till en meny och
  skisser). Ordningen han har satt: först beställa och granska filmer med gult och blått kort i den hopslagna vyn, med
  gamla labbets sätt att beskriva vändningen; sedan efterarbetet (kortens utseende, logga, prov av läppsynk) där Scen
  ligger i dag; gamla labbet är borttaget (Börja här, punkt 2). Skisserna har hans ja, och första steget är byggt (Börja här, punkt 2).

- **Givarna.** Jakobs egen order (`paow-giv-2-2-p4-02`, släp från 2.2 till plats 4, WAN 3) föll i båda tagningarna
  (3/5 och 2/5). Hans ord: "Oavsett om hon nyper eller släpar ut kortet, alltså om hon kommer från ankaret 2.1 eller 2.2,
  måste hon vrida över handleden. Jag har pratat med dig i flera timmar om det här, men det verkar inte fungera. Det
  måste bero på något konstigt i den prompt som skickas." Han hade rätt: mall 8 sade aldrig handleden, bad om ett lyft
  i ett släp och sade aldrig att kortet är slätt. **Mall 9** (`6421f0e`, `src/order-prompts.ts`; handboken §5) rättar
  de tre; omtagningen `paow-giv-2-2-p4-03` vände med handleden och handen förblev vänd, men kortet lyftes ändå ur skon
  (Prov `bestallning-slap-p4-mall9`, inte oberoende granskad). Underlaget: tillverkarnas manualer
  (`D:/dealer-scratch/tmp/giv-utredning/RAPPORT.md`) och Pamelas formel (`D:/dealer-scratch/tmp/pamela-formel/RAPPORT.md`,
  Prov `pamela-formel`: i nio av nio bra vändningar vrids hand och kort ihop som en nyckel kring långsidan och handen
  förblir vänd; WAN 3, 4 s, bara dit, kortet slätt i startbilden). Vändningen är besvarad: båda sätten gäller (Jakobs
  besked, "Kortets vändning"). Mall 9 står kvar tills provet nedan är läst.
- **Provet av beställningstexter** (Jakob: "Men jag vill nu du testar vilka av våra instruktioner som
  fungerar bäst. Ta det bästa från Pamela och det bästa från det vi har idag. I och med att vi redan har tillbakagången
  från respetive A3 så kanske vi bara kan producera några filmer som är själva utgiven. Du får fria händer att skriva om
  instruktionerna. Kanske om du vill lägga till en bild eller beskrivning för hur korten ska vara storleksmässigt
  med."): givar bara dit för Paow, ankare 2.1
  till P4.C1, tio tagningar, 820 krediter (`D:/dealer-scratch/tmp/giv-experiment/RAPPORT.md`, Prov `giv-experiment`).
  **Förlagefilmen gör jobbet, inte texten:** Kling 4 (1080p, 4 s) med Pamelas godkända giv
  `pamela-p4-c1-plan-deal-02` som förlagefilm vände kortet genom kantläget i fyra av fyra tagningar, med text A (Pamelas
  sätt) eller C (blandningen) lika; den oberoende granskaren släpper igenom tre av de fyra (4/5) och fäller den fjärde
  (kortet vrider sig på bordet utan fingrar). Ingen av sex WAN 3-tagningar utan förlagefilm håller (kortet 19–41 % för
  långt i handen i fyra, färgbyte utan vändning i en, två vändningar i en). Att rätta i nästa mall: handen släpper det
  lagda kortet och läggs platt igen i slutet, eftersom sista bilden inte slutar som förlagefilmen, och en ljus kant på
  1–1,5 bildpunkter syns på kortets tjocklek. Ingen instruktion om vit kant har någonsin skickats (alla 98 ordrar lästa).
  Hans svar i Beslut (`givprovet-forlagefilm`): "Ja, absolut. Det här skulle kunna vara en vridning, givet att dealern
  nu nyper upp kortet för att sedan vrida över det med en rörelse. Å andra sidan krävs det också en sådan här för när
  hon släpar ut ett kort, antar jag." Nästa mall och de två följdproven: Börja här, punkt 1. Föreslaget till honom,
  inte byggt: Beställ visar hur den
  valda kombinationen har gått förut och förväljer den som höll.
- **Nya händer** (hans ja i Beslut 2026-11-17: "starta upp nya filmer från "ankare 2.2 där hon har aningen indre händer
  och även taueringarna. […] men också får till rätt beställningsmetod"; hela anteckningen i `data/decisions.json`,
  `tatuerade-mindre-hander`). De nuvarande filmerna ligger kvar och en ny uppsättning byggs bredvid; händerna syns i
  varje film, så den tar över först när den är komplett. Att måla tatueringar i färdiga filmer har fallit två gånger
  (2 av 5). Första steget, keystonebilderna med tatuerade händer 10 % mindre och utan skuggan under underarmarna, har
  hans ja (Beslut 2026-11-17 kl. 20.13) och gäller sedan natten till 2026-11-18 på hans ord (Börja här), liksom ett nytt ankare
  1 gjort ur dem (`paow-vila-tatuerad`, Prov `paow-ankare-tatuerade-hander`, granskat 4/5; kända fel i överlämningen
  från trailersessionen). Händernas punkter för det nya ankaret är mätta men med avsikt inte införda i
  `data/dealer-standard.json`, som är bankens vilobild för alla dealers. Hans svar om ankaret: Börja här, punkt 5.
- **Trailern:** rollblad 4 (tatuerade händer i alla bilder) har hans ja 2026-11-17 kl. 19.40 ("Ja hennes 5-faldiga
  bilder:er är nu bra"). Trailersessionen gör trappans tagning som en ny film ur de bilderna, med dagens film som
  förlaga för rörelsen: tre tagningar, alla föll i granskningen (2/5, 2,5/5, 2/5; ryggtatueringen håller, men händerna
  är bara den första sekunden och ryggen är platt), 342 krediter. **Pausat på hans ord** samma kväll ("Om allt med
  videon är dåligt.. Låt mig titta, mne strunt i det och pausa det sålänge"): provet ligger i `trailer-noir-3`, inget
  beställs och inget byts i trailern tills han säger till. Fortsätter vägen måste också gränd-glimten och de tre
  scenerna efter trappan göras om (de har den gamla ryggtatueringen). Ingen har lyssnat på trailern. Filmen före
  spelet är `assets/films/intro/noir-3/film-2.mp4` (nytt namn, eftersom kopian svarar med ett dygns lagringstid; den
  förra ligger bredvid som `film-v4.mp4`).
- **Läpparna i realtid** (målet; Jakobs besked, "Läpparna"). Kvällens prov (`paow-realtid-mun` till `-4`, hela modellens
  mun förstorad) fick hans dom "Runt munnen ser det inte jättebra ut, men det är godkänt för nu. Hennes överläpp borde
  bli något större", och av storlekarna B, C, E och F valde han F. Samma kväll: munnen är "tillräckligt bra för att
  godkännas", men "området runt hennes mouth [är] fortfarande lite utdraget och ser överjusterat ut. Skulle det vara
  möjligt att få just de ytorna omkring hennes mouth att bli mindre animerade?" Talbanans svar är provet
  `paow-realtid-mun-5` (bara läpparna läggs in, storlek F kvar; huden runt är vilofilmens). Hans svar i Beslut:
  "Ändra": "Just när hon säger detta lägger jag insatser, tack, så ska hon förmodligen ha en lite mindre öppen mun. […]
  Utifrån hur hennes mun ser ut när den är stängd ska den max kunna gå upp så här, men den ska kunna gå upp lite mindre
  och hon ska visa mindre tänder. […] Nu ser det nästan lite överdrivet ut."; och i chatten att näsan inte ska påverkas
  och att området runt munnen får röra sig lite. Provet `paow-realtid-mun-6` (mindre utslag i vanligt tal, dagens som
  tak, hakan följer mjukt) har hans ja kl. 21.38. Den egna köraren går lokalt som en tjänst med modellerna laddade och
  inläggningen inbyggd (0 kr): 12–13 rutor per sekund i hela kedjan på hans RTX 3060 mot 24 för realtid, de första
  rutorna av en replik efter 1,3–2,5 s; `bbox_shift` ger inte större läppar (storleken kommer ur inläggningen).
  Nästa: munnen strömmad till spelet och provkvällen på podden (Börja här, punkt 4). Talbanans uppslagning, inte
  kontrollerad mot licenstexten: ansiktsmaskens vikt i MuseTalk (BiSeNet) är tränad på bilder för icke-kommersiell
  forskning och står i Scouts renderers lås; vår körare använder den inte; sagt till Jakob som en fråga för rendererns
  ägare. Scouts renderer har ett avsiktligt lås mot ändrade
  filer, som vi inte går förbi; talbanan bygger en egen körare av MuseTalk ur öppen källkod
  (`D:/dealer-scratch/tmp/tal/korare/`, licenserna läses först), och en provkväll på hans pod är godkänd till högst 5 USD
  när köraren går här. Planen: `D:/dealer-scratch/tmp/tal/realtid/PLAN.md`. Studions vy **Lipsync** (`6f97879`) visar
  grundbilderna, kedjan med format och skalor, inställningarna och proven ur `data/lipsync.json`.
- **Läpparna i spelet:** omläggningen med hennes egen underläpp och gipor (STABILT 16 och 17) är uttagen på hans dom.
  Receptet i `src/speech-plan.ts` är åter lyftet med ritad underläpp; måtten för underläppen och giporna (`sink`,
  `lens`, `corner`, `cornerMost`, `edge`) finns kvar som oanvända val med tester. Talbanans överlämning:
  `D:/dealer-scratch/tmp/tal/stabilt/LASMIG.md`. Ingen annan session lägger läppar. Repliker som munlappar ("Pröva" i
  Beslut) väntar tills läpparnas väg är avgjord. Hans idé 2026-11-17 kl. 17.20, obyggd: leendefilmen `paow-vila-03-01`
  som underlag, så att munnen hämtas ur hennes egen film och modellen bara bestämmer när och hur mycket.
- **Huvudagenten:** en ny runda till chefen när läpparna är inne (`alla.mjs`, blind granskning mot
  `chef-jakob-1-1x-v10`), kopian sedd som en ny besökare i telefonstorlek efter varje publicering, och `KLAR.txt`.

**Senare** (inget är beställt eller byggt): fler kort än två på en plats, split och dealerns tredje och fjärde kort
(förslaget: flyttade ritade kort på platsens film); retur till vila från en plats (nio saknas), nya försök på fingrarna
och vinkningen, en giv till plats 6 utan omvägen framför henne och ett byte direkt vid skon mellan 2.1 och 2.2
(`D:/dealer-scratch/tmp/huvudagent11/nya-filmer/plan-runda-via-2-2.md`); Jakobs önskemål om mer av höger arm, kaffe ur
en mugg som finns i bilden från början (gärna med Scout Gaming-loggan, påläggs efteråt), en animation på bordet,
marker som dealern tar och betalar, insamling av korten (hans lista 2026-11-11) och en andra spelarfigur, "Astrid", som
kommer in från sidan och satsar (2026-11-13).

## Jakobs besked som gäller

Ett besked per ämne, med det nyaste ordet och dess datum. Ett besked han har ersatt står i Git, inte här.

**Arbetet**

- **Den enda vägen** (2026-11-13, 07.45): "Se till att verkligen ha denna 'enda bästa väg' när jag vaknar imorgon"
  (`tools/dealer-line.md`). Samma natt: "Jag vill systematisera skapandet av dealer och kortflöden."
- **Normala regler, städning och dokumentation** (2026-11-13): "Gör bara det här så normalt som möjligt i repot, utan
  specialregler. Ha kontinuerlig städning och dokumentera gärna mer, det har varit ett misstag från min sida att inte
  dokumentera tillräckligt." 2026-11-14: "Du har fria privilegier och kör på. men se till att dokumentera coh städa och
  så vidare." 2026-11-17, efter frågan om projektet borde startas om (svaret var nej: navigeringen är felet): "Rensa
  gammalt otydligt skit i projektet gärna också."
- **Beslut och svar:** han talar med huvudagenten, som delegerar (2026-11-17); det som väntar på honom är ett kort i
  Beslut. Svaren är korta, i punktform, med procent och poäng (AGENTS). Filmer kan se utfrätta ut i hans flik (troligen
  hans skärm, inte filerna): lägg alltid en stillbild bredvid en film han ska döma.
- **Labbet först** (2026-11-11): prov och effekter hör hemma i labbets sidor; spelet (`game.html`) är ett mellansteg mot
  Scout och får bara det han har godkänt i labbet.
- **Ett labb** (2026-11-17, kväll). "Angående det gamla och nya labbet skulle jag vilja att du lyfter över relevanta
  delar från det gamla labbet till det nya labbet och raderar allt som har med det gamla labbet att göra för att undvika
  förvirring." och "Dessutom skulle jag vilja att det som nu heter placering på något sätt bakas ihop med det som är
  beställ och eventuellt fler av dessa sidomenyer, så att vi får en grund för hur hela det nya labbet ska vara." I det
  nya labbet ska en skapad film kunna jämföras med sina instruktioner och referenser ("visuella, om json skickas, ock
  skrivna"). Efterarbetet hålls för sig: "Det här vill jag att vi behandlar separat från hur vi hanterar filmerna,
  eftersom filmerna är det vi först måste få rätt", och han föreslår att det läggs där Runda och Scen ligger ("Kan vi
  också separera att själva spelet ritar saker. Utan att detta görs i ett mellansteg/efterlabborering från råmaterial
  till färdigt material - fast som är tillordnat kanske just ett företag som önskar sin företagsloggo eller liknande"),
  med prov av läppsynk under samma del. Vilket kort det är bestäms när rundan spelas, så valören ritas då; hur korten
  ser ut bestäms i efterarbetet (huvudagentens svar, som han inte har sagt emot). Om det nya Placering: "Nu ser allt
  mycket bättre ut angående placeringen i det nya." Skisserna (Prov `labbets-grund`: Bordet med fyra steg, Efterarbete
  för sig) har hans ja i Beslut kl. 20.22, "Ja bygg men med anmärkning": "angående det som är till för att beskriva det
  som ska gå till runway, så ska bara instruktioner som faktist ska komma med till runway - finnas som är tänmkt att
  beskriva just detta, så att inte olika beskrivningar i nya labbet skapas som finns bara för att beskriva för
  användaren saker som ändå inte kommer komma med till runway", och om skons kort i labbets bild: "Den gulaktiga
  kortsiluetten är cirka 50 grader för tiltat nedåt från ovansidan och ska vändas innot (så man ser mindre) […] Jämför
  bara mot kortet i en bild från en video eller bild". Kortets efterarbete görs i förväg per film, inte av spelet medan
  filmen spelas: "Det är bättre att vi gör detta i en post- eller efterkonstruktion. […] om det behövs, ta ruta för
  ruta och måla ut ett kort som ser riktigt bra ut", med det ritade kortet "något procent större än kortet". Kl. 21.46,
  med en bild av Placering: "Jag vill att vi ska ordna en bättre vy för det nya labbet. Vi ska radera det gamla labbet
  men se till att behålla det som är bra från det. […] Eftersom vi har en stillbild under placering, och att placering
  ska bli det nya labbet helt och hållet, borde det inkludera andra element, som scenen med nyvalet till vänster. Scen
  och placering bör ha samma typ av vy, och på högersidan ska man kunna ändra och laborera med detta. Detta ska också
  vara underlaget för beställning av nya filmer. Man ska kunna se vilket av filmerna man beställer, eller om man kan
  kombinera och beställa flera filmer. En specifik sak jag vill lösa är vyn för zoomning. Eftersom detta är en
  stillbild blir korten stela och har olika format, och framförallt är skons kort alldeles för stort." och "Se till att
  gammalt skit tar bort också och att strukturen blir tydlig i projektet!" Huvudagentens läsning, som han inte har
  bekräftat: en vy (Bordet) med en ram, där bilden är antingen kortplanen eller den levande 3D-scenen och allt ändras
  i högerspalten; beställningen är en lista av filmer i samma vy; gamla labbet tas bort nu. Om skons kort: se Kända brister, "Kortens storlek och
  perspektiv" (det mesta av skillnaden ligger i planen, inte i skon). Kl. 21.58, om menyn: "Inte 3D
  leder bara till greenscreenen, så den borde heta något annat"; "Spela i `casino` bör rimligtvis vara samma som i
  `casino`, alltså som det är i `runtime`"; "Den vänstra knappen där det står beställ ska också ingå i den
  huvudsakliga menyn som nu till stor del handlar om knappen scen. Detsamma gäller knappen placering."; "Karta och
  primära ska bli en och samma typ av sida, så att man kan följa nodträdet och se vilka som är primära och sekundära
  klipp och hur de sekundära klippen används […] vi ska högst ha några stycken videor för respektive"; "prov och
  granska […] slås ihop till en knapp"; den stora scenen "ska ha en annan knapp på sin sida där det står 3D, inte 3D,
  spela i `casino` och så vidare. Den knappen ska heta efterarbete, där till exempel kort eller marker kan ligga. Här
  kan man efterarbeta utifrån videon och efter att man lagt på bakgrund och bord kan man lägga på overlay av hur
  korten och markerna ska se ut."; om läppsynken att det nya sättet (på hans dator eller på hans RunPod) "ska
  dokumenteras så att vi vid beställning av nya videor eller arbete med `lipsync` förstår och kan ställa in vad som
  stämmer och inte stämmer för just den dealern", under Lipsync i menyn; om rundan: "Varför finns "Runda" ens som
  förval med 3 alternativ, varför ska mkan tex inte få lägga in egna vägar utifrån vilka noder som finns"; och "var
  aggressiv med att rensa upp och fixa i ordning nu". **Menyn som byggs** (huvudagentens läsning): Bordet (lägena
  Kortplan, Beställ, Scen, Råfilm och Efterarbete; Spela i Casino öppnar det Casino öppnar) · Karta (med Primära) ·
  Granska (med Prov) · Material · Lipsync · Casino, med Beslut och Ordlista i foten; rundan byggs av de noder som finns.
- **Kortbanan ska stämma med filmerna** (2026-11-17, "VIKTIGT"): det som används som instruktion eller material för
  kortets vändning ("kortbana" i Rörelse) "måste stämma med hur rörelserna är i antingen filmen om det görs postumt
  eller som det är tänkt att vara utifrån om dealern släpar eller nyper kortet och sedan öppnar upp det till själva
  spelaren. Nu så tror jag korten vrids aningen onaturligt och felaktigt från hur kortet faktist är ställt som
  utgångspossition."
- **Ordlistan och städningen** (2026-11-17): "Finns vår ordlista som är ouppdaterad eller pekar på fel saker utifrån hur
  jag använder ord - se till att en opus 5.5 extra hög fixar det. Samt en anna opus 5.5 som får städa och radera skit
  som bara förvirrar."

**Domar, beställningar och pengar**

- **Domar åt honom, och ingen kö** (2026-11-13): "jag måste sova och du får granska och godkänna alla klipp", och kl.
  15.50, på väg ut: "jag vill nu för jag ska iväg att du godkänner allt videomaterial som innehåller de där kriterierna
  så vi får en roligare grundloop i idle/ankjare 1" och "Med andra ord vill jag inte se en sån här lista när jag är
  tillbaka!". Huvudagenten och en oberoende granskare
  dömer det som annars skulle vänta (`node tools/review-put.ts`), märkt som inte hans och ersatt av hans eget beslut; en
  tagning han själv har dömt rörs aldrig (AGENTS). **Primär** väljer bara han.
- **Betald generering** (2026-11-13): "Kan vi nu göra så att du beställer lämpliga filmer automatiskt utan mitt
  godkännande, för det är bara jobbigt för mig att göra allt detta med att godkänna!" Huvudagenten godkänner på hans
  uppdrag (`approval.by: "huvudagent"`; hans eget klick står som `"jakob"`) inom `data/order-policy.json`. Ramen, som
  han kan ändra: allt genom Beställ och handboken `tools/film-prompting.md`; en ändring och en tagning per metodprov, två
  tagningar per klipp när metoden är vald; varje omgång oberoende granskad innan nästa bygger på den; kostnaden berättas
  efter varje omgång. Hans är domarna i Granska och Material och allt utanför filmbeställning (publicering, Scout).
- **Budgeten** (2026-11-13 cirka 15.13): "Nej du får obegränsat i budget!", och kl. 16.37 "inga tak idag". Dagstaket och
  golvet är borttagna i praktiken. 2026-11-17: "Vi ska inte ha någon limit på 400 krediter.. Höjj till 2k åtminstonde.";
  taket per beställning är 2 000 (`data/order-policy.json`) och står som skydd mot ett misstag. Saldot sätter gränsen tills han
  fyller på, och påfyllningen gör bara han.
- **Klicket är kön** (2026-11-13): "jag vill ju kunna klicka bara i stället för att säga lägg kön, så görs det per
  automatik." Huvudagenten startar beställningsagenten (`tools/order-clerk.md`) så snart en godkänd order har en
  tagning som inte är lagd (Kända brister, "Kön").
- **Två tagningar per klipp**, en tredje bara om båda faller, och oberoende rutgranskning i full upplösning före hans
  dom (om Paow 2026-11-12: "Kör på, men kontrollerat, med det som faktiskt fungerar"). Underlag till nya filmer är bara
  tagningar han har godkänt rakt av, i bankens format; Astrids och Kevins stående material används inte.
- **En yta för beställning** (2026-11-17): "Vart är min 'labb'-yta där jag kan se en typ avatar/siluett och sedan kort
  och bord, jag kan ställa in allt som jag vill, sedan ska jag kunna lägga en beställning för en film. Tex 'A2.2 till
  P3C2 och tillbaka till A2.2'?" Ny beställning öppnar sedan samma dag på bilden (`studio/components/order/Stage.tsx`);
  nästa steg är den hopslagna vyn (Ett labb, ovan).

**Dealern**

- **Paow:** "Vi pausar Pamela när vi är klara. Sedan går vi vidare med Paow." och om Paows utseende "jag vill ha de
  yngre och nättare bilderna" (2026-11-12). Om Pamelas filmer på sajten (2026-11-17): "Jag vill ha kvar dem."
- **Visningen:** Paow ska kunna spela en hel runda; spelets nödlösningar (ersättare där en film saknas, utgången
  baklänges) ger vika när banken har egna filmer (`src/game-director.ts`).
- **Förvalen han sade ja till** (2026-11-13: "Jag håller med om allt annat du nämnde, så jag kan acceptera det rakt
  av"): ljuset utjämnat mellan filmer, liv i överkroppen och kopparna i relingen (de två sista när de är sedda rena),
  plats 6 från ankare 2.2, kandidaten för ankare 2.2 gäller, och en runda ska kunna gå via 2.2.
- **Mer rörelse när hon delar ut** (2026-11-13): "jag vill i allmänhet att paow rör sin kropp och huvud och SIN
  högerarm aningen mer när HENNES vänsterarm dealar." Bara mall 7 skrev det, och då gick kortet fel i 15 av 18 tagningar
  (`src/order-prompts.ts`); hur hon rör sig utan att det kostar kortet är öppet (handboken §5).
- **Returen efter en tvåhandsgiv** (2026-11-13): "OM hon har någon deal där hon använder sin vänster och högerarm så
  måste retreat/tillbakagången vara annorlunda då den andra armen är den som är utsträckt." I texten `SAY.backPass`, i
  rundan en retur med den hand som är ute (`motion.releaseHand`).
- **Farten** (2026-11-13 kl. 19.13): "Dessutom har jag tyvärr bett om att snabba upp vissa typer av rörelser, kanske
  till och med vissa `talk clips`, vilket har resulterat i att hon är jättesnabb i vissa lägen och ser konstig ut."
  `filmTempo` är 1 och en vilogest spelas klart som filmad (`IDLE_RULE.exitRate` 1); reglaget Givarnas tempo står kvar.
- **Vilans slinga** (2026-11-14): "Flera animationer kommer sedan inte in automatiskt i "grundloopen" idle eller vad vi
  nu kallar det." och "Den där hon dricker från undersidan av bortet är bra, och säkert andrasakeer som ska in i
  grundloopen" (`d4137cb`; SYSTEM, Vilan).
- **Tatueringar och händer:** ja till tatuerade och mindre händer, som en ny uppsättning bredvid (Beslut 2026-11-17;
  Nästa steg). Fotot får skickas till bildmodellen som förlaga ("Punkt tre, ja, foton får skickas.", 2026-11-17); det
  ligger i `private/referenser/` och läggs aldrig i Git, i ett prov eller på sajten.
- **Läpparna** (2026-11-17): "Jag vill ju kunna använda mig av min runpod framgent för att skapa realtidslipsynk. Det är
  det som är huvudmålet. hennes talade replikklipp är av mindre relevans, även fast dessa också ska sitta såklart." Om
  Scouts lås: "Jag har ju min egna runpod och så vidare på ett eget konto ju! DU kan absolut skapa en egen grejj lokalt
  vi kanske sedan kan lägga upp på min pod om du vill?" Storleken: "ser nog F bäst ut givet att hon faktist säger något
  där hon rör munnen mycket." Runway-modellen (Seedance) är avförd: den går inte i realtid. Mungiporna är inte lösta i
  hans ögon ("Hon får lixom lite som typ clown-mungipor.", 2026-11-14; "måste som sagt med", 2026-11-17), och den lyfta
  överläppen står sedan "Denna lipsync är typ sämre, bara underläppen som pratar" (2026-11-13). Granskarna föredrog
  omläggningen 2026-11-17 i 30 av 30 och han kallade den "värre än förut": före nästa byte av läppar visas en jämförelse
  i spelets storlek och i rörelse, och hans ja krävs. Hans godkända `paow-tal-blackjack-sv-04` rörs inte.

**Kortet**

- **En linje för korten** (2026-11-13 kl. 15.47): "Angående förvalda och icke-förvalda kort, är jag osäker på vad som
  ska gälla. Jag vill bara att det ska bli en linje och att allt ska anpassas till en standard som passar med det som
  för närvarande finns i systemet, om det ens behövs. Jag har svårt att förstå vad som gäller för korten." Huvudagenten
  bestämmer linjen och visar resultatet, inte valen: ritade kort hela vägen, en storlek, en brytare i spelet (Ritade
  kort i Miljö; SYSTEM, "Ritade kort"). Kortmattan ur filmens eget kort: "ja som val i labbet, nej för spelet".
- **Korten ser inte bra ut än** (2026-11-14 kl. 15.14): "Ang spelkorten så ser de inte skitbra ut heller än så länge."
  Underlägget är förvalet sedan samma timme (`662b271`); kortbyggaren arbetar med det som är kvar (Kända brister).
- **Kortets sidor i labbet** (Beslut 2026-11-17): "Kortryggen, den del av kortet som inte visas, ska vara gul, medan den
  sida där kortet visas ska vara blå. Detta kommer att ske via en overlay eller något annat som vi kommer överens om,
  vilket hör till efterarbetet. […] Allt ska ju gjöras sen gällande fram och baksida", och samma kväll att korten ska
  vara utan vit kant, "bara … blåa, med rundade kanter". Bordet och Ny beställnings bild visar därför släta gula och blå kort (filmernas egna färger, `CARD_COLOUR` i `src/placement-model.ts`); det tryckta kortet med SG är ett val märkt som
  efterarbete. Vilken variant som visas avgör huvudagenten ("Du får ta det sista beslutet").
- **Kortets vändning** (2026-11-17, cirka kl. 21): "Båda dessa två sätt är giltiga som du ger exempl på är rimliga och
  gilltiga. Altså både vrida som en nyckel samt den andra. Huvudsaken är att rätt sida kommer upp mot spelaren och att
  korten har symetriskt samma storkel som de rimligen borde ha, och/eller som välj si labbet och att det är gult till
  blått som görs." Båda vändningarna på vägen gäller: handleden vrids över (`FREE`, förvalet) och nyckeln kring
  långsidan som Pamela (`LONG_EDGE`). I samma meddelande: "Vad som får mig att böli så tveksam till det mesta i övrgt är
  den vita rand runtom korten som är en gammal instruktion jag givit - det rä därför jag undrar om kanske gammla
  instruktioner kommer med?"
- **Givens sex steg från ankare 2.1** (2026-11-13, hans skiss, inte underlag i repot): Nyp, Dra (ned på filten,
  baksidan upp), För fram (lågt längs filten, inte vänt i luften), Vrid (kortet reser sig på långsidan), Vänd upp, Lägg.
  Det är valet Vänd vid platsen (`AT_PLACE`), som planen väljer per kort i Bordets Kortplan; förvalet för en ny giv är
  handleden på vägen (`defaultFlip` i `src/order-model.ts`).
- **Nypet** (2026-11-13): i ankare 2.1 håller tumme och pekfinger i själva det gula kortet, inte i skons kant ("hon
  nyper tag i skons kant mer"); kortet får gärna vikas lite. Det står i texten, syns i posebilden och prövas i
  granskningen.
- **Kortet ur skon** (2026-11-12): "Ett kort ska tas som det ser ut i skon (inte den konstiga bild som har ett kort som
  är kort och tjockt). Sedan ska handen vrida kortet." **Skon** är den svarta behållaren; av bankens två bilder av den
  används för Paow den med kortet i en öppning snett framtill, i alla lägen, om han inte säger annat.
- **Ett kortformat:** kortet på plats 4 är standard och allt annat anpassar sig ("Storleken är inte problemet, utan att
  det finns olika format"; SYSTEM). **En film per plats** (2026-11-11): platsens andra kort spelar första kortets filmer
  med det ritade kortet flyttat.
- **Referenser:** V6 är i hans ögon den bästa filmen av en hel giv, "A2.1 - P4C1 - A2.1 - P4C2 - A2.1" (handen vänds inte
  vid vändningen, och kortet byter hand), och dess kortstorlek kallar han "väldigt bra" (Prov `v6-referens`). Plats 4 i
  3D-scenen (`pamela-idle-ready-entry-01`, `pamela-p4-c1-plan-deal-02`, `pamela-p4-c1-plan-return-idle-01`): "väldigt
  bra". Betyg 2026-11-12: P4.C1 rått original 4,5/5, V6 4/5, vita banken 3/5, gul/blå sekvens 2,5/5, READY2 "konstiga".

**Scenen, spelet och kopian**

- **Naturligt utseende:** ljus ska komma ur rummet (panoramat som ljuskälla, skuggor i världens koordinater), inte målade
  sken. Duken han vill ha som bordets yta är `assets/scene/table.png`; 3D-filten ritar trycket med kod.
- **3D-labbet:** "fantastiskt". Bordsbenen får vara så länge de inte kostar minne; markerbrädet är reserv, avstängt.
  Bordet från backad kamera: "fruktansvärt fult" (därför underredet Två ben, obedömt). Monacos bakgrund är bra som den
  är (Beslut 2026-11-17).
- **Spelet på telefon** (2026-11-14): markeröverlägget ska göras "smartare och mindre så det inte täckeer bla vart marker
  ska in osv", "..men liggande också ser jag." Om den nya konsolen (2026-11-17): "Angående mobilversionen ser allt
  bättre ut", och filmen före spelet ligger i mitten på en liggande telefon på hans ord samma dag.
- **Kopian till chefen** (2026-11-13): "Sedan valet att spela i casinot eller komma till studio/labbet … Eller bara samma
  radda av alternativ som finns på vänsterspalten". Utan lösenord (2026-11-14): "Se till att den inte är
  lösenordsskyddad." Boten kräver fortfarande lösenordet, eftersom den kostar per fråga; han svarade "Ja" i Beslut på
  att öppna den, med frågan "Vilkne är botten?". Det är förklarat, och den öppnas först när han säger det igen.
- **Trailrar** hålls utanför kopian (2026-11-12), utom filmen före spelet bakom `/trailer` (2026-11-13: "så att man
  övergår till henne i URL:en på vercel"); trailerproven i Prov är spärrade (`data/studio-release.json`).
- **Vercel:** kopian och botens anrop via AI Gateway ligger i hans eget team, där krediterna finns (2026-11-12; DRIFT).
  Kopian publiceras ur `main` efter varje färdig del på hans stående ord (push och publicering, så att det syns på
  Vercel); annan deploy, mediauppladdning, databasändring och Scout bara på hans uttryckliga ord (AGENTS).
  **Görans material** används inte (SYSTEM, "Återbruk och införande").

## Kända brister

- **Korten** (2026-11-13: "Det lixom kletar fast sig på korten", "linjer flyger dit och dit"). Spelet ritar kortet hela
  vägen med underlägget under (`UNDER` i `src/card-overlay.ts`; `cardBack=film&cardFace=film` visar filmens färger) och
  kortens fjärde steg (`33b164a`: hålkortet följer filmens kort under handen, skons fönster står mörkt), blint granskat
  3,75/5. Kvar: hålkortet dolt under hennes fingertoppar cirka 0,6 s innan det glider på plats, en svag gulaktig kant i
  kortets högra ände, en tunn linje medan kortet står på kant och en taggig fingerkant. Pålägget fick 3/5 och är inte i
  spelet; `kort=liggande` finns kvar för hans öga; reglage för `cardBack` och `cardFace` i Bordets Scen finns inte. Stegen:
  `D:/dealer-scratch/tmp/kortbyggare/`, utredningen `D:/dealer-scratch/tmp/kortutredning/RAPPORT.md`.
- **Kortens storlek och perspektiv** (3D-banans mätning 2026-11-17, ren räkning på Paows film och ankare;
  `D:/dealer-scratch/tmp/dealer-3d/kalibrering.txt`, talen i grenen `dealer-3d`, `dealer3d/src/world.ts`). Planens kort
  och dealerns kropp hör till två linser: planens avsmalning 0,87 hör till en brännvidd på cirka 800 bildpunkter, där
  hon vore dubbelt så stor som en människa; linsen som ger henne verklig storlek har brännvidd cirka 2 334 (bildvinkel
  28°), och under den smalnar ett verkligt kort bara till 0,956. Mot ett verkligt kort är planens kort 0,97 vid P4,
  1,04 vid P3 och P5, 1,11 vid P2 och P6, 1,19 vid P1 och P7 och **1,34 gånger för små vid dealern**. Kortet som står i
  skons fönster är i stort sett rätt (51 × 92 bildpunkter på ruta 120 mot 49 × 98 för ett verkligt kort på samma ställe,
  0,94); bara i nypet (ankare 2.1) är det 8–13 % för långt. Linsen står som en fristående funktion med test på grenen
  `dealer-3d` (`9ef55c9`, `dealer3d/src/table-lens.ts`: `realCardQuad`, `shoeCardQuad`, `TABLE_LENS`) och lyfts ordagrant
  in som `src/table-lens.ts`. Det Jakob ser som att skons kort är dubbelt så stort kommer alltså ur planens
  krympning nära dealern, inte ur skon. Spelets liggande kort läser aldrig planens storlek: det är
  kontraktets kort gånger `cardScale` 1,2, och planen ger bara platsen (`restingQuad` i `src/card-overlay.ts`), så
  planens bredd och höjd ändrar inget i spelet (en utomstående granskares fynd, bekräftat i koden). Tre mått för samma
  kort (planen, spelets kontrakt, filmens lins) ska bli ett: bilden ligger i Prov `dealer-3d-kamera`, och frågan står
  som kort i Beslut (`kortplanen-verkligt-perspektiv`): ska kortplanen ritas med verkligt perspektiv (P4 oförändrad,
  korten närmare dealern större)? Inget ankare krymps för skons skull. Osäkert i mätningen: axlar, pupiller och skons fot är lästa för ögat (±10
  bildpunkter); brännvidd 2 000–2 300 ger samma slutsatser.
- **Orden för kortets sidor** är öppna. Jakob 2026-11-13: "Baksida kan betyda olika saker, som baksidan på ett kort, men
  det kan också referera till undersidan." Mall 9 säger slätt kort med "back" och "face" (`PLAIN_CARD`).
- **Kortbanan** är omgjord efter filmerna 2026-11-17 (`ccd9c52`, Prov `kortbanan-efter-filmerna`; Jakob 2026-11-12:
  "utgångspunkten skulle vara att kortet låg på bredsida, vilket är fel", och 2026-11-17 att den ska stämma med filmerna).
  Det som ännu skiljer: den ritade handen pekar ut från kortets ände och inte från hennes arm, kortet vänds något högre i
  bilden än i filmen, och vid platsen rullas kortet på filten som ordertexten säger, medan Paows film från ankare 2.2 lyfter
  och vänder det i luften vid platsen. Ingen film visar vändningen med handflatan uppåt (`FREE`) att rita efter.
- **Kortet i handen** (Prov `kort-bojning-glans`, 2026-11-17): böjning och glans är inte felet (kanten flyttar sig inte en
  bildpunkt med böjningen; glansen syns bara på den mörka baksidan). Med baksidan mot kameran sitter det ritade kortet
  större och längre upp till höger än filmens gula kort, och kanten mot hennes ärm är ojämn med ljusa prickar. Hör till
  efterarbetet, efter filmerna.
- **Det bandet inte kan än** (`tools/dealer-line.md`). Enligt `STEPS` i `src/order-model.ts` är ankare 2.1 och 2.2 steg
  i Beställ, men landningsbild, keystone och ankare 1 är det inte, och ett tredje eller fjärde kort går inte att
  beställa. Metoden per steg: `data/order-methods.json`.
- **Produktionslistan:** en tagning som beställaren mätte bort ligger kvar på MÄTT med domen i kvittots `review`, och
  listan räknar ordern som på väg tills varje tagning är GRANSKAD eller INFÖRD (`IN_FLIGHT` i `tools/produce.ts`).
  Rättningen: en tagning med dom i kvittot räknas som avslutad.
- **Kön** läggs bara när en huvudagentchatt är öppen (vakten `D:/dealer-scratch/tmp/huvudagent11/look/vakta-kon.mjs`).
- **Paows landningsbild** `paow-landning-p4-giv-t2` står som `gäller` men visar handryggen och duger inte för en
  vändning.
- **Skuggan under armarna** sitter i grundbilden (armbågarna på ett bord bakom kanten, 40–44 px ovanför rad 831,5); den
  rättas med nya ankare och filmer. **Paow ser lite smal ut:** Pamelas kroppsbredd under ett huvud 8,7 % högre.
- **Läpparna:** banken har repliker lagda med två recept (docs/TAL.md, "Kvaliteten"). Vid stora öppningar står
  överläppen högst nio till tolv rutor medan käken rör sig, och tysta pauser talas med öppen mun; munnen är rendererns
  (matt, mjukare underläpp, strimmiga tänder). Ingen granskare kan höra; `namn` hörs som "Pau".
- **Rösten:** spelet väljer talfilmerna med rösten Paow (`data/speech.json`); 25 med rösten Jessica spelas inte. Rösten
  ligger i Kevins ElevenLabs-konto; registret namnger nyckelraden, aldrig nyckeln (docs/TAL.md, "Rösten").
- **Hennes röst på en iPhone är byggd men inte prövad på en telefon.** Safari låter en film höras bara när den startas i
  en beröring; en nekad talfilm spelas då ljudlöst och rösten sägs av sidans eget ljud, satt mot filmens rutor
  (`5ee46d2`, `3de51b5`; docs/TAL.md, "Rösten på en telefon"). Antaget, inte prövat: att Safari nekar med just det
  felet och avkodar ljudspåret. Hon hörs med ringsignalen av (`playback` i `src/scene3d-view.ts`). Första gången en
  replik sägs kommer rösten in sent; en liten ljudfil bredvid varje talfilm tar bort det när grunden har hållit.
- **Det svarta spelet på hans telefon** (2026-11-14) är löst enligt honom (Beslut 2026-11-17: "Fungerar"). Kommer det
  tillbaka: be om en skärmbild av `/trailer?diagnos=1` (DRIFT, "Ett fel som bara syns på en telefon").
- **Hopp mellan filmer** (2026-11-14: "och att vissa olika hopp görs. inte farlgigt, men lite"). Filmerna passar
  varandra (0 bildpunkter i 98 % av 3 474 byten); det som syns är bilden som står när nästa film inte är färdig. Vila
  efter vila och efter replik är rättade (`restFilm` i `src/game-film.ts`); kvar är vila efter en retur (83 ms), och
  returerna slutar 2–3 bildpunkter från vilan och 4–9 nivåer ljusare. Förslag, inte infört: en retur spelar till sin
  sista ruta (`IDLE_RULE`, `resolveRound` i `src/clip-graph.ts`). Verktygen: `D:/dealer-scratch/tmp/levande-objekt/ljus/`
  (`skarv-prov.mjs`, `skarv-vila.mjs`, `retur-slut.mjs`, `hopp/`); mätningarna efter rättningen i
  `D:/dealer-scratch/tmp/huvudagent11/hopp-efter/`.
- **Rummets film** `monaco-liv-2.mp4` har ett litet steg i varje nyckelruta (var 8,3 s, 0,57 nivåer av 255); skattat
  osynligt. Kodningen utan nyckelrutor: `D:/dealer-scratch/tmp/levande-objekt/rumsliv/kod-prov-2.sh`.
- **Filmen före spelet** (`/trailer`): efter trycket står startbilden still medan filmen hämtas (cirka 0,7–0,8 s) och
  sidan slutar rita i 0,35–0,57 s (orsaken är inte funnen). På en stående telefon syns filmens övre kant som en svag
  linje över hennes hjässa. Filmen spelas in på nytt när spelets vilobild ändras (SYSTEM, "En film före spelet").
- **Kling 4:s färger** läses som BT.601 fast filmen är BT.709-märkt, så att efterarbetet ger samma bild som de godkända
  tagningarna; inte avgjort (`tools/film-after.ts`).
- **Testerna utan FFmpeg:** elva hoppas över där FFmpeg saknas, tre i `tools/order-images.test.ts` kräver bankens filmer
  och ett i `tools/card-overlay.test.ts` kortspåren; GitHubs kontroll kör dem inte, den här datorn gör det.
- **Pamela och 2D:** det platta överlägget läcker cirka 30 bildpunkter i fyra rutor i två av hennes givar
  (`node tools/card-coverage.ts --all`), och hennes första dealerkort är 1,76 gånger för stort.
- **Spelet:** 3D-skon klipper handen i givarna; helkroppsfilmerna har ingen sko; utfallsskyltarna ligger över
  insatsbrickorna när alla sju platser spelar; dubbling och försäkring är inte sedda (SYSTEM, "Spelet").
- **3D-scenens hemvy** stämmer inte med `assets/proofs/bakgrund-3d-referens/` (medel 0,96, max 168), eftersom filtens
  tryck har flyttat med planen. Referensen tas om med Jakobs ögon och ändras inte för att dölja avvikelsen.
- **Kortplan:** korten ritas släta gula och blå, utan tryckt kort. Inte prövat: byte av vy med osparade
  ändringar och knappen för att läsa in en fil.

## Arbetsyta

- **`main` är den enda grenen.** Etapper `jakob-N`: DRIFT, "Git och kontroller".
- **Studion:** `http://127.0.0.1:4319/studio/` (`/` och `/lab.html` leder dit, och den öppnar på Bordet); bredvid den sidorna `/scene3d.html`,
  `/sound.html` och `/props.html` i `pages/`.
  Visa en sida med `node tools/preview.ts --open "<sida>"` (DRIFT); lösa sidor under `D:/dealer-scratch` visas inte för
  Jakob.
- **`placements/default.json` är Jakobs plan** (incheckad på hans ja 2026-11-12, `7a158d6`); bara Bordet skriver den: Kortplan med Spara i kortplanen, och Efterarbete med kortens böjning och glans (Spara till planen).
  På hans ord 2026-11-11: alla kort ×1,20 (P4 86,6 × 71,8 px), perspektiv 87 %, vridning 0°, platserna speglade kring
  bildens mitt, dealerns två kort centrerade.
- **Den låsta kopian** (åt hans chef): `https://dealer-lake.vercel.app` och `https://dealer-studio-one.vercel.app`, öppen
  för läsning sedan 2026-11-14 (`DEALER_OPPEN=allt`); boten och önskemålslådan kräver lösenordet (ordet skrivs inte ut här: det är `DEALER_LOSEN` i Vercel-projektet).
  `/casino` leder till spelet ensamt (eget lösenord, ordet står inte i repot), `/trailer` till spelet med filmen före.
  Publicera: `DEALER_OPPEN_PROV=allt DEALER_LOSEN_PROV=<ordet> DEALER_LOSEN_SPEL_PROV=<spelets ord> node
  tools/publish-studio.ts --kor` (utan `DEALER_OPPEN_PROV=allt` väntar kontrollen sig lösenordssidan och går röd; DRIFT,
  "Den låsta kopian på nätet"). Sedan frågas kopian som en ny besökare med `kopian-forval.mjs`,
  `kopian-forsta-dealer.mjs`, `kopian-casino.mjs` och `spar-pa-kopian.mjs` i `D:/dealer-scratch/tmp/huvudagent11/look/`.
- **Publika sajten** från 2026-11-11 visar 22 filmer från `b65fd9b` (`evidence/public-release.json`).
- **Media** ligger i `assets/` med `receipt.json` och roll i `data/media-roles.json`; på D: bara slask, arkiv och
  säkerhetskopior (DRIFT).
- **Arbetsmappar på slaskdisken:** huvudagentens verktyg `D:/dealer-scratch/tmp/huvudagent11/look/` (rutorna webbläsaren
  ritar, kopians kontroller, `vad-hon-sager.mjs`, `ko-nu.mjs`) och `chefsfilm/inspelare/` (`node alla.mjs <namn>`: en
  hel runda); Paow 2026-11-12 `D:/dealer-scratch/tmp/paow/`; Pamela-filmen `D:/dealer-scratch/tmp/reel/`; scenbanan
  `D:/dealer-scratch/tmp/levande-objekt/`; talet `D:/dealer-scratch/tmp/tal/`; givarnas prov
  `D:/dealer-scratch/tmp/giv-experiment/`; städningen `D:/dealer-scratch/tmp/stadning/`.
- Scoutgamings huvudagent har fått besked: inget härifrån är infört där, och insatsrutor bör vara data per bord och
  filmbank.
- **Verifiering:** Node 24.21.0; `npm test` före varje push. Film granskas ruta för ruta av en oberoende granskare innan
  Jakob dömer (`tools/film-review.md`). Spelet och 3D-scenen prövas i headless Chrome mot 4319, en körning i taget; den
  som startar fönstret stänger det.

## Före avslut av en session

1. Vänta in eller stoppa egna underagenter. Inget ocommittat får ligga kvar utom `placements/default.json`.
2. `npm test`, uttrycklig staging av egna filer, commit, `npm run check`, push (medan andra skriver i trädet:
   `node tools/push-clean.ts`, DRIFT), och läs GitHub-kontrollens resultat.
3. Sätt etapptagg `jakob-N` om Jakob har sett läget, och pusha taggen (DRIFT).
4. Uppdatera denna fil på plats (läget per dealer: `node tools/produce.ts paow`); det som väntar på Jakob blir ett kort i
   Beslut. Ingen dagbok; ersatt läge stryks.
5. Städa `D:/dealer-scratch` med `npm run stada`, läs rapporten och kör `npm run stada -- --kor` (DRIFT).
6. Labbservern får stå kvar; stoppa den bara med `STOPP.cmd` eller `node tools/preview.ts --stop`.
