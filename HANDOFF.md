# Dealer — överlämning

Startsidan för en ny session: läs AGENTS.md, den här sidan och EN lägesfil (din banas), och börja. Läs inte mer. Sidan är ingen
dagbok och inget arkiv: högst 120 rader och 900 ord, och `tools/handoff.test.ts` håller taket. Det som har hänt står i
Git, och en rad som inte längre gäller ersätts.

## Läget

- Målet är en trovärdig utdelning i spelet i studion: två kort till plats 1–7 och två eller tre till dealern, med
  returer till redo och vila. Paow är dealern; Pamela är pausad. Scoutgaming är slutmålet på sikt.
- Labbet är en vy, Bordet, där en film beställs längs en rak linje: steget och kortets plats, receptet ger resten.
- Den tatuerade uppsättningen är hans förstahandsval, och ankare 2.3 gäller. Vägen från det finns (ett slutbildsankare,
  A3, per plats; beställt genom Bordet), men givarna till plats 4 och 1 fick hans Inte bra och ingången hans nej.
- Kortplanen ritar verkliga kort genom en lins; spelet kan följa den bakom ett val som är av (`geometri=lins`).
- Kopian på nätet är sekundär och publiceras bara på hans ord; senast 2026-11-18 från `2e3967c`, med nytt lösenord.
- Kontrollen före en push körs bara på datorn. Kontots tokengräns delas av alla sessioner: få underagenter.

## Nästa steg

1. Skriv din egen adress på raden nedan. På ett nytt konto har varje session en ny adress, inget minne följer med
   och Runway ansluts på nytt (`/mcp`): allt som gäller står i repot. Starta vakten på hans kö i Beställ, och läs
   hans anteckningar (`node tools/proof-notes.ts`) och svaren i Beslut före första svaret till honom.
2. Se att fjärren är i kapp med `main` och att inget arbetsträd bär arbete som inte är inne (`git worktree list`).
3. Filmerna först ([film](docs/lage/film.md)): ingången klipps eller görs som en film genom hela rörelsen (hans ord),
   och givarna görs om efter hans svar i Beslut.
4. Räddningsuppdraget ([BESKED](docs/BESKED.md), "Räddningsuppdraget"): det som återstår av dess kontrollpunkter står
   i [BRISTER](docs/BRISTER.md); störst är att spelet och labbet delar kortgeometri först bakom `geometri=lins`.
5. Fem kameravinklar (`/vinklar.html`, film-lägesfilen), kopians tre fel före nästa publicering, och korten i Beslut.

Äldre frågor till honom som inte är kort än: `D:/dealer-scratch/tmp/handoff-nytt/forslag-kort.md`.

## Vem äger vad

- **Huvudagentens adress: `dealer-62`.** Adressen är det andra sessioner skriver till med SendMessage, och den står bara
  på den här raden; rubriken Jakob ser på chatten betyder inget. Byter rollen session, ändras den här raden och inget
  annat. Kontrollera med ListAgents före ett meddelande. Huvudagenten äger commits, taggar och push, studion,
  labbservern, spelet och 3D-scenens filmlager, `src/clip-graph.ts` och styrdokumenten.
- **Jakob talar bara med huvudagenten**, som håller ihop sessionerna. Varje bana får sin kö av huvudagenten och säger
  till när ett steg är grönt, med en fillista. Ingen bana skriver i en annans filer.
- **Huvudagentens banor:** film, kort, labbet och studion, och spelet. Filerna de äger står under Var saker ligger i varje lägesfil.
  Banorna Scen, Tal och Trailer är stängda; deras filer hålls av huvudagenten ([spelet](docs/lage/spelet.md)).
- **3D-banan** (`dealer3d/`, dockan som styr filmerna; grenen `dealer-3d`) och **mätning och ankare 2.3** är sedan
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

1. Vänta in eller stoppa egna underagenter. Inget ocommittat får ligga kvar utom `placements/default.json`.
2. `npm test`, uttrycklig staging av egna filer, commit, `npm run check`, push, och kontrollera fjärrens SHA.
3. Skriv läget där det hör hemma, och ersätt i stället för att lägga till: banans läge i lägesfilen, ett nytt besked
   i BESKED, en ny brist i BRISTER, en fråga till Jakob som kort i Beslut. Den här sidan ändras bara där en rad inte
   längre gäller.
4. Städa `D:/dealer-scratch` med `npm run stada` från huvudträdet, läs rapporten och kör `npm run stada -- --kor`.
