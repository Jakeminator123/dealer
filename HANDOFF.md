# TILLBAKA-1 → TILLBAKA-2

Skapad 2026-11-10T16:33:35.573356+00:00. Aktuellt agentunderlag till 2026-11-10T17:33:35.573356+00:00; verifiera därefter änderliga fakta. V6 och originalbevis är permanenta referenser.

Jakob beställde en ren syskonmapp med eget Git, V6 som referens, vänsterarmskandidat och separata SG-kort/marker. Han vill fortsätta med en ny agent och mycket korta svenska svar. Nästa agent äger enbart denna nya mapp när mottagandet bekräftats. TILLBAKA-1 slutar då skriva här.

## Överlämnat

Självständig filstruktur, 1068 hashregistrerade filer (~926 MB, främst nödvändiga PNG-rutor), fyra originalklipp, V6-film, bakgrund/matta, kortspår, mesh, hand-/nagel-/skokortsmasker. Åtta renderingsmoduler och enda körvägen tools/render.ts är hämtade från den frysta V6-snapshoten, med lokala sökvägar anpassade. Sharp installerad separat från lokal npm-cache. 18/18 okomprimerade kontrollrutor återrenderade pixelidentiskt, se evidence/frame-verification.json. Ingen full ny MP4-export ännu.

V6: assets/reference/v6.mp4, SHA-256 412a2fa01f9e852e8894002076b5771181bd6afd4ddeef1be76c0640d5853a2d. 926 rutor, 30 fps, 1762×1174. Andra givningen börjar 19,733 s; kortsläppet omkring 23 s. Båda korten kvar i slutvilan. V7-bildstudien är inte V6.

Kandidat: assets/candidates/p4-left-c2.mp4, SHA-256 67319ed86cde67cc7a7566553d451a89f8aac11384a55f8f8b460d1403d30167. 12 s, vänsterarm ur dealerns perspektiv/höger i bilden; ännu inte accepterad ersättare. Kontaktarket visar samma hand från sko till landning, men helklippet behöver granskas i rörelse.

V6:s aktiva schema är assets/timeline.json, per bildruta. Det äldre externa motionskontraktet v1/deal.player.centre/box3 finns bara som historiskt bevis. Nyare DL1 v2, spelmotor och alternativa studios är inte införda. SG-kort och marker är separata Three.js-prov, med historiska React Three Fiber-referenser, inte inbyggda 3D-marker i filmen.

## Nästa avgränsade steg

1. Bekräfta mottagande och ägarskap. Läs README, manifestets sammanfattning och det aktuella verifieringskvittot; skanna inte hela gamla labbet.
2. Återrendera V6 med npm run render -- --render --take=01, verifiera 926 rutor, tid, båda format, samtliga skarvar och kortsläpp. Visa resultatet bredvid referensen i befintlig enkel preview. Utöka inte till ny studio.
3. Spela hela vänsterarmskandidaten och låt Jakob välja; koppla inte in den automatiskt. Bevara V6:s kamera, matta, kortgeometri och timing under flytten.
4. Kort-/markerprovens frysta HTML/JS finns med. De medföljande TS-källornas återbyggnad till exakt dessa bundlar är ännu inte verifierad. Gör det först när materialredigering behövs.

Full reproduktionsverifiering och rörelseacceptans återstår, cirka 20 % av denna första avgränsade extraktion (skattning). Ingen ny generering, publiksynk, push, integration eller massinventering. Gamla labbet är bevarat, inte återställt/raderat. Alla senare Scoutmotor-/D.C2-/REDO-resultat lämnas där för selektivt återbruk.

## Drift och återgång

Ny preview 127.0.0.1:4319, STOPP.cmd i denna mapp. Gamla begärda previewn 127.0.0.1:4318 hålls separat med gamla labbets STOPP.cmd. Inga renderingsarbetare är lämnade igång. En begärd preview kan stå kvar för Jakob. Inga underagenter.

Gamla landmärket: C:/Users/jakem/dev/super-feature-sg/snyggare-dealer/.runtime/landmarks/P4-CENTRAL-MATTA-SG-20261109. Gamla före-granskning-checkpoint: .runtime/checkpoints/20261110T155513Z-TILLBAKA-1-before-review. Gamla HEAD: 68c74bde6e977e2cda202d0501dcc419fc92864d. Läs endast vid konkret behov.
