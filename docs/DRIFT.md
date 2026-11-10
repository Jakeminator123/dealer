# Drift, anslutningar och återbruk

Kontrollerat 2026-11-10. Aktuell arbetsstatus hör till HANDOFF och filmklassning till motions-registret.

## Identitet och ansvar

| Del | Kanonisk plats / identitet |
| --- | --- |
| Arbetsyta | `C:/Users/jakem/dev/super-feature-sg/dealer` |
| Publikt GitHub | `Jakeminator123/dealer`, origin `https://github.com/Jakeminator123/dealer.git` |
| Slutmål | `C:/Users/jakem/dev/scoutgaming`, remote `git@github.com:Jakeminator123/scoutgaming.git` |
| Gammal läsreferens | `D:/dealer-archive/snyggare-dealer`; fullständigt verifierat arkiv, tidigare C:/Users/jakem/dev/super-feature-sg/snyggare-dealer |
| Ny slask | `D:/dealer-scratch/tmp`, `renders`, `review` |
| Befintligt arkiv | `D:/dealerlab-archive/snyggare-dealer`; tidigare delarkiv, inte bevis på full projektflytt |

TILLBAKA-3 tar huvudansvar efter MAINTAINs slutrapport för arkiv, rutiner och GitHub. En skribent per fil; samordna index/commit. Aktiva uppgifter hör till HANDOFF. Nya underagenter kräver uppdrag.

Jakobs uppdrag 2026-11-10 godkänner publikt GitHub-upplägg, anslutningskontroller, nödvändig lokal env-återanvändning och D:-slask. Deploy, Scout-integration, databasändringar och betald generering är separata uppdrag. GitHub-repot är källförvaring, inte en publicerad studio eller webbplats.

## Git och kontroller

Jakob har godkänt automatisk push som agentens avslutningsrutin för färdiga egna ändringar. Flödet är `npm test` → uttrycklig staging av egna filer → commit → `npm run check` → vanlig push → verifierad fjärr-SHA och CI. Ingen bakgrundsbevakare eller automatisk commit av sparade filer används. Andras arbete och Jakobs placeringsutkast följer inte med av misstag. Git-push är separat från webbdeploy, mediauppladdning och generering.

- Aktivera en gång per checkout: `npm run hooks:install`. Installationen vägrar skriva över en annan hooksPath. Git-hooks följer med i repot men aktiveras inte av vanlig clone.
- `.githooks/pre-push` kontrollerar hela intervallet av nya commits, även känsliga filer som lagts till och senare tagits bort. Lokala media/env-mappar, binärt material, filer över 5 MiB och vissa tokenmönster stoppar push. Mönsterkontrollen är ett extra skydd, ingen garanti att alla hemligheter upptäcks; granska alltid diffen.
- Testerna ska avse exakt HEAD. Ändrade eller nya kod-/testfiler stoppar kontrollen tills ägaren samordnat dem. `placements/default.json` är ett separat användarutkast och inkluderas inte automatiskt. Kontrollen kör sex avgränsade testsamlingar med högst fyra arbetare, utan Runway, media, FFmpeg eller deploy.
- `.github/workflows/check.yml` kör samma kontroll på push och PR med Node 24.21.0, `npm ci`, enbart läsbehörighet och versionslåsta Actions. Före PR kör agenten `npm run check`. GitHub-kontrollen kör efter push och är inte ett serversidigt pushförbud eller aktiverat mergekrav.
- **Rött:** stoppa, undersök orsak och rätta innan nytt försök. **Gult:** granska och åtgärda eller förklara kvarvarande begränsning kort i HANDOFF före push/PR. Varningarna visas i agentens terminal och som CI-annoteringar. Granska även hook/testens relevans och falsklarm; vid verkligt kontrollfel, rätta med ett avgränsat regressionstest. Hoppa inte över kontrollen för att få grönt.
- Känd Node-varning: `stripTypeScriptTypes` i `tools/lab-ui.test.ts` använder ett experimentellt Node-API, även använt av preview/public-build. Varningen är spårad till detta API och testerna passerar. Den bevaras synlig; utred kompatibiliteten vid ändrat API/Node, utan att stänga av varningar generellt.
- Håll fem styrdokument: README (start), AGENTS (arbetsregler), HANDOFF (nu/ansvar/hinder), SYSTEM (kontrakt) och DRIFT (rutiner/anslutningar). Uppdatera på plats när beteende eller ansvar ändras. Dokumenten länkar till befintliga JSON-register/kvitton. Nya Markdown-dokument och större dokumentmängd ger gul signal; riktvärdena är 100/50/140/160/150 rader i denna ordning, inte mål att fylla.

