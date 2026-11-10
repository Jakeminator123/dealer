# TILLBAKA-1 → TILLBAKA-2

Skapad 2026-11-10T16:40:35.855885+00:00. TTL för änderliga agentuppgifter: 2026-11-10T17:40:35.855885+00:00. V6 och källbevis är permanenta referenser.

Jakob har beställt den nya rena syskonmappen dealer och en ny agent. Detta är dess arbetsyta: C:/Users/jakem/dev/super-feature-sg/dealer. Gamla snyggare-dealer är bevarat. Slutmålet är Scoutgaming. Läs AGENTS.md, README.md och denna handoff; undvik bred historikläsning.

## Klart och verifierat

- V6 är Jakobs valda visuella referens, inklusive samma hand, vridning, mattan, andra kortets förskjutning och mindre skugga. Native original: assets/reference/v6.mp4, SHA-256 412a2fa01f9e852e8894002076b5771181bd6afd4ddeef1be76c0640d5853a2d.
- Självständig kod, eget Git på jakob/test, egen Sharp-installation och lokal preview. 1068 överförda registrerade filer (~926 MB; huvudsakligen de nödvändiga PNG-bildrutorna), fyra originalklipp, källrutor, masker, kortspår, mesh, rum/matta, referensfilm och separata materialprov. Inga runtime-läsningar från gamla labbet.
- Hela V6 återrenderad: output/v6/take-01. 926 rutor, 30 fps, 30.866667 s, native 1762x1174 och porträtt1080x1920. BÅDA MP4-filerna är byteidentiska med de frysta historiska originalen. 18 kontrollrutor dessutom pixelidentiska. evidence/reproduction.json och evidence/frame-verification.json är kvitton. Renderingsarbetarna är avslutade.
- Preview finns på http://127.0.0.1:4319/preview.html, med godkänd referens, ny byteidentisk rendering samt materiallänkar. SG-kortets fram/baksida och SG-markern är visuellt kontrollerade i WebView. Marker är separata prov, inte integrerade i V6-filmen.
- V6 är offline-komposition med Sharp/FFmpeg och assets/timeline.json per bildruta. Historiska v1-kontraktet kopplar P4 till deal.player.centre/box3. Senare DL1/v2 och spelmotor är inte importerade. Materialproven är direkt Three.js r167; historiska React Three Fiber-källreferenser följer med separat.

## Jakobs senaste korrigering – nästa uppgift

Den visade vänsterarmskandidaten assets/candidates/p4-left-c2.mp4 är INTE rätt vridningsrörelse. Jakob sa uttryckligen: hon vrider inte handen; closed/unrevealed → closed. Den är ommärkt och får inte beskrivas som accepterad ersättning. Källa SHA-256 67319ed86cde67cc7a7566553d451a89f8aac11384a55f8f8b460d1403d30167, 12 s. Vänster betyder hennes anatomiska vänster, höger i bild. Håll rörelsehand, kortsida och målplats separata.

Bekräfta först mottagande och ägarskap. Sök därefter avgränsat efter redan befintlig film med vänsterarm OCH tydlig handledsvridning från stängt till öppet kort, liknande den gillade V6-rörelsen. Ingen ny generering. Relevanta läsbara kandidatgrupper i gamla labbet: runs/20261109-pamela-sequence/original/pamela-central-base-wan3.mp4 (V6-källan finns även här i assets/originals/deal.mp4), runs/20261109-pamela-seat-bank, och runs/20261110-pamela-goal-pilot. Granska rörelsen i sammanhängande rutor och låt Jakob välja innan byte. Sök inte efter enbart ordet left och anta matchning.

Själva utvalda V6-flytten är nu 100 % verifierad, ingen återstående flyttgrind. Att hitta/godkänna vänsterarm med vridning är nästa separat kvarvarande uppgift (0 % godkänt). Materialprovens medföljande TS-källor har ännu inte återbyggts till de frysta JS-bundlarna; det är en framtida materialredigeringskontroll, inte ett påstående om verifierad bundlingskedja. Ingen vidgad studio eller nytt rörelseschema behövs.

## Ägarskap och drift

TILLBAKA-2 tar över denna mapp när mottagandet bekräftas; TILLBAKA-1 slutar skriva efter överlämningen. Kort svenska svar, normalt <=120 ord. Ingen remote, push, deploy, betald generering, uppladdning eller integration i Scout. Inga underagenter.

Ny preview 127.0.0.1:4319 stoppas med STOPP.cmd i dealer. Den får stå kvar för Jakob, autoavstängning efter 60 s utan preview-flik. Gamla begärda previewn 4318 styrs separat av snyggare-dealer/STOPP.cmd och får inte dödas tillsammans med andra Node-processer. Återanvänd verifierad server. Ingen ny server på samma port.

Gamla landmärket: C:/Users/jakem/dev/super-feature-sg/snyggare-dealer/.runtime/landmarks/P4-CENTRAL-MATTA-SG-20261109. Före-granskning-checkpoint: .runtime/checkpoints/20261110T155513Z-TILLBAKA-1-before-review. Gamla HEAD: 68c74bde6e977e2cda202d0501dcc419fc92864d. Alla nyare Scoutmotor-/D.C2-/REDO-resultat är bevarade i gamla labbet för selektivt återbruk. Inga återställningar/raderingar.
