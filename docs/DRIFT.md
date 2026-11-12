# Drift, anslutningar och återbruk

Rutiner och anslutningar. Genomgånget 2026-11-12; avsnitten om arkiv, publicering och molnmiljö kontrollerades 2026-11-10. Aktuell arbetsstatus och ägare står i HANDOFF, beslut per film i `motions/`.

## Identitet och ansvar

| Del | Kanonisk plats / identitet |
| --- | --- |
| Arbetsyta | `C:/Users/jakem/dev/super-feature-sg/dealer` |
| Publikt GitHub | `Jakeminator123/dealer`, origin `https://github.com/Jakeminator123/dealer.git` |
| Slutmål | `C:/Users/jakem/dev/scoutgaming`, remote `git@github.com:Jakeminator123/scoutgaming.git` |
| Gammal läsreferens | `D:/dealer-archive/snyggare-dealer`; fullständigt verifierat arkiv, tidigare C:/Users/jakem/dev/super-feature-sg/snyggare-dealer |
| Ny slask | `D:/dealer-scratch/tmp`, `renders`, `review` |
| Befintligt arkiv | `D:/dealerlab-archive/snyggare-dealer`; tidigare delarkiv, inte bevis på full projektflytt |

Huvudagenten äger commits, taggar, push och styrdokumenten; vem det är och vem som äger vilka filer står i HANDOFF. En skribent per fil; samordna index och commit.

Jakobs uppdrag 2026-11-10 godkänner publikt GitHub-upplägg, anslutningskontroller, nödvändig lokal env-återanvändning och D:-slask. Deploy, Scout-integration, databasändringar och betald generering är separata uppdrag. GitHub-repot är källförvaring, inte en publicerad studio eller webbplats.

## Git och kontroller

Jakob har godkänt automatisk push som agentens avslutningsrutin för färdiga egna ändringar. Flödet är `npm test` → uttrycklig staging av egna filer → commit → `npm run check` → vanlig push → verifierad fjärr-SHA och CI. Ingen bakgrundsbevakare eller automatisk commit av sparade filer används. Andras arbete och Jakobs placeringsutkast följer inte med av misstag. Git-push är separat från webbdeploy, mediauppladdning och generering.

