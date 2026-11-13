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
- Testerna ska avse exakt HEAD. Ändrade, nya eller ospårade kod- och testfiler stoppar kontrollen tills ägaren samordnat dem; undantaget är `studio/`, som har eget paket, typkontroll och bygge och granskas som alla andra filer när den committas (`da805da`). `placements/default.json` är ett separat användarutkast och inkluderas inte automatiskt. Kontrollen kör testfilerna i `TESTS` i `tools/publication-check.ts` (42 filer 2026-11-12; listan i `package.json` ska vara densamma) med högst fyra arbetare, utan Runway, media, FFmpeg eller deploy. En ny testfil ska in i både `test`-skriptet i `package.json` och `TESTS`.
- `.github/workflows/check.yml` kör samma kontroll på push och PR med Node 24.21.0, `npm ci`, enbart läsbehörighet och versionslåsta Actions. Före PR kör agenten `npm run check`. GitHub-kontrollen kör efter push och är inte ett serversidigt pushförbud eller aktiverat mergekrav.
- **Rött:** stoppa, undersök orsak och rätta innan nytt försök. **Gult:** granska och åtgärda eller förklara kvarvarande begränsning kort i HANDOFF före push/PR. Varningarna visas i agentens terminal och som CI-annoteringar. Granska även hook/testens relevans och falsklarm; vid verkligt kontrollfel, rätta med ett avgränsat regressionstest. Hoppa inte över kontrollen för att få grönt.
- Känd Node-varning: `stripTypeScriptTypes` i `tools/lab-ui.test.ts` använder ett experimentellt Node-API, även använt av preview/public-build. Varningen är spårad till detta API och testerna passerar. Den bevaras synlig; utred kompatibiliteten vid ändrat API/Node, utan att stänga av varningar generellt.
- **Etapper (Jakobs önskemål 2026-11-11).** Ett stabilt läge som Jakob har sett får en lätt tagg `jakob-N` på den pushade commiten: `git tag jakob-N` direkt efter push, sedan `git push origin jakob-N`. Hooken släpper bara igenom utcheckad HEAD, så taggen sätts på HEAD och inte i efterhand. Titta på en etapp med `git switch --detach jakob-N`; fortsätt därifrån på en ny branch. Ingen force-push och inga flyttade taggar. Media ligger utanför Git och följer inte med en etapp.
- Etapperna hittills (allt pushas sedan 2026-11-13 till `main`, GitHubs förvalda gren; `jakob/test` och `claude/deal-clips` är äldre namn på samma historia): `a5821f1` (`jakob/test`, före klippbanken) och `26e41f6` (lokala taggen `scene3d-v1`, 3D-scenen v1) utan tagg på GitHub; `jakob-3` (`d1e5c65`) 3D-scenen i labbet med fokus, fläktskugga och ingångsklippet; `jakob-4` (`8c01aaa`) en film per plats, rundan vila till vila och renderade kort i 3D-scenen; `jakob-5` (`9a6ca01`) klippen ur gamla labbet, Jakobs första domar och spårning för alla filmer; `jakob-6` (`784f231`) grundfilmerna, vilan med väljare och variant B; `jakob-7` (`f4b3ee3`) spelet i 3D-scenen med Scouts kärna i `game/` och vändningen av hålkortet; Jakob: "skitsnyggt".
- Håll fem styrdokument: README (start), AGENTS (arbetsregler), HANDOFF (nu/ansvar/hinder), SYSTEM (kontrakt) och DRIFT (rutiner/anslutningar). Uppdatera på plats när beteende eller ansvar ändras. Dokumenten länkar till befintliga JSON-register/kvitton. Nya Markdown-dokument och större dokumentmängd ger gul signal; riktvärdena är 100/50/200/160/150 rader i denna ordning (HANDOFF höjt från 140 av Jakob 2026-11-11), inte mål att fylla.

## Labbservern och fliken

