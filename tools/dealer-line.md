# Löpande bandet: från en bild till en färdig dealer

Den enda vägen för att göra nästa dealer, för en människa eller en agent, läst uppifrån och ned. Först vägen i
femton rader, sedan stationerna med vad som går in och ut, var det ligger, vem som beslutar och vad det kostar, sedan
det bandet inte kan än, reglerna som kostar pengar när de bryts, och sist alla format och namn med sina källor.

Detaljerna står där de hör hemma och kopieras inte hit:

- [handboken](film-prompting.md): hur en beställning komponeras, och vad som har hållit och fallit;
- [beställningsagentens instruktion](order-clerk.md): hur en godkänd order läggs, hämtas, efterarbetas och mäts (§1–10);
- [granskningen](film-review.md): hur en film granskas innan Jakob dömer;
- `data/dealer-standard.json`: standarden varje ankare följer;
- `data/order-methods.json`: metoden som beställs per steg;
- `HANDOFF.md`: läget nu och vem som äger vad.

Skriven 2026-11-13 ur kod, register och kvitton. (V) = läst i kod, data eller kvitto; (S) = skattat.

## Den enda vägen, kort

1. Lägg in dealern: en post i `data/dealers.json` och en dealer i `data/media-roles.json` (huvudagenten).
2. Ingångsbild: studions Material, Lägg till bild, roll `ingangsbild`; Jakob väljer.
3. Keystone stående och sittande: Nano Banana Pro 4K med ingångsbilden; Material, roll `keystone`; Jakob sätter `gäller`.
4. Ankare 1: redigering med `tools/texts/ankare-1.txt`, efterarbete enligt `tools/order-clerk.md` §5; Jakob `gäller`.
5. Ankare 2.1: Beställ, steg `ANKARE-2.1`, samma efterarbete; Material, Jakob sätter `gäller`.
6. Se vad som saknas för en runda: `node tools/produce.ts <dealer>`, eller blocket "Det här saknas för en runda" i Beställ.
7. Välj metoden efter Jakobs egna domar: `node tools/verdicts-per-method.ts <dealer>`; skriv den i `data/order-methods.json`.
8. Gör utkasten: `node tools/produce.ts <dealer> --draft` (ett prov: `--draft --trial <steg|plats>`), eller i Beställ.
9. Godkänn: Jakobs klick i Beställ, eller `node tools/order-approve.ts <id> --mandate "…"` inom `data/order-policy.json`.
10. Lägg och hämta: en beställningsagent enligt `tools/order-clerk.md` (`tools/order-put.ts`, `tools/order-collect.ts`).
11. Efterarbeta: `node tools/film-after.ts <id> <n>`; en stillbild med `tools/still-after.ts` och `tools/python/`.
12. Granska: en oberoende granskare enligt `tools/film-review.md`; domen in med `node tools/order-put.ts review`.
13. In i banken och Material: `node tools/order-bring.ts <id> <n> [--split <ruta>]`; kortspåret med `node tools/track-card.ts`.
14. Jakob dömer i Granska; har han lämnat över domen för vissa filmer: `node tools/review-put.ts` (preliminär dom).
15. Spela en runda: `game.html?dealer=<id>` eller studions Casino; börja om från rad 6 tills listan säger att rundan är klar.

## Vem beslutar

- **Jakob:** klick och domar i studion. I Material väljer han vilken bild som `gäller`; i Granska dömer han en film
  (Primär, Godkänd, Variant, Underkänd). Han kan också godkänna en order själv.
- **Huvudagenten:** godkänner beställningar på hans uppdrag (`approval.by: "huvudagent"` med uppdraget citerat) inom
  `data/order-policy.json`, för in i banken, och sätter en preliminär dom bara när han har lämnat över domen.
- **Beställningsagenten:** lägger exakt det som är godkänt och hämtar det.
- **Granskaren:** en underagent som inte beställde filmen. Föreslår; beslutar bara preliminärt, med huvudagenten och på
  Jakobs uttryckliga ord.

Metoden väljs efter Jakobs domar, inte efter granskarens poäng: de skilde sig på ungefär en tredjedel av tagningarna
2026-11-13 (`tools/verdicts-per-method.ts`, handboken §5).

## Stationerna

