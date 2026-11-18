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
  `giv-fran-2-3-p4-p1`) fick Jakobs Inte bra: kortet flippar utanpå fingrarna, så dockan måste hålla kortet genom
  vändningen. Ingången (`paow-ingang-2-3-01`) underkände han: stilla från ruta 45. Tagning 4 till plats 5 är kandidat.
- En sidovinkel görs av en färdig film i Runways videoredigerare (`edit_video`), inte av nya stillbilder: plats 4
  cirka 40° (Prov `sidovinkel-ur-film`, Jakob: "mycket bra") och plats 5 cirka 25–30°. Vinkeln och kortets plats
  träffas inte exakt.
- Den tatuerade uppsättningen är förstahandsvalet (keystone, ankare 1 och 2.3); ankare 2.1 och 2.2 och hela banken
  har de äldre händerna och spelas än. Ankare 2.2 föll i tre försök i bildmodellen och görs om som 2.3.
- Läs aktuellt saldo med `whoami` före beställning; kontot delas med 3D-Dealer. Denna Codex-omgång har högst
  800 krediter per rullande timme och 2 500 totalt. Det tidsatta mandatet i orderpolicyn spärrar nya starter vid taket
  eller efter sluttiden; egna orderkvitton reserverar värsta kostnaden (BESKED).

**Nästa steg.** Ett mål i taget: EN dokumenterat granskad giv enligt Jakobs mandat.
1. Huvudagenten styr en granskad pilot enligt räddningsmandatet i BESKED. Anslutning och workspace verifieras med
   Runway-MCP; egen kostnad bokförs per order och samordnas i skrivbordets DISKMASKIN.TXT.
2. H24-03 (MINIMAL, 64 krediter) är Variant 4/5, dömd åt Jakob med oberoende granskare; bevis finns vid tagningen.
   Rosa fläck finns också i A3-slutankaret. Retur/helkedja återstår; H24-02 stoppades före Runway av anslutningens schema.
3. Alternativet med plant kort och vändning först efter släpp är fortfarande ett separat förslag i Beslut;
   det är inte en godkänd metod. En godkänd kodkontroll gör inte en film visuellt godkänd.
4. Plats 1 (hans ord i Prov): A3 · P1 görs om med modellen som lämnar ansiktet orört, och vägen tillbaka från den
   framåtlutade slutbilden kräver en egen idé. Ingången till 2.3 ligger klippt i Prov `ingang-2-3-klippt` (1,9 och
   1,7 s, mätt stilla från ruta 42): hans Bra för in den som ett utsnitt (derived) av samma film, utan omkodning.
5. Väntar tills en giv har hans ja: resten av bordet, fem kameravinklar (`/vinklar.html`), ankare 2.1 och 2.2 med
   tatuerade händer, hålkortet, andra kortet (`yt-referens/ut/giv-resten.md`), returer och dealerns tredje kort.

**Väntar på Jakob.** Aktuella frågor finns i Beslut; filmdomar lämnas i Granska.

**Var saker ligger.** Vägen för en ny dealer i [tools/dealer-line.md](../../tools/dealer-line.md), handboken i
[tools/film-prompting.md](../../tools/film-prompting.md), granskningen i `tools/film-review.md`, läget per dealer med
`node tools/produce.ts paow`. Banans kod: `src/order-*.ts`, `tools/order-*.ts`, `tools/film-after.ts`,
`tools/still-after.ts`, `tools/python/`, `tools/register-order.ts`, `motions/` och registren `data/order-methods.json`,
`data/media-roles.json`, `data/cut-frames.json` och `data/order-policy.json`. På slaskdisken, under
`D:/dealer-scratch/tmp/`, med en liggare (`bestallningar.json`) i varje: `giv-fran-2-3-p5/` och `ankare-2-3/` (MODEL),
`sidovinkel-v2v/`, `stol-1/` (provens tak på 2 000), `bestall/`, `giv-experiment-2/`, `yt-referens/` (den filmen går
aldrig in i Git, `assets/` eller ett Prov) och `dealer-3d/ut/` (dockans filmer).

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
