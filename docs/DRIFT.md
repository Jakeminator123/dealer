# Drift, anslutningar och återbruk

Rutiner och anslutningar. Genomgånget 2026-11-12; avsnitten om arkiv, publicering och molnmiljö kontrollerades
2026-11-10. Aktuell arbetsstatus och ägare står i HANDOFF, beslut per film i `motions/`.

## Identitet och ansvar

| Del | Kanonisk plats / identitet |
| --- | --- |
| Arbetsyta | `C:/Users/jakem/dev/super-feature-sg/dealer` |
| Publikt GitHub | `Jakeminator123/dealer`, origin `https://github.com/Jakeminator123/dealer.git` |
| Slutmål | `C:/Users/jakem/dev/scoutgaming`, remote `git@github.com:Jakeminator123/scoutgaming.git` |
| Gammal läsreferens | `D:/dealer-archive/snyggare-dealer`; fullständigt verifierat arkiv, tidigare C:/Users/jakem/dev/super-feature-sg/snyggare-dealer |
| Ny slask | `D:/dealer-scratch/tmp`, `renders`, `review` |
| Befintligt arkiv | `D:/dealerlab-archive/snyggare-dealer`; tidigare delarkiv, inte bevis på full projektflytt |

Huvudagenten äger commits, taggar, push och styrdokumenten; vem det är och vem som äger vilka filer står i HANDOFF. En
skribent per fil; samordna index och commit.

Jakobs uppdrag 2026-11-10 godkänner publikt GitHub-upplägg, anslutningskontroller, nödvändig lokal env-återanvändning
och D:-slask. Deploy, Scout-integration, databasändringar och betald generering är separata uppdrag. GitHub-repot är
källförvaring, inte en publicerad studio eller webbplats.

## Git och kontroller

Jakob har godkänt automatisk push som agentens avslutningsrutin för färdiga egna ändringar. Flödet är `npm test` →
uttrycklig staging av egna filer → commit → `npm run check` → vanlig push → verifierad fjärr-SHA och CI. Ingen
bakgrundsbevakare eller automatisk commit av sparade filer används. Andras arbete och Jakobs placeringsutkast följer
inte med av misstag. Git-push är separat från webbdeploy, mediauppladdning och generering.

- Aktivera en gång per checkout: `npm run hooks:install`. Installationen vägrar skriva över en annan hooksPath.
  Git-hooks följer med i repot men aktiveras inte av vanlig clone.
- `.githooks/pre-push` kontrollerar hela intervallet av nya commits, även känsliga filer som lagts till och senare
  tagits bort. Lokala media/env-mappar, binärt material, filer över 5 MiB och vissa tokenmönster stoppar push.
  Mönsterkontrollen är ett extra skydd, ingen garanti att alla hemligheter upptäcks; granska alltid diffen.
- Testerna ska avse exakt HEAD. Ändrade, nya eller ospårade kod- och testfiler stoppar kontrollen tills ägaren samordnat
  dem; undantaget är `studio/`, som har eget paket, typkontroll och bygge och granskas som alla andra filer när den
  committas (`da805da`). `placements/default.json` är ett separat användarutkast och inkluderas inte automatiskt.
  Kontrollen kör testfilerna i `TESTS` i `tools/publication-check.ts` (bland dem
  `studio/tests/*.test.ts`; `npm test` kör samma lista, och ett vakttest i `tools/publication-check.test.ts` fäller en
  testfil i `tools/` som ingen lista namnger) med högst fyra arbetare, utan Runway, media eller deploy; tester som gör
  en liten film med FFmpeg hoppas över där FFmpeg saknas. En ny testfil ska in i både `test`-skriptet i `package.json`
  och `TESTS`.
- `.github/workflows/check.yml` kör samma kontroll på push och PR med Node 24.21.0, `npm ci`, enbart läsbehörighet och
  versionslåsta Actions; kontrollen kör alla tester i `TESTS`, så CI kör hela `npm test`. I en ren checkout utan media
  och utan FFmpeg (som CI) hoppas de tester över som gör en liten film med FFmpeg eller läser bankens filmer och
  kortspår (`tools/order-images.test.ts`, `tools/card-overlay.test.ts`); 2026-11-13 var det 14 av 824. Studions tester behöver inte
  `studio/node_modules`. Före PR kör agenten `npm run check`. GitHub-kontrollen kör efter push och är inte ett
  serversidigt pushförbud eller aktiverat mergekrav.
- **Push medan andra skriver** (2026-11-13). I huvudträdet stoppar kontrollen så länge någon sessions testindata
  skiljer sig från HEAD eller en ospårad `.ts`-fil ligger där, och det gör den nästan alltid en dag med flera
  sessioner. Huvudagenten pushar då från ett eget rent arbetsträd på slaskdisken: `git worktree add --detach
  <mapp på D:> main`, `npm ci` (om paketlistan har ändrats), `npm test`, `npm run check`, `git push origin HEAD:main`,
  och sedan fjärrens SHA och GitHub-kontrollen. Det som pushas är incheckade commits, aldrig någons öppna filer.
  Arbetsträdet tas bort med `git worktree remove` när dagen är slut.
- **Rött:** stoppa, undersök orsak och rätta innan nytt försök. **Gult:** granska och åtgärda eller förklara kvarvarande
  begränsning kort i HANDOFF före push/PR. Varningarna visas i agentens terminal och som CI-annoteringar. Granska även
  hook/testens relevans och falsklarm; vid verkligt kontrollfel, rätta med ett avgränsat regressionstest. Hoppa inte
  över kontrollen för att få grönt.
- Känd Node-varning: `stripTypeScriptTypes` i `tools/lab-ui.test.ts` använder ett experimentellt Node-API, även använt
  av preview/public-build. Varningen är spårad till detta API och testerna passerar. Den bevaras synlig; utred
  kompatibiliteten vid ändrat API/Node, utan att stänga av varningar generellt.
