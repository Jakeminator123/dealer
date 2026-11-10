# Dealer

Självständig arbetsyta med V6 som Jakobs valda visuella referens. Målet är två kort till sju spelare och en dealer i Scoutgaming. En bildrutetidslinje styr; sekvenssträngar och nodvyn beskriver samma metadata.

[Öppna det publika labbet](https://dealer-delta-eosin.vercel.app/). Den publika sidan sparar utkast i den egna webbläsaren; lokal preview sparar till placeringsfilen på datorn. Export/import flyttar ett utkast mellan dem. Publicerade granskningsfilmer ligger i separat Vercel Blob, inte i Git eller webbpaketet. Lokal katalog kan innehålla nya prov före nästa verifierade publicering; aktuell release finns i HANDOFF och `evidence/public-release.json`.

| Läsning | Innehåll |
| --- | --- |
| [SYSTEM](docs/SYSTEM.md) | Tre ytor, två format, bottom-up, ordlista och rörelseregister. Befintligt och planerat hålls isär. |
| [DRIFT](docs/DRIFT.md) | GitHub, Runway, miljö, D:-slask, återbruk och molnmiljö. |
| [HANDOFF](HANDOFF.md) | Aktuellt arbete, ägare och blockerare. |

`motions/<clip-id>.json` är registrerade rörelsers statuskälla. `manifest.json` registrerar filproveniens/SHA-256; `evidence/` innehåller verifieringskvitton. Dokumenten länkar till dessa, utan egna konkurrerande statusregister.

`data/library.json` samlar V6, sekvenskandidater, original och diagnostiska prov. Beslut hämtas från rörelseregistret; en spelbar film är inte automatiskt godkänd. `placements/default.json` innehåller Jakobs placeringsutkast för 16 kortplatser; det är ännu inte kopplat till Scout/V6-utdelningen.

Fyra hela historiska **alternativ** är återställda: `pamela-sequence-{16,17}-{native,portrait}-r2`. Vid 30 fps har 16-kortsversionen 3296 rutor/109,867 s och 17-kortsversionen 3598 rutor/119,933 s. Båda ger två kort till P1–P7; 16 slutar med dealerns andra kort dolt, 17 innehåller separat reveal och D.C3. De går IDLE→IDLE med kvarliggande kort, inte tillbaka till tomt bord. Jakob accepterar dem som alternativ men anger fel koordinater/format: de identifierar inte den äldre sekvens han efterfrågade. Historisk placeringsplan används, inte dagens editorutkast. Produktionsacceptans är **PENDING**. Se [återbruk](evidence/sequence-reuse-audit.json) och [produktionskvitto](evidence/sequence-review-production.json).

P4.C2:s nyare original visar BACK→EDGE→FRONT. Den lokala gula `review-v04` färgar om synlig blå motsida till gul och bevisar därför inte CLOSED→CLOSED; originalet granskas separat och överlägget bevaras som sekundärt diagnostiskt prov. Se [färggranskningens p4Followup](evidence/anchor-color-audit.json). P7 direktprovets separata CLOSED→CLOSED-klassning och vändningsprov 3:s avslag kvarstår.

Plant bord är standard i editorn. Läget och riktningen sparas/exporteras i `tableProjection`, medan varje korts befintliga koordinater bevaras. Äldre filer utan fältet kan läsas in och sparas med den nya inställningen. Det är ett gemensamt visuellt perspektiv från P4, inte en uppmätt kamerakalibrering.

Exakt skickad prompt, start-/slut-PNG, modellinställningar och resultaten finns på [Runway-underlaget](generation.html). Äldre materialfilmer på 182,867 och 146,8 s samt den befintliga maskförbättrade fullversionen finns i samma bibliotek. V6:s små skuggor/fingermasker var redan importerade; den senare bankens avgränsade maskrättningar återfanns av [Astra-granskningen](evidence/astra-archive-mask-audit.json).

## Kör lokalt

- Arbeta här. `node -p process.version` ska visa `v24.21.0` via Volta; `package.json` kräver `>=24.21.0 <25`. `npm ci` behövs om beroenden saknas.
- `START.cmd`, `STATUS.cmd`, `STOPP.cmd` styr enbart `http://127.0.0.1:4319`. Återanvänd Codex WebView. Servern slutar 60 sekunder efter sista preview-fliken.
- Öppna [placeringslabbet](http://127.0.0.1:4319/lab.html): 16 kortplatser och sko, separat dator/mobil, hand-/sidavsikt, nodvy, materialpanel och filmkatalog. Sparning ändrar bara placeringsutkastet. Grundkontroller finns i [evidence/placement-lab.json](evidence/placement-lab.json), senare vy-/nodkontroller i [evidence/plane-and-nodemap.json](evidence/plane-and-nodemap.json).
- Filmgranskningen har steg ±1 bildruta, kapitel och hastighet 0,25×/0,5×/1×. URL-parametrarna `clip` och `frame` pekar ut klipp och granskningsruta; tillgänglighet på publika sidan beror på senaste verifierade release.
- `npm run verify` kontrollerar registrerade lokala filer. `npm run verify -- --frames` återrenderar 18 kontrollrutor och kräver pixelidentitet.
- `npm test` kör avgränsade offlinetester för placeringar, sparning, återläsning, renderinläsning och publiceringsskydd. `npm run hooks:install` aktiverar lokal pre-push; `npm run check` kontrollerar commitintervallet före push/PR. Se [rutinen](docs/DRIFT.md#git-och-kontroller).
- `npm run render -- --render --take=02` startar ett nytt fullständigt försök med fyra arbetare. Välj alltid ett oanvänt tvåsiffrigt nummer; `take-01` är bevarat. Kräver FFmpeg/FFprobe via PATH eller `FFMPEG`/`FFPROBE`.

## Verifierad bas och gräns

Enligt [reproduktionskvittot](evidence/reproduction.json) har hela V6 återrenderats lokalt: 926 rutor, 30 fps, 1762×1174 och 1080×1920. Båda MP4-filerna är byteidentiska med originalen; 18 kontrollrutor är pixelidentiska enligt [bildrutekvittot](evidence/frame-verification.json). Detta verifierar V6, inte utdelning till alla åtta platser. Kända begränsningar för fingermask, rörelsekanter och källskarvar kvarstår.

`src/` och `tools/` kör utan gamla labbet. `materials/` är separata kort-/markerprov; markerna är inte integrerade i V6 och TS-materialkällorna har inte återbyggts till de frysta JS-bundlarna. `assets/`, `output/`, `.runtime/`, `.env*` och `private/` är lokala och Git-ignorerade.

Labbet återanvänder kortmaterialets TS-källa direkt för böjning/glans och ett lokalt landningsprov. Detta ändrar inte V6-filmen eller de historiska materialbundlarna.

Publikt källrepo: [Jakeminator123/dealer](https://github.com/Jakeminator123/dealer). GitHub innehåller inte media eller hemligheter. Scout-integration, deploy och betald generering är separata uppdrag.

Ett uttryckligen beställt P4.C1-kontrollprov, `pamela-p4-c1-color-control-01`, använder exakt historisk startbild, slutbild och prompt via `tools/generate-p4-control.ts`, utan omfärgning. WAN3 och det följande Kling 3.0 Pro-provet är färdighämtade men underkända för fysisk vändning. Aktuell status finns i det lokala genereringskvittot och HANDOFF.

Behåll JSON-register, manifest och webbläsarutkast. [Lagringsbedömningen](evidence/storage-choice-review.json) rekommenderar ingen SQLite- eller annan ny databas nu; framtida Scout-import är ett separat införande.

Aktuella fynd från den externa granskningen och avgränsade rättningar finns i [granskningskvittot](evidence/external-review-triage.json). Efter renderinläsningsrättningarna är 18 kontrollrutor fortsatt pixelidentiska enligt [nytt V6-kvitto](evidence/render-safety-frames.json). En generell koppling mellan placeringsplan och filmer återstår.
