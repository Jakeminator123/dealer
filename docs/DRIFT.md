# Drift, anslutningar och återbruk

Kontrollerat 2026-11-10. Aktuell arbetsstatus hör till HANDOFF och filmklassning till motions-registret.

## Identitet och ansvar

| Del | Kanonisk plats / identitet |
| --- | --- |
| Arbetsyta | `C:/Users/jakem/dev/super-feature-sg/dealer` |
| Privat GitHub | `Jakeminator123/dealer`, origin `https://github.com/Jakeminator123/dealer.git` |
| Slutmål | `C:/Users/jakem/dev/scoutgaming`, remote `git@github.com:Jakeminator123/scoutgaming.git` |
| Gammal läsreferens | `C:/Users/jakem/dev/super-feature-sg/snyggare-dealer` |
| Ny slask | `D:/dealer-scratch/tmp`, `renders`, `review` |
| Befintligt arkiv | `D:/dealerlab-archive/snyggare-dealer`; tidigare delarkiv, inte bevis på full projektflytt |

MAINTAIN äger README, SYSTEM/DRIFT, anslutningskonfiguration och GitHub-upplägg. TILLBAKA-2 äger renderer/verktyg, preview, media, rörelseregister, HANDOFF och filmbevis. En skribent per fil; samordna index/commit. Inga nya underagenter.

Jakobs uppdrag 2026-11-10 godkänner privat GitHub-upplägg, anslutningskontroller, nödvändig lokal env-återanvändning och D:-slask. Deploy, Scout-integration, databasändringar och betald generering är separata uppdrag. GitHub-repot är källförvaring, inte en publicerad studio eller webbplats.

## Anslutningar och miljö

| Kontroll | Resultat / bevisgräns |
| --- | --- |
| GitHub connector + CLI | Båda autentiserade som `Jakeminator123`; privat repo skapat. |
| Runway connector | Autentiserad workspace `Jakob`, ID `67037521`. |
| Direkt API | Gamla labbets `RUNWAY_API_KEY` gav HTTP 200 för `GET https://api.dev.runwayml.com/v1/organization`, API-version `2024-11-06`. Ingen generering/uppladdning. |
| Lokal nyckel | Endast `RUNWAY_API_KEY` kopierad till Git-ignorerade dealer/.env.local efter uttryckligt godkännande. Sanitiserat kvitto: `.runtime/connection-check.json`. |
| Identitetsgräns | API-svaret ger inte projekt/workspace-ID. Samma nyckelkälla bevisar inte att developer-API och connector har samma workspace eller saldo. |

Endpoint/header följer [Runway API-referensen](https://docs.dev.runwayml.com/api/). Äldre identitetskontroll i gamla labbets `.runtime/runway-identity-check.json` lästes 2026-11-10; inte heller den gav ett verifierat org-ID. Modell kontrolleras per tags plan/kvitto, inte från tillgängliga modeller eller filnamn. TILLBAKA-2 har verifierat `wan3` för p4-c2-center-01; detta är inte bevis för alla gamla tagningar.

Nycklar skrivs aldrig i Git, manifest, dokument eller loggar. Blob/databas-/andra inloggningsuppgifter kopieras inte utan ett konkret integrationsbehov. GitHub CLI använder sin befintliga inloggning; ingen tokenfil behövs här.

`.env.local` laddas inte automatiskt av befintliga Node-kommandon. Verktyg som behöver den körs uttryckligen med `node --env-file=.env.local <verktyg.ts>`. `DEALER_SCRATCH_ROOT=D:/dealer-scratch` och `DEALER_REMOTE_GENERATION_ENABLED=false` är deklarerad konfiguration; renderern läser dem ännu inte. Flaggan är alltså inte en implementerad generationsspärr.

## D: och städning

Slaskmapparna är skapade. Kontroll 2026-11-10: cirka 14,8 GiB ledigt på C: och 651,4 GiB på D:. Diskflytt frigör diskutrymme, inte RAM i sig. Ändra inte global TEMP/PATH och skapa inga junctions. Tillfälliga jobb kan få processlokal `TEMP`/`TMP` mot `D:/dealer-scratch/tmp`.

V6-renderern skriver fortfarande till dealer/output/v6. Utdataflytt måste implementeras/verifieras av verktygsägaren; miljövariabeln ensam flyttar inget. Original och pågående review bevaras.

Gamla labbet är ännu inte flyttat. TILLBAKA-2:s inventering: 163 182 601 786 byte, 194 532 filer, huvudsakligen exports/runs; Git är bara cirka 4,63 MB. Aktiv gammal preview och en absolut intern reparse-länk hindrar säker direktflytt. Detta är ett agentkvitto, inte en färdig arkivverifiering.

Före arkivflytt: registrera exakta käll-/målrot, ägare, worktrees, untracked/ignorerade filer, reparse-mål och processidentitet. Stoppa bara verifierat ägda tjänster via kontrollkanal. Kopiera till ett nytt avgränsat arkivmål utan att följa junctions; jämför filantal/byte/SHA-256 och verifiera återläsning. Separat godkänd källradering kan därefter frigöra C:. Befintliga D:-delarkiv får inte skrivas över.

Rensning kräver ett kandidatbeslut med källa, ägare, referenser och verifierad ersättning. Filnamnslikhet eller inaktiv process räcker inte. Osäkert material stannar för granskning. Inga filer eller aktiva tjänster har raderats/stoppats av MAINTAIN.

## Molnmiljö

Codex stöder sparade molnmiljöer via **Settings → Codex Cloud → Environments**, med repo, verktyg och nätverkskonfiguration. Detta är separat körning, inte mer RAM till den lokala chatten. Se [OpenAI Docs: Cloud environments](https://learn.chatgpt.com/docs/environments/cloud-environments).

Livekontroll: en sparad miljö `scoutgaming` finns, `status=ready` men `runnable=false`; ingen dealer-miljö finns i den tillgängliga listan. Ingen miljö skapad eller startad här. Den befintliga Scout-miljön återanvänds inte för dealer utan uttrycklig projektbindning.

Förbered en privat dealer-miljö med detta repo, Node 24.21.0 och `npm ci`. GitHub saknar media, så full V6-verifiering/rendering kräver separat registrerade assets, FFmpeg/FFprobe och högst fyra arbetare. Källhashar ska verifieras före rendering. Runway kan vid behov tillföras som HTTP-hemlighet begränsad till `api.dev.runwayml.com`; kopiera inte hela gamla env. Kontoåtkomst, mediaöverföring och eventuell kostnad behöver vara konkreta innan start.
