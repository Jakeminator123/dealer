# Läget: film

Huvudagentens bana: vägen från bild till dealer, Beställ, efterarbetet, banken och handboken. Här står bara det som
gäller nu; varje prov och dess utfall står i handboken (`tools/film-prompting.md` §5) och det som hänt i Git.

**Läget.**
- En film beställs längs en rak linje (`babd05d`): i Bordets Beställ väljs steget och kortets plats, och receptet i
  `data/order-methods.json` ger resten (en giv: Kling 4, 3 s, bara dit, första och sista bild, referensfilm). Utan
  undantag går 8 av 61 kombinationer att beställa; de andra säger varför (slutbild saknas, eller dockans film).
- Metoden som håller: en giv bara dit på Kling 4 med första och sista bild och 3D-banans dockfilm som referensfilm, i
  UTDRAGEN takt (given över drygt 2 s, en obruten rörelse). I den riktiga dealerns takt tappar Kling vändningen.
- Ankare 2.3 (båda händerna vid skon, blicken ned) gäller på Jakobs ja. Stegen `INGANG-2.3` och `GIV-2.3` finns men
  går att beställa först när dockans filmer står i `data/rendered-references.json`.
- Given från 2.3 till P5.C1, Jakobs beställning: fyra tagningar i Prov `giv-fran-2-3-p5` (256 krediter). Tagning 4
  (dockan "-d") går igenom den automatiska kontrollen och är enligt granskaren bäst (3/5; mitten är trög, och det
  gula kortet har en vit kant ruta 22–30). Sidan av tagning 3 ligger i samma prov.
  Ingångsfilmen vila → 2.3 ligger i Prov `paow-ankare-2-3` i tre farter. Inget av det är infört i banken.
- En sidovinkel görs av en färdig film i Runways videoredigerare (`edit_video`), inte av nya stillbilder: plats 4
  cirka 40° (Prov `sidovinkel-ur-film`, Jakob: "mycket bra") och plats 5 cirka 25–30°. Vinkeln och kortets plats
  träffas inte exakt. Provsidan `/vinklar.html` binder ihop två vinklar i en scen.
- Den tatuerade uppsättningen är förstahandsvalet (keystone, ankare 1 och 2.3); ankare 2.1 och 2.2 och hela banken
  har de äldre händerna och spelas än. Ankare 2.2 föll i tre försök i bildmodellen och görs om som 2.3.
- Saldot var 5 392 den 2026-11-18 (`whoami` före en beställning); taket är 2 000 per order. Trailern är pausad.

**Nästa steg.**
1. Starta vakten på Jakobs kö i Beställ (`vakta-kon.mjs`; den dör med chatten), och anslut Runway (`/mcp`) på ett
   nytt konto. Godkänner han en order startas beställningsagenten (`tools/order-clerk.md`).
2. Läs hans svar i Beslut: farten på ingångsfilmen (han valde 1,5 gånger av misstag: fråga) och tagningen till plats
   5. För sedan in ingångsfilmen och den valda tagningen i banken som kandidater (`tools/register-order.ts`).
3. Gör stegen från 2.3 beställbara: dockans filmer till `assets/references/docka/<id>/source.mp4` och in i
   `data/rendered-references.json` (id-mönstret står i `dealer3d/LASMIG.md`).
4. En tagning per återstående plats (1, 2, 3, 4, 6, 7 och dealerns kort) på en långsam dockfilm, 64 krediter per
   tagning; en oberoende granskare bara när den automatiska kontrollen släpper igenom tagningen.
5. Raka linjens rester ([BRISTER](../BRISTER.md)): `tools/produce.ts` läser inte `data/cut-frames.json`.
6. Fem kameravinklar är hans mål ([BESKED](../BESKED.md), "Flera kameravinklar"): hans egen bild 35° från sidan som
   styrande stillbild, och en kamera per film i `/vinklar.html` (sidofilmens kamera står lägre än bankens).
7. Senare: ankare 2.1 och 2.2 med tatuerade händer, hålkortet (vänds inte) och andra kortet ovanpå det första
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
