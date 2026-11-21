# Läget: film

Huvudagentens bana: vägen från bild till dealer, Beställ, efterarbetet, banken och handboken. Här står bara det som
gäller nu; varje prov och dess utfall står i handboken (`tools/film-prompting.md` §5) och det som hänt i Git.

**Läget.**
- I Bordets Beställ väljs steg och kortplats. Receptet i `data/order-methods.json` ger Kling 4, 3 s, bara giv,
  ändbilder och dockreferens. Texterna är mall 12: ingen sak sägs två gånger (`src/order-prompts.ts`).
- Metoden som håller: en giv bara dit på Kling 4 med första och sista bild och 3D-banans dockfilm som referensfilm, i
  UTDRAGEN takt (given över drygt 2 s, en obruten rörelse). Filmmodellen kopierar bilderna och dockfilmen; två extra
  meningar ändrade ingenting (pilot-03, 2026-11-20).
- Ankare 2.3: C (`paow-ankare-2-3-c`) gäller sedan Jakobs "Ja, använd C" i Beslut 2026-11-21: en riktig ruta ur en
  film från ankare 1 som dockans raka ingång styrde. A är arkiverad; B, ett montage, är ersatt (underarmen saknas,
  axellinjen lutar 5,7°). Landningen för plats 4 är `paow-a3-p4-ur-film-1120`, ur en film från C; `paow-a3-p4-23b`
  och `-23c` är byggda på B och används inte.
- Givar från C till plats 4 (Prov `paow-giv-2-3c-p4-pilot-20261120`): pilot 02 med dockan `svep24d`, där vänster
  hand går lågt hem, har Jakobs ja (Beslut 2026-11-21: "Ja, tre sekunder är lagom"); granskaren gav 4/5. Pilot 01
  med `svep24c` föll (3/5): vänster underarm försvann.
- Äldre underlag: given till plats 4 och 1 från 2.3 A (Prov `giv-fran-2-3-p4-p1`) fick Jakobs Inte bra, kortet
  flippar utanpå fingrarna. P4.C2 Cykel01 är vald framför Cykel02 (bevis i `paow-c2-film-regrip-20261118`).
- En sidovinkel görs av en färdig film i Runways videoredigerare (`edit_video`): plats 4 cirka 40° (Prov
  `sidovinkel-ur-film`, Jakob: "mycket bra"). Vinkeln och kortets plats träffas inte exakt.
- Den tatuerade uppsättningen är förstahandsvalet; ankare 2.1 och 2.2 och hela banken har de äldre händerna och
  spelas än.
- Pengar: ram 3 000 krediter genom API-nyckeln (utvecklarprojektet; Runway-MCP är inte inloggat), 800 per timme.
  Använt 2026-11-20: 669; saldo 3 480 kl. 17.07 UTC (91 drogs samma dag utan kvitto i projektets liggare). Mandatet
  `dealer-37-20261120` löpte ut 2026-11-21 12.00 UTC och förnyas av huvudagenten inför seriens beställningar.

**Nästa steg.** Samma giv från C till övriga platser: P1, P2, P3, P5, P6 och P7.
1. En dockfilm per plats som `svep24d` (3D-banan, gratis), granskad ruta för ruta: vänster underarm sedd från sidan,
   handen plan och låg, rak bål.
2. Per plats: en tagning utan sista bild för landningen, landningen (`tools/landing-make.ts`), och givens tagning med
   första och sista bild. Varje omgång granskas oberoende och döms åt Jakob (`review-put`), inte i hans kö.
3. Sedan returerna från platserna till 2.3, ingången 1 → 2.3 klippt ur ankarets film, returen 2.3 → 1, fem
   kameravinklar (`/vinklar.html`), hålkortet, andra kortet och dealerns tredje kort.

**Väntar på Jakob.** Aktuella frågor finns i Beslut; filmdomar lämnas i Granska.

**Var saker ligger.** Vägen för en ny dealer i [tools/dealer-line.md](../../tools/dealer-line.md), handboken i
[tools/film-prompting.md](../../tools/film-prompting.md), granskningen i `tools/film-review.md`, läget per dealer med
`node tools/produce.ts paow`. Banans kod: `src/order-*.ts`, `tools/order-*.ts`, `tools/film-after.ts`,
`tools/still-after.ts`, `tools/python/`, `tools/register-order.ts`, `motions/` och registren `data/order-methods.json`,
`data/media-roles.json`, `data/cut-frames.json` och `data/order-policy.json`. Arbetsfiler från 2026-11-20 under
`.runtime/`: `ankare-2-3-c/` (API-klient och liggare; dess tak, 403, är nått), `pilot-c/` (piloternas skript och
`LAGE-02.md`), `pilot-02/LAGE.md` (dockan), `granskning-pilot-c-02/` (bevis) och `prompt-granskning/RAPPORT.md`. På slaskdisken, under `D:/dealer-scratch/tmp/`: `yt-referens/`
(den filmen går aldrig in i Git, `assets/` eller ett Prov) och `dealer-3d/ut/` (dockans filmer).

**Fällor.**
- Granska första och sista bilden led för led mot gällande ankare före filmen (`tools/film-review.md`, Metod): ett
  fel i ankaret syns aldrig som skillnad mellan film och bild, och den automatiska kontrollen ser inte en arm.
- Ett ankare görs som en riktig ruta ur en film från ankare 1, inte som ett montage ur bildmodellen. Dockan ska då ha
  rak bål: filmmodellen förstorar en lutning (3° i dockan blev 10° i 2.3 A).
- Referensfilmen ska sluta som sista bilden, och blicken måste stå i texten eller bilderna: Kling tar handens och
  kortets rörelse ur referensfilmen, inte huvudet. Utan sista bild blev kortet i skons fönster vitt.
- En dockfilm i den riktiga dealerns takt (given klar på 1 s, sedan stilla) ger ett stopp med kortet rest och en
  vändning på två rutor; dra ut given och låt kortet aldrig stå stilla.
- Den automatiska kontrollen skrivs bara när orderns steg börjar med `GIV-`, räknar kortets yta på mättat blått och
  ser inte ett tryckt kort eller ett målat bord: läs storleken som ett golv.
- WAN 3 utan referensfilm faller också för handbyte (Jakobs order p4-16, 0 av 2).
- Hans ord om filmerna: [BESKED](../BESKED.md), "Filmerna och given"; det som inte går än: [BRISTER](../BRISTER.md).
