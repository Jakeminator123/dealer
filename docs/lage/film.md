# Läget: film

Huvudagentens bana: vägen från bild till dealer, beställningen, efterarbetet, banken och handboken. Varje prov och dess
utfall står i handboken (`tools/film-prompting.md` §5), historien i Git.

**Läget.**
- En film beställs i Bordets guide Ny film (receptet i `data/order-methods.json`) eller med
  `node tools/order-new.ts paow "A2.3 - A3P4C2"`. Huvudagenten godkänner (`tools/order-approve.ts`), en beställare
  lägger kön (`tools/order-clerk.md`). Godkännandet släpper EN pilot av ett oprövat sätt och inget som föll; sätten,
  räknade ur Jakobs egna domar: `node tools/verdicts-per-method.ts`.
- Metoden som håller (Jakob 2026-11-23): giv och återgång i EN film på Kling 4, 4 s, första bild A2.3, sista bild
  samma med kortet på platsen, dockans film med plan hand i 24 rutor/s som referensfilm. `node tools/order-bring.ts`
  delar den där handen börjar gå tillbaka och sparar given och returen i banken.
- Ett ankare heter alltid A och numret (A1, A2.3, A3P4C1), aldrig med en bokstav efter (Jakob 2026-11-21); id:nas
  bokstäver är arbetsnamn: Tatuerads A2.3 är `paow-ankare-2-3-d` (givarna börjar på `-c`); i Material gäller `-marke`.
- Trädet Tatuerad (`/studio/karta/?dealer=paow&trad=tatuerad`, 22/36) är det spelet spelar och fylls från A2.3. I banken: giv och återgång till
  plats 1–6, kort 1 (mall 15; plats 1–5 Jakobs "Ja, alla håller", plats 6 "Bra"), dealerns kort (godkända åt honom):
  D.C1 stängt `paow-giv-2-3-d-03` (mall 16) och D.C2 öppet `paow-giv-2-3-d-c2-02`, utgången A2.3 → A1 och vilorna
  (`paow-vila-20-01`, `paow-vila-tat-…`). Plats 7 är underkänd: händerna vänder inte kortet.
- Sista given går direkt till vila (`order-new.ts paow RETUR-1 P4.C1`, 3 s): plats 2–4 godkända åt honom, 1 och 5
  varianter, plats 6 hans "Inte bra".
- A3-bilder görs inte: landningsbilderna är arkiverade (Jakob 2026-11-24).
- Fria givar (Kling 4, ingen dockfilm): takt och väg styrs inte; plats 4, Kortet i luften och plats 7 är varianter.
  Andra stolar: [FILMMODELLER](../FILMMODELLER.md), "Vinklar, 3D och Runways lista"; stol 1 och 5 godkända åt honom.
- Tatuerads A2.1 är `paow-nyp-tatuerad` (trädet Tatuerad nyp). Sex givar därifrån 2026-11-24 (816 krediter, avlästa
  dockfilmer): Jakob underkände plats 1, 2, 4, 5 och 7 ("MÅSTE FINNAS METODFEL"); plats 3 variant, returerna godkända.
- Pengar: gränser, mandat och saldo i `data/order-policy.json`; giv med återgång 91, giv 3 s 68, retur 57, WAN 3 20 per s.

**Nästa steg.**
1. Given från A2.1 igen, EN pilot som Jakob ser i spelstorlek före resten: först bara text och två bilder (som
   `paow-giv-2-1-p1-04`), sedan en byggd naturlig cykel som referensfilm; plats 1–3 med två händer som från A2.3.
2. Dockans handled vid vändningen från A2.1 (de avlästa cyklerna fick 1–2 av 5) och två kort i en film: verktygen
   har bara givsteg med ett kort ([LASMIG](../../dealer3d/LASMIG.md)).
3. Plats 7 från A2.3: dockan ska hålla kortet genom vändningen; sedan dockans film, given igen och dess retur.
4. Bryggorna för Tatuerad nyp: utgången A2.1 → A1 (ingången baklänges) och A2.1 ↔ A2.3 vid skon ([karta](karta.md)).
5. Filmen som vänder upp D.C1: utkastet `paow-halkort-06` (WAN 3, 100 krediter); först hans dom över `paow-halkort-05-01`.
6. Skons fönster: [kort](kort.md), Nästa steg 3. Fler vilor (handboken §3.6). Mall 15: friare vändning.
7. Vilan `paow-vila-28-01-fix-1` är införd (godkänd åt honom); originalet arkiverar Jakob.

**Väntar på Jakob.** Hans dom på `paow-giv-2-3-d-03-01` (mall 16), piloten med märken (Prov `vinkelprov-p4c2-20261124`,
film 13–15) och stolsserien (Prov `stolsserien-p4c2-20261124`; stol 6:s pilot). I chatten: Tatuerads A2.3 med märke?
Stol 2: nytt ankare ur filmens första ruta eller ny dockfilm? Noirfilmen med heltatuerad trappa: hans "inte bra" 2026-11-24.

**Var saker ligger.** Vägen för en ny dealer i [tools/dealer-line.md](../../tools/dealer-line.md), handboken i
[tools/film-prompting.md](../../tools/film-prompting.md), granskningen i `tools/film-review.md`, läget per dealer med
`node tools/produce.ts paow`. API-klienten är `tools/runway-api.ts`, liggaren `.runtime/runway-api/ledger.json`.
På `D:/dealer-scratch/tmp/`: `yt-referens/` (går aldrig in i Git, `assets/` eller ett Prov) och `dealer-3d/ut/` (dockans filmer).

**Fällor.**
- Granska första och sista bilden led för led mot gällande ankare före filmen (`tools/film-review.md`, Metod): ett
  fel i ankaret syns aldrig som skillnad mellan film och bild, och den automatiska kontrollen ser inte en arm.
- Ett ankare görs som en riktig ruta ur en film från ankare 1, inte som ett montage ur bildmodellen. Dockan ska då ha
  rak bål: filmmodellen förstorar en lutning (3° i dockan blev 10° i första försöket till A2.3).
- Referensfilmen ska sluta som sista bilden, och blicken måste stå i texten eller bilderna: Kling tar handens och
  kortets rörelse ur den, inte huvudet. En riktig film som referensfilm bär med sig sina händer (storlek, inget bläck).
- En AVLÄST dockfilm med "with the same timing" styr koreografin: säger texten något annat följer Kling dockan (högt
  lyft, häng, skjuts) och kortet byter färg. Se dockfilmen som kontaktark först; en byggd cykel som "rough guide" höll.
- Den automatiska kontrollen (bara steg som börjar med `GIV-`) räknar kortets yta på mättat blått och ser inte ett
  tryckt kort: läs storleken som ett golv.
- Hans ord om filmerna: [BESKED](../BESKED.md), "Filmerna och given"; det som inte går än: [BRISTER](../BRISTER.md).
