# Dealer — överlämning

Läs AGENTS.md, den här sidan och EN lägesfil för din bana. Ersätt inaktuell status; historiken finns i Git.
`tools/handoff.test.ts` håller taket: 120 rader och 900 ord.

## Läget

- Målet är en trovärdig utdelning i spelet i studion: två kort till plats 1–7 och två eller tre till dealern, med
  returer till redo och vila. Paow är dealern; Pamela är pausad (namnet bär också dockans rörelser `giv-pamela-*` och en scenfilm: skriv
  vilken du menar). Scoutgaming är slutmålet på sikt.
- Labbet är en vy, Bordet, där en film beställs längs en rak linje: steget och kortets plats, receptet ger resten.
- Den tatuerade uppsättningen är hans förstahandsval, och A2.3 gäller. Vägen från det finns (ett slutbildsankare per
  spelare och kort, A3P4C1; beställt genom Bordet); given till plats 4 har hans ja, och övriga platser görs likadant.
- Kortplan och order följer B-linsen. **Använd i Casino** sparar visningen, även Bred lins, för Casino och `/casino`.
- Kopian på nätet är publicerad på `c9d006d` den 2026-11-20 på Jakobs ord, utan nya filmer; kontrollen utifrån
  20/20 och åtkomsten oförändrad. Telefonmått, fysisk telefon och ljud återstår ([spelet](docs/lage/spelet.md)).
- Kontrollen före en push körs bara på datorn. Kontots tokengräns delas av alla sessioner: få underagenter.

## Nästa steg

Sammanhängande lokal väg från underlag till spelbar Blackjack (Jakob 2026-11-18), med EN trovärdig giv först ([film](docs/lage/film.md)).

1. Jakobs sparade kortplan, domar och orderutkast ingår i avslutet. Läs anteckningar med `node tools/proof-notes.ts`.
   Arbeta i C:-projektet; [lokal rutin](tools/local-work.md): grenar, äldre träd och mediestädning.
2. P4.C2 Cykel01 väljs i provet. Ordinarie spel återbrukar spelarnas C1 för C2/C3; egna filmer är nästa steg,
   inte krav nu. Rundans 22 filmbehov täcks. Rundbyggarens P6 går via A2.2; DC3 är valfritt ([kort](docs/lage/kort.md)).
3. Använd automatiska testkvitton och det återbyggbara SQLite-indexet ([evidens](tools/evidence.md)); inga medieblobs.
4. Den neutrala munnen gäller alla Paows repliker utom blackjack, som väntar på hans ja; ingen har hört ljudet ([spelet](docs/lage/spelet.md)).
5. D.C3 är redigerbart. Tre jämförelsefilmer: `paow-dc3-tre-geometrier-20261119`, 372 krediter, utanför banken.
   Tre kort per plats: 9 egna givar, 14 återbruk, D.C3 utan bankfilm (valfritt). Se [kort](docs/lage/kort.md).
6. Hålkort, native split och READY-C:s tvåkortsprov är kontrollerade inom sina avgränsade prov. Grepp, tempo,
   mask och hela rörelsen återstår ([film](docs/lage/film.md)).
7. Mobilkopians tre kända fel är rättade och publicerade; underlag finns i spelets lägesfil.

Äldre frågor till honom som inte är kort än: `D:/dealer-scratch/tmp/handoff-nytt/forslag-kort.md`.

## Vem äger vad

- **Huvudagentens adress: `/root`.** Codex-chatten `01a1f397-0b78-71d0-a9ba-329961d47800` äger push, taggar, studion,
  labbservern, spelet, 3D-scenens filmlager, `src/clip-graph.ts` och styrdokumenten. Commits: 2026-11-20 lät Jakob
  Claude-sessionen `dealer-37` orkestrera och committa ([BESKED](docs/BESKED.md), "Arbetet och dokumenten"); fråga honom.
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
- **En ny session** använder den aktiva IDE:ns projektmapp eller arbetsträd och avgränsar sina filer först.
  Extra arbetsträd bara vid isoleringsbehov (skillen `bredvid-andra-sessioner`).

## Väntar på Jakob

Prov han ska döma är kort i Beslut. Läs dem i studions vy Beslut (`/studio/beslut/`) eller i
registret `data/decisions.json`: fältet `answer` bär hans val och hans anteckning. Bara filmer och bilder blir kort
(skillen `visa-for-jakob`); teknik och arbetssätt frågas i chatten. Kortet tas ut när svaret är utfört.

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
2. Uttrycklig staging av egna filer, commit, `npm run check`, push, och kontrollera fjärrens SHA.
3. Skriv läget där det hör hemma, och ersätt i stället för att lägga till: banans läge i lägesfilen, ett nytt besked
   i BESKED, en ny brist i BRISTER, en fråga till Jakob som kort i Beslut. Den här sidan ändras bara där en rad inte
   längre gäller.
4. Läs `npm run stada` som rapport. Utför bara ett kontrollerat eget mål åt gången enligt DRIFT; inga andra sessioners rester.
