# Dealer — överlämning

Läs AGENTS.md, den här sidan och EN lägesfil för din bana. Ersätt inaktuell status; historiken finns i Git.
`tools/handoff.test.ts` håller taket: 120 rader och 900 ord.

## Läget

- Målet är en trovärdig utdelning i spelet i studion: två kort till plats 1–7 och två eller tre till dealern, med
  returer till redo och vila. Paow är dealern; Pamela är pausad (namnet bär också dockans rörelser `giv-pamela-*` och en scenfilm: skriv
  vilken du menar). Scoutgaming är slutmålet på sikt.
- Labbet är en vy, Bordet, där en film beställs längs en rak linje: steget och kortets plats, receptet ger resten.
- Den tatuerade uppsättningen är hans förstahandsval, och ankare 2.3 gäller. Vägen från det finns (ett slutbildsankare,
  A3, per plats; beställt genom Bordet), men givarna till plats 4 och 1 fick hans Inte bra och ingången hans nej.
- Kortplanen ritar verkliga kort genom en lins; spelet kan följa den bakom ett val som är av (`geometri=lins`).
- Kopian på nätet är sekundär och publiceras bara på hans ord; senast 2026-11-18 från `2e3967c`, med nytt lösenord.
- Kontrollen före en push körs bara på datorn. Kontots tokengräns delas av alla sessioner: få underagenter.

## Nästa steg

Sammanhängande lokal väg från underlag till spelbar Blackjack (Jakob 2026-11-18), med EN trovärdig giv först ([film](docs/lage/film.md)).

1. Bevara Jakobs ändrade kortplan och oincheckade orderutkast. Läs nya anteckningar med `node tools/proof-notes.ts`.
2. P4.C2 Cykel01 väljs i provet; ordinarie helgiv har egna målfilmer för 9/16 kort. Inget Primär-byte.
   Lös övriga andrakort och synkontroll av hålkortet före kortförvalet ([kort](docs/lage/kort.md)).
3. Använd automatiska testkvitton och det återbyggbara SQLite-indexet ([evidens](tools/evidence.md)); inga medieblobs.
4. Munproven är lokala jämförelser; inget byte i banken före Jakobs val i Beslut. Körarens kod finns nu i repot.
5. Testa, pusha och verifiera fjärrens SHA. Sessionens tio GPT-meddelanden är förbrukade; färdiga granskningsfynd är
   rättade. Fem Runway-filmer kostade 404 krediter; lokal Claude-MCP fungerar. Inget anrop eller KÖR pågår.
6. Hålkortets värde följer visad filmruta, även pausat: native-provet `paow-game-frame-20261118` visar gränsen 60→61.
   Filmkortsprovet använder ritade kort vid återbruk till C2/split och följer spåret genom tidiga returskarvar.
   Verklig bank och regressioner är kontrollerade; native splitprov återstår. Blå restkant, grepp, tempo,
   full mask- och rörelsedom samt godkänt READY-C-inpass/utpass är fortfarande öppna.

Äldre frågor till honom som inte är kort än: `D:/dealer-scratch/tmp/handoff-nytt/forslag-kort.md`.

## Vem äger vad

- **Huvudagentens adress: `/root`.** Codex-chatten `01a1edac-d516-70e2-8aef-64bcf687f6d5` samordnar arbetet.
  Kontrollera med ListAgents före meddelanden. Huvudagenten äger commits, taggar och push, studion,
  labbservern, spelet och 3D-scenens filmlager, `src/clip-graph.ts` och styrdokumenten.
- **Avgränsade uppdrag:** underagenterna har lämnat över landningsmasken, orderns handbyte och forkens bildgranskning.
  Huvudagenten äger nu integration, register och körjournal; nya uppdrag anger egna filer före skrivning.
- **Jakob talar bara med huvudagenten**, som håller ihop sessionerna. Varje bana får sin kö av huvudagenten och säger
  till när ett steg är grönt, med en fillista. Ingen bana skriver i en annans filer.
