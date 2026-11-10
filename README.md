# Dealer

Ren lokal arbetsyta för Pamela/P4 med V6 som godkänd visuell referens. Slutmålet är Scoutgaming.

- `src/`: V6-renderaren och dess sju lokala kodberoenden.
- `tools/`: rendera, verifiera, visa. Node 24.21.0; Sharp 0.35.5 i eget node_modules.
- `assets/`: original, exakt använda bildrutor, masker, bord, bakgrund, tidslinje, referensfilm och separat vänsterarmskandidat. Lokalt, utanför Git.
- `manifest.json`: varje överförd fils källa och SHA-256. Historiska sökvägar är proveniens, aldrig runtime-fallback.
- `materials/`: fristående SG-kort och marker i Three.js. Källor och licens finns under source. Inte integrerade marker i V6.
- `evidence/`: historiska bevis och aktuellt verifieringskvitto. Inte aktiva konfigurationer.
- `output/`: nya unika försök, utanför Git.

## Köra

Kör från denna mapp. `node -p process.version` ska visa v24.21.0. Vid behov: `npm ci`.

`START.cmd` öppnar servern på http://127.0.0.1:4319. `STOPP.cmd` stoppar enbart denna server via identitetskontrollerad kontrollkanal. `STATUS.cmd` visar status. Servern stängs 60 sekunder efter sista öppna preview-fliken; använd Codex WebView. Gamla labbets preview på 4318 har eget STOPP.cmd.

`npm run verify` verifierar registrerade filer. `npm run verify -- --frames` återrenderar 18 kontrollrutor och kräver pixelidentitet mot de sparade okomprimerade V6-rutorna.

`npm run render -- --render --take=01` återrenderar alla 926 rutor, båda formaten, med fyra arbetare. Varje nytt försök kräver ett nytt tvåsiffrigt nummer. FFmpeg och FFprobe hittas via PATH eller explicit FFMPEG/FFPROBE; inga personliga sökvägar i renderingskoden.

## Evidensgräns

1068 registrerade filer verifierade; 18 av 18 kontrollrutor pixelidentiska i den nya självständiga mappen. En full ny filmexport har ännu inte körts. Att visa referensfilmen är inte likvärdigt med verifierad full reproduktion. V6 behåller sina kända begränsningar för fingermask, rörelsekanter och skarvar mellan källtagningar.

V6 använder en fryst bildrutetidslinje och offline-komposition med Sharp/FFmpeg. Det äldre rörelsekontraktet är v1, med P4 kopplad till deal.player.centre/box3. Det senare DL1/v2-kontraktet har inte importerats. Manifestet här är ett filregister, inte en ny spelmotor.

Vänsterarmskandidaten är P4 C2: hennes anatomiska vänster, till höger i bilden, 12 sekunder. Urvalet har bildgranskats; helklippet ska granskas i rörelse innan användning. Rörelsehand och målplats hålls separata.

Gamla snyggare-dealer, checkpoints, alla nya filmer, Scoutmotor-, D.C2- och REDO-arbeten är bevarade på ursprunglig plats. Ingen automatisk läsning av gammal kod eller node_modules. Ingen remote eller publicering.
