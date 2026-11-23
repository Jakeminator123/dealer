# Läget: mätning och ankare 2.3

Banan MODEL, avslutad 2026-11-18 på Jakobs ord. Allt arbete ligger på D:; i repot finns bara proven och ankaret.

**Läget.** En riktig dealer är mätt ur en YouTube-film, banans A2.3 för Paow (båda händerna vid skon) fick Jakobs ja
men är ersatt, och given från det till plats 5 har fyra tagningar, där den fjärde håller i den automatiska kontrollen.
- Mätningen: hon delar med två händer, 0,77 s per kort (0,62–0,90 per varv). Vänster hand stryker ut kortet och för
  det plant på filten 7–31 cm från skon; båda händerna reser det på en kortsida; höger hand bär och fäller det framåt,
  ände över ände, och lägger det med fingertopparna kvar. Hålkortet vänds inte och förs bara av vänster hand, kant i
  kant med det öppna. Andra kortet läggs ovanpå det första, 6–7,5 cm mot dealern, och rör det inte. Huvudet följer
  platsen. Filmen visar inte tummens läge eller ögonens riktning.
- Banans A2.3: `assets/anchors/paow-ankare-2-3-a/` (kvitto bredvid), ruta 94 ur ingångsfilmen från ankare 1. Jakob
  arkiverade det 2026-11-20 (Material); gällande A2.3 är `paow-ankare-2-3-d` sedan 2026-11-23 ([film](film.md)).
- Kostnad: ankaret 105 krediter (20 för ett utsnitt som föll, 85 för filmen); given 256 (fyra tagningar à 64).
  Saldot hos Runway var 5 392 när banan stängdes.

**Nästa steg.** Banan är stängd; givarna från A2.3 till varje plats och ankarna A3PnC1 fortsätter i [film](film.md).
Kvar härifrån: kortet i skons fönster hade en ljus överkant i ankare 1 och i banans A2.3 (bankens platta); pröva
gällande A2.3 (`-c`) innan något rättas i en ankarbild.

**Väntar på Jakob.** Inget utanför Beslut.

**Var saker ligger.**
- Mätningen: `D:/dealer-scratch/tmp/yt-referens/LASMIG.md`, talen i `ut/` (`matt.json`, `giv-fran-2-3.md`,
  `vandning-narbild.md`, `giv-resten.md`), modellen i `modell/`.
- Ankaret: `D:/dealer-scratch/tmp/ankare-2-3/RAPPORT.md`, liggaren `bestallningar.json`, skripten i `skript/`.
- Given: `D:/dealer-scratch/tmp/giv-fran-2-3-p5/RAPPORT.md`, liggaren, texterna i `texter/giv-p5-t1…t4.txt`, sista
  bilden `sista/b/sista-bild-t2.png`, dockorna i `D:/dealer-scratch/tmp/dealer-3d/ut/giv-fran-2-3-p5/` (-a till -d).
- Receptet som höll (tagning 4): Runway genom MCP, `generate_video`, `kling-4`, 1080p, 3 s; första bild ankare 2.3;
  sista bild = en egen slutruta med planens kort ritat (`skript/rita-kort.ts`, repots `drawCard`) och bankens sko
  tillbaka (`ankare-2-3/skript/skolagning-23.py --inget-vitt`, platta = ankare 1); `referenceVideos` = dockan -d med
  `durationSeconds` 3; ingen `ratio`, ingen `generateAudio`. Ingångsfilmen: samma, 4 s, första bild ankare 1, ingen
  sista bild.
- Efterarbete och kontroll: en spegelrot utanför repot (`skript/spegel.sh <id> <sista bild>`, som sätter
  `step.key` till `GIV-2.3` och `motion.target` till `P5.C1`), sedan `node tools/film-after.ts <id> 1 --lock` med
  spegelroten som arbetsmapp; `dealCheck` står då i `after.json`. Ankarets stillbild: `gron-till-niva.py`,
  `ta-bort-skugga.py` och `skript/skugga-mjuk.py`, inte `toneTo`.
- Vad tagningarna visade: 1 (docka i hennes takt, ingen sista bild) vitt fönster och för kort lagt kort; 2 (rättat
  grepp, sista bild) färgbyte utan kantruta efter en sekunds stopp; 3 (given över två sekunder) en hel vändning, tre
  stötar; 4 (höger hand möter kortet, rest i fyra rutor, lagt på platsen) kant ruta 34–37, lagt från ruta 45.

**Fällor.**
- Klings takt, sista bilden och `dealCheck`: se Fällor i [film](film.md).
- Kling kopierar dockans fel (grepp, stopp, glidning): se dockans ark före varje beställning.
- `toneTo` fräter ur ansiktet på en filmruta; tonen tas ur filmens tonlås (`--lock`).
- YouTube-filmen och rutorna ur den (`yt-referens/film`, `rutor`, `ark`, `stillbilder`) går aldrig in i Git,
  `assets/` eller ett Prov.
- Signerade adresser från Runway ligger bara i `url/` på D:.