**1. Dealern i registren.** En post i `data/dealers.json` (`id`, `name`, `look`, `films.prefix` = `<id>-`) och en
dealer i `data/media-roles.json`. Utan posten vägrar Beställ ("finns inte i data/dealers.json", `tools/order-store.ts`),
och studions dealerväxel visar henne inte (V). Huvudagenten på Jakobs ord; kostar inget.

**2. Ingångsbild.** Vilken bild som helst av personen (Jakob 2026-11-12). Material, Lägg till bild, roll
`ingangsbild`: `assets/keystones/<dealer>-<namn>/ingangsbild.png|jpg` med `receipt.json`, som `kandidat` (`uploadTarget`
i `studio/lib/media.ts`, `add` i `tools/media-roles.ts`) (V). PNG eller JPEG, högst 40 MB. Jakob väljer.

**3. Keystone, stående och sittande.** Förlagor i hög upplösning på vitt; spelas aldrig. Beställ har inget steg för
dem (`STEPS` i `src/order-model.ts`) (V). Paows gjordes med Nano Banana Pro 4K, ingångsbilden som `@woman` och ett
ankare som pose (`D:/dealer-scratch/tmp/paow/order/order-b18.json`, texterna `p-b18-*.txt`), och blev 3584 × 4800 och
4800 × 3584 (V). Material, roll `keystone`, `assets/keystones/<dealer>-<namn>/keystone.png`. Likhet:
`tools/python/identitet.py` och oberoende granskning i full upplösning. Jakob sätter `gäller`. 40 krediter per 4K-bild
(`data/order-policy.json`).

**4. Ankare 1 (vila, nod `IDLE`).** En redigering, inte en ny person i en annans ruta: b23 (ny person i bankrutan) gav
vaxig hud och kroppen 58 rader för kort, b24 (redigering) höll (`D:/dealer-scratch/tmp/paow/order/order-b24.json`) (V).
Nano Banana Pro 4K 4:3 med `@anchor` = ett ankare 1 i bankens ruta (sko, grönt, pose) och `@woman` = dealerns bild;
texten är `tools/texts/ankare-1.txt`, den som gjorde Paows ankare 1. För en tredje dealer är `@anchor` ett ankare 1
som gäller, till exempel `paow-vila-ung-2` (S). Inget steg i Beställ: ordern skrivs för hand och läggs genom Runways
verktyg (V). Efterarbete: [order-clerk.md §5](order-clerk.md), stillbild. Oberoende granskning, Material (`ankare-1`,
`assets/anchors/<dealer>-<namn>/anchor.png`), Jakob sätter `gäller`. 40 per bild, två bilder.

**5. Ankare 2.1 (nyp, `READY`).** Beställ, steg `ANKARE-2.1`: Nano Banana Pro 4K 4:3, `@anchor` = ankare 1 som
gäller, `@pose` = en annan dealers utklippta underarm och hand (ruta 16 ur `pamela-p4-c1-plan-deal-02`) (V). Två
tagningar, 80 krediter. Sedan station 9–12; stillbilden blir `kandidat` i Material och Jakob sätter `gäller`. Paow: höll
i första ordern (4/5, Jakob godkände). Ankare 2.2 (släp) är inte på vägen: se "Vad bandet inte kan än".

**6. Landningsbild per plats (nod `LAND(<plats>)`).** Handen vid kortet på planens plats. Krävs bara för en retur som
egen film och för en giv "bara dit": roll `landning`, nod `LAND(<plats>)`, `card`, `gäller` (`landingOf` i
`src/order-model.ts`) (V). Inget steg i Beställ; i dag en ruta ur en giv, vald i Material. Tur och retur behöver den
inte.

