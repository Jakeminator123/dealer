# Dealer

Självständig arbetsyta med V6 som Jakobs valda visuella referens. Målet är två kort till sju spelare och en dealer i Scoutgaming. En bildrutetidslinje styr; sekvenssträngar och en framtida nodvy beskriver samma metadata.

| Läsning | Innehåll |
| --- | --- |
| [SYSTEM](docs/SYSTEM.md) | Tre ytor, två format, bottom-up, ordlista och rörelseregister. Befintligt och planerat hålls isär. |
| [DRIFT](docs/DRIFT.md) | GitHub, Runway, miljö, D:-slask, återbruk och molnmiljö. |
| [HANDOFF](HANDOFF.md) | Aktuellt arbete, ägare och blockerare. |

`motions/<clip-id>.json` är registrerade rörelsers statuskälla. `manifest.json` registrerar filproveniens/SHA-256; `evidence/` innehåller verifieringskvitton. Dokumenten länkar till dessa, utan egna konkurrerande statusregister.

`data/library.json` är den lilla lokala filmkatalogen: två V6-referenser och ett diagnostiskt prov vars beslut hämtas från rörelseregistret. `placements/default.json` är placeringseditorns utkast för 16 kortplatser; det är ännu inte kalibrerat eller kopplat till Scout/V6-utdelningen.

## Kör lokalt

- Arbeta här. `node -p process.version` ska visa `v24.21.0` via Volta; `package.json` kräver `>=24.21.0 <25`. `npm ci` behövs om beroenden saknas.
- `START.cmd`, `STATUS.cmd`, `STOPP.cmd` styr enbart `http://127.0.0.1:4319`. Återanvänd Codex WebView. Servern slutar 60 sekunder efter sista preview-fliken.
- `npm run verify` kontrollerar registrerade lokala filer. `npm run verify -- --frames` återrenderar 18 kontrollrutor och kräver pixelidentitet.
- `npm run render -- --render --take=02` startar ett nytt fullständigt försök med fyra arbetare. Välj alltid ett oanvänt tvåsiffrigt nummer; `take-01` är bevarat. Kräver FFmpeg/FFprobe via PATH eller `FFMPEG`/`FFPROBE`.

## Verifierad bas och gräns

Enligt [reproduktionskvittot](evidence/reproduction.json) har hela V6 återrenderats lokalt: 926 rutor, 30 fps, 1762×1174 och 1080×1920. Båda MP4-filerna är byteidentiska med originalen; 18 kontrollrutor är pixelidentiska enligt [bildrutekvittot](evidence/frame-verification.json). Detta verifierar V6, inte utdelning till alla åtta platser. Kända begränsningar för fingermask, rörelsekanter och källskarvar kvarstår.

`src/` och `tools/` kör utan gamla labbet. `materials/` är separata kort-/markerprov; markerna är inte integrerade i V6 och TS-materialkällorna har inte återbyggts till de frysta JS-bundlarna. `assets/`, `output/`, `.runtime/`, `.env*` och `private/` är lokala och Git-ignorerade.

Publikt källrepo: [Jakeminator123/dealer](https://github.com/Jakeminator123/dealer). GitHub innehåller inte media eller hemligheter. Scout-integration, deploy och betald generering är separata uppdrag.