- Aktivera en gång per checkout: `npm run hooks:install`. Installationen vägrar skriva över en annan hooksPath. Git-hooks följer med i repot men aktiveras inte av vanlig clone.
- `.githooks/pre-push` kontrollerar hela intervallet av nya commits, även känsliga filer som lagts till och senare tagits bort. Lokala media/env-mappar, binärt material, filer över 5 MiB och vissa tokenmönster stoppar push. Mönsterkontrollen är ett extra skydd, ingen garanti att alla hemligheter upptäcks; granska alltid diffen.
- Testerna ska avse exakt HEAD. Ändrade, nya eller ospårade kod- och testfiler stoppar kontrollen tills ägaren samordnat dem; undantaget är `studio/`, som har eget paket, typkontroll och bygge och granskas som alla andra filer när den committas (`da805da`). `placements/default.json` är ett separat användarutkast och inkluderas inte automatiskt. Kontrollen kör testfilerna i `TESTS` i `tools/publication-check.ts` (32 filer 2026-11-12) med högst fyra arbetare, utan Runway, media, FFmpeg eller deploy. En ny testfil ska in i både `test`-skriptet i `package.json` och `TESTS`.
- `.github/workflows/check.yml` kör samma kontroll på push och PR med Node 24.21.0, `npm ci`, enbart läsbehörighet och versionslåsta Actions. Före PR kör agenten `npm run check`. GitHub-kontrollen kör efter push och är inte ett serversidigt pushförbud eller aktiverat mergekrav.
- **Rött:** stoppa, undersök orsak och rätta innan nytt försök. **Gult:** granska och åtgärda eller förklara kvarvarande begränsning kort i HANDOFF före push/PR. Varningarna visas i agentens terminal och som CI-annoteringar. Granska även hook/testens relevans och falsklarm; vid verkligt kontrollfel, rätta med ett avgränsat regressionstest. Hoppa inte över kontrollen för att få grönt.
- Känd Node-varning: `stripTypeScriptTypes` i `tools/lab-ui.test.ts` använder ett experimentellt Node-API, även använt av preview/public-build. Varningen är spårad till detta API och testerna passerar. Den bevaras synlig; utred kompatibiliteten vid ändrat API/Node, utan att stänga av varningar generellt.
- **Etapper (Jakobs önskemål 2026-11-11).** Ett stabilt läge som Jakob har sett får en lätt tagg `jakob-N` på den pushade commiten: `git tag jakob-N` direkt efter push, sedan `git push origin jakob-N`. Hooken släpper bara igenom utcheckad HEAD, så taggen sätts på HEAD och inte i efterhand. Titta på en etapp med `git switch --detach jakob-N`; fortsätt därifrån på en ny branch. Ingen force-push och inga flyttade taggar. Media ligger utanför Git och följer inte med en etapp.
- Etapperna hittills: `a5821f1` (`jakob/test`, före klippbanken) och `26e41f6` (lokala taggen `scene3d-v1`, 3D-scenen v1) utan tagg på GitHub; `jakob-3` (`d1e5c65`) 3D-scenen i labbet med fokus, fläktskugga och ingångsklippet; `jakob-4` (`8c01aaa`) en film per plats, rundan vila till vila och renderade kort i 3D-scenen; `jakob-5` (`9a6ca01`) klippen ur gamla labbet, Jakobs första domar och spårning för alla filmer; `jakob-6` (`784f231`) grundfilmerna, vilan med väljare och variant B; `jakob-7` (`f4b3ee3`) spelet i 3D-scenen med Scouts kärna i `game/` och vändningen av hålkortet; Jakob: "skitsnyggt".
- Håll fem styrdokument: README (start), AGENTS (arbetsregler), HANDOFF (nu/ansvar/hinder), SYSTEM (kontrakt) och DRIFT (rutiner/anslutningar). Uppdatera på plats när beteende eller ansvar ändras. Dokumenten länkar till befintliga JSON-register/kvitton. Nya Markdown-dokument och större dokumentmängd ger gul signal; riktvärdena är 100/50/200/160/150 rader i denna ordning (HANDOFF höjt från 140 av Jakob 2026-11-11), inte mål att fylla.

## Labbservern och fliken

- `START.cmd` kör `node tools/preview.ts --open`: servern på `http://127.0.0.1:4319` startas vid behov i ett eget fönsterlöst processträd (TEMP och TMP på `D:/dealer-scratch/tmp`) och visar labbets första sida. `STATUS.cmd` och `STOPP.cmd` frågar och stoppar via kontrollkanalen och svarar "inte igång" i stället för att fela. `--restart` byter server utan att fliken stängs.
- Gamla labbets sidor ligger i `old-lab/` och spelets sida i `game/page/`; servern lämnar ut dem på samma adresser som förut (`/lab.html`, `/game.html` …) via kartan `PAGES` i `tools/lab-routes.ts`.
- **En labbflik** (2026-11-12): varje labbsida håller en ström öppen mot servern (`src/preview-ui.ts`, `/tab/events`). Den nyaste sidan är labbfliken; en äldre stänger sig själv, eller blir tom där webbläsaren vägrar. `node tools/preview.ts --open "<sida>"` visar en sida i den öppna fliken och öppnar en ny bara när ingen finns. Öppna aldrig en labbadress med `Start-Process` eller `start`: äldre sessioner gjorde det och lämnade Jakob med cirka 20 flikar, och ingen agent kan stänga en flik i hans webbläsare.
- Servern står kvar tills den stoppas med `STOPP.cmd` eller `--stop` (sedan 2026-11-12; förut slutade den 60 s efter sista fliken, och då nekades varje länk Jakob fick). Före en länk till Jakob: `node tools/preview.ts --ensure` startar servern om den inte går, utan att öppna eller flytta någon flik. Stäng inte gamla labbets eller andra projekts servrar, och stoppa aldrig via processnamn eller port.
- Andra portar på datorn hör till syskonsessioner: 4320 Pamela-filmens sida (`D:/dealer-scratch/tmp/reel/page/serve.mjs`, lånar 4319), 4331 den frysta 3D-scenen v1 (`D:/dealer-scratch/tmp/bakgrund-3d/START-BAKGRUND-3D.cmd`), 9391 Jakobs inloggade Meshy-Chrome.

