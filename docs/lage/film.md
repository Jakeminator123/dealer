# Läget: film

Huvudagentens bana: vägen från bild till dealer, Beställ, efterarbetet, banken och handboken. Här står bara det som
gäller nu; varje prov och dess utfall står i handboken (`tools/film-prompting.md` §5) och det som hänt i Git.

**Läget.**
- En film beställs längs en rak linje (`babd05d`): i Bordets Beställ väljs steget och kortets plats, och receptet i
  `data/order-methods.json` ger resten (en giv: Kling 4, 3 s, bara dit, första och sista bild, referensfilm). Utan
  undantag går 8 av 61 kombinationer att beställa; de andra säger varför (slutbild saknas, eller dockans film).
- Metoden som håller: en giv bara dit på Kling 4 med första och sista bild och 3D-banans dockfilm som referensfilm, i
  UTDRAGEN takt (given över drygt 2 s, en obruten rörelse). I den riktiga dealerns takt tappar Kling vändningen.
- Ankare 2.3 (båda händerna vid skon, blicken ned) gäller på Jakobs ja. En giv därifrån (`GIV-2.3`) slutar på platsens
  A3, en slutbild per kortplats och hand (`tools/landing-make.ts`), och går att beställa genom Bordet till varje plats
  som har ett A3 och en dockfilm. A3 finns som kandidat för plats 1, 4 och 5 (Prov `a3-slutbilder`).
- Nya filmer 2026-11-18, genom linjen och den automatiska kontrollen: given till plats 4 och plats 1 (Prov
  `giv-fran-2-3-p4-p1`) fick Jakobs Inte bra, utan skäl än (kortet i Beslut frågar), och ingången
  (`paow-ingang-2-3-01`) underkände han: stilla från ruta 45. Tagning 4 till plats 5 ligger i banken som kandidat.
- En sidovinkel görs av en färdig film i Runways videoredigerare (`edit_video`), inte av nya stillbilder: plats 4
  cirka 40° (Prov `sidovinkel-ur-film`, Jakob: "mycket bra") och plats 5 cirka 25–30°. Vinkeln och kortets plats
  träffas inte exakt. Provsidan `/vinklar.html` binder ihop två vinklar i en scen.
- Den tatuerade uppsättningen är förstahandsvalet (keystone, ankare 1 och 2.3); ankare 2.1 och 2.2 och hela banken
  har de äldre händerna och spelas än. Ankare 2.2 föll i tre försök i bildmodellen och görs om som 2.3.
- Saldot var 5 105 den 2026-11-18 (`whoami` före en beställning); taket är 2 000 per order. Trailern är pausad.

**Nästa steg.**
1. Starta vakten på Jakobs kö i Beställ (`vakta-kon.mjs`; den dör med chatten), och anslut Runway (`/mcp`) på ett
   nytt konto. Godkänner han en order startas beställningsagenten (`tools/order-clerk.md`).
2. Ingången till 2.3 ([BESKED](../BESKED.md), "Ingången på halva tiden"): klipp det stilla slutet så att filmen är
   cirka 2 s (`tools/film-fix.ts` kortar i dag högst tre rutor: bygg ut), eller pröva hans förslag, EN film från
   ankare 1 via 2.3 till platsens A3 som klipps i två (dockans posfilm b och giv f i följd som referensfilm).
3. Givarna: läs hans svar på kortet i Beslut före en ny tagning. Resten av bordet (A3 för plats 2, 3, 6, 7 och
   dealerns kort, 25 krediter per plats med ideogram-4.5-precise-edit; giv 64 per tagning) först när en giv har hans
   ja. Plats 1 kräver en docka som kan resa sig ([dealer3d/LASMIG.md](../../dealer3d/LASMIG.md)).
4. Fem kameravinklar ([BESKED](../BESKED.md)): hans bild 35° från sidan som styrande stillbild, och `/vinklar.html`.
5. Senare: ankare 2.1 och 2.2 med tatuerade händer, hålkortet (vänds inte) och andra kortet ovanpå det första
   (`yt-referens/ut/giv-resten.md`), returer till vila, dealerns tredje kort, och Jakobs önskemål i BESKED.

**Väntar på Jakob.** Inget utanför Beslut.

**Var saker ligger.** Vägen för en ny dealer i [tools/dealer-line.md](../../tools/dealer-line.md), handboken i
[tools/film-prompting.md](../../tools/film-prompting.md), granskningen i `tools/film-review.md`, läget per dealer med
`node tools/produce.ts paow`. Banans kod: `src/order-*.ts`, `tools/order-*.ts`, `tools/film-after.ts`,
`tools/still-after.ts`, `tools/python/`, `tools/register-order.ts`, `motions/` och registren `data/order-methods.json`,
`data/media-roles.json`, `data/cut-frames.json` och `data/order-policy.json`. På slaskdisken, under
`D:/dealer-scratch/tmp/`, med en liggare (`bestallningar.json`) i varje: `giv-fran-2-3-p5/` och `ankare-2-3/` (MODEL),
`sidovinkel-v2v/`, `stol-1/` (provens tak på 2 000), `bestall/`, `giv-experiment-2/`, `yt-referens/` (den filmen går
aldrig in i Git, `assets/` eller ett Prov), `dealer-3d/ut/` (dockans filmer) och `huvudagent11/look/` (`vakta-kon.mjs`).

**Fällor.**
- Referensfilmen ska sluta som sista bilden, och blicken måste stå i texten eller bilderna: Kling tar handens och
  kortets rörelse ur referensfilmen, inte huvudet. Utan sista bild blev kortet i skons fönster vitt.
- En dockfilm i den riktiga dealerns takt (given klar på 1 s, sedan stilla) ger ett stopp med kortet rest och en
  vändning på två rutor; dra ut given och låt kortet aldrig stå stilla.
- Den automatiska kontrollen skrivs bara när orderns steg börjar med `GIV-`, räknar kortets yta på mättat blått och
  ser inte ett tryckt kort eller ett målat bord: läs storleken som ett golv.
- WAN 3 utan referensfilm faller också för handbyte (Jakobs order p4-16, 0 av 2). Hans utkast `paow-giv-2-1-p6-11`
  ligger oincheckat och är det äldre förvalet: säg det till honom före ett godkännande.
- Hans ord om filmerna: [BESKED](../BESKED.md), "Filmerna och given"; det som inte går än: [BRISTER](../BRISTER.md).
