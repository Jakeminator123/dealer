# Läget: film

Huvudagentens bana: vägen från bild till dealer, Kortplan och Kön, efterarbetet, banken och handboken. Här står bara det
som gäller nu; varje prov och dess utfall står i handboken (`tools/film-prompting.md` §5) och historien i Git.

**Läget.**
- En film beställs i Bordets Kortplan (plats och kort, hur kortet kommer dit; receptet i `data/order-methods.json` ger
  resten) eller med kommandot `node tools/order-new.ts paow "A2.3 - A3P4C2"`, som gör samma utkast. Huvudagenten
  godkänner (`tools/order-approve.ts`) och en beställare lägger kön (`tools/order-clerk.md`). Texterna är mall 12;
  given från A2.3 mall 14, giv och återgång mall 15.
- Metoden som håller (Jakob 2026-11-23): giv och återgång i EN film på Kling 4, 4 s, första bild A2.3, sista bild
  samma med kortet på platsen, dockans film med plan hand i 24 rutor/s som referensfilm. `node tools/order-bring.ts`
  delar den där handen börjar gå tillbaka och sparar given och returen i banken.
- Ett ankare heter alltid A och numret (A1, A2.3, A3P4C1), aldrig med en bokstav efter (Jakob 2026-11-21); bokstäverna
  i id:n är arbetsnamn: A2.3 är `paow-ankare-2-3-d` (blicken på kortet; givarna hittills börjar på `-c`); A2.2 är arkiverad.
- Trädet Tatuerad (`/studio/karta/?dealer=paow&trad=tatuerad`) fylls från A2.3. I banken: giv och återgång till plats
  1–6, kort 1 (mall 15; plats 1–5 Jakobs "Ja, alla håller", plats 6 "Bra"), dealerns första kort (A3DC1, godkänd åt
  honom), utgången A2.3 → A1 (godkänd åt honom) och hålkortet upp (variant åt honom: vänds över kortsidan), de två
  sista i WAN 3. Plats 7 är underkänd: händerna vänder inte kortet.
- Sista given går direkt till vila: `node tools/order-new.ts paow RETUR-1 P4.C1` gör en film på 3 s som
  fortsätter givens sista ruta. I banken: plats 2, 3 och 4 godkända åt honom, plats 1 (visar
  handflatorna) och 5 (sveper över filten) som varianter; plats 6 fick hans "Inte bra". Receptet bär meningen om den korta vägen.
- A3-bilder: A3P4C1 och A3P4C2 är kandidater; för plats 1 och 2 stoppar landningsverktyget ([BRISTER](../BRISTER.md)).
- Fria givar (Kling 4, ingen dockfilm): takt och väg styrs inte. I banken som varianter på hans ord: plats 4, Kortet i
  luften och plats 7 (`tools/order-import.ts`, delade med `--split`).
- En annan stol: receptet i [FILMMODELLER](../FILMMODELLER.md), "Vinklar, 3D och Runways lista"; stol 1 fick "nästan".
- Pengar: gränser, mandat och saldo i `data/order-policy.json`. Giv med återgång 91 krediter, giv på 3 s 68, retur till
  vila 57, WAN 3 20 per s, genom API-nyckeln.

**Nästa steg.**
1. Plats 7: dockan ska hålla kortet genom vändningen ([LASMIG](../../dealer3d/LASMIG.md)); sedan dockans film,
   given igen och dess retur. Kort 2–7 återbrukar platsens film (BESKED, "Hela trädet från A2.3").
2. Mall 15: mer frihet åt filmen i vändningen; landningens mening skrivs redan i texten.
3. Kortet bakom ryggen igen med en bild av ansiktet som referens (95). Kastet per stol: egen tagning, inte Aleph.
4. Det vita i skons fönster (BESKED, "Ingen vit kant"): provfilmen `paow-giv-2-3-p4-03` är i banken som variant. Det
   vita är borta, men krysset blir en röd prick; ankare och filmer byts när märket håller.
5. Dealerns kort: D.C2 och vilan är inte beställda för Tatuerad; kompositionen lånar dem av Casino ([karta](karta.md)).

**Väntar på Jakob.** I chatten: ansiktsbilden och felet i plats 6. Tatueringar i Casinots filmer fick hans nej
i Beslut 2026-11-23 ([FILMMODELLER](../FILMMODELLER.md), "Tatueringar i färdiga filmer").

**Var saker ligger.** Vägen för en ny dealer i [tools/dealer-line.md](../../tools/dealer-line.md), handboken i
[tools/film-prompting.md](../../tools/film-prompting.md), granskningen i `tools/film-review.md`, läget per dealer med
`node tools/produce.ts paow`. Arbetsfiler under `.runtime/`: `natt-1121/api/` (API-klienten och dess liggare) och
`pilot-c/` (piloternas skript). På slaskdisken, under `D:/dealer-scratch/tmp/`:
`yt-referens/` (den filmen går aldrig in i Git, `assets/` eller ett Prov) och `dealer-3d/ut/` (dockans filmer).

**Fällor.**
- Granska första och sista bilden led för led mot gällande ankare före filmen (`tools/film-review.md`, Metod): ett
  fel i ankaret syns aldrig som skillnad mellan film och bild, och den automatiska kontrollen ser inte en arm.
- Ett ankare görs som en riktig ruta ur en film från ankare 1, inte som ett montage ur bildmodellen. Dockan ska då ha
  rak bål: filmmodellen förstorar en lutning (3° i dockan blev 10° i första försöket till A2.3).
- Referensfilmen ska sluta som sista bilden, och blicken måste stå i texten eller bilderna: Kling tar handens och
  kortets rörelse ur referensfilmen, inte huvudet.
- En tagning utan sista bild kan sluta med ett klipp till en närbild: se på de tre sista rutorna.
- En dockfilm i den riktiga dealerns takt (given klar på 1 s, sedan stilla) ger ett stopp med kortet rest och en
  vändning på två rutor; dra ut given och låt kortet aldrig stå stilla.
- Den automatiska kontrollen skrivs bara när orderns steg börjar med `GIV-`, räknar kortets yta på mättat blått och
  ser inte ett tryckt kort eller ett målat bord: läs storleken som ett golv.
- Hans ord om filmerna: [BESKED](../BESKED.md), "Filmerna och given"; det som inte går än: [BRISTER](../BRISTER.md).