- **Grenar.** `main` är den enda långlivade grenen. En kortlivad gren (till exempel en worktree för ett avgränsat
  arbete) slås ihop i `main` av huvudagenten och tas sedan bort, lokalt och på GitHub.
- **Etapper (Jakobs önskemål 2026-11-11).** Ett stabilt läge som Jakob har sett får en lätt tagg `jakob-N` på den
  pushade commiten: `git tag jakob-N` direkt efter push, sedan `git push origin jakob-N`. Hooken släpper bara igenom
  utcheckad HEAD, så taggen sätts på HEAD och inte i efterhand. Titta på en etapp med `git switch --detach jakob-N`;
  fortsätt därifrån på en ny branch. Ingen force-push och inga flyttade taggar. Media ligger utanför Git och följer inte
  med en etapp.
- Etapperna hittills (allt pushas sedan 2026-11-13 till `main`, GitHubs förvalda gren; de äldre grenarna `jakob/test`
  och `claude/deal-clips` bar samma historia och är borttagna på GitHub 2026-11-13): `a5821f1` (`jakob/test`, före
  klippbanken) och `26e41f6` (lokala taggen `scene3d-v1`, 3D-scenen v1) utan tagg på GitHub; `jakob-3` (`d1e5c65`)
  3D-scenen i labbet med fokus, fläktskugga och ingångsklippet; `jakob-4` (`8c01aaa`) en film per plats, rundan vila
  till vila och renderade kort i 3D-scenen; `jakob-5` (`9a6ca01`) klippen ur gamla labbet, Jakobs första domar och
  spårning för alla filmer; `jakob-6` (`784f231`) grundfilmerna, vilan med väljare och variant B; `jakob-7` (`f4b3ee3`)
  spelet i 3D-scenen med Scouts kärna i `game/` och vändningen av hålkortet; Jakob: "skitsnyggt".
- **Återställningsbara versioner** (Jakob 2026-11-13: "Spara dock nuläget efter push som typ "Återställningsbart
  version 2" för allt är bra"). En tagg på den pushade commiten, och i `D:/dealer-archive/<namn>/` en bundle av hela
  historiken och en kopia av allt som ligger utanför Git (`assets/`, `output/`, `.runtime/` utan hemligheter), jämförd
  mot källan med SHA-256 fil för fil. Mappens `LASMIG.md` säger hur läget återställs, och skripten i `kvitton/skript/`
  körs om med nytt namn för nästa version. Version 1 är `D:/dealer-archive/V2-backup-studio/` (taggen `fore-struktur`,
  `ce901d6`, 2026-11-12). Version 2 är `D:/dealer-archive/aterstallningsbar-version-2/` (taggen
  `aterstallningsbar-version-2`, `c9c3cf2`, 2026-11-13: 4 103 mediefiler, 10,7 GB, 0 avvikelser).
- Fem kanoniska dokument måste finnas: README (start), AGENTS (arbetsregler), HANDOFF (läget nu, ansvar, hinder), SYSTEM
  (kontrakt) och DRIFT (rutiner, anslutningar). Saknas ett av dem stoppar kontrollen (rött; listan `CANONICAL` i
  `tools/publication-check.ts`). Längden mäts inte, och en ny sida under `docs/` eller en arbetsinstruktion i `tools/`
  är välkommen när ett ämne behöver en egen (sedan 2026-11-13; förut gav riktvärden i rader och varje nytt dokument gul
  signal, och dokumenten höll gränsen genom allt längre rader). Uppdatera på plats när beteende eller ansvar ändras, och
  länka till befintliga JSON-register och kvitton i stället för att kopiera dem.

## Labbservern och fliken

- `START.cmd` kör `node tools/preview.ts --open`: servern på `http://127.0.0.1:4319` startas vid behov i ett eget
  fönsterlöst processträd (TEMP och TMP på `D:/dealer-scratch/tmp`) och visar labbets första sida. `STATUS.cmd` och
  `STOPP.cmd` frågar och stoppar via kontrollkanalen och svarar "inte igång" i stället för att fela. `--restart` byter
  server utan att fliken stängs.
- Gamla labbets sidor ligger i `old-lab/` och spelets sida i `game/page/`; servern lämnar ut dem på samma adresser som
  förut (`/lab.html`, `/game.html` …) via kartan `PAGES` i `tools/lab-routes.ts`.
- **Servern lämnar ut arbetsträdet, och bara modulerna i sin lista** (`SCRIPTS` i `tools/lab-routes.ts`, läst när
  servern startar). En halvfärdig ändring i en sessions fil syns alltså direkt för alla, Jakobs flik också. En ny
  modul under `src/` görs i den här ordningen: filen på plats utan att något importerar den, raden i listan,
  omstart (`node tools/preview.ts --restart`, huvudagenten, i en lucka utan tagning), och först därefter importen.
  Importen före listan ger 404 för modulen, och då laddar varken spelet eller Scen i någon webbläsare; det hände två
  gånger 2026-11-13 (15.20–15.34 och 15.34–15.46). `node --test tools/lab-modules.test.ts` läser varje utlämnad
  moduls importer och säger vilken granne som saknas, utan webbläsare; kör det efter en ny import och före en
  tagning.
- **En inspelning säger varje nyckel som kan ändras.** Scenens förval ändras ibland samma dag som en film spelas in;
  en tagning som utelämnar en nyckel får det trädet säger i den minut sidan laddas. Skriv ut nycklarna i tagningens
  adress (`filmEven`, `filmTempo`, `dealerLife`, `cups`, `cards`).