- `START.cmd` kör `node tools/preview.ts --open`: servern på `http://127.0.0.1:4319` startas vid behov i ett eget fönsterlöst processträd (TEMP och TMP på `D:/dealer-scratch/tmp`) och visar labbets första sida. `STATUS.cmd` och `STOPP.cmd` frågar och stoppar via kontrollkanalen och svarar "inte igång" i stället för att fela. `--restart` byter server utan att fliken stängs.
- Gamla labbets sidor ligger i `old-lab/` och spelets sida i `game/page/`; servern lämnar ut dem på samma adresser som förut (`/lab.html`, `/game.html` …) via kartan `PAGES` i `tools/lab-routes.ts`.
- **En labbflik** (2026-11-12): varje labbsida håller en ström öppen mot servern (`src/preview-ui.ts`, `/tab/events`). Den nyaste sidan är labbfliken; en äldre stänger sig själv, eller blir tom där webbläsaren vägrar. `node tools/preview.ts --open "<sida>"` visar en sida i den öppna fliken och öppnar en ny bara när ingen finns. Öppna aldrig en labbadress med `Start-Process` eller `start`: äldre sessioner gjorde det och lämnade Jakob med cirka 20 flikar, och ingen agent kan stänga en flik i hans webbläsare.
- Servern står kvar tills den stoppas med `STOPP.cmd` eller `--stop` (sedan 2026-11-12; förut slutade den 60 s efter sista fliken, och då nekades varje länk Jakob fick). Före en länk till Jakob: `node tools/preview.ts --ensure` startar servern om den inte går, utan att öppna eller flytta någon flik. Stäng inte gamla labbets eller andra projekts servrar, och stoppa aldrig via processnamn eller port.
- Andra portar på datorn hör till syskonsessioner: 4320 Pamela-filmens sida (`D:/dealer-scratch/tmp/reel/page/serve.mjs`, lånar 4319), 4331 den frysta 3D-scenen v1 (`D:/dealer-scratch/tmp/bakgrund-3d/START-BAKGRUND-3D.cmd`), 9391 Jakobs inloggade Meshy-Chrome.

## Arbetsskript utanför repot

Skript, beställningsfiler, liggare, mallar och startprompter ligger kvar på D: tills de förs in i repot eller avvecklas; bilder och filmer som används eller kan användas ligger i `assets/` (AGENTS). Sökvägarna gäller under `D:/dealer-scratch/tmp/` om inget annat sägs.
- **Film (MCP-vägen):** `filmagent/register-mcp.mjs`; i `filmagent/mcp/` orderfilerna, `clerk-brief.md`, liggaren `bestallningar.json`, mallarna `granska-giv.md`, `granska-vila.md` och `granska-helfigur.md`, `slab-to-bg.mjs` och `spegla.sh`; Paows kopia i `paow/order/` med liggarna `paow/bestallningar-*.json`; underlag för en ny filmagent i `D:/dealer-scratch/review/` (`filmagent-startprompt-2.md`, `handoff-filmer-2026-11-11-paus.md`).
- **Bild och mått:** Paows Python-skript i `paow/skript/` (bland andra `plan-till-order-2.py`, `grundbild.py`, `forlang-plagg.py`, `fyll-morkt.py`, `skolagning.py`, `gron-till-niva.py`, `ton-till.py`, `efterarbete.py`, `slutkoll.py`, `filmmatt.py`, `identitet.py`, `lagafilm.py`), körda med `filmagent/py/venv`; bankräkningen `huvudagent/dokument/rakna.ts`.
- **Sidor och headless Chrome:** en inspelning eller skärmbild av 3D-sidan belastar Jakobs dator: en körning i taget, kort, aviserad, och den som startar ett fönster stänger det. Spelsidan körs mot 4319 med `spelagent/drive.mjs` (steglistor bredvid); `POST /api/game/new` med en `stacked` sko ger samma runda varje gång. 3D-scenens skärmbild, bildjämförelse och provfilm: `bakgrund-3d/` (`LÄSMIG.txt`). Pamela-filmens regisida: `reel/` (`LASMIG.md`).
- **Meshy:** Jakobs inloggade Chrome-fönster styrs med `spelagent/meshy.mjs` (DevTools på 127.0.0.1:9391, profilen `chrome-meshy` bredvid, som inte får raderas). Inga lösenord hanteras av agenten.

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

