# Dealer

Självständig arbetsyta för en filmad dealer i Scoutgaming: två kort till sju spelare och en dealer, med trovärdig utdelning. Rörelserna är korta filmklipp mellan fasta ankare (vila, redo, kortets plats) i en klippbank; en runda är en väg genom klippen, och samma rundor spelas i labbet, i 3D-scenen och i spelet. V6 är Jakobs valda visuella referens och återskapas byteidentiskt. Scoutgaming äger regler, slump och kortvärden.

Mapparna (omstruktureringens steg 1; resten flyttas i senare steg):

```
START.cmd STOPP.cmd STATUS.cmd   starta, stoppa och fråga labbservern på 127.0.0.1:4319
README.md AGENTS.md HANDOFF.md   läs först
studio/       studion: Jakobs arbetsyta i webbläsaren (Next.js)
old-lab/      gamla labbets sidor (labbet, 3D-scen, Modeller, Ljud, Runway-underlaget), tills studion ersatt dem
game/         spelet: Scouts regler oförändrade; spelsidan i game/page/ (reglerna flyttar till game/core/)
src/          den delade motorn och sidornas kod: 3D-scen, klippgraf, kort, placering (byter namn i nästa steg)
tools/        kommandon, labbservern (preview.ts) och testerna (*.test.ts); server och tester flyttar ut i nästa steg
cloud/        studions onlinekopia: lås och bot (byter namn i nästa steg)
materials/    kort- och markerprov
data/         register: manifest.json (filernas SHA-256), klippjobb, scenkontrakt, filmkatalog
motions/      en post per film med Jakobs dom
placements/   Jakobs kortplan
evidence/     verifieringskvitton
docs/         SYSTEM och DRIFT
assets/ output/ .runtime/        lokal media och lokala byggen, inte i Git
```

"Gamla labbet" betyder `old-lab/`. Det tidigare projektet på D: heter snyggare-dealer (arkivet). Sidorna har kvar sina adresser (`/lab.html`, `/game.html` …); bara filerna ligger i mappar.

| Läsning | Innehåll |
| --- | --- |
| [AGENTS](AGENTS.md) | Arbetsregler för agenter. |
| [HANDOFF](HANDOFF.md) | Läget nu: ägare, banken, vad som väntar på Jakob, nästa steg. Läs den först. |
| [SYSTEM](docs/SYSTEM.md) | Kontrakt: koordinater, register, 3D-scenen, spelet, klippbanken och ordlistan. |
| [DRIFT](docs/DRIFT.md) | Rutiner och anslutningar: Git och kontroller, labbservern, Runway, publicering, D:-slask. |
| [Löpande bandet](tools/dealer-line.md) | Från en bild till en färdig dealer: stationer, format, namn och kommandon; länkar till handboken för beställningar, beställningsagentens instruktion och granskningen. |

## Register

- `motions/<clip-id>.json` är ensam källa för en films klassning och Jakobs beslut.
- `data/clip-jobs.json` är klippbankens register: ankare, jobb (den gamla API-vägen, används inte), härledda tagningar (bland dem allt från Beställ) och API-vägens kredittak. `data/orders/<id>.json` är studions beställningar; `data/dealers.json` och `data/media-roles.json` säger vilka dealers som finns och vilka bilder som gäller.
- `placements/default.json` är Jakobs kortplan (16 kortplatser) och sparas från labbets Placering.
- `data/manifest.json` registrerar filproveniens och SHA-256 (sökvägarna i den räknas från repots rot); `evidence/` innehåller verifieringskvitton.
- `data/library.json` är V6-tidens filmkatalog (V6, sekvenser, original och diagnostiska prov); beslut hämtas från `motions/`.

Dokumenten länkar till dessa i stället för att föra egna statusregister. Media (`assets/`, `output/`), `.runtime/`, `.env*` och `private/` är lokala och Git-ignorerade.

## Kör lokalt

