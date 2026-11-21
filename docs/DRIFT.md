# Drift, anslutningar och återbruk

Rutiner och anslutningar. Genomgånget 2026-11-18 mot koden och diskarna; det som rör Vercel och Blob är inte
kontrollerat mot tjänsterna sedan 2026-11-13. Läget och ägare står i HANDOFF och i banornas lägesfiler (`docs/lage/`),
beslut per film i `motions/`.

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

Vad som kräver Jakobs uttryckliga ord (deploy, mediauppladdning, databasändring, Scout-integration) och vad som gäller
betald generering står i AGENTS, "Det som skyddar Jakob". GitHub-repot är källförvaring, inte en publicerad studio
eller webbplats.

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
  dem. Studions kod, register och dokument omfattas också: annars kan testet bli grönt på andra filer än de som
  pushas. `placements/default.json` är det uttryckliga undantaget för användarutkast och inkluderas inte automatiskt.
  Ett oincheckat orderutkast bevaras; kör kontroll och push från ett rent träd med `push-clean` i det fallet.
  Kontrollen kör testfilerna som `test`-skriptet i `package.json` namnger, läst ur den commit som kontrolleras (bland
  dem `studio/tests/*.test.ts`), alltså samma filer som `npm test`; ett vakttest i `tools/publication-check.test.ts`
  fäller en testfil i `tools/` som skriptet inte namnger. Högst fyra arbetare, utan Runway, media eller deploy; tester
  som gör en liten film med FFmpeg hoppas över där FFmpeg saknas. En ny testfil skrivs in i `test`-skriptet i
  `package.json`, och bara där.
- GitHub kör ingen kontroll för det här repot (Jakob 2026-11-18: det som gäller dealer görs lokalt, inte på GitHub;
  arbetsflödet `.github/workflows/check.yml` är borttaget). Kontrollen är pre-push-hooken och `push-clean`, på den här
  datorn. I en ren checkout utan media och utan FFmpeg hoppas de tester över som gör en liten film med FFmpeg eller
  läser bankens filmer och kortspår (`tools/order-images.test.ts`, `tools/card-overlay.test.ts`). Studions tester
  behöver inte `studio/node_modules`. Före PR kör agenten `npm run check`.
- **Push medan andra skriver** (2026-11-13). I huvudträdet stoppar kontrollen så länge någon sessions testindata
  skiljer sig från HEAD eller en ospårad fil ligger där, och det gör den nästan alltid en dag med flera
  sessioner. Huvudagenten pushar då från ett uttryckligen valt rent IDE-arbetsträd med `node tools/push-clean.ts
  [<commit>] --trad <mapp> [--dry-run]`: trädet ställs detached på commiten (förval `main`) och måste vara rent, `npm
  ci` körs om paketlistan har ändrats eller `node_modules` saknas, sedan `npm test`, `npm run check` och `git push
  origin HEAD:main`, och sist lokal och fjärrens SHA. Verktyget stannar vid första steg som faller med en rad som börjar
  STOPP och lägger varje stegs logg i `push-logg` bredvid trädet; `--dry-run` gör allt utom `git push`. Återanvänd ett
  lämpligt träd eller skapa det via IDE:n vid behov, och städa det när uppgiften är klar. Ingen disk väljs automatiskt;
  verktyget vägrar huvudträdet och ett träd ur ett annat repo. Det som pushas är
  incheckade commits, aldrig någons öppna filer.
  Förkontrollen får fjärrens verifierade `main`-SHA som `--base`, så ett detached träd inte behöver granska hela
  historiken igen. Pre-push kontrollerar fortfarande Git:s verkliga pushintervall. Sammanfattningen skiljer
  godkänt, fel, avbrutet, överhoppat och TODO; efter push måste fjärrens SHA motsvara den avsedda committen.
- **Testerna läser Jakobs arbetsfiler som de är incheckade** (2026-11-18). Hans kortplan (`placements/default.json`)
  och ett utkast i `data/orders/` som inte är incheckat ändras när han sparar i labbet. Ett test som behöver dem tar
  dem ur HEAD med `tools/committed.ts`, så att `npm test` säger samma sak i huvudträdet som i ett rent träd. Rött i
  huvudträdet är därmed ett verkligt fel, inte hans osparade arbete.