Ett jobb är en enda handling mellan två ankare: en giv slutar vid verklig landnings- eller släppruta, en retur börjar från den (ankarregeln och skarvregeln i SYSTEM). Hela vägen för en ny dealer, med stationer, format, kommandon och vem som beslutar: [löpande bandet](../tools/dealer-line.md). Hur en beställning komponeras och vad som har hållit och fallit: [handboken](../tools/film-prompting.md); hur den läggs, hämtas och efterarbetas: [beställningsagenten](../tools/order-clerk.md); hur en film granskas: [granskningen](../tools/film-review.md). Nya fynd förs in i handbokens tabeller, inte här. Vad som skickades och hur det gick: studions vy Protokoll (`node tools/order-ledger.ts`).

- **En väg: Beställ** (sedan 2026-11-13). Utkast i studions vy Beställ (`data/orders/<id>.json`), godkänt med Jakobs klick eller av huvudagenten på hans uppdrag (`tools/order-approve.ts`) inom `data/order-policy.json`, lagt och hämtat av en beställningsagent genom Runways MCP-server på appkontot. Betalda anrop utanför Beställ rapporteras till huvudagenten med belopp (HANDOFF, "Vem äger vad").
- **Äldre vägar, används inte:** API-vägen (`tools/clip-job.ts` och `tools/clip-edit.ts` mot developer-API:t med `RUNWAY_API_KEY`; jobben och taket `budget.maximumCredits` 5 162 i `data/clip-jobs.json`, helt intecknat 2026-11-12) och orderfilerna på D: (`filmagent/mcp/order-*.json`, `clerk-brief.md`, `register-mcp.mjs`; Paows `paow/order/` och liggarna `paow/bestallningar-*.json`). Deras kvitton och liggare är källbevis och står kvar; ett osäkert API-anrop beställs aldrig om, och `request.lock` eller SUBMITTING tas aldrig bort. Pamelas ankare byggdes med `tools/build-anchor.ts` ur riktiga videorutor (bara kortpixlar ändrade, mot fryst plan); engångsverktygen från 2026-11-10 (`tools/generate-p4-control.ts`, `tools/generate-p7-direct.ts`, `tools/collect-pilot.ts`) har kvitton i `motions/` och `evidence/`. Bakgrund: [metodgranskningen](../evidence/generation-method-audit.json) och [API-/MCP-kontraktet](../evidence/runway-production-contract.json).
- **Inkorgen:** en tagning från en order förs in med `review.inbox: true` och spelas bara där steget saknar annan film tills Jakob har dömt den (`src/clip-graph.ts`); hans dom tar bort flaggan. En film som inte förs in men kan användas kopieras till `assets/films/<dealer>/<namn>/source.mp4` med `receipt.json` och får rollen film i `data/media-roles.json`.

### Lärdomar som gäller

Det som gäller själva beställningen (bilder, text, modell, längd, tagningar, efterarbete) står i handboken och i beställningsagentens instruktion; här står det som rör banken, uppspelningen och helkroppen.

- **Givar slutar på sitt ankare** (sista rutan 17–47 px från landningsankaret vid kvartsstorlek), så returer från ankarbilden passar alla tagningar, och giv och retur kan beställas samtidigt.
- **Skarvar.** Varje klipp har ljusare grönt i sina första rutor och ett nivåhopp i de två sista: mät och klipp tre rutor in och två före slutet. Frysta rutor förekommer inne i rörelser och räknas vid granskning.
- **Helkropp.** In- och utgång beställs med en ritad ljusare grön bordsskiva ("flat cut-out shape with no depth"; ordet "block" gav en låda), som målas i varje rutas bakgrundsgröna efteråt (`mcp/slab-to-bg.mjs`). En verklig stående ruta som slutbild låser hennes storlek; att hon sätter sig beställs som egen del. Bankens ruta slutar cirka 80 punkter över hennes hjässa (stående cirka 240 punkter ovanför), därför helkroppsfilm med egen ruta (`motion.frame`, SYSTEM).
- **Ansiktsuttryck** gick inte med text, men med grundrutan där bara ansiktet bytts mot en redigerad stillbild; filmen blir ditvägen följd av samma rutor baklänges (`mcp/spegla.sh`).
- **Båda händerna** går att få om slutbilden inte låser vilken hand som lade kortet (`pamela-p2-c1-handover-01`). I givfilmerna har texten hittills sagt att den andra handen vilar.
- **Föremål** som inte finns i första bilden växer fram ur filten; en mugg måste finnas i bilden från början.
- **Kostnad för en hel dealer:** skattat 2026-11-12 cirka 5 000 krediter för en uppsättning med ett utdelningssätt (16 kort och omtagningar); Paow hade 2026-11-13 kostat cirka 5 400 utan att vara färdig (räknat ur kvittona, se löpande bandet).

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