- **En labbflik** (2026-11-12): varje labbsida håller en ström öppen mot servern (`src/preview-ui.ts`, `/tab/events`).
  Den nyaste sidan är labbfliken; en äldre stänger sig själv, eller blir tom där webbläsaren vägrar.
  `node tools/preview.ts --open "<sida>"` visar en sida i den öppna fliken och öppnar en ny bara när ingen finns. Öppna
  aldrig en labbadress med `Start-Process` eller `start`: äldre sessioner gjorde det och lämnade Jakob med cirka 20
  flikar, och ingen agent kan stänga en flik i hans webbläsare.
- Servern står kvar tills den stoppas med `STOPP.cmd` eller `--stop` (sedan 2026-11-12; förut slutade den 60 s efter
  sista fliken, och då nekades varje länk Jakob fick). Före en länk till Jakob: `node tools/preview.ts --ensure` startar
  servern om den inte går, utan att öppna eller flytta någon flik. Stäng inte gamla labbets eller andra projekts
  servrar, och stoppa aldrig via processnamn eller port.
- Andra portar på datorn hör till syskonsessioner: 4320 Pamela-filmens sida
  (`D:/dealer-scratch/tmp/reel/page/serve.mjs`, lånar 4319), 4331 den frysta 3D-scenen v1
  (`D:/dealer-scratch/tmp/bakgrund-3d/START-BAKGRUND-3D.cmd`), 9391 Jakobs inloggade Meshy-Chrome.

## Arbetsskript utanför repot

Skript, beställningsfiler, liggare, mallar och startprompter ligger kvar på D: tills de förs in i repot eller avvecklas;
bilder och filmer som används eller kan användas ligger i `assets/` (AGENTS). Sökvägarna gäller under
`D:/dealer-scratch/tmp/` om inget annat sägs.
- **Film (MCP-vägen):** `filmagent/register-mcp.mjs`; i `filmagent/mcp/` orderfilerna, `clerk-brief.md`, liggaren
  `bestallningar.json`, mallarna `granska-giv.md`, `granska-vila.md` och `granska-helfigur.md`, `slab-to-bg.mjs` och
  `spegla.sh`; Paows kopia i `paow/order/` med liggarna `paow/bestallningar-*.json`; äldre startprompter och
  överlämningar för roller som inte finns längre, arkiverade i `D:/dealer-archive/review-20261113/`.
- **Bild och mått:** de fem Python-skript som bandet fortfarande kör (`grundbild-21.py`, `skolagning-21.py`,
  `filmmatt.py`, `identitet.py`, `forlang-plagg.py`) ligger sedan 2026-11-13 i `tools/python/` med miljö och modeller
  enligt dess README. Efterarbetet i övrigt är porterat till `tools/film-after.ts` och `tools/still-after.ts`. Paows
  äldre Python-skript i `paow/skript/` (bland andra `plan-till-order-2.py`, `grundbild.py`, `efterarbete.py`,
  `slutkoll.py`, `lagafilm.py`) är källbevis för hur hans bilder gjordes, inte en arbetsväg; bankräkningen
  `huvudagent/dokument/rakna.ts`.
- **Sidor och headless Chrome:** en inspelning eller skärmbild av 3D-sidan belastar Jakobs dator: en körning i taget,
  kort, aviserad, och den som startar ett fönster stänger det. Spelsidan körs mot 4319 med `spelagent/drive.mjs`
  (steglistor bredvid); `POST /api/game/new` med en `stacked` sko ger samma runda varje gång. 3D-scenens skärmbild,
  bildjämförelse och provfilm: `bakgrund-3d/` (`LÄSMIG.txt`). Pamela-filmens regisida: `reel/` (`LASMIG.md`). Spelet med
  Paow (`game.html?dealer=paow`, eller Casino med Paow vald) spelas in med `huvudagent11/spel/drive.mjs` (en skärmbild per
  ruta) och `mix.mjs` (rutorna till 30 bilder/s, rösten lagd där talfilmen började).
- **Meshy:** Jakobs inloggade Chrome-fönster styrs med `spelagent/meshy.mjs` (DevTools på 127.0.0.1:9391, profilen
  `chrome-meshy` bredvid, som inte får raderas). Inga lösenord hanteras av agenten.

## Anslutningar och miljö

| Kontroll | Resultat / bevisgräns |
| --- | --- |
| GitHub connector + CLI | Båda autentiserade som `Jakeminator123`; repo skapat privat, därefter ändrat till publikt av Jakob och bekräftat 2026-11-10. |
| Runway connector | Autentiserad workspace `Jakob`, ID `67037521`. |
| Runway MCP-server | `runway` (`https://mcp.runwayml.com/mcp`), inloggad med `claude mcp login runway`; drar appkontots krediter (workspace `Jakob`). Verktygen finns bara i en session som startats efter att servern lagts till. `https://dev.runwayml.com/mcp/claude` är en annan server (utvecklarportalen), inte för generering. |
| Direkt API | Gamla labbets `RUNWAY_API_KEY` gav HTTP 200 för `GET https://api.dev.runwayml.com/v1/organization`, API-version `2024-11-06`. Nyckeln drar developer-projektets krediter, en annan pott än appkontots. |
| Lokal nyckel | Endast `RUNWAY_API_KEY` kopierad till Git-ignorerade dealer/.env.local efter uttryckligt godkännande. Sanitiserat kvitto: `.runtime/connection-check.json`. |
| Identitetsgräns | API-svaret ger inte projekt/workspace-ID. Samma nyckelkälla bevisar inte att developer-API och connector har samma workspace eller saldo. |