- **Claude Codes inställningar för repot** (2026-11-18, `.claude/settings.json`; Jakob: "glb-modeller och andra stora
  filer ignoreras för att spara pengar"). Fyra saker står där. Läsning av modeller, film, ljud, arkiv och låsfiler
  nekas. Läsvakten (`.claude/hooks/read-guard.mjs`) nekar en hel läsning av ett dokument eller register över 32 KB
  och av en kodfil över 100 KB; en del läses med `offset` och `limit`, högst 400 rader. En chatt komprimeras vid
  300 000 tokens (`autoCompactWindow`) i stället för vid fönstrets slut, eftersom varje tur läser om hela kontexten.
  Kontorsskillerna listas bara med namn (`skillOverrides`). En ändring gäller nya sessioner; i en pågående session
  läses den in med `/hooks`. Sökningens motsvarighet är `.ignore` och `.cursorignore`.
- **Rött:** stoppa, undersök orsak och rätta innan nytt försök. **Gult:** granska och åtgärda eller förklara kvarvarande
  begränsning kort i `docs/BRISTER.md` före push/PR. Varningarna visas i agentens terminal och som CI-annoteringar. Granska även
  hook/testens relevans och falsklarm; vid verkligt kontrollfel, rätta med ett avgränsat regressionstest. Hoppa inte
  över kontrollen för att få grönt.
- Känd Node-varning: `stripTypeScriptTypes` (`forBrowser` i `tools/lab-routes.ts`, som labbservern, kopians bygge och
  `tools/lab-modules.test.ts` använder) är ett experimentellt Node-API. Varningen är spårad till detta API och testerna passerar. Den bevaras synlig; utred
  kompatibiliteten vid ändrat API/Node, utan att stänga av varningar generellt.
- **Grenar.** `main` är den enda långlivade grenen. En kortlivad gren (till exempel en worktree för ett avgränsat
  arbete) slås ihop i `main` av huvudagenten och tas sedan bort, lokalt och på GitHub.
- **Taggar.** Ett läge som ska gå att komma tillbaka till får en tagg på den pushade commiten, satt på utcheckad HEAD
  (hooken släpper bara igenom den) och aldrig flyttad; media ligger utanför Git och följer inte med. Etapptaggarna
  `jakob-3` till `jakob-7` (2026-11-11) står kvar i historiken men rutinen används inte längre; det som gäller är
  återställningsbara versioner.
- **Återställningsbara versioner** (Jakob 2026-11-13: "Spara dock nuläget efter push som typ "Återställningsbart
  version 2" för allt är bra"). En tagg på den pushade commiten, och i `D:/dealer-archive/<namn>/` en bundle av hela
  historiken och en kopia av allt som ligger utanför Git (`assets/`, `output/`, `.runtime/` utan hemligheter), jämförd
  mot källan med SHA-256 fil för fil. Mappens `LASMIG.md` säger hur läget återställs, och skripten i `kvitton/skript/`
  körs om med nytt namn för nästa version. Version 1 är `D:/dealer-archive/V2-backup-studio/` (taggen `fore-struktur`,
  `ce901d6`, 2026-11-12). Version 2 är `D:/dealer-archive/aterstallningsbar-version-2/` (taggen
  `aterstallningsbar-version-2`, `c9c3cf2`, 2026-11-13: 4 103 mediefiler, 10,7 GB, 0 avvikelser).
- Fem kanoniska dokument måste finnas: README (start), AGENTS (arbetsregler), HANDOFF (läget nu, ansvar, hinder), SYSTEM
  (kontrakt) och DRIFT (rutiner, anslutningar). Saknas ett av dem stoppar kontrollen (rött; listan `CANONICAL` i
  `tools/publication-check.ts`). Längden mäts bara för HANDOFF och banornas lägesfiler i `docs/lage/`, som har tak
  (`tools/handoff.test.ts`); en ny sida under `docs/` eller en arbetsinstruktion i `tools/`
  är välkommen när ett ämne behöver en egen. Uppdatera på plats när beteende eller ansvar ändras, och
  länka till befintliga JSON-register och kvitton i stället för att kopiera dem.

## Labbservern och fliken

- `START.cmd` kör `node tools/preview.ts --open`: servern på `http://127.0.0.1:4319` startas vid behov i ett eget
  fönsterlöst processträd (TEMP och TMP på `D:/dealer-scratch/tmp`) och visar labbets första sida. `STATUS.cmd` och
  `STOPP.cmd` frågar och stoppar via kontrollkanalen och svarar "inte igång" i stället för att fela. `--restart` byter
  server utan att fliken stängs.
- 3D-sidan, Ljud och Modeller ligger i `pages/` och spelets sida i `game/page/`; servern lämnar ut dem på sina
  rotadresser (`/scene3d.html`, `/sound.html`, `/props.html`, `/game.html`) via kartan `PAGES` i `tools/lab-routes.ts`.
  `/` och `/lab.html` (också med `?gamla=1`) leder till studion, så att gamla länkar fungerar.
- **Servern lämnar ut arbetsträdet, och bara modulerna i sin lista** (`SCRIPTS` i `tools/lab-routes.ts`, läst när
  servern startar). En halvfärdig ändring i en sessions fil syns alltså direkt för alla, Jakobs flik också. En ny
  modul under `src/` görs i den här ordningen: filen på plats utan att något importerar den, raden i listan,
  omstart (`node tools/preview.ts --restart`, huvudagenten, i en lucka utan tagning), och först därefter importen.
  Importen före listan ger 404 för modulen, och då laddar varken spelet eller Scen i någon webbläsare (det har hänt
  två gånger). `node --test tools/lab-modules.test.ts` läser varje utlämnad moduls importer och säger vilken granne
  som saknas eller vilken listad modul som inte är skriven, utan webbläsare; kör det efter en ny import och före en
  tagning.
- **En inspelning säger varje nyckel som kan ändras.** Scenens förval ändras ibland samma dag som en film spelas in;
  en tagning som utelämnar en nyckel får det trädet säger i den minut sidan laddas. Skriv ut nycklarna i tagningens
  adress (`filmEven`, `filmTempo`, `dealerLife`, `cups`, `cards`).
- **En labbflik** (2026-11-12): varje labbsida håller en ström öppen mot servern (`src/preview-ui.ts`, `/tab/events`).
  Den nyaste sidan är labbfliken; en äldre stänger sig själv, eller blir tom där webbläsaren vägrar.
  Codex webview föredras: inventera och återanvänd dess labbflik. Om ingen är åtkomlig öppnas exakt en via
  datorverktyget, och dess ID behålls för fortsatt testning. Redan godkända lokala tester kräver inte nya frågor om
  omladdning, navigering eller skärmbilder. I vanlig webbläsare återanvänder `node tools/preview.ts --open "<sida>"`
  den öppna fliken. Öppna aldrig labbadressen med `Start-Process` eller `start` (AGENTS, "Labbservern").
- Servern står kvar tills den stoppas med `STOPP.cmd` eller `--stop`. Före en länk till Jakob: `node tools/preview.ts
  --ensure` startar servern om den inte går, utan att öppna eller flytta någon flik. Stäng inte andra projekts
  servrar, och stoppa aldrig via processnamn eller port.
- **Studion byggd ur det incheckade** (2026-11-17). Servern lämnar ut huvudträdets `studio/out`, och ett bygge där bär
  med sig varje sessions halvfärdiga studiofiler till Jakobs flik. `node tools/studio-from-commit.ts [<commit>] --trad
  <mapp> [--ut <mapp>]` bygger commiten (förval `main`) i ett uttryckligen valt rent IDE-arbetsträd (detached, `npm ci` där en
  paketlista har ändrats eller `node_modules` saknas, `npm --prefix studio run build`) och byter in resultatet i
  huvudträdets `studio/out` först när bygget har lyckats: kopian läggs bredvid som `out.ny`, den gamla mappen flyttas
  undan och den nya in. Ett bygge eller en flytt som faller lämnar det som visas orört, och `studio/out/bygge.json`
  säger vilken commit som visas. Återanvänd ett lämpligt träd eller skapa det via IDE:n vid behov. `--trad` krävs;
  verktyget väljer inte arbetsplats eller disk. Se [lokal arbetsplats](../tools/local-work.md).
  Push och bygge använder trädet i turordning. Loggarna ligger i `studio-logg` bredvid; ett körkvitto med full SHA
  sparas i huvudträdets journal efter varje påbörjat bygge. Renhet och indata kontrolleras direkt före och efter
  bygget; ändrade filer stoppar bytet även om HEAD är oförändrad. Servern startas inte om.
- **En titt på labbsidor** (2026-11-17): `node tools/lab-look.ts <lista.json> <utmapp> [--vad "<vad>"] [--vem <namn>]`
  tar en skärmbild per sida i listan (`[{name, url, wait, width, height, clicks, facts}]`, adresserna efter
  `http://127.0.0.1:4319`) i en egen headless Chrome (egen profil, port 9591), aldrig i Jakobs flik: varje adress får
  `robot=1`, så sidan tar aldrig labbflikens plats. Den körs under det delade låset för grafikkortet och headless
  Chrome (`D:/dealer-scratch/tmp/gpu-och-headless.lock`; regeln i [TAL](TAL.md), "Så skickas ett jobb"): väntar medan
  låset är yngre än 20 minuter, högst 20 minuter, och stannar då med vems det är. Chrome stängs och kontrolleras efteråt,
  profilen tas bort och låset släpps bara om det fortfarande är körningens. Listan får bara trycka på det som ställer vyn,
  aldrig det som sparar; labbservern startas inte härifrån.
- Andra portar på datorn hör till syskonsessioner: 4320 Pamela-filmens sida
  (`D:/dealer-scratch/tmp/reel/page/serve.mjs`, lånar 4319), 4331 den frysta 3D-scenen v1
  (`D:/dealer-scratch/tmp/bakgrund-3d/START-BAKGRUND-3D.cmd`), 9391 Jakobs inloggade Meshy-Chrome.

## Arbetsskript utanför repot

Skript, beställningsfiler, liggare, mallar och startprompter ligger kvar på D: tills de förs in i repot eller avvecklas;
bilder och filmer som används eller kan användas ligger i `assets/` (AGENTS). Sökvägarna gäller under
`D:/dealer-scratch/tmp/` om inget annat sägs.
- **Film, vägen före Beställ** (källbevis och förlagor; dagens väg står under Filmbeställning):
  `filmagent/register-mcp.mjs`; i `filmagent/mcp/` orderfilerna, `clerk-brief.md`, liggaren
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
| Runway connector | Autentiserad workspace `Jakob`, ID `67037521`. Inloggning och skrivschema kontrolleras var för sig; modellistan från `whoami` bevisar inte att klienten kan skicka modellens parametrar. |
| Runway MCP-server | `https://mcp.runwayml.com/mcp`, appkontots krediter (workspace `Jakob`). Claude har servern som `runway`, Codex som `Runway`; inloggningen tillhör respektive klient och är inte gemensam. Kontrollera den aktuella sessionen före beställning. `https://dev.runwayml.com/mcp/claude` är en annan server (utvecklarportalen), inte för generering. |
| Direkt API | Ingen kod anropar Runways API längre; allt beställs genom MCP-servern. `RUNWAY_API_KEY` ligger kvar i den Git-ignorerade `.env.local` och drar developer-projektets krediter, en annan pott än appkontots; API-svaret ger inget projekt- eller workspace-ID, så nyckeln bevisar inte samma saldo. Kvitto från 2026-11-10: `.runtime/connection-check.json`. |

**Modellkunskap och API (kontrollerat 2026-11-19).** [Runway Dev-pluginen](https://docs.dev.runwayml.com/guides/plugin/)
ger dokumentation, modellfält, priser och API-jobbdiagnostik; den genererar inte filmer. Cursor installerar med
`/add-plugin runway-api`; Claude Code med `/plugin install runway-api@claude-plugins-official` och aktuell guides
inloggning. Installera en gång, inte både plugin och dubbla skills. Detta är ett förslag, ingen utförd installation.
API-projektet måste identifieras separat före aktivering. MCP-beställningen har redan frysta indata, hashkontroll,
budgetreservation och jobb-ID; API ger främst en körbar produktionsintegration och fler exponerade fält, inte automatiskt
bättre rörelser. En framtida API-transport ska använda samma order/kvitto och aldrig återförsöka ett osäkert köp.
Codex skickade denna dag Kling 4 med start/slut direkt genom sin MCP. Mellanbilder finns i
[Klings API-kontrakt](https://docs.dev.runwayml.com/openapi.json), men saknas i aktuellt `generate_video`-schema här.
Skicka dem inte som vanliga referensbilder och påstå att de styr en viss tidpunkt. Modellråd: handbokens §3.8.

Om Codex-klientens skrivschema saknar Kling 4 eller `referenceVideos` kan huvudagenten använda den befintliga,
inloggade Claude-klientens `runway`-MCP. Kontrollera `claude mcp get runway`, därefter `whoami` och det faktiska schemat.
Avgränsa hjälparen till Runway, `whoami` och ett enda godkänt genereringsanrop; fryst request går via stdin, privata
resultat till `.runtime/`. Samma `order-put begin/placed` gäller. Jämför verktygsanropets argument med ordern, spara
task-id direkt och gör aldrig en automatisk omtagning. Kopiera inga OAuth-uppgifter mellan klienterna.

V6-källan och proven från 2026-11-10 (P7, P6, rosa) gjordes med `wan3` genom developer-API:t; vilken modell en film har
läses i dess kvitto, inte i filnamnet. [Promptjämförelsen](../evidence/prompt-comparison.json) visar skillnaden: det gamla
centerklippet byter hand (LH→RH), P7-provet begär samma vänsterhand. Återanvänd inte centerinstruktionen som om den
beskrev en vänsterhandsutdelning till P7.

Nycklar skrivs aldrig i Git, manifest, dokument eller loggar. Blob/databas-/andra inloggningsuppgifter kopieras inte
utan ett konkret integrationsbehov. GitHub CLI använder sin befintliga inloggning; ingen tokenfil behövs här.

Tre underlag hålls isär: V6:s sexsekunders centerkälla, den äldre vita 12-sekundersbanken som byggdes till cirka tre
minuter, och den nyare gul/blå banken med en komplett 119,933-sekunderssekvens. [Historiska
promptar](../evidence/historical-p4-generation-inputs.json) och [nyare
sekvens-/källgranskning](../evidence/sequence-reuse-audit.json) binder rätt källa till rätt metod.
`tools/restore-sequence-review.ts` återställer den nyare 17-kortsfilmen byteidentiskt och klipper dess 16-kortsprefix
vid ruta 3296, i två format, utan ny API-generering.

`.env.local` laddas inte automatiskt av befintliga Node-kommandon. Verktyg som behöver den körs uttryckligen med
`node --env-file=.env.local <verktyg.ts>`. `DEALER_SCRATCH_ROOT` och `DEALER_REMOTE_GENERATION_ENABLED` står i filen men
ingen kod läser dem: flaggan spärrar ingen generering. Spärren är `enabled` i `data/order-policy.json`.

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

- **En väg: Beställ.** Utkast i Bordets Beställ (`data/orders/<id>.json`), godkänt med Jakobs klick eller av
  huvudagenten på hans uppdrag (`tools/order-approve.ts`) inom `data/order-policy.json`, lagt och hämtat av en
  beställningsagent genom Runways MCP-server på appkontot. Betalda anrop utanför Beställ rapporteras till huvudagenten
  med belopp (AGENTS, "Det som skyddar Jakob").
- **Kvitton från äldre vägar** (API-jobben i `data/clip-jobs.json`, orderfilerna och liggarna på D:) är källbevis och
  står kvar; ett osäkert anrop beställs aldrig om, och `request.lock` eller SUBMITTING tas aldrig bort. Pamelas ankare
  byggdes med `tools/build-anchor.ts` ur riktiga videorutor (bara kortpixlar ändrade, mot fryst plan). Bakgrund:
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
  kort och omtagningar); Paow hade 2026-11-13 kostat cirka 5 400 utan att vara färdig (räknat ur kvittona).

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
- Sidan är gamla labbet som det var vid den senaste publiceringen och byggs inte längre härifrån: byggverktyget
  (`tools/build-public.ts`) gick med gamla labbet 2026-11-17 och finns kvar i Git-historiken. Den sparar kortplanen i
  besökarens webbläsare, aldrig på datorn; export/import flyttar en plan till Placering. Att ta ned sidan är en
  deploy-åtgärd och Jakobs beslut. Studions publicerade kopia är [den låsta kopian](#den-låsta-kopian-på-nätet).
- Aliaset `dealer-scoutgaming.vercel.app` är skyddat och ska inte delas som publik länk. Senaste deployment och den
  gamla sidans avveckling (också det borttagna projektet `scoutgaming/scout-dealerlab`) står i
  [slutkvittot](../evidence/public-release.json).

## Den låsta kopian på nätet

Studion som låst kopia för Jakobs chef (Jakob 2026-11-12 och 2026-11-13: lösenordet (ordet skrivs inte ut här), Scen och Casino med Paow).
Allt går att läsa och spela, inget går att ändra, och inga kostnader visas.

- **Adresser:** `https://dealer-lake.vercel.app` (den Jakob känner) och `https://dealer-studio-one.vercel.app` (projektets
  egen), båda produktionsadresser för `dealer-studio`. Lösenordet skrivs inte ut här (nytt sedan 2026-11-18; det gamla
  nekas). Efter lösenordet kommer studion med vänsterspalten: Bordet (Kortplan, Scen, Råfilm och Efterarbete; inget sparas
  och inget beställs), Karta, Granska (med Prov), Material, Casino och Önskemål. Vilken commit kopian bär säger
  `/meta.json` på kopian, och läget står i [lägesfilen](lage/spelet.md).
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
- **Låset:** miljövariablerna `DEALER_LOSEN` (flera lösenord skiljs med komma; orden skrivs inte ut här) och `DEALER_KAKNYCKEL` (48
  slumptecken, gjorda i röret till `vercel env add` och aldrig nedskrivna), Production, känsliga (går inte att läsa
  tillbaka). Nytt lösenord: `vercel env rm DEALER_LOSEN production` och `printf '<ord>' | vercel env add DEALER_LOSEN
  production`, båda med `--cwd .runtime/studio-deploy`, sedan en ny deploy; alla gamla inloggningar slutar då gälla.
- **Ett lösenord för bara spelet** (Jakob 2026-11-13: en länk "för någon som bara vill spela", med ett eget lösenord
  "för bara casinot"): miljövariabeln `DEALER_LOSEN_SPEL`, i samma form som `DEALER_LOSEN` och satt på samma sätt (`printf
  '<ord>' | vercel env add DEALER_LOSEN_SPEL production --cwd .runtime/studio-deploy`, sedan en ny deploy). Ordet skrivs
  inte i repot. Adressen `/casino` leder till spelsidan ensam, utan studion runt (`GAME_HOME` i `cloud/studio/gate.ts`:
  Casinos sparade visning med dess perspektiv, Casinos bord och Paow; sedan 2026-11-21, före det hans länk från 13/11),
  och inloggningssidan heter då Blackjack. Med ett
  sådant lösenord släpps spelsidan och det den läser igenom (moduler, banken, filmer, spår); studion, varje annan sida och
  boten leder tillbaka till spelet eller är stängda. Ett ord som står i båda variablerna öppnar allt. Att byta eller ta
  bort variabeln avslutar bara spelets inloggningar; de andra står kvar. Publiceringens kontroll prövar det med
  `DEALER_LOSEN_SPEL_PROV=<ordet>` framför kommandot. En andra dörr, `/trailer`, leder till spelet med filmen före
  (`TRAILER_HOME`: `intro=noir-3`, rummet Monaco med rörelse, bordet och Paow; SYSTEM, "En film före spelet"), bakom
  samma lås och med båda sorters lösenord. Trailerproven i Prov går fortfarande inte upp (`blocked.folders` i
  `data/studio-release.json`); bara filmen före spelet gör det, på Jakobs ord 2026-11-13 kl. 21.23.
- **Ett fel som bara syns på en telefon:** be om en skärmbild av `/trailer?diagnos=1` eller `/casino?diagnos=1`
  (dörrarna bär ordet vidare till spelet). Sidan skriver då på bilden vilken webbläsare det är, om bildytan har
  förlorats, sidans senaste fel och vad filmkön håller och senast gjorde (SYSTEM, "Filmkön"). Ingen av oss har en
  telefon att pröva på, och en inspelning i headless Chrome visar inte vad en telefon gör; för det som en telefon kan
  tänkas neka finns en attrapp på slaskdisken (`D:/dealer-scratch/tmp/huvudagent11/look/strikt-koll.mjs`).
- **Öppen utan lösenord** (Jakob 2026-11-14: "Se till att den inte är lösenordsskyddad", "ta bort lösenordet "[ordet]" för
  sidan nu"): miljövariabeln `DEALER_OPPEN` i projektet. `allt` gör hela kopian läsbar utan lösenord, `spel` bara spelet
  med dörrarna `/casino` och `/trailer` (studion frågar då fortfarande efter lösenordet), och utan variabeln, eller med
  något annat ord, är kopian låst som förut (`openOf` i `cloud/studio/gate.ts`). Bara läsning öppnas: boten och
  önskemålslådan skriver och kostar per fråga, så de kräver alltid hela kopians lösenord, och inloggningen finns kvar
  för dem. Varje svar bär fortfarande `X-Robots-Tag: noindex, nofollow`. Sedan 2026-11-14 står den på `allt`. Låsa igen:
  `vercel env rm DEALER_OPPEN production --cwd .runtime/studio-deploy` och en ny deploy; bara spelet: sätt den till
  `spel` på samma sätt som lösenorden. Publiceringens kontroll får veta vad den ska vänta sig med
  `DEALER_OPPEN_PROV=allt` (eller `spel`) framför kommandot.
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
DEALER_LOSEN_PROV=<ordet> node tools/publish-studio.ts --kor
```

`--kor` bygger `origin/main` (eller `--commit <ref>`) i en egen ren arbetskopia,
`--worktree <valt rent arbetsträd>` (krävs; detached, `npm ci` när en låsfil har ändrats, `assets/` som en koppling
till Jakobs media), med arbetskopians egen labbserver på 4341. Den startas oförändrad med en startmodul som flyttar porten
och låter bli att städa D:; labbservern på 4319 startas, stoppas och frågas aldrig, utom om en mediefil lämnas ut. Sedan:
bygget, uppladdning av de filmer och bilder som är nya (oförändrade objekt skickas inte igen), bygget en gång till så att
låset får adresserna, `vercel deploy --prebuilt --prod` från `.runtime/studio-deploy` och kontrollen utifrån: utan kaka ska
varje sida, svar och film ge inloggningssidan; med `DEALER_LOSEN_PROV` loggar den in och prövar första sidan, en film med
Range och att kopian säger rätt commit. Bygget stannar om arbetskopian inte är ren, om en modul har en maskinsökväg eller
ett spärrat namn, om klippbanken ändras under bygget eller om Blob-delen går över gränsen i registret. En första
publicering tar cirka 40 minuter, mest uppladdningen (1,7 GB); en senare med få nya filmer cirka 6, varav 3 för
studions npm-paket.

`--worktree <absolut sökväg>` återanvänder ett befintligt rent arbetsträd av Dealer. Huvudträdet och andra repos
nekas. Använd samma val för planen och körningen; kör inget annat bygge i det trädet under publiceringen.
`--kor --bara-bygge` gör bara det lokala snapshotbygget och dess medieplan. Inga media laddas upp och ingen deploy görs;
använd planen för att granska exakt publiceringsinnehåll först. `--utan-deploy` laddar däremot fortfarande upp media.

Efter deploy får varje domän och åtkomstläge högst 30 sekunder att växla version: två svar i följd från `/meta.json` måste bära hela
den begärda commit-hashen och `sourceDirty: false`. Kontroll görs varannan sekund utan cache eller omdirigering;
varje svar inklusive JSON har högst tre sekunder, begränsat av återstående tid. Det gäller både öppen och inloggad
kopia. Därefter prövas sidor och filmsökning som förut; fel version efter tidsgränsen är fortfarande ett fel.

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
- `DEALER_LOSEN_PROV=<ordet>` framför kommandot för kontrollen med lösenordet; utan den prövas bara att allt är låst.

**När ett steg stannar halvvägs** står kopian på nätet kvar som den var, utom om det är kontrollen efter deployen:

- *Arbetskopian är inte ren:* kontrollera `git status` i det valda trädet. Identifiera ändringarnas ägare och bevara
  arbetet innan något flyttas eller återställs. Använd vid behov ett annat rent arbetsträd; kassera aldrig okända ändringar.
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
  2026-11-17 stannade bygget på 2 250 MB: det som hade vuxit var talfilmer som spelet inte längre säger (varje
  omläggning av replikerna lade till lika många filmer som hon har repliker). Taket står kvar; av en repliks filmer går
  nu bara den upp som spelet säger (`gameTakes` i `tools/studio-freeze.ts`, samma fråga som spelsidan ställer:
  `spokenFilms` med spelets röst) och de han själv har godkänt. En ersatt tagning står kvar i kopians klippbank utan film.
- **Vad storen rymmer** står i kvittot (`.runtime/studio-blob/studio-media.json`). Objekt som en senare kopia inte
  längre visar ligger kvar i storen: de skrivs aldrig över och tas inte bort av verktyget.

- Provbygge utan publicering: `node tools/build-studio-snapshot.ts --prov` och `node tools/serve-studio-snapshot.ts
  --prov` (port 4330, med påhittat lösenord och nyckel), se verktygens huvuden.
- Ta bort kopian (på Jakobs ord): `vercel project rm dealer-studio` och `vercel blob delete-store <storens id ur kvittot>`, båda
  med `--scope jakeminator123s-projects`.
- **Kostnad** (Pro, ur teamets månadskredit på 20 USD): lagringen cirka 1,7 GB × 0,023 USD per GB och månad ≈ 0,04 USD;
  trafiken ingår i Pro-planens Flat Rate CDN (1 TB) och kostar annars cirka 0,05 USD per GB; en visning av Casino med en
  runda läser cirka 150 MB film. Uppladdningen är cirka 250 Blob-operationer ≈ 0,001 USD.

## D: och städning

Sedan Jakobs besked 2026-11-19 sker arbetet i IDE:ns projektmapp eller arbetsträd och tillfälligt arbete i
`.runtime/<uppgift>/`. D:-sökvägar nedan beskriver äldre material och delade tjänster, inte arbetsförval.
Arbetsrutin, radering av verifierat oanvänt material och hashkontrollerad rensning av dubbla mediefiler:
[Lokal arbetsplats och städning](../tools/local-work.md).

Ändra inte global TEMP/PATH och skapa inga nya runtime-junctions. Tillfälliga jobb kan få processlokal `TEMP`/`TMP` mot
`D:/dealer-scratch/tmp`. V6-renderern skriver till `output/v6` i repot; ingen miljövariabel flyttar det.

`data/library.json` refererar till den bevarade porträttreproduktionen i `output/v6/take-01`. Den får inte rensas som
slask medan katalogen refererar dit. Katalogen innehåller bara sökvägar/hashar, inga uppladdade filmer; diagnostiska
beslut hämtas från motions-registret.

**Vad en mapp i `assets/` eller `output/` är och om något använder den:** `node tools/media-audit.ts [--json] [<mapp>]`
(bara läsning). Per film, ankare, beställning eller prov: vad det är, storlek, datum, vilket register som nämner det och
användningen `spelas` (banken enligt `buildGraph`, talfilmer, munlappar, filmen före spelet), `visas` (Material,
beställningar, scenen, och allt som Beslut, kopian, ett dokument eller en instruktion nämner med sitt exakta id), `referens` (V6, manifestet,
`evidence/`), `bara registrerad` eller `okänd`, med fil och fält som säger det. Klassningen är ett underlag:
kontrollera även aktiva prov och användaranteckningar före radering. Det som verifierats oanvänt får raderas;
den tidigare regeln att alltid arkivera betalda resultat är ersatt av Jakobs besked 2026-11-19.

**Arkivet av det oanvända, 2026-11-17** (`53dc116`): 367 enheter (1 073 filer, 3,96 GB) ligger med samma sökvägar i
`D:/dealer-archive/dealer-ej-anvant-2026-11-17/`, varje fil kontrollerad på SHA-256. Planen, loggen och skriptet som tar
tillbaka allt (`aterstall.mjs`) ligger i `D:/dealer-scratch/tmp/stadning/inventering-2026-11-17/`.

**Om en bild eller film passar dagens regler:** `node tools/media-audit.ts --fit [--write]` mäter kortet i varje landning
och i varje ankare med kort på en plats (gult eller blått som `src/card-track.ts` läser) och det liggande kortet i
bankens kortspår (`assets/tracking/<tagning>/card-track.json`) mot `planCardQuad` (`src/card-plan.ts`), ett viloankare
mot `data/dealer-standard.json` och en referens efter kameran (rutans storlek). Svaret per sak är `stämmer`, `äldre plan`
(mitten mer än 15 px från platsen eller storleken mer än 12 % från regelns kort), `avviker`, `annan kamera` eller `går inte
att mäta`, med siffrorna. `--write` sparar det i `data/media-fit.json`, som Material visar som en etikett på rutan; kör det
igen när planen, linsen eller ett ankare ändras. Jakobs tillstånd (gäller, kandidat, ersatt) ändras aldrig av mätningen.

Det tidigare projektet (snyggare-dealer, arkivet) ligger i sin helhet på `D:/dealer-archive/snyggare-dealer` och är
borttaget från C: sedan 2026-11-10: 194 531 filer, varje fil SHA-256-jämförd på båda sidor, med Git-historik, ändrade
och ospårade filer bevarade ([arkivkvittot](../evidence/archive-move.json); inventeringar, filhashar och
raderingskvitton under `D:/dealer-archive/receipts/20261110-snyggare-dealer`). Arkivet är läsreferens; C:-sökvägarna
där inne är proveniens och har inte ändrats. Inga länkar går från dealer till arkivet.

Före arkivflytt: registrera exakta käll-/målrot, ägare, worktrees, untracked/ignorerade filer, reparse-mål och
processidentitet. Stoppa bara verifierat ägda tjänster via kontrollkanal. Kopiera till ett nytt avgränsat arkivmål utan
att följa junctions; jämför filantal/byte/SHA-256 och verifiera återläsning. Separat godkänd källradering kan därefter
frigöra C:. Befintliga D:-delarkiv får inte skrivas över.

Rensning kräver ett kandidatbeslut med källa, ägare, referenser och verifierad ersättning. Filnamnslikhet eller inaktiv
process räcker inte. Osäkert material stannar för granskning.

**Städverktyget.** `npm run stada` (`tools/scratch-clean.ts`) är en torrkörning: rapport per regel, inget ändras. Det
körs från huvudträdet; ett arbetsträd på slaskdisken vägras, eftersom slasken, arkivet och repot måste ligga isär.
`-- --lista` visar varje träff och `-- --forklara <sökväg>` varför något lämnas. En åtgärd utförs först med
`-- --kor --regel <regel> --sokvag <exakt relativ sökväg> --agare <verifierad ägare>`. Kontrollera ägarskap,
referenser och aktuell processidentitet före kommandot; namnet i flaggan är operatörens redovisning. RADERA tar
bara det som går att göra om: headless Chrome-profiler, `node_modules`, Nodes och Pythons cacher, Chromes `scoped_dir*`,
lösa `*.tmp` och loggar äldre än en vecka. ARKIVERA flyttar skärmbilder och rutdumpar äldre än en vecka till
`D:/dealer-archive/slask/<år-månad>/<samma sökväg under dealer-scratch>`. Varje flytt och radering skrivs i
`D:/dealer-archive/slask/arkiv.json`. `-- --kor --aterstall <post>` flyttar tillbaka; utan `--kor` avvisas återställningen.
Kontaktark och avslutade mappar under `tmp/` eller `review/` kräver ett uttryckligt mål och dom efter två
veckor. Reglerna står som data överst i verktyget. Radera betyder ta bort; arkivera betyder bevara på arkivplatsen.

Skydden går inte att slå av. Verktyget rör aldrig: det som ändrats de senaste tre dygnen; mappar som HANDOFF, README,
AGENTS, `docs/*.md`, `docs/lage/*.md`, `data/*.json` eller agenternas minne namnger med sökväg (`SOURCES` i verktyget;
en arbetsmapp på slaskdisken som ska leva kvar namnges därför i banans lägesfil). En namngiven mapp skyddar allt i den; en
fil direkt i en sessionsmapp skyddar bara sig själv. Namnge därför undermappen, inte hela sessionen, när bara den ska
leva kvar; mappar med beställningsliggare eller kvitto (`bestallningar*`, `order-*`, `uploads-*`, `tasks-*`, `*kvitto*`,
`request.lock`); `chrome-meshy`, Python-miljöer, mappar som en körande process namnger och mappar med länkar; film och
ljud, som aldrig raderas, och allt utanför `D:/dealer-scratch`. Labbservern gör bara en torrkörning per start;
utfallet står i `.runtime/stada.log`. Vad som låg kvar på D: när bilder och filmer kopierades till `assets/` 2026-11-12
säger rapporten `D:/dealer-scratch/tmp/huvudagent/import/RAPPORT.md`.

Registren och små körkvitton är JSON-filer. Ett lokalt, återbyggbart SQLite-index samlar sökning och spårbarhet utan
medieblobs eller egna användardomar ([evidens](../tools/evidence.md)). Den tidigare
[lagringsbedömningen](../evidence/storage-choice-review.json) om Scouts Postgres-adapter gäller först när delade
skrivare och atomisk historik behövs; ingen produktionsdatabas är skapad här.

## Molnmiljö

En kopia av repot i en molnmiljö (Codex Cloud eller en annan sandlåda ur GitHub) är en separat körning utan media och
inte säkert med rätt Node: där går bara de tester som klarar sig utan media, och ingenting döms där. Ingen sådan miljö
är uppsatt för dealer (senast kontrollerat 2026-11-10), och Scouts miljö återanvänds inte utan uttrycklig
projektbindning. Den som sätter upp en behöver repot, Node 24.22.3 och `npm ci`; V6-verifiering och rendering kräver
dessutom registrerad media, FFmpeg/FFprobe och högst fyra arbetare. Kopiera aldrig hela `.env.local` dit.