## Anslutningar och miljö

| Kontroll | Resultat / bevisgräns |
| --- | --- |
| GitHub connector + CLI | Båda autentiserade som `Jakeminator123`; repo skapat privat, därefter ändrat till publikt av Jakob och bekräftat 2026-11-10. |
| Runway connector | Autentiserad workspace `Jakob`, ID `67037521`. |
| Direkt API | Gamla labbets `RUNWAY_API_KEY` gav HTTP 200 för `GET https://api.dev.runwayml.com/v1/organization`, API-version `2024-11-06`. Ingen generering/uppladdning. |
| Lokal nyckel | Endast `RUNWAY_API_KEY` kopierad till Git-ignorerade dealer/.env.local efter uttryckligt godkännande. Sanitiserat kvitto: `.runtime/connection-check.json`. |
| Identitetsgräns | API-svaret ger inte projekt/workspace-ID. Samma nyckelkälla bevisar inte att developer-API och connector har samma workspace eller saldo. |

Endpoint/header följer [Runway API-referensen](https://docs.dev.runwayml.com/api/). Äldre identitetskontroll i gamla labbets `.runtime/runway-identity-check.json` lästes 2026-11-10; inte heller den gav ett verifierat org-ID. Modell kontrolleras per tags plan/kvitto, inte från tillgängliga modeller eller filnamn. V6-källan samt de nya P7/P6/rosa proven använder `wan3` via developer-API. [Promptjämförelsen](../evidence/prompt-comparison.json) visar skillnaderna: gamla centerklippet använder LH→RH-handbyte, nya P7-provet begär samma LH. Återanvänd inte centerinstruktionen som om den beskrev en vänsterhandsutdelning till P7.

Nycklar skrivs aldrig i Git, manifest, dokument eller loggar. Blob/databas-/andra inloggningsuppgifter kopieras inte utan ett konkret integrationsbehov. GitHub CLI använder sin befintliga inloggning; ingen tokenfil behövs här.

Tre underlag hålls isär: V6:s sexsekunders centerkälla, den äldre vita 12-sekundersbanken som byggdes till cirka tre minuter, och den nyare gul/blå banken med en komplett 119,933-sekunderssekvens. [Historiska promptar](../evidence/historical-p4-generation-inputs.json) och [nyare sekvens-/källgranskning](../evidence/sequence-reuse-audit.json) binder rätt källa till rätt metod. `tools/restore-sequence-review.ts` återställer den nyare 17-kortsfilmen byteidentiskt och klipper dess 16-kortsprefix vid ruta 3296, i två format, utan ny API-generering.

`tools/generate-p4-control.ts` förbereder ett enda separat P4.C1-kontrollprov från de exakt hashade historiska start-/slutbilderna och prompten. `--submit` använder samma developer-API: wan3, fyra sekunder, auto_1080p, inget ljud eller färgfilter. Beställningen är uttryckligen godkänd av Jakob. `request.lock` och SUBMITTING-status får aldrig tas bort för automatisk ombeställning efter timeout. `--kling` väljer det separat beställda Kling 3.0 Pro-jämförelseprovet (4 s/48 credits, ratio utelämnas). `tools/collect-pilot.ts p4-control` respektive `p4-kling` läser bara redan beställda jobb. [API-/MCP-kontrakt](../evidence/runway-production-contract.json) dokumenterar även referensvideo och Aleph 2; ingen anslutningsväg har bytts.

**Klippjobb (branch `claude/deal-clips`, 2026-11-10).** `data/clip-jobs.json` är det versionerade uppdraget: ankare, jobb och kredittak. Ett jobb är en enda handling mellan två bilder: giv slutar vid verklig landnings-/släppruta, retur börjar från den. `node tools/build-anchor.ts <id>` bygger en nyckelbild ur en riktig videoruta och ändrar bara kortpixlar mot fryst placeringsplan. `node tools/clip-job.ts check <id>` fryser indata utan nätverk; `node --env-file=.env.local tools/clip-job.ts submit <id>` gör exakt ett POST och lämnar `request.lock`; `collect <id>` läser status och hämtar filmen. Ett osäkert eller misslyckat anrop beställs aldrig om automatiskt. Taket i jobbfilen höjs bara genom en uttrycklig ändring; Jakobs ram 2026-11-10 är högst 5 000 credits, med avsikten att stanna långt under. Bakgrund och mätningar: [metodgranskningen](../evidence/generation-method-audit.json).

`.env.local` laddas inte automatiskt av befintliga Node-kommandon. Verktyg som behöver den körs uttryckligen med `node --env-file=.env.local <verktyg.ts>`. `DEALER_SCRATCH_ROOT=D:/dealer-scratch` och `DEALER_REMOTE_GENERATION_ENABLED=false` är deklarerad konfiguration; renderern läser dem ännu inte. Flaggan är alltså inte en implementerad generationsspärr.

## Publik granskningssida och Blob

- Sida: `https://dealer-delta-eosin.vercel.app/`, team `scoutgaming`, projekt `dealer`, ID `prj_7zd112w6MIX9YnpcR7Nj64Ke50yk`. Canonisk lokal projektbindning: `.runtime/public-deploy/.vercel/project.json`.
- Blob: `dealer-media`, ID `store_qeojzIHuA5ewT4uO`, public, region `arn1`. Aktuella filantal/byte och anonym SHA-256-verifiering finns i [manifestet](../data/public-media.json) och [kvittot](../evidence/public-media-verification.json).
- `node tools/sync-public-media.ts` visar en plan utan uppladdning. `--upload` synkar endast det uttryckligen avgränsade biblioteket. Varje fil har innehållshash i namnet; befintliga objekt skrivs inte över. Granska tillåtna klipp-ID:n, antal och totalbyte tillsammans med varje katalogutökning. Vid avbruten uppladdning: kontrollera kvittot och exakt objekt, ladda inte upp en ny kopia på chans.
- Blob-nyckeln ligger enbart i Git-ignorerade `.runtime/blob-sync/.env.local`, skild från Runway-nyckeln. Ingen nyckel ska ligga i public-deploy eller byggpaketet. Den statiska sajten kräver ingen skrivnyckel.
- `node tools/build-public.ts` bygger ett litet statiskt paket i `.runtime/public-deploy/.vercel/output`. MP4-filer ersätts med verifierade Blob-länkar. Bygget fryser den aktuella sparade `placements/default.json` och avbryter om den ändras under bygget. Webbläsarens osparade utkast är inte publiceringsunderlag.
- Publik sparning använder den egna webbläsaren och säkra samtidighetskontroller. Den skriver inte till datorns placeringsfil eller en gemensam server. Export/import krävs för att flytta ändringar mellan publik och lokal vy.
- Vid ett större nytt granskningssteg uppdateras både GitHub och Vercel enligt Jakobs uppdrag. Testa och pusha den granskade koden, bygg från den committade versionen, publicera och verifiera anonym åtkomst samt faktisk uppspelning. Ge Jakob commit och direktlänk till det aktuella klippet. En spelbar underkänd film behåller sitt underkända beslut.
- Aliaset `dealer-scoutgaming.vercel.app` är skyddat och ska inte delas som publik länk. Den gamla sidans avvecklingsstatus och senaste deployment-kvitto finns i HANDOFF.
- Gamla `scoutgaming/scout-dealerlab` (`prj_mQwHzspK3GrrJA04eFOorFxth0d5`) är borttaget efter verifierad ersättning och Jakobs delegerade beslut. API och gammal domän ger 404; nya projektet och sju Blob-filer är verifierat kvar. Inget separat gammalt GitHub-repo identifierades. Specialvyerna för äldre bildrute-/kortkontaktgranskning är bevarade i D:-arkivet. [Slutkvitto](../evidence/public-release.json).

## D: och städning

Slaskmapparna är skapade. Efter arkivraderingen 2026-11-10 hade C: cirka 106,2 GiB ledigt. Diskflytt frigör diskutrymme, inte RAM i sig. Ändra inte global TEMP/PATH och skapa inga nya runtime-junctions. Tillfälliga jobb kan få processlokal `TEMP`/`TMP` mot `D:/dealer-scratch/tmp`.

V6-renderern skriver fortfarande till dealer/output/v6. Utdataflytt måste implementeras/verifieras av verktygsägaren; miljövariabeln ensam flyttar inget. Original och pågående review bevaras.

`data/library.json` refererar till den bevarade porträttreproduktionen i `output/v6/take-01`. Den får inte rensas som slask medan katalogen refererar dit. Katalogen innehåller bara sökvägar/hashar, inga uppladdade filmer; diagnostiska beslut hämtas från motions-registret.

Gamla labbet är fullständigt arkiverat på `D:/dealer-archive/snyggare-dealer`, och C:-originalet är borttaget utan fel enligt [arkivkvittot](../evidence/archive-move.json). Efter kontrollerad serverstopp omfattade det 194 531 filer och 163 182 601 679 logiska byte. Varje vanlig fil SHA-256-jämfördes på båda sidor; katalogstruktur, Git-historik/index, 34 ändrade tracked filer och 410 individuella untracked filer bevarades. Den tidigare inventeringens uppgift om noll tracked ändringar var felaktig.

Windows lediga C:-utrymme ökade under själva raderingen med 94 016 409 600 byte (cirka 94,02 GB / 87,56 GiB). Logiska fillängder är inte fysisk diskanvändning; äldre verktyg skapade hårdlänkar och det fanns mycket upprepat innehåll. Ursprungliga filers fysiska allokering/länkantal mättes inte, så 163,18 GB får inte rapporteras som faktiskt frigjort utrymme.

Gamla servern 4318 stoppades via kontrollkanalen och process/port kontrollerades. Den enda interna junctionen kopierades inte genom traversal: arkivlänken återställdes till motsvarande interna D:-mål, och C:-länken togs bort före rekursiv källradering. Inga länkar från nya dealer till arkivet skapades. Fullständiga inventeringar, filhashar, Git-jämförelser och raderingskvitton finns under `D:/dealer-archive/receipts/20261110-snyggare-dealer`. Arkivet är läsreferens; historiska C:-sökvägar där inne är proveniens och har inte massändrats.

Före arkivflytt: registrera exakta käll-/målrot, ägare, worktrees, untracked/ignorerade filer, reparse-mål och processidentitet. Stoppa bara verifierat ägda tjänster via kontrollkanal. Kopiera till ett nytt avgränsat arkivmål utan att följa junctions; jämför filantal/byte/SHA-256 och verifiera återläsning. Separat godkänd källradering kan därefter frigöra C:. Befintliga D:-delarkiv får inte skrivas över.

Rensning kräver ett kandidatbeslut med källa, ägare, referenser och verifierad ersättning. Filnamnslikhet eller inaktiv process räcker inte. Osäkert material stannar för granskning. Endast det uttryckligen beställda gamla projektet togs bort från C:. Nya dealer, preview 4319, ChatGPT, Utforskaren och andra projekt bevarades.

Två lokala kopior av arkivets inventeringskvitton har därefter tagits bort efter SHA-256-kontroll mot bevarade D:-original och processkontroll: 81 609 952 logiska byte; fysisk frigörelse mättes inte. [Städkvitto och coachtriage](../evidence/coach-production-triage.json). Behåll befintliga JSON-register nu; ingen SQLite, lokal Postgres eller ny Neon-miljö har skapats. [Lagringsbedömningen](../evidence/storage-choice-review.json) anger övergång till Scouts befintliga Postgres-adapter när delade skrivare och atomisk historik behövs. Hela gamla chatthistoriker ska inte följa med en handoff; ge aktuell HANDOFF och de få relevanta registren.

## Molnmiljö

Codex stöder sparade molnmiljöer via **Settings → Codex Cloud → Environments**, med repo, verktyg och nätverkskonfiguration. Detta är separat körning, inte mer RAM till den lokala chatten. Se [OpenAI Docs: Cloud environments](https://learn.chatgpt.com/docs/environments/cloud-environments).

Livekontroll: en sparad miljö `scoutgaming` finns, `status=ready` men `runnable=false`; ingen dealer-miljö finns i den tillgängliga listan. Ingen miljö skapad eller startad här. Den befintliga Scout-miljön återanvänds inte för dealer utan uttrycklig projektbindning.

Förbered en privat dealer-miljö med detta repo, Node 24.21.0 och `npm ci`. GitHub saknar media, så full V6-verifiering/rendering kräver separat registrerade assets, FFmpeg/FFprobe och högst fyra arbetare. Källhashar ska verifieras före rendering. Runway kan vid behov tillföras som HTTP-hemlighet begränsad till `api.dev.runwayml.com`; kopiera inte hela gamla env. Kontoåtkomst, mediaöverföring och eventuell kostnad behöver vara konkreta innan start.