## Headless Chrome och verktyg på D:

- En inspelning eller skärmbild av 3D-sidan belastar Jakobs dator: en körning i taget, kort, aviserad, och den som startar ett fönster stänger det.
- Spelsidan körs mot 4319 med `D:/dealer-scratch/tmp/spelagent/drive.mjs` (steglistor bredvid); `POST /api/game/new` med en `stacked` sko ger samma runda varje gång. Verktygen för 3D-scenens skärmbild, bildjämförelse och provfilm ligger i `D:/dealer-scratch/tmp/bakgrund-3d/` (se `LÄSMIG.txt` där).
- Meshy: Jakobs inloggade Chrome-fönster styrs med `D:/dealer-scratch/tmp/spelagent/meshy.mjs` (DevTools på 127.0.0.1:9391, profilen `chrome-meshy` bredvid, som inte får raderas). Inga lösenord hanteras av agenten.

## Anslutningar och miljö

| Kontroll | Resultat / bevisgräns |
| --- | --- |
| GitHub connector + CLI | Båda autentiserade som `Jakeminator123`; repo skapat privat, därefter ändrat till publikt av Jakob och bekräftat 2026-11-10. |
| Runway connector | Autentiserad workspace `Jakob`, ID `67037521`. |
| Runway MCP-server | `runway` (`https://mcp.runwayml.com/mcp`), inloggad med `claude mcp login runway`; drar appkontots krediter (workspace `Jakob`). Verktygen finns bara i en session som startats efter att servern lagts till. `https://dev.runwayml.com/mcp/claude` är en annan server (utvecklarportalen), inte för generering. |
| Direkt API | Gamla labbets `RUNWAY_API_KEY` gav HTTP 200 för `GET https://api.dev.runwayml.com/v1/organization`, API-version `2024-11-06`. Nyckeln drar developer-projektets krediter, en annan pott än appkontots. |
| Lokal nyckel | Endast `RUNWAY_API_KEY` kopierad till Git-ignorerade dealer/.env.local efter uttryckligt godkännande. Sanitiserat kvitto: `.runtime/connection-check.json`. |
| Identitetsgräns | API-svaret ger inte projekt/workspace-ID. Samma nyckelkälla bevisar inte att developer-API och connector har samma workspace eller saldo. |