- Arbeta här. `node -p process.version` ska visa `v24.21.0` via Volta; `package.json` kräver `>=24.21.0 <25`. `npm ci` behövs om beroenden saknas.
- `START.cmd` startar labbservern på `http://127.0.0.1:4319` utan fönster och visar studion i en enda flik; `STATUS.cmd` och `STOPP.cmd` frågar och stoppar. `node tools/preview.ts --open "<sida>"` visar en sida i den öppna fliken i stället för i en ny, och `--restart` byter server utan att fliken stängs. Öppnas en labbflik till stänger den äldre sig själv, eller blir tom där webbläsaren inte låter en sida stänga sin flik. Rutinen: [DRIFT](docs/DRIFT.md#labbservern-och-fliken). Servern står kvar tills `STOPP.cmd` körs.
- [Studion](http://127.0.0.1:4319/studio/) är skalet (`/` och `lab.html` leder dit): en Next.js-app i `studio/` som byggs med `npm --prefix studio run build` och lämnas ut av samma server. Vyerna: **Scen**, **Karta** (kanter och tagningar), **Primära**, **Granska** (Jakobs domar, som skrivs i `motions/`), **Prov** (provmappar under `assets/proofs/`, `/studio/prov/?prov=<mapp>`), **Placering** (kortplanen: 16 kortplatser och sko; sparning ändrar bara placeringsutkastet), **Material** (vilka bilder som gäller), **Beställ** (filmbeställningar), **Casino** och **Protokoll**. Gamla labbet nås med `lab.html?gamla=1` tills Modeller och Ljud har flyttats ([SYSTEM](docs/SYSTEM.md)).
- Filmgranskningen har steg ±1 bildruta, kapitel och hastighet 0,25×/0,5×/1×. URL-parametrarna `clip` och `frame` pekar ut klipp och granskningsruta.
- `npm test` kör offlinetesterna (placeringar, klippbank, kortspår, scen, spelmotor, labbserver och publiceringsskydd). `npm run hooks:install` aktiverar lokal pre-push; `npm run check` kontrollerar commitintervallet före push/PR. Se [rutinen](docs/DRIFT.md#git-och-kontroller).
- `npm run verify` kontrollerar registrerade lokala filer. `npm run verify -- --frames` återrenderar 18 kontrollrutor och kräver pixelidentitet.
- `npm run render -- --render --take=02` startar ett nytt fullständigt V6-försök med fyra arbetare. Välj alltid ett oanvänt tvåsiffrigt nummer; `take-01` är bevarat. Kräver FFmpeg/FFprobe via PATH eller `FFMPEG`/`FFPROBE`.

## Verifierad bas och gräns

Enligt [reproduktionskvittot](evidence/reproduction.json) har hela V6 återrenderats lokalt: 926 rutor, 30 fps, 1762×1174 och 1080×1920. Båda MP4-filerna är byteidentiska med originalen; 18 kontrollrutor är pixelidentiska enligt [bildrutekvittot](evidence/frame-verification.json), också efter renderinläsningsrättningarna ([V6-kvitto](evidence/render-safety-frames.json)). Detta verifierar V6, inte utdelning till alla åtta platser. Kända begränsningar för fingermask, rörelsekanter och källskarvar kvarstår.

`src/` och `tools/` kör utan det förra projektet (snyggare-dealer, arkivet på D:). `materials/` är separata kort- och markerprov; TS-materialkällorna har inte återbyggts till de frysta JS-bundlarna. Labbet och 3D-scenen läser kortmaterialets TS-källa direkt; det ändrar inte V6-filmen eller de historiska bundlarna.

Publikt källrepo: [Jakeminator123/dealer](https://github.com/Jakeminator123/dealer). GitHub innehåller inte media eller hemligheter. Scout-integration, deploy och betald generering är separata uppdrag.

[Det publika labbet](https://dealer-delta-eosin.vercel.app/) visar ett äldre läge (release i [evidence/public-release.json](evidence/public-release.json)). Den publika sidan sparar utkast i den egna webbläsaren, lokal preview till placeringsfilen på datorn; export/import flyttar ett utkast mellan dem. Publicerade granskningsfilmer ligger i separat Vercel Blob, inte i Git eller webbpaketet.

Behåll JSON-register, manifest och webbläsarutkast. [Lagringsbedömningen](evidence/storage-choice-review.json) rekommenderar ingen SQLite- eller annan ny databas nu; framtida Scout-import är ett separat införande.

## Historiskt underlag

- Fyra hela historiska sekvenser, `pamela-sequence-{16,17}-{native,portrait}-r2`, är återställda som alternativ (Jakob: fel koordinater och format; produktionsacceptans PENDING): [återbruk](evidence/sequence-reuse-audit.json), [produktionskvitto](evidence/sequence-review-production.json), SYSTEM "Återbruk och införande".
- P4.C2:s nyare original visar BACK→EDGE→FRONT; den gula `review-v04` bevisar inte CLOSED→CLOSED: [färggranskningens p4Followup](evidence/anchor-color-audit.json).
- Promptar, start- och slutbilder och resultat för kontrollproven 10 november: [Runway-underlaget](old-lab/generation.html). P4.C1-kontrollproven (`pamela-p4-c1-color-control-01` med WAN 3, `pamela-p4-c1-kling-control-01` med Kling 3.0 Pro) är underkända för fysisk vändning; besluten står i `motions/`.
- Placeringslabbets grundkontroller: [evidence/placement-lab.json](evidence/placement-lab.json); vy- och nodkontroller: [evidence/plane-and-nodemap.json](evidence/plane-and-nodemap.json). V6:s små skuggor och fingermasker, och den senare bankens maskrättningar: [Astra-granskningen](evidence/astra-archive-mask-audit.json). Fynd från den externa granskningen: [granskningskvittot](evidence/external-review-triage.json).
