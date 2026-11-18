# Läget: film

Huvudagentens bana: vägen från bild till dealer, Beställ, efterarbetet, banken och handboken. Här står bara det som
gäller nu; varje prov och dess utfall står i handboken (`tools/film-prompting.md` §5) och det som hänt i Git.

**Läget.**
- Filmstandardens första del är inne i `main` (`553d254`): mall 10 skriver en öppen giv, den automatiska kontrollen
  (`src/deal-check.ts`, `dealCheck` i `after.json`) fäller det Jakob underkänner på synen, sista bilden i en giv bara
  dit är rutan där bankens godkända retur börjar (`cutFrameOf`, `src/cut-frame.ts`), och en renderad referensfilm
  (3D-banans docka) bärs av ordermodellen och bjuds först.
- Metoden som håller är en giv bara dit på Kling 4 med första och sista bild och en referensfilm. Med dockans film
  håller plats 4 (C2 och C3, 4/5), plats 5 är oavgjord (E, 3/5) och plats 3 föll (D, 1/5); C4 med förlagan "-3" fick
  3/5. Släpet från ankare 2.2 till plats 4 håller med Pamelas släp som referensfilm. Allt ligger i Prov
  `giv-forlagefilm-2`, oberoende granskat; inget är dömt av Jakob och inget är infört i banken.
- Den tatuerade uppsättningen är Jakobs förstahandsval: keystone sittande och stående och ankare 1 gäller (`f8e3f6c`,
  `b0a03f3`); ankare 2.1 finns inte med de händerna. Bankens filmer har otatuerade, större händer och spelas än.
- Nytt ankare 2.2 (Prov `paow-ankare-2-2-blick`): tre försök med utsnitt i bildmodellen föll (2/5, 100 krediter);
  kandidat A står kvar i Material. Vägen som gäller nu, för 2.2 och 2.3: ankaret tas ur en film som dockan styr.
- Dockans filmer "-2" och "-3" har den äldre vändningen av kortet; "-4" (en enda vridning) gäller. C5 med "-4" gav
  kvällens renaste vändning men kortet hoppar när det läggs (3/5): nästa förlaga ska sänka kortet jämnt ruta 60–80.
- Sessionen MODEL (gör ankare 2.3, `ankare-2-3/RAPPORT.md`) mätte en riktig dealer: två händer, ett kort per 0,75–0,9 s,
  vändning i luften, kameran lägre och närmare än bankens. Ur det kom ankare 2.3: båda händerna precis före draget.
- Läs saldot hos Runway (`whoami`) före en beställning. Taket per beställning är 2 000.
- Trailern är pausad på Jakobs ord 2026-11-17: inget beställs och inget byts i den förrän han säger till.

**Nästa steg.**
1. Starta vakten på Jakobs kö i Beställ (`vakta-kon.mjs`): den går i huvudagentens chatt i halvtimmar och dör med
   chatten. Godkänner han en beställning startar huvudagenten beställningsagenten (`tools/order-clerk.md`).
2. Ankare 2.3, Jakobs beställning: sessionen MODEL lägger EN tagning i Kling 4 (4 s, första bild `paow-vila-tatuerad`,
   dockans film som referens, ingen sista bild) inom huvudagentens tak (140 + 200 krediter) och lämnar kandidaten dit.
   Text, efterarbete: `yt-referens/LASMIG-OVERLAMNING-2026-11-18.md` avsnitt 2; dockfilm: Prov `dealer-3d-till-ankare-2-3`.
3. För in utfallet av nattens prov: C5 (`giv-experiment-2/c5/RAPPORT.md`, handboksraden) och stol 1
   (`stol-1/RAPPORT.md`, Prov `dealer-fran-stol-1`). Hämta lagda uppdrag ur liggarna i stället för att beställa om.
4. Filmstandardens andra del, grenen `film-standard-register` (`d034595`), efter listan i mappen `film-standard`.
5. Ankare 2.2 samma väg som 2.3 (3D-banans förlaga för släpet), sedan med tatuerade händer: ankare 2.1, ingången
   till 2.2, landningsbilder för plats 3–5 där handen slutar som dockans, och en tagning till på plats 3.
6. Senare, inget beställt eller byggt: fler kort än två på en plats, split, dealerns tredje och fjärde kort, nio
   returer till vila, fingrarna och vinkningen, plats 6 utan omväg, byte vid skon (`plan-runda-via-2-2.md`), och
   Jakobs önskemål (höger arm, kaffemugg, marker, insamling av korten, en andra spelare).

**Väntar på Jakob.** Kortet `dealer-fran-stol-1` i Beslut är besvarat med ja och ligger kvar tills provet är levererat.

**Var saker ligger.** Vägen för en ny dealer i [tools/dealer-line.md](../../tools/dealer-line.md), handboken i
[tools/film-prompting.md](../../tools/film-prompting.md), granskningen i `tools/film-review.md`, metoden per steg i
`data/order-methods.json`, läget per dealer med `node tools/produce.ts paow`. På slaskdisken, under
`D:/dealer-scratch/tmp/`: `film-standard/` (listan för andra delen, `referenskontroll.tsv`), `giv-experiment/` och
`giv-experiment-2/` (texter, rapport, `ledger.json`), `ankare-2-2-blick/`, `yt-referens/LASMIG.md` (MODEL; den filmen
går aldrig in i Git, `assets/` eller ett Prov), `huvudagent11/look/` (`vakta-kon.mjs`, `ko-nu.mjs`, `hand-slutet/`),
`huvudagent11/nya-filmer/plan-runda-via-2-2.md`, `giv-utredning/RAPPORT.md` och `pamela-formel/RAPPORT.md`. Trailern:
överlämningen `dealer-1e/LASMIG-OVERLAMNING-2026-11-17.md`, `trailer-3b/`, `dealer-1e/intro/`, provet `trailer-noir-3`.

**Fällor.**
- Referensfilmen ska sluta som sista bilden (handens sida och fingrarna på kortet), annars hittar Kling på slutet.
- Blicken måste stå i ankaret och i sista bilden: Kling tar handens och kortets rörelse ur referensfilmen, inte huvudet.
- En referens väljs efter vad den visar, inte bara efter Jakobs dom, och mäts innan den används: Pamelas giv till
  plats 1 faller. Dockfilmer finns för plats 3–5; plats 6 och 7 går genom skon och plats 1 korsar kroppen.
- WAN 3 utan referensfilm och Kling 3.0 Motion Control faller (handboken §5).
- Mall 7:s mening om mer rörelse kostade kortet i 15 av 18 tagningar; hur hon rör sig utan det är öppet.
- Det nya ankarets handpunkter förs inte in i `data/dealer-standard.json`, som är bankens vilobild för alla dealers.
- Hans ord om filmerna: [BESKED](../BESKED.md), "Filmerna och given"; det som inte går än: [BRISTER](../BRISTER.md).
