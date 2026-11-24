# Läget: film

Huvudagentens bana: vägen från bild till dealer, beställningen, efterarbetet, banken och handboken. Varje prov och dess
utfall står i handboken (`tools/film-prompting.md` §5), historien i Git.

**Läget.**
- En film beställs i Bordets guide Ny film (receptet i `data/order-methods.json` ger resten) eller med
  `node tools/order-new.ts paow "A2.3 - A3P4C2"`, som gör samma utkast. Huvudagenten godkänner
  (`tools/order-approve.ts`) och en beställare lägger kön (`tools/order-clerk.md`). Mall 12; given från A2.3 mall 14,
  giv och återgång mall 15.
- Metoden som håller (Jakob 2026-11-23): giv och återgång i EN film på Kling 4, 4 s, första bild A2.3, sista bild
  samma med kortet på platsen, dockans film med plan hand i 24 rutor/s som referensfilm. `node tools/order-bring.ts`
  delar den där handen börjar gå tillbaka och sparar given och returen i banken.
- Ett ankare heter alltid A och numret (A1, A2.3, A3P4C1), aldrig med en bokstav efter (Jakob 2026-11-21); id:nas
  bokstäver är arbetsnamn: Tatuerads A2.3 är `paow-ankare-2-3-d` (givarna börjar på `-c`); i Material gäller `-marke`.
- Trädet Tatuerad (`/studio/karta/?dealer=paow&trad=tatuerad`, 20/36) fylls från A2.3. I banken: giv och återgång till
  plats 1–6, kort 1 (mall 15; plats 1–5 Jakobs "Ja, alla håller", plats 6 "Bra"), dealerns första kort (A3DC1, godkänd
  åt honom), utgången A2.3 → A1 (godkänd åt honom), hålkortet upp (variant åt honom) och vilorna: `paow-vila-20-01` och tio ur
  Casinots (`paow-vila-tat-…`, hans ja; åtta spelas, `-09-02` och `-10-01` bara i labbet). Plats 7 är underkänd: händerna vänder inte kortet.
- Sista given går direkt till vila: `node tools/order-new.ts paow RETUR-1 P4.C1` gör en film på 3 s från givens
  sista ruta. I banken: plats 2–4 godkända åt honom, plats 1 och 5 varianter; plats 6 fick hans "Inte bra".
- A3-bilder: A3P4C1 och A3P4C2 är kandidater; för plats 1 och 2 stoppar landningsverktyget ([BRISTER](../BRISTER.md)).
- Fria givar (Kling 4, ingen dockfilm): takt och väg styrs inte; plats 4, Kortet i luften och plats 7 är varianter i
  banken. En annan stol: [FILMMODELLER](../FILMMODELLER.md), "Vinklar, 3D och Runways lista"; stol 1 fick "nästan".
- Tatuerads A2.1 (Jakobs ja i Beslut 2026-11-23) är `paow-nyp-tatuerad`, sista rutan i filmen från A1
  (`paow-ingang-2-1-tatuerad-01`, bara i labbet); kandidat i Material tills han godkänner där. Givarna från A2.1 görs om
  från det med dockans avlästa giv i hennes egen takt som referensfilm.
- Pengar: gränser, mandat och saldo i `data/order-policy.json`; giv med återgång 91, giv 3 s 68, retur 57, WAN 3 20 per s.

**Nästa steg.**
1. Dealerns hålkort (D.C2) från A2.3: två piloter utan dockans film (WAN 3 och Kling 4) väntar på granskning.
2. Första given från A2.1: utkastet `paow-giv-2-1-p4-17` (107, inte lagt; läs saldot), sedan övriga platser.
3. Plats 7: dockan ska hålla kortet genom vändningen ([LASMIG](../../dealer3d/LASMIG.md)); sedan dockans film,
   given igen och dess retur.
4. Mall 15: mer frihet åt filmen i vändningen.
5. Kortet bakom ryggen igen med en bild av ansiktet som referens (95). Kastet per stol: egen tagning, inte Aleph.
6. Det vita i skons fönster: [kort](kort.md), Nästa steg 3.
7. Fler vilor för Tatuerad: lokalt ur Casinots, och korta vilor ur en film (handboken §3.6, inom taket).
8. Vilan `paow-vila-28-01`: bordskanten är lagad med `plate` (`fixed-1.mp4` bredvid originalet, `-hel` i `.runtime/kant-27/`); granska oberoende, för in; originalet arkiverar Jakob.

**Väntar på Jakob.** I chatten: ansiktsbilden, felet i plats 6, och om Tatuerad ska byta till A2.3 med märke (gäller i
Material).

**Var saker ligger.** Vägen för en ny dealer i [tools/dealer-line.md](../../tools/dealer-line.md), handboken i
[tools/film-prompting.md](../../tools/film-prompting.md), granskningen i `tools/film-review.md`, läget per dealer med
`node tools/produce.ts paow`. Under `.runtime/`: `natt-1121/api/` (API-klienten, liggaren) och `kvall/` (kvällens skript).
På `D:/dealer-scratch/tmp/`: `yt-referens/` (går aldrig in i Git, `assets/` eller ett Prov) och `dealer-3d/ut/` (dockans filmer).

**Fällor.**
- Granska första och sista bilden led för led mot gällande ankare före filmen (`tools/film-review.md`, Metod): ett
  fel i ankaret syns aldrig som skillnad mellan film och bild, och den automatiska kontrollen ser inte en arm.
- Ett ankare görs som en riktig ruta ur en film från ankare 1, inte som ett montage ur bildmodellen. Dockan ska då ha
  rak bål: filmmodellen förstorar en lutning (3° i dockan blev 10° i första försöket till A2.3).
- Referensfilmen ska sluta som sista bilden, och blicken måste stå i texten eller bilderna: Kling tar handens och
  kortets rörelse ur den, inte huvudet. En riktig film som referensfilm bär med sig sina händer (storlek, inget bläck).
- En tagning utan sista bild kan sluta med ett klipp till en närbild: se på de tre sista rutorna.
- En dockfilm i dealerns takt (given klar på 1 s, sedan stilla) ger ett stopp och en vändning på två rutor: dra ut den.
- Den automatiska kontrollen (bara steg som börjar med `GIV-`) räknar kortets yta på mättat blått och ser inte ett
  tryckt kort: läs storleken som ett golv.
- Hans ord om filmerna: [BESKED](../BESKED.md), "Filmerna och given"; det som inte går än: [BRISTER](../BRISTER.md).