- **Huvudagentens banor:** film, kort, labbet och studion, och spelet. Filerna de äger står under Var saker ligger i varje lägesfil.
  Banorna Scen, Tal och Trailer är stängda; deras filer hålls av huvudagenten ([spelet](docs/lage/spelet.md)).
- **3D-banan** (`dealer3d/`, dockan som styr filmerna) och **mätning och ankare 2.3** är sedan
  2026-11-18 underagenter till huvudagenten (hans ord). De börjar från [dealer3d/LASMIG.md](dealer3d/LASMIG.md) och
  [docs/lage/matning.md](docs/lage/matning.md).
- **Jakobs egna:** planen `placements/default.json` och hans domar i `motions/` (`review`), som skrivs från Granska och
  aldrig skrivs över av ett verktyg. En dom som getts åt honom (`node tools/review-put.ts`) är aldrig hans.
- **En ny session** arbetar i ett eget arbetsträd på en kort gren och skriver först till huvudagenten vilka filer den
  tar (skillen `bredvid-andra-sessioner`).

## Väntar på Jakob

Det som väntar på honom är kort i Beslut. Läs dem i studions vy Beslut (`/studio/beslut/`) eller i
registret `data/decisions.json`: fältet `answer` bär hans val och hans anteckning. En fråga till honom ställs bara som
ett kort där (skillen `visa-for-jakob`), och kortet tas ut när svaret är utfört.

## Läs för ditt ämne

- Jakobs gällande besked, per ämne: [docs/BESKED.md](docs/BESKED.md). Slå upp ämnet när ett beslut är i fråga.
- Kända brister, med vad som är prövat: [docs/BRISTER.md](docs/BRISTER.md).
- Lägesfilerna, en per bana, alla i samma form (Läget, Nästa steg, Väntar på Jakob, Var saker ligger, Fällor):
  - [docs/lage/film.md](docs/lage/film.md): filmerna, ankarna, Beställ, banken och saldot.
  - [docs/lage/kort.md](docs/lage/kort.md): det ritade kortet och kortplanens regel.
  - [docs/lage/labbet-och-studion.md](docs/lage/labbet-och-studion.md): Bordet, Material, Prov, Beslut och verktygen.
  - [docs/lage/spelet.md](docs/lage/spelet.md): spelet, kopian på nätet, läpparna och de stängda banornas arbete.
  - [docs/lage/matning.md](docs/lage/matning.md): mätningen av en riktig dealer och receptet från ankare 2.3.
- Kontrakt och ordlista: [docs/SYSTEM.md](docs/SYSTEM.md). Rutiner, kopian och slaskdisken:
  [docs/DRIFT.md](docs/DRIFT.md). Talet: [docs/TAL.md](docs/TAL.md).
- Handböckerna: [tools/dealer-line.md](tools/dealer-line.md) (en ny dealer eller en film),
  [tools/film-prompting.md](tools/film-prompting.md) (beställningens text och bilder),
  [tools/film-review.md](tools/film-review.md) (granskningen).
- Ett arbetsmoment som återkommer har en skill i `.claude/skills/` (AGENTS, "Läs först").

## Före avslut

Rutinen står i skillen `avsluta-arbete`. I korthet:

1. Vänta in eller stoppa egna underagenter. Checka in färdigt eget arbete; bevara Jakobs plan och befintliga orderutkast.
2. `npm test`, uttrycklig staging av egna filer, commit, `npm run check`, push, och kontrollera fjärrens SHA.
3. Skriv läget där det hör hemma, och ersätt i stället för att lägga till: banans läge i lägesfilen, ett nytt besked
   i BESKED, en ny brist i BRISTER, en fråga till Jakob som kort i Beslut. Den här sidan ändras bara där en rad inte
   längre gäller.
4. Läs `npm run stada` som rapport. Utför bara ett kontrollerat eget mål åt gången enligt DRIFT; inga andra sessioners rester.
