# TILLBAKA-1 → TILLBAKA-2

Skapad 2026-11-10T16:40:35.855885+00:00. TTL för änderliga agentuppgifter: 2026-11-10T17:40:35.855885+00:00. V6 och källbevis är permanenta referenser.

Jakob har beställt den nya rena syskonmappen dealer och en ny agent. Detta är dess arbetsyta: C:/Users/jakem/dev/super-feature-sg/dealer. Gamla snyggare-dealer är bevarat. Slutmålet är Scoutgaming. Läs AGENTS.md, README.md och denna handoff; undvik bred historikläsning.

## Klart och verifierat

- V6 är Jakobs valda visuella referens, inklusive samma hand, vridning, mattan, andra kortets förskjutning och mindre skugga. Native original: assets/reference/v6.mp4, SHA-256 412a2fa01f9e852e8894002076b5771181bd6afd4ddeef1be76c0640d5853a2d.
- Självständig kod, eget Git på jakob/test, egen Sharp-installation och lokal preview. 1068 överförda registrerade filer (~926 MB; huvudsakligen de nödvändiga PNG-bildrutorna), fyra originalklipp, källrutor, masker, kortspår, mesh, rum/matta, referensfilm och separata materialprov. Inga runtime-läsningar från gamla labbet.
- Hela V6 återrenderad: output/v6/take-01. 926 rutor, 30 fps, 30.866667 s, native 1762x1174 och porträtt1080x1920. BÅDA MP4-filerna är byteidentiska med de frysta historiska originalen. 18 kontrollrutor dessutom pixelidentiska. evidence/reproduction.json och evidence/frame-verification.json är kvitton. Renderingsarbetarna är avslutade.
- Preview finns på http://127.0.0.1:4319/preview.html, med godkänd referens, ny byteidentisk rendering samt materiallänkar. SG-kortets fram/baksida och SG-markern är visuellt kontrollerade i WebView. Marker är separata prov, inte integrerade i V6-filmen.
- V6 är offline-komposition med Sharp/FFmpeg och assets/timeline.json per bildruta. Historiska v1-kontraktet kopplar P4 till deal.player.centre/box3. Senare DL1/v2 och spelmotor är inte importerade. Materialproven är direkt Three.js r167; historiska React Three Fiber-källreferenser följer med separat.

## Aktuellt beslut och nästa uppgift

Jakob har även korrigerat den nya 4-sekunderstagningen p4-c2-center-01: CLOSED → CLOSED. TILLBAKA-2:s tidigare slutsats om vändning var fel. Kantpassage, färgbyte och handbyte bevisar inte TURN. Rörelsen är villkorligt godkänd med gul synlig sida hela vägen. Sidbyte och förflyttning i greppet vid kantpassage är pausade.

Kanoniskt original och ett sammanhängande lokalt gul→gul-prov finns under `assets/motions/pamela-p4-c2-left-closed-closed/`. Ensam aktuell status: `motions/pamela-p4-c2-left-closed-closed.json`. Provets 120 rutor behåller tid och rörelse; P4.C1 är blå, P4.C2 gul. Färgytorna har separat förlustfri RGB-mask och konturen är visningsstil. Provet är PENDING; överlapp och kantmasker behöver slutgranskas. Originalet är bevarat med samma hash. Historiska granskningen i evidence/left-turn-review.json är uttryckligen ersatt.

En väg överenskommen med MAINTAIN: engelska systembegrepp, en tidslinje, källbundna annoteringar, separata koordinatuppslag per vy. Sträng och framtida nodvy beskriver samma data. TILLBAKA-2 äger film/kod/metadata/HANDOFF/evidence; MAINTAIN äger README, SYSTEM/DRIFT, GitHub och miljökonfiguration. Externa sekvensguiden och HTML-skissen är underlag; MAINTAIN sammanfogar relevanta delar.

Målbanken omfattar två kort för P1–P7, dealerns öppna utdelning, stängda hålkort och senare reveal. Scout är auktoritet för ordning och spelstatus: `C:/Users/jakem/dev/scoutgaming/packages/presentation/contracts/filmed-profile.mjs` skiljer spelare 1–7, dealer, hole och flip. Denna P4-rörelse är inte automatiskt kalibrerad för dealerplatsen.

Arkivflytt: dealer är lokalt självständigt (1070 registrerade filer verifierade). Gamla labbet upptar 163,2 GB; Git endast 4,63 MB. Klartecken för direkt flytt till D: saknas: gamla servern PID 38944 (src/server.ts) var aktiv vid kontrollen, och en intern junction har absolut C:-mål. MAINTAIN har fått exakta hinder. Inga processer stoppade och inget gammalt material flyttat/raderat.

## Historik före senaste korrigeringen

Den visade vänsterarmskandidaten assets/candidates/p4-left-c2.mp4 är INTE rätt vridningsrörelse. Jakob sa uttryckligen: hon vrider inte handen; closed/unrevealed → closed. Den är ommärkt och får inte beskrivas som accepterad ersättning. Källa SHA-256 67319ed86cde67cc7a7566553d451a89f8aac11384a55f8f8b460d1403d30167, 12 s. Vänster betyder hennes anatomiska vänster, höger i bild. Håll rörelsehand, kortsida och målplats separata.

Bekräfta först mottagande och ägarskap. Sök därefter avgränsat efter redan befintlig film med vänsterarm OCH tydlig handledsvridning från stängt till öppet kort, liknande den gillade V6-rörelsen. Ingen ny generering. Relevanta läsbara kandidatgrupper i gamla labbet: runs/20261109-pamela-sequence/original/pamela-central-base-wan3.mp4 (V6-källan finns även här i assets/originals/deal.mp4), runs/20261109-pamela-seat-bank, och runs/20261110-pamela-goal-pilot. Granska rörelsen i sammanhängande rutor och låt Jakob välja innan byte. Sök inte efter enbart ordet left och anta matchning.

TILLBAKA-2:s tidigare TURN-tolkning av P4 C2 från målpiloten är återkallad, se aktuellt beslut ovan. V6 är orörd.

Själva utvalda V6-flytten är 100 % verifierad. Materialprovens medföljande TS-källor har ännu inte återbyggts till de frysta JS-bundlarna; det är en framtida materialredigeringskontroll.

## Ägarskap och drift

TILLBAKA-1 har lämnat över. Aktuellt filägande är delat med MAINTAIN enligt ovan. GitHub-upplägg hanteras av MAINTAIN med Jakobs uttryckliga uppdrag i den chatten. Ingen deploy, betald generering eller integration i Scout är beställd. Inga underagenter.

Ny preview 127.0.0.1:4319 stoppas med STOPP.cmd i dealer. Den får stå kvar för Jakob, autoavstängning efter 60 s utan preview-flik. Gamla begärda previewn 4318 styrs separat av snyggare-dealer/STOPP.cmd och får inte dödas tillsammans med andra Node-processer. Återanvänd verifierad server. Ingen ny server på samma port.

Gamla landmärket: C:/Users/jakem/dev/super-feature-sg/snyggare-dealer/.runtime/landmarks/P4-CENTRAL-MATTA-SG-20261109. Före-granskning-checkpoint: .runtime/checkpoints/20261110T155513Z-TILLBAKA-1-before-review. Gamla HEAD: 68c74bde6e977e2cda202d0501dcc419fc92864d. Alla nyare Scoutmotor-/D.C2-/REDO-resultat är bevarade i gamla labbet för selektivt återbruk. Inga återställningar/raderingar.
