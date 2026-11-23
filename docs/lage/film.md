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
  1–6, kort 1 (mall 15; plats 1–5 Jakobs "Ja, alla håller", plats 6 "Bra"). Plats 7 är
  underkänd: kortet vänds inte av händerna (BESKED, "Kortet vänds av hennes händer").
- Sista given går direkt till vila: `node tools/order-new.ts paow RETUR-1 P4.C1` gör en film på 3 s som
  fortsätter givens sista ruta. I banken: plats 2, 3 och 4 godkända åt honom, plats 1 (visar
  handflatorna) och 5 (sveper över filten) som varianter; plats 6 fick hans "Inte bra". Receptet bär meningen om den korta vägen.
  `--extra` ersätter receptets tillägg, `--extra-efter` lägger till.
- A3-bilder: A3P4C1 och A3P4C2 är kandidater; för plats 1 och 2 stoppar landningsverktyget ([BRISTER](../BRISTER.md)).
- Fria givar (Kling 4, bankens första och sista bild, ingen dockfilm): kortet vänds i fingrarna, men takt och väg styrs
  inte. Hans ja som varianter: plats 4, Kortet i luften och plats 7 (Prov `fria-givar-20261123`); i Kortet bakom
  ryggen är ansiktet inte hennes.
- En annan stol: 3D-scenen ritar dockan från stolens öga; receptet i [FILMMODELLER](../FILMMODELLER.md), "Vinklar, 3D och Runways lista". Stol 1 fick "nästan": kortet byter sida utan skäl.
- Pengar: gränser, mandat och saldo i `data/order-policy.json`. Giv med återgång 91 krediter, giv på 3 s 68, retur till
  vila 57, genom API-nyckeln.

**Nästa steg.**
1. Plats 7: dockan ska hålla kortet genom vändningen ([LASMIG](../../dealer3d/LASMIG.md)); sedan dockans film,
   given igen och dess retur. Därefter kort 2.
2. Mall 15: mer frihet åt filmen i vändningen; landningens mening skrivs redan i texten.
3. De tre fria givarna in i banken som varianter: leveranserna och vägen står i `LASMIG.txt` under
   `assets/proofs/fria-givar-20261123/leveranser/`. Kortet bakom ryggen igen med en bild av ansiktet som referens (95). Kastet per stol: en egen tagning ur stolens bilder, inte Aleph.
4. Karta, trädens mått (returerna räknas inte) och hur spelet väljer träd är Kartabanans ([karta](karta.md));
   ingången A1 → A2.3 klipps ur ankarets film; hålkortet och dealerns kort.

**Väntar på Jakob.** Frågor i chatten: nytt mandat, en bättre bild av hennes ansikte, vad som felar i plats 6 och egen film för kort 2.

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