Skydden går inte att slå av. Verktyget rör aldrig: det som ändrats de senaste tre dygnen; mappar som HANDOFF, README, AGENTS, `docs/*.md`, `data/*.json` eller agenternas minne namnger med sökväg. En namngiven mapp skyddar allt i den; en fil direkt i en sessionsmapp skyddar bara sig själv. Namnge därför undermappen, inte hela sessionen, när bara den ska leva kvar; mappar med beställningsliggare eller kvitto (`bestallningar*`, `order-*`, `uploads-*`, `tasks-*`, `*kvitto*`, `request.lock`); `chrome-meshy`, Python-miljöer, mappar som en körande process namnger och mappar med länkar; film och ljud, som aldrig raderas, och allt utanför `D:/dealer-scratch`. 2026-11-12 togs 1,3 GB slask bort för hand (17 headless Chrome-profiler och en `node_modules`). Labbservern kör `--kor --tyst` en gång per start; utfallet står i `.runtime/stada.log`. Samma dag kopierades bilder och filmer som används eller kan användas från D: till `assets/` (0,74 GB, SHA-256-kontrollerat, inget flyttat eller raderat på D:); rapporten `D:/dealer-scratch/tmp/huvudagent/import/RAPPORT.md` säger vad som ligger kvar och varför.

Två lokala kopior av arkivets inventeringskvitton har därefter tagits bort efter SHA-256-kontroll mot bevarade D:-original och processkontroll: 81 609 952 logiska byte; fysisk frigörelse mättes inte. [Städkvitto och coachtriage](../evidence/coach-production-triage.json). Behåll befintliga JSON-register nu; ingen SQLite, lokal Postgres eller ny Neon-miljö har skapats. [Lagringsbedömningen](../evidence/storage-choice-review.json) anger övergång till Scouts befintliga Postgres-adapter när delade skrivare och atomisk historik behövs. Hela gamla chatthistoriker ska inte följa med en handoff; ge aktuell HANDOFF och de få relevanta registren.

## Molnmiljö

Codex stöder sparade molnmiljöer via **Settings → Codex Cloud → Environments**, med repo, verktyg och nätverkskonfiguration. Detta är separat körning, inte mer RAM till den lokala chatten. Se [OpenAI Docs: Cloud environments](https://learn.chatgpt.com/docs/environments/cloud-environments).

Livekontroll: en sparad miljö `scoutgaming` finns, `status=ready` men `runnable=false`; ingen dealer-miljö finns i den tillgängliga listan. Ingen miljö skapad eller startad här. Den befintliga Scout-miljön återanvänds inte för dealer utan uttrycklig projektbindning.

Förbered en privat dealer-miljö med detta repo, Node 24.21.0 och `npm ci`. GitHub saknar media, så full V6-verifiering/rendering kräver separat registrerade assets, FFmpeg/FFprobe och högst fyra arbetare. Källhashar ska verifieras före rendering. Runway kan vid behov tillföras som HTTP-hemlighet begränsad till `api.dev.runwayml.com`; kopiera inte hela gamla env. Kontoåtkomst, mediaöverföring och eventuell kostnad behöver vara konkreta innan start.