Endpoint/header följer [Runway API-referensen](https://docs.dev.runwayml.com/api/). Äldre identitetskontroll i gamla labbets `.runtime/runway-identity-check.json` lästes 2026-11-10; inte heller den gav ett verifierat org-ID. Modell kontrolleras per tags plan/kvitto, inte från tillgängliga modeller eller filnamn. V6-källan samt P7/P6/rosa proven från 2026-11-10 använder `wan3` via developer-API. [Promptjämförelsen](../evidence/prompt-comparison.json) visar skillnaderna: gamla centerklippet använder LH→RH-handbyte, P7-provet begär samma LH. Återanvänd inte centerinstruktionen som om den beskrev en vänsterhandsutdelning till P7.

Nycklar skrivs aldrig i Git, manifest, dokument eller loggar. Blob/databas-/andra inloggningsuppgifter kopieras inte utan ett konkret integrationsbehov. GitHub CLI använder sin befintliga inloggning; ingen tokenfil behövs här.

Tre underlag hålls isär: V6:s sexsekunders centerkälla, den äldre vita 12-sekundersbanken som byggdes till cirka tre minuter, och den nyare gul/blå banken med en komplett 119,933-sekunderssekvens. [Historiska promptar](../evidence/historical-p4-generation-inputs.json) och [nyare sekvens-/källgranskning](../evidence/sequence-reuse-audit.json) binder rätt källa till rätt metod. `tools/restore-sequence-review.ts` återställer den nyare 17-kortsfilmen byteidentiskt och klipper dess 16-kortsprefix vid ruta 3296, i två format, utan ny API-generering.

`.env.local` laddas inte automatiskt av befintliga Node-kommandon. Verktyg som behöver den körs uttryckligen med `node --env-file=.env.local <verktyg.ts>`. `DEALER_SCRATCH_ROOT=D:/dealer-scratch` och `DEALER_REMOTE_GENERATION_ENABLED=false` är deklarerad konfiguration; renderern läser dem ännu inte. Flaggan är alltså inte en implementerad generationsspärr.

## Filmbeställning

Ett jobb är en enda handling mellan två ankare: en giv slutar vid verklig landnings- eller släppruta, en retur börjar från den (ankarregeln och skarvregeln i SYSTEM). Betald generering kräver Jakobs uppdrag; hans gällande besked står i HANDOFF. Två vägar finns, och vilken som ska gälla är ett öppet val hos Jakob.

**Dagens väg, sedan 2026-11-11: Runways MCP-server** på appkontot. Skripten ligger **utanför repot**, i `D:/dealer-scratch/tmp/filmagent/`:
- **Orderfil och beställande underagent.** En omgång skrivs som orderfil (`mcp/order-<omgång>.json`) och läggs och hämtas av en underagent efter `mcp/clerk-brief.md`, eftersom verktygen ekar hela prompten och ger mycket långa uppladdningsadresser. Liggaren är `mcp/bestallningar.json`. Paows omgångar har en egen kopia av vägen: `D:/dealer-scratch/tmp/paow/order/` och liggarna `paow/bestallningar-*.json`.
- **Uppladdning:** lokal bild → `init_upload` → PUT → `complete_upload` → adressen som `startFrame`/`endFrame` i `generate_video`; fråga `get_task` var 60–120 s.
- **Införsel i banken:** `node D:/dealer-scratch/tmp/filmagent/register-mcp.mjs <repo> <config.json>` skriver `assets/motions/<id>/source.mp4` med kvitto (`estimatedCredits` 0, verklig kostnad som `appCredits`), ett jobb i `data/clip-jobs.json` och en post i `motions/<id>.json`. En post med Jakobs dom skrivs aldrig över. Filmer med kort spåras därefter: `node tools/track-card.ts <id>`.
- **Bilder ur planen:** sista bilden per plats ritas ur den sparade planen med `D:/dealer-scratch/tmp/paow/skript/plan-till-order-2.py <kort> <mapp>`, med kortet som labbet ritar det (`flatQuad`, inom 1 px).
- **Granskning:** oberoende rutgranskning i full upplösning före Jakob, med mallarna `mcp/granska-giv.md`, `mcp/granska-vila.md` och `mcp/granska-helfigur.md`. Mjuka inte upp domen.
- En ny giv eller retur går i rangordningen före tagningar som Jakob godkänt som variant (ogranskad före variant i `src/clip-graph.ts`) och ändrar då genast vad spelet spelar. Lägg den i en Prov-mapp först. Vilotagningar och kanter utan godkänd film kan gå rakt in i banken som väntande.

**API-vägen** finns kvar: `tools/clip-job.ts` mot developer-API:t med `RUNWAY_API_KEY`. `data/clip-jobs.json` är det versionerade uppdraget: ankare, jobb och kredittak. `node tools/clip-job.ts check <id>` fryser indata utan nätverk; `node --env-file=.env.local tools/clip-job.ts submit <id>` gör exakt ett POST och lämnar `request.lock`; `collect <id>` läser status och hämtar filmen. Ett osäkert eller misslyckat anrop beställs aldrig om automatiskt, och `request.lock` eller SUBMITTING-status tas aldrig bort för ombeställning. Taket (`budget.maximumCredits`, 5 162 och helt intecknat 2026-11-12) höjs bara genom en uttrycklig ändring och gäller bara denna väg; jobbfilens regler (auto_-ratio, högst 6 s) är API:ts. `tools/clip-edit.ts` (aleph2-rättning) hör till samma väg; metoden föll i proven.

Ankare för Pamela byggs med `node tools/build-anchor.ts <id>` ur en riktig videoruta; bara kortpixlar ändras, mot fryst placeringsplan. Engångsverktygen från 2026-11-10 (`tools/generate-p4-control.ts`, `tools/generate-p7-direct.ts`, `tools/collect-pilot.ts`) beställde och hämtade kontrollprov via API:t; deras kvitton finns i `motions/` och `evidence/`. Bakgrund och mätningar: [metodgranskningen](../evidence/generation-method-audit.json) och [API-/MCP-kontraktet](../evidence/runway-production-contract.json).

### Lärdomar som gäller

- **Bilderna styr, inte texten.** Sista bilden bestämmer var kortet hamnar, en referensfilm hur hon rör sig (med alla sina fel), texten nästan inget. En önskad rörelse låses med ett ankare.
- **Hela verkliga rutor som ankare.** Hopklippta ankare gav för litet kort, fingertopp bredvid kortet och rester i första och sista rutorna; platt målad kortyta fick modellen att hitta på tryckt framsida.
- **Givar slutar på sitt ankare** (sista rutan 17–47 px från landningsankaret vid kvartsstorlek), så returer från ankarbilden passar alla tagningar, och giv och retur kan beställas samtidigt.
- **Slutbilden styr var, inte hur.** Med redo-bilden som första bild och samma bild plus ett kort som sista landar kortet inom ett par bildpunkter och handen kommer tillbaka; hur kortet tar sig dit väljer modellen.
- **Ett kort per film.** Flera kort i en film läggs rätt, men bara sista returen når redo, så filmen går inte att klippa per kort. Fyra försök med hela rundan i en tagning föll i rutgranskningen.
- **Samma gröna, sko och ton.** Har första och sista bild olika grönnivå hoppar filmen i de två sista rutorna. Rättas med `gron-till-niva.py`, `ton-till.py` och `skolagning.py` i `D:/dealer-scratch/tmp/paow/skript/`.
- **Skarvar.** Varje klipp har ljusare grönt i sina första rutor och ett nivåhopp i de två sista: mät och klipp tre rutor in och två före slutet. WAN 3 mörknar dessutom i sina två sista rutor (`efterarbete.py`, `slutkoll.py`).
- **Lotteri per tagning.** Räkna med två tagningar per klipp och urval. Korta vägar får korta klipp, annars hittar modellen på extra rörelser. Frysta rutor förekommer inne i rörelser och räknas vid granskning.
- **Pröva billigt och smalt först.** `auto_480p` kostar 5 credits per sekund mot 20 och visar om modellen gör rörelsen. Pröva en plats, granska, och beställ först därefter parallellt.
- **Modeller.** `wan3` med `ratio: adaptive` vid 1080p ger exakt 1764×1174 från en sådan bild; utan ratio beskärs den till 16:9. Kling 4 ger 1764×1172 i 24 rutor/s med ljudspår och mjukare hud, och går jämnt där wan3 tar ett större steg var femte ruta (att stryka var femte ruta hjälper inte).
- **Kling 4 med referens** kopierar referensens rörelse nästan bildpunkt för bildpunkt. Referensen måste vara obruten, visa samma kortföljd som slutbilden och gå till samma plats som kortet. En bildlista läses i tidsordning: filmen slutar på listans sista bild.
- **Mall som håller** (Paow, rutgranskad): första bild = redo, sista = samma bild plus ETT kort på planens plats, referens = bankens tur och retur till plats 4 klippt som `resolveRound` klipper, Kling 4 i 1080p, 7 s. WAN 3 från två bilder gör ett verkligt släp ur ankare 2.2 nära skon, inte långt bort.
- **Helkropp.** In- och utgång beställs med en ritad ljusare grön bordsskiva ("flat cut-out shape with no depth"; ordet "block" gav en låda), som målas i varje rutas bakgrundsgröna efteråt (`mcp/slab-to-bg.mjs`). En verklig stående ruta som slutbild låser hennes storlek; att hon sätter sig beställs som egen del. Bankens ruta slutar cirka 80 punkter över hennes hjässa (stående cirka 240 punkter ovanför), därför helkroppsfilm med egen ruta (`motion.frame`, SYSTEM).
- **Ansiktsuttryck** gick inte med text, men med grundrutan där bara ansiktet bytts mot en redigerad stillbild; filmen blir ditvägen följd av samma rutor baklänges (`mcp/spegla.sh`).
- **Båda händerna** går att få om slutbilden inte låser vilken hand som lade kortet (`pamela-p2-c1-handover-01`). I givfilmerna har prompten hittills beordrat den andra handen att vila.
- **Föremål** som inte finns i första bilden växer fram ur filten; en mugg måste finnas i bilden från början.
- **Föll i proven:** aleph2-rättning, ultrarapid som snabbas upp, uttaget ur skon baklänges, Aleph `edit_video` med egen nyckelruta, Kling 4 edit, WAN 3 video-till-video och Kling 3 Motion Control. seedance-2.5 gav via MCP bara en förhandsfil.
- **Keystone och ankare ur bildmodeller:** GPT Image 2.5 Sunburst (cirka 235 credits) eller Nano Banana Pro (20 credits per 2K-bild). Bildmodellen kapar kroppen 12–40 rader ovanför bordsraden och ritar om skon med handen; rättas med `forlang-plagg.py`, `fyll-morkt.py` och `skolagning.py`. Att måla över fel i en färdig film (`lagafilm.py`) håller för en stilla yta, inte där något rör sig.
- **Mätning:** `filmmatt.py` (händer, kropp och kort per ruta, landning, grönt, frysta rutor) och `identitet.py` (ansiktslikhet) i `paow/skript/`. Kontaktark räcker inte: tre gånger kallades en film lovande som rutgranskningen sedan fällde.

## Publik granskningssida och Blob

- Sida: `https://dealer-delta-eosin.vercel.app/`, team `scoutgaming`, projekt `dealer`, ID `prj_7zd112w6MIX9YnpcR7Nj64Ke50yk`. Canonisk lokal projektbindning: `.runtime/public-deploy/.vercel/project.json`.
- Blob: `dealer-media`, ID `store_qeojzIHuA5ewT4uO`, public, region `arn1`. Aktuella filantal/byte och anonym SHA-256-verifiering finns i [manifestet](../data/public-media.json) och [kvittot](../evidence/public-media-verification.json).
- `node tools/sync-public-media.ts` visar en plan utan uppladdning. `--upload` synkar endast det uttryckligen avgränsade biblioteket. Varje fil har innehållshash i namnet; befintliga objekt skrivs inte över. Granska tillåtna klipp-ID:n, antal och totalbyte tillsammans med varje katalogutökning. Vid avbruten uppladdning: kontrollera kvittot och exakt objekt, ladda inte upp en ny kopia på chans.
- Blob-nyckeln ligger enbart i Git-ignorerade `.runtime/blob-sync/.env.local`, skild från Runway-nyckeln. Ingen nyckel ska ligga i public-deploy eller byggpaketet. Den statiska sajten kräver ingen skrivnyckel.
- `node tools/build-public.ts` bygger ett litet statiskt paket i `.runtime/public-deploy/.vercel/output`. MP4-filer ersätts med verifierade Blob-länkar. Bygget fryser den aktuella sparade `placements/default.json` och avbryter om den ändras under bygget. Webbläsarens osparade utkast är inte publiceringsunderlag.
- Publik sparning använder den egna webbläsaren och säkra samtidighetskontroller. Den skriver inte till datorns placeringsfil eller en gemensam server. Export/import krävs för att flytta ändringar mellan publik och lokal vy.
- Vid ett större nytt granskningssteg uppdateras både GitHub och Vercel enligt Jakobs uppdrag. Testa och pusha den granskade koden, bygg från den committade versionen, publicera och verifiera anonym åtkomst samt faktisk uppspelning. Ge Jakob commit och direktlänk till det aktuella klippet. En spelbar underkänd film behåller sitt underkända beslut.
- Aliaset `dealer-scoutgaming.vercel.app` är skyddat och ska inte delas som publik länk. Senaste deployment och den gamla sidans avveckling står i [slutkvittot](../evidence/public-release.json).
- Gamla `scoutgaming/scout-dealerlab` (`prj_mQwHzspK3GrrJA04eFOorFxth0d5`) är borttaget efter verifierad ersättning och Jakobs delegerade beslut. API och gammal domän ger 404; nya projektet och sju Blob-filer är verifierat kvar. Inget separat gammalt GitHub-repo identifierades. Specialvyerna för äldre bildrute-/kortkontaktgranskning är bevarade i D:-arkivet.

## D: och städning

Slaskmapparna är skapade. Efter arkivraderingen 2026-11-10 hade C: cirka 106,2 GiB ledigt. Diskflytt frigör diskutrymme, inte RAM i sig. Ändra inte global TEMP/PATH och skapa inga nya runtime-junctions. Tillfälliga jobb kan få processlokal `TEMP`/`TMP` mot `D:/dealer-scratch/tmp`.

V6-renderern skriver fortfarande till dealer/output/v6. Utdataflytt måste implementeras/verifieras av verktygsägaren; miljövariabeln ensam flyttar inget. Original och pågående review bevaras.

`data/library.json` refererar till den bevarade porträttreproduktionen i `output/v6/take-01`. Den får inte rensas som slask medan katalogen refererar dit. Katalogen innehåller bara sökvägar/hashar, inga uppladdade filmer; diagnostiska beslut hämtas från motions-registret.

Gamla labbet är fullständigt arkiverat på `D:/dealer-archive/snyggare-dealer`, och C:-originalet är borttaget utan fel enligt [arkivkvittot](../evidence/archive-move.json). Efter kontrollerad serverstopp omfattade det 194 531 filer och 163 182 601 679 logiska byte. Varje vanlig fil SHA-256-jämfördes på båda sidor; katalogstruktur, Git-historik/index, 34 ändrade tracked filer och 410 individuella untracked filer bevarades. Den tidigare inventeringens uppgift om noll tracked ändringar var felaktig.

Windows lediga C:-utrymme ökade under själva raderingen med 94 016 409 600 byte (cirka 94,02 GB / 87,56 GiB). Logiska fillängder är inte fysisk diskanvändning; äldre verktyg skapade hårdlänkar och det fanns mycket upprepat innehåll. Ursprungliga filers fysiska allokering/länkantal mättes inte, så 163,18 GB får inte rapporteras som faktiskt frigjort utrymme.

Gamla servern 4318 stoppades via kontrollkanalen och process/port kontrollerades. Den enda interna junctionen kopierades inte genom traversal: arkivlänken återställdes till motsvarande interna D:-mål, och C:-länken togs bort före rekursiv källradering. Inga länkar från nya dealer till arkivet skapades. Fullständiga inventeringar, filhashar, Git-jämförelser och raderingskvitton finns under `D:/dealer-archive/receipts/20261110-snyggare-dealer`. Arkivet är läsreferens; historiska C:-sökvägar där inne är proveniens och har inte massändrats.

Före arkivflytt: registrera exakta käll-/målrot, ägare, worktrees, untracked/ignorerade filer, reparse-mål och processidentitet. Stoppa bara verifierat ägda tjänster via kontrollkanal. Kopiera till ett nytt avgränsat arkivmål utan att följa junctions; jämför filantal/byte/SHA-256 och verifiera återläsning. Separat godkänd källradering kan därefter frigöra C:. Befintliga D:-delarkiv får inte skrivas över.

Rensning kräver ett kandidatbeslut med källa, ägare, referenser och verifierad ersättning. Filnamnslikhet eller inaktiv process räcker inte. Osäkert material stannar för granskning. Endast det uttryckligen beställda gamla projektet togs bort från C:. Nya dealer, preview 4319, ChatGPT, Utforskaren och andra projekt bevarades.

**Städverktyget** (2026-11-12). `npm run stada` (`tools/scratch-clean.ts`) är en torrkörning: rapport per regel, inget ändras; `-- --lista` visar varje träff och `-- --forklara <sökväg>` varför något lämnas. `-- --kor` utför. RADERA tar bara det som går att göra om: headless Chrome-profiler, `node_modules`, Nodes och Pythons cacher, Chromes `scoped_dir*`, lösa `*.tmp` och loggar äldre än en vecka. ARKIVERA flyttar skärmbilder och rutdumpar äldre än en vecka till `D:/dealer-archive/slask/<år-månad>/<samma sökväg under dealer-scratch>`. Varje flytt och radering skrivs i `D:/dealer-archive/slask/arkiv.json`, och `-- --aterstall <post>` flyttar tillbaka. Kontaktark och sessionsmappar som ingen ändrat på två veckor kräver dom och flyttas bara med `-- --kor --regel kontaktark` (eller `avslutad-session`); `--tyst` gör aldrig det. Reglerna står som data överst i verktyget.

Skydden går inte att slå av. Verktyget rör aldrig: det som ändrats de senaste tre dygnen; mappar som HANDOFF, README, AGENTS, `docs/*.md`, `data/*.json` eller agenternas minne namnger med sökväg. En namngiven mapp skyddar allt i den; en fil direkt i en sessionsmapp skyddar bara sig själv. Namnge därför undermappen, inte hela sessionen, när bara den ska leva kvar; mappar med beställningsliggare eller kvitto (`bestallningar*`, `order-*`, `uploads-*`, `tasks-*`, `*kvitto*`, `request.lock`); `chrome-meshy`, Python-miljöer, mappar som en körande process namnger och mappar med länkar; film och ljud, som aldrig raderas, och allt utanför `D:/dealer-scratch`.

2026-11-12 togs 1,3 GB slask bort för hand (17 headless Chrome-profiler och en `node_modules`). Labbservern kör `--kor --tyst` en gång per start; utfallet står i `.runtime/stada.log`.

Två lokala kopior av arkivets inventeringskvitton har därefter tagits bort efter SHA-256-kontroll mot bevarade D:-original och processkontroll: 81 609 952 logiska byte; fysisk frigörelse mättes inte. [Städkvitto och coachtriage](../evidence/coach-production-triage.json). Behåll befintliga JSON-register nu; ingen SQLite, lokal Postgres eller ny Neon-miljö har skapats. [Lagringsbedömningen](../evidence/storage-choice-review.json) anger övergång till Scouts befintliga Postgres-adapter när delade skrivare och atomisk historik behövs. Hela gamla chatthistoriker ska inte följa med en handoff; ge aktuell HANDOFF och de få relevanta registren.

## Molnmiljö

Codex stöder sparade molnmiljöer via **Settings → Codex Cloud → Environments**, med repo, verktyg och nätverkskonfiguration. Detta är separat körning, inte mer RAM till den lokala chatten. Se [OpenAI Docs: Cloud environments](https://learn.chatgpt.com/docs/environments/cloud-environments).

Livekontroll: en sparad miljö `scoutgaming` finns, `status=ready` men `runnable=false`; ingen dealer-miljö finns i den tillgängliga listan. Ingen miljö skapad eller startad här. Den befintliga Scout-miljön återanvänds inte för dealer utan uttrycklig projektbindning.

Förbered en privat dealer-miljö med detta repo, Node 24.21.0 och `npm ci`. GitHub saknar media, så full V6-verifiering/rendering kräver separat registrerade assets, FFmpeg/FFprobe och högst fyra arbetare. Källhashar ska verifieras före rendering. Runway kan vid behov tillföras som HTTP-hemlighet begränsad till `api.dev.runwayml.com`; kopiera inte hela gamla env. Kontoåtkomst, mediaöverföring och eventuell kostnad behöver vara konkreta innan start.
