# Läget: film

Huvudagentens bana: vägen från bild till dealer, Kortplan och Kön, efterarbetet, banken och handboken. Här står bara det
som gäller nu; varje prov och dess utfall står i handboken (`tools/film-prompting.md` §5) och det som hänt i Git.

**Läget.**
- En film beställs i Bordets Kortplan (plats och kort, hur kortet kommer dit; receptet i `data/order-methods.json` ger
  resten) eller med kommandot `node tools/order-new.ts paow "A2.3 - A3P4C2"`, som gör samma utkast. Huvudagenten
  godkänner (`tools/order-approve.ts`) och en beställare lägger kön (`tools/order-clerk.md`). Texterna är mall 12;
  given från A2.3 mall 14, giv och återgång mall 15.
- Metoden som håller (Jakob 2026-11-23): giv och återgång i EN film på Kling 4, 4 s, första bild A2.3, sista bild
  samma med kortet på platsen, dockans film med plan hand i 24 rutor/s som referensfilm. `node tools/order-bring.ts`
  delar den där handen börjar gå tillbaka och sparar given och returen i banken.
- Ett ankare heter alltid A och numret (A1, A2.3, A3P4C1), aldrig med en bokstav efter (Jakob 2026-11-21); bokstäverna
  i id:n är arbetsnamn: A2.3 är `paow-ankare-2-3-d` (blicken på kortet; givarna hittills börjar på `-c`), A2.2 `paow-ankare-2-2-blick-a`.
- Trädet Tatuerad (vyn Karta, `/studio/karta/?dealer=paow&trad=tatuerad`) fylls från A2.3. I banken: giv och återgång
  till plats 1–5, kort 1 (mall 15, Jakobs "Ja, alla håller"; granskaren: plats 4 och 5 4/5, plats 1 och 2 3/5),
  och sedan förut given till A3P4C1 (piloten, Jakobs ja), A3P4C2 (kort i Beslut), A3P1C1, A3P2C1 och A3P3C1 bara dit.
- A3-bilder: A3P4C1 och A3P4C2 är kandidater (A3P4C2 ur ruta 68, oberoende 4/5). För plats 1 och 2 stoppar
  landningsverktyget, och rosen på högra handryggen är en mandala i A3P4C1 ([BRISTER](../BRISTER.md)).
- En retur beställs inte för sig: den klipps ur filmen med giv och återgång. `paow-giv-2-3-p5-04-01` ligger i banken
  som 1764 × 1172 (originalet, inte den efterarbetade).
- P4.C2 Cykel01 är vald framför Cykel02. En sidovinkel görs av en färdig film i Runways videoredigerare (Prov `sidovinkel-ur-film`).
- Pengar: gränser, mandat och senast lästa saldo står i `data/order-policy.json`. En giv med återgång på 4 s med
  referensfilm kostar 91 krediter, en giv på 3 s 68; beställningen går genom API-nyckeln (Runway-MCP är inte inloggat).

**Nästa steg.**
1. Plats 6 och 7 (kort 1) ur Jakobs sparade standarder i Docklabbet, sedan kort 2; plats 1 och 2 görs om om han
   säger det i Beslut (handen nyper kortets kant). Dockans förval och ingångar: [LASMIG](../../dealer3d/LASMIG.md).
2. En knapp i Scen & bord, Docka, som gör dockans film ur den sparade rörelsen och ett orderutkast; i dag kommandon
   (`dealer3d/tools/docka-cykel.ts`, `tools/doll-reference-put.ts`).
3. Spelet väljer träd: det läser inga i dag (`buildGraph` blandar alla filmer), så Tatuerad spelas inte än. Ingången
   A1 → A2.3 klipps ur ankarets film; sedan A2.3 → A1, hålkortet och dealerns kort.

**Väntar på Jakob.** Kort i Beslut: given till A3P4C2 och dockan med Paows
mått. Frågor i chatten 2026-11-21: egen film för kort 2 (36 steg) eller kort 1:s (22), om tatuerade A2.2 är blickbilden
eller en ny nypbild, och hur spelet väljer träd.

**Var saker ligger.** Vägen för en ny dealer i [tools/dealer-line.md](../../tools/dealer-line.md), handboken i
[tools/film-prompting.md](../../tools/film-prompting.md), granskningen i `tools/film-review.md`, läget per dealer med
`node tools/produce.ts paow`. Banans kod: `src/order-*.ts`, `tools/order-*.ts`, `tools/film-after.ts`,
`tools/still-after.ts`, `tools/python/`, `tools/register-order.ts`, `motions/` och registren `data/order-methods.json`,
`data/media-roles.json`, `data/cut-frames.json` och `data/order-policy.json`. Arbetsfiler under `.runtime/`:
`natt-1121/api/` (API-klienten och nattens liggare) och `pilot-c/` (piloternas skript). På slaskdisken, under `D:/dealer-scratch/tmp/`:
`yt-referens/` (den filmen går aldrig in i Git, `assets/` eller ett Prov) och `dealer-3d/ut/` (dockans filmer).

**Fällor.**
- Granska första och sista bilden led för led mot gällande ankare före filmen (`tools/film-review.md`, Metod): ett
  fel i ankaret syns aldrig som skillnad mellan film och bild, och den automatiska kontrollen ser inte en arm.
- Ett ankare görs som en riktig ruta ur en film från ankare 1, inte som ett montage ur bildmodellen. Dockan ska då ha
  rak bål: filmmodellen förstorar en lutning (3° i dockan blev 10° i första försöket till A2.3).
- Referensfilmen ska sluta som sista bilden, och blicken måste stå i texten eller bilderna: Kling tar handens och
  kortets rörelse ur referensfilmen, inte huvudet.
- Se på de tre sista rutorna: en tagning utan sista bild kan sluta med ett klipp till en närbild (A3P4C2 kortades tre
  rutor), och kortet kan hamna fel fast dockan landar rätt (A3P5C1).
- En dockfilm i den riktiga dealerns takt (given klar på 1 s, sedan stilla) ger ett stopp med kortet rest och en
  vändning på två rutor; dra ut given och låt kortet aldrig stå stilla.
- Den automatiska kontrollen skrivs bara när orderns steg börjar med `GIV-`, räknar kortets yta på mättat blått och
  ser inte ett tryckt kort eller ett målat bord: läs storleken som ett golv.
- Hans ord om filmerna: [BESKED](../BESKED.md), "Filmerna och given"; det som inte går än: [BRISTER](../BRISTER.md).
