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

MAINTAIN har avslutat arkivflytt och grundupplägg. TILLBAKA-2 färdigställer överlämningen till TILLBAKA-3 enligt HANDOFF. En skribent per fil; samordna index/commit. Underagenterna för Vercel, Blob och projektionsanalys beställdes uttryckligen av Jakob; nya underagenter kräver uppdrag.

Jakobs uppdrag 2026-11-10 godkänner publikt GitHub-upplägg, anslutningskontroller, nödvändig lokal env-återanvändning och D:-slask. Deploy, Scout-integration, databasändringar och betald generering är separata uppdrag. GitHub-repot är källförvaring, inte en publicerad studio eller webbplats.

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

`.env.local` laddas inte automatiskt av befintliga Node-kommandon. Verktyg som behöver den körs uttryckligen med `node --env-file=.env.local <verktyg.ts>`. `DEALER_SCRATCH_ROOT=D:/dealer-scratch` och `DEALER_REMOTE_GENERATION_ENABLED=false` är deklarerad konfiguration; renderern läser dem ännu inte. Flaggan är alltså inte en implementerad generationsspärr.

## Publik granskningssida och Blob

- Sida: `https://dealer-delta-eosin.vercel.app/`, team `scoutgaming`, projekt `dealer`, ID `prj_7zd112w6MIX9YnpcR7Nj64Ke50yk`. Canonisk lokal projektbindning: `.runtime/public-deploy/.vercel/project.json`.
- Blob: `dealer-media`, ID `store_qeojzIHuA5ewT4uO`, public, region `arn1`. Sju granskningsfilmer, 118 426 289 byte, anonymt SHA-256-verifierade. [Manifest](../data/public-media.json), [kvitto](../evidence/public-media-verification.json).
- `node tools/sync-public-media.ts` visar en plan utan uppladdning. `--upload` synkar det uttryckligen avgränsade biblioteket. Varje fil har innehållshash i namnet; befintliga objekt skrivs inte över. Verktygets sjufilsgräns måste granskas när biblioteket utökas.
- Blob-nyckeln ligger enbart i Git-ignorerade `.runtime/blob-sync/.env.local`, skild från Runway-nyckeln. Ingen nyckel ska ligga i public-deploy eller byggpaketet. Den statiska sajten kräver ingen skrivnyckel.
- `node tools/build-public.ts` bygger ett litet statiskt paket i `.runtime/public-deploy/.vercel/output`. MP4-filer ersätts med verifierade Blob-länkar. Bygget fryser den aktuella sparade `placements/default.json` och avbryter om den ändras under bygget. Webbläsarens osparade utkast är inte publiceringsunderlag.
- Publik sparning använder den egna webbläsaren och säkra samtidighetskontroller. Den skriver inte till datorns placeringsfil eller en gemensam server. Export/import krävs för att flytta ändringar mellan publik och lokal vy.
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

## Molnmiljö

Codex stöder sparade molnmiljöer via **Settings → Codex Cloud → Environments**, med repo, verktyg och nätverkskonfiguration. Detta är separat körning, inte mer RAM till den lokala chatten. Se [OpenAI Docs: Cloud environments](https://learn.chatgpt.com/docs/environments/cloud-environments).

Livekontroll: en sparad miljö `scoutgaming` finns, `status=ready` men `runnable=false`; ingen dealer-miljö finns i den tillgängliga listan. Ingen miljö skapad eller startad här. Den befintliga Scout-miljön återanvänds inte för dealer utan uttrycklig projektbindning.

Förbered en privat dealer-miljö med detta repo, Node 24.21.0 och `npm ci`. GitHub saknar media, så full V6-verifiering/rendering kräver separat registrerade assets, FFmpeg/FFprobe och högst fyra arbetare. Källhashar ska verifieras före rendering. Runway kan vid behov tillföras som HTTP-hemlighet begränsad till `api.dev.runwayml.com`; kopiera inte hela gamla env. Kontoåtkomst, mediaöverföring och eventuell kostnad behöver vara konkreta innan start.