Endpoint/header följer [Runway API-referensen](https://docs.dev.runwayml.com/api/). Äldre identitetskontroll i gamla
labbets `.runtime/runway-identity-check.json` lästes 2026-11-10; inte heller den gav ett verifierat org-ID. Modell
kontrolleras per tags plan/kvitto, inte från tillgängliga modeller eller filnamn. V6-källan samt P7/P6/rosa proven från
2026-11-10 använder `wan3` via developer-API. [Promptjämförelsen](../evidence/prompt-comparison.json) visar
skillnaderna: gamla centerklippet använder LH→RH-handbyte, P7-provet begär samma LH. Återanvänd inte centerinstruktionen
som om den beskrev en vänsterhandsutdelning till P7.

Nycklar skrivs aldrig i Git, manifest, dokument eller loggar. Blob/databas-/andra inloggningsuppgifter kopieras inte
utan ett konkret integrationsbehov. GitHub CLI använder sin befintliga inloggning; ingen tokenfil behövs här.

Tre underlag hålls isär: V6:s sexsekunders centerkälla, den äldre vita 12-sekundersbanken som byggdes till cirka tre
minuter, och den nyare gul/blå banken med en komplett 119,933-sekunderssekvens. [Historiska
promptar](../evidence/historical-p4-generation-inputs.json) och [nyare
sekvens-/källgranskning](../evidence/sequence-reuse-audit.json) binder rätt källa till rätt metod.
`tools/restore-sequence-review.ts` återställer den nyare 17-kortsfilmen byteidentiskt och klipper dess 16-kortsprefix
vid ruta 3296, i två format, utan ny API-generering.

`.env.local` laddas inte automatiskt av befintliga Node-kommandon. Verktyg som behöver den körs uttryckligen med
`node --env-file=.env.local <verktyg.ts>`. `DEALER_SCRATCH_ROOT=D:/dealer-scratch` och
`DEALER_REMOTE_GENERATION_ENABLED=false` är deklarerad konfiguration; renderern läser dem ännu inte. Flaggan är alltså
inte en implementerad generationsspärr.

Sökning i Codex på Windows: välj `rg.exe` vars sökväg matchar `*\OpenAI\Codex\bin\*\rg.exe` (`Get-Command rg.exe -All`)
och lägg dess mapp först i processens PATH, annars `Select-String`; ändra inte bestående PATH. (Flyttad från AGENTS
2026-11-13: den gäller ett verktyg på en dator.)

## Filmbeställning

Ett jobb är en enda handling mellan två ankare: en giv slutar vid verklig landnings- eller släppruta, en retur börjar
från den (ankarregeln och skarvregeln i SYSTEM). Hela vägen för en ny dealer, med stationer, format, kommandon och vem
som beslutar: [löpande bandet](../tools/dealer-line.md). Hur en beställning komponeras och vad som har hållit och
fallit: [handboken](../tools/film-prompting.md); hur den läggs, hämtas och efterarbetas:
[beställningsagenten](../tools/order-clerk.md); hur en film granskas: [granskningen](../tools/film-review.md). Nya fynd
förs in i handbokens tabeller, inte här. Vad som skickades och hur det gick: studions vy Protokoll
(`node tools/order-ledger.ts`).

- **En väg: Beställ** (sedan 2026-11-13). Utkast i studions vy Beställ (`data/orders/<id>.json`), godkänt med Jakobs
  klick eller av huvudagenten på hans uppdrag (`tools/order-approve.ts`) inom `data/order-policy.json`, lagt och hämtat
  av en beställningsagent genom Runways MCP-server på appkontot. Betalda anrop utanför Beställ rapporteras till
  huvudagenten med belopp (HANDOFF, "Vem äger vad").
- **Äldre vägar, används inte:** API-vägen (developer-API:t med `RUNWAY_API_KEY`: `tools/clip-job.ts` och
  `tools/clip-edit.ts` togs bort 2026-11-13, och verktygets enda rättade kopia står kvar under `edits`; jobben och taket `budget.maximumCredits` 5 162 i
  `data/clip-jobs.json`, helt intecknat 2026-11-12) och orderfilerna på D: (`filmagent/mcp/order-*.json`,
  `clerk-brief.md`, `register-mcp.mjs`; Paows `paow/order/` och liggarna `paow/bestallningar-*.json`). Deras kvitton och
  liggare är källbevis och står kvar; ett osäkert API-anrop beställs aldrig om, och `request.lock` eller SUBMITTING tas
  aldrig bort. Pamelas ankare byggdes med `tools/build-anchor.ts` ur riktiga videorutor (bara kortpixlar ändrade, mot
  fryst plan); engångsverktygen från 2026-11-10 (`generate-p4-control`, `generate-p7-direct`, `collect-pilot`,
  `closed-card-review`, `render-p4-placement` med `src/p4-placement-retarget.ts`) togs bort ur repot 2026-11-13 eftersom
  inget anropade dem; de finns i Git-historiken, och deras kvitton står kvar i `motions/` och `evidence/`. Bakgrund:
  [metodgranskningen](../evidence/generation-method-audit.json) och
  [API-/MCP-kontraktet](../evidence/runway-production-contract.json).
- **Inkorgen:** en tagning från en order förs in med `review.inbox: true` och spelas bara där steget saknar annan film
  tills Jakob har dömt den (`src/clip-graph.ts`); hans dom tar bort flaggan. En film som inte förs in men kan användas
  kopieras till `assets/films/<dealer>/<namn>/source.mp4` med `receipt.json` och får rollen film i
  `data/media-roles.json`.

### Lärdomar som gäller

Det som gäller själva beställningen (bilder, text, modell, längd, tagningar, efterarbete) står i handboken och i
beställningsagentens instruktion; här står det som rör banken, uppspelningen och helkroppen.

- **Givar slutar på sitt ankare** (sista rutan 17–47 px från landningsankaret vid kvartsstorlek), så returer från
  ankarbilden passar alla tagningar, och giv och retur kan beställas samtidigt.
- **Skarvar.** Varje klipp har ljusare grönt i sina första rutor och ett nivåhopp i de två sista: mät och klipp tre
  rutor in och två före slutet. Frysta rutor förekommer inne i rörelser och räknas vid granskning.
- **Helkropp.** In- och utgång beställs med en ritad ljusare grön bordsskiva ("flat cut-out shape with no depth"; ordet
  "block" gav en låda), som målas i varje rutas bakgrundsgröna efteråt (`mcp/slab-to-bg.mjs`). En verklig stående ruta
  som slutbild låser hennes storlek; att hon sätter sig beställs som egen del. Bankens ruta slutar cirka 80 punkter över
  hennes hjässa (stående cirka 240 punkter ovanför), därför helkroppsfilm med egen ruta (`motion.frame`, SYSTEM).
- **Ansiktsuttryck** gick inte med text, men med grundrutan där bara ansiktet bytts mot en redigerad stillbild; filmen
  blir ditvägen följd av samma rutor baklänges (`mcp/spegla.sh`).
- **Båda händerna** går att få om slutbilden inte låser vilken hand som lade kortet (`pamela-p2-c1-handover-01`). I
  givfilmerna har texten hittills sagt att den andra handen vilar.
- **Föremål** som inte finns i första bilden växer fram ur filten; en mugg måste finnas i bilden från början.
- **Kostnad för en hel dealer:** skattat 2026-11-12 cirka 5 000 krediter för en uppsättning med ett utdelningssätt (16
  kort och omtagningar); Paow hade 2026-11-13 kostat cirka 5 400 utan att vara färdig (räknat ur kvittona, se löpande
  bandet).

## Publik granskningssida och Blob

- Sida: `https://dealer-delta-eosin.vercel.app/`, team `scoutgaming`, projekt `dealer`, ID
  `prj_7zd112w6MIX9YnpcR7Nj64Ke50yk`. Canonisk lokal projektbindning: `.runtime/public-deploy/.vercel/project.json`.
- Blob: `dealer-media`, ID `store_qeojzIHuA5ewT4uO`, public, region `arn1`. Aktuella filantal/byte och anonym
  SHA-256-verifiering finns i [manifestet](../data/public-media.json) och
  [kvittot](../evidence/public-media-verification.json).
- `node tools/sync-public-media.ts` visar en plan utan uppladdning. `--upload` synkar endast det uttryckligen avgränsade
  biblioteket. Varje fil har innehållshash i namnet; befintliga objekt skrivs inte över. Granska tillåtna klipp-ID:n,
  antal och totalbyte tillsammans med varje katalogutökning. Vid avbruten uppladdning: kontrollera kvittot och exakt
  objekt, ladda inte upp en ny kopia på chans.
- Blob-nyckeln ligger enbart i Git-ignorerade `.runtime/blob-sync/.env.local`, skild från Runway-nyckeln. Ingen nyckel
  ska ligga i public-deploy eller byggpaketet. Den statiska sajten kräver ingen skrivnyckel.
- `node tools/build-public.ts` bygger ett litet statiskt paket i `.runtime/public-deploy/.vercel/output`. MP4-filer
  ersätts med verifierade Blob-länkar. Bygget fryser den aktuella sparade `placements/default.json` och avbryter om den
  ändras under bygget. Webbläsarens osparade utkast är inte publiceringsunderlag.
- Publik sparning använder den egna webbläsaren och säkra samtidighetskontroller. Den skriver inte till datorns
  placeringsfil eller en gemensam server. Export/import krävs för att flytta ändringar mellan publik och lokal vy.
- Vid ett större nytt granskningssteg uppdateras både GitHub och Vercel enligt Jakobs uppdrag. Testa och pusha den
  granskade koden, bygg från den committade versionen, publicera och verifiera anonym åtkomst samt faktisk uppspelning.
  Ge Jakob commit och direktlänk till det aktuella klippet. En spelbar underkänd film behåller sitt underkända beslut.
- Aliaset `dealer-scoutgaming.vercel.app` är skyddat och ska inte delas som publik länk. Senaste deployment och den
  gamla sidans avveckling står i [slutkvittot](../evidence/public-release.json).
- Gamla `scoutgaming/scout-dealerlab` (`prj_mQwHzspK3GrrJA04eFOorFxth0d5`) är borttaget efter verifierad ersättning och
  Jakobs delegerade beslut. API och gammal domän ger 404; nya projektet och sju Blob-filer är verifierat kvar. Inget
  separat gammalt GitHub-repo identifierades. Specialvyerna för äldre bildrute-/kortkontaktgranskning är bevarade i
  D:-arkivet.

## Den låsta kopian på nätet

Studion som låst kopia för Jakobs chef (Jakob 2026-11-12 och 2026-11-13: lösenordet "john", Scen och Casino med Paow).
Allt går att läsa och spela, inget går att ändra, och inga kostnader visas.

- **Adresser:** `https://dealer-lake.vercel.app` (den Jakob känner) och `https://dealer-studio-one.vercel.app` (projektets
  egen), båda produktionsadresser för `dealer-studio`. Lösenordet är `john` (även `jon`, som Jakob skrev 2026-11-13). Efter
  lösenordet kommer studion med vänsterspalten: Scen, Karta, Primära, Granska, Prov, Placering, Material, Casino och
  Önskemål. Publicerad 2026-11-13: `e7c006d` kl. 16.35, `26dc99b` kl. 17.12 (med `tools/publish-studio.ts`).
- **v0:s projekt `dealer`** (skapat 2026-11-13 kl. 05.41 i samma team, kopplat till GitHub-repot och byggt vid varje push,
  utan miljövariabler och store, med bara `dealer-lake.vercel.app`, som gav 404) togs bort 2026-11-13 kl. 17.20 på Jakobs
  ja; adressen flyttades till `dealer-studio`.
- **Vercel:** team `jakeminator123s-projects` (Pro), projekt `dealer-studio`, utan Git-
  koppling: varje version läggs upp färdigbyggd. Projektets och teamets id står bara i länken
  `.runtime/studio-deploy/.vercel/project.json` (utanför Git). Skydd: Vercels standard (förhandsversioner och de genererade
  deployadresserna bakom Vercels egen inloggning; produktionsadresserna öppna fram till kopians eget lås).
- **Blob:** `dealer-studio-media`, public, `arn1`, kopplad till `dealer-studio`. Storens id står bara i kvittot (nedan) och
  skrivs inte i repot: objekten heter efter sitt innehåll (`studio/<sha256>.<ext>`), filmernas sha256 står i `motions/`, och
  med id:t går varje film att hämta direkt ur den publika storen utan lösenord. Ett objekt skrivs aldrig över. Låset
  hämtar en film ur Blob med det intervall (Range) som webbläsaren frågar efter och svarar privat, så webbläsaren ser
  aldrig Blob-adressen och ingen CDN behåller filmen. En omskrivning till Blob (`DEALER_MEDIA_MODE=rewrite`) används inte: mätt 2026-11-13 behöll Vercels CDN då den
  första delen av en film för dess adress och lämnade samma 1 000 byte till varje senare fråga, så filmerna spelade inte.
  Projektet har `DEALER_MEDIA_MODE=proxy`, och från `cloud/studio/gate.ts` efter 2026-11-13 är det förvalet.
- **Låset:** miljövariablerna `DEALER_LOSEN` (`john,jon`; flera lösenord skiljs med komma) och `DEALER_KAKNYCKEL` (48
  slumptecken, gjorda i röret till `vercel env add` och aldrig nedskrivna), Production, känsliga (går inte att läsa
  tillbaka). Nytt lösenord: `vercel env rm DEALER_LOSEN production` och `printf '<ord>' | vercel env add DEALER_LOSEN
  production`, båda med `--cwd .runtime/studio-deploy`, sedan en ny deploy; alla gamla inloggningar slutar då gälla.
- **Boten** följer med men har ingen `BOT_BLOB_TOKEN`: den svarar att den saknar lagring och anropar ingen modell, så den
  kostar inget. Att slå på den (egen privat store, nyckel, tak) är Jakobs beslut.
- **Vad som går upp** avgör `data/studio-release.json` (tagningar per dealer, vad spelet kan spela, prov, förval, spärrade
  namn, gränser); `tools/build-studio-snapshot.ts` bygger kopian och skriver tabellen. I kopian spelar spelmotorn i
  `game/` i själva spelsidan (`cloud/studio/game-local.ts`), eftersom det inte finns någon server som håller ett spel.
  Munlapparna i `data/speech-patches.json` följer med som statiska filer (post, remsa, ljud), var och en kontrollerad mot
  registrets och postens sha256; en lapp vars film inte går upp eller vars filer inte stämmer lämnas ute, och spelet säger
  då repliken med talfilmen. Vercel lämnar ut `line.wav` som `audio/wave`.
- **Tillståndet ligger utanför Git, i Jakobs utcheckning:** `.runtime/studio-deploy/` (länken `.vercel/project.json`,
  `build.json`, `media-plan.json`, trädet som läggs upp), `.runtime/studio-blob/.env.local` (storens nyckel och inget
  annat) och `.runtime/studio-blob/studio-media.json` (kvittot med varje films Blob-adress). Kvittot hör aldrig hemma i
  Git: repot är publikt, och adresserna skulle öppna varje film utan lösenord. Nyckeln `BLOB_READ_WRITE_TOKEN` i
  utcheckningens egen `.env.local` hör till `dealer-lab-tal` (talbanan) och används aldrig här;
  `tools/sync-studio-media.ts` vägrar den och varje nyckel i miljön. Kör aldrig `vercel blob …` eller `vercel env …` i
  repots rot.

### Publicera igen från en nyare commit

```
node tools/publish-studio.ts                         planen: commit, arbetskopia, stegen; inget körs
DEALER_LOSEN_PROV=john node tools/publish-studio.ts --kor
```

`--kor` bygger `origin/main` (eller `--commit <ref>`) i en egen ren arbetskopia,
`D:/dealer-scratch/tmp/publiceringsagent/kopia` (detached, `npm ci` när en låsfil har ändrats, `assets/` som en koppling
till Jakobs media), med arbetskopians egen labbserver på 4341. Den startas oförändrad med en startmodul som flyttar porten
och låter bli att städa D:; labbservern på 4319 startas, stoppas och frågas aldrig, utom om en mediefil lämnas ut. Sedan:
bygget, uppladdning av de filmer och bilder som är nya (oförändrade objekt skickas inte igen), bygget en gång till så att
låset får adresserna, `vercel deploy --prebuilt --prod` från `.runtime/studio-deploy` och kontrollen utifrån: utan kaka ska
varje sida, svar och film ge inloggningssidan; med `DEALER_LOSEN_PROV` loggar den in och prövar första sidan, en film med
Range och att kopian säger rätt commit. Bygget stannar om arbetskopian inte är ren, om en modul har en maskinsökväg eller
ett spärrat namn, om klippbanken ändras under bygget eller om Blob-delen går över gränsen i registret. Första
publiceringen 2026-11-13 tog cirka 40 minuter, mest uppladdningen (1,7 GB); den andra (`26dc99b`) tog 6 minuter, varav 3
för studions npm-paket, och skickade en ny film.

**Det som ska finnas på plats** innan `--kor` (verktyget stannar med ett besked om något saknas):

- Körningen görs från Jakobs utcheckning (`C:/Users/jakem/dev/super-feature-sg/dealer`), med koden som ska ut pushad till
  `origin/main`; utcheckningens egna ocommittade filer kommer aldrig med.
- `.runtime/studio-deploy/.vercel/project.json`, länken till `dealer-studio` (finns sedan 2026-11-13; gjordes med `vercel
  link --yes --project dealer-studio --scope jakeminator123s-projects --cwd .runtime/studio-deploy`). Utan den:
  `VERCEL_ORG_ID` och `VERCEL_PROJECT_ID`. Verktyget frågar Vercel vilket team länken gäller och skickar inget annars.
- `.runtime/studio-blob/.env.local` med storens nyckel och `.runtime/studio-blob/studio-media.json`, kvittot som säger
  vilken store (båda finns sedan 2026-11-13).
- Vercel CLI inloggad med ett konto i teamet (`vercel whoami` ger `jakeminator0`), labbservern på 4319 igång (den svarar
  på om en mediefil lämnas ut; utan den lämnas sådana filer, till exempel Paows bild i spelets dealermeny, utanför),
  porten 4341 ledig och Scoutgaming utcheckat bredvid (`C:/Users/jakem/dev/scoutgaming`, botens kunskap; annars
  `DEALER_SCOUT_ROOT`).
- `DEALER_LOSEN_PROV=john` framför kommandot för kontrollen med lösenordet; utan den prövas bara att allt är låst.

**När ett steg stannar halvvägs** står kopian på nätet kvar som den var, utom om det är kontrollen efter deployen:

- *Arbetskopian är inte ren:* `git -C D:/dealer-scratch/tmp/publiceringsagent/kopia status`. Ändra eller committa aldrig
  där; ta bort ändringen (`git -C … checkout -- <fil>`) och kör igen.
- *npm ci eller bygget stannar:* läs beskedet. En modul med en maskinsökväg eller ett spärrat namn rättas av den som äger
  filen och pushas; "Klippbanken ändrades medan kopian byggdes" betyder kör igen; taket för Blob, se nedan.
- *Uppladdningen bryts:* kör igen. Ett objekt som redan ligger i storen känns igen på namn och storlek och skickas inte
  på nytt (`.runtime/studio-blob/progress.json` visar hur långt det kom); kvittot skrivs när allt är verifierat.
- *Något svarar redan på 4341* (en körning dog med sin labbserver kvar): stoppa den med dess egen nyckel, `node -e
  "fetch('http://127.0.0.1:4341/stop',{method:'POST',headers:{'x-dealer-token':require('D:/dealer-scratch/tmp/publiceringsagent/kopia/.runtime/preview.json').token}})"`.
  Stoppa aldrig något på port eller processnamn.
- *Deployen stannar:* trädet är klart; kör bara den igen: `vercel deploy --prebuilt --prod --yes --scope
  jakeminator123s-projects --cwd .runtime/studio-deploy`.
- *Kontrollen efter deployen faller:* lägg tillbaka den förra versionen med `vercel rollback --scope
  jakeminator123s-projects --cwd .runtime/studio-deploy` (eller `vercel ls dealer-studio --scope jakeminator123s-projects`
  och `vercel promote <adress>`), och läs vad som föll innan nästa försök.

- **Taket för Blob** är `limits.blobBytes` i `data/studio-release.json`, 2,2 GB sedan 2026-11-13 (Paows andra omgång
  talfilmer gjorde delen 1,72 GB). Går delen över taket stannar bygget innan planen skrivs: inget laddas upp och inget läggs
  ut, och kopian på nätet står kvar som den var. Höj taket i registret först när tabellen visar vad som har vuxit.
- **Storen rymmer** (2026-11-13 kl. 17.12) 234 objekt, 1 736 MB: Paows filmer för spelet och rundan med 51 talfilmer,
  Pamelas runda, godkända och varianter, sex prov och tre filmer för scenen. Objekt som en senare kopia inte längre visar
  ligger kvar i storen (de skrivs aldrig över och tas inte bort av verktyget); kvittot listar dem.

- Provbygge utan publicering: `node tools/build-studio-snapshot.ts --prov` och `node tools/serve-studio-snapshot.ts
  --prov` (port 4330, med påhittat lösenord och nyckel), se verktygens huvuden.
- Ta bort kopian (på Jakobs ord): `vercel project rm dealer-studio` och `vercel blob delete-store <storens id ur kvittot>`, båda
  med `--scope jakeminator123s-projects`.
- **Kostnad** (Pro, ur teamets månadskredit på 20 USD): lagringen cirka 1,7 GB × 0,023 USD per GB och månad ≈ 0,04 USD;
  trafiken ingår i Pro-planens Flat Rate CDN (1 TB) och kostar annars cirka 0,05 USD per GB; en visning av Casino med en
  runda läser cirka 150 MB film. Uppladdningen är cirka 250 Blob-operationer ≈ 0,001 USD.

## D: och städning

Slaskmapparna är skapade. Efter arkivraderingen 2026-11-10 hade C: cirka 106,2 GiB ledigt. Diskflytt frigör diskutrymme,
inte RAM i sig. Ändra inte global TEMP/PATH och skapa inga nya runtime-junctions. Tillfälliga jobb kan få processlokal
`TEMP`/`TMP` mot `D:/dealer-scratch/tmp`.

V6-renderern skriver fortfarande till dealer/output/v6. Utdataflytt måste implementeras/verifieras av verktygsägaren;
miljövariabeln ensam flyttar inget. Original och pågående review bevaras.

`data/library.json` refererar till den bevarade porträttreproduktionen i `output/v6/take-01`. Den får inte rensas som
slask medan katalogen refererar dit. Katalogen innehåller bara sökvägar/hashar, inga uppladdade filmer; diagnostiska
beslut hämtas från motions-registret.

Gamla labbet är fullständigt arkiverat på `D:/dealer-archive/snyggare-dealer`, och C:-originalet är borttaget utan fel
enligt [arkivkvittot](../evidence/archive-move.json). Efter kontrollerad serverstopp omfattade det 194 531 filer och 163
182 601 679 logiska byte. Varje vanlig fil SHA-256-jämfördes på båda sidor; katalogstruktur, Git-historik/index, 34
ändrade tracked filer och 410 individuella untracked filer bevarades. Den tidigare inventeringens uppgift om noll
tracked ändringar var felaktig.

Windows lediga C:-utrymme ökade under själva raderingen med 94 016 409 600 byte (cirka 94,02 GB / 87,56 GiB). Logiska
fillängder är inte fysisk diskanvändning; äldre verktyg skapade hårdlänkar och det fanns mycket upprepat innehåll.
Ursprungliga filers fysiska allokering/länkantal mättes inte, så 163,18 GB får inte rapporteras som faktiskt frigjort
utrymme.

Gamla servern 4318 stoppades via kontrollkanalen och process/port kontrollerades. Den enda interna junctionen kopierades
inte genom traversal: arkivlänken återställdes till motsvarande interna D:-mål, och C:-länken togs bort före rekursiv
källradering. Inga länkar från nya dealer till arkivet skapades. Fullständiga inventeringar, filhashar, Git-jämförelser
och raderingskvitton finns under `D:/dealer-archive/receipts/20261110-snyggare-dealer`. Arkivet är läsreferens;
historiska C:-sökvägar där inne är proveniens och har inte massändrats.

Före arkivflytt: registrera exakta käll-/målrot, ägare, worktrees, untracked/ignorerade filer, reparse-mål och
processidentitet. Stoppa bara verifierat ägda tjänster via kontrollkanal. Kopiera till ett nytt avgränsat arkivmål utan
att följa junctions; jämför filantal/byte/SHA-256 och verifiera återläsning. Separat godkänd källradering kan därefter
frigöra C:. Befintliga D:-delarkiv får inte skrivas över.

Rensning kräver ett kandidatbeslut med källa, ägare, referenser och verifierad ersättning. Filnamnslikhet eller inaktiv
process räcker inte. Osäkert material stannar för granskning. Endast det uttryckligen beställda gamla projektet togs
bort från C:. Nya dealer, preview 4319, ChatGPT, Utforskaren och andra projekt bevarades.

**Städverktyget** (2026-11-12). `npm run stada` (`tools/scratch-clean.ts`) är en torrkörning: rapport per regel, inget
ändras; `-- --lista` visar varje träff och `-- --forklara <sökväg>` varför något lämnas. `-- --kor` utför. RADERA tar
bara det som går att göra om: headless Chrome-profiler, `node_modules`, Nodes och Pythons cacher, Chromes `scoped_dir*`,
lösa `*.tmp` och loggar äldre än en vecka. ARKIVERA flyttar skärmbilder och rutdumpar äldre än en vecka till
`D:/dealer-archive/slask/<år-månad>/<samma sökväg under dealer-scratch>`. Varje flytt och radering skrivs i
`D:/dealer-archive/slask/arkiv.json`, och `-- --aterstall <post>` flyttar tillbaka. Kontaktark och sessionsmappar som
ingen ändrat på två veckor kräver dom och flyttas bara med `-- --kor --regel kontaktark` (eller `avslutad-session`);
`--tyst` gör aldrig det. Reglerna står som data överst i verktyget.

Skydden går inte att slå av. Verktyget rör aldrig: det som ändrats de senaste tre dygnen; mappar som HANDOFF, README,
AGENTS, `docs/*.md`, `data/*.json` eller agenternas minne namnger med sökväg. En namngiven mapp skyddar allt i den; en
fil direkt i en sessionsmapp skyddar bara sig själv. Namnge därför undermappen, inte hela sessionen, när bara den ska
leva kvar; mappar med beställningsliggare eller kvitto (`bestallningar*`, `order-*`, `uploads-*`, `tasks-*`, `*kvitto*`,
`request.lock`); `chrome-meshy`, Python-miljöer, mappar som en körande process namnger och mappar med länkar; film och
ljud, som aldrig raderas, och allt utanför `D:/dealer-scratch`. 2026-11-12 togs 1,3 GB slask bort för hand (17 headless
Chrome-profiler och en `node_modules`). Labbservern kör `--kor --tyst` en gång per start; utfallet står i
`.runtime/stada.log`. Samma dag kopierades bilder och filmer som används eller kan användas från D: till `assets/` (0,74
GB, SHA-256-kontrollerat, inget flyttat eller raderat på D:); rapporten
`D:/dealer-scratch/tmp/huvudagent/import/RAPPORT.md` säger vad som ligger kvar och varför.

Två lokala kopior av arkivets inventeringskvitton har därefter tagits bort efter SHA-256-kontroll mot bevarade
D:-original och processkontroll: 81 609 952 logiska byte; fysisk frigörelse mättes inte. [Städkvitto och
coachtriage](../evidence/coach-production-triage.json). Behåll befintliga JSON-register nu; ingen SQLite, lokal Postgres
eller ny Neon-miljö har skapats. [Lagringsbedömningen](../evidence/storage-choice-review.json) anger övergång till
Scouts befintliga Postgres-adapter när delade skrivare och atomisk historik behövs. Hela gamla chatthistoriker ska inte
följa med en handoff; ge aktuell HANDOFF och de få relevanta registren.

## Molnmiljö

Codex stöder sparade molnmiljöer via **Settings → Codex Cloud → Environments**, med repo, verktyg och
nätverkskonfiguration. Detta är separat körning, inte mer RAM till den lokala chatten. Se [OpenAI Docs: Cloud
environments](https://learn.chatgpt.com/docs/environments/cloud-environments).

Livekontroll: en sparad miljö `scoutgaming` finns, `status=ready` men `runnable=false`; ingen dealer-miljö finns i den
tillgängliga listan. Ingen miljö skapad eller startad här. Den befintliga Scout-miljön återanvänds inte för dealer utan
uttrycklig projektbindning.

Förbered en privat dealer-miljö med detta repo, Node 24.21.0 och `npm ci`. GitHub saknar media, så full
V6-verifiering/rendering kräver separat registrerade assets, FFmpeg/FFprobe och högst fyra arbetare. Källhashar ska
verifieras före rendering. Runway kan vid behov tillföras som HTTP-hemlighet begränsad till `api.dev.runwayml.com`;
kopiera inte hela gamla env. Kontoåtkomst, mediaöverföring och eventuell kostnad behöver vara konkreta innan start.
