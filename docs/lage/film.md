# Läget: film

Huvudagentens bana: vägen från bild till dealer, Beställ, efterarbetet, banken och handboken. Här står bara det som
gäller nu; varje prov och dess utfall står i handboken (`tools/film-prompting.md` §5) och det som hänt i Git.

**Läget.**
- Filmstandardens första del är inne (`553d254`): mall 10 skriver en öppen giv, den automatiska kontrollen
  (`src/deal-check.ts`) fäller det Jakob underkänner på synen, sista bilden i en giv bara dit är rutan där bankens
  godkända retur börjar (`src/cut-frame.ts`), och en renderad referensfilm (3D-banans docka) bjuds först.
- Metoden som håller är en giv bara dit på Kling 4 med första och sista bild och en referensfilm. Med dockans film
  håller plats 4 (4/5), plats 5 är oavgjord (3/5) och plats 3 föll (1/5); släpet från ankare 2.2 till plats 4 håller med
  Pamelas släp som referens. Prov `giv-forlagefilm-2`, oberoende granskat; inget är dömt av Jakob eller infört i banken.
- Den tatuerade uppsättningen är Jakobs förstahandsval: keystone sittande och stående och ankare 1 gäller (`f8e3f6c`,
  `b0a03f3`); ankare 2.1 finns inte med de händerna. Bankens filmer har otatuerade, större händer och spelas än.
- Ankare 2.2 föll i tre försök med utsnitt i bildmodellen (2/5; Prov `paow-ankare-2-2-blick`, kandidat A står kvar).
- Dockans filmer "-2" och "-3" har den äldre vändningen av kortet; "-4" (en enda vridning) gäller. C5 med "-4" gav
  den renaste vändningen hittills men kortet hoppar när det läggs (3/5): nästa förlaga ska sänka kortet jämnt ruta 60–80.
- Nya ankare tas ur en film som dockan styr. Ankare 2.3 (båda händerna vid skon, blicken ned mot kortet): MODEL:s
  tagning från ankare 1 är levererad (Prov `paow-ankare-2-3`, 85 krediter); posen har Jakobs Bra, efterarbetet görs om.
  MODEL mätte en riktig dealer: två händer, ett kort per 0,75–0,9 s, vändning i luften, kameran lägre än bankens.
- Läs saldot hos Runway (`whoami`) före en beställning; talet i `data/order-policy.json` är gammalt. Taket är 2 000.
  Trailern är pausad på Jakobs ord: inget beställs och inget byts i den förrän han säger till.

**Nästa steg.**
1. Starta vakten på Jakobs kö i Beställ (`vakta-kon.mjs`): den går i huvudagentens chatt i halvtimmar och dör med
   chatten. Godkänner han en beställning startar huvudagenten beställningsagenten (`tools/order-clerk.md`).
2. Ankare 2.3: när granskaren har godkänt det omgjorda efterarbetet kopieras ankaret in ur `ankare-2-3/lamna/` och
   rollen registreras. Sedan given därifrån ([BESKED](../BESKED.md), "Kortare givar"), i den riktiga dealerns takt
   (0,77 s per kort; `yt-referens/ut/giv-fran-2-3.md`): ett kort till plats 4 i en film på 3 s som klipps efteråt, och
   kort ett till alla platser i ett svep på 8 s. 3D gör dockfilmerna; beställs genom Bordet när `rak-linje` är inne.
3. Utfallet av proven från 2026-11-18 in i handboken: C5 (`giv-experiment-2/c5/`), stol 1 (`stol-1/`; kortet i Beslut
   tas ut när provet är visat) och Jakobs order `paow-giv-2-1-p4-16` (`bestall/`, Prov `bestallning-handbyte-p4-16`).
4. Filmstandardens andra del: grenen `rak-linje` (bär `film-standard-register`), efter listan i mappen `film-standard`.
5. Ankare 2.2 samma väg som 2.3 (3D-banans förlaga för släpet), sedan med tatuerade händer: ankare 2.1, ingången
   till 2.2, landningsbilder för plats 3–5 där handen slutar som dockans, och en tagning till på plats 3.
6. Senare, inget beställt: fler kort än två på en plats, split, dealerns tredje och fjärde kort, returer till vila,
   plats 6 utan omväg, byte vid skon (`plan-runda-via-2-2.md`) och hans önskemål ([BESKED](../BESKED.md)).

**Väntar på Jakob.** Inget utanför Beslut.

**Var saker ligger.** Vägen för en ny dealer i [tools/dealer-line.md](../../tools/dealer-line.md), handboken i
[tools/film-prompting.md](../../tools/film-prompting.md), granskningen i `tools/film-review.md`, metoden per steg i
`data/order-methods.json`, läget per dealer med `node tools/produce.ts paow`. Banans kod: `src/order-*.ts`,
`tools/order-*.ts`, `tools/film-after.ts`, `tools/still-after.ts`, `tools/python/`, `tools/register-order.ts`, `motions/`
och registren `data/media-roles.json`, `data/dealers.json` och `data/order-policy.json`. På slaskdisken, under
`D:/dealer-scratch/tmp/`: `film-standard/` (listan för andra delen, `referenskontroll.tsv`), `giv-experiment/` och
`giv-experiment-2/` (texter, rapport, `ledger.json`), `ankare-2-2-blick/`, `ankare-2-3/` och `yt-referens/` (MODEL; den
filmen går aldrig in i Git, `assets/` eller ett Prov), `huvudagent11/look/` (`vakta-kon.mjs`, `ko-nu.mjs`),
`huvudagent11/nya-filmer/plan-runda-via-2-2.md`, `giv-utredning/RAPPORT.md` och `pamela-formel/RAPPORT.md`. Trailern:
`dealer-1e/LASMIG-OVERLAMNING-2026-11-17.md`, `trailer-3b/`, `dealer-1e/intro/`, provet `trailer-noir-3`.

**Fällor.**
- Referensfilmen ska sluta som sista bilden (handens sida och fingrarna på kortet), annars hittar Kling på slutet.
- Blicken måste stå i ankaret och i sista bilden: Kling tar handens och kortets rörelse ur referensfilmen, inte huvudet.
- En referens väljs efter vad den visar, inte bara efter Jakobs dom, och mäts innan den används: Pamelas giv till
  plats 1 faller. Dockfilmer finns för plats 3–5; plats 6 och 7 går genom skon och plats 1 korsar kroppen.
- WAN 3 utan referensfilm, Kling 3.0 Motion Control och mall 7:s ord om mer rörelse faller (handboken §5). Jakobs
  utkast `paow-giv-2-1-p6-11` (oincheckat) är det äldre förvalet: säg det till honom före ett godkännande.
- Det nya ankarets handpunkter förs inte in i `data/dealer-standard.json`, som är bankens vilobild för alla dealers.
- Hans ord om filmerna: [BESKED](../BESKED.md), "Filmerna och given"; det som inte går än: [BRISTER](../BRISTER.md).