**7. Vad saknas, och med vilken metod.** `node tools/produce.ts <dealer>` (eller Beställs block "Det här saknas för en
runda") räknar de 33 filmerna med samma funktioner som Karta och ger varje steg ett läge i Jakobs ord: klar, levererad
och väntar på hans dom, godkänd åt honom, beställd, utkast, kommer med given, kan beställas nu, kan provas, väntar på
en bild, ingen metod än, inte byggd (V). Metoden per steg och platsklass (mitten P3–P5, ytter P1, P2, P6, P7, dealerns
kort) står i `data/order-methods.json` med status `gäller`, `prov` eller `saknas` och belägg (V). Välj och ändra en
metod efter Jakobs domar: `node tools/verdicts-per-method.ts <dealer>` räknar dem per modell, vändning, referensfilm och
mall (V).

**8. Komponera i Beställ** (`/studio/bestall/`). Stegen: `INGANG-2.1`, `INGANG-2.2`, `GIV-2.1`, `GIV-2.2` (tur och
retur eller bara dit; `GIV-2.1` också till hålkortet `D.C2`, som landar stängt), `RETUR-2.1`, `RETUR-2.2`, `RETUR-1`,
`UTGANG` (`READY>IDLE`), `HALKORT` (`IDLE>REVEAL(D.C2)`) och `VILA` (`STEPS`, `SEAT_TARGETS`) (V).
`node tools/produce.ts <dealer> --draft` gör utkast där metoden gäller, `--draft --trial <steg|plats>` ett provutkast;
den godkänner aldrig (V). Utkastet blir `data/orders/<id>.json` med bilderna i `assets/orders/<id>/`. Texten skrivs av
`promptFor` (`src/order-prompts.ts`), aldrig för hand. Mall 8 (`TEMPLATE_VERSION`, orden i `SAY`) (V):

- en giv slutar åter på "The other hand rests on the felt.": mall 7:s mening om att hon rör sig medan hon delar ut gav
  rörelse men förstörde kortet i 15 av 18 tagningar (`c81c548`); hur hon rör sig är en öppen fråga (handboken §5);
- efter ett handbyte går den arm som är ute tillbaka och handen som gav kortet går till skon (`SAY.backPass`);
- en stängd giv från nypet läggs plant framför skon och skjuts till platsen (`SAY.layAndSlide`);
- kortets sidor heter "its back is yellow and its face is blue" (`SAY.colours`); mall 6:s ord efter färg förlorade båda
  paren i omgång 6 och gäller bara ordrar med version 6;
- hålkortets vändning (`HALKORT`) har bara hålkortet ritat på sina bilder.

En order lagrad med en äldre version återges med sina egna ord. Hur texten och bilderna väljs: handboken §2–3.

**9. Godkänn.** Jakobs "Godkänn och lägg i kön" i Beställ, eller `node tools/order-approve.ts <id> --mandate "<vems ord
och när>"`. Prövas mot `data/order-policy.json`: 400 krediter per order, golvet på saldot och dagstaket. Båda sätts av
Jakobs ord för dagen och står med hans ord i HANDOFF ("Jakobs besked som gäller", Budgeten): sedan 2026-11-13
kl. 15:13 gäller "obegränsat", så taket och golvet stoppar inget (V). Hashen fryses i `approval.orderSha256`, och en godkänd order ändras aldrig (V).

**10. Lägg och hämta.** Beställningsagenten enligt [order-clerk.md §1–4](order-clerk.md):
`node tools/order-put.ts check|begin|placed|failed|status`, uppladdning med `init_upload` och `complete_upload`,
`node tools/order-collect.ts <id> <n> --url '<adress>'`. Ut: `take-<n>/source.mp4|png` (originalet, ändras aldrig),
`fetched.json` och kvittot `receipt.json`, som bara `order-put.ts` skriver (V).

**11. Efterarbeta och mät.** [order-clerk.md §5 och §7](order-clerk.md). Film: `node tools/film-after.ts <id> <n>`
väljer efter modellen och skriver `take-<n>/after.mp4` och `after.json` med måtten; en leverans i annan form än första
bilden vägras (V). Stillbild: `tools/python/grundbild-21.py` passar in, `node tools/still-after.ts <id> <n> --fitted …`
ger `ren.png`, `tools/python/skolagning-21.py` lägger tillbaka skon och `--shoe …` ger `after.png` (V). Python behövs
där MediaPipe behövs: passningen, skolagningen och händer och kropp per ruta (`tools/python/filmmatt.py`); miljön står i
`tools/python/README.md` (V). Måtten sammanfattas i kvittots MÄTT-not.

**12. Granska och laga.** En oberoende granskare enligt [film-review.md](film-review.md). Domen förs in med
`node tools/order-put.ts review <id> <n> --note "…"` var tagningen än står (från HÄMTAD), med poängen skriven "given 3/5,
returen 1/5" så att Protokoll läser den (`reviewerNote`, `scoresOf` i `studio/lib/ledger.ts`) (V). Lagbara fel:
`node tools/film-fix.ts <film> <fixes.json>` skriver `fixed-<k>.mp4` bredvid originalet, som granskas på nytt
([order-clerk.md §6](order-clerk.md)).

**13. In i banken eller Material.** `node tools/order-bring.ts <id> <n> [--split <ruta>] [--prov <prov-id>] [--inford]
[--dry]` tar `after.mp4` eller `after.png` när de finns (V). En film går genom `tools/register-order.ts` till
`assets/motions/<klipp>/source.mp4` med `generation.json`, `motions/<klipp>.json` med `review.inbox: true` och en härledd
tagning i `data/clip-jobs.json`, och en kopia blir `kandidat` i Material (`assets/films/<dealer>/<namn>/`). Tur och retur
delas vid granskarens delningsruta. En stillbild blir `kandidat` i Material under den roll ordern gör. Status INFÖRD
sätts när granskarens dom finns på tagningen (eller med `--inford`) (V). Kortspåret per tagning:
`node tools/track-card.ts <klipp>` skriver `assets/tracking/<klipp>/card-track.json` (V). Skrivs 2026-11-13:
`register-order.ts` skriver i posten vilken hand som tar kortet och vilken som lägger det (`motion.takeHand`,
`motion.releaseHand`), så att rundan väljer en retur som kommer tillbaka med den hand som är ute (`src/clip-graph.ts`).

**14. Jakobs dom.** Granska (`/studio/granska/?dealer=<id>`): Primär, Godkänd, Variant eller Underkänd med hans ord,
skrivet bara i `review` i `motions/<klipp>.json` (`tools/review-store.ts`). Bilder: Material, `gäller` eller `ersatt`.
Primära (`/studio/primara/`): en Primär per kant, bara hans klick (V). Har han uttryckligen lämnat över domen för vissa
filmer (2026-11-13: "jag måste sova och du får granska och godkänna alla klipp"): `node tools/review-put.ts <klipp>
<ACCEPTED|VARIANT|REJECTED> --by … --mandate … --note …` sätter en preliminär dom som spelas som beslutet säger, aldrig
blir Primär eller rakt godkänd, inte väntar i hans kö (Granska visar den i Alla under Dömda åt dig; Jakob 2026-11-13)
och tas bort av hans eget beslut (V, `8e9664c`).

**15. Protokoll och handbok.** `node tools/order-ledger.ts` eller vyn Protokoll: en rad per tagning med granskarens poäng
och Jakobs ord, och en rad per metod (V). Den som har provat för in raden i handbokens tabeller (§5) och ändrar
metoden i `data/order-methods.json` med belägg; ingen dagbok.

**16. Spelet.** Skrivs 2026-11-13 (koden ligger i arbetsträdet): spelet erbjuder Paow i konsolens Dealer-meny och med
`game.html?dealer=paow`, och studions Casino skickar sitt `?dealer=` vidare; varje dealer spelar bara sina egna dömda
tagningar (Jakobs eller en preliminär dom). Efter en giv väljs en retur av samma hand som lade kortet
(`motion.releaseHand`). Där en film saknas spelas en ersättare per dealer ur `STAND_IN_FILM` i `src/game-director.ts`,
och den viker av sig själv när en dömd tagning finns; i dag läggs bara plats 6:s kort och ett tredje och fjärde dealerkort
utan hand. Korten: filmens eget gula och blå kort visas i hennes hand och i skons fönster, och ett ritat kort tar över
när kortet ligger (SYSTEM, "Ritade kort"). Brytaren Ritade kort (nyckeln `cards`, förval på) slår av allt ritat, också
de liggande korten.

**17. Tal.** En talfilm är en vilotagning där munnen ritas efter ljudet: `node tools/speech.ts` (`bank`, `say`, `reel`,
`proof`) med planen i `src/speech-plan.ts` och rösterna och repliker i `data/speech.json`; rösten är ElevenLabs (betalt
per tecken av det konto rösten ligger i; rösten namnger sin nyckelrad i `.env.local`) och munnen ritas lokalt (V). `src/speech-lines.ts` säger vilken
talfilm som säger en replik i rundan eller svarar i chatten (V). Talfilmer spelas på begäran, inte i vilans slump.
I spelet säger dealern sina fasta repliker med talfilm och ljud, och chatten svarar med fasta svar; nyckeln `tal`
(`repliker` eller `av`) slår av talfilmerna. Hela ämnet: [docs/TAL.md](../docs/TAL.md). Ägs av banan Tal
(HANDOFF).

### Ordningen per dealer, och när hon är färdig

Ankare 1 → 2.1 → ingång 1 → 2.1 → vila → en giv till en ytterplats (P1 eller P7) i metodprov → samma metod till alla
platser → returer → dealerns kort, hålkortet och dess vändning → utgången. Färdig för en runda är hon när
produktionslistan säger att de 21 steg en runda kräver är klara; hela banken är 33 filmer (`summary.films` i
`buildGraph`, `src/clip-graph.ts`): 6 utan kort (`IDLE>READY`, `READY>IDLE`, `IDLE>IDLE`, `IDLE>REVEAL(D.C2)`,
`AWAY>IDLE`, `IDLE>AWAY`), 3 per plats P1–P7 och 3 var för `D.C1` och `D.C2` (V). Paow 2026-11-13 klockan 08:36: 23 av
33 klara, varav 9 preliminärt dömda, och 19 av de 21 som en runda kräver; kvar är given till plats 6 och hålkortets
retur till vila (`node tools/produce.ts paow`, V).

## Vad bandet inte kan än

- **Ett tredje eller fjärde kort.** Planen har sexton platser, så ordermodellen vägrar `D.C3` och en plats tredje kort
  (`tools/order-store.ts`: platsen måste finnas i `placements/default.json`) (V). Jakob bad 2026-11-13 om ett tredje och
  fjärde dealerkort; platsen lägger han själv i Placering när modellen har den.
- **Plats 6** är det enda giv-steg som saknas för en runda: fjorton tagningar har fallit med samma mönster (kort väg, kortet
  vänds i ett sudd eller byter sida utan kantruta). Prövat och inte prövat: handboken §5. I spelet läggs kortet utan hand.
- **Hur hon rör sig** utan att det kostar kortet är en öppen fråga (handboken §5).
- **Helfiguren** (hon kommer in och sätter sig, `AWAY>IDLE`; hon reser sig och går, `IDLE>AWAY`) har inget steg i
  Beställ; receptet finns i handboken 3.9, och Paows par är gjort så (`paow-table-arrive-wide-01`,
  `paow-table-leave-wide-01`, 552 krediter) (V).
- **Ankare 2.2** (släp): föll i tre ordrar (`paow-ankare-2-2`, `-01`, `-02`), bildmodellen flyttade skon varje gång (V);
  kvar är en ruta ur en film som börjar på ankare 2.1 (S, oprövat). Varje giv börjar på 2.1.
- **Landningsbild, keystone och ankare 1** har inget steg i Beställ; de beställs med handskrivna ordrar eller väljs som
  ruta i Material (V, `STEPS`).
- **Retur till vila från en plats** (`RETUR-1`) och retur som egen film har ingen metod (`saknas`) (V).
- **Python för MediaPipe:** passningen av en stillbild, skolagningen och händer och kropp per ruta (`tools/python/`) (V).
- **Kling 4:s färger** läses som Python läste dem: BT.709-märkt film som BT.601, så att resultatet blir som de godkända
  tagningarna; en korrekt avkodning skulle flytta färgerna något, och det är inte avgjort (`tools/film-after.ts`) (V).
- **Ett tryckt spelkort** kan spåraren inte följa; det renderade kortet kräver enfärgat gult eller blått (`is.yellow`,
  `is.blue`, `isPale` i `src/card-track.ts`) (V).
- **Kön** läggs bara när en huvudagentchatt är öppen (HANDOFF) (V).
- **GitHubs kontroll** hoppar över testerna som kräver FFmpeg (elva) och de tre i `tools/order-images.test.ts` som kräver
  bankens filmer; de körs på den här datorn (DRIFT, HANDOFF) (V).

## Regler som kostar pengar när de bryts

- **Metoden väljs efter Jakobs domar,** räknade med `node tools/verdicts-per-method.ts`, inte efter granskarens poäng.
- **En plats, och den svåraste, före alla.** Omgång 3 och 3b gick till alla sju platser från plats 4: 12 av 14 föll, 1 960
  krediter. Omgång 4 med platsen i ord: handen nådde P1 eller P7 i 4 av 5, 677 krediter (kvittona, V).
- **En ändring per omgång, mot ett recept som har hållit,** med samma bilder och längd. Omgång 4 ändrade både plats och
  vändsätt, och fyra av fem fel gällde kortet i luften; omgång 6 ställde mall 5 mot mall 6 i två par (handboken §5, V).
- **En tagning per metodprov, två per klipp när metoden är vald,** en tredje bara om båda faller (HANDOFF).
- **Varje omgång granskas oberoende innan nästa bygger på den,** och kostnaden berättas efter omgången (HANDOFF).
- **Det som föll beställs inte om:** hela rundan i en tagning (0 av 7, cirka 3 500 krediter), Motion Control, mellanbild i
  Kling 4, Aleph och video-till-video, 4K-filmmodell, bildmodellen som flyttar kameran, stängd giv till en spelares plats
  (handboken, "Det som föll").
- **Billigt först:** WAN 3 i 480p kostar 5 krediter per s mot 20 i 1080p (`data/order-policy.json`).
- **Ett osäkert anrop läggs aldrig om:** en tagning med `requestedAt` och utan task-id är OSÄKER ([order-clerk.md §3](order-clerk.md)).

## Format och namn

Där en källa bara är text eller ett skript utanför repot står det "inget i repot vägrar": värdet är då en konvention.

| Vad | Värde | Källa (det som avgör) |
|---|---|---|
| Bankens ruta, film och ankare | 1764 × 1174 | `FILM` i `src/scene3d-geometry.ts`; `readRgb` i `tools/order-images.ts` (vägrar annan storlek när en order byggs); `image` i `data/scene-contract.json`. Material varnar bara (`sizeWarning`) |
| Planens ruta (Placering, Dator) | 1762 × 1174, V6:s ruta | `VIEWS.native` i `src/placement-model.ts`; film-x = plan-x × 1763/1761 (`image.note` i scenkontraktet, `planQuad` i `tools/order-images.ts`). Glöms faktorn: högst 2 px fel vid högerkanten |
| Bildfrekvens | WAN 3: 30/s. Kling 4 och Kling 3.0 4K: 24/s | `film.fps` i `fetched.json`. Banken behåller varje films takt och rutnummer (`source.fps`, `fpsOf` i `src/game-film.ts`, `Part.fps` i `src/scene3d-film.ts`, förval 30). `tools/film-after.ts` behåller leveransens takt |
| WAN 3 levererar | 1764 × 1174 med `ratio: "adaptive"`; H.264, inget ljud; 7 s = 210 rutor; de två sista mörknar | `fetched.json` för `paow-giv-2-1-p4-12`; `MODELS.wan3` |
| Kling 4 levererar | 1764 × 1172, 24/s, 7 s = 169 rutor, H.264, bt709, ljud alltid på; formen följer första bilden | `fetched.json` för `paow-giv-2-1-p4-13`; `MODELS['kling-4']` |
| Film efter efterarbetet | 1764 × 1174, egen takt, inget ljud, grönt på ankarets nivå; WAN 208 av 210 rutor | `TREATMENTS` i `src/film-after.ts`; bankens `source.mp4` är `after.mp4` |
| Codec | H.264 (libx264) CRF 12, preset slow, 4:2:0, utan ljud | `ENCODE` i `tools/film-after.ts`, `ENCODING` i `tools/film-fix.ts`; inget i repot vägrar en annan codec |
| Stillbild från Nano Banana Pro | 4800 × 3584 (4:3, 4K); 3:2 erbjuds inte | kvittonas `source.png`; `STEPS`; verktygets schema |
| Ankare | 1764 × 1174 PNG på grönt; fönsterskon; samma sko, grönt, ton och slutrad för kroppen i alla dealerns ankare | `anchors.mustAgree`, `shoe` i `data/dealer-standard.json` |
| Keystone | Hög upplösning, stående och sittande, på vitt (Paow 3584 × 4800 och 4800 × 3584) | text i `order` i `data/dealer-standard.json`; inget i repot vägrar |
| Grönt | Ingen fast färg: nyckeln läser varje rutas hörn (`keyLo` 0,12, `keyHi` 0,9). Konvention: RGB 0, 237, 44 (Pamelas viloruta, Paows ankare) | shadern i `src/scene3d-film.ts`; `SCREEN`, `CORNER` i `src/film-fix.ts`; `anchors.mustAgree` |
| Bordskantsraden | 831,5; kroppen slutar på rad 825–831; inget 10 nivåer mörkare än grönt ovanför | `dealerEdgeImageRow` i scenkontraktet; `FRAME_FIX`; `edgeCheck`, `EDGE` i `src/film-after.ts`; inget i repot vägrar |
| Kortets färger | Baksida gul, framsida blå, enfärgade; i texten "its back is yellow and its face is blue" | `card.colours` i standarden; `SAY.colours`; spårarens `is.yellow`, `is.blue` |
| Kortets storlek | Planens kort (P4 86,6 × 71,8 px); i flykten inom ±10 %; landat inom ±10 % yta och 5 px | `placements/default.json`; ±10 % och 5 px är granskningens regel, inget i repot vägrar |
| Mall | `film-giv-kort@8` = stil och version; i dag 8; Utförlig är mall 3 | `TEMPLATE_VERSION`, `LONG_VERSION`, `PromptInput.version` i `src/order-prompts.ts` |
| Order-id | `<dealer>-<steg>-<plats>-<nn>`, till exempel `paow-giv-2-1-p4-15`, `paow-halkort-02` | `nextId` i `tools/order-store.ts` |
| Klipp-id | `<order-id>-<tagning nn>`; tur och retur ger `…-deal` och `…-return-ready` (eller `-idle`); rättad kopia `…-fix-<k>` | `clipIdOf` i `tools/register-order.ts` |
| Kant och nod | `A>B`; `IDLE` ankare 1, `READY` 2.1, `READY-B` 2.2, `P1.C1` … `P7.C2`, `D.C1`, `D.C2`, `LAND(P4.C1)`, `REVEAL(D.C2)`, `AWAY` | `parseEdge` i `src/clip-graph.ts`; `ANCHOR_NODE`, `edgeOf` i `src/order-model.ts` |
| Orderstatus | UTKAST, GODKÄND (fryst), AVBRUTEN | `OrderStatus` i `src/order-model.ts` |
| Tagningsstatus | GODKÄND → LAGD → KLAR → HÄMTAD → EFTERARBETAD → MÄTT → GRANSKAD (granskarens) → INFÖRD; OSÄKER (läggs aldrig om), MISSLYCKAD, AVBRUTEN | `TAKE_FLOW` i `src/order-model.ts` |
| Domord i banken | Primär (`MAIN`), Godkänd (`ACCEPTED`), Variant (`VARIANT`), Underkänd (`REJECTED`), Väntar (`PENDING`); preliminär dom = `review.provisional`, `userAccepted: false`, i studion "dömd åt dig" (väntar inte i hans kö); `review.inbox` = från en order, inte dömd | `DECISIONS`, `applyProvisional` i `tools/review-store.ts` |
| Bildtillstånd i Material | `kandidat` → `gäller` eller `ersatt`; `gäller` → `ersatt`; en `gäller` per roll, nod och kort | `STATES` i `studio/lib/media.ts`; `CHANGES` i `studio/components/material/state.ts` |
| Filer per order | `data/orders/<id>.json`; `assets/orders/<id>/`: `first.png`, `last.png`, `reference.mp4`, `anchor.png`, `pose-figure.png`, `receipt.json`; `take-<n>/`: `source.*`, `fetched.json`, `after.*`, `after.json`, `fixed-<k>.*` | `src/order-model.ts`; `tools/order-collect.ts`; `tools/film-after.ts` |
| Filer i banken | `assets/motions/<klipp>/source.mp4`, `generation.json`; `motions/<klipp>.json`; `assets/tracking/<klipp>/card-track.json`; utanför banken `assets/films/<dealer>/<namn>/` | `tools/register-order.ts`; `tools/track-card.ts`; `tools/order-bring.ts` |
| Pris och tak | WAN 3 20 per s (480p 5); Kling 4 7 s: 124 utan referens, 149–189 med; Nano Banana Pro 4K 40. Dagstak och golv efter Jakobs ord för dagen (sedan 2026-11-13: obegränsat), 400 per order | `data/order-policy.json`; `creditsRemainingAfter` i kvittona |
